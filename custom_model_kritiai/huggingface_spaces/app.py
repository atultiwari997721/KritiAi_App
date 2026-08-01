"""
=============================================================================
🌟 KritiAi: Hugging Face Spaces Web App & Free Public API Endpoint
=============================================================================
Model Base: deepseek-ai/DeepSeek-R1-Distill-Qwen-7B
Adapters: Fine-Tuned KritiAi LoRA Adapter
Interface: Gradio ChatInterface (Multi-turn Fixed & Memory Optimized)
=============================================================================
"""

import os
import gc
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

# --- CONFIGURATION ---
BASE_MODEL_ID = os.getenv("BASE_MODEL_ID", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B")
LORA_ADAPTER_ID = os.getenv("LORA_ADAPTER_ID", "your-username/KritiAi")

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"🚀 Initializing KritiAi on {device.upper()}...")

# 4-bit Quantization configuration for GPU memory optimization
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
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID, trust_remote_code=True, padding_side="left")
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
        base_model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL_ID,
            torch_dtype=torch_dtype,
            low_cpu_mem_usage=True,
            trust_remote_code=True
        ).to(device)
    print("✅ Base model loaded.")
except Exception as e:
    print(f"⚠️ Falling back to 1.5B model due to memory constraint: {e}")
    BASE_MODEL_ID = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID, trust_remote_code=True)
    base_model = AutoModelForCausalLM.from_pretrained(BASE_MODEL_ID, torch_dtype=torch_dtype, low_cpu_mem_usage=True)

# Attach Fine-Tuned LoRA Adapter
model = base_model
try:
    if LORA_ADAPTER_ID and LORA_ADAPTER_ID != "your-username/KritiAi":
        print(f"🧬 Attaching LoRA Adapters from '{LORA_ADAPTER_ID}'...")
        model = PeftModel.from_pretrained(base_model, LORA_ADAPTER_ID)
        print("🎉 LoRA adapter merged successfully!")
except Exception as err:
    print(f"⚠️ Adapter skipped ({err}). Running base model directly.")
    model = base_model

model.eval()

def parse_chat_history(history):
    """
    Universally parses chat history across all Gradio versions (Gradio 4, 5, and 6),
    handling dict lists, tuple/list pairs, and ChatMessage objects.
    """
    messages = []
    if not history:
        return messages

    for item in history:
        # Dict format (Gradio 5/6)
        if isinstance(item, dict):
            role = item.get("role") or ("user" if item.get("type") == "user" else "assistant")
            content = item.get("content", "")
            if content:
                messages.append({"role": role, "content": str(content)})
        # Tuple/List format (Gradio 4)
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            user_msg, bot_msg = item
            if user_msg:
                messages.append({"role": "user", "content": str(user_msg)})
            if bot_msg:
                messages.append({"role": "assistant", "content": str(bot_msg)})
        # ChatMessage object
        elif hasattr(item, "role") and hasattr(item, "content"):
            if item.content:
                messages.append({"role": str(item.role), "content": str(item.content)})

    return messages

# --- STREAMING INFERENCE FUNCTION ---
def generate_response(message: str, history: list, system_prompt: str, max_new_tokens: int, temperature: float, top_p: float):
    messages = []
    if system_prompt and system_prompt.strip():
        messages.append({"role": "system", "content": system_prompt.strip()})

    # Add historical messages safely
    parsed_history = parse_chat_history(history)
    messages.extend(parsed_history[-16:]) # Keep last 16 messages to prevent VRAM overflow

    # Add current message
    if isinstance(message, dict):
        current_msg = message.get("text", "") or message.get("content", "")
    else:
        current_msg = str(message)
    messages.append({"role": "user", "content": current_msg})

    if hasattr(tokenizer, "apply_chat_template"):
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    else:
        prompt = f"<｜User｜>{current_msg}<｜Assistant｜><think>\n"

    inputs = tokenizer([prompt], return_tensors="pt").to(model.device)

    streamer = TextIteratorStreamer(tokenizer, timeout=30.0, skip_prompt=True, skip_special_tokens=True)
    generate_kwargs = dict(
        inputs,
        streamer=streamer,
        max_new_tokens=int(max_new_tokens),
        temperature=max(float(temperature), 0.01),
        top_p=float(top_p),
        do_sample=True,
        pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
        eos_token_id=tokenizer.eos_token_id
    )

    thread = threading.Thread(target=model.generate, kwargs=generate_kwargs)
    thread.start()

    accumulated_text = ""
    try:
        for new_text in streamer:
            accumulated_text += new_text
            yield accumulated_text
    finally:
        # Free CUDA cache after request completion
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            gc.collect()

# --- GRADIO WEB INTERFACE & PUBLIC API ---
with gr.Blocks(theme=gr.themes.Soft(primary_hue="blue", neutral_hue="slate")) as demo:
    gr.Markdown(
        """
        # 🧠 KritiAi Neural Engine
        ### DeepSeek-R1-Distill-Qwen-7B Powered Autonomous Assistant
        *Multi-turn conversation active • Real-time Streaming • Public API Endpoint*
        """
    )

    chat_interface = gr.ChatInterface(
        fn=generate_response,
        type="messages",
        additional_inputs=[
            gr.Textbox(
                value="You are KritiAi, an advanced autonomous AI assistant powered by DeepSeek-R1 reasoning. Provide detailed step-by-step reasoning followed by clean solutions.",
                label="System Prompt",
                lines=2
            ),
            gr.Slider(minimum=64, maximum=4096, value=1024, step=64, label="Max New Tokens"),
            gr.Slider(minimum=0.01, maximum=1.5, value=0.6, step=0.05, label="Temperature"),
            gr.Slider(minimum=0.1, maximum=1.0, value=0.95, step=0.05, label="Top-P (Nucleus Sampling)"),
        ],
        examples=[
            ["Who are you and what makes you unique?"],
            ["Write a Python microservice with FastAPI to stream responses."],
            ["Solve: If 5 machines make 5 widgets in 5 minutes, how long do 100 machines take to make 100 widgets?"]
        ],
        api_name="chat"
    )

if __name__ == "__main__":
    demo.queue(max_size=20).launch(server_name="0.0.0.0", server_port=7860, share=False)
