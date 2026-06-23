import { useCallback, useRef, useState } from "react";
import { UploadCloud, ImageIcon, X } from "lucide-react";

export default function UploadZone({ file, preview, onFile, onClear, disabled }) {
    const inputRef = useRef(null);
    const [dragging, setDragging] = useState(false);

    const handleFiles = useCallback((files) => {
        if (!files || files.length === 0) return;
        const f = files[0];
        if (!f.type.startsWith("image/")) return;
        onFile(f);
    }, [onFile]);

    const onDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        handleFiles(e.dataTransfer.files);
    }, [handleFiles, disabled]);

    if (preview) {
        return (
            <div className="relative q-card overflow-hidden" data-testid="upload-preview-wrapper">
                <div className="aspect-square w-full bg-black flex items-center justify-center">
                    <img
                        src={preview}
                        alt="MRI preview"
                        className="max-h-full max-w-full object-contain"
                        data-testid="upload-preview-image"
                    />
                </div>
                <div className="absolute top-3 right-3 flex gap-2">
                    <button
                        onClick={onClear}
                        disabled={disabled}
                        data-testid="upload-clear-button"
                        className="px-2.5 py-1.5 rounded-md bg-black/60 backdrop-blur border border-white/10 text-xs text-slate-200 hover:bg-black/80 disabled:opacity-50 flex items-center gap-1.5"
                    >
                        <X size={13} /> Clear
                    </button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 px-4 py-2.5 bg-gradient-to-t from-black/80 to-transparent">
                    <div className="data-label text-slate-300 truncate" data-testid="upload-filename">
                        {file?.name || "scan.jpg"}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            onClick={() => !disabled && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            data-testid="upload-dropzone"
            className={`q-card aspect-square w-full flex flex-col items-center justify-center text-center px-6 cursor-pointer transition-all border-dashed ${
                dragging
                    ? "border-violet-400 bg-violet-500/5"
                    : "border-slate-700 hover:border-slate-500 hover:bg-slate-900/40"
            } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
            style={{ borderStyle: "dashed", borderWidth: 1 }}
        >
            <div className="w-14 h-14 rounded-full bg-violet-500/10 border border-violet-500/30 flex items-center justify-center mb-4">
                <UploadCloud size={26} className="text-violet-300" />
            </div>
            <div className="font-heading font-semibold text-lg text-slate-100 tracking-tight">
                Drop MRI scan here
            </div>
            <div className="text-sm text-slate-400 mt-1">
                or click to browse · JPG or PNG · max 10MB
            </div>
            <div className="mt-6 flex items-center gap-2 data-label">
                <ImageIcon size={11} /> T1 · T2 · FLAIR supported
            </div>
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
                data-testid="upload-file-input"
            />
        </div>
    );
}
