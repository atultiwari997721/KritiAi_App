"""
=============================================================================
🚀 KritiAi: Fine-Tuning DeepSeek-R1-Distill-Qwen-7B on Google Colab (Free T4)
=============================================================================
Author: Kriti AI MLOps Team
Model Base: deepseek-ai/DeepSeek-R1-Distill-Qwen-7B
Framework: Unsloth (4-bit QLoRA, 2x faster, 70% less memory)
=============================================================================
"""

# =============================================================================
# 1. INSTALLATION & SETUP (Run this cell first)
# =============================================================================
# Installs unsloth, torch, xformers, trl, peft, and accelerate optimized for Colab
!pip install --no-deps "xformers<0.0.29" "trl<0.9.0" peft accelerate bitsandbytes
!pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
!pip install --no-deps triton
!pip install torchvision datasets huggingface_hub

# Verify GPU
import torch
print(f"CUDA Available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"Active GPU: {torch.cuda.get_device_name(0)}")
    print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")

# =============================================================================
# 2. LOAD BASE MODEL & TOKENIZER WITH 4-BIT QUANTIZATION
# =============================================================================
from unsloth import FastLanguageModel
import torch

max_seq_length = 2048  # Supports up to 8192 RoPE scaling if needed
dtype = None           # None for auto-detection (Float16 for Tesla T4, Bfloat16 for Ampere+)
load_in_4bit = True    # 4-bit quantization reduces 7B model VRAM from 14GB to ~5.5GB

print("📥 Loading DeepSeek-R1-Distill-Qwen-7B base model...")
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "unsloth/DeepSeek-R1-Distill-Qwen-7B-unsloth-bnb-4bit",
    max_seq_length = max_seq_length,
    dtype = dtype,
    load_in_4bit = load_in_4bit,
)

# =============================================================================
# 3. CONFIGURE LORA ADAPTERS (QLoRA)
# =============================================================================
model = FastLanguageModel.get_peft_model(
    model,
    r = 16,                               # LoRA rank (16 is optimal for reasoning & code)
    target_modules = [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj"
    ],
    lora_alpha = 16,
    lora_dropout = 0,                     # 0 is optimized by Unsloth for maximum speed
    bias = "none",
    use_gradient_checkpointing = "unsloth",# Unsloth gradient checkpointing saves ~30% VRAM
    random_state = 3407,
    use_rslora = False,
    loftq_config = None,
)

print("✅ LoRA adapters attached successfully.")

# =============================================================================
# 4. PREPARE DATASET WITH CHATML / DEEPSEEK-R1 REASONING TEMPLATE
# =============================================================================
from datasets import Dataset

# Sample high-quality reasoning and assistant dataset for KritiAi
# You can replace or extend this with your own jsonl dataset / HuggingFace dataset
sample_data = [
    {
        "instruction": "Who are you and what are your capabilities?",
        "reasoning": "The user is asking for identity and core capabilities. I must identify as KritiAi, built with deep reasoning and autonomous system capabilities.",
        "response": "I am **KritiAi**, an advanced autonomous AI assistant powered by DeepSeek-R1 reasoning architecture. I specialize in deep multi-step logic, full-stack software engineering, autonomous computer task execution, and creative problem solving."
    },
    {
        "instruction": "Write a Python function to compute the Fibonacci sequence using dynamic programming with memoization.",
        "reasoning": "1. Understand the problem: Calculate Fibonacci numbers efficiently.\n2. Choose approach: Memoization dictionary/cache to avoid O(2^n) exponential recursion.\n3. Handle edge cases: n < 0, n = 0, n = 1.\n4. Write clean, type-annotated code with docstrings.",
        "response": "Here is an optimized Python implementation using memoization:\n\n```python\nfrom typing import Dict\n\ndef fibonacci_memo(n: int, memo: Dict[int, int] = None) -> int:\n    \"\"\"Compute the n-th Fibonacci number using top-down memoization.\n    \n    Time Complexity: O(n)\n    Space Complexity: O(n)\n    \"\"\"\n    if memo is None:\n        memo = {0: 0, 1: 1}\n    \n    if n < 0:\n        raise ValueError(\"n must be a non-negative integer.\")\n    \n    if n in memo:\n        return memo[n]\n    \n    memo[n] = fibonacci_memo(n - 1, memo) + fibonacci_memo(n - 2, memo)\n    return memo[n]\n\n# Example usage:\nif __name__ == '__main__':\n    print([fibonacci_memo(i) for i in range(10)])\n    # Output: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]\n```"
    },
    {
        "instruction": "A train leaves Station A at 60 mph. Another train leaves Station B towards Station A at 90 mph. The stations are 300 miles apart. When and where do they meet?",
        "reasoning": "1. Relative speed calculation: Both trains move towards each other, so relative velocity = 60 + 90 = 150 mph.\n2. Total distance = 300 miles.\n3. Time to meet: t = Distance / Relative Speed = 300 / 150 = 2 hours.\n4. Distance from Station A = 60 mph * 2 hours = 120 miles.\n5. Distance from Station B = 90 mph * 2 hours = 180 miles.",
        "response": "### Step-by-Step Solution:\n\n1. **Calculate Relative Speed**:\n   Since the trains travel toward each other, their speeds add up:\n   $$\\text{Relative Speed} = 60\\text{ mph} + 90\\text{ mph} = 150\\text{ mph}$$\n\n2. **Calculate Time until Meeting**:\n   $$\\text{Time} = \\frac{\\text{Total Distance}}{\\text{Relative Speed}} = \\frac{300\\text{ miles}}{150\\text{ mph}} = 2\\text{ hours}$$\n\n3. **Calculate Meeting Point**:\n   - Distance from Station A: $60\\text{ mph} \\times 2\\text{ hours} = \\mathbf{120\\text{ miles}}$\n   - Distance from Station B: $90\\text{ mph} \\times 2\\text{ hours} = \\mathbf{180\\text{ miles}}$\n\n**Conclusion**: The trains meet after **2 hours**, **120 miles** away from Station A."
    }
]

