"""
Kriti AI - 1-Click Google Colab T4 GPU Deployment (ngrok & cloudflared)
Phase 1b: Free Serverless GPU Hosting

Instructions for Google Colab:
1. Open a new notebook in Google Colab (https://colab.research.google.com)
2. Select Runtime > Change Runtime Type > T4 GPU (Free Tier)
3. Run this script:
   !git clone https://github.com/your-username/KritiAi_App.git
   %cd KritiAi_App/custom_model_kritiai/colab
   !python deploy_colab_ngrok.py --ngrok-token "YOUR_NGROK_AUTHTOKEN"
"""

import os
import sys
import subprocess
import argparse
import time

def install_dependencies():
    print("[Colab Deploy] 📦 Installing dependencies (FastAPI, Transformers, PyTorch, pyngrok, bitsandbytes)...")
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "-q",
        "fastapi", "uvicorn", "pydantic", "torch", "transformers", "accelerate", "bitsandbytes", "pyngrok"
    ])

def start_server_with_ngrok(auth_token: str = None, port: int = 8000):
    from pyngrok import ngrok, conf
    
    if auth_token:
        print("[Colab Deploy] 🔑 Configuring ngrok auth token...")
        ngrok.set_auth_token(auth_token)

    print(f"[Colab Deploy] 🚀 Starting FastAPI server on port {port}...")
    server_process = subprocess.Popen([
        sys.executable, "-m", "uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", str(port)
    ], cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

    time.sleep(4)

    print("[Colab Deploy] 🌐 Opening public ngrok tunnel...")
    public_url = ngrok.connect(port).public_url
    print("\n" + "="*70)
    print("⚡ KRITI AI GPU NODE IS LIVE! ⚡")
    print(f"🔗 Public API Endpoint: {public_url}")
    print("="*70)
    print(f"\n👉 Copy this URL and set in your Windows Core Engine '.env':")
    print(f"KRITIAI_CUSTOM_API_URL={public_url}\n")
    print("="*70 + "\n")

    try:
        server_process.wait()
    except KeyboardInterrupt:
        print("[Colab Deploy] Shutting down...")
        ngrok.kill()
        server_process.terminate()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deploy Kriti AI on Colab with ngrok")
    parser.add_argument("--ngrok-token", type=str, default=os.getenv("NGROK_AUTHTOKEN"), help="Your ngrok authtoken")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind server")
    args = parser.parse_args()

    install_dependencies()
    start_server_with_ngrok(auth_token=args.ngrok_token, port=args.port)
