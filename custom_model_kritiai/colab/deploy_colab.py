"""
Kriti AI - Google Colab 1-Click Free GPU Deployment Script
Phase 1: Free T4 GPU Model Server with Public Tunneling (Cloudflared / Ngrok / Localtunnel)

Copy and paste this script directly into a Google Colab notebook cell with T4 GPU runtime enabled.
"""

import os
import sys
import subprocess
import threading
import time

def setup_environment():
    print("=================================================================")
    print("🚀 [Kriti AI] Initializing Free Cloud GPU Environment...")
    print("=================================================================")
    
    # 1. Install required packages
    print("📦 Installing optimized inference packages...")
    packages = [
        "fastapi",
        "uvicorn",
        "torch",
        "transformers",
        "accelerate",
        "bitsandbytes",
        "pydantic",
        "pyngrok",
        "nest_asyncio"
    ]
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q"] + packages)
    print("✅ Packages installed successfully.")

def download_cloudflared():
    """Download Cloudflared binary for 100% free, zero-config secure tunnel without rate limits."""
    if not os.path.exists("./cloudflared"):
        print("🌐 Setting up Cloudflare Tunnel (100% Free, No token required)...")
        subprocess.run(["wget", "-q", "-nc", "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64", "-O", "cloudflared"])
        subprocess.run(["chmod", "+x", "cloudflared"])

def start_server_and_tunnel(ngrok_token=None):
    import uvicorn
    import nest_asyncio
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    from typing import List, Optional
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig

    nest_asyncio.apply()

    print("\n🧠 Loading 'Qwen/Qwen2.5-Coder-1.5B-Instruct' (or 7B) in 4-bit NF4 Precision on GPU...")
    model_id = "Qwen/Qwen2.5-Coder-1.5B-Instruct"  # Can also use "Qwen/Qwen2.5-Coder-7B-Instruct" on Colab T4
    
    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True
    )

    tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        quantization_config=quantization_config,
        device_map="auto",
        trust_remote_code=True
    )
    print("✅ Model loaded into GPU memory!")

    # Setup FastAPI
    app = FastAPI(title="Kriti AI Free Colab GPU Backend")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )

    class Message(BaseModel):
        role: str
        content: str

    class ChatReq(BaseModel):
        messages: List[Message]
        max_tokens: Optional[int] = 1024
        temperature: Optional[float] = 0.2

    @app.get("/")
    def root():
        return {"status": "online", "gpu": torch.cuda.get_device_name(0), "model": model_id}

    @app.post("/v1/chat/completions")
    def chat(req: ChatReq):
        msgs = [{"role": m.role, "content": m.content} for m in req.messages]
        prompt = tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer([prompt], return_tensors="pt").to("cuda")

        with torch.no_grad():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=req.max_tokens or 1024,
                temperature=max(req.temperature or 0.2, 0.01),
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id
            )
        generated = [out[len(inp):] for inp, out in zip(inputs.input_ids, output_ids)]
        response_text = tokenizer.batch_decode(generated, skip_special_tokens=True)[0]

        return {
            "choices": [{"message": {"role": "assistant", "content": response_text}}]
        }

    # Start FastAPI in a background daemon thread
    def run_fastapi():
        uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")

    server_thread = threading.Thread(target=run_fastapi, daemon=True)
    server_thread.start()
    time.sleep(2)

    # Expose Tunnel
    if ngrok_token:
        from pyngrok import ngrok
        ngrok.set_auth_token(ngrok_token)
        public_url = ngrok.connect(8000).public_url
        print("\n" + "="*70)
        print(f"🎉 [Kriti AI] NGROK PUBLIC ENDPOINT URL:")
        print(f"👉 {public_url}")
        print("="*70 + "\n")
    else:
        download_cloudflared()
        print("\n" + "="*70)
        print("🎉 [Kriti AI] Starting Cloudflare Public Tunnel...")
        print("="*70)
        process = subprocess.Popen(
            ["./cloudflared", "tunnel", "--url", "http://127.0.0.1:8000"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )
        for line in process.stdout:
            if "trycloudflare.com" in line:
                for word in line.split():
                    if "https://" in word and "trycloudflare.com" in word:
                        print(f"\n👉 KRITI AI API ENDPOINT: {word.strip()}\n")
                        print("Copy this URL and paste it into your Kriti AI Desktop/Mobile App settings!\n")
                        break

if __name__ == "__main__":
    setup_environment()
    # Pass your ngrok token here if you have one, or leave None for free zero-config Cloudflare tunnel
    start_server_and_tunnel(ngrok_token=None)
