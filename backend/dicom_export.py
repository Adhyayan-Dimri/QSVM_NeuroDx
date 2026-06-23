from __future__ import annotations

import base64
import io
import re
import uuid as _uuid
from datetime import datetime

import numpy as np
from PIL import Image
import pydicom
from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import (
    ExplicitVRLittleEndian, SecondaryCaptureImageStorage, generate_uid,
)


def _decode_thumbnail(data_url: str) -> Image.Image | None:
    if not data_url or not data_url.startswith("data:"):
        return None
    try:
        b64 = data_url.split(",", 1)[1]
        return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    except Exception:
        return None


def _parse_ts(ts: str) -> tuple[str, str]:
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        dt = datetime.utcnow()
    return dt.strftime("%Y%m%d"), dt.strftime("%H%M%S")


def build_dicom(scan: dict) -> bytes:
    """Generate a DICOM Secondary Capture file from a stored scan."""
    img = _decode_thumbnail(scan.get("thumbnail_url", ""))
    if img is None:
        
        img = Image.new("RGB", (1, 1), (0, 0, 0))

    pixel_arr = np.asarray(img, dtype=np.uint8)
    rows, cols, _ = pixel_arr.shape

    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    file_meta.ImplementationClassUID = generate_uid()
    file_meta.ImplementationVersionName = "QSVM_NEURODX_1.0"

    ds = FileDataset(
        filename_or_obj="",
        dataset={},
        file_meta=file_meta,
        preamble=b"\x00" * 128,
    )

    ds.SOPClassUID = SecondaryCaptureImageStorage
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID

    scan_id = scan.get("id", str(_uuid.uuid4()))
    ds.PatientName = "ANONYMOUS^QSVM"
    ds.PatientID = scan_id[:16]
    ds.PatientBirthDate = ""
    ds.PatientSex = ""

    date, time_ = _parse_ts(scan.get("timestamp", ""))
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.StudyDate = date
    ds.StudyTime = time_
    ds.SeriesDate = date
    ds.SeriesTime = time_
    ds.AccessionNumber = scan_id[:16]
    ds.Modality = "OT" 
    ds.ConversionType = "WSD"  
    ds.Manufacturer = "QSVM NeuroDx"
    ds.ManufacturerModelName = "Quantum-Classical Hybrid Detector"
    ds.SoftwareVersions = "1.0"
    ds.StudyDescription = "QSVM Brain Tumor Classification"
    ds.SeriesDescription = (
        f"QSVM diagnosis: {scan.get('diagnosis','?')} "
        f"({float(scan.get('confidence',0))*100:.1f}%)"
    )

    ds.SamplesPerPixel = 3
    ds.PhotometricInterpretation = "RGB"
    ds.PlanarConfiguration = 0
    ds.Rows = rows
    ds.Columns = cols
    ds.BitsAllocated = 8
    ds.BitsStored = 8
    ds.HighBit = 7
    ds.PixelRepresentation = 0
    ds.PixelData = pixel_arr.tobytes()

    probs = scan.get("probabilities", {}) or {}
    prob_str = " ".join(f"{k}={float(v):.4f}" for k, v in probs.items())
    ds.ImageComments = (
        f"DIAGNOSIS={scan.get('diagnosis','?')} | "
        f"CONFIDENCE={float(scan.get('confidence',0)):.4f} | "
        f"LOW_CONF_WARNING={bool(scan.get('low_confidence_warning'))} | "
        f"INFERENCE_SECONDS={float(scan.get('inference_time_seconds',0)):.2f} | "
        f"PROBS=({prob_str})"
    )
    ds.DerivationDescription = (
        "Quantum Fidelity Kernel (ZZFeatureMap, reps=2) + VGG16 features + "
        "4 OvR weighted-kNN classifiers. RESEARCH PREVIEW — NOT FOR CLINICAL USE."
    )

    block = ds.private_block(0x0099, "QSVM NEURODX", create=True)
    block.add_new(0x01, "LO", str(scan.get("diagnosis", "")))
    block.add_new(0x02, "DS", f"{float(scan.get('confidence', 0)):.6f}")
    block.add_new(0x03, "LO", prob_str[:64])  
    block.add_new(0x04, "DS", f"{float(scan.get('inference_time_seconds', 0)):.4f}")
    block.add_new(0x05, "CS", "TRUE" if scan.get("low_confidence_warning") else "FALSE")

    ds.is_little_endian = True
    ds.is_implicit_VR = False

    buf = io.BytesIO()
    pydicom.dcmwrite(buf, ds, enforce_file_format=True)
    return buf.getvalue()


def safe_filename(scan_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "", scan_id)[:16] or "scan"
