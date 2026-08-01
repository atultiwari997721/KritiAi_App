"""
Kriti AI - FastAPI Custom Model Server
Phase 1: High-Performance REST & Streaming API for Intent Routing, Code Optimization & Inferences
"""

import os
import time
import uvicorn
from typing import List, Dict, Optional, Any
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Initialize FastAPI App
app = FastAPI(
    title="Kriti AI Custom ML API",
    description="High-performance backend for KritiAi Intent Routing & Autonomous Code Optimization",
    version="1.0.0"
)

# Enable CORS for Desktop App, Android Node, and Localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Data Models -----------------
class Message(BaseModel):
    role: str = Field(..., description="Role: system, user, or assistant")
    content: str = Field(..., description="Message text")

class ChatCompletionRequest(BaseModel):
    model: str = Field(default="kritiai-v1", description="Model identifier")
    messages: List[Message]
    max_tokens: Optional[int] = 1024
    temperature: Optional[float] = 0.2
    top_p: Optional[float] = 0.95
    stream: Optional[bool] = False

class IntentRequest(BaseModel):
    prompt: str = Field(..., description="User prompt to classify")

class CodeOptimizeRequest(BaseModel):
    code: str = Field(..., description="Source code snippet to optimize/refactor")
    language: str = Field(default="typescript", description="Programming language")
    target: Optional[str] = Field(default="performance", description="performance | clean_code | types | security")

# ----------------- Lazy Model Loader -----------------
router_model = None
generative_model = None

def get_router():
    global router_model
    if router_model is None:
        from model.model_wrapper import KritiAiIntentRouter
        # Fallback to base model if fine-tuned weights not found
        model_path = "./kritiai_intent_model" if os.path.exists("./kritiai_intent_model") else "distilbert-base-uncased"
        router_model = KritiAiIntentRouter(base_model_name=model_path)
    return router_model

def get_generative_engine():
    global generative_model
    if generative_model is None:
        from model.model_wrapper import KritiAiGenerativeEngine
        # Load Qwen2.5-Coder (1.5B or 7B) with 4-bit quantization if on GPU
        generative_model = KritiAiGenerativeEngine(
            model_id=os.getenv("KRITIAI_BASE_MODEL", "Qwen/Qwen2.5-Coder-1.5B-Instruct"),
            load_in_4bit=True if os.getenv("USE_4BIT", "true").lower() == "true" else False
        )
    return generative_model

# ----------------- Endpoints -----------------

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "Kriti AI Engine",
        "version": "1.0.0",
        "features": ["intent_routing", "code_optimization", "context_summarization", "openai_compatible_chat"]
    }

@app.get("/health")
def health_check():
    import torch
    return {
        "status": "healthy",
        "gpu_available": torch.cuda.is_available(),
        "gpu_device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "None",
        "timestamp": time.time()
    }

@app.post("/v1/intent/classify")
def classify_intent(req: IntentRequest):
    """
    Classifies a prompt into execution tiers:
    0: LOCAL_FAST (Ollama)
    1: CODE_AUTONOMOUS (Autonomous Coder)
    2: SYSTEM_ACTION (OpenClaw Desktop/Mobile tools)
    3: COMPLEX_REASONING (Cloud/GPU)
    """
    try:
        router = get_router()
        result = router.predict_intent(req.prompt)
        return {
            "prompt": req.prompt,
            "routing": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/code/optimize")
def optimize_code(req: CodeOptimizeRequest):
    """
    Specialized endpoint for AST & code refactoring, bug-fixing, and type injection.
    """
    try:
        engine = get_generative_engine()
        system_prompt = (
            f"You are the Kriti AI Code Optimizer for {req.language}. "
            f"Target: {req.target}. Output ONLY the refactored, clean, robust code with concise inline explanations."
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Optimize the following code:\n```{req.language}\n{req.code}\n```"}
        ]
        optimized = engine.generate_response(messages, max_new_tokens=1500, temperature=0.1)
        return {
            "language": req.language,
            "target": req.target,
            "optimized_code": optimized
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/v1/chat/completions")
def chat_completions(req: ChatCompletionRequest):
    """
    OpenAI-compatible chat completion endpoint.
    """
    try:
        engine = get_generative_engine()
        messages_dict = [{"role": m.role, "content": m.content} for m in req.messages]
        
        response_text = engine.generate_response(
            messages=messages_dict,
            max_new_tokens=req.max_tokens or 1024,
            temperature=req.temperature or 0.2,
            top_p=req.top_p or 0.95
        )

        return {
            "id": f"chatcmpl-{int(time.time()*1000)}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": req.model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": response_text
                    },
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": len(" ".join([m.content for m in req.messages]).split()),
                "completion_tokens": len(response_text.split()),
                "total_tokens": len(" ".join([m.content for m in req.messages]).split()) + len(response_text.split())
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"[KritiAi Server] Starting server on port {port}...")
    uvicorn.run(app, host="0.0.0.0", port=port)
