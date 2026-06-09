"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type UploadResult = {
  kind: "purchase" | "sale";
  pharmacy: string;
  period: { from: string; to: string };
  parsed: number;
  inserted: number;
  updated: number;
};

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const body = new FormData();
    body.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold mb-2">Upload report</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Upload a purchases or sales export (.htm / .html). The type is detected
        automatically.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="file"
          accept=".htm,.html"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-white"
        />
        <Button type="submit" disabled={!file || loading}>
          {loading ? "Uploading…" : "Upload"}
        </Button>
      </form>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-6 rounded-md border border-neutral-200 p-4 text-sm">
          <p className="font-medium">
            {result.kind === "purchase" ? "Purchases" : "Sales"} saved ✓
          </p>
          <ul className="mt-2 space-y-1 text-neutral-600">
            <li>Pharmacy: {result.pharmacy || "—"}</li>
            <li>
              Period: {result.period.from} → {result.period.to}
            </li>
            <li>Rows parsed: {result.parsed}</li>
            <li>Inserted: {result.inserted}</li>
            <li>Updated: {result.updated}</li>
          </ul>
        </div>
      )}
    </main>
  );
}
