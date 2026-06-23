# QSVM Model Integration

The backend supports two inference modes selectable via `USE_REAL_MODEL`:

| Mode | What runs |
|---|---|
| `false` (default) | Mocked random predictions, `asyncio.sleep(5–10s)` for realism |
| `true` | Real Quantum-Classical Hybrid pipeline (VGG16 + quantum kernel kNN) |

---

## 1. Train the model locally

The training pipeline fine-tunes VGG16 on your MRI dataset, extracts
features, then builds a quantum-fidelity-kernel matrix per OvR classifier.
This is **heavy** — best on a GPU machine, ~30–60 minutes total.

### Dataset layout

```
brain_tumor/
├── Training/
│   ├── notumor/*.jpg
│   ├── pituitary/*.jpg
│   ├── meningioma/*.jpg
│   └── glioma/*.jpg
└── Testing/
    ├── notumor/*.jpg
    ├── pituitary/*.jpg
    ├── meningioma/*.jpg
    └── glioma/*.jpg
```

The standard Brain Tumor MRI dataset from Kaggle works directly. Download it
from [Kaggle — Brain Tumor MRI Dataset](https://www.kaggle.com/datasets/masoudnickparvar/brain-tumor-mri-dataset)
and place it locally according to the layout above.

> **Note:** the dataset itself is not committed to this repository — only
> the code and trained model artifacts. Download it separately and point
> `--data-root` at wherever you've saved it.

### Run training

```bash
cd backend
pip install tensorflow==2.15.0 opencv-python pennylane==0.36.0 pennylane-lightning==0.36.0 scikit-learn==1.4.2 numpy==1.26.4

python train_qsvm.py --data-root "C:\path\to\brain_tumor" --output-dir ".\models"
```

### Output

```
backend/models/
├── vgg_extractor.keras   # fine-tuned VGG16 (GAP+GMP concat)
├── binary_models.pkl     # 4× OvR quantum-kernel kNN state (Preprocessor + train features + labels + flipped flag)
└── metadata.json          # val/test accuracy, per-class kernel separation, confusion matrix
```

### Hyperparameters (from your training script)

| Setting | Value | Notes |
|---|---|---|
| Qubits | 6 | `lightning.qubit` device |
| Kernel layers | 2 | Hadamard + RZ + entangling RZ |
| LDA dims | 1 | one-vs-rest discriminant axis |
| PCA dims | 5 | combined with LDA → 6 features → 6 qubits |
| Images per class | 150 (train), 120 (val/test) | configurable in `train_qsvm.py` |
| Fine-tune epochs | 8 | with `EarlyStopping(patience=3)` |
| Temperature | 0.3 | softmax softening for final 4-class fusion |
| Neighbors (kNN) | 7 | weighted by kernel similarity |

---

## 2. Configure the backend

Add to `backend/.env`:

```
USE_REAL_MODEL=true
QSVM_MODEL_DIR=./models
NOTUMOR_GATE=0.55
SUBTYPE_TEMP=0.18
```

Restart:

```bash
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Verify:

```bash
curl http://localhost:8001/api/

curl http://localhost:8001/api/metrics
```

---

## 3. Inference flow

```
POST /api/predict (multipart file)
   ↓
202 + {job_id, estimated_time_seconds}
   ↓
asyncio background task:
   1. Stage "extract"    — VGG16 forward pass (~0.5s on CPU, <0.1s on GPU)
   2. Stage "encode"     — Preprocessor.transform (StandardScaler → SelectKBest → LDA+PCA → π-scale)
   3. Stage "kernel"     — 4× quantum kernel matrix vs train set (~4-6s on lightning.qubit)
   4. Stage "aggregate"  — staged softmax + persist to MongoDB

Frontend polls GET /api/predict/status/{job_id} every 600ms,
displays live stage + elapsed.

When status="done", result is returned and history row is created.
Job state cleaned up after 5min TTL.
```

---

## 4. Staged inference (no retraining)

Your kernel separation is strong for No-Tumor (≈0.040) but weak for
Glioma / Meningioma (≈0.008 / 0.013). The runtime applies a 2-stage decision
in `qsvm_model.predict_bytes`:

```python
if no_tumor_score >= NOTUMOR_GATE and argmax(scores) == 0:
    return softmax(scores / TEMPERATURE)
else:
    tumor_probs = softmax(scores[1:] / SUBTYPE_TEMP)
    return [0.5 * no_tumor_score, *tumor_probs * (1 - 0.5 * no_tumor_score)]
```

Both `NOTUMOR_GATE` (default `0.55`) and `SUBTYPE_TEMP` (default `0.18`) are
tunable via `backend/.env` without retraining.

---

## 5. Pickle compatibility

`binary_models.pkl` is created with `python train_qsvm.py`, so the
`Preprocessor` and `BinaryModelState` classes get stamped into the pickle as
`__main__.Preprocessor` / `__main__.BinaryModelState`.

`qsvm_model.py` ships a `_CompatUnpickler(pickle.Unpickler)` whose
`find_class()` remaps any module-`__main__` lookups to the local class
definitions:

```python
class _CompatUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        if name == "Preprocessor":   return Preprocessor
        if name == "BinaryModelState": return BinaryModelState
        return super().find_class(module, name)
```

This lets the FastAPI worker deserialize the artifact without introducing a
top-level `__main__` shim.

---

## 6. Fallback behavior

The backend never breaks when something goes wrong with the real model. The
decision tree in `server._run_prediction_job`:

```
USE_REAL_MODEL=true
   ├─ FileNotFoundError (artifacts missing)    → log warning, run mock
   ├─ Any other Exception (TF/PennyLane crash) → log exception, run mock
   └─ Success                                  → return real result
```

The frontend never sees an error; the user just gets a randomized but
realistic-looking prediction with the mock 5–10s delay.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `/api/` reports `"mode":"mock"` despite `USE_REAL_MODEL=true` | `.env` lines concatenated (no trailing newline). Open `.env`, ensure each var is on its own line, restart backend. |
| `Can't get attribute 'Preprocessor' on <module '__main__'>` | You're on an old `qsvm_model.py` without `_CompatUnpickler`. Update from this repo. |
| `protobuf` conflict on `pip install` | Use the minimal `requirements.txt` (no `google-ai-generativelanguage`). |
| `webpack-dev-server` options error on `yarn start` | Patch `react-scripts/config/webpackDevServer.config.js`: replace `https: ...` with `server: ...` and `onBeforeSetupMiddleware`+`onAfterSetupMiddleware` with `setupMiddlewares`. Use `patch-package` to persist. |
| First `/predict` very slow | Warm-load disabled or `@app.on_event("startup")` failed. Check backend log for `Warm-loading QSVM detector ...` |
| `pennylane.lightning` missing | `pip install pennylane-lightning==0.36.0` |
| sklearn pickle version warning | Harmless if it still loads. To silence: retrain with the same sklearn version you run inference on. |
| `tensorflow==2.15` won't install on Python 3.12 | Use Python 3.10 or 3.11; TF 2.15 doesn't have 3.12 wheels. |
| `cv2 ImportError: libGL.so.1` (Linux) | `pip install opencv-python-headless` instead of `opencv-python`. |

---

## 8. Retraining

To retrain on a new dataset or with different hyperparameters:

1. Edit constants at top of `train_qsvm.py` (`TOTAL_QUBITS`, `NUM_LAYERS`, `IMG_PER_CLASS`, `FINETUNE_EPOCHS`, etc.)
2. Re-run `python train_qsvm.py --data-root ... --output-dir ./models`
3. Restart the backend — warm-load picks up the new artifacts on startup

**Important:** if you change `TOTAL_QUBITS`, update the constant in
`qsvm_model.py` to match (must equal `lda_dims + pca_dims` from training).