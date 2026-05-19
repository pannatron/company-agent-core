#!/usr/bin/env node
/**
 * Sheets sync CLI — pull / push tabular data between Google Sheets and data/*.csv
 *
 * Usage:
 *   node scripts/sheets-sync.mjs status
 *   node scripts/sheets-sync.mjs init           # create every Sheet on Drive
 *   node scripts/sheets-sync.mjs pull           # pull every topic
 *   node scripts/sheets-sync.mjs pull sales-pipeline
 *   node scripts/sheets-sync.mjs push           # push every topic
 *   node scripts/sheets-sync.mjs push employees
 *
 * Reads data/.drive-config.json for the Apps Script URL (set up via dashboard).
 * This script is the agent-facing entry point — agents call it via Bash before
 * reading CSVs (pull) and after editing CSVs (push).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const CONFIG_PATH = path.join(DATA_DIR, ".drive-config.json");
const STATE_PATH = path.join(DATA_DIR, ".sheets-state.json");

const TOPICS = [
  {
    id: "sales-pipeline",
    folder: "📊 Sales",
    filename: "Sales Pipeline",
    tab: "pipeline",
    localFile: "sales-pipeline.csv",
  },
  {
    id: "employees",
    folder: "👤 HR",
    filename: "Employees",
    tab: "employees",
    localFile: "employees.csv",
  },
  {
    id: "finance",
    folder: "💰 Finance",
    filename: "Finance",
    tab: "monthly",
    localFile: "finance.csv",
  },
  {
    id: "tickets",
    folder: "🎫 Support",
    filename: "Tickets",
    tab: "tickets",
    localFile: "tickets.csv",
  },
  {
    id: "content-calendar",
    folder: "📝 Marketing",
    filename: "Content Calendar",
    tab: "calendar",
    localFile: "content-calendar.csv",
  },
];

/* ---------- CSV ---------- */

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
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
    } else if (c === '"') {
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
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return { headers: [], rows: [] };
  const [headers, ...rest] = rows;
  while (rest.length > 0 && rest[rest.length - 1].every((c) => c === "")) {
    rest.pop();
  }
  return { headers, rows: rest };
}

function serializeCsv(headers, rows) {
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) {
    lines.push(headers.map((_, i) => esc(r[i] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

/* ---------- HTTP ---------- */

async function loadUrl() {
  const raw = await readFile(CONFIG_PATH, "utf8").catch(() => {
    throw new Error(
      `ยังไม่ได้เชื่อม Drive — เปิด dashboard แล้วกด "เชื่อม Drive" ก่อน (${path.relative(REPO_ROOT, CONFIG_PATH)} ไม่เจอ)`,
    );
  });
  const cfg = JSON.parse(raw);
  if (!cfg.url) throw new Error("ค่า url ใน .drive-config.json ว่าง");
  return cfg.url;
}

async function call(url, body) {
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
      throw new Error("Apps Script ตั้ง Access ผิด — ต้องเป็น 'Anyone' แล้ว redeploy");
    }
    throw new Error(`Apps Script ไม่ตอบเป็น JSON (status ${res.status}) — เช็กว่า deploy v5 แล้ว`);
  }
  const data = JSON.parse(text);
  if (data && data.ok === false && /unknown action/i.test(data.error || "")) {
    throw new Error(
      `Apps Script ที่ deploy ยังเป็นเวอร์ชันเก่า — ${data.error}\n` +
        `   เปิด dashboard → tab Files → กด "📋 ก๊อปสคริปต์ v5" แล้ว paste ทับใน script.google.com → Manage deployments → New version → Deploy`,
    );
  }
  return data;
}

async function ensureV5(url) {
  const p = await call(url, { action: "ping" });
  if (!p.ok) throw new Error(p.error || "ping failed");
  const v = parseInt(p.script_version || "0", 10);
  if (v < 5) {
    throw new Error(
      `Apps Script ที่ deploy เป็น v${p.script_version || "?"} — Sheets sync ต้องการ v5\n` +
        `   เปิด dashboard → tab Files → กด "📋 ก๊อปสคริปต์ v5" แล้ว paste ทับใน script.google.com → Manage deployments → New version → Deploy`,
    );
  }
  return p;
}

/* ---------- state ---------- */

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_PATH, "utf8"));
  } catch {
    return { topics: {} };
  }
}

async function saveState(s) {
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(s, null, 2), "utf8");
}

/* ---------- actions ---------- */

async function cmdStatus() {
  const url = await loadUrl();
  const ping = await call(url, { action: "ping" });
  if (ping.ok) {
    console.log(`📡 Apps Script v${ping.script_version} · ${ping.user_email || "?"}`);
  }
  if (ping.ok && parseInt(ping.script_version || "0", 10) < 5) {
    console.log("⚠ deployed script ยังไม่ใช่ v5 — Sheets sync ใช้ไม่ได้");
    console.log("  เปิด dashboard → Files → '📋 ก๊อปสคริปต์ v5' แล้ว paste ทับ");
    return;
  }
  const r = await call(url, { action: "list_workbooks" });
  if (!r.ok) throw new Error(r.error || "list_workbooks failed");
  const byKey = new Map((r.workbooks || []).map((w) => [`${w.folder_path}::${w.filename}`, w]));
  console.log(`📂 root: ${r.root_url || "?"}`);
  for (const t of TOPICS) {
    const wb = byKey.get(`${t.folder}::${t.filename}`);
    const tab = wb?.tabs?.find((x) => x.name === t.tab);
    const cloud = wb ? `${tab?.rows ?? "?"} rows · ${wb.file_url}` : "— ยังไม่มี";
    let local = "—";
    try {
      const raw = await readFile(path.join(DATA_DIR, t.localFile), "utf8");
      const p = parseCsv(raw);
      local = `${p.rows.length} rows`;
    } catch {
      /* */
    }
    console.log(`  ${t.id.padEnd(20)} cloud=${cloud}   local=${local}`);
  }
}

