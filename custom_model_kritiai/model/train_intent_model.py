"""
Kriti AI - Intent Router Training Pipeline
Phase 1: PyTorch / HuggingFace Trainer for Lightweight On-Device or Cloud Classifier
"""

import os
import torch
from torch.utils.data import Dataset
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments

# Synthetic bootstrap dataset mapping user prompts to execution tiers
TRAINING_DATA = [
    # 0: LOCAL_FAST (Ollama 3B/7B fast chat)
    ("Hello, what is the weather like today?", 0),
    ("Tell me a quick joke about programmers.", 0),
    ("Explain the concept of recursion in simple words.", 0),
    ("What are the primary colors?", 0),
    ("Translate 'good morning' into French.", 0),
    ("Who was Alan Turing?", 0),

    # 1: CODE_AUTONOMOUS (Autonomous Coder / Refactoring)
    ("Refactor this React hook to use useMemo and useCallback.", 1),
    ("Fix the TypeError: Cannot read property 'map' of undefined in this file.", 1),
    ("Implement an automated unit test suite using Jest for auth.controller.ts.", 1),
    ("Build a REST API endpoint in FastAPI with Pydantic validation.", 1),
    ("Debug this memory leak in the Node.js WebSocket gateway.", 1),
    ("Write a Dockerfile multi-stage build for a Rust WebAssembly project.", 1),

    # 2: SYSTEM_ACTION (OpenClaw-style Personal Assistant Actions)
    ("Send an email to team@company.com with the weekly progress report.", 2),
    ("Check my Google Calendar for meetings scheduled after 3 PM.", 2),
    ("Open Chrome, search for the latest arXiv papers on LLM agents, and summarize them.", 2),
    ("Organize all .pdf files in my Downloads folder into a Documents/Receipts folder.", 2),
    ("Set a reminder for my dentist appointment tomorrow at 10 AM.", 2),
    ("Read my unread Slack messages and flag any urgent requests.", 2),

    # 3: COMPLEX_REASONING (High-tier Cloud / Colab GPU)
    ("Design a distributed event-driven microservices architecture for 1M QPS with disaster recovery.", 3),
    ("Formulate a mathematical proof for the convergence rate of this gradient descent variant.", 3),
    ("Analyze this 5000-line kernel crash dump and find the root cause across threads.", 3),
    ("Perform a deep multi-agent game-theoretic analysis of market liquidity.", 3)
]

class PromptIntentDataset(Dataset):
    def __init__(self, data, tokenizer, max_len=128):
        self.data = data
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        text, label = self.data[idx]
        encoding = self.tokenizer(
            text,
            truncation=True,
            padding="max_length",
            max_length=self.max_len,
            return_tensors="pt"
        )
        return {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
            "labels": torch.tensor(label, dtype=torch.long)
        }

def train_and_export():
    model_name = "distilbert-base-uncased"
    output_dir = "./kritiai_intent_model"
    
    print(f"[Training] Initializing tokenizer and base model '{model_name}'...")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=4)

    dataset = PromptIntentDataset(TRAINING_DATA, tokenizer)

    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=5,
        per_device_train_batch_size=4,
        logging_steps=5,
        save_strategy="epoch",
        learning_rate=3e-5,
        weight_decay=0.01,
        report_to="none"
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=dataset
    )

    print("[Training] Starting fine-tuning...")
    trainer.train()

    print(f"[Export] Saving fine-tuned KritiAi model to {output_dir}...")
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    print("[Export] Complete! Ready for deployment on Colab, HF Spaces, or Local Engine.")

if __name__ == "__main__":
    train_and_export()
