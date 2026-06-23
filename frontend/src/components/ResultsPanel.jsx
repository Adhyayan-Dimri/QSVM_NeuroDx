import { AlertTriangle, Clock, CheckCircle2, FileDown, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import ConfidenceGauge from "@/components/ConfidenceGauge";
import ProbabilityChart from "@/components/ProbabilityChart";
import { CLASS_COLORS, formatTime } from "@/lib/quantum";
import { downloadReport, downloadDicom } from "@/lib/api";

export default function ResultsPanel({ result }) {
    if (!result) return null;
    const color = CLASS_COLORS[result.diagnosis] || "#8B5CF6";

    return (
        <div className="q-fade-up space-y-5" data-testid="results-panel">
            {/* Headline */}
            <div className="q-card p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <div className="data-label">Predicted class</div>
                        <div
                            className="font-heading font-bold text-4xl tracking-tight mt-1"
                            style={{ color }}
                            data-testid="result-diagnosis"
                        >
                            {result.diagnosis}
                        </div>
                        <div className="flex items-center gap-2 mt-2 data-label text-slate-400">
                            <Clock size={11} />
                            Diagnosis completed in{" "}
                            <span className="text-slate-200 font-mono" data-testid="result-inference-time">
                                {formatTime(result.inference_time_seconds)}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            data-testid="download-report-button"
                            onClick={async () => {
                                try {
                                    await downloadReport(result.id);
                                    toast.success("Report downloaded");
                                } catch (e) {
                                    toast.error("Could not generate report");
                                }
                            }}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-violet-500/40 text-violet-200 hover:bg-violet-500/10 text-sm font-medium transition-colors"
                        >
                            <FileDown size={14} /> PDF report
                        </button>
                        <button
                            data-testid="download-dicom-button"
                            onClick={async () => {
                                try {
                                    await downloadDicom(result.id);
                                    toast.success("DICOM downloaded");
                                } catch (e) {
                                    toast.error("Could not generate DICOM");
                                }
                            }}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-teal-500/40 text-teal-200 hover:bg-teal-500/10 text-sm font-medium transition-colors"
                        >
                            <FileCode2 size={14} /> DICOM
                        </button>
                        {result.low_confidence_warning ? (
                        <div
                            className="px-3 py-2 rounded-md font-mono text-xs uppercase tracking-wider bg-orange-950/60 text-orange-300 border border-orange-900/80 flex items-center gap-2 max-w-xs"
                            data-testid="low-confidence-warning"
                        >
                            <AlertTriangle size={14} />
                            <span>Low confidence — radiologist review recommended</span>
                        </div>
                    ) : (
                        <div
                            className="px-3 py-2 rounded-md font-mono text-xs uppercase tracking-wider bg-emerald-950/40 text-emerald-300 border border-emerald-900/60 flex items-center gap-2"
                            data-testid="high-confidence-badge"
                        >
                            <CheckCircle2 size={14} />
                            <span>High confidence</span>
                        </div>
                    )}
                    </div>
                </div>
            </div>

            {/* Confidence + probabilities */}
            <div className="grid lg:grid-cols-5 gap-5">
                <div className="q-card p-6 lg:col-span-2 flex flex-col items-center justify-center">
                    <ConfidenceGauge value={result.confidence} />
                    <div className="mt-4 text-center">
                        <div className="data-label">Top class confidence</div>
                        <div className="text-sm text-slate-400 mt-1">
                            Threshold for review: <span className="font-mono text-slate-200">60%</span>
                        </div>
                    </div>
                </div>

                <div className="q-card p-6 lg:col-span-3">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-heading font-semibold text-lg tracking-tight">
                            Class probability distribution
                        </h3>
                        <span className="data-label">softmax · qkernel</span>
                    </div>
                    <ProbabilityChart
                        probabilities={result.probabilities}
                        predicted={result.diagnosis}
                    />
                </div>
            </div>
        </div>
    );
}
