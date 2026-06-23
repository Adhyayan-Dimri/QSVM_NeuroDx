export default function ConfusionMatrix({ data }) {
    if (!data) return null;
    const { labels, matrix } = data;
    const flat = matrix.flat();
    const max = Math.max(...flat, 1);

    return (
        <div className="overflow-x-auto" data-testid="confusion-matrix">
            <table className="border-collapse w-full">
                <thead>
                    <tr>
                        <th className="data-label text-left p-2">actual ↓ / predicted →</th>
                        {labels.map((l) => (
                            <th key={l} className="data-label text-center p-2">{l}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {matrix.map((row, i) => (
                        <tr key={i}>
                            <td className="data-label text-slate-300 p-2 whitespace-nowrap">{labels[i]}</td>
                            {row.map((v, j) => {
                                const t = v / max;
                                const isDiag = i === j;
                                const bg = isDiag
                                    ? `rgba(45, 212, 191, ${0.15 + t * 0.7})`
                                    : `rgba(139, 92, 246, ${0.08 + t * 0.45})`;
                                const fg = t > 0.6 ? "#fff" : isDiag ? "#5EEAD4" : "#C4B5FD";
                                return (
                                    <td key={j} className="p-1.5">
                                        <div
                                            className="aspect-square rounded font-mono text-base font-semibold flex items-center justify-center border border-slate-800"
                                            style={{ background: bg, color: fg }}
                                            data-testid={`cm-cell-${i}-${j}`}
                                        >
                                            {v}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
