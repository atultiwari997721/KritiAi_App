from fastapi import FastAPI, BackgroundTasks, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import json
import time

from mode_manager.manager import ModeManager, SupervisionMode
from utils.llm_client import LLMClient
from orchestrator.engine import MultiModelOrchestrator
from vision_agent.automation import KritiVision

app = FastAPI(title="KritiAI Backend Orchestrator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize core singletons
mode_manager = ModeManager()
llm_client = LLMClient()
orchestrator = MultiModelOrchestrator(mode_manager, llm_client)
vision_agent = KritiVision(mode_manager, llm_client)

active_websockets: List[WebSocket] = []

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.append(websocket)
    try:
        while True:
            data_str = await websocket.receive_text()
            data = json.loads(data_str)
            
            # Handle incoming WS messages from React
            msg_type = data.get("type")
            payload = data.get("payload", {})
            sender = data.get("sender", "DESKTOP_UI")
            
            if msg_type == "GET_STATUS":
                await websocket.send_text(json.dumps({
                    "type": "STATUS_UPDATE",
                    "payload": {"ollama": llm_client.use_local, "colabGpu": False}
                }))
                
            elif msg_type == "CHAT_MESSAGE":
                prompt = payload.get("text", "")
                await websocket.send_text(json.dumps({
                    "type": "STREAM_CHUNK",
                    "payload": {"text": f"Orchestrator received task. Thinking..."}
                }))
                
                # Run the task
                result = await orchestrator.execute_task(prompt)
                
                await websocket.send_text(json.dumps({
                    "type": "CHAT_MESSAGE",
                    "sender": "Kriti_AI",
                    "payload": {"text": f"Task Result:\n```json\n{json.dumps(result, indent=2)}\n```"}
                }))

            elif msg_type == "COMMAND_EXECUTE":
                cmd = payload.get("command", "")
                # Simulate command execution
                await websocket.send_text(json.dumps({
                    "type": "COMMAND_OUTPUT",
                    "payload": {"text": f"PS> {cmd}\n[Mock] Executed successfully."}
                }))
                
            elif msg_type == "GET_FILE_TREE":
                # Mock file tree for UI
                await websocket.send_text(json.dumps({
                    "type": "FILE_TREE_DATA",
                    "payload": {
                        "tree": [
                            {"name": "README.md", "type": "file", "path": "README.md"},
                            {"name": "src", "type": "directory", "children": [
                                {"name": "App.tsx", "type": "file", "path": "src/App.tsx"}
                            ]}
                        ]
                    }
                }))

            elif msg_type == "READ_FILE":
                path = payload.get("path", "")
                # Mock file content
                await websocket.send_text(json.dumps({
                    "type": "FILE_CONTENT",
                    "payload": {"path": path, "content": f"// Content of {path}\n// This is mocked by Python Backend."}
                }))
                
    except WebSocketDisconnect:
        active_websockets.remove(websocket)
        print("Client disconnected")
    except Exception as e:
        print(f"WS Error: {e}")

class SettingsRequest(BaseModel):
    use_local_llm: Optional[bool] = None
    mode: Optional[str] = None
    api_key: Optional[str] = None

@app.post("/api/settings")
async def update_settings(req: SettingsRequest):
    if req.use_local_llm is not None:
        llm_client.toggle_backend(req.use_local_llm)
    if req.api_key is not None:
        llm_client.api_key = req.api_key
    if req.mode is not None:
        try:
            mode_enum = SupervisionMode(req.mode.lower())
            mode_manager.set_mode(mode_enum)
        except ValueError:
            return {"status": "error", "message": "Invalid supervision mode"}
    return {"status": "success", "message": "Settings updated"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
