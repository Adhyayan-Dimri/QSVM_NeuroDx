from __future__ import annotations

import io
import json
import os
import pickle
import time
from pathlib import Path
from typing import List, Optional

import numpy as np

CLASS_NAMES = ["No Tumor", "Pituitary", "Meningioma", "Glioma"]
TOTAL_QUBITS = 6
NUM_LAYERS = 2
NUM_NEIGHBORS = 7
TEMPERATURE = 0.3
IMG_SIZE = 224

def _lazy():
    """Import the heavy stack only when actually doing inference."""
    import cv2
    import tensorflow as tf
    from tensorflow.keras.applications.vgg16 import preprocess_input
    import pennylane as qml
    return cv2, tf, preprocess_input, qml

class BinaryModelState:
    """Pickle-safe snapshot of one OvR quantum-kernel kNN classifier."""

    def __init__(self, cls: int, prep, train_data: np.ndarray,
                 train_labels: np.ndarray, flipped: bool,
                 separation: float, accuracy: float):
        self.cls = cls
        self.prep = prep  
        self.train_data = train_data
        self.train_labels = train_labels
        self.flipped = flipped
        self.separation = separation
        self.accuracy = accuracy


class Preprocessor:
    def __init__(self, cls: int = 0):
        from sklearn.preprocessing import StandardScaler
        from sklearn.feature_selection import SelectKBest, mutual_info_classif
        from sklearn.discriminant_analysis import LinearDiscriminantAnalysis as LDA
        from sklearn.decomposition import PCA
        self.cls = cls
        self.scaler = StandardScaler()
        self.selector = SelectKBest(mutual_info_classif, k=200)
        self.lda = LDA(n_components=1)
        self.pca = PCA(n_components=5, random_state=42)
        self.vmin = None
        self.vmax = None

    def transform(self, X):
        X = self.scaler.transform(X)
        X = self.selector.transform(X)
        xl = self.lda.transform(X)
        xp = self.pca.transform(X)
        out = np.hstack([xl, xp])
        rng = np.where(self.vmax - self.vmin == 0, 1, self.vmax - self.vmin)
        return np.clip(((out - self.vmin) / rng) * np.pi, 0, np.pi)


class _CompatUnpickler(pickle.Unpickler):
    """Remap legacy class paths so artefacts trained by `python train_qsvm.py`
    (which stamps `__main__.Preprocessor` into the pickle) load cleanly when
    deserialised from inside the FastAPI server process."""

    def find_class(self, module, name):
        if name == "Preprocessor":
            return Preprocessor
        if name == "BinaryModelState":
            return BinaryModelState
        return super().find_class(module, name)

