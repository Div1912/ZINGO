from fastapi import FastAPI, UploadFile, File, Query, Request, Form
from fastapi.responses import HTMLResponse, StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import requests
import json
import easyocr

app = FastAPI(title="AIRA Qwen OCR & LLM Backend")

# Enable CORS for all origins so Web, Vite, and Vercel clients can connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ollama local endpoint
MODEL_ENDPOINT = "http://127.0.0.1:11434/api/generate"
MODEL_TAGS_ENDPOINT = "http://127.0.0.1:11434/api/tags"
MODEL_NAME = "qwen3:8b"

# OCR Reader Initialize (English and Hindi)
reader = easyocr.Reader(['en', 'hi'])

@app.get("/health")
@app.get("/api/health")
@app.get("/api/status")
async def health_check():
    """Health check endpoint to verify backend and Ollama connectivity"""
    try:
        r = requests.get(MODEL_TAGS_ENDPOINT, timeout=4)
        models = [m.get("name") for m in r.json().get("models", [])] if r.status_code == 200 else []
        return {
            "status": "online",
            "model": MODEL_NAME,
            "ollama": "connected",
            "available_models": models,
            "ocr_ready": True
        }
    except Exception as e:
        return {
            "status": "online",
            "model": MODEL_NAME,
            "ollama": "disconnected",
            "error": str(e),
            "ocr_ready": True
        }

