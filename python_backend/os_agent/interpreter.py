import subprocess
import os
import json
from mode_manager.manager import ModeManager, SupervisionMode
from utils.llm_client import LLMClient

class OSInterpreter:
    def __init__(self, mode_manager: ModeManager, llm_client: LLMClient):
        self.mode_manager = mode_manager
        self.llm = llm_client
        self.workspace_root = os.getcwd()

    async def execute_task(self, prompt: str, websocket_send=None) -> dict:
        """
        Parses a prompt, writes shell or python script, asks for approval, and executes it.
        """
        if websocket_send:
            await websocket_send("Analyzing OS task: " + prompt)

        system_prompt = (
            "You are an OS-level autonomous agent (Open Interpreter paradigm). "
            "Based on the user prompt, output a JSON array of commands to execute. "
            "Each item should have 'type' ('shell' or 'python'), 'code', and 'description'."
            "Output strictly valid JSON with no markdown wrapping."
        )

        plan_str = await self.llm.generate(prompt, "qwen-2.5-coder", system_prompt)
        
        try:
            # Strip markdown if present
            if plan_str.startswith("```json"):
                plan_str = plan_str[7:]
            if plan_str.endswith("```"):
                plan_str = plan_str[:-3]
                
            commands = json.loads(plan_str.strip())
        except Exception as e:
            if websocket_send:
                await websocket_send("Failed to parse OS plan from LLM.")
            return {"status": "error", "message": f"Failed to parse LLM output: {plan_str}"}

        results = []
        for cmd in commands:
            desc = cmd.get("description", "Execute code")
            c_type = cmd.get("type", "shell")
            code = cmd.get("code", "")

            # Security sandboxing / Approval Check
            if websocket_send:
                await websocket_send(f"Preparing to execute ({c_type}): {desc}")

            # All OS actions should default to Semi-Supervised safety checks
            approved = await self.mode_manager.check_approval(
                f"OS Execution: {desc}", 
                f"Type: {c_type}\nCode:\n{code}",
                force_semi_supervised=True
            )

            if not approved:
                if websocket_send:
                    await websocket_send(f"User denied execution: {desc}")
                results.append({"status": "aborted", "code": code})
                break

            if websocket_send:
                await websocket_send(f"Executing: {code}")

            if c_type == "shell":
                out, err = self._run_shell(code)
                results.append({"status": "success", "output": out, "error": err})
                if websocket_send:
                    await websocket_send(f"Result:\n{out}\n{err}")
            elif c_type == "python":
                out, err = self._run_python(code)
                results.append({"status": "success", "output": out, "error": err})
                if websocket_send:
                    await websocket_send(f"Result:\n{out}\n{err}")

        return {"status": "complete", "results": results}

    def _run_shell(self, code: str):
        try:
            process = subprocess.Popen(
                code, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=self.workspace_root
            )
            stdout, stderr = process.communicate(timeout=60)
            return stdout, stderr
        except Exception as e:
            return "", str(e)

    def _run_python(self, code: str):
        try:
            process = subprocess.Popen(
                ["python", "-c", code], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=self.workspace_root
            )
            stdout, stderr = process.communicate(timeout=60)
            return stdout, stderr
        except Exception as e:
            return "", str(e)
