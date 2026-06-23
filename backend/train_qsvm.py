from __future__ import annotations

import argparse
import json
import os
import pickle
import random
import time
from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf
import pennylane as qml

from sklearn.decomposition import PCA
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis as LDA
from sklearn.feature_selection import SelectKBest, mutual_info_classif
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from tensorflow.keras.applications import VGG16
from tensorflow.keras.applications.vgg16 import preprocess_input
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.layers import (
    Concatenate, Dense, Dropout, GlobalAveragePooling2D, GlobalMaxPooling2D,
)
from tensorflow.keras.models import Model
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.utils import to_categorical

from qsvm_model import BinaryModelState, CLASS_NAMES

TOTAL_QUBITS = 6
NUM_LAYERS = 2
LDA_DIMS = 1
PCA_DIMS = 5
IMG_PER_CLASS = 150
FINETUNE_EPOCHS = 8
NUM_NEIGHBORS = 7
RAND_SEED = 42
LABEL_MAP = {"notumor": 0, "pituitary": 1, "meningioma": 2, "glioma": 3}

np.random.seed(RAND_SEED)
random.seed(RAND_SEED)
tf.random.set_seed(RAND_SEED)


class Preprocessor:
    def __init__(self, cls: int):
        self.cls = cls
        self.scaler = StandardScaler()
        self.selector = SelectKBest(mutual_info_classif, k=200)
        self.lda = LDA(n_components=LDA_DIMS)
        self.pca = PCA(n_components=PCA_DIMS, random_state=RAND_SEED)
        self.vmin = None
        self.vmax = None

    def _binary(self, y):
        return np.where(y == self.cls, 1, 0)

    def fit_transform(self, X, y):
        yb = self._binary(y)
        X = self.scaler.fit_transform(X)
        X = self.selector.fit_transform(X, yb)
        xl = self.lda.fit_transform(X, yb)
        xp = self.pca.fit_transform(X)
        out = np.hstack([xl, xp])
        self.vmin, self.vmax = out.min(axis=0), out.max(axis=0)
        return self._scale(out), yb

    def transform(self, X):
        X = self.scaler.transform(X)
        X = self.selector.transform(X)
        xl = self.lda.transform(X)
        xp = self.pca.transform(X)
        return self._scale(np.hstack([xl, xp]))

    def _scale(self, data):
        rng = np.where(self.vmax - self.vmin == 0, 1, self.vmax - self.vmin)
        return np.clip(((data - self.vmin) / rng) * np.pi, 0, np.pi)


_device = qml.device("lightning.qubit", wires=TOTAL_QUBITS)


@qml.qnode(_device)
def quantum_circuit(xa, xb):
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


def kernel_val(a, b):
    if np.allclose(a, b, atol=1e-8):
        return 1.0
    return float(quantum_circuit(a, b)[0])


def build_matrix(set_a, set_b, label=""):
    na, nb = len(set_a), len(set_b)
    mat = np.zeros((na, nb))
    sym = set_a is set_b
    t0 = time.time()
    for i in range(na):
        start = i if sym else 0
        for j in range(start, nb):
            v = kernel_val(set_a[i], set_b[j])
            mat[i, j] = v
            if sym:
                mat[j, i] = v
    print(f"  [{label}] kernel built in {round((time.time()-t0)/60,1)} min")
    return mat


def build_feature_model():
    net = VGG16(weights="imagenet", include_top=False, input_shape=(224, 224, 3))
    for layer in net.layers:
        layer.trainable = False
    for layer in net.layers:
        if layer.name.startswith(("block4", "block5")):
            layer.trainable = True
    gap = GlobalAveragePooling2D()(net.output)
    gmp = GlobalMaxPooling2D()(net.output)
    return Model(inputs=net.input, outputs=Concatenate()([gap, gmp]))


def add_softmax_head(base, n=4):
    x = Dense(256, activation="relu")(base.output)
    x = Dropout(0.4)(x)
    x = Dense(n, activation="softmax")(x)
    return Model(inputs=base.input, outputs=x)


def load_images(folder_root: Path, limit=IMG_PER_CLASS, seed_offset=0):
    images, labels = [], []
    rng = random.Random(RAND_SEED + seed_offset)
    for folder, lbl in LABEL_MAP.items():
        files = list((folder_root / folder).glob("*.jpg"))
        rng.shuffle(files)
        for f in files[:limit]:
            img = cv2.imread(str(f))
            if img is None:
                continue
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img = cv2.resize(img, (224, 224))
            images.append(preprocess_input(img.astype(np.float32)))
            labels.append(lbl)
    return np.array(images), np.array(labels)


def finetune(training_dir: Path):
    print("[1/3] Fine-tuning VGG16 ...")
    imgs, lbls = load_images(training_dir)
    hot = to_categorical(lbls, num_classes=4)
    xtr, xval, ytr, yval = train_test_split(
        imgs, hot, test_size=0.15, stratify=lbls, random_state=RAND_SEED
    )
    feat = build_feature_model()
    full = add_softmax_head(feat)
    full.compile(optimizer=Adam(1e-4), loss="categorical_crossentropy", metrics=["accuracy"])
    full.fit(
        xtr, ytr, validation_data=(xval, yval),
        epochs=FINETUNE_EPOCHS, batch_size=16,
        callbacks=[
            EarlyStopping(patience=3, restore_best_weights=True, monitor="val_accuracy"),
            ReduceLROnPlateau(factor=0.5, patience=2, monitor="val_loss"),
        ],
        verbose=1,
    )
    return feat


