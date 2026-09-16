# ZINGO — Sovereign AI Research Assistant & Workbench

An on-premise, high-performance AI workbench engineered with the rapid document synthesis of Perplexity and the refined analytical cognition of Claude.

## 🚀 Key Capabilities

- **Claude-Inspired Experience**: Refined typography using Newsreader & Plus Jakarta Sans, static timeline greetings (`Good morning`, `Good afternoon`, `Good evening`), and zero-distraction layout.
- **Cognitive Orbital Telemetry**: Dynamic multi-phase `ThinkingOrbs` rendering reasoning cycles, document retrieval, and process envelope safety checks.
- **Sovereign Air-Gapped Operation**: 100% private inference on local GPU clusters with zero data leakage.
- **Multimodal Document Processing**: OCR and extraction via FastAPI backend (`server.py`) and on-premise LLM endpoints.
- **Refinery & Engineering Intelligence**: Grounded in technical operating manuals, P&IDs, and OISD safety protocols.
- **Isolated Multi-Session Workspaces**: Independent generation lifecycles, background generation indicators, and per-chat state management.
- **Code Execution Sandbox**: Integrated runner with Monaco/Prism syntax highlighting and interactive execution.

## 🛠️ Tech Stack

### Frontend (`/aira`)
- **Framework**: React 18 + Vite 6 + TypeScript (Strict Mode)
- **Styling**: Tailwind CSS v3 with liquid glass design system and dark/light mode
- **Animations**: Framer Motion + WebGL Gradient Wave background
- **State Management**: Zustand with persistent storage
- **Routing**: React Router v6

### Backend (`/server.py`)
- **API Framework**: FastAPI + Uvicorn
- **OCR Engine**: EasyOCR (multilingual English/Hindi support)
- **Model Interface**: Local Ollama / vLLM GPU node integration

## 📦 Getting Started

### 1. Backend Setup
```bash
pip install -r requirements.txt
python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend Setup
```bash
cd aira
npm install
npm run dev
```

Visit `http://localhost:5173` to access the workbench.

## 🔒 Security & Privacy
Built specifically for air-gapped, zero-trust enterprise networks where data sovereign execution is mandatory.
