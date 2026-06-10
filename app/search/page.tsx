"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";

/* ─── types ─────────────────────────────────────────────────────────────── */
interface SaleRow {
  _id: string;
  code: string;
  name: string;
  supplier: string;
  quantity: number;
  amount: number;
  profit: number | null;
  periodFrom: string;
  periodTo: string;
}

interface PurchaseRow {
  _id: string;
  code: string;
  name: string;
  supplier: string;
  quantity: number;
  amount: number;
  unitCost: number | null;
  periodFrom: string;
  periodTo: string;
}

interface SearchResult {
  sales: SaleRow[];
  purchases: PurchaseRow[];
}

type SortDir = "asc" | "desc" | null;
type SortState<K extends string> = { key: K; dir: "asc" | "desc" } | null;

/* ─── helpers ────────────────────────────────────────────────────────────── */
function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function period(row: { periodFrom: string; periodTo: string }) {
  return `${row.periodFrom.slice(0, 10)} → ${row.periodTo.slice(0, 10)}`;
}

function sortIcon(dir: SortDir) {
  if (!dir) return <span className="ml-1 opacity-25">↕</span>;
  return <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>;
}

function nextDir(current: SortDir): "asc" | "desc" {
  return current === "asc" ? "desc" : "asc";
}

const PAGE_SIZE = 10;

/* ─── Pagination ─────────────────────────────────────────────────────────── */
function Pagination({ page, totalPages, onChange }: {
  page: number; totalPages: number; onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 border-t border-zinc-200 text-sm">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        ← Prev
      </button>
      <span className="text-xs text-zinc-500">
        Page {page + 1} of {totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        Next →
      </button>
    </div>
  );
}

function sortRows<T>(rows: T[], sort: SortState<string>): T[] {
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sort.key];
    const bv = (b as Record<string, unknown>)[sort.key];
    let cmp = 0;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
    return sort.dir === "asc" ? cmp : -cmp;
  });
}

/* ─── SortableTh ─────────────────────────────────────────────────────────── */
function SortableTh<K extends string>({
  label,
  colKey,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  colKey: K;
  sort: SortState<K>;
  onSort: (k: K) => void;
  className?: string;
}) {
  const active = sort?.key === colKey;
  return (
    <th
      onClick={() => onSort(colKey)}
      className={`px-3 py-2 cursor-pointer select-none hover:bg-zinc-200 whitespace-nowrap ${className}`}
    >
      {label}
      {sortIcon(active ? sort!.dir : null)}
    </th>
  );
}

/* ─── SalesTable ─────────────────────────────────────────────────────────── */
type SaleKey = keyof SaleRow;