@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>OCR & Qwen Assistant</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; justify-content: center; padding: 40px 20px; margin: 0; }
            .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 30px; max-width: 580px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
            h1 { font-size: 22px; margin-top: 0; color: #38bdf8; display: flex; align-items: center; gap: 10px; }
            .badge { background: #059669; color: white; padding: 3px 10px; border-radius: 9999px; font-size: 12px; font-weight: bold; }
            label { display: block; margin-top: 16px; margin-bottom: 6px; font-weight: 500; font-size: 14px; color: #cbd5e1; }
            input[type="text"], input[type="file"] { width: 100%; box-sizing: border-box; padding: 10px 12px; background: #0f172a; border: 1px solid #475569; border-radius: 6px; color: white; font-size: 14px; }
            button { margin-top: 20px; width: 100%; padding: 12px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
            button:hover { background: #1d4ed8; }
            .output-box { margin-top: 20px; padding: 15px; background: #0b1120; border: 1px solid #334155; border-radius: 6px; font-family: monospace; font-size: 13px; white-space: pre-wrap; word-break: break-word; color: #e2e8f0; display: none; }
            a { color: #38bdf8; text-decoration: none; }
            a:hover { text-decoration: underline; }
            .footer { margin-top: 16px; font-size: 13px; color: #94a3b8; text-align: center; }
        </style>
    </head>
    <body>
        <div class="card">
            <h1>Qwen 3 (8B) Live OCR Server <span class="badge">Online</span></h1>
            <p style="color: #94a3b8; font-size: 14px; margin-bottom: 20px;">
                CORS Enabled. Connected to local Ollama (<code>qwen3:8b</code>).<br>
                API Docs: <a href="/docs" target="_blank">Swagger UI (/docs)</a> | <a href="/health" target="_blank">Health Check (/health)</a>
            </p>
            <form id="askForm">
                <label>User Query:</label>
                <input type="text" id="user_query" placeholder="e.g. Summarize this invoice" required />
                <label>Upload Document/Image (Optional):</label>
                <input type="file" id="file" accept="image/*" />
                <button type="submit" id="submitBtn">Ask Question</button>
            </form>
            <div id="output" class="output-box"></div>
            <div class="footer">API Endpoints: <code>POST /process-and-ask/</code> &amp; <code>POST /api/chat</code></div>
        </div>
        <script>
            document.getElementById('askForm').onsubmit = async (e) => {
                e.preventDefault();
                const out = document.getElementById('output');
                const btn = document.getElementById('submitBtn');
                out.style.display = 'block';
                out.textContent = 'Processing request... (Running OCR if image attached + calling Qwen)';
                btn.disabled = true;
                
                const query = document.getElementById('user_query').value;
                const fileInput = document.getElementById('file');
                const formData = new FormData();
                if (fileInput.files.length > 0) {
                    formData.append('file', fileInput.files[0]);
                }
                
                try {
                    const url = '/process-and-ask/?user_query=' + encodeURIComponent(query);
                    const res = await fetch(url, { method: 'POST', body: formData });
                    const data = await res.json();
                    out.textContent = JSON.stringify(data, null, 2);
                } catch (err) {
                    out.textContent = 'Error: ' + err.message;
                } finally {
                    btn.disabled = false;
                }
            };
        </script>
    </body>
    </html>
    """

def run_ollama_stream(payload: dict, context: str = ""):
    """Helper generator for SSE streaming from Ollama"""
    try:
        # Emit initial metadata event
        meta_event = {
            "type": "meta",
            "ocr_context_found": bool(context),
            "context_length": len(context),
            "model": payload.get("model", MODEL_NAME)
        }
        yield f"data: {json.dumps(meta_event)}\n\n"

        with requests.post(MODEL_ENDPOINT, json=payload, stream=True, timeout=300) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line.decode("utf-8") if isinstance(line, bytes) else line)
                    chunk = data.get("response", "")
                    done = data.get("done", False)
                    eval_count = data.get("eval_count", 0)

                    event_data = {
                        "type": "chunk",
                        "chunk": chunk,
                        "done": done,
                        "eval_count": eval_count,
                    }
                    yield f"data: {json.dumps(event_data)}\n\n"
                    if done:
                        break
                except Exception as parse_err:
                    continue
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'error': str(e), 'done': True})}\n\n"

@app.post("/process-and-ask/")
async def process_and_ask(
    request: Request,
    user_query: Optional[str] = Form(None, description="User query or prompt"),
    file: Optional[UploadFile] = File(None),
    stream: Optional[bool] = Query(None, description="Stream response via Server-Sent Events (SSE)")
):
    q = request.query_params
    resolved_query = (user_query or q.get("user_query") or "").strip()
    if not resolved_query:
        resolved_query = "Please analyze the attached document and provide a comprehensive summary and key takeaways."
    user_query = resolved_query

    if stream is None:
        raw_stream = q.get("stream")
        stream = str(raw_stream).lower() in ("true", "1", "yes") if raw_stream is not None else False

    context = ""
    
    # 1. Extract text from uploaded document (PDF or image)
    if file:
        try:
            file_bytes = await file.read()
            fname = file.filename or "uploaded_document"
            try:
                from routers.ingestion import extract_text
                extracted = extract_text(fname, file_bytes)
                context = (extracted.get("text") or "").strip()
                print(f"--- Document Extracted Text Successfully ({len(context)} chars) ---")
            except Exception:
                ocr_result = reader.readtext(file_bytes, detail=0)
                context = " ".join(ocr_result)
                print(f"--- OCR Extracted Text Successfully ({len(context)} chars) ---")
        except Exception as ocr_err:
            print(f"--- Document extraction warning: {str(ocr_err)} ---")

    # 2. Prompt structure builder
    full_prompt = f"Context from Document:\n{context}\n\nUser Query: {user_query}" if context else user_query
    
    payload = {
        "model": MODEL_NAME,
        "prompt": full_prompt,
        "stream": stream,
        "think": False
    }
    
    # 3. Stream or non-stream execution
    if stream:
        return StreamingResponse(
            run_ollama_stream(payload, context=context),
            media_type="text/event-stream"
        )

    try:
        response = requests.post(MODEL_ENDPOINT, json=payload, timeout=300)
        response.raise_for_status()
        data = response.json()
        model_answer = data.get('response', 'No response field')
        eval_count = data.get('eval_count', 0)
        return {
            "ocr_context_found": bool(context),
            "context_length": len(context),
            "answer": model_answer,
            "eval_count": eval_count,
            "model": MODEL_NAME
        }
    except requests.exceptions.RequestException as e:
        return {"error": f"Ollama request failed: {str(e)}"}
    except Exception as e:
        return {"error": f"Server error: {str(e)}"}

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatPayload(BaseModel):
    messages: Optional[List[ChatMessage]] = None
    prompt: Optional[str] = None
    system: Optional[str] = None
    stream: bool = True
    context: Optional[str] = None

@app.post("/api/chat")
async def api_chat(payload_data: ChatPayload):
    """Clean JSON endpoint for direct chat generation with prompt history"""
    context = payload_data.context or ""
    
    # Build prompt from messages or prompt field
    if payload_data.messages and len(payload_data.messages) > 0:
        lines = []
        if payload_data.system:
            lines.append(f"System: {payload_data.system}")
        if context:
            lines.append(f"Context from Document:\n{context}")
        for m in payload_data.messages:
            prefix = "User" if m.role == "user" else "Assistant"
            lines.append(f"{prefix}: {m.content}")
        full_prompt = "\n\n".join(lines) + "\n\nAssistant:"
    elif payload_data.prompt:
        full_prompt = f"Context from Document:\n{context}\n\nUser Query: {payload_data.prompt}" if context else payload_data.prompt
    else:
        return JSONResponse(status_code=400, content={"error": "Prompt or messages required"})

    ollama_payload = {
        "model": MODEL_NAME,
        "prompt": full_prompt,
        "stream": payload_data.stream,
        "think": False
    }

    if payload_data.stream:
        return StreamingResponse(
            run_ollama_stream(ollama_payload, context=context),
            media_type="text/event-stream"
        )

    try:
        response = requests.post(MODEL_ENDPOINT, json=ollama_payload, timeout=300)
        response.raise_for_status()
        data = response.json()
        return {
            "answer": data.get("response", ""),
            "eval_count": data.get("eval_count", 0),
            "model": MODEL_NAME
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)