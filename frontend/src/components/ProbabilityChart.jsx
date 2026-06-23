import { CLASSES, CLASS_COLORS } from "@/lib/quantum";

export default function ProbabilityChart({ probabilities, predicted }) {
    const data = CLASSES.map((c) => ({ name: c, value: probabilities[c] || 0 }));
    const max = Math.max(...data.map((d) => d.value), 0.01);

    return (
        <div data-testid="probability-chart" className="space-y-3">
            {data.map((d) => {
                const isPred = d.name === predicted;
                const pct = (d.value * 100).toFixed(1);
                const width = `${(d.value / max) * 100}%`;
                const color = CLASS_COLORS[d.name];
                return (
                    <div key={d.name} className="flex items-center gap-3" data-testid={`prob-row-${d.name.replace(/\s+/g, "-").toLowerCase()}`}>
                        <div className="w-28 shrink-0">
                            <div className={`text-sm font-medium ${isPred ? "text-white" : "text-slate-400"}`}>
                                {d.name}
                            </div>
                            {isPred && <div className="data-label text-violet-300">predicted</div>}
                        </div>
                        <div className="flex-1 h-7 rounded bg-slate-900/60 border border-slate-800 overflow-hidden relative">
                            <div
                                className="h-full rounded-r"
                                style={{
                                    width,
                                    background: isPred
                                        ? `linear-gradient(90deg, ${color}, ${color}aa)`
                                        : `${color}44`,
                                    borderRight: isPred ? `2px solid ${color}` : "none",
                                    transition: "width 1.2s cubic-bezier(0.2,0.7,0.2,1)",
                                }}
                            />
                        </div>
                        <div className={`w-16 text-right font-mono text-sm ${isPred ? "text-white" : "text-slate-500"}`}>
                            {pct}%
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
