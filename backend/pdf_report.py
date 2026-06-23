from __future__ import annotations

import base64
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

try:
    from PIL import ImageFile
    ImageFile.LOAD_TRUNCATED_IMAGES = True
except Exception:
    pass


CLASS_COLOR_HEX = {
    "No Tumor":   colors.HexColor("#2DD4BF"),
    "Pituitary":  colors.HexColor("#8B5CF6"),
    "Meningioma": colors.HexColor("#F97316"),
    "Glioma":     colors.HexColor("#EF4444"),
}


def _image_from_data_url(data_url: str) -> ImageReader | None:
    if not data_url or not data_url.startswith("data:"):
        return None
    try:
        b64 = data_url.split(",", 1)[1]
        return ImageReader(io.BytesIO(base64.b64decode(b64)))
    except Exception:
        return None


def build_report(scan: dict) -> bytes:
    """Generate a one-page PDF report from a stored scan document."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4

    navy = colors.HexColor("#0D1326")
    violet = colors.HexColor("#8B5CF6")
    teal = colors.HexColor("#2DD4BF")
    slate = colors.HexColor("#475569")
    light = colors.HexColor("#F8FAFC")

    # Header band
    c.setFillColor(navy)
    c.rect(0, h - 28 * mm, w, 28 * mm, fill=1, stroke=0)
    c.setFillColor(light)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(18 * mm, h - 14 * mm, "QSVM NeuroDx · Diagnosis Report")
    c.setFillColor(teal)
    c.setFont("Helvetica", 8)
    c.drawString(18 * mm, h - 19 * mm, "QUANTUM-CLASSICAL HYBRID · BRAIN TUMOR MRI")

    ts = scan.get("timestamp", datetime.utcnow().isoformat())
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        ts_display = dt.strftime("%Y-%m-%d %H:%M UTC")
    except Exception:
        ts_display = ts
    c.setFillColor(light)
    c.setFont("Helvetica", 9)
    c.drawRightString(w - 18 * mm, h - 14 * mm, f"Scan {scan.get('id','')[:8]}")
    c.drawRightString(w - 18 * mm, h - 19 * mm, ts_display)

    # MRI image
    y_img = h - 110 * mm
    c.setStrokeColor(slate)
    c.rect(18 * mm, y_img, 70 * mm, 70 * mm, stroke=1, fill=0)
    img = _image_from_data_url(scan.get("thumbnail_url", ""))
    if img is not None:
        try:
            c.drawImage(img, 19 * mm, y_img + 1 * mm,
                        width=68 * mm, height=68 * mm,
                        preserveAspectRatio=True, mask="auto")
        except Exception:
            c.setFillColor(slate)
            c.setFont("Helvetica", 8)
            c.drawCentredString(18 * mm + 35 * mm, y_img + 33 * mm,
                                "[ image preview unavailable ]")

    c.setFillColor(slate)
    c.setFont("Helvetica", 7)
    c.drawString(18 * mm, y_img - 4 * mm, f"FILE · {scan.get('filename','—')}")

    x = 95 * mm
    c.setFillColor(slate)
    c.setFont("Helvetica", 7)
    c.drawString(x, h - 40 * mm, "PREDICTED CLASS")
    dx = scan.get("diagnosis", "—")
    c.setFillColor(CLASS_COLOR_HEX.get(dx, violet))
    c.setFont("Helvetica-Bold", 28)
    c.drawString(x, h - 51 * mm, dx)

    conf = float(scan.get("confidence", 0))
    c.setFillColor(slate)
    c.setFont("Helvetica", 7)
    c.drawString(x, h - 60 * mm, "CONFIDENCE")
    c.setFillColor(light)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(x, h - 70 * mm, f"{conf*100:.1f}%")

    c.setFillColor(colors.HexColor("#1E293B"))
    c.rect(x, h - 76 * mm, 80 * mm, 3 * mm, fill=1, stroke=0)
    c.setFillColor(teal if conf >= 0.75 else violet if conf >= 0.6 else colors.HexColor("#F97316"))
    c.rect(x, h - 76 * mm, 80 * mm * conf, 3 * mm, fill=1, stroke=0)

    if scan.get("low_confidence_warning"):
        c.setFillColor(colors.HexColor("#F97316"))
        c.setFont("Helvetica-Bold", 9)
        c.drawString(x, h - 84 * mm, "⚠ LOW CONFIDENCE — RADIOLOGIST REVIEW RECOMMENDED")

    y0 = y_img - 18 * mm
    c.setFillColor(slate)
    c.setFont("Helvetica", 7)
    c.drawString(18 * mm, y0, "CLASS PROBABILITY DISTRIBUTION")
    probs = scan.get("probabilities", {}) or {}
    for i, (name, p) in enumerate(probs.items()):
        yy = y0 - 8 * mm - i * 9 * mm
        c.setFillColor(light)
        c.setFont("Helvetica", 10)
        c.drawString(18 * mm, yy, name)
        c.setFillColor(colors.HexColor("#1E293B"))
        c.rect(60 * mm, yy - 1 * mm, 100 * mm, 4 * mm, fill=1, stroke=0)
        col = CLASS_COLOR_HEX.get(name, violet)
        c.setFillColor(col)
        c.rect(60 * mm, yy - 1 * mm, 100 * mm * float(p), 4 * mm, fill=1, stroke=0)
        c.setFillColor(light)
        c.setFont("Helvetica", 9)
        c.drawRightString(w - 18 * mm, yy, f"{float(p)*100:.1f}%")

    c.setFillColor(slate)
    c.setFont("Helvetica", 7)
    c.drawString(18 * mm, 18 * mm, "Inference: Quantum Fidelity Kernel · 8 qubits · ZZFeatureMap reps=2")
    c.drawString(
        18 * mm, 14 * mm,
        f"Completed in {scan.get('inference_time_seconds', 0):.2f}s · estimated {scan.get('estimated_time_seconds','—')}s",
    )
    c.setFillColor(colors.HexColor("#F97316"))
    c.drawRightString(w - 18 * mm, 14 * mm, "RESEARCH PREVIEW — NOT FOR CLINICAL USE")

    c.showPage()
    c.save()
    return buf.getvalue()
