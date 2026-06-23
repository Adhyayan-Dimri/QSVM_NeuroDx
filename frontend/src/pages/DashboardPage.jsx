import { useState } from "react";
import { Play, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import UploadZone from "@/components/UploadZone";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import ResultsPanel from "@/components/ResultsPanel";
import { runPrediction } from "@/lib/api";

export default function DashboardPage() {
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState(null);
    const [estSeconds, setEstSeconds] = useState(8);
    const [serverStage, setServerStage] = useState(0);
    const [serverElapsed, setServerElapsed] = useState(0);

    const onFile = (f) => {
        setFile(f);
        const url = URL.createObjectURL(f);
        setPreview(url);
        setResult(null);
    };

    const onClear = () => {
        if (preview) URL.revokeObjectURL(preview);
        setFile(null); setPreview(null); setResult(null);
    };

    const handleAnalyze = async () => {
        if (!file) return;
        setProcessing(true); setResult(null);
        setServerStage(0); setServerElapsed(0);
        try {
            const data = await runPrediction(file, (s) => {
                if (s.estimated_time_seconds) setEstSeconds(s.estimated_time_seconds);
                if (typeof s.stage_idx === "number") setServerStage(s.stage_idx);
                if (typeof s.elapsed_seconds === "number") setServerElapsed(s.elapsed_seconds);
            });
            setResult(data);
            toast.success(`Diagnosis: ${data.diagnosis} (${(data.confidence * 100).toFixed(1)}%)`);
        } catch (err) {
            console.error(err);
            toast.error("Analysis failed. Please try another scan.");
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="dashboard-page">
            {/* Hero */}
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <div className="data-label text-teal-300">station-01 · awaiting input</div>
                    <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight mt-2">
                        MRI <span className="text-violet-300">tumor</span> classification
                    </h1>
                    <p className="text-slate-400 max-w-xl mt-2 text-sm">
                        Upload a single axial brain MRI slice. Inference is computed against a precomputed
                        quantum fidelity kernel — expect a 5–10 second wait per scan.
                    </p>
                </div>
                <div className="hidden sm:flex items-center gap-6 q-card-elevated px-5 py-3 rounded-md">
                    <div>
                        <div className="data-label">model</div>
                        <div className="font-mono text-sm text-slate-200">qsvm-v1.4</div>
                    </div>
                    <div className="w-px h-8 bg-slate-700/60" />
                    <div>
                        <div className="data-label">val acc</div>
                        <div className="font-mono text-sm text-teal-300">0.84</div>
                    </div>
                </div>
            </div>

            {/* Upload + actions */}
            <div className="grid lg:grid-cols-3 gap-5">
                <div className="lg:col-span-1">
                    <UploadZone
                        file={file}
                        preview={preview}
                        onFile={onFile}
                        onClear={onClear}
                        disabled={processing}
                    />
                </div>
                <div className="lg:col-span-2 q-card p-6 flex flex-col">
                    <div className="data-label">step 02</div>
                    <h2 className="font-heading text-xl font-semibold tracking-tight mt-1">
                        Run quantum inference
                    </h2>
                    <p className="text-sm text-slate-400 mt-2 max-w-md">
                        The MRI image is encoded into an 8-qubit feature map (ZZFeatureMap, reps=2),
                        compared against the precomputed support set, and aggregated across four
                        one-vs-rest classifiers.
                    </p>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        <button
                            data-testid="analyze-button"
                            onClick={handleAnalyze}
                            disabled={!file || processing}
                            className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-violet-500 text-white font-medium hover:bg-violet-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed transition-all hover:-translate-y-[1px]"
                        >
                            {processing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                            {processing ? "Analyzing…" : "Analyze MRI"}
                        </button>

                        {result && (
                            <button
                                data-testid="reset-button"
                                onClick={onClear}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800/50 text-sm"
                            >
                                <RefreshCw size={14} /> New scan
                            </button>
                        )}
                    </div>

                    {/* Mini pipeline */}
                    <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {[
                            ["01", "Feature extract", "PCA-64"],
                            ["02", "Quantum encode", "ZZ · 8q"],
                            ["03", "Kernel similarity", "fidelity"],
                            ["04", "OvR aggregate", "argmax"],
                        ].map(([n, t, sub]) => (
                            <div key={n} className="q-card-elevated p-3">
                                <div className="data-label text-violet-300">[{n}]</div>
                                <div className="text-sm text-slate-100 mt-1">{t}</div>
                                <div className="data-label text-slate-500 mt-0.5">{sub}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Results */}
            {result && <ResultsPanel result={result} />}

            <ProcessingOverlay
                open={processing}
                estimatedSeconds={estSeconds}
                serverStage={serverStage}
                serverElapsed={serverElapsed}
            />
        </div>
    );
}
