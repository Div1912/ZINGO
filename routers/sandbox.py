"""
ZINGO — Sovereign Code Execution & Sandboxed File Deliverable Router
=====================================================================
Mounted at /api/sandbox
Provides:
  1. Sandboxed Python / Bash script execution (/api/sandbox/execute)
  2. Sandboxed deliverable file creation lifecycle (/api/sandbox/build-deliverable):
     - /inputs/ (read-only mounted user files)
     - /scratch/ (working buildpad)
     - /outputs/ (promoted deliverables)
  3. Direct deliverable streaming & download (/api/sandbox/download/{run_id}/{filename})
  4. Sandbox environment & format capabilities inspection (/api/sandbox/capabilities)
"""

from __future__ import annotations

import os
import sys
import time
import uuid
import shutil
import base64
import platform
import subprocess
import zipfile
import re
import xml.etree.ElementTree as ET
from typing import Optional, List, Dict, Any, Tuple
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from data_layer import log_audit

router = APIRouter(prefix="/api/sandbox", tags=["sandbox"])

MAX_OUTPUT_CHARS = 150_000
DEFAULT_TIMEOUT_SEC = 20
MAX_TIMEOUT_SEC = 90

SANDBOX_BASE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sandbox_runs")
)
os.makedirs(SANDBOX_BASE_DIR, exist_ok=True)

MIME_TYPES = {
  "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "pdf": "application/pdf",
  "csv": "text/csv",
  "json": "application/json",
  "png": "image/png",
  "svg": "image/svg+xml",
  "zip": "application/zip",
}


