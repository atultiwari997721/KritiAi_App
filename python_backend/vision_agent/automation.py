import pyautogui
import time
import base64
from io import BytesIO
from PIL import Image
from mode_manager.manager import ModeManager
from utils.llm_client import LLMClient

class KritiVision:
    def __init__(self, mode_manager: ModeManager, llm_client: LLMClient):
        self.mode_manager = mode_manager
        self.llm = llm_client
        pyautogui.FAILSAFE = True  # Move mouse to corner to abort

    def capture_screen(self) -> str:
        """Captures screen and returns base64 string for Vision Model."""
        screenshot = pyautogui.screenshot()
        buffered = BytesIO()
        screenshot.save(buffered, format="PNG")
        return base64.b64encode(buffered.getvalue()).decode("utf-8")

    async def analyze_and_execute(self, command: str, vision_model_name: str = "llava"):
        print(f"[Vision] Triggered OS automation for: {command}")
        
        # 1. Capture screen
        image_b64 = self.capture_screen()
        
        # 2. Ask Vision Model for coordinates
        # Note: In a real implementation, the LLMClient would need an endpoint 
        # capable of handling image payload (e.g. GPT-4o Vision or Ollama with LLaVA).
        # We mock the parsed response for the skeleton.
        system_prompt = "You are a vision AI. Return a JSON array of actions: click (x,y), type (text), press (key)."
        prompt = f"Command: {command}\n[Image Base64 Attached: {image_b64[:10]}...]"
        
        print(f"[Vision] Requesting actions from {vision_model_name}...")
        # plan_str = await self.llm.generate(prompt, vision_model_name, system_prompt)
        
        # Mocking vision model response
        planned_actions = [
            {"action": "click", "x": 500, "y": 300, "desc": "Click browser icon"},
            {"action": "type", "text": "localhost:3000", "desc": "Type local server URL"},
            {"action": "press", "key": "enter", "desc": "Press Enter"}
        ]
        
        # 3. SAFETY CONSTRAINT: Always ask for approval
        print("[Vision] Planned actions generated. Requesting safety approval.")
        action_summary = "\\n".join([f"- {a['action']}: {a.get('desc', '')}" for a in planned_actions])
        
        approved = await self.mode_manager.check_approval(
            "OS Automation Actions", 
            action_summary, 
            force_semi_supervised=True
        )
        
        if not approved:
            print("[Vision] Automation aborted by user.")
            return

        # 4. Execute
        print("[Vision] Executing actions...")
        for step in planned_actions:
            if step["action"] == "click":
                pyautogui.click(step["x"], step["y"])
            elif step["action"] == "type":
                pyautogui.write(step["text"], interval=0.05)
            elif step["action"] == "press":
                pyautogui.press(step["key"])
            time.sleep(0.5)
        print("[Vision] OS Automation sequence complete.")
