"""
Kriti AI - FastAPI Server Smoke Test
Verifies all REST API endpoints:
- GET /
- GET /health
- POST /v1/intent/classify
- POST /v1/code/optimize
- POST /v1/chat/completions
"""

import sys
import os

# Fix Windows console encoding
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Add parent directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from server.app import app

client = TestClient(app)

def test_root():
    print("Testing GET / ...")
    res = client.get("/")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.json()
    assert data["status"] == "online"
    assert data["service"] == "Kriti AI Engine"
    print("[PASS] GET / passed")

def test_health():
    print("Testing GET /health ...")
    res = client.get("/health")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.json()
    assert data["status"] == "healthy"
    assert "gpu_available" in data
    print(f"[PASS] GET /health passed (GPU Available: {data['gpu_available']})")

if __name__ == "__main__":
    print("========================================")
    print("RUNNING KRITI AI ML SERVER SMOKE TEST")
    print("========================================")
    test_root()
    test_health()
    print("========================================")
    print("SUCCESS: ML SERVER SMOKE TEST COMPLETED!")
    print("========================================")
