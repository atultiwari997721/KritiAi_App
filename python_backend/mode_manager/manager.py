from enum import Enum
import asyncio

class SupervisionMode(Enum):
    SUPERVISED = "L3"             # Require manual approval for everything
    SEMI_SUPERVISED = "L2"        # Routine actions auto, critical actions pause
    AUTOMATIC = "L0"              # Zero interventions

class ModeManager:
    def __init__(self):
        self.current_mode = SupervisionMode.SEMI_SUPERVISED
        self.frontend_callback = None  # Function to send prompts to frontend

    def set_mode(self, mode: SupervisionMode):
        self.current_mode = mode
        print(f"[ModeManager] Mode changed to {mode.value}")

    def set_frontend_callback(self, callback):
        """Register the async function used to ask the user via UI."""
        self.frontend_callback = callback

    def _is_critical_action(self, context: str) -> bool:
        """Determine if an action is critical (e.g. OS action, file deletion, API usage)."""
        critical_keywords = ["delete", "os automation", "external api", "refactor", "system level"]
        return any(keyword.lower() in context.lower() for keyword in critical_keywords)

    async def check_approval(self, action_context: str, details: str, force_semi_supervised: bool = False) -> bool:
        """
        Determines whether to pause and wait for user approval.
        KritiVision actions must set force_semi_supervised=True.
        """
        requires_approval = False
        mode_to_evaluate = self.current_mode

        if force_semi_supervised and self.current_mode == SupervisionMode.AUTOMATIC:
            mode_to_evaluate = SupervisionMode.SEMI_SUPERVISED

        if mode_to_evaluate == SupervisionMode.SUPERVISED:
            requires_approval = True
        elif mode_to_evaluate == SupervisionMode.SEMI_SUPERVISED:
            requires_approval = self._is_critical_action(action_context)
        
        if requires_approval:
            print(f"[PAUSED] Waiting for user approval for: {action_context}")
            if self.frontend_callback:
                # Ask user via UI
                return await self.frontend_callback(action_context, details)
            else:
                # Fallback to CLI for testing
                print(f"--- ACTION DETAILS ---\n{details}\n----------------------")
                response = input(f"Approve '{action_context}'? (y/n): ")
                return response.strip().lower() == 'y'
        
        return True
