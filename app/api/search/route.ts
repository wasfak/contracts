import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Transaction } from "@/lib/models/Transaction";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json();
  const { codes, from, to } = body as {
    codes: string[];
    from: string;
    to: string;
  };

  if (!Array.isArray(codes) || codes.length === 0) {
    return NextResponse.json({ error: "No codes provided." }, { status: 400 });
  }
  if (!from || !to) {
    return NextResponse.json({ error: "Period from/to required." }, { status: 400 });
  }

  const fromDate = new Date(from);
  const toDate = new Date(to);

  await connectDB();

  const filter = {
    code: { $in: codes.map(String) },
    periodFrom: { $gte: fromDate },
    periodTo: { $lte: toDate },
  };

  const [sales, purchases] = await Promise.all([
    Transaction.find({ ...filter, kind: "sale" })
      .select("code name supplier quantity amount profit periodFrom periodTo")
      .lean(),
    Transaction.find({ ...filter, kind: "purchase" })
      .select("code name supplier quantity amount unitCost periodFrom periodTo")
      .lean(),
  ]);

  return NextResponse.json({ sales, purchases });
}
