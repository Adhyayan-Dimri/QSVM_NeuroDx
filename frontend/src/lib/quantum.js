// Shared quantum-theme constants

export const CLASSES = ["No Tumor", "Pituitary", "Meningioma", "Glioma"];

export const CLASS_COLORS = {
    "No Tumor": "#2DD4BF",      // teal
    "Pituitary": "#8B5CF6",     // violet
    "Meningioma": "#F97316",    // orange
    "Glioma": "#EF4444",        // red
};

export const STAGES = [
    { id: "extract", label: "Extracting features", weight: 0.15 },
    { id: "encode", label: "Encoding into quantum circuit", weight: 0.35 },
    { id: "kernel", label: "Computing kernel similarity", weight: 0.35 },
    { id: "aggregate", label: "Aggregating predictions", weight: 0.15 },
];

export function formatTime(s) {
    if (s === null || s === undefined) return "—";
    return `${Number(s).toFixed(1)}s`;
}

export function confidenceColor(c) {
    if (c >= 0.9) return "#10B981";
    if (c >= 0.75) return "#2DD4BF";
    if (c >= 0.6) return "#8B5CF6";
    return "#F97316";
}
