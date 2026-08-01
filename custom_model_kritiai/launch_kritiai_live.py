"""
=============================================================================
🌟 KritiAi: Live Web Application & Public API Gateway (Multi-Turn Fixed)
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

def parse_chat_history(history):
    """
    Universally parses chat history across all Gradio versions (Gradio 4, 5, and 6),
    handling dict lists, tuple/list pairs, and ChatMessage objects safely.
    """
    messages = []
    if not history:
        return messages

    for item in history:
        # Case 1: Gradio 5/6 dictionary format: {"role": "user", "content": "..."}
        if isinstance(item, dict):
            role = item.get("role") or ("user" if item.get("type") == "user" else "assistant")
            content = item.get("content", "")
            if content:
                messages.append({"role": str(role), "content": str(content)})

        # Case 2: Gradio 4 tuple/list format: [user_msg, bot_msg]
        elif isinstance(item, (list, tuple)) and len(item) == 2:
            user_msg, bot_msg = item
            if user_msg:
                messages.append({"role": "user", "content": str(user_msg)})
            if bot_msg:
                messages.append({"role": "assistant", "content": str(bot_msg)})

        # Case 3: Gradio ChatMessage object
        elif hasattr(item, "role") and hasattr(item, "content"):
            if item.content:
                messages.append({"role": str(item.role), "content": str(item.content)})

    return messages

def stream_kritiai_response(message: str, history: list, system_prompt: str, temperature: float, top_p: float):
    """
    Streams tokens in real-time from the local KritiAi engine to the Gradio ChatInterface.
    Guarantees seamless multi-turn conversation continuity without getting stuck.
    """
    messages = []
    
    # 1. Add System Prompt
    if system_prompt and system_prompt.strip():
        messages.append({"role": "system", "content": system_prompt.strip()})

    # 2. Add Parsed Multi-Turn History
    parsed_history = parse_chat_history(history)
    messages.extend(parsed_history[-20:])

    # 3. Add Current User Message
    if isinstance(message, dict):
        current_msg = message.get("text", "") or message.get("content", "")
    else:
        current_msg = str(message)

    messages.append({"role": "user", "content": current_msg})

    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": True,
        "options": {
            "temperature": float(temperature),
            "top_p": float(top_p),
            "num_predict": 2048
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
        with urllib.request.urlopen(req, timeout=60) as response:
            for line in response:
                if line:
                    chunk = json.loads(line.decode('utf-8'))
                    if "message" in chunk and "content" in chunk["message"]:
                        accumulated_text += chunk["message"]["content"]
                        yield accumulated_text
                    if chunk.get("done", False):
                        break
    except urllib.error.URLError as e:
        yield f"❌ Error communicating with KritiAi engine: {e}\nPlease verify that Ollama is running (`ollama run {MODEL_NAME}`)."
    except Exception as ex:
        yield f"❌ Stream error: {ex}"

custom_theme = gr.themes.Soft(
    primary_hue="blue",
    secondary_hue="indigo",
    neutral_hue="slate"
)

with gr.Blocks(title="KritiAi Neural Engine") as demo:
    gr.Markdown(
        """
        # 🧠 KritiAi Neural Engine
        ### Autonomous AI Assistant & Deep Reasoning Architecture
        *Multi-turn conversation active • Real-time Streaming • Public API Gateway*
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
        ```python
        from gradio_client import Client

        client = Client("http://127.0.0.1:7860/")
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
    print("🚀 [KritiAi] Starting Live Web Server (Multi-Turn Fixed)...")
    print("================================================================")
    demo.queue(max_size=20).launch(server_name="0.0.0.0", server_port=7860, theme=custom_theme, share=False)