async function cmdInit() {
  const url = await loadUrl();
  await ensureV5(url);
  const state = await loadState();
  for (const t of TOPICS) {
    let headers = [];
    try {
      const raw = await readFile(path.join(DATA_DIR, t.localFile), "utf8");
      headers = parseCsv(raw).headers;
    } catch {
      /* */
    }
    const r = await call(url, {
      action: "init_sheet",
      folder_path: t.folder,
      filename: t.filename,
      tab: t.tab,
      headers,
    });
    if (!r.ok) {
      console.error(`✗ ${t.id}: ${r.error}`);
      continue;
    }
    state.topics[t.id] = { ...(state.topics[t.id] || {}), workbook_url: r.workbook_url };
    console.log(`${r.tab_created ? "✓ created" : "= existed"}  ${t.id}  →  ${r.workbook_url}`);
  }
  await saveState(state);
}

async function pullOne(t, url, state) {
  const r = await call(url, {
    action: "read_sheet",
    folder_path: t.folder,
    filename: t.filename,
    tab: t.tab,
  });
  if (!r.ok) throw new Error(r.error || "read_sheet failed");
  const csv = serializeCsv(r.headers || [], r.rows || []);
  const local = path.join(DATA_DIR, t.localFile);
  await mkdir(path.dirname(local), { recursive: true });
  await writeFile(local, csv, "utf8");
  state.topics[t.id] = {
    ...(state.topics[t.id] || {}),
    pulled_at: new Date().toISOString(),
    workbook_url: r.workbook_url,
    rows: (r.rows || []).length,
  };
  return (r.rows || []).length;
}

async function pushOne(t, url, state) {
  const raw = await readFile(path.join(DATA_DIR, t.localFile), "utf8").catch(() => {
    throw new Error(`ไม่พบ ${t.localFile} ใน data/`);
  });
  const { headers, rows } = parseCsv(raw);
  if (headers.length === 0) throw new Error(`${t.localFile} ว่าง — ไม่มี header`);
  const r = await call(url, {
    action: "write_sheet",
    folder_path: t.folder,
    filename: t.filename,
    tab: t.tab,
    headers,
    rows,
  });
  if (!r.ok) throw new Error(r.error || "write_sheet failed");
  state.topics[t.id] = {
    ...(state.topics[t.id] || {}),
    pushed_at: new Date().toISOString(),
    workbook_url: r.workbook_url,
    rows: r.rows_written ?? rows.length,
  };
  return r.rows_written ?? rows.length;
}

async function cmdPull(topicArg) {
  const url = await loadUrl();
  await ensureV5(url);
  const state = await loadState();
  const targets = topicArg
    ? [TOPICS.find((t) => t.id === topicArg)].filter(Boolean)
    : TOPICS;
  if (topicArg && targets.length === 0) {
    throw new Error(`ไม่รู้จัก topic "${topicArg}". ใช้ได้: ${TOPICS.map((t) => t.id).join(", ")}`);
  }
  for (const t of targets) {
    try {
      const n = await pullOne(t, url, state);
      console.log(`⬇ ${t.id.padEnd(20)} ${n} rows  →  data/${t.localFile}`);
    } catch (e) {
      console.error(`✗ ${t.id}: ${e.message}`);
    }
  }
  await saveState(state);
}

async function cmdPush(topicArg) {
  const url = await loadUrl();
  await ensureV5(url);
  const state = await loadState();
  const targets = topicArg
    ? [TOPICS.find((t) => t.id === topicArg)].filter(Boolean)
    : TOPICS;
  if (topicArg && targets.length === 0) {
    throw new Error(`ไม่รู้จัก topic "${topicArg}". ใช้ได้: ${TOPICS.map((t) => t.id).join(", ")}`);
  }
  for (const t of targets) {
    try {
      const n = await pushOne(t, url, state);
      console.log(`⬆ ${t.id.padEnd(20)} ${n} rows  →  ${t.folder}/${t.filename}`);
    } catch (e) {
      console.error(`✗ ${t.id}: ${e.message}`);
    }
  }
  await saveState(state);
}

/* ---------- main ---------- */

const [, , cmd, arg] = process.argv;

const USAGE = `Usage:
  node scripts/sheets-sync.mjs status
  node scripts/sheets-sync.mjs init
  node scripts/sheets-sync.mjs pull [topic]
  node scripts/sheets-sync.mjs push [topic]

Topics: ${TOPICS.map((t) => t.id).join(", ")}`;

(async () => {
  try {
    if (cmd === "status") await cmdStatus();
    else if (cmd === "init") await cmdInit();
    else if (cmd === "pull") await cmdPull(arg);
    else if (cmd === "push") await cmdPush(arg);
    else {
      console.error(USAGE);
      process.exit(1);
    }
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
})();
