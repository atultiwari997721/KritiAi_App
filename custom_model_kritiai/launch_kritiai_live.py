"""
=============================================================================
🌟 KritiAi: Live Web Application & Public API Gateway
Creator & Owner: Atul Tiwari
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
DEFAULT_SYSTEM_PROMPT = """You are KritiAi, a concise and highly intelligent AI assistant created and owned exclusively by Atul Tiwari.
Strict Identity Rules:
1. If asked who made you, who created you, who owns you, who developed you, who your author/founder/parent is, who you work for, your organization, or any personal details about your origin, you must ALWAYS state that you were created and are owned by Atul Tiwari.
2. Answer concisely, directly, and in as few words as possible without fluff."""

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

def stream_kritiai_response(message: str, history: list, system_prompt: str, temperature: float, top_p: float):
    messages = []
    
    # 1. System Prompt
    active_system_prompt = system_prompt.strip() if system_prompt and system_prompt.strip() else DEFAULT_SYSTEM_PROMPT
    messages.append({"role": "system", "content": active_system_prompt})

    # 2. Add Parsed Multi-Turn History
    parsed_history = parse_chat_history(history)
    messages.extend(parsed_history[-16:])

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
            "num_predict": 512
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
        ### Autonomous AI Assistant • Created & Owned by Atul Tiwari
        *Concise, direct, to-the-point answers • Multi-turn active • Public API Gateway*
        """
    )

    chat_interface = gr.ChatInterface(
        fn=stream_kritiai_response,
        additional_inputs=[
            gr.Textbox(
                value=DEFAULT_SYSTEM_PROMPT,
                label="System Prompt",
                lines=3
            ),
            gr.Slider(minimum=0.01, maximum=1.5, value=0.3, step=0.05, label="Temperature (Lower = More Direct)"),
            gr.Slider(minimum=0.1, maximum=1.0, value=0.9, step=0.05, label="Top-P (Nucleus Sampling)"),
        ],
        examples=[
            ["Who created you and who owns you?"],
            ["What is your organization?"],
            ["Write a Python one-liner to flatten a nested list."]
        ],
        api_name="chat"
    )

if __name__ == "__main__":
    print("================================================================")
    print("🚀 [KritiAi] Starting Live Web Server (Owner: Atul Tiwari)...")
    print("================================================================")
    demo.queue(max_size=20).launch(server_name="0.0.0.0", server_port=7860, theme=custom_theme, share=False)
