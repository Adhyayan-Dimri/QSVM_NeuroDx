"""Backend tests for QSVM Brain Tumor Detection API."""
import io
import os
import time
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    # Fallback - read from frontend .env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

API = f"{BASE_URL}/api"
CLASSES = {"No Tumor", "Pituitary", "Meningioma", "Glioma"}


@pytest.fixture(scope="module")
def jpg_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), color=(120, 120, 120)).save(buf, format="JPEG")
    return buf.getvalue()


# Health
def test_root():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"
    assert "service" in data
    assert data.get("mode") in ("mock", "real")
    # USE_REAL_MODEL not set -> should be 'mock'
    assert data.get("mode") == "mock"


# Metrics
def test_metrics_shape():
    r = requests.get(f"{API}/metrics", timeout=10)
    assert r.status_code == 200
    d = r.json()
    assert 0 <= d["validation_accuracy"] <= 1
    assert 0 <= d["test_accuracy"] <= 1
    assert set(d["per_class_kernel_separation"].keys()) == CLASSES
    cm = d["confusion_matrix"]
    assert cm["labels"] == ["No Tumor", "Pituitary", "Meningioma", "Glioma"]
    assert len(cm["matrix"]) == 4 and all(len(r) == 4 for r in cm["matrix"])
    assert "confidence_distribution" in d
    assert "training" in d and "n_qubits" in d["training"]


# Predict happy path
def test_predict_valid_image(jpg_bytes):
    start = time.time()
    files = {"file": ("scan.jpg", jpg_bytes, "image/jpeg")}
    r = requests.post(f"{API}/predict", files=files, timeout=30)
    elapsed = time.time() - start
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["diagnosis"] in CLASSES
    assert 0 <= d["confidence"] <= 1
    assert set(d["probabilities"].keys()) == CLASSES
    assert abs(sum(d["probabilities"].values()) - 1.0) < 0.05
    assert isinstance(d["low_confidence_warning"], bool)
    assert d["low_confidence_warning"] == (d["confidence"] < 0.60)
    assert d["inference_time_seconds"] >= 4.5
    assert "estimated_time_seconds" in d and "timestamp" in d and d["id"]
    # Simulated latency should be at least ~4.5s
    assert elapsed >= 4.0, f"Inference too fast: {elapsed:.2f}s"
    pytest.created_scan_id = d["id"]


def test_predict_rejects_non_image():
    files = {"file": ("a.txt", b"hello world", "text/plain")}
    r = requests.post(f"{API}/predict", files=files, timeout=15)
    assert r.status_code == 400


def test_predict_rejects_empty():
    files = {"file": ("empty.jpg", b"", "image/jpeg")}
    r = requests.post(f"{API}/predict", files=files, timeout=15)
    assert r.status_code == 400


# History
def test_history_contains_scan():
    r = requests.get(f"{API}/history", timeout=10)
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list) and len(arr) >= 1
    item = arr[0]
    for k in ("id", "thumbnail_url", "diagnosis", "confidence", "timestamp", "inference_time_seconds"):
        assert k in item, f"missing {k}"
    assert item["thumbnail_url"].startswith("data:image/")


def test_delete_history_item(jpg_bytes):
    sid = getattr(pytest, "created_scan_id", None)
    if not sid:
        pytest.skip("no scan id")
    # Pre: download PDF for this scan first (so we exercise low_confidence variant if any)
    r_pdf = requests.get(f"{API}/history/{sid}/report.pdf", timeout=15)
    assert r_pdf.status_code == 200
    assert r_pdf.headers["content-type"].startswith("application/pdf")
    assert len(r_pdf.content) >= 1024
    cd = r_pdf.headers.get("content-disposition", "")
    assert "attachment" in cd.lower()
    assert sid[:8] in cd

    before = len(requests.get(f"{API}/history", timeout=10).json())
    r = requests.delete(f"{API}/history/{sid}", timeout=10)
    assert r.status_code == 200
    assert r.json().get("deleted") == 1
    after = len(requests.get(f"{API}/history", timeout=10).json())
    assert after == before - 1
    # Subsequent GET by id => 404
    r2 = requests.get(f"{API}/history/{sid}", timeout=10)
    assert r2.status_code == 404


def test_delete_unknown_returns_404():
    r = requests.delete(f"{API}/history/does-not-exist-xyz", timeout=10)
    assert r.status_code == 404


def test_report_pdf_unknown_returns_404():
    r = requests.get(f"{API}/history/does-not-exist-xyz/report.pdf", timeout=10)
    assert r.status_code == 404


def test_report_pdf_low_confidence_variant(jpg_bytes):
    """Force-create a scan, patch DB document low_confidence_warning, then fetch PDF."""
    # Create a scan
    files = {"file": ("low.jpg", jpg_bytes, "image/jpeg")}
    r = requests.post(f"{API}/predict", files=files, timeout=30)
    assert r.status_code == 200
    sid = r.json()["id"]
    # We can't toggle DB directly here; just verify the PDF endpoint works regardless of warning state.
    rp = requests.get(f"{API}/history/{sid}/report.pdf", timeout=15)
    assert rp.status_code == 200
    assert rp.headers["content-type"].startswith("application/pdf")
    assert len(rp.content) >= 1024
    # Cleanup
    requests.delete(f"{API}/history/{sid}", timeout=10)
