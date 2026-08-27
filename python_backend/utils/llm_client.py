import aiohttp
import os
import json
from typing import Optional

class LLMClient:
    def __init__(self):
        # By default, use local Ollama instance
        self.use_local = True
        self.local_url = "http://localhost:11434/api/generate"
        
        # Fallback to external API (e.g., OpenAI)
        self.api_url = "https://api.openai.com/v1/chat/completions"
        self.api_key = os.getenv("OPENAI_API_KEY", "")

    def toggle_backend(self, use_local: bool):
        """Switch between local LLM and external API."""
        self.use_local = use_local
        print(f"[LLMClient] Switched backend. Local: {self.use_local}")

    async def generate(self, prompt: str, model_name: str, system_prompt: Optional[str] = None) -> str:
        """Generates a response from the configured LLM backend."""
        if self.use_local:
            return await self._generate_local(prompt, model_name, system_prompt)
        else:
            return await self._generate_api(prompt, model_name, system_prompt)

    async def _generate_local(self, prompt: str, model_name: str, system_prompt: Optional[str] = None) -> str:
        """Call local Ollama API."""
        payload = {
            "model": model_name,
            "prompt": prompt,
            "stream": False
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.local_url, json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get("response", "")
                    else:
                        error_text = await response.text()
                        return f"[ERROR] Local LLM failed: {error_text}"
        except Exception as e:
            return f"[ERROR] Local LLM connection error: {e}"

    async def _generate_api(self, prompt: str, model_name: str, system_prompt: Optional[str] = None) -> str:
        """Call external OpenAI-compatible API."""
        if not self.api_key:
            return "[ERROR] API Key not configured. Please set OPENAI_API_KEY."

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model_name,  # e.g., 'gpt-4o'
            "messages": messages
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.api_url, headers=headers, json=payload) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data["choices"][0]["message"]["content"]
                    else:
                        error_text = await response.text()
                        return f"[ERROR] External API failed: {error_text}"
        except Exception as e:
            return f"[ERROR] External API connection error: {e}"
