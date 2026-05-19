import { promises as fs } from "node:fs";
import path from "node:path";
import { REPO_ROOT, DATA_DIR } from "./repo";

/**
 * Google Sheets — source-of-truth sync layer.
 *
 * Cloud structure (under the connected root folder on Drive):
 *
 *   📊 Sales/Sales Pipeline           ← tab "pipeline"   ↔ data/sales-pipeline.csv
 *   👤 HR/Employees                   ← tab "employees"  ↔ data/employees.csv
 *   💰 Finance/Finance                ← tab "monthly"    ↔ data/finance.csv
 *   🎫 Support/Tickets                ← tab "tickets"    ↔ data/tickets.csv
 *   📝 Marketing/Content Calendar     ← tab "calendar"   ↔ data/content-calendar.csv
 *
 * Local CSVs in data/ are a cache — round-trip with Drive via pull / push.
 * JSON files (kpi.json, company-goals.json, etc.) are still handled by the
 * existing setup-backup mechanism in driveSync.ts.
 */

const STATE_PATH = path.join(REPO_ROOT, "data", ".sheets-state.json");
const CONFIG_PATH = path.join(REPO_ROOT, "data", ".drive-config.json");

export interface Topic {
  /** stable id used in API + state keys */
  id: string;
  /** display label shown in UI */
  label: string;
  /** "📊 Sales" — folder path under Drive root (supports "A/B" nesting) */
  folder: string;
  /** "Sales Pipeline" — the Google Sheets file name (no extension) */
  filename: string;
  /** tab name inside the sheet file */
  tab: string;
  /** local CSV file (relative to data/) */
  localFile: string;
}

export const TOPICS: Topic[] = [
  {
    id: "sales-pipeline",
    label: "Sales Pipeline",
    folder: "📊 Sales",
    filename: "Sales Pipeline",
    tab: "pipeline",
    localFile: "sales-pipeline.csv",
  },
  {
    id: "employees",
    label: "พนักงาน",
    folder: "👤 HR",
    filename: "Employees",
    tab: "employees",
    localFile: "employees.csv",
  },
  {
    id: "finance",
    label: "การเงินรายเดือน",
    folder: "💰 Finance",
    filename: "Finance",
    tab: "monthly",
    localFile: "finance.csv",
  },
  {
    id: "tickets",
    label: "Support Tickets",
    folder: "🎫 Support",
    filename: "Tickets",
    tab: "tickets",
    localFile: "tickets.csv",
  },
  {
    id: "content-calendar",
    label: "Content Calendar",
    folder: "📝 Marketing",
    filename: "Content Calendar",
    tab: "calendar",
    localFile: "content-calendar.csv",
  },
];

export function findTopic(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

/* ---------- state ---------- */

interface TopicSyncEntry {
  pulled_at?: string;
  pushed_at?: string;
  workbook_url?: string;
  rows?: number;
}

interface SheetsState {
  topics: Record<string, TopicSyncEntry>;
}

async function loadState(): Promise<SheetsState> {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as SheetsState;
  } catch {
    return { topics: {} };
  }
}

async function saveState(s: SheetsState): Promise<void> {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(s, null, 2), "utf8");
}

/* ---------- Drive config (re-used from driveSync) ---------- */

interface DriveConfig {
  method: "apps_script";
  url: string;
}

async function loadDriveUrl(): Promise<string> {
  const raw = await fs.readFile(CONFIG_PATH, "utf8");
  const cfg = JSON.parse(raw) as DriveConfig;
  if (!cfg.url) throw new Error("Drive ยังไม่ได้เชื่อม");
  return cfg.url;
}

/* ---------- Apps Script HTTP ---------- */

async function callScript<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "follow",
  });
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!ct.includes("json")) {
    if (text.includes("Sign in") || text.includes("accounts.google.com")) {
      throw new Error(
        "Apps Script ตั้ง Access ผิด — เปลี่ยนเป็น 'Anyone' แล้ว redeploy",
      );
    }
    throw new Error(
      `Apps Script ไม่ตอบเป็น JSON (status ${res.status}) — ตรวจว่า deploy เป็น Web app และเวอร์ชันเป็น v5`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Apps Script ส่ง JSON ที่อ่านไม่ออก");
  }
}

interface InitSheetResponse {
  ok: boolean;
  workbook_id?: string;
  workbook_url?: string;
  tab_created?: boolean;
  error?: string;
}

interface ReadSheetResponse {
  ok: boolean;
  headers?: string[];
  rows?: string[][];
  workbook_url?: string;
  error?: string;
}

interface WriteSheetResponse {
  ok: boolean;
  rows_written?: number;
  workbook_url?: string;
  error?: string;
}

interface ListWorkbooksResponse {
  ok: boolean;
  workbooks?: {
    folder_path: string;
    filename: string;
    file_id: string;
    file_url: string;
    updated_at?: string;
    tabs?: { name: string; rows: number }[];
    error?: string;
  }[];
  root_url?: string;
  error?: string;
}

