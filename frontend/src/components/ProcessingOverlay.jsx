import { useEffect, useState } from "react";
import { STAGES } from "@/lib/quantum";

function QuantumCircuit() {
    // SVG circuit-style pulsing diagram
    return (
        <svg viewBox="0 0 320 120" className="w-full max-w-md" aria-hidden>
            {[0, 1, 2, 3].map((row) => (
                <line
                    key={row}
                    x1="10" x2="310"
                    y1={20 + row * 26} y2={20 + row * 26}
                    stroke="#2A3754" strokeWidth="1.5"
                />
            ))}
            {/* Gates */}
            {[60, 110, 170, 230, 280].map((x, i) => (
                <g key={x}>
                    <rect
                        x={x - 10}
                        y={(i % 4) * 26 + 10}
                        width="20" height="20" rx="3"
                        fill="#131A33"
                        stroke={i % 2 === 0 ? "#8B5CF6" : "#2DD4BF"}
                        strokeWidth="1.5"
                        style={{ animation: `qPulse ${1.4 + (i % 3) * 0.2}s ease-in-out infinite`, animationDelay: `${i * 0.15}s` }}
                    />
                    <text
                        x={x} y={(i % 4) * 26 + 24}
                        textAnchor="middle"
                        fontSize="9"
                        fill={i % 2 === 0 ? "#A78BFA" : "#5EEAD4"}
                        fontFamily="JetBrains Mono, monospace"
                    >
                        {["H", "Rx", "Ry", "Rz", "ZZ"][i]}
                    </text>
                </g>
            ))}
            {/* Entanglement curves */}
            {[
                [60, 0, 110, 1],
                [110, 1, 170, 2],
                [170, 2, 230, 3],
                [230, 3, 280, 0],
            ].map(([x1, r1, x2, r2], i) => (
                <path
                    key={i}
                    d={`M ${x1} ${20 + r1 * 26} Q ${(x1 + x2) / 2} ${20 + ((r1 + r2) / 2) * 26 - 15} ${x2} ${20 + r2 * 26}`}
                    stroke="#8B5CF6" strokeWidth="1" fill="none" opacity="0.5"
                    strokeDasharray="4 4"
                    style={{ animation: `qPulse ${1.8 + i * 0.1}s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }}
                />
            ))}
        </svg>
    );
}

export default function ProcessingOverlay({ open, estimatedSeconds = 8, serverStage, serverElapsed }) {
    const [elapsed, setElapsed] = useState(0);
    const [stageIdx, setStageIdx] = useState(0);

    useEffect(() => {
        if (!open) {
            setElapsed(0);
            setStageIdx(0);
            return;
        }
        const start = performance.now();
        const id = setInterval(() => {
            const sec = (performance.now() - start) / 1000;
            setElapsed(sec);
            // compute stage based on cumulative weights
            const target = Math.min(sec / estimatedSeconds, 0.99);
            let acc = 0;
            for (let i = 0; i < STAGES.length; i++) {
                acc += STAGES[i].weight;
                if (target <= acc) {
                    setStageIdx(i);
                    break;
                }
            }
        }, 80);
        return () => clearInterval(id);
    }, [open, estimatedSeconds]);

    if (!open) return null;

    // Prefer server-reported state when available (background-task polling mode)
    const displayElapsed = (typeof serverElapsed === "number" && serverElapsed > 0) ? serverElapsed : elapsed;
    const displayStage = (typeof serverStage === "number") ? serverStage : stageIdx;
    const progress = Math.min((displayElapsed / estimatedSeconds) * 100, 99);

    return (
        <div
            data-testid="processing-overlay"
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center px-4"
            role="status"
            aria-live="polite"
        >
            <div className="q-card-elevated w-full max-w-2xl p-8 sm:p-10">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="data-label text-teal-300">qsvm-runtime</div>
                        <h2 className="font-heading text-2xl font-bold tracking-tight mt-1">
                            Running quantum inference
                        </h2>
                    </div>
                    <div className="text-right">
                        <div className="data-label">Elapsed</div>
                        <div className="font-mono text-2xl text-violet-200" data-testid="processing-elapsed">
                            {displayElapsed.toFixed(1)}s
                        </div>
                    </div>
                </div>

                <div className="flex justify-center my-4">
                    <QuantumCircuit />
                </div>

                {/* Progress bar */}
                <div className="mt-6">
                    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-violet-500 to-teal-400 transition-[width] duration-100"
                            style={{ width: `${progress}%` }}
                            data-testid="processing-progress-bar"
                        />
                    </div>
                    <div className="flex justify-between mt-2 data-label">
                        <span data-testid="processing-estimated">Est. ~{estimatedSeconds}s</span>
                        <span>{progress.toFixed(0)}%</span>
                    </div>
                </div>

                {/* Stages */}
                <div className="mt-8 space-y-2.5" data-testid="processing-stages">
                    {STAGES.map((s, i) => {
                        const done = i < displayStage;
                        const active = i === displayStage;
                        return (
                            <div
                                key={s.id}
                                className={`flex items-center gap-3 px-3 py-2 rounded font-mono text-sm transition-colors ${
                                    active
                                        ? "bg-violet-500/10 text-violet-200 q-stage-active"
                                        : done
                                            ? "text-teal-300"
                                            : "text-slate-500"
                                }`}
                            >
                                <span
                                    className={`q-stage-dot inline-block w-2 h-2 rounded-full ${
                                        active ? "bg-violet-400" : done ? "bg-teal-400" : "bg-slate-700"
                                    }`}
                                />
                                <span className="data-label opacity-80">[{String(i + 1).padStart(2, "0")}]</span>
                                <span className="flex-1">{s.label}{active ? "…" : done ? " ✓" : ""}</span>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-6 pt-5 border-t border-[var(--border-subtle)] data-label text-slate-500">
                    Inference runs on a precomputed quantum kernel · do not refresh
                </div>
            </div>
        </div>
    );
}
