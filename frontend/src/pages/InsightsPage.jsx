import { useEffect, useState } from "react";
import { Activity, Cpu, Calendar, Target } from "lucide-react";
import ConfusionMatrix from "@/components/ConfusionMatrix";
import { fetchMetrics } from "@/lib/api";
import { CLASS_COLORS } from "@/lib/quantum";

function Stat({ label, value, sub, icon: Icon, accent = "violet" }) {
    const colors = {
        violet: "text-violet-300",
        teal: "text-teal-300",
        amber: "text-amber-300",
        emerald: "text-emerald-300",
    };
    return (
        <div className="q-card p-5">
            <div className="flex items-start justify-between">
                <div className="data-label">{label}</div>
                {Icon && <Icon size={14} className={colors[accent]} />}
            </div>
            <div className={`font-heading font-bold text-3xl tracking-tight mt-2 ${colors[accent]}`}>
                {value}
            </div>
            {sub && <div className="data-label text-slate-500 mt-1">{sub}</div>}
        </div>
    );
}

export default function InsightsPage() {
    const [metrics, setMetrics] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        fetchMetrics().then(setMetrics).catch((e) => setErr(e.message));
    }, []);

    if (err) return <div className="text-red-400" data-testid="insights-error">Failed to load metrics: {err}</div>;
    if (!metrics) return <div className="text-slate-400" data-testid="insights-loading">Loading metrics…</div>;

    const sepEntries = Object.entries(metrics.per_class_kernel_separation);
    const maxSep = Math.max(...sepEntries.map(([, v]) => v));

    return (
        <div className="space-y-6 q-fade-up" data-testid="insights-page">
            <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                    <div className="data-label text-teal-300">qsvm-runtime · evaluation</div>
                    <h1 className="font-heading font-bold text-3xl sm:text-4xl tracking-tight mt-2">
                        Model insights
                    </h1>
                </div>
                <div className="data-label text-slate-500 flex items-center gap-2">
                    <Calendar size={11} /> last trained {new Date(metrics.training.last_trained).toLocaleString()}
                </div>
            </div>

            {/* Stat grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat label="Validation accuracy" value={(metrics.validation_accuracy * 100).toFixed(1) + "%"} sub="cross-validated" icon={Target} accent="violet" />
                <Stat label="Test accuracy" value={(metrics.test_accuracy * 100).toFixed(1) + "%"} sub="hold-out set" icon={Activity} accent="teal" />
                <Stat label="Qubits" value={metrics.training.n_qubits} sub={metrics.training.kernel.split(" (")[0]} icon={Cpu} accent="amber" />
                <Stat label="Train samples" value={metrics.training.n_train_samples} sub={`${metrics.training.n_test_samples} test`} icon={Activity} accent="emerald" />
            </div>

            {/* Confusion matrix + kernel separation */}
            <div className="grid lg:grid-cols-5 gap-5">
                <div className="q-card p-6 lg:col-span-3">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="font-heading font-semibold text-lg tracking-tight">Confusion matrix</h3>
                            <div className="data-label text-slate-500 mt-1">test set predictions</div>
                        </div>
                        <span className="data-label">teal = correct · violet = error</span>
                    </div>
                    <ConfusionMatrix data={metrics.confusion_matrix} />
                </div>

                <div className="q-card p-6 lg:col-span-2">
                    <h3 className="font-heading font-semibold text-lg tracking-tight">Quantum kernel separation</h3>
                    <div className="data-label text-slate-500 mt-1">per one-vs-rest classifier</div>

                    <div className="mt-5 space-y-3" data-testid="kernel-separation">
                        {sepEntries.map(([name, v]) => {
                            const width = `${(v / maxSep) * 100}%`;
                            const color = CLASS_COLORS[name];
                            return (
                                <div key={name} className="flex items-center gap-3" data-testid={`sep-${name.replace(/\s+/g, "-").toLowerCase()}`}>
                                    <div className="w-28 text-sm text-slate-300">{name}</div>
                                    <div className="flex-1 h-6 rounded bg-slate-900/60 border border-slate-800 overflow-hidden">
                                        <div
                                            className="h-full"
                                            style={{
                                                width,
                                                background: `linear-gradient(90deg, ${color}, ${color}80)`,
                                                transition: "width 1.2s cubic-bezier(0.2,0.7,0.2,1)",
                                            }}
                                        />
                                    </div>
                                    <div className="w-16 text-right font-mono text-sm text-slate-300">{v.toFixed(3)}</div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
                        <div className="data-label">Confidence distribution</div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <div className="q-card-elevated p-3">
                                <div className="data-label text-emerald-300">correct mean</div>
                                <div className="font-mono text-xl text-emerald-300 mt-1">
                                    {(metrics.confidence_distribution.correct_mean * 100).toFixed(1)}%
                                </div>
                            </div>
                            <div className="q-card-elevated p-3">
                                <div className="data-label text-orange-300">incorrect mean</div>
                                <div className="font-mono text-xl text-orange-300 mt-1">
                                    {(metrics.confidence_distribution.incorrect_mean * 100).toFixed(1)}%
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
