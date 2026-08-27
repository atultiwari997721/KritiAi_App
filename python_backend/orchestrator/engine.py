import asyncio
from typing import Dict
from mode_manager.manager import ModeManager
from utils.llm_client import LLMClient

class MultiModelOrchestrator:
    def __init__(self, mode_manager: ModeManager, llm_client: LLMClient):
        self.mode_manager = mode_manager
        self.llm = llm_client
        
        # Default model assignments
        # In a real scenario, these can be mapped to local vs external models
        self.leader_model = "qwen-2.5-coder" # Local model name
        self.worker_model = "deepseek-coder"
        self.reviewer_model = "llama-3.3"

    def set_models(self, leader: str, worker: str, reviewer: str):
        """Allows dynamic switching of model identifiers."""
        self.leader_model = leader
        self.worker_model = worker
        self.reviewer_model = reviewer

    async def execute_task(self, user_prompt: str) -> Dict[str, str]:
        print(f"[Leader] Analyzing user prompt...")
        system_prompt = "You are a Principal Systems Architect. Break down the user prompt into a task plan."
        plan = await self.llm.generate(f"Break down: {user_prompt}", self.leader_model, system_prompt)
        
        if not await self.mode_manager.check_approval("Leader Plan", plan):
            return {"status": "aborted", "reason": "User rejected plan"}

        print(f"[Worker] Executing tasks based on plan...")
        sys_worker = "You are a senior developer. Write code based on the provided plan."
        code = await self.llm.generate(f"Write code for: {plan}", self.worker_model, sys_worker)
        
        print(f"[Reviewer] Analyzing generated code...")
        sys_reviewer = "You are a code reviewer. Check for syntax, security, and logic errors. Output 'ERROR:' if issues found."
        review = await self.llm.generate(f"Review code:\n{code}", self.reviewer_model, sys_reviewer)
        
        if "ERROR:" in review.upper():
            print(f"[Reviewer] Found issues: {review}\nRequesting worker rewrite...")
            # For this skeleton, we just notify of the error, but this could trigger a recursive loop.
            
        if not await self.mode_manager.check_approval("Final Code Application", code):
             return {"status": "aborted", "reason": "User rejected code application"}

        print("[Orchestrator] Applying changes to filesystem.")
        # File System utility integration goes here
        return {"status": "success", "code": code, "review_notes": review}