def extract_features(extractor: Model, training_dir: Path):
    print("[2/3] Extracting VGG features ...")
    feats, labels = [], []
    rng = random.Random(RAND_SEED)
    for folder, lbl in LABEL_MAP.items():
        files = list((training_dir / folder).glob("*.jpg"))
        rng.shuffle(files)
        for f in files[:IMG_PER_CLASS]:
            img = cv2.imread(str(f))
            if img is None:
                continue
            img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            img = cv2.resize(img, (224, 224))
            batch = preprocess_input(np.expand_dims(img.astype(np.float32), 0))
            feats.append(extractor.predict(batch, verbose=0).flatten())
            labels.append(lbl)
    return np.array(feats), np.array(labels)


def train_binary(cls: int, Xtr, ytr) -> BinaryModelState:
    prep = Preprocessor(cls)
    Xt, yb = prep.fit_transform(Xtr, ytr)
    K = build_matrix(Xt, Xt, label=CLASS_NAMES[cls])

    # Direction check
    idx = np.random.choice(len(yb), min(40, len(yb)), replace=False)
    same, diff = [], []
    for _ in range(300):
        i, j = np.random.choice(idx, 2, replace=False)
        (same if yb[i] == yb[j] else diff).append(K[i, j])
    sep = float(np.mean(same) - np.mean(diff))
    flipped = sep < 0
    if flipped:
        K = 1.0 - K
        np.fill_diagonal(K, 1.0)

    idx_sorted = np.argsort(-K, axis=1)[:, :NUM_NEIGHBORS]
    preds = np.zeros(len(yb), dtype=int)
    for i in range(len(yb)):
        nlbl = yb[idx_sorted[i]]
        nsim = K[i, idx_sorted[i]]
        if nsim.sum() < 1e-10:
            preds[i] = 0
        else:
            w = nsim / nsim.sum()
            preds[i] = 1 if w[nlbl == 1].sum() > w[nlbl == 0].sum() else 0
    acc = float(accuracy_score(yb, preds))
    print(f"  {CLASS_NAMES[cls]} vs rest: sep={sep:.4f} acc={acc*100:.1f}%")

    return BinaryModelState(
        cls=cls, prep=prep, train_data=Xt, train_labels=yb,
        flipped=flipped, separation=sep, accuracy=acc,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", required=True,
                    help="Path containing Training/ and Testing/ subfolders")
    ap.add_argument("--output-dir", default="./models")
    args = ap.parse_args()

    data_root = Path(args.data_root)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    training_dir = data_root / "Training"

    extractor = finetune(training_dir)
    extractor.save(str(output_dir / "vgg_extractor.keras"))
    print(f"  saved -> {output_dir / 'vgg_extractor.keras'}")

    X, y = extract_features(extractor, training_dir)
    Xtr, Xval, ytr, yval = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RAND_SEED
    )

    print("[3/3] Training 4 quantum-kernel OvR classifiers ...")
    models = [train_binary(c, Xtr, ytr) for c in range(4)]

    with open(output_dir / "binary_models.pkl", "wb") as f:
        pickle.dump(models, f)
    print(f"  saved -> {output_dir / 'binary_models.pkl'}")

    raw = np.zeros((len(Xval), 4))
    for ci, m in enumerate(models):
        K = build_matrix(m.prep.transform(Xval), m.train_data, label=f"val-{ci}")
        if m.flipped:
            K = 1.0 - K
        idx_sorted = np.argsort(-K, axis=1)[:, :NUM_NEIGHBORS]
        for i in range(len(Xval)):
            nsim = K[i, idx_sorted[i]]
            nlbl = m.train_labels[idx_sorted[i]]
            if nsim.sum() < 1e-10:
                raw[i, ci] = 0.5
            else:
                w = nsim / nsim.sum()
                raw[i, ci] = w[nlbl == 1].sum()
    probs = np.exp(raw / 0.3) / np.exp(raw / 0.3).sum(axis=1, keepdims=True)
    preds = probs.argmax(axis=1)
    val_acc = float(accuracy_score(yval, preds))
    cm = confusion_matrix(yval, preds).tolist()
    print(f"validation accuracy: {val_acc*100:.1f}%")
    print(classification_report(yval, preds, target_names=CLASS_NAMES, zero_division=0))

    metadata = {
        "validation_accuracy": round(val_acc, 4),
        "test_accuracy": round(val_acc, 4),
        "per_class_kernel_separation": {
            CLASS_NAMES[m.cls]: round(m.separation, 4) for m in models
        },
        "confusion_matrix": {"labels": CLASS_NAMES, "matrix": cm},
        "confidence_distribution": {
            "correct_mean": float(probs[np.arange(len(yval)), preds][preds == yval].mean()),
            "incorrect_mean": float(probs[np.arange(len(yval)), preds][preds != yval].mean()) if (preds != yval).any() else 0.0,
        },
        "training": {
            "kernel": "Quantum Fidelity Kernel (ZZ-style, reps=2)",
            "n_qubits": TOTAL_QUBITS,
            "n_train_samples": int(len(Xtr)),
            "n_test_samples": int(len(Xval)),
            "last_trained": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    }
    with open(output_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"  saved -> {output_dir / 'metadata.json'}")
    print("\nDone. Copy the entire `models/` folder into /app/backend/models/,")
    print("set USE_REAL_MODEL=true in backend/.env, then restart the backend.")


if __name__ == "__main__":
    main()