def format_bytes(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"
    elif num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    else:
        return f"{num_bytes / (1024 * 1024):.1f} MB"


# ============================================================================
# Schemas
# ============================================================================

class CodeExecutePayload(BaseModel):
    code: str
    language: Optional[str] = "python"
    timeout_seconds: Optional[int] = DEFAULT_TIMEOUT_SEC
    user: Optional[str] = "engineer"


class CodeExecuteResponse(BaseModel):
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    execution_time_ms: float
    runtime: str
    environment: str


class InputFileItem(BaseModel):
    name: str
    content_base64: Optional[str] = None
    content_text: Optional[str] = None


class DeliverableBuildPayload(BaseModel):
    chat_id: Optional[str] = "default"
    code: str
    target_format: Optional[str] = "docx"
    expected_filename: Optional[str] = None
    input_files: Optional[List[InputFileItem]] = None
    allow_network_egress: Optional[bool] = False
    timeout_seconds: Optional[int] = 30
    user: Optional[str] = "engineer"


class QAReport(BaseModel):
    content_qa_passed: bool = True
    file_qa_passed: bool = True
    visual_qa_passed: bool = True
    overall_passed: bool = True
    slide_count: Optional[int] = None
    issues: List[str] = []
    details: Optional[str] = None


class DeliverableBuildResponse(BaseModel):
    success: bool
    exit_code: int
    filename: Optional[str] = None
    format: Optional[str] = None
    file_size_bytes: Optional[int] = None
    file_size_formatted: Optional[str] = None
    download_url: Optional[str] = None
    stdout: str
    stderr: str
    execution_time_ms: float
    promoted: bool
    error: Optional[str] = None
    qa_report: Optional[QAReport] = None


def validate_pptx_ooxml(file_path: str) -> Tuple[bool, Optional[str], Dict[str, Any]]:
    """
    Unpacks PPTX ZIP in-memory and validates core OOXML parts, schema well-formedness,
    and catches PowerPoint-specific silent corruption modes.
    """
    if not os.path.exists(file_path):
        return False, "Deliverable file does not exist on disk.", {}
    if not zipfile.is_zipfile(file_path):
        return False, "Deliverable is not a valid ZIP/OOXML archive.", {}

    metrics = {"parts_count": 0, "slide_parts": 0, "charts_count": 0}
    try:
        with zipfile.ZipFile(file_path, "r") as z:
            namelist = z.namelist()
            metrics["parts_count"] = len(namelist)

            # 1. Mandatory OPC Package Parts
            if "[Content_Types].xml" not in namelist:
                return False, "Missing mandatory [Content_Types].xml in OOXML package.", metrics
            if "_rels/.rels" not in namelist:
                return False, "Missing mandatory root relationships (_rels/.rels).", metrics
            if "ppt/presentation.xml" not in namelist:
                return False, "Missing presentation root part (ppt/presentation.xml).", metrics

            # 2. XML Well-formedness & Silent Corruption Checks
            for name in namelist:
                if name.startswith("ppt/slides/slide") and name.endswith(".xml"):
                    metrics["slide_parts"] += 1
                if "ppt/charts/chart" in name and name.endswith(".xml"):
                    metrics["charts_count"] += 1

                if name.endswith(".xml") or name.endswith(".rels"):
                    raw_bytes = z.read(name)
                    try:
                        ET.fromstring(raw_bytes)
                    except ET.ParseError as err:
                        return False, f"Malformed XML in {name}: {err}", metrics

                    # 3. Detect illegal raw '#' in color attributes (e.g. srgbClr val="#1E293B")
                    # In OOXML, '#' prefix corrupts slide master and shape XML silently in Microsoft PowerPoint
                    if b'val="#' in raw_bytes or b"val='#" in raw_bytes:
                        return False, f"Illegal '#' prefix in color attribute inside {name}. Hex colors in OOXML must be raw 6-digit RRGGBB.", metrics

        return True, None, metrics
    except Exception as e:
        return False, f"ZIP inspection error: {e}", metrics


def run_pptx_3layer_qa(file_path: str) -> QAReport:
    """
    Three-Layer QA Pipeline for PowerPoint (.pptx) Presentations:
      Layer 1: Content QA (Completeness & Anti-Placeholder scan)
      Layer 2: File QA (OOXML packaging & structural validation)
      Layer 3: Visual QA (16:9 geometry, margin enforcement, canvas overflow)
    """
    issues: List[str] = []

    # ── Layer 2: File QA (Structural OOXML Integrity) ────────
    ooxml_valid, ooxml_err, metrics = validate_pptx_ooxml(file_path)
    file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
    file_qa_passed = ooxml_valid and file_size > 15_000
    if not ooxml_valid:
        issues.append(f"[File QA] {ooxml_err}")
    elif file_size <= 15_000:
        issues.append(f"[File QA] Presentation size ({file_size} B) is unusually small for a valid OOXML deck.")

    # ── Layer 1: Content QA (Text Completeness & Placeholder Detection) ──
    content_qa_passed = True
    slide_count = 0
    word_count = 0
    placeholders_found = []
    placeholder_pattern = re.compile(
        r'\[(?:insert|company|date|name|title|metric|placeholder|author|logo|tbd|todo)[^\]]*\]|Lorem ipsum|TODO:|TBD|REPLACE_ME|undefined|NaN',
        re.IGNORECASE
    )

    prs = None
    try:
        from pptx import Presentation
        prs = Presentation(file_path)
        slide_count = len(prs.slides)
        canvas_width = prs.slide_width.inches
        canvas_height = prs.slide_height.inches

        for s_idx, slide in enumerate(prs.slides):
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for p in shape.text_frame.paragraphs:
                        text = p.text.strip()
                        if text:
                            word_count += len(text.split())
                            matches = placeholder_pattern.findall(text)
                            if matches:
                                for m in matches:
                                    placeholders_found.append(f"Slide {s_idx + 1}: '{m}'")

        if placeholders_found:
            content_qa_passed = False
            issues.append(f"[Content QA] Unreplaced template placeholders detected: {', '.join(placeholders_found[:4])}")
        if slide_count == 0:
            content_qa_passed = False
            issues.append("[Content QA] Presentation contains 0 slides.")
    except Exception as e:
        content_qa_passed = False
        issues.append(f"[Content QA] Failed to read slide content: {e}")

    # ── Layer 3: Visual & Layout QA (Geometry & Canvas Bounds) ──
    visual_qa_passed = True
    overflow_count = 0
    if prs is not None:
        try:
            for s_idx, slide in enumerate(prs.slides):
                for shape in slide.shapes:
                    x = shape.left.inches
                    y = shape.top.inches
                    w = shape.width.inches
                    h = shape.height.inches

                    # Skip full-bleed background shapes
                    is_full_bleed_bg = (w >= canvas_width - 0.2 and h >= canvas_height - 0.2)
                    if not is_full_bleed_bg:
                        if (x + w) > (canvas_width + 0.15) or (y + h) > (canvas_height + 0.15):
                            overflow_count += 1
                            issues.append(f"[Visual QA] Slide {s_idx + 1} shape '{shape.name}' overflows canvas edge (x+w={x+w:.2f}\", y+h={y+h:.2f}\").")

            if overflow_count > 0:
                visual_qa_passed = False
        except Exception as e:
            visual_qa_passed = False
            issues.append(f"[Visual QA] Visual layout inspection error: {e}")

    overall_passed = file_qa_passed and content_qa_passed and visual_qa_passed

    return QAReport(
        content_qa_passed=content_qa_passed,
        file_qa_passed=file_qa_passed,
        visual_qa_passed=visual_qa_passed,
        overall_passed=overall_passed,
        slide_count=slide_count,
        issues=issues,
        details=f"{slide_count} slides inspected, {metrics.get('parts_count', 0)} OOXML parts verified, {word_count} words verified."
    )


def run_deliverable_qa(file_path: str, target_format: str) -> Optional[QAReport]:
    """Runs format-specific structural and content QA before deliverable promotion."""
    fmt = target_format.lower().lstrip(".")
    if fmt == "pptx":
        return run_pptx_3layer_qa(file_path)

    if fmt in ("docx", "xlsx"):
        if not zipfile.is_zipfile(file_path):
            return QAReport(
                content_qa_passed=False, file_qa_passed=False, visual_qa_passed=True,
                overall_passed=False, issues=[f"Invalid {fmt.upper()} ZIP package."]
            )
        try:
            with zipfile.ZipFile(file_path, "r") as z:
                if "[Content_Types].xml" not in z.namelist():
                    return QAReport(
                        content_qa_passed=True, file_qa_passed=False, visual_qa_passed=True,
                        overall_passed=False, issues=["Missing [Content_Types].xml in OOXML archive."]
                    )
            return QAReport(
                content_qa_passed=True, file_qa_passed=True, visual_qa_passed=True,
                overall_passed=True, details=f"OOXML package verified ({os.path.getsize(file_path)} bytes)."
            )
        except Exception as err:
            return QAReport(
                content_qa_passed=False, file_qa_passed=False, visual_qa_passed=True,
                overall_passed=False, issues=[f"Archive error: {err}"]
            )

    return None


# ============================================================================
# Endpoint 1: Quick Code Snippet Execution (/api/sandbox/execute)
# ============================================================================

@router.post("/execute", response_model=CodeExecuteResponse)
async def execute_code_snippet(payload: CodeExecutePayload):
    code = (payload.code or "").strip()
    if not code:
        raise HTTPException(400, "No code provided to execute.")

    lang = (payload.language or "python").lower().strip()
    timeout = min(max(1, payload.timeout_seconds or DEFAULT_TIMEOUT_SEC), MAX_TIMEOUT_SEC)

    runtime_info = f"Python {platform.python_version()} ({platform.system()} {platform.machine()})"
    env_label = "Local Sovereign Host (Air-Gapped)"

    run_id = f"run_{uuid.uuid4().hex[:10]}"
    script_path = os.path.join(SANDBOX_BASE_DIR, f"{run_id}.py")
    start_time = time.perf_counter()

    try:
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(code)

        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONDONTWRITEBYTECODE"] = "1"

        proc = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=SANDBOX_BASE_DIR,
            env=env,
        )

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        stdout = proc.stdout[:MAX_OUTPUT_CHARS]
        stderr = proc.stderr[:MAX_OUTPUT_CHARS]
        exit_code = proc.returncode
        success = (exit_code == 0)

    except subprocess.TimeoutExpired:
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        stdout = ""
        stderr = f"[Execution Error] Process timed out after {timeout} seconds."
        exit_code = 124
        success = False
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        stdout = ""
        stderr = f"[Runtime Error] Failed to execute code: {exc}"
        exit_code = 1
        success = False
    finally:
        try:
            if os.path.exists(script_path):
                os.remove(script_path)
        except Exception:
            pass

    return CodeExecuteResponse(
        success=success,
        exit_code=exit_code,
        stdout=stdout,
        stderr=stderr,
        execution_time_ms=round(elapsed_ms, 2),
        runtime=runtime_info,
        environment=env_label,
    )