function SalesTable({ rows }: { rows: SaleRow[] }) {
  const [sort, setSort] = useState<SortState<SaleKey>>(null);
  const [page, setPage] = useState(0);

  function handleSort(k: SaleKey) {
    setSort((prev) =>
      prev?.key === k ? { key: k, dir: nextDir(prev.dir) } : { key: k, dir: "asc" }
    );
    setPage(0);
  }

  if (rows.length === 0)
    return <p className="text-sm text-zinc-500">No sales found.</p>;

  const sorted = sortRows(rows, sort);
  const totalQty = sorted.reduce((s, r) => s + r.quantity, 0);
  const totalAmt = sorted.reduce((s, r) => s + r.amount, 0);
  const totalProfit = sorted.reduce((s, r) => s + (r.profit ?? 0), 0);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const th = (label: string, k: SaleKey, cls = "") => (
    <SortableTh label={label} colKey={k} sort={sort} onSort={handleSort} className={cls} />
  );

  return (
    <div className="space-y-3">
      {/* Totals bar — on top */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold">
        <span className="text-xs uppercase tracking-wide text-zinc-400">Totals</span>
        <span>Qty: <span className="font-bold">{fmt(totalQty)}</span></span>
        <span>Amount: <span className="font-bold">{fmt(totalAmt)}</span></span>
        <span className={totalProfit < 0 ? "text-red-600" : "text-green-700"}>
          Profit: <span className="font-bold">{fmt(totalProfit)}</span>
        </span>
        <span className="ml-auto text-xs font-normal text-zinc-400">{sorted.length} records</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-100 text-xs font-semibold text-zinc-600 uppercase tracking-wide">
            <tr>
              {th("Code", "code", "text-left")}
              {th("Name", "name", "text-left")}
              {th("Supplier", "supplier", "text-left")}
              {th("Qty", "quantity", "text-right")}
              {th("Amount", "amount", "text-right")}
              {th("Profit", "profit", "text-right")}
              {th("Period", "periodFrom", "text-left")}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {pageRows.map((r) => (
              <tr key={r._id} className="hover:bg-zinc-50">
                <td className="px-3 py-2 font-mono">{r.code}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.supplier}</td>
                <td className="px-3 py-2 text-right">{fmt(r.quantity)}</td>
                <td className="px-3 py-2 text-right">{fmt(r.amount)}</td>
                <td
                  className={`px-3 py-2 text-right ${
                    (r.profit ?? 0) < 0 ? "text-red-600" : "text-green-700"
                  }`}
                >
                  {fmt(r.profit)}
                </td>
                <td className="px-3 py-2 text-zinc-500 text-xs">{period(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </div>
  );
}

/* ─── PurchasesSection ───────────────────────────────────────────────────── */
type PurchaseKey = keyof PurchaseRow;

function PurchasesSection({ rows }: { rows: PurchaseRow[] }) {
  const suppliers = Array.from(new Set(rows.map((r) => r.supplier))).sort();

  const [checked, setChecked] = useState<Set<string>>(() => new Set(suppliers));
  // confirmed = user clicked "Show Results" after adjusting checkboxes
  const [confirmed, setConfirmed] = useState(false);
  const [removeReturns, setRemoveReturns] = useState(false);
  const [sort, setSort] = useState<SortState<PurchaseKey>>(null);
  const [page, setPage] = useState(0);

  function toggleSupplier(s: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
    // Changing suppliers requires re-confirmation
    setConfirmed(false);
    setPage(0);
  }

  function handleSort(k: PurchaseKey) {
    setSort((prev) =>
      prev?.key === k ? { key: k, dir: nextDir(prev.dir) } : { key: k, dir: "asc" }
    );
    setPage(0);
  }

  function toggleRemoveReturns() {
    setRemoveReturns((v) => !v);
    setPage(0);
  }

  if (rows.length === 0)
    return <p className="text-sm text-zinc-500">No purchases found.</p>;

  let visible = rows.filter((r) => checked.has(r.supplier));
  if (removeReturns) visible = visible.filter((r) => r.amount >= 0);
  const sorted = sortRows(visible, sort);

  const totalQty = sorted.reduce((s, r) => s + r.quantity, 0);
  const totalAmt = sorted.reduce((s, r) => s + r.amount, 0);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const th = (label: string, k: PurchaseKey, cls = "") => (
    <SortableTh label={label} colKey={k} sort={sort} onSort={handleSort} className={cls} />
  );

  return (
    <div className="space-y-4">
      {/* Supplier filter */}
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 space-y-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          Select suppliers to include
        </p>
        <div className="flex flex-wrap gap-3">
          {suppliers.map((s) => (
            <label key={s} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checked.has(s)}
                onChange={() => toggleSupplier(s)}
                className="h-4 w-4 rounded border-zinc-300 accent-zinc-800"
              />
              <span className="text-sm">{s}</span>
            </label>
          ))}
        </div>
        <button
          onClick={() => setConfirmed(true)}
          className="mt-1 rounded-lg bg-zinc-800 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-600 transition"
        >
          Show Results
        </button>
      </div>

      {/* Table — only after confirmation */}
      {confirmed && (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleRemoveReturns}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                removeReturns
                  ? "bg-red-600 border-red-600 text-white hover:bg-red-500"
                  : "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {removeReturns ? "Show Returns" : "Remove Returns"}
            </button>
            {removeReturns && (
              <span className="text-xs text-zinc-400">Negative rows hidden</span>
            )}
          </div>

          {sorted.length === 0 ? (
            <p className="text-sm text-zinc-500">No rows to display.</p>
          ) : (
            <>
              {/* Totals bar — on top */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm font-semibold">
                <span className="text-xs uppercase tracking-wide text-zinc-400">
                  {removeReturns ? "Net Totals" : "Totals"}
                </span>
                <span className={totalQty < 0 ? "text-red-600" : ""}>
                  Qty: <span className="font-bold">{fmt(totalQty)}</span>
                </span>
                <span className={totalAmt < 0 ? "text-red-600" : ""}>
                  Total: <span className="font-bold">{fmt(totalAmt)}</span>
                </span>
                <span className="ml-auto text-xs font-normal text-zinc-400">{sorted.length} records</span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-zinc-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-100 text-xs font-semibold text-zinc-600 uppercase tracking-wide">
                    <tr>
                      {th("Code", "code", "text-left")}
                      {th("Name", "name", "text-left")}
                      {th("Supplier", "supplier", "text-left")}
                      {th("Qty", "quantity", "text-right")}
                      {th("Unit Cost", "unitCost", "text-right")}
                      {th("Total", "amount", "text-right")}
                      {th("Period", "periodFrom", "text-left")}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {pageRows.map((r) => (
                      <tr
                        key={r._id}
                        className={`hover:bg-zinc-50 ${r.amount < 0 ? "bg-red-50" : ""}`}
                      >
                        <td className="px-3 py-2 font-mono">{r.code}</td>
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2">{r.supplier}</td>
                        <td
                          className={`px-3 py-2 text-right ${
                            r.quantity < 0 ? "text-red-600" : ""
                          }`}
                        >
                          {fmt(r.quantity)}
                        </td>
                        <td className="px-3 py-2 text-right">{fmt(r.unitCost)}</td>
                        <td
                          className={`px-3 py-2 text-right font-medium ${
                            r.amount < 0 ? "text-red-600" : ""
                          }`}
                        >
                          {fmt(r.amount)}
                        </td>
                        <td className="px-3 py-2 text-zinc-500 text-xs">{period(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={page} totalPages={totalPages} onChange={setPage} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ─── main page ──────────────────────────────────────────────────────────── */
export default function SearchPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCodes([]);
    setResult(null);
    setError("");

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

        const extracted: string[] = [];
        for (const row of rows as unknown[][]) {
          for (const cell of row) {
            const v = String(cell ?? "").trim();
            if (/^\d+$/.test(v)) extracted.push(v);
          }
        }
        const unique = Array.from(new Set(extracted));
        if (unique.length === 0) {
          setError("No numeric codes found in the Excel file.");
        } else {
          setCodes(unique);
        }
      } catch {
        setError("Failed to read Excel file.");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleSearch() {
    setError("");
    setResult(null);
    if (!from || !to) { setError("Please select both From and To dates."); return; }
    if (codes.length === 0) { setError("Please upload an Excel file with product codes."); return; }
    if (new Date(from) > new Date(to)) { setError("'From' date must be before 'To' date."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes, from, to }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Search failed."); return; }
      setResult(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4">
      <div className="mx-auto max-w-6xl space-y-8">
        <h1 className="text-2xl font-bold text-zinc-900">Product Search</h1>

        {/* ── controls ── */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                From
              </label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                To
              </label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Codes (Excel)
              </label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 transition text-left truncate"
              >
                {fileName || "Upload .xlsx / .xls"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFile}
                className="hidden"
              />
              {codes.length > 0 && (
                <p className="text-xs text-green-700">{codes.length} codes loaded</p>
              )}
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="h-10 rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 transition"
            >
              {loading ? "Searching…" : "Search"}
            </button>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        {/* ── results ── */}
        {result && (
          <div className="space-y-10">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-zinc-800">
                Purchases
                <span className="ml-2 text-sm font-normal text-zinc-400">
                  ({result.purchases.length} records)
                </span>
              </h2>
              <PurchasesSection rows={result.purchases} />
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-zinc-800">
                Sales
                <span className="ml-2 text-sm font-normal text-zinc-400">
                  ({result.sales.length} records)
                </span>
              </h2>
              <SalesTable rows={result.sales} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
