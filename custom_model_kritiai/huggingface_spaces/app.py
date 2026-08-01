"""
=============================================================================
🌟 KritiAi: Hugging Face Spaces Web App & Public API Deployment Server
=============================================================================
Model Base: deepseek-ai/DeepSeek-R1-Distill-Qwen-7B
Adapters: Fine-Tuned KritiAi LoRA Adapter
Interface: Gradio ChatInterface with Real-time Streaming & Public API Endpoints
=============================================================================
"""

import os
import threading
import torch
import gradio as gr
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    BitsAndBytesConfig,
    TextIteratorStreamer
)
from peft import PeftModel

# =============================================================================
# MODEL IDENTIFIERS (Configurable via HF Space Environment Variables)
# =============================================================================
BASE_MODEL_ID = os.getenv("BASE_MODEL_ID", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B")
LORA_ADAPTER_ID = os.getenv("LORA_ADAPTER_ID", "your-username/KritiAi")  # Replace with your HF repo

print(f"🚀 [KritiAi Server] Initializing Engine...")
print(f"📦 Base Model: {BASE_MODEL_ID}")
print(f"🧬 LoRA Adapter: {LORA_ADAPTER_ID}")

# Determine device & compute precision
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"⚡ Device Available: {device.upper()}")

# Quantization configuration for GPU memory optimization
if device == "cuda":
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True
    )
    torch_dtype = torch.float16
else:
    bnb_config = None
    torch_dtype = torch.float32

# Load Tokenizer
print("⏳ Loading Tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(
    BASE_MODEL_ID,
    trust_remote_code=True,
    padding_side="left"
)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

# Load Base Model
print("⏳ Loading Base Model...")
try:
    if device == "cuda":
        base_model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL_ID,
            quantization_config=bnb_config,
            device_map="auto",
            trust_remote_code=True
        )
    else:
        # CPU loading with low memory usage
        base_model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL_ID,
            torch_dtype=torch_dtype,
            low_cpu_mem_usage=True,
            trust_remote_code=True
        ).to(device)
    print("✅ Base Model Loaded successfully.")
except Exception as e:
    print(f"⚠️ Error loading 7B base model ({e}). Attempting fallback to lightweight 1.5B model...")
    FALLBACK_MODEL = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
    tokenizer = AutoTokenizer.from_pretrained(FALLBACK_MODEL, trust_remote_code=True)
    base_model = AutoModelForCausalLM.from_pretrained(
        FALLBACK_MODEL,
        torch_dtype=torch_dtype,
        device_map="auto" if device == "cuda" else None,
        low_cpu_mem_usage=True
    )

# Attach KritiAi LoRA Adapters
model = base_model
try:
    if LORA_ADAPTER_ID and LORA_ADAPTER_ID != "your-username/KritiAi":
        print(f"🧬 Attaching LoRA Adapters from '{LORA_ADAPTER_ID}'...")
        model = PeftModel.from_pretrained(base_model, LORA_ADAPTER_ID)
        print("🎉 [KritiAi] LoRA adapters merged successfully!")
    else:
        print("ℹ️ Using Base Model (Set LORA_ADAPTER_ID secret/env in Space settings once published).")
except Exception as err:
    print(f"⚠️ Could not load adapter '{LORA_ADAPTER_ID}': {err}. Running base model directly.")
    model = base_model

model.eval()

# =============================================================================
# INFERENCE & STREAMING LOGIC
# =============================================================================
def generate_response(message: str, history: list, system_prompt: str, max_new_tokens: int, temperature: float, top_p: float):
    """
    Generator function that streams tokens in real-time to the Gradio chat UI and API.
    """
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    for user_msg, assistant_msg in history:
        if user_msg:
            messages.append({"role": "user", "content": user_msg})
        if assistant_msg:
            messages.append({"role": "assistant", "content": assistant_msg})

    messages.append({"role": "user", "content": message})

    # Format using chat template
    if hasattr(tokenizer, "apply_chat_template"):
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    else:
        prompt = f"<｜User｜>{message}<｜Assistant｜><think>\n"

    inputs = tokenizer([prompt], return_tensors="pt").to(model.device)

    streamer = TextIteratorStreamer(tokenizer, timeout=20.0, skip_prompt=True, skip_special_tokens=True)
    generate_kwargs = dict(
        inputs,
        streamer=streamer,
        max_new_tokens=int(max_new_tokens),
        temperature=max(float(temperature), 0.01),
        top_p=float(top_p),
        do_sample=True,
        pad_token_id=tokenizer.pad_token_id,
        eos_token_id=tokenizer.eos_token_id
    )

    thread = threading.Thread(target=model.generate, kwargs=generate_kwargs)
    thread.start()

    accumulated_text = ""
    for new_text in streamer:
        accumulated_text += new_text
        yield accumulated_text

# =============================================================================
# GRADIO UI & PUBLIC API SPECIFICATION
# =============================================================================
custom_css = """
.gradio-container {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
}
#chat-header {
    text-align: center;
    margin-bottom: 12px;
}
"""

with gr.Blocks(theme=gr.themes.Soft(primary_hue="blue", neutral_hue="slate"), css=custom_css) as demo:
    gr.Markdown(
        """
        # 🧠 KritiAi Neural Engine
        ### DeepSeek-R1-Distill-Qwen-7B Powered Autonomous Assistant & Code Intelligence
        *Run inference in real-time or connect via the free public API endpoint.*
        """,
        elem_id="chat-header"
    )

    chat_interface = gr.ChatInterface(
        fn=generate_response,
        additional_inputs=[
            gr.Textbox(
                value="You are KritiAi, an advanced autonomous AI assistant powered by DeepSeek-R1 reasoning. Provide detailed, thoughtful, step-by-step reasoning followed by crystal-clear solutions.",
                label="System Prompt",
                lines=2
            ),
            gr.Slider(minimum=64, maximum=4096, value=1024, step=64, label="Max New Tokens"),
            gr.Slider(minimum=0.01, maximum=1.5, value=0.6, step=0.05, label="Temperature"),
            gr.Slider(minimum=0.1, maximum=1.0, value=0.95, step=0.05, label="Top-P (Nucleus Sampling)"),
        ],
        examples=[
            ["Who are you and what are your primary capabilities?"],
            ["Write a clean Python microservice in FastAPI to perform semantic code analysis."],
            ["Solve this logic puzzle: You have 8 balls of identical size. 7 weigh the same, 1 is heavier. How can you find the heavy ball in only 2 weighings using a balance scale?"],
        ],
        cache_examples=False,
        api_name="chat"
    )

    gr.Markdown(
        """
        ---
        ### 🔌 Free Public API Integration
        You can query this KritiAi deployment programmatically from Python, JavaScript, cURL, or local apps:
        
        ```python
        from gradio_client import Client

        client = Client("your-username/KritiAi-Space")  # or your space URL
        result = client.predict(
            message="Hello KritiAi, help me build a high-performance backend.",
            system_prompt="You are KritiAi.",
            max_new_tokens=1024,
            temperature=0.6,
            top_p=0.95,
            api_name="/chat"
        )
        print(result)
        ```
        """
    )

if __name__ == "__main__":
    demo.queue().launch(server_name="0.0.0.0", server_port=7860, share=False)
