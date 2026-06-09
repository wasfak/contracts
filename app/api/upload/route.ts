import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Transaction } from "@/lib/models/Transaction";
import { parseReport } from "@/lib/parseReport";

export const runtime = "nodejs";

const CHUNK = 50;

async function processFile(file: File) {
  const html = await file.text();
  const report = parseReport(html);

  if (report.rows.length === 0) {
    return { file: file.name, error: "No data rows found." };
  }

  const docs = report.rows.map((row) => ({
    kind: report.kind,
    pharmacy: report.pharmacy,
    periodFrom: report.periodFrom,
    periodTo: report.periodTo,
    ...row,
  }));

  // Split into chunks then fire all chunks in parallel.
  const chunks: (typeof docs)[] = [];
  for (let i = 0; i < docs.length; i += CHUNK) chunks.push(docs.slice(i, i + CHUNK));

  // insertMany is faster than bulkWrite upserts — no index lookup per row.
  // ordered:false lets chunks continue past any duplicate-key errors so
  // re-uploading the same file is safe (duplicates are skipped, not fatal).
  const insertResults = await Promise.all(
    chunks.map((chunk) =>
      Transaction.insertMany(chunk, { ordered: false }).catch((err) => {
        // E11000 = duplicate key — already exists, skip silently.
        if (err?.code === 11000 || err?.name === "MongoBulkWriteError") return err.result ?? { insertedCount: 0 };
        throw err;
      })
    )
  );

  const upsertedCount = insertResults.reduce(
    (s, r) => s + (r?.insertedCount ?? 0),
    0
  );
  const modifiedCount = 0;

  return {
    file: file.name,
    kind: report.kind,
    pharmacy: report.pharmacy,
    period: {
      from: report.periodFrom.toISOString().slice(0, 10),
      to: report.periodTo.toISOString().slice(0, 10),
    },
    parsed: report.rows.length,
    inserted: upsertedCount,
    updated: modifiedCount,
  };
}

export async function POST(request: Request) {
  const form = await request.formData();
  const entries = form.getAll("file");

  const files = entries.filter((e): e is File => e instanceof File);
  if (files.length === 0) {
    return NextResponse.json(
      { error: "No files uploaded. Send one or more `file` fields." },
      { status: 400 }
    );
  }

  const invalid = files.filter((f) => !/\.html?$/i.test(f.name));
  if (invalid.length > 0) {
    return NextResponse.json(
      {
        error: `Only .htm/.html files are supported. Rejected: ${invalid.map((f) => f.name).join(", ")}`,
      },
      { status: 400 }
    );
  }

  await connectDB();

  // All files processed in parallel, chunks within each file also in parallel.
  const results = await Promise.all(files.map(processFile));

  return NextResponse.json({ results });
}
