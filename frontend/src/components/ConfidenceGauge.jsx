import { useEffect, useState } from "react";
import { confidenceColor } from "@/lib/quantum";

export default function ConfidenceGauge({ value }) {
    const [shown, setShown] = useState(0);
    useEffect(() => {
        const id = setTimeout(() => setShown(value), 80);
        return () => clearTimeout(id);
    }, [value]);

    const size = 180;
    const stroke = 12;
    const radius = (size - stroke) / 2;
    const circ = 2 * Math.PI * radius;
    const offset = circ * (1 - shown);
    const color = confidenceColor(value);

    return (
        <div className="flex flex-col items-center" data-testid="confidence-gauge">
            <div className="relative" style={{ width: size, height: size }}>
                <svg width={size} height={size} className="transform -rotate-90">
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke="#1E293B"
                        strokeWidth={stroke}
                        fill="none"
                    />
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke={color}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        fill="none"
                        strokeDasharray={circ}
                        strokeDashoffset={offset}
                        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.2,0.7,0.2,1)" }}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="font-heading font-bold text-4xl tracking-tight" style={{ color }}>
                        {(value * 100).toFixed(1)}%
                    </div>
                    <div className="data-label mt-1">Confidence</div>
                </div>
            </div>
        </div>
    );
}
