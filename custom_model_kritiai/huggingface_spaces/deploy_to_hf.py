"""
=============================================================================
🚀 KritiAi: 1-Click Automated Hugging Face Spaces Deployer
=============================================================================
This script automatically:
1. Connects to your Hugging Face account via HF Token.
2. Creates the 'KritiAi-Space' Gradio Space on Hugging Face.
3. Uploads 'app.py', 'requirements.txt', and 'README.md'.
4. Launches the live cloud application and outputs your direct URLs.
=============================================================================
"""

import os
import sys
from huggingface_hub import HfApi, login

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def deploy():
    print("=" * 70)
    print("🚀 [KritiAi] Automated Hugging Face Spaces Deployment")
    print("=" * 70)

    # 1. Obtain Hugging Face Token
    hf_token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    if not hf_token:
        print("\n🔑 Please enter your Hugging Face Write Token.")
        print("   (Get it from: https://huggingface.co/settings/tokens)")
        hf_token = input("\nEnter HF Write Token: ").strip()

    if not hf_token or not hf_token.startswith("hf_"):
        print("\n❌ Invalid Token! A Hugging Face write token must start with 'hf_'")
        sys.exit(1)

    print("\n⏳ Authenticating with Hugging Face Hub...")
    try:
        login(token=hf_token)
        api = HfApi(token=hf_token)
        user_info = api.whoami()
        username = user_info["name"]
        print(f"✅ Authenticated successfully as: @{username}")
    except Exception as e:
        print(f"❌ Authentication Failed: {e}")
        sys.exit(1)

    space_name = "KritiAi-Space"
    repo_id = f"{username}/{space_name}"
    space_folder = os.path.dirname(os.path.abspath(__file__))

    # 2. Create Space on Hugging Face
    print(f"\n📦 Creating Hugging Face Space: {repo_id} (SDK: Gradio)...")
    try:
        api.create_repo(
            repo_id=repo_id,
            repo_type="space",
            space_sdk="gradio",
            exist_ok=True,
            private=False
        )
        print(f"✅ Space repository confirmed: https://huggingface.co/spaces/{repo_id}")
    except Exception as e:
        print(f"⚠️ Notice: {e}")

    # 3. Upload Deployment Files
    print(f"\n☁️ Uploading deployment files (app.py, requirements.txt, README.md)...")
    try:
        api.upload_folder(
            folder_path=space_folder,
            repo_id=repo_id,
            repo_type="space",
            ignore_patterns=["deploy_to_hf.py", "__pycache__", "*.pyc"]
        )
        print("✅ Files uploaded successfully!")
    except Exception as e:
        print(f"❌ Upload Failed: {e}")
        sys.exit(1)

    # 4. Output Live URLs
    print("\n" + "=" * 70)
    print("🎉 KRITIAI DEPLOYMENT INITIATED SUCCESSFULLY!")
    print("=" * 70)
    print(f"🌐 Live Web App URL:    https://huggingface.co/spaces/{repo_id}")
    print(f"⚡ Direct Embed URL:    https://{username.lower()}-{space_name.lower()}.hf.space")
    print(f"🔌 Public API Endpoint: https://{username.lower()}-{space_name.lower()}.hf.space/api/chat")
    print("=" * 70)
    print("Hugging Face is building the container. It will be live in 1-2 minutes!")

if __name__ == "__main__":
    deploy()