/* ---------- CSV (minimal, handles quotes + embedded commas/newlines) ---------- */

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        /* skip */
      } else {
        field += c;
      }
    }
  }
  // flush last field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return { headers: [], rows: [] };
  const [headers, ...rest] = rows;
  // Drop trailing empty rows (common with CSV files ending in a newline)
  while (rest.length > 0 && rest[rest.length - 1].every((c) => c === "")) {
    rest.pop();
  }
  return { headers, rows: rest };
}

export function serializeCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) {
    const padded = headers.map((_, i) => esc(r[i] ?? ""));
    lines.push(padded.join(","));
  }
  return lines.join("\n") + "\n";
}

/* ---------- Public API ---------- */

export interface TopicStatus {
  id: string;
  label: string;
  folder: string;
  filename: string;
  tab: string;
  localFile: string;
  exists_on_drive: boolean;
  workbook_url?: string;
  drive_rows?: number;
  drive_updated_at?: string;
  local_exists: boolean;
  local_rows?: number;
  pulled_at?: string;
  pushed_at?: string;
}

export interface SheetsStatus {
  connected: boolean;
  reason?: string;
  root_url?: string;
  /** version reported by ping (e.g. "4", "5"). Undefined if ping failed. */
  script_version?: string;
  /** true if deployed script doesn't have v5 sheet actions */
  needs_v5_upgrade: boolean;
  topics: TopicStatus[];
}

interface PingResponseV5 {
  ok: boolean;
  script_version?: string;
  error?: string;
}

export async function getSheetsStatus(): Promise<SheetsStatus> {
  let url: string;
  try {
    url = await loadDriveUrl();
  } catch (e) {
    return {
      connected: false,
      needs_v5_upgrade: false,
      reason: (e as Error).message,
      topics: TOPICS.map((t) => ({
        id: t.id,
        label: t.label,
        folder: t.folder,
        filename: t.filename,
        tab: t.tab,
        localFile: t.localFile,
        exists_on_drive: false,
        local_exists: false,
      })),
    };
  }

  const ping = await callScript<PingResponseV5>(url, { action: "ping" }).catch(
    (e): PingResponseV5 => ({ ok: false, error: (e as Error).message }),
  );
  const version = ping.ok ? ping.script_version : undefined;
  const versionNum = version ? parseInt(version, 10) : 0;
  const needs_v5_upgrade = !version || versionNum < 5;

  // Skip the list call if we know the script can't handle it — saves an error message
  const list: ListWorkbooksResponse = needs_v5_upgrade
    ? { ok: true, workbooks: [] }
    : await callScript<ListWorkbooksResponse>(url, { action: "list_workbooks" }).catch(
        (e): ListWorkbooksResponse => ({ ok: false, error: (e as Error).message }),
      );
  const state = await loadState();

  const workbooks = list.ok && list.workbooks ? list.workbooks : [];
  const byKey = new Map<string, (typeof workbooks)[number]>();
  for (const wb of workbooks) {
    byKey.set(`${wb.folder_path}::${wb.filename}`, wb);
  }

  const topics: TopicStatus[] = await Promise.all(
    TOPICS.map(async (t) => {
      const wb = byKey.get(`${t.folder}::${t.filename}`);
      const tab = wb?.tabs?.find((x) => x.name === t.tab);
      const localPath = path.join(DATA_DIR, t.localFile);
      let local_exists = false;
      let local_rows: number | undefined;
      try {
        const raw = await fs.readFile(localPath, "utf8");
        local_exists = true;
        const parsed = parseCsv(raw);
        local_rows = parsed.rows.length;
      } catch {
        local_exists = false;
      }
      const tracked = state.topics[t.id] || {};
      return {
        id: t.id,
        label: t.label,
        folder: t.folder,
        filename: t.filename,
        tab: t.tab,
        localFile: t.localFile,
        exists_on_drive: !!wb,
        workbook_url: wb?.file_url ?? tracked.workbook_url,
        drive_rows: tab?.rows,
        drive_updated_at: wb?.updated_at,
        local_exists,
        local_rows,
        pulled_at: tracked.pulled_at,
        pushed_at: tracked.pushed_at,
      };
    }),
  );

  return {
    connected: true,
    root_url: list.ok ? list.root_url : undefined,
    reason: list.ok ? undefined : list.error,
    script_version: version,
    needs_v5_upgrade,
    topics,
  };
}

/**
 * Init: create every topic's Sheet on Drive AND push current local CSV data in
 * one go. Single-button "setup everything" — after this finishes the cloud
 * mirrors the local cache exactly.
 */
