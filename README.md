# QSVM-NeuroDx

A quantum-classical hybrid system for brain tumor classification from MRI
scans, combining a fine-tuned VGG16 feature extractor with quantum kernel
Support Vector Machines (QSVM) built on PennyLane's ZZFeatureMap.

The model classifies MRI scans into four categories: **No Tumor, Pituitary,
Meningioma, Glioma**, and returns a confidence-scored diagnosis through a
React dashboard.

---

## How it works

```
MRI scan (224x224 RGB)
        │
        ▼
Fine-tuned VGG16 (block4/block5 unfrozen) → 1024-dim feature vector
        │
        ▼
Preprocessing: StandardScaler → SelectKBest (MI) → LDA + PCA → 6-dim vector
        │
        ▼
One-vs-Rest decomposition into 4 binary problems
        │
        ▼
6-qubit ZZFeatureMap quantum kernel (PennyLane, lightning.qubit)
        │
        ▼
4 × SVC(kernel='precomputed') binary classifiers
        │
        ▼
Temperature-scaled softmax aggregation → diagnosis + confidence score
```

---

## Features

- **Drag-and-drop MRI upload** with live preview (JPG/PNG)
- **Background-task inference** — `POST /api/predict` returns instantly
  with a `job_id`; the frontend polls `/api/predict/status/{job_id}` and
  shows server-driven stage transitions (Extracting → Encoding →
  Computing kernel → Aggregating) with live elapsed timer
- **Animated results panel** — circular confidence gauge, horizontal
  probability bars, low-confidence radiologist-review warning < 60%
- **Model Insights** — confusion matrix heatmap, per-class kernel
  separation bars, accuracy stats from the trained `metadata.json`
- **Scan history** — MongoDB-backed table with class filters, per-row
  delete, PDF and DICOM downloads
- **PDF report** — one-page A4 with MRI thumbnail, diagnosis, confidence,
  probability distribution, timing footer
- **DICOM Secondary Capture export** — `.dcm` file with embedded 512×512
  MRI + standard tags (PatientID, SeriesDescription, ImageComments,
  DerivationDescription) + private 0x0099 block carrying diagnosis,
  confidence, low-conf flag, inference time
- **Staged inference** — runtime gating on No-Tumor OvR score to sharpen
  tumor-subtype discrimination without retraining

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, react-router-dom, Tailwind CSS, lucide-react, sonner |
| Backend | FastAPI, Motor (async MongoDB), uvicorn |
| ML | TensorFlow 2.15, PennyLane 0.36 (lightning.qubit), scikit-learn 1.4, OpenCV |
| Reports | reportlab (PDF), pydicom (DICOM SC) |
| Database | MongoDB 6+ |

---

## Prerequisites

- **Python 3.10+** (3.11 recommended)
- **Node.js 18+** (LTS) and **Yarn**
- **MongoDB 6+** running on `localhost:27017` (native install OR Docker)
- Trained model artifacts in `backend/models/` (see `backend/README_MODEL.md`)

---

## Project structure

```
qsvm-neurodx/
├── backend/
│   ├── server.py             # FastAPI app + job queue
│   ├── qsvm_model.py         # Inference detector (lazy TF/PennyLane imports)
│   ├── train_qsvm.py         # Local training script
│   ├── pdf_report.py         # reportlab PDF builder
│   ├── dicom_export.py       # pydicom Secondary Capture builder
│   ├── requirements.txt
│   ├── .env                  # MONGO_URL, USE_REAL_MODEL, etc.
│   ├── README_MODEL.md
│   └── models/                # trained artifacts
└── frontend/
    ├── package.json
    ├── craco.config.js
    ├── tailwind.config.js
    ├── .env                   # REACT_APP_BACKEND_URL
    └── src/
        ├── App.js
        ├── pages/             # DashboardPage, InsightsPage, HistoryPage
        ├── components/        # UploadZone, ProcessingOverlay, ResultsPanel, ...
        └── lib/               # api.js, quantum.js
```

---

## Setup

### 1. Backend

```bash
cd backend
python -m venv venv

venv\Scripts\activate

pip install --upgrade pip
pip install -r requirements.txt
```

Create `backend/.env`:

```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="qsvm_neurodx"
CORS_ORIGINS="*"
USE_REAL_MODEL=true
QSVM_MODEL_DIR=./models
NOTUMOR_GATE=0.55
SUBTYPE_TEMP=0.18
```

### 2. Frontend

```bash
cd frontend
yarn install
```

Create `frontend/.env`:

```
REACT_APP_BACKEND_URL=http://localhost:8001
```

### 3. MongoDB

**Docker (easiest):**

```bash
docker run -d --name qsvm-mongo -p 27017:27017 mongo:7
```

**Native:** install MongoDB Community Server and let it run as a service.

### 4. Trained model artifacts

Place these three files in `backend/models/`:

- `vgg_extractor.keras` (~57 MB)
- `binary_models.pkl`
- `metadata.json`

If you don't have them yet, see `backend/README_MODEL.md` to train them.

If artifacts are missing, the backend automatically falls back to a mocked
inference pipeline so the UI stays functional.

---

## Running

Open two terminals.

**Terminal 1 — backend:**

```bash
cd backend
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Watch for `QSVM detector ready.` then `Application startup complete.`

**Terminal 2 — frontend:**

```bash
cd frontend
yarn start
```

Open [http://localhost:3000](http://localhost:3000)

**Verify the wiring:**

```bash
curl http://localhost:8001/api/
# {"service":"QSVM Brain Tumor Detection","status":"ok","mode":"real"}
```

---

## API reference

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/` | Health + mode (`real`\|`mock`) |
| POST | `/api/predict` | Submit MRI, returns `202` + `{job_id, estimated_time_seconds}` |
| GET | `/api/predict/status/{job_id}` | Live `{status, stage_idx, elapsed_seconds, estimated_time_seconds, result, error}` |
| GET | `/api/metrics` | Trained metadata (val acc, kernel separation, confusion matrix) |
| GET | `/api/history` | Past scans (newest first) |
| GET | `/api/history/{id}` | Single scan |
| DELETE | `/api/history/{id}` | Remove a scan (404 on missing) |
| GET | `/api/history/{id}/report.pdf` | PDF diagnosis report |
| GET | `/api/history/{id}/report.dcm` | DICOM Secondary Capture |

---

## Environment variables

| Var | Default | Effect |
|---|---|---|
| `MONGO_URL` | — | Mongo connection string |
| `DB_NAME` | — | Database name |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `USE_REAL_MODEL` | `false` | Load trained QSVM. Falls back to mock if artifacts missing or load fails |
| `QSVM_MODEL_DIR` | `./models` | Folder containing the three artifacts |
| `NOTUMOR_GATE` | `0.55` | If No-Tumor OvR score < this, switch to staged tumor-subtype inference |
| `SUBTYPE_TEMP` | `0.18` | Softmax temperature for tumor-subtype stage (smaller = sharper) |

---

## Disclaimer

This is a research preview. Quantum kernels remain an open research area, do
not use this system for clinical decisions. Always refer to a qualified
radiologist.
