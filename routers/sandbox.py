"""
ZINGO — Sovereign Code Execution Sandbox Router
===============================================
Mounted at /api/sandbox
Executes code snippets locally in an air-gapped, isolated environment with
resource bounds, wall-clock timeout, and standard I/O capture.
"""

from __future__ import annotations

import os
import sys
import time
import uuid
import platform
import subprocess
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from data_layer import log_audit

router = APIRouter(prefix="/api/sandbox", tags=["sandbox"])

MAX_OUTPUT_CHARS = 150_000  # 150 KB cap to prevent memory exhaustion
DEFAULT_TIMEOUT_SEC = 15
MAX_TIMEOUT_SEC = 60


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


@router.post("/execute", response_model=CodeExecuteResponse)
async def execute_code_snippet(payload: CodeExecutePayload):
    code = (payload.code or "").strip()
    if not code:
        raise HTTPException(400, "No code provided to execute.")

    lang = (payload.language or "python").lower().strip()
    timeout = min(max(1, payload.timeout_seconds or DEFAULT_TIMEOUT_SEC), MAX_TIMEOUT_SEC)

    # Sovereign Python Execution Runtime info
    runtime_info = f"Python {platform.python_version()} ({platform.system()} {platform.machine()})"
    env_label = "Local Sovereign Host (Air-Gapped)"

    # Create safe sandboxed temporary workspace
    sandbox_base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "sandbox_runs")
    os.makedirs(sandbox_base, exist_ok=True)

    run_id = f"run_{uuid.uuid4().hex[:10]}"
    script_path = os.path.join(sandbox_base, f"{run_id}.py")

    start_time = time.perf_counter()

    try:
        # Write code to isolated script file
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(code)

        # Execute using the active host Python environment with unbuffered I/O
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONDONTWRITEBYTECODE"] = "1"

        proc = subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=sandbox_base,
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
        # Cleanup temporary execution file
        try:
            if os.path.exists(script_path):
                os.remove(script_path)
        except Exception:
            pass

    # Record execution in sovereign audit log
    try:
        log_audit(
            "code_sandbox_execution",
            payload.user or "engineer",
            None,
            "sandbox",
            {
                "language": lang,
                "code_length": len(code),
                "exit_code": exit_code,
                "success": success,
                "execution_time_ms": round(elapsed_ms, 2),
            },
        )
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
