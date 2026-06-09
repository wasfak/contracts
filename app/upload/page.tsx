"use client";

import { useState, useRef } from "react";

type FileResult = {
  file: string;
  error?: string;
  kind?: "purchase" | "sale";
  pharmacy?: string;
  period?: { from: string; to: string };
  parsed?: number;
  inserted?: number;
  updated?: number;
};

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    setFiles(selected);
    setResults([]);
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setLoading(true);
    setResults([]);

    const body = new FormData();
    for (const f of files) body.append("file", f);

    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setResults([{ file: "—", error: data.error ?? "Upload failed." }]);
      } else {
        setResults(data.results);
      }
    } catch {
      setResults([{ file: "—", error: "Network error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold text-zinc-900">Upload Reports</h1>
        <p className="text-sm text-zinc-500">
          Select any number of .html report files. Sales and purchases are detected automatically.
        </p>

        {/* Drop zone */}
        <div
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-xl border-2 border-dashed border-zinc-300 bg-white px-6 py-10 text-center hover:border-zinc-400 hover:bg-zinc-50 transition"
        >
          <p className="text-sm font-medium text-zinc-600">
            {files.length > 0
              ? `${files.length} file${files.length > 1 ? "s" : ""} selected`
              : "Click to select .html files"}
          </p>
          {files.length > 0 && (
            <ul className="mt-3 space-y-1 text-left text-xs text-zinc-500 max-h-40 overflow-y-auto">
              {files.map((f) => (
                <li key={f.name} className="truncate">• {f.name}</li>
              ))}
            </ul>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".htm,.html"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={files.length === 0 || loading}
          className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 transition"
        >
          {loading ? `Uploading ${files.length} file${files.length > 1 ? "s" : ""}…` : "Upload All"}
        </button>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((r, i) => (
              <div
                key={i}
                className={`rounded-lg border p-4 text-sm ${
                  r.error
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-zinc-200 bg-white"
                }`}
              >
                <p className="font-medium truncate">{r.file}</p>
                {r.error ? (
                  <p className="mt-1 text-xs">{r.error}</p>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-500">
                    <span>Type: <strong className="text-zinc-800">{r.kind}</strong></span>
                    <span>Pharmacy: <strong className="text-zinc-800">{r.pharmacy || "—"}</strong></span>
                    <span>Period: <strong className="text-zinc-800">{r.period?.from} → {r.period?.to}</strong></span>
                    <span>Parsed: <strong className="text-zinc-800">{r.parsed}</strong></span>
                    <span>Inserted: <strong className="text-zinc-800">{r.inserted}</strong></span>
                    <span>Updated: <strong className="text-zinc-800">{r.updated}</strong></span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