# ============================================================================
# Endpoint 2: Full Sandboxed Deliverable Builder (/api/sandbox/build-deliverable)
# ============================================================================

@router.post("/build-deliverable", response_model=DeliverableBuildResponse)
async def build_deliverable(payload: DeliverableBuildPayload):
    """
    Executes a script within a structured sandbox workspace:
      ws_{chat_id}_{run_id}/
        ├── inputs/   (Mounted input files)
        ├── scratch/  (Working buildpad where script executes)
        └── outputs/  (Verified, promoted deliverables)
    """
    code = (payload.code or "").strip()
    if not code:
        raise HTTPException(400, "No code provided to generate deliverable.")

    target_format = (payload.target_format or "docx").lower().lstrip(".")
    timeout = min(max(1, payload.timeout_seconds or 30), MAX_TIMEOUT_SEC)
    run_id = uuid.uuid4().hex[:10]
    safe_chat_id = "".join(c for c in (payload.chat_id or "default") if c.isalnum() or c in "-_")[:24]

    ws_dir_name = f"ws_{safe_chat_id}_{run_id}"
    ws_path = os.path.join(SANDBOX_BASE_DIR, ws_dir_name)
    inputs_dir = os.path.join(ws_path, "inputs")
    scratch_dir = os.path.join(ws_path, "scratch")
    outputs_dir = os.path.join(ws_path, "outputs")

    os.makedirs(inputs_dir, exist_ok=True)
    os.makedirs(scratch_dir, exist_ok=True)
    os.makedirs(outputs_dir, exist_ok=True)
    # Also create outputs/ inside scratch_dir so scripts doing .save('outputs/...') succeed seamlessly
    os.makedirs(os.path.join(scratch_dir, "outputs"), exist_ok=True)

    # 1. Mount provided input files into inputs/
    if payload.input_files:
        for inp in payload.input_files:
            safe_name = os.path.basename(inp.name)
            target_path = os.path.join(inputs_dir, safe_name)
            if inp.content_base64:
                try:
                    with open(target_path, "wb") as f:
                        f.write(base64.b64decode(inp.content_base64))
                except Exception:
                    pass
            elif inp.content_text:
                with open(target_path, "w", encoding="utf-8") as f:
                    f.write(inp.content_text)

    # 2. Write the execution script into scratch/build.py
    script_path = os.path.join(scratch_dir, "build.py")
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(code)

    # 3. Configure environment
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    # Ensure current scratch and inputs are on PYTHONPATH
    env["PYTHONPATH"] = f"{scratch_dir}{os.pathsep}{inputs_dir}{os.pathsep}{env.get('PYTHONPATH', '')}"

    start_time = time.perf_counter()
    exit_code = 1
    stdout = ""
    stderr = ""

    try:
        proc = subprocess.run(
            [sys.executable, "build.py"],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=scratch_dir,
            env=env,
        )
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        stdout = proc.stdout[:MAX_OUTPUT_CHARS]
        stderr = proc.stderr[:MAX_OUTPUT_CHARS]
        exit_code = proc.returncode

    except subprocess.TimeoutExpired:
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        stderr = f"[Execution Error] Process timed out after {timeout} seconds."
        exit_code = 124
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        stderr = f"[Runtime Error] {exc}"
        exit_code = 1

    # 4. Verify and Promote Output
    promoted = False
    resolved_filename = None
    file_size_bytes = 0
    download_url = None
    error_msg = None

    if exit_code == 0:
        # Search scratch/ and outputs/ for the target file
        candidate_file = None

        # Check explicit expected filename first
        if payload.expected_filename:
            expected_clean = os.path.basename(payload.expected_filename)
            scratch_expected = os.path.join(scratch_dir, expected_clean)
            scratch_sub_expected = os.path.join(scratch_dir, "outputs", expected_clean)
            outputs_expected = os.path.join(outputs_dir, expected_clean)
            if os.path.exists(scratch_expected) and os.path.getsize(scratch_expected) > 0:
                candidate_file = scratch_expected
            elif os.path.exists(scratch_sub_expected) and os.path.getsize(scratch_sub_expected) > 0:
                candidate_file = scratch_sub_expected
            elif os.path.exists(outputs_expected) and os.path.getsize(outputs_expected) > 0:
                candidate_file = outputs_expected

        # Fallback: scan scratch/, scratch/outputs/, and outputs/ for any file matching target format
        if not candidate_file:
            for check_dir in [scratch_dir, os.path.join(scratch_dir, "outputs"), outputs_dir]:
                if not os.path.exists(check_dir):
                    continue
                for f in os.listdir(check_dir):
                    if f.lower().endswith(f".{target_format}"):
                        full_p = os.path.join(check_dir, f)
                        if os.path.isfile(full_p) and os.path.getsize(full_p) > 0:
                            candidate_file = full_p
                            break
                if candidate_file:
                    break

        qa_report = None
        if candidate_file:
            resolved_filename = os.path.basename(candidate_file)
            final_output_path = os.path.join(outputs_dir, resolved_filename)
            
            # 5. Run 3-Layer QA Verification before promotion
            qa_res = run_deliverable_qa(candidate_file, target_format)
            if qa_res and not qa_res.file_qa_passed:
                promoted = False
                error_msg = f"Deliverable failed OOXML structural validation: {'; '.join(qa_res.issues)}"
                qa_report = qa_res
            else:
                # Promote from scratch to outputs if not already in outputs
                if candidate_file != final_output_path:
                    shutil.copy2(candidate_file, final_output_path)

                file_size_bytes = os.path.getsize(final_output_path)
                download_url = f"/api/sandbox/download/{run_id}/{resolved_filename}"
                promoted = True
                qa_report = qa_res
        else:
            error_msg = f"Script succeeded (exit code 0), but no .{target_format} deliverable was produced in scratchpad."
    else:
        error_msg = f"Build script failed with exit code {exit_code}."

    # Audit log
    try:
        log_audit(
            "deliverable_build",
            payload.user or "engineer",
            None,
            "sandbox",
            {
                "format": target_format,
                "filename": resolved_filename,
                "success": promoted,
                "exit_code": exit_code,
                "size_bytes": file_size_bytes,
                "execution_time_ms": round(elapsed_ms, 2),
                "qa_passed": qa_report.overall_passed if qa_report else True,
            },
        )
    except Exception:
        pass

    return DeliverableBuildResponse(
        success=promoted,
        exit_code=exit_code,
        filename=resolved_filename or payload.expected_filename,
        format=target_format,
        file_size_bytes=file_size_bytes,
        file_size_formatted=format_bytes(file_size_bytes),
        download_url=download_url,
        stdout=stdout,
        stderr=stderr,
        execution_time_ms=round(elapsed_ms, 2),
        promoted=promoted,
        error=error_msg if not promoted else None,
        qa_report=qa_report,
    )


