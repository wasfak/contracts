/**
 * Parser for the SofTech Smart Business "Ver 9" HTML report exports.
 *
 * The reports are HTML tables padded with many empty cells and COLSPANs.
 * Two layouts are supported and auto-detected from the header text:
 *
 *  - purchases ("الأصناف التى تم شراؤها"): each data row's non-empty cells are
 *      [supplier, total, avgUnitCost, quantity, name, code, codeDup]
 *  - sales ("مبيعات"): each data row's non-empty cells are
 *      [codeDup, profit, amount, quantity, supplier, name, code]
 *
 * A data row is identified by an `ALIGN=center` cell containing only digits
 * (the item code). Numbers keep their sign; thousands commas are stripped.
 */

export type ReportKind = "purchase" | "sale";

export interface ParsedRow {
  code: string;
  name: string;
  supplier: string;
  quantity: number;
  amount: number;
  unitCost: number | null;
  profit: number | null;
}

export interface ParsedReport {
  kind: ReportKind;
  pharmacy: string;
  periodFrom: Date;
  periodTo: Date;
  rows: ParsedRow[];
}

function toNumber(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Strip tags + collapse whitespace for a cell's inner text. */
function cellText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse "YYYY/M/D" into a UTC Date. */
function toDate(raw: string): Date {
  const [y, m, d] = raw.split("/").map((p) => parseInt(p, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function detectKind(html: string): ReportKind {
  if (/تم\s*شراؤها/.test(html)) return "purchase";
  if (/مبيعات/.test(html)) return "sale";
  // Fallback: sales reports carry a "مبلغ الربح" (profit) column.
  if (/الربح/.test(html)) return "sale";
  return "purchase";
}

function extractPeriod(html: string): { from: Date; to: Date } {
  // Drop the footer ("Printed on : ...") so the print timestamp isn't counted.
  const body = html.split(/Printed on/i)[0];
  const matches = body.match(/\d{4}\/\d{1,2}\/\d{1,2}/g) ?? [];
  const dates = matches.map(toDate).sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) {
    const now = new Date();
    return { from: now, to: now };
  }
  return { from: dates[0], to: dates[dates.length - 1] };
}

export function parseReport(html: string): ParsedReport {
  const kind = detectKind(html);
  const { from, to } = extractPeriod(html);

  const firstTh = html.match(/<TH[^>]*>([\s\S]*?)<\/TH>/i);
  const pharmacy = firstTh ? cellText(firstTh[1]) : "";

  const rows: ParsedRow[] = [];
  const trRegex = /<TR\b[^>]*>([\s\S]*?)<\/TR>/gi;
  let tr: RegExpExecArray | null;

  while ((tr = trRegex.exec(html)) !== null) {
    const rowHtml = tr[1];

    // Only rows carrying a centered numeric code are data rows.
    const codeMatch = rowHtml.match(/<T[DH][^>]*ALIGN=center[^>]*>(\s*\d+\s*)<\/T[DH]>/i);
    if (!codeMatch) continue;

    // Collect non-empty cell texts in document order.
    const cells: string[] = [];
    const cellRegex = /<T[DH][^>]*>([\s\S]*?)<\/T[DH]>/gi;
    let c: RegExpExecArray | null;
    while ((c = cellRegex.exec(rowHtml)) !== null) {
      const text = cellText(c[1]);
      if (text) cells.push(text);
    }
    if (cells.length < 7) continue;

    if (kind === "purchase") {
      // [supplier, total, avgUnitCost, quantity, name, code, codeDup]
      rows.push({
        supplier: cells[0],
        amount: toNumber(cells[1]),
        unitCost: toNumber(cells[2]),
        quantity: toNumber(cells[3]),
        name: cells[4],
        code: cells[5].trim(),
        profit: null,
      });
    } else {
      // [codeDup, profit, amount, quantity, supplier, name, code]
      rows.push({
        profit: toNumber(cells[1]),
        amount: toNumber(cells[2]),
        quantity: toNumber(cells[3]),
        supplier: cells[4],
        name: cells[5],
        code: cells[6].trim(),
        unitCost: null,
      });
    }
  }

  return { kind, pharmacy, periodFrom: from, periodTo: to, rows };
}
