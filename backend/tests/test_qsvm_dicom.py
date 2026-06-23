"""Iteration 3 tests: DICOM export + server-side downscale."""
import io
import os
import base64
import pytest
import requests
import pydicom
from PIL import Image

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
API = f"{BASE_URL}/api"
CLASSES = {"No Tumor", "Pituitary", "Meningioma", "Glioma"}


def _make_jpg(size=(64, 64), color=(120, 120, 120)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color=color).save(buf, format="JPEG")
    return buf.getvalue()


def _create_scan(content, name="scan.jpg") -> str:
    r = requests.post(f"{API}/predict",
                      files={"file": (name, content, "image/jpeg")},
                      timeout=60)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# --- DICOM export ----------------------------------------------------------

def test_dicom_export_happy_path():
    sid = _create_scan(_make_jpg())
    try:
        r = requests.get(f"{API}/history/{sid}/report.dcm", timeout=20)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("application/dicom")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert sid[:16] in cd
        assert len(r.content) > 1024

        ds = pydicom.dcmread(io.BytesIO(r.content))
        assert str(ds.PatientID) == sid[:16]
        assert str(ds.Modality) == "OT"

        diagnosis = ds.ImageComments.split("|")[0].replace("DIAGNOSIS=", "").strip()
        assert diagnosis in CLASSES
        assert "%" in str(ds.SeriesDescription)
        assert diagnosis in str(ds.SeriesDescription)
        assert str(ds.ImageComments).startswith("DIAGNOSIS=")

        # Private tag (0x0099,0x1001) under creator 'QSVM NEURODX'
        private_val = str(ds[(0x0099, 0x1001)].value)
        assert private_val == diagnosis

        # Rows/Cols <= 512 (downscale)
        assert int(ds.Rows) <= 512 and int(ds.Columns) <= 512
    finally:
        requests.delete(f"{API}/history/{sid}", timeout=10)


def test_dicom_export_unknown_returns_404():
    r = requests.get(f"{API}/history/no-such-id/report.dcm", timeout=10)
    assert r.status_code == 404


# --- Server-side downscale ------------------------------------------------

def test_large_image_is_downscaled_in_thumbnail():
    big = _make_jpg(size=(1500, 1200), color=(80, 140, 200))
    sid = _create_scan(big, name="big.jpg")
    try:
        r = requests.get(f"{API}/history/{sid}", timeout=15)
        assert r.status_code == 200
        thumb = r.json()["thumbnail_url"]
        assert thumb.startswith("data:image/jpeg;base64,")
        decoded = base64.b64decode(thumb.split(",", 1)[1])
        # Stored bytes should be << original
        assert len(decoded) < len(big), f"stored {len(decoded)} not smaller than upload {len(big)}"
        im = Image.open(io.BytesIO(decoded))
        assert im.size[0] <= 512 and im.size[1] <= 512
        # aspect roughly preserved (1500/1200 = 1.25); longest side should be 512
        assert max(im.size) == 512
    finally:
        requests.delete(f"{API}/history/{sid}", timeout=10)


def test_small_image_is_preserved_valid():
    small = _make_jpg(size=(96, 96), color=(20, 20, 20))
    sid = _create_scan(small, name="small.jpg")
    try:
        r = requests.get(f"{API}/history/{sid}", timeout=15)
        assert r.status_code == 200
        thumb = r.json()["thumbnail_url"]
        assert thumb.startswith("data:image/jpeg;base64,")
        decoded = base64.b64decode(thumb.split(",", 1)[1])
        im = Image.open(io.BytesIO(decoded))
        # Pillow thumbnail does not enlarge — size stays <= 96
        assert im.size[0] <= 96 and im.size[1] <= 96
        assert im.mode == "RGB"
    finally:
        requests.delete(f"{API}/history/{sid}", timeout=10)


# --- Regression: PDF still works ------------------------------------------

def test_pdf_still_works_regression():
    sid = _create_scan(_make_jpg())
    try:
        r = requests.get(f"{API}/history/{sid}/report.pdf", timeout=15)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert len(r.content) >= 1024
    finally:
        requests.delete(f"{API}/history/{sid}", timeout=10)
