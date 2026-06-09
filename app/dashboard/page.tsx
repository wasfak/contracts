"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, LabelList, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Area,
  // Cell used for PieChart
} from "recharts";

/* ─── types ──────────────────────────────────────────────────────────────── */
interface PeriodData {
  label: string; periodFrom: string;
  purchaseQty: number; purchaseAmount: number;
  salesQty: number; salesAmount: number; salesProfit: number;
  avgUnitCost: number;
}
interface PriceComparison {
  code: string; name: string;
  cheapestSupplier: string; cheapestCost: number;
  dearestSupplier: string; dearestCost: number;
  spread: number; spreadPct: number;
  potentialSaving: number; supplierCount: number;
}
interface ProductData {
  code: string; name: string;
  purchaseQty: number; purchaseAmount: number;
  salesQty: number; salesAmount: number;
  profit: number; sellThroughRate: number; margin: number;
}
interface DistributorData { supplier: string; totalAmount: number; totalQty: number; share: number; }
interface KPI {
  totalPurchase2025: number; totalSales2025: number; totalProfit2025: number;
  ytdPurchase2026: number; ytdSales2026: number;
  grossMargin: number; returnsRate: number; returnValue: number; returnQty: number;
  deadStockCount: number; purchasedCodes: number;
}
interface DashboardData {
  byPeriod: PeriodData[]; topProducts: ProductData[];
  byDistributor: DistributorData[]; kpi: KPI;
  productByQuarter: Record<string, string | number>[];
  quarters: string[];
  priceComparison: PriceComparison[];
}

/* ─── color palette ──────────────────────────────────────────────────────── */
const C = {
  purchase: "#6366f1",
  sales:    "#f59e0b",
  profit:   "#10b981",
  y2025p:   "#6366f1",
  y2026p:   "#818cf8",
  y2025s:   "#f59e0b",
  y2026s:   "#fcd34d",
};

const PIE_COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#ec4899","#8b5cf6","#14b8a6"];
const QUARTER_COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#ec4899","#8b5cf6","#f97316"];

