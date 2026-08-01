"""
Kriti AI - Hugging Face Spaces Serverless Deployment
Phase 1: Free Cloud Inference Endpoint for Kriti AI Intent Routing & Code Assist
"""

import os
import torch
import gradio as gr
from fastapi import FastAPI
from transformers import pipeline, AutoTokenizer, AutoModelForCausalLM

MODEL_ID = "Qwen/Qwen2.5-Coder-1.5B-Instruct"

print(f"[HF Space] Initializing Kriti AI on Hugging Face Spaces: {MODEL_ID}...")
pipe = pipeline(
    "text-generation",
    model=MODEL_ID,
    model_kwargs={"torch_dtype": torch.float32},
    device_map="auto"
)

def respond(message, history, system_message, max_tokens, temperature, top_p):
    messages = [{"role": "system", "content": system_message}]
    for val in history:
        if val[0]:
            messages.append({"role": "user", "content": val[0]})
        if val[1]:
            messages.append({"role": "assistant", "content": val[1]})
    messages.append({"role": "user", "content": message})

    prompt = pipe.tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    outputs = pipe(
        prompt,
        max_new_tokens=max_tokens,
        do_sample=True,
        temperature=temperature,
        top_p=top_p
    )
    yield outputs[0]["generated_text"][len(prompt):]

demo = gr.ChatInterface(
    respond,
    additional_inputs=[
        gr.Textbox(value="You are Kriti AI, an omnipotent personal assistant and autonomous software engineer.", label="System message"),
        gr.Slider(minimum=1, maximum=2048, value=512, step=1, label="Max new tokens"),
        gr.Slider(minimum=0.1, maximum=2.0, value=0.2, step=0.1, label="Temperature"),
        gr.Slider(minimum=0.1, maximum=1.0, value=0.95, step=0.05, label="Top-p (nucleus sampling)")
    ],
    title="Kriti AI Cloud Node",
    description="Free serverless inference node powered by Hugging Face Spaces."
)

if __name__ == "__main__":
    demo.launch()
