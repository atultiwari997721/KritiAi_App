"""
=============================================================================
💻 KritiAi: Local Run & Download Script (Windows, Mac, Linux)
=============================================================================
Option 1: Run locally via Ollama (Recommended for CPU & low-spec laptops)
Option 2: Run locally via PyTorch + Transformers (With GPU acceleration)
=============================================================================
"""

import sys
import torch

def run_with_transformers():
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import PeftModel

    BASE_MODEL_ID = "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B"
    ADAPTER_ID = "your-username/KritiAi"  # Replace with your Hugging Face adapter repo

    print(f"📥 Loading Tokenizer from {BASE_MODEL_ID}...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID, trust_remote_code=True)

    print("📥 Loading Model weights (automatically offloading to CPU/GPU)...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    # Load base model in 4-bit (if CUDA available) or Float16/Float32
    if device == "cuda":
        from transformers import BitsAndBytesConfig
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True
        )
        base_model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL_ID,
            quantization_config=bnb_config,
            device_map="auto",
            trust_remote_code=True
        )
    else:
        base_model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL_ID,
            torch_dtype=torch.float32,
            low_cpu_mem_usage=True,
            trust_remote_code=True
        )

    print("🧬 Attaching KritiAi LoRA adapter...")
    try:
        model = PeftModel.from_pretrained(base_model, ADAPTER_ID)
    except Exception as e:
        print(f"⚠️ Adapter loading skipped: {e}. Running base model.")
        model = base_model

    print("\n" + "="*60)
    print("🤖 KritiAi Local Terminal Ready! (Type 'exit' to quit)")
    print("="*60 + "\n")

    while True:
        try:
            user_input = input("\n👤 You: ")
            if user_input.strip().lower() in ["exit", "quit"]:
                break
            if not user_input.strip():
                continue

            prompt = f"<｜User｜>{user_input}<｜Assistant｜><think>\n"
            inputs = tokenizer([prompt], return_tensors="pt").to(model.device)

            print("\n🧠 KritiAi: ", end="", flush=True)
            with torch.no_grad():
                output_ids = model.generate(
                    **inputs,
                    max_new_tokens=1024,
                    temperature=0.6,
                    top_p=0.95,
                    do_sample=True,
                    pad_token_id=tokenizer.eos_token_id
                )
            
            generated_tokens = output_ids[0][len(inputs.input_ids[0]):]
            reply = tokenizer.decode(generated_tokens, skip_special_tokens=True)
            print(reply)

        except KeyboardInterrupt:
            print("\nExiting...")
            break

if __name__ == "__main__":
    print("Select Mode:")
    print("1. PyTorch / Transformers Local Inference")
    print("2. Ollama / GGUF Instructions")
    choice = input("Enter choice (1/2): ").strip()
    
    if choice == "1":
        run_with_transformers()
    else:
        print("""
=============================================================
🦙 RUN KRITIAI LOCALLY WITH OLLAMA (Ultra Fast & Lightweight)
=============================================================
1. Install Ollama: https://ollama.com
2. Pull the model directly from Hugging Face Hub (GGUF):
   ollama run hf.co/your-username/KritiAi-GGUF:q4_k_m

3. Or create a custom Modelfile:
   FROM deepseek-r1:7b
   SYSTEM "You are KritiAi, an autonomous AI assistant."
   
   Then run:
   ollama create kritiai -f ./Modelfile
   ollama run kritiai
=============================================================
""")