/* ─── helpers ────────────────────────────────────────────────────────────── */
function egp(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " EGP";
}
function pct(n: number) { return n.toFixed(1) + "%"; }

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const seen = new Set<string>();
  const unique = payload.filter((p) => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
  return (
    <div className="rounded-xl border border-zinc-100 bg-white p-3 shadow-xl text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-zinc-700 mb-2 border-b border-zinc-100 pb-1">{label}</p>
      {unique.map((p, i) => (
        <div key={`${p.name}-${i}`} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-zinc-500">{p.name}</span>
          </span>
          <span className="font-semibold text-zinc-800">
            {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── KPI card ───────────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
        {color && <span className="h-2.5 w-2.5 rounded-full mt-0.5" style={{ background: color }} />}
      </div>
      <p className="mt-3 text-2xl font-bold text-zinc-900 tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-400">{sub}</p>}
    </div>
  );
}

/* ─── section wrapper ────────────────────────────────────────────────────── */
function Section({ title, explain, children }: {
  title: string; explain: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm space-y-2">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-zinc-800 uppercase tracking-wide">{title}</h3>
        <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{explain}</p>
      </div>
      {children}
    </div>
  );
}


/* ─── main page ──────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [codes, setCodes] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<string[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [yoyMetric, setYoyMetric] = useState<"purchaseAmount" | "salesAmount" | "purchaseQty">("purchaseAmount");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setCodes([]); setData(null); setSuppliers(null); setExcluded(new Set()); setError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
        const extracted: string[] = [];
        for (const row of rows as unknown[][])
          for (const cell of row) {
            const v = String(cell ?? "").trim();
            if (/^\d+$/.test(v)) extracted.push(v);
          }
        const unique = Array.from(new Set(extracted));
        if (unique.length === 0) setError("No numeric codes found.");
        else setCodes(unique);
      } catch { setError("Failed to read Excel file."); }
    };
    reader.readAsArrayBuffer(file);
  }

  async function fetchSuppliers() {
    setError(""); setSuppliersLoading(true); setSuppliers(null); setData(null);
    try {
      const res = await fetch("/api/dashboard/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to fetch suppliers."); return; }
      setSuppliers(json.suppliers);
      setExcluded(new Set());
    } catch { setError("Network error."); }
    finally { setSuppliersLoading(false); }
  }

  function toggleSupplier(s: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  }

  async function handleLoad() {
    setError(""); setData(null);
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes, excludedSuppliers: Array.from(excluded) }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed."); return; }
      setData(json);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }

  // ── YoY data: one metric, quarter groups of 2025 vs 2026 ─────────────────
  const yoyData = data
    ? (["Q1", "Q2"] as const).map((q) => {
        const p25 = data.byPeriod.find((p) => p.label === `${q} 2025`);
        const p26 = data.byPeriod.find((p) => p.label === `${q} 2026`);
        return {
          quarter: q,
          "2025": p25 ? Math.round(p25[yoyMetric]) : null,
          "2026": p26 ? Math.round(p26[yoyMetric]) : null,
        };
      })
    : [];

  const hasYoy = yoyData.some((d) => d["2026"] !== null);
  const yoyIsMoney = yoyMetric !== "purchaseQty";

  // ── inventory build-up: cumulative (purchase units − sales units) ────────
  const inventoryData = data
    ? data.byPeriod.reduce<{ label: string; gap: number; cumulative: number }[]>((acc, p) => {
        const gap = p.purchaseQty - p.salesQty;
        const prev = acc.length ? acc[acc.length - 1].cumulative : 0;
        acc.push({ label: p.label, gap, cumulative: prev + gap });
        return acc;
      }, [])
    : [];

  // custom % label rendered above each 2026 bar
  function YoyPctLabel(props: Record<string, unknown>) {
    const x = props.x as number;
    const y = props.y as number;
    const width = props.width as number;
    const value = props.value as number | null;
    const index = props.index as number;
    const base = yoyData[index]?.["2025"] as number | null;
    if (!value || !base) return null;
    const delta = ((value - base) / base) * 100;
    const pos = delta >= 0;
    return (
      <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={pos ? "#10b981" : "#ef4444"}>
        {pos ? "+" : ""}{delta.toFixed(1)}%
      </text>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4">
      <div className="mx-auto max-w-7xl space-y-8">

        {/* header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Contract Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-1">Upload your manufacturer's product codes to analyse performance across all periods</p>
        </div>

        {/* step 1 — excel upload */}
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm space-y-4">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Step 1 — Upload Product Codes</p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-500 hover:bg-zinc-100 transition min-w-[220px] text-left truncate"
              >
                {fileName || "Upload .xlsx / .xls"}
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
              {codes.length > 0 && <p className="text-xs text-emerald-600 font-medium">{codes.length} codes loaded</p>}
            </div>
            <button
              onClick={fetchSuppliers}
              disabled={suppliersLoading || codes.length === 0}
              className="rounded-xl bg-zinc-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 transition"
            >
              {suppliersLoading ? "Fetching…" : "Fetch Suppliers →"}
            </button>
          </div>

          {/* step 2 — supplier checkboxes */}
          {suppliers !== null && (
            <div className="border-t border-zinc-100 pt-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                Step 2 — Choose Suppliers to Include
              </p>
              <div className="flex flex-wrap gap-2">
                {suppliers.map((s) => {
                  const checked = !excluded.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSupplier(s)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
                        checked
                          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                          : "border-zinc-200 bg-zinc-50 text-zinc-400 line-through"
                      }`}
                    >
                      <span className={`h-3 w-3 rounded flex-shrink-0 border-2 flex items-center justify-center ${
                        checked ? "border-indigo-500 bg-indigo-500" : "border-zinc-300 bg-white"
                      }`}>
                        {checked && <span className="text-white text-[8px] leading-none">✓</span>}
                      </span>
                      {s}
                    </button>
                  );
                })}
              </div>
              {excluded.size > 0 && (
                <p className="text-xs text-amber-600 font-medium">
                  {excluded.size} supplier{excluded.size > 1 ? "s" : ""} excluded from purchase data
                </p>
              )}
              <button
                onClick={handleLoad}
                disabled={loading || (suppliers.length > 0 && excluded.size === suppliers.length)}
                className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition shadow-sm shadow-indigo-200"
              >
                {loading ? "Loading…" : "Load Dashboard"}
              </button>
            </div>
          )}

          {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
        </div>

        {data && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard label="2025 Total Purchases" value={egp(data.kpi.totalPurchase2025)} color={C.purchase} />
              <KpiCard label="2025 Total Sales" value={egp(data.kpi.totalSales2025)} sub={`Profit: ${egp(data.kpi.totalProfit2025)}`} color={C.sales} />
              <KpiCard
                label="2025 Sell-Through"
                value={pct(data.kpi.totalPurchase2025 > 0 ? (data.kpi.totalSales2025 / data.kpi.totalPurchase2025) * 100 : 0)}
                sub="Sales ÷ Purchases value"
                color={C.profit}
              />
              <KpiCard label="YTD 2026 Purchases" value={egp(data.kpi.ytdPurchase2026)} color={C.purchase} />
              <KpiCard
                label="YTD 2026 Sales"
                value={egp(data.kpi.ytdSales2026)}
                sub={`Margin: ${pct(data.kpi.ytdSales2026 > 0 ? ((data.kpi.ytdSales2026 - data.kpi.ytdPurchase2026) / data.kpi.ytdSales2026) * 100 : 0)}`}
                color={C.sales}
              />
              <KpiCard label="Gross Margin" value={pct(data.kpi.grossMargin)} sub="Profit ÷ Sales (all periods)" color={C.profit} />
              <KpiCard label="Returns Rate" value={pct(data.kpi.returnsRate)} sub={`${egp(data.kpi.returnValue)} returned`} color="#ef4444" />
              <KpiCard label="Dead Stock" value={`${data.kpi.deadStockCount} / ${data.kpi.purchasedCodes}`} sub="Bought but never sold" color="#f97316" />
            </div>

            {/* Quarterly trend EGP */}
            <Section
              title="Quarterly Trend — Purchases vs Sales (EGP)"
              explain="How much money you spent buying vs. how much you earned selling each quarter. The green line shows your profit. A rising profit line with stable purchases means improving margins."
            >
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={data.byPeriod} margin={{ top: 5, right: 20, left: 20, bottom: 5 }} barGap={4} barCategoryGap="30%">
                  <defs>
                    <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.profit} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={C.profit} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                  <Bar dataKey="purchaseAmount" name="Purchases (EGP)" fill={C.purchase} radius={[6, 6, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="salesAmount" name="Sales (EGP)" fill={C.sales} radius={[6, 6, 0, 0]} maxBarSize={40} />
                  <Area type="monotone" dataKey="salesProfit" name="Profit (EGP)" fill="url(#profitGrad)" stroke={C.profit} strokeWidth={0} />
                  <Line type="monotone" dataKey="salesProfit" name="Profit (EGP)" stroke={C.profit} strokeWidth={2.5} dot={{ r: 5, fill: C.profit, strokeWidth: 2, stroke: "#fff" }} legendType="none" />
                </ComposedChart>
              </ResponsiveContainer>
            </Section>

            {/* Quarterly trend units */}
            <Section
              title="Quarterly Trend — Units"
              explain="The number of boxes/units you bought and sold each quarter regardless of price. Use this to spot seasonal patterns — a quarter with high purchase units but lower sales units means stock is building up."
            >
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.byPeriod} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                  <Bar dataKey="purchaseQty" name="Purchase Units" fill={C.purchase} radius={[6, 6, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="salesQty" name="Sales Units" fill={C.sales} radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </Section>

            {/* Unit Cost Trend — negotiation core */}
            <Section
              title="Average Unit Cost Trend (EGP) — what you're being charged"
              explain="The effective price you pay per unit each quarter (purchase value ÷ units, returns excluded). A rising line means cost inflation — your strongest evidence to demand a price freeze or bigger rebate in the new contract."
            >
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.byPeriod} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v) => v.toFixed(0)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="avgUnitCost" name="Avg Unit Cost (EGP)" stroke="#ef4444" strokeWidth={3}
                    dot={{ r: 5, fill: "#ef4444", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 7 }}>
                    <LabelList dataKey="avgUnitCost" position="top" fontSize={11} fontWeight={600} fill="#ef4444"
                      formatter={(v) => Number(v).toFixed(1)} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </Section>

            {/* Distributor Price Comparison — negotiation core */}
            {data.priceComparison.length > 0 && (
              <Section
                title="Distributor Price Comparison — same product, different cost"
                explain="Products you buy from more than one distributor, showing the cheapest vs. the most expensive unit cost. 'Potential Saving' is what you'd keep if every unit had been bought at the cheapest price. Use this to push every distributor down to the best rate."
              >
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100">
                        {["Product","Cheapest","Most Expensive","Spread","Potential Saving"].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {data.priceComparison.map((r) => (
                        <tr key={r.code} className="hover:bg-zinc-50 transition-colors">
                          <td className="px-3 py-2.5 text-zinc-700 max-w-[220px] truncate font-medium" title={r.name}>{r.name}</td>
                          <td className="px-3 py-2.5">
                            <span className="font-semibold text-emerald-600">{r.cheapestCost.toLocaleString()}</span>
                            <span className="text-zinc-400 text-xs"> · {r.cheapestSupplier}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="font-semibold text-red-500">{r.dearestCost.toLocaleString()}</span>
                            <span className="text-zinc-400 text-xs"> · {r.dearestSupplier}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-flex rounded-full bg-amber-50 text-amber-700 px-2.5 py-0.5 text-xs font-semibold">
                              +{r.spread.toLocaleString()} ({r.spreadPct}%)
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-emerald-600">{egp(r.potentialSaving)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* Inventory build-up */}
            <Section
              title="Inventory Build-Up — units bought minus units sold"
              explain="Each bar is one quarter's gap (purchases − sales in units). Positive (orange) means you bought more than you sold that quarter — stock piling up. The green line is the running total: if it keeps climbing, cash is tied up on shelves and you should negotiate lower minimum order quantities."
            >
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={inventoryData} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                  <Bar dataKey="gap" name="Quarter Gap (units)" radius={[5, 5, 0, 0]} maxBarSize={44}>
                    {inventoryData.map((d, i) => (
                      <Cell key={i} fill={d.gap >= 0 ? "#f97316" : "#10b981"} />
                    ))}
                  </Bar>
                  <Line type="monotone" dataKey="cumulative" name="Running Total (units)" stroke={C.profit} strokeWidth={2.5}
                    dot={{ r: 4, fill: C.profit, strokeWidth: 2, stroke: "#fff" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </Section>

            {/* YoY — quarter groups, 2025 beside 2026 */}
            {hasYoy && (
              <Section
                title="Year-over-Year Comparison — Q1 & Q2"
                explain="Each quarter shows 2025 next to 2026 for the metric you pick. The % above each 2026 bar shows the change vs the same quarter last year — green means growth, red means decline."
              >
                <div className="mb-4 flex items-center gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Compare by</label>
                  <select
                    value={yoyMetric}
                    onChange={(e) => setYoyMetric(e.target.value as typeof yoyMetric)}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="purchaseAmount">Purchases (EGP)</option>
                    <option value="salesAmount">Sales (EGP)</option>
                    <option value="purchaseQty">Units (Purchased)</option>
                  </select>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={yoyData} margin={{ top: 28, right: 20, left: 20, bottom: 5 }} barGap={6} barCategoryGap="40%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="quarter" tick={{ fontSize: 13, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => (yoyIsMoney ? (v / 1000).toFixed(0) + "k" : v.toLocaleString())}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                    <Bar dataKey="2025" name="2025" fill={C.y2025p} radius={[5, 5, 0, 0]} maxBarSize={48} />
                    <Bar dataKey="2026" name="2026" fill={C.y2026p} radius={[5, 5, 0, 0]} maxBarSize={48}>
                      <LabelList content={YoyPctLabel as never} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Section>
            )}

            {/* Product quarterly breakdown */}
            <Section
              title="Top Products — Purchase Value by Quarter (EGP)"
              explain="Each bar is one product, broken down by quarter. This shows which products drove volume in each period — helping you identify seasonal products (Q4 spikes) vs. steady movers."
            >
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={data.productByQuarter} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#52525b" }} width={150} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                  {data.quarters.map((q, i) => (
                    <Bar key={q} dataKey={q} stackId="a" fill={QUARTER_COLORS[i % QUARTER_COLORS.length]}
                      radius={i === data.quarters.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Section>

            {/* Top products + distributor */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Section
                title="Top 10 Products — Purchase vs Sales Value"
                explain="Ranks your top products by how much you spent purchasing them, compared against what you earned selling them. Products where sales exceed purchases are your most profitable lines."
              >
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart layout="vertical" data={data.topProducts} margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#52525b" }} width={150} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                    <Bar dataKey="purchaseAmount" name="Purchase (EGP)" fill={C.purchase} radius={[0, 6, 6, 0]} maxBarSize={14} />
                    <Bar dataKey="salesAmount" name="Sales (EGP)" fill={C.sales} radius={[0, 6, 6, 0]} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </Section>

              <Section
                title="Distributor Share"
                explain="How your purchases are split across distributors. Heavy concentration in one distributor is a risk — if they have a shortage or price increase, your whole supply is affected."
              >
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={260}>
                    <PieChart>
                      <Pie data={data.byDistributor} dataKey="totalAmount" nameKey="supplier"
                        cx="50%" cy="50%" innerRadius={55} outerRadius={105} paddingAngle={3}
                      >
                        {data.byDistributor.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [egp(Number(v)), "Amount"]}
                        contentStyle={{ borderRadius: 12, border: "1px solid #f1f5f9", fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2.5 text-xs">
                    {data.byDistributor.map((d, i) => (
                      <div key={d.supplier} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-zinc-500 truncate flex-1">{d.supplier}</span>
                        <span className="font-bold text-zinc-800">{d.share}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>
            </div>

            {/* Sell-through table */}
            <Section
              title="Top Products — Sell-Through & Margin"
              explain="Sell-through = how much of what you bought you actually sold. A low rate means over-buying. Margin = profit as a % of sales revenue. Use both together to decide which products deserve volume commitments in the new contract."
            >
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      {["Product","Buy Qty","Buy (EGP)","Sell Qty","Sell (EGP)","Profit","Sell-Through","Margin"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {data.topProducts.map((p) => (
                      <tr key={p.code} className="hover:bg-zinc-50 transition-colors">
                        <td className="px-3 py-2.5 text-zinc-700 max-w-[200px] truncate font-medium" title={p.name}>{p.name}</td>
                        <td className="px-3 py-2.5 text-right text-zinc-600">{p.purchaseQty.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right text-zinc-600">{p.purchaseAmount.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right text-zinc-600">{p.salesQty.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right text-zinc-600">{p.salesAmount.toLocaleString()}</td>
                        <td className={`px-3 py-2.5 text-right font-semibold ${p.profit < 0 ? "text-red-500" : "text-emerald-600"}`}>
                          {p.profit.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            p.sellThroughRate >= 80 ? "bg-emerald-50 text-emerald-700" :
                            p.sellThroughRate >= 50 ? "bg-amber-50 text-amber-700" :
                            "bg-red-50 text-red-600"}`}>
                            {p.sellThroughRate}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            p.margin >= 20 ? "bg-emerald-50 text-emerald-700" :
                            p.margin >= 10 ? "bg-amber-50 text-amber-700" :
                            "bg-red-50 text-red-600"}`}>
                            {p.margin}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* Profit trend */}
            <Section
              title="Profit Trend by Quarter (EGP)"
              explain="Your net profit from this manufacturer's products over time. A consistent upward trend is your strongest argument for negotiating better rebate tiers in the new contract."
            >
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.byPeriod} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="profitArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.profit} stopOpacity={0.12} />
                      <stop offset="95%" stopColor={C.profit} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="salesProfit" fill="url(#profitArea)" stroke="none" />
                  <Line type="monotone" dataKey="salesProfit" name="Profit (EGP)" stroke={C.profit} strokeWidth={3}
                    dot={{ r: 6, fill: C.profit, strokeWidth: 2.5, stroke: "#fff" }}
                    activeDot={{ r: 8, fill: C.profit, stroke: "#fff", strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
