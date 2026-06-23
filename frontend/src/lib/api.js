import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
    baseURL: API,
    timeout: 60000,
});

export async function predictScan(file) {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post("/predict", form, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return data; // { job_id, estimated_time_seconds }
}

export async function fetchPredictionStatus(jobId) {
    const { data } = await api.get(`/predict/status/${jobId}`);
    return data;
}

/** Submit + poll until done. onProgress({status, stage_idx, elapsed_seconds, estimated_time_seconds}). */
export async function runPrediction(file, onProgress) {
    const { job_id, estimated_time_seconds } = await predictScan(file);
    onProgress?.({ status: "pending", stage_idx: 0, elapsed_seconds: 0, estimated_time_seconds });
    while (true) {
        await new Promise((r) => setTimeout(r, 600));
        const s = await fetchPredictionStatus(job_id);
        onProgress?.(s);
        if (s.status === "done") return s.result;
        if (s.status === "error") throw new Error(s.error || "Prediction failed");
    }
}

export async function fetchMetrics() {
    const { data } = await api.get("/metrics");
    return data;
}

export async function fetchHistory() {
    const { data } = await api.get("/history");
    return data;
}

export async function deleteHistoryItem(id) {
    const { data } = await api.delete(`/history/${id}`);
    return data;
}

export function reportPdfUrl(id) {
    return `${API}/history/${id}/report.pdf`;
}

export function reportDicomUrl(id) {
    return `${API}/history/${id}/report.dcm`;
}

export async function downloadReport(id) {
    const res = await fetch(reportPdfUrl(id));
    if (!res.ok) throw new Error("Failed to generate report");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qsvm-report-${id.slice(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export async function downloadDicom(id) {
    const res = await fetch(reportDicomUrl(id));
    if (!res.ok) throw new Error("Failed to generate DICOM");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qsvm-${id.slice(0, 8)}.dcm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
