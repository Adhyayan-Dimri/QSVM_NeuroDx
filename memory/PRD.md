# QSVM NeuroDx — Quantum-Classical Brain Tumor Detection Dashboard

## Original Problem Statement
Modern clinical-grade web dashboard for a Quantum-Classical Hybrid Brain Tumor Detection
System. Frontend connects to a backend API that returns MRI tumor classification results
from a QSVM (Quantum Support Vector Machine) pipeline.

## User Choices (locked)
- Backend mock by default; **env-gated real-model swap** (`USE_REAL_MODEL=true`) for user's actual QSVM/VGG16 pipeline
- Auth: none
- History: MongoDB persistence
- Image storage: base64 inside MongoDB
- Theme: deep navy + violet/teal quantum aesthetic
- PDF diagnosis report export

## Architecture
- **Backend** (`/app/backend/`):
  - `server.py` — FastAPI: `POST /api/predict`, `GET /api/metrics`, `GET /api/history`,
    `GET /api/history/{id}`, `DELETE /api/history/{id}` (404 on unknown id),
    `GET /api/history/{id}/report.pdf` (reportlab PDF)
  - `qsvm_model.py` — inference-only wrapper around the user's Detector
    (VGG16 features → 4× OvR quantum-fidelity-kernel kNN classifiers).
    Lazy-imports tensorflow/pennylane/cv2 so the API works without them
    when running in mock mode.
  - `train_qsvm.py` — user's training pipeline, refactored for portability,
    saves `models/{vgg_extractor.keras, binary_models.pkl, metadata.json}`.
  - `pdf_report.py` — reportlab one-pager (MRI thumbnail, diagnosis, confidence
    bar, 4-class probability bars, low-confidence warning, footer disclaimer).
    Hardened against truncated JPEGs.
  - `README_MODEL.md` — step-by-step on training locally and switching real-model on.
- **Frontend** (`/app/frontend/src`): React 19, react-router, Sonner toasts,
  Manrope + IBM Plex Sans + JetBrains Mono.

## Implemented (latest)
- **2026-02-22 / iteration 1**: Full MVP — upload, processing overlay, confidence gauge, probability bars, low/high-confidence badge, Model Insights, History with filter + delete.
- **2026-02-22 / iteration 2**: Real-model integration (USE_REAL_MODEL env switch), PDF report export, 404 on unknown delete.
- **2026-02-22 / iteration 3**: DICOM Secondary Capture export (pydicom + private 0x0099 block), server-side 512px MRI downscale before storing.
- **2026-06-22 / iteration 4 (real model deployed)**: Pulled trained artifacts from user's Google Drive into `/app/backend/models/` (val_acc 81.67%, 6 qubits, 480 train samples). Installed runtime libs (tensorflow 2.21, keras 3.14, pennylane 0.45 + lightning, opencv-python-headless 4.13, scikit-learn 1.9). Added `_CompatUnpickler` to load `binary_models.pkl` produced from `__main__` scope. Verified end-to-end: real QSVM inference returns ~7s per scan with correct probability distribution.
- **2026-06-22 / iteration 5 (scaling + accuracy)**:
  - **Background-task pattern**: `POST /api/predict` now returns 202 + `{job_id, estimated_time_seconds}` immediately. `GET /api/predict/status/{job_id}` returns live `{status, stage_idx, elapsed_seconds, estimated_time_seconds, result, error}`. Job state kept in-memory with 5-min TTL cleanup. Frontend `runPrediction()` polls every 600ms and updates the ProcessingOverlay's stage + elapsed from the server.
  - **Warm-load on startup**: `@app.on_event("startup")` calls `get_detector()` so TF + the quantum kernel circuit are loaded before the first request. Verified in logs.
  - **Staged inference (No-Tumor gate)**: in `qsvm_model.predict_bytes`, if the No-Tumor OvR score clears `NOTUMOR_GATE` (default 0.55) AND is the argmax, return the standard softmax; otherwise re-softmax over only the 3 tumor classes with a sharper temperature `SUBTYPE_TEMP` (default 0.18) — addresses the weak Glioma/Meningioma kernel separation reported in metadata.json. Both gates are env-tunable without retraining.

## Backlog
- P2: Replace deprecated FastAPI `@app.on_event` with `lifespan` handler
- P2: Multi-scan batch upload
- P2: Per-clinician auth + audit log
- P2: PACS C-STORE push via `pynetdicom`
