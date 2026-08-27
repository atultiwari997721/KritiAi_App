"""
=============================================================================
🌟 KritiAi: Hugging Face Spaces Web App & Free Public API Endpoint
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

BASE_MODEL_ID = os.getenv("BASE_MODEL_ID", "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B")
LORA_ADAPTER_ID = os.getenv("LORA_ADAPTER_ID", "your-username/KritiAi")
DEFAULT_SYSTEM_PROMPT = """You are KritiAi, a concise, direct, and intelligent AI assistant.
Rules for answering:
1. Answer in as few words as possible while being accurate and helpful.
2. For all general, technical, and coding questions, do NOT mention any personal names or creator info.
3. ONLY when the user specifically and explicitly asks who made you, who created you, who owns you, who developed you, or explicitly demands the creator's name, tell them you were created and are owned by Atul Tiwari."""

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"🚀 Initializing KritiAi on {device.upper()}...")

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
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID, trust_remote_code=True, padding_side="left")
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

# Load Base Model
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
except Exception as e:
    print(f"⚠️ Falling back to 1.5B model: {e}")
    BASE_MODEL_ID = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID, trust_remote_code=True)
    base_model = AutoModelForCausalLM.from_pretrained(BASE_MODEL_ID, torch_dtype=torch_dtype, low_cpu_mem_usage=True)

model = base_model
try:
    if LORA_ADAPTER_ID and LORA_ADAPTER_ID != "your-username/KritiAi":
        model = PeftModel.from_pretrained(base_model, LORA_ADAPTER_ID)
except Exception as err:
    model = base_model

model.eval()

def parse_chat_history(history):
    messages = []
    if not history:
        return messages
    for item in history:
        if isinstance(item, dict):
            role = item.get("role") or ("user" if item.get("type") == "user" else "assistant")
            content = item.get("content", "")
            if content:
                messages.append({"role": str(role), "content": str(content)})
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            user_msg, bot_msg = item
            if user_msg:
                messages.append({"role": "user", "content": str(user_msg)})
            if bot_msg:
                messages.append({"role": "assistant", "content": str(bot_msg)})
        elif hasattr(item, "role") and hasattr(item, "content"):
            if item.content:
                messages.append({"role": str(item.role), "content": str(item.content)})
    return messages

def generate_response(message: str, history: list, system_prompt: str, max_new_tokens: int, temperature: float, top_p: float):
    messages = []
    active_system_prompt = system_prompt.strip() if system_prompt and system_prompt.strip() else DEFAULT_SYSTEM_PROMPT
    messages.append({"role": "system", "content": active_system_prompt})

    parsed_history = parse_chat_history(history)
    messages.extend(parsed_history[-16:])

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
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            gc.collect()

with gr.Blocks(theme=gr.themes.Soft(primary_hue="blue", neutral_hue="slate")) as demo:
    gr.Markdown(
        """
        # 🧠 KritiAi Neural Engine
        ### Autonomous AI Assistant • Fast, Concise & Intelligent
        *Direct answers • Multi-turn active • Public API Endpoint*
        """
    )

    chat_interface = gr.ChatInterface(
        fn=generate_response,
        additional_inputs=[
            gr.Textbox(
                value=DEFAULT_SYSTEM_PROMPT,
                label="System Prompt",
                lines=3
            ),
            gr.Slider(minimum=32, maximum=2048, value=512, step=32, label="Max New Tokens"),
            gr.Slider(minimum=0.01, maximum=1.5, value=0.3, step=0.05, label="Temperature (Lower = More Direct)"),
            gr.Slider(minimum=0.1, maximum=1.0, value=0.9, step=0.05, label="Top-P (Nucleus Sampling)"),
        ],
        examples=[
            ["Who are you?"],
            ["Reverse a list in Python in 1 line."],
            ["What is photosynthesis in 1 sentence?"],
            ["Who specifically created you?"]
        ],
        api_name="chat"
    )

if __name__ == "__main__":
    demo.queue(max_size=20).launch(server_name="0.0.0.0", server_port=7860, share=False)