export async function initAllSheets(): Promise<{
  created: string[];
  existed: string[];
  pushed_rows: number;
  errors: { id: string; message: string }[];
}> {
  const url = await loadDriveUrl();
  const created: string[] = [];
  const existed: string[] = [];
  const errors: { id: string; message: string }[] = [];
  let pushed_rows = 0;
  const state = await loadState();

  for (const t of TOPICS) {
    try {
      const local = path.join(DATA_DIR, t.localFile);
      let headers: string[] = [];
      let rows: string[][] = [];
      try {
        const raw = await fs.readFile(local, "utf8");
        const parsed = parseCsv(raw);
        headers = parsed.headers;
        rows = parsed.rows;
      } catch {
        // no local file — create empty Sheet
      }

      // Step 1: create Sheet + folder + tab with headers
      const init = await callScript<InitSheetResponse>(url, {
        action: "init_sheet",
        folder_path: t.folder,
        filename: t.filename,
        tab: t.tab,
        headers,
      });
      if (!init.ok) throw new Error(init.error || "init_sheet failed");
      if (init.tab_created) created.push(t.id);
      else existed.push(t.id);

      // Step 2: if local CSV has rows, push them up immediately so the Sheet
      // mirrors local data. Skip when there's nothing to push.
      let rows_written = 0;
      if (headers.length > 0) {
        const w = await callScript<WriteSheetResponse>(url, {
          action: "write_sheet",
          folder_path: t.folder,
          filename: t.filename,
          tab: t.tab,
          headers,
          rows,
        });
        if (!w.ok) throw new Error(w.error || "write_sheet failed");
        rows_written = w.rows_written ?? rows.length;
        pushed_rows += rows_written;
      }

      state.topics[t.id] = {
        ...(state.topics[t.id] || {}),
        workbook_url: init.workbook_url,
        pushed_at: new Date().toISOString(),
        rows: rows_written,
      };
    } catch (e) {
      errors.push({ id: t.id, message: (e as Error).message });
    }
  }
  await saveState(state);
  return { created, existed, pushed_rows, errors };
}

export interface PullResult {
  id: string;
  rows: number;
  workbook_url?: string;
}

export async function pullTopic(id: string): Promise<PullResult> {
  const t = findTopic(id);
  if (!t) throw new Error(`unknown topic: ${id}`);
  const url = await loadDriveUrl();

  const r = await callScript<ReadSheetResponse>(url, {
    action: "read_sheet",
    folder_path: t.folder,
    filename: t.filename,
    tab: t.tab,
  });
  if (!r.ok || !r.headers) throw new Error(r.error || "read_sheet failed");

  const csv = serializeCsv(r.headers, r.rows || []);
  const localPath = path.join(DATA_DIR, t.localFile);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, csv, "utf8");

  const state = await loadState();
  state.topics[id] = {
    ...(state.topics[id] || {}),
    pulled_at: new Date().toISOString(),
    workbook_url: r.workbook_url,
    rows: r.rows?.length || 0,
  };
  await saveState(state);

  return { id, rows: r.rows?.length || 0, workbook_url: r.workbook_url };
}

export async function pullAllTopics(): Promise<{
  pulled: PullResult[];
  errors: { id: string; message: string }[];
}> {
  const pulled: PullResult[] = [];
  const errors: { id: string; message: string }[] = [];
  for (const t of TOPICS) {
    try {
      pulled.push(await pullTopic(t.id));
    } catch (e) {
      errors.push({ id: t.id, message: (e as Error).message });
    }
  }
  return { pulled, errors };
}

export interface PushResult {
  id: string;
  rows: number;
  workbook_url?: string;
}

export async function pushTopic(id: string): Promise<PushResult> {
  const t = findTopic(id);
  if (!t) throw new Error(`unknown topic: ${id}`);
  const url = await loadDriveUrl();

  const localPath = path.join(DATA_DIR, t.localFile);
  let raw: string;
  try {
    raw = await fs.readFile(localPath, "utf8");
  } catch {
    throw new Error(`ไม่พบไฟล์ local: ${t.localFile}`);
  }
  const { headers, rows } = parseCsv(raw);
  if (headers.length === 0) {
    throw new Error(`${t.localFile} ว่าง — ไม่มี header ให้ push`);
  }

  const r = await callScript<WriteSheetResponse>(url, {
    action: "write_sheet",
    folder_path: t.folder,
    filename: t.filename,
    tab: t.tab,
    headers,
    rows,
  });
  if (!r.ok) throw new Error(r.error || "write_sheet failed");

  const state = await loadState();
  state.topics[id] = {
    ...(state.topics[id] || {}),
    pushed_at: new Date().toISOString(),
    workbook_url: r.workbook_url,
    rows: r.rows_written ?? rows.length,
  };
  await saveState(state);

  return {
    id,
    rows: r.rows_written ?? rows.length,
    workbook_url: r.workbook_url,
  };
}

export async function pushAllTopics(): Promise<{
  pushed: PushResult[];
  errors: { id: string; message: string }[];
}> {
  const pushed: PushResult[] = [];
  const errors: { id: string; message: string }[] = [];
  for (const t of TOPICS) {
    try {
      pushed.push(await pushTopic(t.id));
    } catch (e) {
      errors.push({ id: t.id, message: (e as Error).message });
    }
  }
  return { pushed, errors };
}
