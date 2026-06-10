import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Transaction } from "@/lib/models/Transaction";

export const runtime = "nodejs";

function quarterLabel(date: Date): string {
  const d = new Date(date);
  const q = Math.ceil((d.getUTCMonth() + 1) / 3);
  return `Q${q} ${d.getUTCFullYear()}`;
}

export async function POST(request: Request) {
  const { codes, excludedSuppliers = [] } = await request.json() as { codes: string[]; excludedSuppliers?: string[] };

  if (!Array.isArray(codes) || codes.length === 0) {
    return NextResponse.json({ error: "No codes provided." }, { status: 400 });
  }

  await connectDB();

  const purchaseMatch = { code: { $in: codes }, kind: "purchase", ...(excludedSuppliers.length ? { supplier: { $nin: excludedSuppliers } } : {}) };

  const [
    byPeriodRaw, topProductsRaw, byDistributorRaw, salesByProductRaw, productByQuarterRaw,
    costTrendRaw, distributorPricesRaw, returnsRaw, sourcingRaw, grossPurchaseRaw,
  ] =
    await Promise.all([
      // Purchases + sales totals per period.
      // Supplier exclusion applies to PURCHASES only — sales must stay complete.
      Transaction.aggregate([
        {
          $match: {
            code: { $in: codes },
            ...(excludedSuppliers.length
              ? { $or: [{ kind: "sale" }, { kind: "purchase", supplier: { $nin: excludedSuppliers } }] }
              : {}),
          },
        },
        {
          $group: {
            _id: { kind: "$kind", periodFrom: "$periodFrom", periodTo: "$periodTo" },
            totalQty: { $sum: "$quantity" },
            totalAmount: { $sum: "$amount" },
            totalProfit: { $sum: { $ifNull: ["$profit", 0] } },
          },
        },
        { $sort: { "_id.periodFrom": 1 } },
      ]),

      // Top 10 products by net purchase amount (all periods)
      Transaction.aggregate([
        { $match: { code: { $in: codes }, kind: "purchase", ...(excludedSuppliers.length ? { supplier: { $nin: excludedSuppliers } } : {}) } },
        {
          $group: {
            _id: "$code",
            name: { $first: "$name" },
            totalQty: { $sum: "$quantity" },
            totalAmount: { $sum: "$amount" },
          },
        },
        { $sort: { totalAmount: -1 } },
        { $limit: 10 },
      ]),

      // Distributor breakdown (purchases, all periods)
      Transaction.aggregate([
        { $match: { code: { $in: codes }, kind: "purchase", ...(excludedSuppliers.length ? { supplier: { $nin: excludedSuppliers } } : {}) } },
        {
          $group: {
            _id: "$supplier",
            totalAmount: { $sum: "$amount" },
            totalQty: { $sum: "$quantity" },
          },
        },
        { $sort: { totalAmount: -1 } },
      ]),

      // Sales per product (for sell-through) — ALL products, not just top 10,
      // so any top-purchase product can find its matching sales.
      Transaction.aggregate([
        { $match: { code: { $in: codes }, kind: "sale" } },
        {
          $group: {
            _id: "$code",
            name: { $first: "$name" },
            totalQty: { $sum: "$quantity" },
            totalAmount: { $sum: "$amount" },
            totalProfit: { $sum: { $ifNull: ["$profit", 0] } },
          },
        },
      ]),

      // Product-level quarterly breakdown (purchases, top 10 by total amount)
      Transaction.aggregate([
        { $match: { code: { $in: codes }, kind: "purchase", ...(excludedSuppliers.length ? { supplier: { $nin: excludedSuppliers } } : {}) } },
        {
          $group: {
            _id: { code: "$code", periodFrom: "$periodFrom" },
            name: { $first: "$name" },
            totalQty: { $sum: "$quantity" },
            totalAmount: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.periodFrom": 1 } },
      ]),

      // ── #1 Effective unit cost per quarter (purchases, returns excluded) ───
      Transaction.aggregate([
        { $match: { ...purchaseMatch, quantity: { $gt: 0 } } },
        {
          $group: {
            _id: { periodFrom: "$periodFrom" },
            qty: { $sum: "$quantity" },
            amt: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.periodFrom": 1 } },
      ]),

      // ── #2 Distributor price comparison: avg unit cost per (code, supplier) ─
      Transaction.aggregate([
        { $match: { ...purchaseMatch, quantity: { $gt: 0 } } },
        {
          $group: {
            _id: { code: "$code", supplier: "$supplier" },
            name: { $first: "$name" },
            qty: { $sum: "$quantity" },
            amt: { $sum: "$amount" },
          },
        },
      ]),

      // ── #3 Returns: gross vs returned value (purchases) ───────────────────
      Transaction.aggregate([
        { $match: purchaseMatch },
        {
          $group: {
            _id: { sign: { $cond: [{ $lt: ["$quantity", 0] }, "return", "gross"] } },
            amt: { $sum: "$amount" },
            qty: { $sum: "$quantity" },
          },
        },
      ]),

      // ── #6 Sourcing: purchased vs sold units per code (for dead stock) ────
      Transaction.aggregate([
        { $match: { code: { $in: codes } } },
        {
          $group: {
            _id: "$code",
            purchased: { $sum: { $cond: [{ $eq: ["$kind", "purchase"] }, "$quantity", 0] } },
            sold: { $sum: { $cond: [{ $eq: ["$kind", "sale"] }, "$quantity", 0] } },
          },
        },
      ]),

      // ── Gross purchases per period (positive rows only, returns excluded) ──
      // Lets us show what was actually ordered, separate from the net figure.
      Transaction.aggregate([
        { $match: { ...purchaseMatch, quantity: { $gt: 0 } } },
        {
          $group: {
            _id: { periodFrom: "$periodFrom" },
            amt: { $sum: "$amount" },
            qty: { $sum: "$quantity" },
          },
        },
      ]),
    ]);

  // ── merge byPeriod into one array per quarter ─────────────────────────────
  const periodMap = new Map<
    string,
    {
      label: string;
      periodFrom: string;
      purchaseQty: number;
      purchaseAmount: number;
      salesQty: number;
      salesAmount: number;
      salesProfit: number;
    }
  >();

  for (const row of byPeriodRaw) {
    const label = quarterLabel(row._id.periodFrom);
    if (!periodMap.has(label)) {
      periodMap.set(label, {
        label,
        periodFrom: new Date(row._id.periodFrom).toISOString().slice(0, 10),
        purchaseQty: 0,
        purchaseAmount: 0,
        salesQty: 0,
        salesAmount: 0,
        salesProfit: 0,
      });
    }
    const entry = periodMap.get(label)!;
    if (row._id.kind === "purchase") {
      entry.purchaseQty += row.totalQty;
      entry.purchaseAmount += row.totalAmount;
    } else {
      entry.salesQty += row.totalQty;
      entry.salesAmount += row.totalAmount;
      entry.salesProfit += row.totalProfit;
    }
  }

  // ── #1 effective unit cost per quarter (returns excluded) ─────────────────
  const costMap = new Map<string, number>();
  for (const r of costTrendRaw as { _id: { periodFrom: Date }; qty: number; amt: number }[]) {
    const label = quarterLabel(r._id.periodFrom);
    costMap.set(label, r.qty > 0 ? r.amt / r.qty : 0);
  }

  const byPeriod = Array.from(periodMap.values())
    .sort((a, b) => new Date(a.periodFrom).getTime() - new Date(b.periodFrom).getTime())
    .map((p) => ({ ...p, avgUnitCost: Math.round((costMap.get(p.label) ?? 0) * 100) / 100 }));

  // ── distributor share % ───────────────────────────────────────────────────
  // Drop placeholder rows that are the manufacturer (المنشأ), not a real
  // distributor: those carry 0 amount AND 0 quantity for every product.
  const realDistributors = byDistributorRaw.filter(
    (r: { totalAmount: number; totalQty: number }) => r.totalAmount !== 0 || r.totalQty !== 0
  );
  const totalDistAmt = realDistributors.reduce((s: number, r: { totalAmount: number }) => s + r.totalAmount, 0);
  const byDistributor = realDistributors.map((r: { _id: string; totalAmount: number; totalQty: number }) => ({
    supplier: r._id || "Unknown",
    totalAmount: r.totalAmount,
    totalQty: r.totalQty,
    share: totalDistAmt > 0 ? Math.round((r.totalAmount / totalDistAmt) * 100) : 0,
  }));

  // ── sell-through per top product ─────────────────────────────────────────
  const salesMap = new Map(salesByProductRaw.map((r: { _id: string; totalQty: number; totalAmount: number; totalProfit: number }) => [r._id, r]));
  const sellThrough = topProductsRaw.map((p: { _id: string; name: string; totalQty: number; totalAmount: number }) => {
    const s = salesMap.get(p._id) as { totalQty: number; totalAmount: number; totalProfit: number } | undefined;
    const salesQty = s?.totalQty ?? 0;
    const salesAmount = s?.totalAmount ?? 0;
    const profit = s?.totalProfit ?? 0;
    const rate = p.totalQty > 0 ? Math.round((salesQty / p.totalQty) * 100) : 0;
    const margin = salesAmount > 0 ? Math.round((profit / salesAmount) * 100) : 0;
    return {
      code: p._id,
      name: p.name.length > 30 ? p.name.slice(0, 30) + "…" : p.name,
      purchaseQty: p.totalQty,
      purchaseAmount: p.totalAmount,
      salesQty,
      salesAmount,
      profit,
      sellThroughRate: rate,
      margin,
    };
  });

  // ── KPI summary ───────────────────────────────────────────────────────────
  const year2025 = byPeriod.filter((p) => p.label.includes("2025"));
  const year2026 = byPeriod.filter((p) => p.label.includes("2026"));

  // ── #3 returns rate ───────────────────────────────────────────────────────
  let grossPurchase = 0, returnValue = 0, returnQty = 0;
  for (const r of returnsRaw as { _id: { sign: string }; amt: number; qty: number }[]) {
    if (r._id.sign === "return") { returnValue += r.amt; returnQty += r.qty; }
    else grossPurchase += r.amt;
  }
  const returnsRate = grossPurchase > 0 ? Math.abs(returnValue) / grossPurchase : 0;

  // ── #6 dead stock: codes purchased but never sold ─────────────────────────
  let deadStockCount = 0, purchasedCodes = 0;
  for (const r of sourcingRaw as { _id: string; purchased: number; sold: number }[]) {
    if (r.purchased > 0) {
      purchasedCodes++;
      if (r.sold <= 0) deadStockCount++;
    }
  }

  const totalProfitAll = byPeriod.reduce((s, p) => s + p.salesProfit, 0);
  const totalSalesAll = byPeriod.reduce((s, p) => s + p.salesAmount, 0);

  // Unit-based sell-through (units sold ÷ units bought) — not distorted by price.
  const totalPurchaseQty2025 = year2025.reduce((s, p) => s + p.purchaseQty, 0);
  const totalSalesQty2025 = year2025.reduce((s, p) => s + p.salesQty, 0);

  // ── gross purchases (before returns) per quarter, summed by year ──────────
  const grossMap = new Map<string, { amt: number; qty: number }>();
  for (const r of grossPurchaseRaw as { _id: { periodFrom: Date }; amt: number; qty: number }[]) {
    grossMap.set(quarterLabel(r._id.periodFrom), { amt: r.amt, qty: r.qty });
  }
  const grossPurchase2025 = year2025.reduce((s, p) => s + (grossMap.get(p.label)?.amt ?? 0), 0);
  const grossPurchase2026 = year2026.reduce((s, p) => s + (grossMap.get(p.label)?.amt ?? 0), 0);

  const kpi = {
    totalPurchase2025: year2025.reduce((s, p) => s + p.purchaseAmount, 0),
    grossPurchase2025,
    totalSales2025: year2025.reduce((s, p) => s + p.salesAmount, 0),
    totalProfit2025: year2025.reduce((s, p) => s + p.salesProfit, 0),
    ytdPurchase2026: year2026.reduce((s, p) => s + p.purchaseAmount, 0),
    grossPurchase2026,
    ytdSales2026: year2026.reduce((s, p) => s + p.salesAmount, 0),
    unitSellThrough2025: totalPurchaseQty2025 > 0 ? (totalSalesQty2025 / totalPurchaseQty2025) * 100 : 0,
    grossMargin: totalSalesAll > 0 ? (totalProfitAll / totalSalesAll) * 100 : 0,
    returnsRate: returnsRate * 100,
    returnValue: Math.abs(returnValue),
    returnQty: Math.abs(returnQty),
    deadStockCount,
    purchasedCodes,
  };

  // ── #2 distributor price comparison ───────────────────────────────────────
  // Group avg unit cost per supplier under each code; keep codes with ≥2 suppliers.
  const codePriceMap = new Map<string, { name: string; suppliers: { supplier: string; unitCost: number; qty: number }[] }>();
  for (const r of distributorPricesRaw as { _id: { code: string; supplier: string }; name: string; qty: number; amt: number }[]) {
    if (r.qty <= 0) continue;
    const unitCost = r.amt / r.qty;
    if (!codePriceMap.has(r._id.code))
      codePriceMap.set(r._id.code, { name: r.name, suppliers: [] });
    codePriceMap.get(r._id.code)!.suppliers.push({ supplier: r._id.supplier || "Unknown", unitCost, qty: r.qty });
  }

  const priceComparison = Array.from(codePriceMap.entries())
    .filter(([, v]) => v.suppliers.length >= 2)
    .map(([code, v]) => {
      const sorted = [...v.suppliers].sort((a, b) => a.unitCost - b.unitCost);
      const cheapest = sorted[0];
      const dearest = sorted[sorted.length - 1];
      const totalQty = v.suppliers.reduce((s, x) => s + x.qty, 0);
      // potential saving if everything was bought at the cheapest price
      const spent = v.suppliers.reduce((s, x) => s + x.unitCost * x.qty, 0);
      const potentialSaving = spent - cheapest.unitCost * totalQty;
      return {
        code,
        name: v.name.length > 32 ? v.name.slice(0, 32) + "…" : v.name,
        cheapestSupplier: cheapest.supplier,
        cheapestCost: Math.round(cheapest.unitCost * 100) / 100,
        dearestSupplier: dearest.supplier,
        dearestCost: Math.round(dearest.unitCost * 100) / 100,
        spread: Math.round((dearest.unitCost - cheapest.unitCost) * 100) / 100,
        spreadPct: cheapest.unitCost > 0 ? Math.round(((dearest.unitCost - cheapest.unitCost) / cheapest.unitCost) * 100) : 0,
        potentialSaving: Math.round(potentialSaving),
        supplierCount: v.suppliers.length,
      };
    })
    .sort((a, b) => b.potentialSaving - a.potentialSaving)
    .slice(0, 12);

  // ── Best distributor scorecard ────────────────────────────────────────────
  // Effective unit cost (amount ÷ quantity) already reflects bonus/free units,
  // because bonus units are recorded in quantity for the same money. On products
  // bought from ≥2 distributors we compare head-to-head: who is cheapest, by how
  // much, and how much extra you paid by NOT always buying from the cheapest.
  type SupAgg = {
    supplier: string; amt: number; qty: number;
    shared: number; wins: number; premiumPctSum: number; overpay: number;
  };
  const supAgg = new Map<string, SupAgg>();
  const getSup = (s: string) => {
    let e = supAgg.get(s);
    if (!e) { e = { supplier: s, amt: 0, qty: 0, shared: 0, wins: 0, premiumPctSum: 0, overpay: 0 }; supAgg.set(s, e); }
    return e;
  };

  for (const v of codePriceMap.values()) {
    for (const s of v.suppliers) {
      const e = getSup(s.supplier || "Unknown");
      e.amt += s.unitCost * s.qty;
      e.qty += s.qty;
    }
    if (v.suppliers.length >= 2) {
      const min = Math.min(...v.suppliers.map((x) => x.unitCost));
      for (const s of v.suppliers) {
        const e = getSup(s.supplier || "Unknown");
        e.shared += 1;
        if (s.unitCost <= min * 1.0001) e.wins += 1;
        e.premiumPctSum += min > 0 ? ((s.unitCost - min) / min) * 100 : 0;
        e.overpay += (s.unitCost - min) * s.qty;
      }
    }
  }

  const distributorScore = Array.from(supAgg.values())
    .map((e) => ({
      supplier: e.supplier,
      totalSpend: Math.round(e.amt),
      units: Math.round(e.qty),
      effectiveUnitCost: e.qty > 0 ? Math.round((e.amt / e.qty) * 100) / 100 : 0,
      sharedProducts: e.shared,
      wins: e.wins,
      winRate: e.shared > 0 ? Math.round((e.wins / e.shared) * 100) : null,
      avgPremiumPct: e.shared > 0 ? Math.round((e.premiumPctSum / e.shared) * 10) / 10 : null,
      estimatedOverpay: Math.round(e.overpay),
    }))
    // best value first: lowest average premium; sole-suppliers (no head-to-head) last
    .sort((a, b) => {
      if (a.avgPremiumPct == null && b.avgPremiumPct == null) return b.totalSpend - a.totalSpend;
      if (a.avgPremiumPct == null) return 1;
      if (b.avgPremiumPct == null) return -1;
      return a.avgPremiumPct - b.avgPremiumPct;
    });

  // ── product quarterly breakdown ──────────────────────────────────────────
  // Find top 8 products by total purchase amount
  const productTotals = new Map<string, { name: string; total: number }>();
  for (const r of productByQuarterRaw as { _id: { code: string; periodFrom: Date }; name: string; totalAmount: number }[]) {
    const existing = productTotals.get(r._id.code);
    productTotals.set(r._id.code, {
      name: r.name.length > 25 ? r.name.slice(0, 25) + "…" : r.name,
      total: (existing?.total ?? 0) + r.totalAmount,
    });
  }
  const top8Codes = Array.from(productTotals.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8)
    .map(([code]) => code);

  const quarters = Array.from(periodMap.keys());
  const productByQuarter = top8Codes.map((code) => {
    const entry: Record<string, string | number> = { name: productTotals.get(code)!.name };
    for (const q of quarters) {
      const match = (productByQuarterRaw as { _id: { code: string; periodFrom: Date }; totalQty: number; totalAmount: number }[]).find(
        (r) => r._id.code === code && quarterLabel(r._id.periodFrom) === q
      );
      entry[q] = match ? Math.round(match.totalAmount) : 0;
    }
    return entry;
  });

  return NextResponse.json({ byPeriod, topProducts: sellThrough, byDistributor, kpi, productByQuarter, quarters, priceComparison, distributorScore });
}
