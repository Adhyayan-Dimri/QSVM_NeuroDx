import { useEffect, useMemo, useState } from "react";
import { Trash2, Filter, FileScan, FileDown, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { fetchHistory, deleteHistoryItem, downloadReport, downloadDicom } from "@/lib/api";
import { CLASS_COLORS, CLASSES, formatTime, confidenceColor } from "@/lib/quantum";

export default function HistoryPage() {
    const [items, setItems] = useState(null);
    const [filter, setFilter] = useState("All");
    const [err, setErr] = useState(null);

    const load = () => {
        fetchHistory().then(setItems).catch((e) => setErr(e.message));
    };

    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(() => {
        if (!items) return [];
        if (filter === "All") return items;
        return items.filter((i) => i.diagnosis === filter);
    }, [items, filter]);

    const handleDelete = async (id) => {
        try {
            await deleteHistoryItem(id);
            toast.success("Scan removed from history");
            load();
        } catch (e) {
            toast.error("Failed to delete");
        }
    };

    if (err) return <div className="text-red-400">Failed to load history: {err}</div>;

    return (
        <div className="space-y-6 q-fade-up" data-testid="history-page">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <div className="data-label text-teal-300">patient log · qsvm</div>
                    <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight mt-2">
                        Scan history
                    </h1>
                    <p className="text-slate-400 mt-2 text-sm">
                        All MRI scans analyzed on this workstation. Stored encrypted at rest.
                    </p>
                </div>

                <div className="flex items-center gap-2 q-card-elevated p-1.5 rounded-md" data-testid="filter-bar">
                    <Filter size={13} className="text-slate-500 ml-2" />
                    {["All", ...CLASSES].map((c) => (
                        <button
                            key={c}
                            onClick={() => setFilter(c)}
                            data-testid={`filter-${c.replace(/\s+/g, "-").toLowerCase()}`}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                filter === c
                                    ? "bg-violet-500/20 text-violet-200 ring-1 ring-inset ring-violet-500/30"
                                    : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            {c}
                        </button>
                    ))}
                </div>
            </div>

            {!items ? (
                <div className="text-slate-400" data-testid="history-loading">Loading history…</div>
            ) : filtered.length === 0 ? (
                <div className="q-card p-12 flex flex-col items-center text-center" data-testid="history-empty">
                    <div className="w-14 h-14 rounded-full bg-slate-800/70 border border-slate-700 flex items-center justify-center">
                        <FileScan size={24} className="text-slate-500" />
                    </div>
                    <div className="font-heading text-lg mt-4 tracking-tight">No scans yet</div>
                    <div className="text-sm text-slate-400 mt-1">
                        Analyzed MRIs will appear here for review.
                    </div>
                </div>
            ) : (
                <div className="q-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="border-b border-[var(--border-subtle)] bg-slate-900/40">
                                <tr>
                                    {["Scan", "Diagnosis", "Confidence", "Inference", "Timestamp", ""].map((h) => (
                                        <th key={h} className="data-label text-left px-4 py-3">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((row) => {
                                    const color = CLASS_COLORS[row.diagnosis];
                                    const confColor = confidenceColor(row.confidence);
                                    return (
                                        <tr
                                            key={row.id}
                                            className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-slate-800/30 transition-colors"
                                            data-testid={`history-row-${row.id}`}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    {row.thumbnail_url ? (
                                                        <img
                                                            src={row.thumbnail_url}
                                                            alt=""
                                                            className="w-10 h-10 rounded object-cover border border-slate-700"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded bg-slate-800 border border-slate-700" />
                                                    )}
                                                    <span className="font-mono text-xs text-slate-500">
                                                        {row.id.slice(0, 8)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span
                                                    className="font-medium"
                                                    style={{ color }}
                                                >
                                                    {row.diagnosis}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-20 h-1.5 rounded bg-slate-800 overflow-hidden">
                                                        <div
                                                            className="h-full rounded"
                                                            style={{ width: `${row.confidence * 100}%`, background: confColor }}
                                                        />
                                                    </div>
                                                    <span className="font-mono text-xs" style={{ color: confColor }}>
                                                        {(row.confidence * 100).toFixed(1)}%
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-300">
                                                {formatTime(row.inference_time_seconds)}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-400">
                                                {new Date(row.timestamp).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="inline-flex items-center gap-1">
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await downloadReport(row.id);
                                                                toast.success("Report downloaded");
                                                            } catch (e) {
                                                                toast.error("Could not generate report");
                                                            }
                                                        }}
                                                        data-testid={`download-report-${row.id}`}
                                                        className="p-1.5 rounded text-slate-500 hover:text-violet-300 hover:bg-violet-500/10"
                                                        aria-label="Download PDF report"
                                                    >
                                                        <FileDown size={14} />
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await downloadDicom(row.id);
                                                                toast.success("DICOM downloaded");
                                                            } catch (e) {
                                                                toast.error("Could not generate DICOM");
                                                            }
                                                        }}
                                                        data-testid={`download-dicom-${row.id}`}
                                                        className="p-1.5 rounded text-slate-500 hover:text-teal-300 hover:bg-teal-500/10"
                                                        aria-label="Download DICOM"
                                                    >
                                                        <FileCode2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(row.id)}
                                                        data-testid={`delete-${row.id}`}
                                                        className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10"
                                                        aria-label="Delete scan"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