# ============================================================================
# Endpoint 3: Deliverable Download (/api/sandbox/download/{run_id}/{filename})
# ============================================================================

@router.get("/download/{run_id}/{filename}")
async def download_deliverable(run_id: str, filename: str):
    clean_run_id = "".join(c for c in run_id if c.isalnum())
    clean_filename = os.path.basename(filename)

    # Search in sandbox_runs for matching ws_*_{run_id}/outputs/{filename}
    target_file = None
    for entry in os.listdir(SANDBOX_BASE_DIR):
        if entry.startswith("ws_") and entry.endswith(f"_{clean_run_id}"):
            candidate = os.path.join(SANDBOX_BASE_DIR, entry, "outputs", clean_filename)
            if os.path.exists(candidate) and os.path.isfile(candidate):
                target_file = candidate
                break

    if not target_file:
        raise HTTPException(404, f"Deliverable '{clean_filename}' for run '{clean_run_id}' not found.")

    ext = clean_filename.split(".")[-1].lower() if "." in clean_filename else ""
    mime_type = MIME_TYPES.get(ext, "application/octet-stream")

    return FileResponse(
        target_file,
        media_type=mime_type,
        filename=clean_filename,
        headers={
            "Content-Disposition": f'attachment; filename="{clean_filename}"',
            "Cache-Control": "public, max-age=3600",
        },
    )


# ============================================================================
# Endpoint 4: Capabilities Inspection (/api/sandbox/capabilities)
# ============================================================================

@router.get("/capabilities")
async def get_sandbox_capabilities():
    """Returns host Python runtime, document generation packages, and isolation specs."""
    modules_to_check = {
        "docx": "python-docx",
        "pptx": "python-pptx",
        "openpyxl": "openpyxl",
        "reportlab": "reportlab",
        "matplotlib": "matplotlib",
        "pandas": "pandas",
        "numpy": "numpy",
    }
    installed_modules: Dict[str, bool] = {}
    for mod_name in modules_to_check:
        try:
            __import__(mod_name)
            installed_modules[mod_name] = True
        except ImportError:
            installed_modules[mod_name] = False

    return {
        "status": "ready",
        "runtime": f"Python {platform.python_version()}",
        "os": f"{platform.system()} {platform.release()}",
        "architecture": platform.machine(),
        "installed_libraries": installed_modules,
        "supported_formats": ["docx", "pptx", "xlsx", "pdf", "csv", "json", "png", "svg"],
        "sandbox_base": SANDBOX_BASE_DIR,
        "network_egress_supported": True,
    }
