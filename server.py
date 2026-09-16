from fastapi import FastAPI, UploadFile, File
from fastapi.responses import HTMLResponse
import requests
import easyocr

app = FastAPI()

# ⚠️ Laptop 1 ka IP address yahan change karein
LAPTOP_1_IP = "10.112.250.149"  
MODEL_ENDPOINT = f"http://{LAPTOP_1_IP}:11434/api/generate"

# OCR Reader Initialize kiya (English aur Hindi ke liye)
reader = easyocr.Reader(['en', 'hi'])

@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>OCR & LLM Assistant</title>
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
            <h1>OCR & LLM Server <span class="badge">Online</span></h1>
            <p style="color: #94a3b8; font-size: 14px; margin-bottom: 20px;">
                Server is active! Connected to Laptop 1 IP: <code>""" + LAPTOP_1_IP + """</code>.<br>
                API Docs: <a href="/docs" target="_blank">Swagger UI (/docs)</a>
            </p>
            <form id="askForm">
                <label>User Query:</label>
                <input type="text" id="user_query" placeholder="e.g. Summarize this invoice" required />
                <label>Upload Document/Image (Optional):</label>
                <input type="file" id="file" accept="image/*" />
                <button type="submit" id="submitBtn">Ask Question</button>
            </form>
            <div id="output" class="output-box"></div>
            <div class="footer">API Endpoint: <code>POST /process-and-ask/</code></div>
        </div>
        <script>
            document.getElementById('askForm').onsubmit = async (e) => {
                e.preventDefault();
                const out = document.getElementById('output');
                const btn = document.getElementById('submitBtn');
                out.style.display = 'block';
                out.textContent = 'Processing request... (Running OCR if image attached + calling LLM)';
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

@app.post("/process-and-ask/")
async def process_and_ask(user_query: str, file: UploadFile = File(None)):
    context = ""
    
    # 1. Agar user ne image file bheji hai, to Laptop 2 par OCR chalega
    if file:
        file_bytes = await file.read()
        ocr_result = reader.readtext(file_bytes, detail=0)
        context = " ".join(ocr_result)
        print("--- OCR Extracted Text Successfully ---")

    # 2. Perplexity style prompt structure builder
    full_prompt = f"Context from Document:\n{context}\n\nUser Query: {user_query}"
    
    payload = {
        "model": "llama3:8b-instruct-q4_K_M",
        "prompt": full_prompt,
        "stream": False
    }
    
    # 3. Request ko Laptop 1 par bhejna response ke liye
    try:
        response = requests.post(MODEL_ENDPOINT, json=payload)
        model_answer = response.json().get('response', 'No response field')
        return {"ocr_context_found": bool(context), "answer": model_answer}
    except Exception as e:
        return {"error": f"Could not connect to Laptop 1 Server: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    # Server ko Port 8000 par launch kar rahe hain
    uvicorn.run(app, host="0.0.0.0", port=8000)