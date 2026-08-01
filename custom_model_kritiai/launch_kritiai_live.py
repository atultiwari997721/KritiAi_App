"""
=============================================================================
🌟 KritiAi: Live Web Application & Public API Gateway
=============================================================================
Connects the local KritiAi neural engine with a Gradio web interface,
exposing a local UI on port 7860 AND generating a live public shareable link.
=============================================================================
"""

import os
import sys
import json
import urllib.request
import urllib.error
import gradio as gr

# Ensure UTF-8 output on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

OLLAMA_API_URL = "http://127.0.0.1:11434/api/chat"
MODEL_NAME = "kritiai"

def stream_kritiai_response(message: str, history: list, system_prompt: str, temperature: float, top_p: float):
    """
    Streams tokens in real-time from the local KritiAi engine to the Gradio ChatInterface.
    """
    messages = []
    if system_prompt and system_prompt.strip():
        messages.append({"role": "system", "content": system_prompt})
    
    for user_msg, bot_msg in history:
        if user_msg:
            messages.append({"role": "user", "content": user_msg})
        if bot_msg:
            messages.append({"role": "assistant", "content": bot_msg})
    
    messages.append({"role": "user", "content": message})

    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": True,
        "options": {
            "temperature": float(temperature),
            "top_p": float(top_p)
        }
    }

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        OLLAMA_API_URL,
        data=data,
        headers={"Content-Type": "application/json"}
    )

    try:
        accumulated_text = ""
        with urllib.request.urlopen(req) as response:
            for line in response:
                if line:
                    chunk = json.loads(line.decode('utf-8'))
                    if "message" in chunk and "content" in chunk["message"]:
                        accumulated_text += chunk["message"]["content"]
                        yield accumulated_text
    except urllib.error.URLError as e:
        yield f"❌ Error communicating with KritiAi engine: {e}\nPlease verify that Ollama is running (`ollama run {MODEL_NAME}`)."

# UI Styling
custom_theme = gr.themes.Soft(
    primary_hue="blue",
    secondary_hue="indigo",
    neutral_hue="slate"
)

with gr.Blocks(theme=custom_theme, title="KritiAi Neural Engine") as demo:
    gr.Markdown(
        """
        # 🧠 KritiAi Neural Engine
        ### Autonomous AI Assistant & Deep Reasoning Architecture
        *Powered by Custom DeepSeek/Qwen Fine-Tuned Weights • Real-time Streaming • Public API Active*
        """
    )

    chat_interface = gr.ChatInterface(
        fn=stream_kritiai_response,
        additional_inputs=[
            gr.Textbox(
                value="You are KritiAi, an advanced autonomous AI assistant. Provide thoughtful, step-by-step reasoning and high-performance solutions.",
                label="System Prompt",
                lines=2
            ),
            gr.Slider(minimum=0.01, maximum=1.5, value=0.6, step=0.05, label="Temperature"),
            gr.Slider(minimum=0.1, maximum=1.0, value=0.95, step=0.05, label="Top-P (Nucleus Sampling)"),
        ],
        examples=[
            ["Who are you and what makes your architecture unique?"],
            ["Write an optimized Python script for concurrent async data pipeline processing."],
            ["Solve this riddle: The person who makes it has no need of it; the person who buys it has no use for it. The person who uses it can neither see nor feel it. What is it?"]
        ],
        api_name="chat"
    )

    gr.Markdown(
        """
        ---
        ### 🔌 Public API Usage
        You can connect to this live KritiAi instance from any Python script, website, or mobile app:
        ```python
        from gradio_client import Client

        # Connect to your live KritiAi endpoint
        client = Client("http://127.0.0.1:7860/") # or your public share URL
        result = client.predict(
            message="Hello KritiAi, assist me with software design.",
            system_prompt="You are KritiAi.",
            temperature=0.6,
            top_p=0.95,
            api_name="/chat"
        )
        print(result)
        ```
        """
    )

if __name__ == "__main__":
    print("================================================================")
    print("🚀 [KritiAi] Starting Live Web Server & Public Share Gateway...")
    print("================================================================")
    # Launches locally on port 7860 and creates a public share link
    demo.launch(server_name="0.0.0.0", server_port=7860, share=True)
