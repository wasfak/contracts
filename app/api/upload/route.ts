import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Transaction } from "@/lib/models/Transaction";
import { parseReport } from "@/lib/parseReport";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file uploaded. Send a `file` field." },
      { status: 400 }
    );
  }

  if (!/\.html?$/i.test(file.name)) {
    return NextResponse.json(
      { error: "Only .htm or .html files are supported." },
      { status: 400 }
    );
  }

  const html = await file.text();
  const report = parseReport(html);

  if (report.rows.length === 0) {
    return NextResponse.json(
      { error: "No data rows found. Is this the expected report format?" },
      { status: 422 }
    );
  }

  await connectDB();

  // One round-trip, unordered: upsert keeps re-uploads idempotent without
  // hammering the DB with per-row writes.
  const ops = report.rows.map((row) => ({
    updateOne: {
      filter: {
        kind: report.kind,
        code: row.code,
        periodFrom: report.periodFrom,
        periodTo: report.periodTo,
      },
      update: {
        $set: {
          kind: report.kind,
          pharmacy: report.pharmacy,
          periodFrom: report.periodFrom,
          periodTo: report.periodTo,
          ...row,
        },
      },
      upsert: true,
    },
  }));

  const result = await Transaction.bulkWrite(ops, { ordered: false });

  return NextResponse.json({
    kind: report.kind,
    pharmacy: report.pharmacy,
    period: {
      from: report.periodFrom.toISOString().slice(0, 10),
      to: report.periodTo.toISOString().slice(0, 10),
    },
    parsed: report.rows.length,
    inserted: result.upsertedCount,
    updated: result.modifiedCount,
  });
}
