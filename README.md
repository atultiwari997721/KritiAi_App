# ⚡ Kriti AI — The Omnipotent Autonomous Assistant & IDE

> **Kriti AI** is a self-sustaining, 100% free, cross-platform personal assistant and autonomous software engineer. It unifies **OpenClaw-style life automation** (email, calendar, browser, and system files) with **Google Antigravity-style autonomous coding** (sandboxed terminal execution, AST refactoring, unified diff generation, and multi-tier model routing) across Windows and Android.

---

## 🏛️ System Architecture

```
                                  +---------------------------------------+
                                  |         Kriti AI Android Node         |
                                  |    (Voice, Chat, Action Approvals)    |
                                  +-------------------+-------------------+
                                                      |
                                           WebSocket P2P / LAN Sync
                                                      |
+------------------------+        +-------------------v-------------------+
|  Kriti AI Desktop IDE  |<------>|     Kriti AI Master Core Engine       |
| (VS Code UI / Diffs)   |        |   (Node.js / TypeScript Gateway)      |
+------------------------+        +-------------------+-------------------+
                                                      |
                                       Intelligent Multi-Tier Router
                                                      |
             +----------------------------+-----------+----------------------------+
             |                            |                                        |
  +----------v----------+      +----------v----------+                  +----------v----------+
  |  Local Ollama Engine|      | Custom KritiAi GPU  |                  | Free Cloud Fallback |
  | (Qwen2.5 / DeepSeek)|      | (Colab / HF Spaces) |                  | (Groq / OpenRouter) |
  |  100% Free & Local  |      | Free T4 Cloud Node  |                  | Ultra-Fast Fallback |
  +---------------------+      +---------------------+                  +---------------------+
```

---

## 📂 Project Repository Structure

```
k:\KritiAi_App/
├── core_engine/                          # Master Node.js / TypeScript Core Engine
│   ├── src/
│   │   ├── router/
│   │   │   └── ModelRouter.ts            # Dynamic model routing: Ollama vs Colab vs Cloud
│   │   ├── sandbox/
│   │   │   └── TerminalSandbox.ts        # Path-jailed shell execution with risk evaluator
│   │   ├── fs/
│   │   │   └── SafeFileManager.ts        # Safe file I/O, diff preview generator & snapshots
│   │   ├── sync/
│   │   │   └── GatewayServer.ts          # Real-time WebSocket sync & mobile approval ping gate
│   │   ├── agents/
│   │   │   ├── AutonomousCoderAgent.ts   # Antigravity-style autonomous loop & self-repair
│   │   │   └── PersonalAssistantAgent.ts # OpenClaw-style email, calendar & web automation
│   │   └── index.ts                      # Core Engine bootloader
│   ├── package.json
│   └── tsconfig.json
│
├── custom_model_kritiai/                 # Custom ML Model & Free Serverless Hosting
│   ├── model/
│   │   ├── model_wrapper.py              # PyTorch / Transformers intent classifier & engine
│   │   └── train_intent_model.py         # Fine-tuning pipeline for lightweight intent routing
│   ├── server/
│   │   ├── app.py                        # High-performance FastAPI server with CORS & OpenAI API
│   │   └── requirements.txt
│   ├── colab/
│   │   └── deploy_colab.py               # 1-Click Free Colab T4 GPU deployment script
│   └── huggingface_spaces/
│       ├── app.py                        # Hugging Face Spaces free serverless Gradio/API
│       ├── requirements.txt
│       └── README.md
│
├── desktop_app/                          # Windows Desktop UI (Electron/Tauri + React + Tailwind)
│   ├── src/
│   │   ├── components/
│   │   │   ├── AutonomousIdeView.tsx     # Antigravity IDE (Explorer, Monaco Editor, Sandbox)
│   │   │   ├── ChatAssistantView.tsx     # Jarvis Life Automation (Email, Calendar, Browser)
│   │   │   └── ArtifactViewer.tsx        # Real-time unified diff preview with green/red diffs
│   │   ├── App.tsx                       # Master Desktop Application & Node Telemetry
│   │   └── index.css
│   └── package.json
│
└── mobile_app/                           # Android Mobile App (React Native / Expo)
    ├── src/
    │   ├── screens/
    │   │   ├── ChatScreen.tsx            # Real-time synced chat & mode toggle
    │   │   └── ApprovalsScreen.tsx       # Remote action approval gateway with haptics
    │   ├── services/
    │   │   └── SyncClient.ts             # Auto-reconnecting WebSocket P2P client
    │   └── App.tsx
    └── package.json
```

---

## 🚀 Quickstart Guide

### 1. Launch the Local Core Engine
```bash
cd core_engine
npm install
npm run dev
```

### 2. (Optional) Run 100% Free Cloud GPU Node on Google Colab
1. Open [Google Colab](https://colab.research.google.com) and set Runtime to **T4 GPU**.
2. Run `custom_model_kritiai/colab/deploy_colab.py`.
3. Copy the output tunnel URL (e.g. `https://xyz.trycloudflare.com`) and paste into `core_engine/.env` as `KRITIAI_CUSTOM_API_URL`.

### 3. Launch the Android Mobile Node
```bash
cd mobile_app
npm install
npx expo start
```
Scan the QR code in the Expo Go app on your Android device. It will automatically connect to your Windows host.