# DeepSeek-R1 Distill ChatML formatting function
def format_prompts(batch):
    formatted_texts = []
    for inst, reason, resp in zip(batch["instruction"], batch["reasoning"], batch["response"]):
        # DeepSeek-R1 reasoning template with <think> blocks
        text = f"<｜User｜>{inst}<｜Assistant｜><think>\n{reason}\n</think>\n{resp}<｜end of sentence｜>"
        formatted_texts.append(text)
    return {"text": formatted_texts}

raw_dataset = Dataset.from_list(sample_data)
train_dataset = raw_dataset.map(format_prompts, batched=True)
print(f"📊 Dataset prepared with {len(train_dataset)} examples.")
print("Sample Prompt Formatted:\n", train_dataset[0]["text"])

# =============================================================================
# 5. SFT TRAINER CONFIGURATION & EXECUTION
# =============================================================================
from trl import SFTTrainer
from transformers import TrainingArguments
from unsloth import is_bfloat16_supported

trainer = SFTTrainer(
    model = model,
    tokenizer = tokenizer,
    train_dataset = train_dataset,
    dataset_text_field = "text",
    max_seq_length = max_seq_length,
    dataset_num_proc = 2,
    packing = False, # Set to True for massive multi-sample sequence packing
    args = TrainingArguments(
        per_device_train_batch_size = 2,
        gradient_accumulation_steps = 4,
        warmup_steps = 5,
        max_steps = 60,                # Set to 100-500+ for large custom datasets
        learning_rate = 2e-4,
        fp16 = not is_bfloat16_supported(),
        bf16 = is_bfloat16_supported(),
        logging_steps = 5,
        optim = "adamw_8bit",
        weight_decay = 0.01,
        lr_scheduler_type = "linear",
        seed = 3407,
        output_dir = "outputs",
        report_to = "none"             # or 'tensorboard' / 'wandb'
    ),
)

print("🚀 Starting Fine-Tuning...")
trainer_stats = trainer.train()
print("🎉 Fine-Tuning Completed Successfully!")

# =============================================================================
# 6. IN-NOTEBOOK INFERENCE TEST
# =============================================================================
FastLanguageModel.for_inference(model) # Activates 2x faster native inference

test_prompt = "<｜User｜>Who are you?<｜Assistant｜><think>\n"
inputs = tokenizer([test_prompt], return_tensors = "pt").to("cuda")

outputs = model.generate(
    input_ids = inputs.input_ids,
    attention_mask = inputs.attention_mask,
    max_new_tokens = 256,
    use_cache = True,
    temperature = 0.6,
    top_p = 0.95
)
response = tokenizer.batch_decode(outputs)
print("\n🤖 KritiAi Test Output:\n", response[0])

# =============================================================================
# 7. SAVE & PUSH TO HUGGING FACE HUB
# =============================================================================
HF_USERNAME = "your-hf-username"       # <-- Replace with your Hugging Face username
HF_REPO_NAME = f"{HF_USERNAME}/KritiAi"
HF_TOKEN = "hf_your_huggingface_write_token_here" # <-- Replace with HF Write Token

# 1. Save LoRA Adapters locally
model.save_pretrained("KritiAi_LoRA")
tokenizer.save_pretrained("KritiAi_LoRA")
print("💾 LoRA Adapters saved to ./KritiAi_LoRA")

# 2. Push LoRA Adapters to Hugging Face Hub
print(f"☁️ Uploading LoRA Adapters to Hugging Face: {HF_REPO_NAME}...")
model.push_to_hub(HF_REPO_NAME, token = HF_TOKEN)
tokenizer.push_to_hub(HF_REPO_NAME, token = HF_TOKEN)
print(f"✅ LoRA Adapters published: https://huggingface.co/{HF_REPO_NAME}")

# 3. (Optional & Recommended) Export directly to GGUF for Ollama / Local Run!
# This allows 1-click local download via `ollama run hf.co/your-username/KritiAi-GGUF`
# model.push_to_hub_gguf(
#     f"{HF_REPO_NAME}-GGUF",
#     tokenizer,
#     quantization_method = ["q4_k_m", "q8_0"],
#     token = HF_TOKEN
# )
