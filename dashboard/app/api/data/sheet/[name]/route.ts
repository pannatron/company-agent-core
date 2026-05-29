import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/repo";
import { REVIEWABLE_FILES } from "@/lib/driveSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SheetResponse {
  ok: boolean;
  name: string;
  headers: string[];
  rows: string[][];
  total_rows: number;
  size_bytes: number;
  mtime?: number;
  error?: string;
}

const ALLOWED = new Set(REVIEWABLE_FILES.map((f) => f.name));

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!ALLOWED.has(name)) {
    return Response.json(
      { ok: false, error: `not a reviewable sheet: ${name}` } as SheetResponse,
      { status: 404 },
    );
  }
  const full = path.join(DATA_DIR, name);
  try {
    const [stat, raw] = await Promise.all([
      fs.stat(full),
      fs.readFile(full, "utf8"),
    ]);
    const { headers, rows } = parseCsv(raw);
    return Response.json({
      ok: true,
      name,
      headers,
      rows,
      total_rows: rows.length,
      size_bytes: stat.size,
      mtime: stat.mtimeMs,
    } as SheetResponse);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return Response.json({
        ok: true,
        name,
        headers: [],
        rows: [],
        total_rows: 0,
        size_bytes: 0,
      } as SheetResponse);
    }
    return Response.json(
      { ok: false, error: err.message } as SheetResponse,
      { status: 500 },
    );
  }
}

/**
 * Minimal CSV parser — handles quoted fields with embedded commas / newlines.
 * Used only for displaying data we own (data/*.csv), so we don't pull in a
 * full csv-parse dependency.
 */
function parseCsv(raw: string): { headers: string[]; rows: string[][] } {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let i = 0;
  let inQuotes = false;
  while (i < raw.length) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"' && raw[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      // Push the field, end this row, swallow \r\n as a unit
      row.push(field);
      field = "";
      records.push(row);
      row = [];
      if (ch === "\r" && raw[i + 1] === "\n") i += 2;
      else i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Flush trailing field/row if there's no terminating newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  // Remove fully-empty trailing rows (single empty field)
  while (
    records.length > 0 &&
    records[records.length - 1].every((c) => c.trim() === "")
  ) {
    records.pop();
  }
  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0];
  const rows = records.slice(1);
  return { headers, rows };
}
