"""
Kriti AI - Custom ML Model Wrapper
Phase 1: PyTorch / Transformers Intent Router, Code Optimizer & Context Engine
"""

import torch
import torch.nn as nn
from typing import Dict, List, Any, Optional
from transformers import AutoTokenizer, AutoModelForSequenceClassification, AutoModelForCausalLM

class KritiAiIntentRouter(nn.Module):
    """
    Lightweight, ultra-fast intent router trained to classify user prompts into:
    0: LOCAL_FAST (Simple conversation, small queries -> Ollama 3B/7B)
    1: CODE_AUTONOMOUS (Coding, refactoring, debugging -> DeepSeek-Coder / Qwen-2.5-Coder)
    2: SYSTEM_ACTION (File I/O, email, calendar, terminal -> OpenClaw Tools)
    3: COMPLEX_REASONING (Large architectures, deep logic -> Colab GPU / Cloud)
    """
    INTENT_LABELS = {
        0: "LOCAL_FAST",
        1: "CODE_AUTONOMOUS",
        2: "SYSTEM_ACTION",
        3: "COMPLEX_REASONING"
    }

    def __init__(self, base_model_name: str = "distilbert-base-uncased", num_classes: int = 4):
        super().__init__()
        self.tokenizer = AutoTokenizer.from_pretrained(base_model_name)
        self.encoder = AutoModelForSequenceClassification.from_pretrained(
            base_model_name,
            num_labels=num_classes
        )

    def forward(self, input_ids, attention_mask):
        return self.encoder(input_ids=input_ids, attention_mask=attention_mask).logits

    def predict_intent(self, prompt: str, device: str = "cpu") -> Dict[str, Any]:
        self.eval()
        self.to(device)
        inputs = self.tokenizer(
            prompt,
            padding=True,
            truncation=True,
            max_length=256,
            return_tensors="pt"
        ).to(device)

        with torch.no_grad():
            logits = self.forward(inputs["input_ids"], inputs["attention_mask"])
            probs = torch.softmax(logits, dim=-1)
            pred_idx = torch.argmax(probs, dim=-1).item()
            confidence = probs[0][pred_idx].item()

        return {
            "intent_id": pred_idx,
            "intent_name": self.INTENT_LABELS[pred_idx],
            "confidence": round(confidence, 4),
            "probabilities": {self.INTENT_LABELS[i]: round(probs[0][i].item(), 4) for i in range(len(self.INTENT_LABELS))}
        }


class KritiAiGenerativeEngine:
    """
    High-efficiency generative model wrapper supporting 4-bit / 8-bit quantization
    for free GPU inference (Colab T4 / HF Spaces / Local GPU).
    Specialized for autonomous code refactoring and context distillation.
    """
    def __init__(
        self,
        model_id: str = "Qwen/Qwen2.5-Coder-1.5B-Instruct",
        device: Optional[str] = None,
        load_in_4bit: bool = False
    ):
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        print(f"[KritiAi Engine] Initializing model '{model_id}' on {self.device} (4-bit={load_in_4bit})...")
        
        self.tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
        
        load_kwargs: Dict[str, Any] = {"trust_remote_code": True}
        if self.device == "cuda":
            load_kwargs["torch_dtype"] = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
            if load_in_4bit:
                from transformers import BitsAndBytesConfig
                load_kwargs["quantization_config"] = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.float16,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_use_double_quant=True
                )
        
        self.model = AutoModelForCausalLM.from_pretrained(model_id, **load_kwargs)
        if not load_in_4bit and self.device == "cuda":
            self.model.to(self.device)

    def generate_response(
        self,
        messages: List[Dict[str, str]],
        max_new_tokens: int = 1024,
        temperature: float = 0.2,
        top_p: float = 0.95
    ) -> str:
        prompt_text = self.tokenizer.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True
        )
        inputs = self.tokenizer([prompt_text], return_tensors="pt").to(self.device)

        with torch.no_grad():
            output_ids = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=max(temperature, 0.01),
                top_p=top_p,
                do_sample=temperature > 0.0,
                pad_token_id=self.tokenizer.eos_token_id
            )

        generated_ids = [
            out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs.input_ids, output_ids)
        ]
        return self.tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
