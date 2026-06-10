import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Transaction } from "@/lib/models/Transaction";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { codes } = await request.json() as { codes: string[] };
  if (!Array.isArray(codes) || codes.length === 0)
    return NextResponse.json({ error: "No codes provided." }, { status: 400 });

  await connectDB();

  // Only suppliers with at least one real (non-zero quantity) purchase row.
  // This drops the manufacturer's 0-amount/0-qty placeholder rows, which are
  // the producer (المنشأ) rather than an actual distributor.
  const result = await Transaction.distinct("supplier", {
    code: { $in: codes },
    kind: "purchase",
    quantity: { $ne: 0 },
  });

  return NextResponse.json({ suppliers: (result as string[]).filter(Boolean).sort() });
}