class QSVMDetector:
    def __init__(self, artifact_dir: str | os.PathLike):
        self.artifact_dir = Path(artifact_dir)
        self._loaded = False
        self.extractor = None
        self.models: List[BinaryModelState] = []
        self.metadata: dict = {}
        self._qcircuit = None  

    def load(self) -> None:
        if self._loaded:
            return

        _, tf, _, qml = _lazy()

        vgg_path = self.artifact_dir / "vgg_extractor.keras"
        models_path = self.artifact_dir / "binary_models.pkl"
        meta_path = self.artifact_dir / "metadata.json"

        if not vgg_path.exists() or not models_path.exists():
            raise FileNotFoundError(
                f"QSVM artifacts not found at {self.artifact_dir}. "
                "Run `python backend/train_qsvm.py` locally to generate them, "
                "then copy `vgg_extractor.keras`, `binary_models.pkl`, "
                "`metadata.json` into this folder."
            )

        self.extractor = tf.keras.models.load_model(str(vgg_path), compile=False)
        with open(models_path, "rb") as f:
            self.models = _CompatUnpickler(f).load()
        if meta_path.exists():
            with open(meta_path) as f:
                self.metadata = json.load(f)

        device = qml.device("lightning.qubit", wires=TOTAL_QUBITS)

        @qml.qnode(device)
        def circuit(xa, xb):
            for _ in range(NUM_LAYERS):
                for i in range(TOTAL_QUBITS):
                    qml.Hadamard(wires=i)
                for i in range(TOTAL_QUBITS):
                    qml.RZ(2.0 * xa[i], wires=i)
                for i in range(TOTAL_QUBITS - 1):
                    qml.CNOT(wires=[i, i + 1])
                    qml.RZ(2.0 * (np.pi - xa[i]) * (np.pi - xa[i + 1]), wires=i + 1)
                    qml.CNOT(wires=[i, i + 1])
            for _ in range(NUM_LAYERS):
                for i in range(TOTAL_QUBITS - 2, -1, -1):
                    qml.CNOT(wires=[i, i + 1])
                    qml.RZ(-2.0 * (np.pi - xb[i]) * (np.pi - xb[i + 1]), wires=i + 1)
                    qml.CNOT(wires=[i, i + 1])
                for i in range(TOTAL_QUBITS):
                    qml.RZ(-2.0 * xb[i], wires=i)
                for i in range(TOTAL_QUBITS):
                    qml.Hadamard(wires=i)
            return qml.probs(wires=range(TOTAL_QUBITS))

        self._qcircuit = circuit
        self._loaded = True

    def predict_bytes(self, image_bytes: bytes) -> dict:
        if not self._loaded:
            self.load()

        cv2, _, preprocess_input, _ = _lazy()

        t0 = time.time()

        
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError("Could not decode image.")
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        rgb = cv2.resize(rgb, (IMG_SIZE, IMG_SIZE))
        batch = preprocess_input(np.expand_dims(rgb.astype(np.float32), 0))
        feat = self.extractor.predict(batch, verbose=0).flatten()

        
        raw = np.zeros(4, dtype=np.float64)
        for i, state in enumerate(self.models):
            raw[i] = self._score_one(state, feat)

        probs = _softmax(raw / TEMPERATURE)

        
        gate = float(os.environ.get("NOTUMOR_GATE", "0.55"))
        sub_temp = float(os.environ.get("SUBTYPE_TEMP", "0.18"))
        notumor_score = float(raw[0])
        if notumor_score >= gate and int(np.argmax(raw)) == 0:
            pass
        else:
            tumor_raw = raw[1:]
            tumor_probs = _softmax(tumor_raw / sub_temp)
            
            new = np.empty(4, dtype=np.float64)
            new[0] = notumor_score * 0.5 
            tumor_mass = 1.0 - new[0]
            new[1:] = tumor_probs * tumor_mass
            new = new / new.sum()
            probs = new

        pred = int(np.argmax(probs))
        conf = float(probs[pred])

        elapsed = round(time.time() - t0, 2)

        return {
            "diagnosis": CLASS_NAMES[pred],
            "confidence": conf,
            "probabilities": {CLASS_NAMES[i]: float(probs[i]) for i in range(4)},
            "low_confidence_warning": conf < 0.60,
            "inference_time_seconds": elapsed,
            "estimated_time_seconds": int(max(5, round(elapsed))),
        }

    
    def _score_one(self, state: BinaryModelState, feature_vec: np.ndarray) -> float:
        x_t = state.prep.transform(feature_vec.reshape(1, -1))
        K = np.array(
            [self._kernel(x_t[0], train_row) for train_row in state.train_data]
        )
        if state.flipped:
            K = 1.0 - K
        idx = np.argsort(-K)[:NUM_NEIGHBORS]
        sims = K[idx]
        labels = state.train_labels[idx]
        total = sims.sum()
        if total < 1e-10:
            return 0.5
        w = sims / total
        return float(w[labels == 1].sum())

    def _kernel(self, a: np.ndarray, b: np.ndarray) -> float:
        if np.allclose(a, b, atol=1e-8):
            return 1.0
        return float(self._qcircuit(a, b)[0])


def _softmax(x: np.ndarray) -> np.ndarray:
    x = x - x.max()
    e = np.exp(x)
    return e / e.sum()


_DETECTOR: Optional[QSVMDetector] = None


def get_detector() -> QSVMDetector:
    """Return a lazily-loaded singleton detector pointing at MODEL_DIR."""
    global _DETECTOR
    if _DETECTOR is None:
        model_dir = os.environ.get("QSVM_MODEL_DIR", "/app/backend/models")
        _DETECTOR = QSVMDetector(model_dir)
        _DETECTOR.load()
    return _DETECTOR
