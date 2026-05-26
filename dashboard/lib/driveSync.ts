import { promises as fs } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./repo";
import { getCategory } from "./categorizer";

/**
 * Drive sync via Google Apps Script Web App.
 *
 * Setup is just:
 *   1. user pastes a small Apps Script (see APPS_SCRIPT_TEMPLATE below)
 *   2. deploys it as a Web App ("Execute as: Me", "Access: Anyone")
 *   3. pastes the resulting /exec URL into the dashboard
 *
 * No Cloud Console, no service account, no OAuth.  The script runs as the
 * user themselves, so uploaded files land in their personal Drive.
 */

const CONFIG_PATH = path.join(REPO_ROOT, "data", ".drive-config.json");
const STATE_PATH = path.join(REPO_ROOT, "data", ".drive-state.json");
const OUTPUTS_DIR = path.join(REPO_ROOT, "outputs");

interface DriveConfig {
  method: "apps_script";
  url: string;
  configured_at: string;
  user_email?: string;
  root_folder_url?: string;
  root_folder_name?: string;
}

interface FileSyncEntry {
  drive_id: string;
  url: string;
  synced_at: string;
  size_at_sync: number;
  category: string;
}

interface DriveState {
  last_sync?: string;
  files: Record<string, FileSyncEntry>;
}

/**
 * File-level detail for each sync outcome (BUG-005). Counts are derivable from
 * `.length`, so dashboard / auto-sync code can stay backward-compatible.
 */
export interface SyncFileEntry {
  /** Repo-relative path, e.g. "outputs/content/launch.png" */
  file: string;
  /** Drive file id, present for uploaded/updated entries */
  drive_id?: string;
  /** Drive web URL, present for uploaded/updated entries */
  url?: string;
  /** "unchanged_mtime" for skipped, error message for errors */
  reason?: string;
}

export interface SyncResult {
  uploaded: SyncFileEntry[];
  updated: SyncFileEntry[];
  skipped: SyncFileEntry[];
  errors: { file: string; message: string }[];
}

export interface DriveStatus {
  connected: boolean;
  userEmail?: string;
  rootFolderUrl?: string;
  rootFolderName?: string;
  configuredAt?: string;
  lastSync?: string;
  fileCount?: number;
  reason?: string;
}

/* ---------- Config + state I/O ---------- */

async function loadConfig(): Promise<DriveConfig | null> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as DriveConfig;
  } catch {
    return null;
  }
}

async function saveConfig(cfg: DriveConfig): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

async function clearConfigFile(): Promise<void> {
  try {
    await fs.unlink(CONFIG_PATH);
  } catch {
    /* ignore */
  }
}

async function loadState(): Promise<DriveState> {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as DriveState;
  } catch {
    return { files: {} };
  }
}

async function saveState(s: DriveState): Promise<void> {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(s, null, 2), "utf8");
}

/* ---------- HTTP to Apps Script Web App ---------- */

interface PingResponse {
  ok: boolean;
  user_email?: string;
  root_folder_id?: string;
  root_folder_url?: string;
  root_folder_name?: string;
  error?: string;
}

interface UploadResponse {
  ok: boolean;
  id?: string;
  url?: string;
  error?: string;
}

async function callScript<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "follow",
  });
  // Apps Script Web Apps redirect to googleusercontent.com — fetch follows.
  // If access is misconfigured we may get an HTML login page; sniff that.
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!ct.includes("json")) {
    if (text.includes("Sign in") || text.includes("accounts.google.com")) {
      throw new Error(
        "Apps Script Web App ตั้ง Access ผิด — เปลี่ยนเป็น 'Anyone' (Anonymous) แล้ว redeploy",
      );
    }
    throw new Error(
      `Apps Script ตอบกลับไม่ใช่ JSON (status ${res.status}) — ตรวจว่า deploy เป็น Web app แล้ว`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Apps Script ส่ง JSON ที่อ่านไม่ออก");
  }
}

/* ---------- Public API ---------- */

export interface ConnectAttempt {
  ok: boolean;
  userEmail?: string;
  rootFolderUrl?: string;
  rootFolderName?: string;
  error?: string;
}

export async function testAndSaveUrl(url: string): Promise<ConnectAttempt> {
  if (!url.startsWith("https://script.google.com/")) {
    return {
      ok: false,
      error: "URL ต้องขึ้นต้นด้วย https://script.google.com/macros/s/...",
    };
  }
  try {
    const r = await callScript<PingResponse>(url, { action: "ping" });
    if (!r.ok) return { ok: false, error: r.error || "ping failed" };

    const cfg: DriveConfig = {
      method: "apps_script",
      url,
      configured_at: new Date().toISOString(),
      user_email: r.user_email,
      root_folder_url: r.root_folder_url,
      root_folder_name: r.root_folder_name,
    };
    await saveConfig(cfg);
    return {
      ok: true,
      userEmail: r.user_email,
      rootFolderUrl: r.root_folder_url,
      rootFolderName: r.root_folder_name,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function clearConnection(): Promise<void> {
  await clearConfigFile();
}

export async function isConfigured(): Promise<boolean> {
  return (await loadConfig()) !== null;
}

export async function getStatus(): Promise<DriveStatus> {
  const cfg = await loadConfig();
  if (!cfg) {
    return {
      connected: false,
      reason:
        "ยังไม่ได้เชื่อม Drive — กด ‘เชื่อม Drive’ เพื่อ paste URL ของ Apps Script Web App",
    };
  }
  const state = await loadState();
  return {
    connected: true,
    userEmail: cfg.user_email,
    rootFolderUrl: cfg.root_folder_url,
    rootFolderName: cfg.root_folder_name,
    configuredAt: cfg.configured_at,
    lastSync: state.last_sync,
    fileCount: Object.keys(state.files).length,
  };
}

async function* walkOutputs(dir: string): AsyncGenerator<string> {
  let items: import("node:fs").Dirent[];
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const it of items) {
    if (it.name.startsWith(".")) continue;
    const full = path.join(dir, it.name);
    if (it.isDirectory()) {
      yield* walkOutputs(full);
    } else if (it.isFile()) {
      yield full;
    }
  }
}

export async function syncAll(): Promise<SyncResult> {
  const cfg = await loadConfig();
  if (!cfg) throw new Error("Drive ยังไม่ได้เชื่อม");

  const state = await loadState();
  const result: SyncResult = { uploaded: [], updated: [], skipped: [], errors: [] };

  for await (const full of walkOutputs(OUTPUTS_DIR)) {
    const repoRel = path.relative(REPO_ROOT, full).split(path.sep).join("/");
    try {
      const rel = path.relative(OUTPUTS_DIR, full).split(path.sep);
      const categoryId = rel.length > 1 ? rel[0] : "misc";
      const fileName = rel[rel.length - 1];
      const stat = await fs.stat(full);
      const baseKey = repoRel;

      const cat = getCategory(categoryId);
      const folderName = `${cat.icon} ${cat.label}`;
      const destinations = resolveDestinations(cat, fileName);

      // Lazy-read file body — only fetch if at least one destination needs upload
      let buf: Buffer | null = null;

      for (const dest of destinations) {
        const stateKey = `${baseKey}#${dest.tag}`;
        const existing = state.files[stateKey];
        if (existing && existing.size_at_sync === stat.size) {
          result.skipped.push({
            file: stateKey,
            drive_id: existing.drive_id,
            url: existing.url,
            reason: "unchanged_mtime",
          });
          continue;
        }
        if (!buf) buf = await fs.readFile(full);

        const r = await callScript<UploadResponse>(cfg.url, {
          action: "upload",
          filename: fileName,
          category: folderName,
          ...(dest.subfolder ? { subfolder: dest.subfolder } : {}),
          content_b64: buf.toString("base64"),
          mime_type: mimeForExt(path.extname(fileName)),
        });
        if (!r.ok || !r.id || !r.url) {
          throw new Error(r.error || "upload failed");
        }

        state.files[stateKey] = {
          drive_id: r.id,
          url: r.url,
          synced_at: new Date().toISOString(),
          size_at_sync: stat.size,
          category: categoryId,
        };
        const entry: SyncFileEntry = {
          file: stateKey,
          drive_id: r.id,
          url: r.url,
        };
        if (existing) result.updated.push(entry);
        else result.uploaded.push(entry);
      }
    } catch (e) {
      result.errors.push({
        file: repoRel,
        message: (e as Error).message,
      });
    }
  }

  state.last_sync = new Date().toISOString();
  await saveState(state);
  return result;
}

interface UploadDestination {
  /** Suffix used in state key to track this destination separately */
  tag: string;
  /** Sub-path beneath the category folder, e.g. "_by-person/songkarn/2026-05" */
  subfolder?: string;
}

/**
 * Decide where on Drive a file should land (one or more locations).
 * Behavior matrix:
 *   - bucketByMonth + bucketByPerson + has both → dual: _by-person/<p>/<m> + _by-month/<m>
 *   - bucketByPerson alone + has person         → _by-person/<p>
 *   - bucketByMonth alone + has month           → <m>
 *   - missing parts                             → fall back to category root
 */
function resolveDestinations(
  cat: { bucketByMonth?: boolean; bucketByPerson?: boolean },
  fileName: string,
): UploadDestination[] {
  if (cat.bucketByPerson && cat.bucketByMonth) {
    const { person, month } = extractPersonAndMonth(fileName);
    if (person && month) {
      return [
        { tag: "by-person", subfolder: `_by-person/${person}/${month}` },
        { tag: "by-month", subfolder: `_by-month/${month}` },
      ];
    }
    if (month) return [{ tag: "month", subfolder: month }];
    if (person) return [{ tag: "person", subfolder: `_by-person/${person}` }];
    return [{ tag: "root" }];
  }
  if (cat.bucketByMonth) {
    const month = extractMonth(fileName);
    return month ? [{ tag: "month", subfolder: month }] : [{ tag: "root" }];
  }
  if (cat.bucketByPerson) {
    const { person } = extractPersonAndMonth(fileName);
    return person
      ? [{ tag: "person", subfolder: `_by-person/${person}` }]
      : [{ tag: "root" }];
  }
  return [{ tag: "root" }];
}

export async function getSyncedMap(): Promise<Record<string, FileSyncEntry>> {
  return (await loadState()).files;
}

/* ---------- Setup Backup / Restore ---------- */

/** Backup folder name on Drive (must match Apps Script's BACKUP_FOLDER_NAME) */
const BACKUP_CATEGORY = "⚙ Setup Backup";
const BACKUP_STATE_PATH = path.join(REPO_ROOT, "data", ".backup-state.json");

/** Setup files to back up (top-level files in data/). Skips .drive-state / .drive-config (chicken-egg). */
const SETUP_FILES = [
  "company-profile.json",
  "company-goals.json",
  "kpi.json",
  "tasks.json",
  "social-posts.json",
  "sales-pipeline.csv",
  "content-calendar.csv",
  "employees.csv",
  "finance.csv",
  "tickets.csv",
  // Brand assets — backed up so logo survives reinstalls + is restored on first sync
  "company-logo.png",
  "company-logo.jpg",
  "company-logo.jpeg",
  "company-logo.webp",
  "company-logo.svg",
];

const CHATS_PREFIX = "chats__";

export interface BackupStatus {
  last_backup_at?: string;
  file_count_on_drive?: number;
  folder_url?: string;
  ok: boolean;
  reason?: string;
}

interface BackupState {
  last_backup_at?: string;
}

async function loadBackupState(): Promise<BackupState> {
  try {
    const raw = await fs.readFile(BACKUP_STATE_PATH, "utf8");
    return JSON.parse(raw) as BackupState;
  } catch {
    return {};
  }
}

async function saveBackupState(s: BackupState): Promise<void> {
  await fs.mkdir(path.dirname(BACKUP_STATE_PATH), { recursive: true });
  await fs.writeFile(BACKUP_STATE_PATH, JSON.stringify(s, null, 2), "utf8");
}

interface DriveFileInfo {
  id: string;
  name: string;
  size: number;
  mime: string;
  updated_at: string;
}

interface ListBackupResponse {
  ok: boolean;
  files?: DriveFileInfo[];
  folder_url?: string;
  error?: string;
}

interface DownloadResponse {
  ok: boolean;
  name?: string;
  mime_type?: string;
  size?: number;
  content_b64?: string;
  error?: string;
}

export interface BackupResult {
  uploaded: number;
  skipped: number;
  errors: { file: string; message: string }[];
}

export interface RestoreResult {
  restored: number;
  errors: { file: string; message: string }[];
  files: string[];
}

export async function getBackupStatus(): Promise<BackupStatus> {
  const cfg = await loadConfig();
  if (!cfg) {
    return { ok: false, reason: "Drive ยังไม่ได้เชื่อม" };
  }
  const state = await loadBackupState();
  try {
    const res = await callScript<ListBackupResponse>(cfg.url, {
      action: "list_backup",
    });
    if (!res.ok) {
      // Likely old Apps Script — return graceful status
      const msg = res.error || "list_backup ไม่รองรับ";
      if (/unknown action/i.test(msg)) {
        return {
          ok: false,
          last_backup_at: state.last_backup_at,
          reason:
            "Apps Script ของคุณยังเป็น v1 — ก๊อปสคริปต์ใหม่จากปุ่มเชื่อม Drive แล้ว 'Manage deployments → Edit → New version → Deploy'",
        };
      }
      return { ok: false, last_backup_at: state.last_backup_at, reason: msg };
    }
    return {
      ok: true,
      last_backup_at: state.last_backup_at,
      file_count_on_drive: res.files?.length ?? 0,
      folder_url: res.folder_url,
    };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export async function backupSetup(): Promise<BackupResult> {
  const cfg = await loadConfig();
  if (!cfg) throw new Error("Drive ยังไม่ได้เชื่อม");
  const result: BackupResult = { uploaded: 0, skipped: 0, errors: [] };

  for (const filename of SETUP_FILES) {
    const full = path.join(REPO_ROOT, "data", filename);
    try {
      const buf = await fs.readFile(full);
      await uploadOne(cfg.url, filename, buf, mimeForExt(path.extname(filename)));
      result.uploaded++;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        result.skipped++;
      } else {
        result.errors.push({ file: filename, message: err.message });
      }
    }
  }

  // Back up chat history (flattened: .chats/X.json → chats__X.json)
  try {
    const chatsDir = path.join(REPO_ROOT, "data", ".chats");
    const items = await fs.readdir(chatsDir);
    for (const f of items) {
      if (!f.endsWith(".json")) continue;
      try {
        const buf = await fs.readFile(path.join(chatsDir, f));
        await uploadOne(
          cfg.url,
          `${CHATS_PREFIX}${f}`,
          buf,
          "application/json",
        );
        result.uploaded++;
      } catch (e) {
        result.errors.push({
          file: `.chats/${f}`,
          message: (e as Error).message,
        });
      }
    }
  } catch {
    /* no .chats yet */
  }

  await saveBackupState({ last_backup_at: new Date().toISOString() });
  return result;
}

async function uploadOne(
  url: string,
  filename: string,
  buf: Buffer,
  mime: string,
): Promise<void> {
  const r = await callScript<UploadResponse>(url, {
    action: "upload",
    filename,
    category: BACKUP_CATEGORY,
    content_b64: buf.toString("base64"),
    mime_type: mime,
  });
  if (!r.ok) throw new Error(r.error || "upload failed");
}

export async function restoreFromDrive(): Promise<RestoreResult> {
  const cfg = await loadConfig();
  if (!cfg) throw new Error("Drive ยังไม่ได้เชื่อม");

  const list = await callScript<ListBackupResponse>(cfg.url, {
    action: "list_backup",
  });
  if (!list.ok) {
    throw new Error(list.error || "list_backup failed");
  }
  const result: RestoreResult = { restored: 0, errors: [], files: [] };
  if (!list.files?.length) return result;

  for (const f of list.files) {
    try {
      const dl = await callScript<DownloadResponse>(cfg.url, {
        action: "download",
        file_id: f.id,
      });
      if (!dl.ok || !dl.content_b64) {
        throw new Error(dl.error || "download failed");
      }
      const buf = Buffer.from(dl.content_b64, "base64");
      let target: string;
      if (f.name.startsWith(CHATS_PREFIX)) {
        target = path.join(
          REPO_ROOT,
          "data",
          ".chats",
          f.name.slice(CHATS_PREFIX.length),
        );
        await fs.mkdir(path.dirname(target), { recursive: true });
      } else {
        target = path.join(REPO_ROOT, "data", f.name);
      }
      await fs.writeFile(target, buf);
      result.restored++;
      result.files.push(path.relative(REPO_ROOT, target).split(path.sep).join("/"));
    } catch (e) {
      result.errors.push({ file: f.name, message: (e as Error).message });
    }
  }
  return result;
}

/** Extract YYYY-MM from a filename (e.g. "expense-2026-05-15-internet.pdf" → "2026-05"). */
function extractMonth(filename: string): string | null {
  const m = filename.match(/(\d{4})-(0[1-9]|1[0-2])(?:[-_.\d]|$)/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Extract person slug + YYYY-MM from a filename that follows the convention
 *   <prefix>-<person>-YYYY-MM[-anything].<ext>
 * e.g. "payslip-songkarn-2026-05.pdf"     → { person: "songkarn", month: "2026-05" }
 *      "wage-emp-001-2026-05.pdf"         → { person: "emp-001",  month: "2026-05" }
 *      "payslip-สมชาย-2026-05.pdf"        → { person: "สมชาย",   month: "2026-05" }
 * If the file is missing the person segment, returns person=null but still tries to extract month.
 */
function extractPersonAndMonth(filename: string): {
  person: string | null;
  month: string | null;
} {
  const noExt = filename.replace(/\.[^.]+$/, "");
  const m = noExt.match(/(\d{4})-(0[1-9]|1[0-2])(?:[-_.\d]|$)/);
  if (!m) return { person: null, month: null };
  const month = `${m[1]}-${m[2]}`;
  const before = noExt.slice(0, m.index).replace(/-+$/, "");
  const parts = before.split("-");
  // First segment is the prefix (payslip/wage/etc.); rest is the person.
  if (parts.length >= 2) {
    const person = parts.slice(1).join("-").toLowerCase();
    return { person: person || null, month };
  }
  return { person: null, month };
}

function mimeForExt(ext: string): string {
  const map: Record<string, string> = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".csv": "text/csv",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".html": "text/html",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

/* ---------- Smart input helpers ---------- */

export type UrlKind = "apps_script" | "drive_folder" | "unknown";

/** Classify a URL the user pastes into the setup modal. */
export function detectUrlKind(url: string): UrlKind {
  const u = url.trim();
  if (/^https:\/\/script\.google\.com\/macros\/s\/[^/?]+\/exec/.test(u)) return "apps_script";
  if (/^https:\/\/drive\.google\.com\/.*\/folders\/[a-zA-Z0-9_-]+/.test(u)) return "drive_folder";
  return "unknown";
}

/** Pull folder ID out of any /folders/<ID> style Drive URL. */
export function extractFolderId(url: string): string | null {
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/**
 * Render the Apps Script the user pastes into script.google.com.
 * If `targetFolderId` is supplied the script writes into that folder directly;
 * otherwise it creates "Virtual AI Company" in the user's Drive root.
 */
export function buildAppsScriptTemplate(targetFolderId?: string): string {
  const baked = (targetFolderId ?? "").trim();
  return `/**
 * Virtual AI Company — Drive Sync receiver  (v10)
 *
 * What's new in v10:
 *   - 🔒 FIX duplicate post bug: trigger overlap ทำให้แถวเดียวถูกยิง 2 ครั้ง
 *     a) LockService.getScriptLock() กั้น run ซ้อนกัน
 *     b) Row-level lock: เขียน status="publishing" + sheet.flush() ก่อน FB call
 *        — ถ้า trigger ที่ 2 เข้ามาตอนแรกยังไม่จบ จะเห็น status="publishing"
 *        แล้ว skip แถวนั้นแทนที่จะยิงซ้ำ
 *
 * v8:
 *   - Diagnostic writeback: every scheduler run records last_attempt_at,
 *     attempt_count, error_log on the Sheet row (BUG-003 fix). After 3
 *     attempts the row is auto-marked status=failed.
 *   - "fb_post_now" action: bypass the cron and publish a single row right
 *     now (BUG-004 fix). Updates the row in place same as the scheduler.
 *
 * v7:
 *   - Image posting via DriveApp.getFileById().getBlob() → multipart upload
 *   - Falls back to URL-based photo, then text-only
 *
 * วิธี deploy:
 *   1. ก๊อปทั้งไฟล์นี้ ไปวางที่ https://script.google.com (ทับโค้ดเดิม) → Save
 *   2. ⚠ ครั้งแรกหลัง paste: เมนูบน → Select function: "authorize" → ▶ Run → Allow ทุก scope (Drive + Sheets + UrlFetch + Triggers)
 *   3. Deploy → Manage deployments → ✏️ → Version: New version → Deploy
 *      (URL เดิม /exec ใช้ต่อได้ ไม่ต้องเปลี่ยน)
 */

const SCRIPT_VERSION = "10";
const MAX_ATTEMPTS = 3;
const BACKUP_FOLDER_NAME = "⚙ Setup Backup";
const FB_TRIGGER_FN = "runFbScheduler";
const SOCIAL_FOLDER = "📱 Social";
const SOCIAL_FILE = "Social Posts";
const SOCIAL_TAB = "queue";

// ถ้าใส่ folder ID ตรงนี้ ระบบจะบันทึกเข้า folder นั้นโดยตรง
// (เว้นว่าง = ระบบสร้างโฟลเดอร์ ROOT_FOLDER_NAME ที่ Drive root ของคุณ)
const TARGET_FOLDER_ID = "${baked}";
const ROOT_FOLDER_NAME = "Virtual AI Company";

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.action === "ping") {
      const root = getRoot_();
      return json_({
        ok: true,
        script_version: SCRIPT_VERSION,
        user_email: Session.getActiveUser().getEmail(),
        root_folder_id: root.getId(),
        root_folder_url: root.getUrl(),
        root_folder_name: root.getName(),
      });
    }

    if (body.action === "upload") {
      if (!body.filename) return json_({ ok: false, error: "filename required" });
      const root = getRoot_();
      const catName = body.category || "Misc";
      const cat = getOrCreateFolder_(catName, root);

      let target = cat;
      if (body.subfolder) {
        const segments = splitPath_(body.subfolder);
        for (var i = 0; i < segments.length; i++) {
          target = getOrCreateFolder_(segments[i], target);
        }
      }

      const bytes = Utilities.base64Decode(body.content_b64 || "");
      const blob = Utilities.newBlob(bytes, body.mime_type || "application/octet-stream", body.filename);

      const existing = target.getFilesByName(body.filename);
      while (existing.hasNext()) existing.next().setTrashed(true);

      const file = target.createFile(blob);
      return json_({ ok: true, id: file.getId(), url: file.getUrl() });
    }

    if (body.action === "list_backup") {
      const root = getRoot_();
      const folders = root.getFoldersByName(BACKUP_FOLDER_NAME);
      if (!folders.hasNext()) {
        return json_({ ok: true, files: [], folder_url: null });
      }
      const folder = folders.next();
      const it = folder.getFiles();
      const files = [];
      while (it.hasNext()) {
        const f = it.next();
        files.push({
          id: f.getId(),
          name: f.getName(),
          size: f.getSize(),
          mime: f.getMimeType(),
          updated_at: f.getLastUpdated().toISOString(),
        });
      }
      return json_({ ok: true, files: files, folder_url: folder.getUrl() });
    }

    if (body.action === "download") {
      if (!body.file_id) return json_({ ok: false, error: "file_id required" });
      const file = DriveApp.getFileById(body.file_id);
      const blob = file.getBlob();
      return json_({
        ok: true,
        name: file.getName(),
        mime_type: file.getMimeType(),
        size: file.getSize(),
        content_b64: Utilities.base64Encode(blob.getBytes()),
      });
    }

    /* ============================================================
     *   v5 — Google Sheets actions
     * ============================================================ */

    if (body.action === "init_sheet") {
      if (!body.filename) return json_({ ok: false, error: "filename required" });
      const ss = getOrCreateSheet_(body.folder_path || "", body.filename);
      const tabName = body.tab || "Sheet1";
      const createdTab = ensureTab_(ss, tabName, body.headers || []);
      return json_({
        ok: true,
        workbook_id: ss.getId(),
        workbook_url: ss.getUrl(),
        folder_path: body.folder_path || "",
        filename: body.filename,
        tab: tabName,
        tab_created: createdTab,
      });
    }

    if (body.action === "read_sheet") {
      if (!body.filename) return json_({ ok: false, error: "filename required" });
      const ss = findSheet_(body.folder_path || "", body.filename);
      if (!ss) return json_({ ok: false, error: "sheet not found: " + body.filename });
      const tabName = body.tab || ss.getSheets()[0].getName();
      const sheet = ss.getSheetByName(tabName);
      if (!sheet) return json_({ ok: false, error: "tab not found: " + tabName });

      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow === 0 || lastCol === 0) {
        return json_({ ok: true, headers: [], rows: [], workbook_url: ss.getUrl() });
      }
      const all = sheet.getRange(1, 1, lastRow, lastCol).getValues();
      const headers = all[0].map(function (h) { return String(h); });
      const rows = all.slice(1).map(function (row) {
        return row.map(function (cell) {
          if (cell === null || cell === undefined) return "";
          if (cell instanceof Date) return Utilities.formatDate(cell, Session.getScriptTimeZone(), "yyyy-MM-dd");
          return String(cell);
        });
      });
      return json_({ ok: true, headers: headers, rows: rows, workbook_url: ss.getUrl(), tab: tabName });
    }

    if (body.action === "write_sheet") {
      if (!body.filename) return json_({ ok: false, error: "filename required" });
      const headers = Array.isArray(body.headers) ? body.headers : null;
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!headers) return json_({ ok: false, error: "headers required" });

      const ss = getOrCreateSheet_(body.folder_path || "", body.filename);
      const tabName = body.tab || "Sheet1";
      var sheet = ss.getSheetByName(tabName);
      if (!sheet) sheet = ss.insertSheet(tabName);
      sheet.clearContents();

      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);

      if (rows.length > 0) {
        const padded = rows.map(function (r) {
          const out = new Array(headers.length);
          for (var k = 0; k < headers.length; k++) {
            out[k] = (k < r.length && r[k] !== null && r[k] !== undefined) ? r[k] : "";
          }
          return out;
        });
        sheet.getRange(2, 1, padded.length, headers.length).setValues(padded);
      }

      if (tabName !== "Sheet1") {
        const def = ss.getSheetByName("Sheet1");
        if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) {
          ss.deleteSheet(def);
        }
      }

      return json_({ ok: true, rows_written: rows.length, workbook_id: ss.getId(), workbook_url: ss.getUrl(), tab: tabName });
    }

    if (body.action === "list_workbooks") {
      const root = getRoot_();
      const out = [];
      collectSheets_(root, "", out, 2);
      return json_({ ok: true, workbooks: out, root_url: root.getUrl() });
    }

    /* ============================================================
     *   v6 — Facebook auto-posting
     * ============================================================ */

    if (body.action === "set_fb_config") {
      const props = PropertiesService.getScriptProperties();
      if (typeof body.page_id === "string") props.setProperty("FB_PAGE_ID", body.page_id);
      if (typeof body.page_token === "string") props.setProperty("FB_PAGE_TOKEN", body.page_token);
      if (typeof body.poll_interval_min === "number") props.setProperty("FB_POLL_INTERVAL_MIN", String(body.poll_interval_min));
      return json_({ ok: true });
    }

    if (body.action === "get_fb_config") {
      const props = PropertiesService.getScriptProperties();
      const pid = props.getProperty("FB_PAGE_ID") || "";
      const tok = props.getProperty("FB_PAGE_TOKEN") || "";
      const interval = props.getProperty("FB_POLL_INTERVAL_MIN") || "5";
      const lastRun = props.getProperty("FB_LAST_RUN_AT") || "";
      const lastErr = props.getProperty("FB_LAST_ERROR") || "";
      const lastResult = props.getProperty("FB_LAST_RESULT") || "";
      return json_({
        ok: true,
        page_id: pid,
        page_token_set: tok.length > 0,
        page_token_preview: tok ? (tok.slice(0, 6) + "…" + tok.slice(-4)) : "",
        poll_interval_min: parseInt(interval, 10),
        trigger_installed: hasFbTrigger_(),
        last_run_at: lastRun,
        last_error: lastErr,
        last_result: lastResult,
      });
    }

    if (body.action === "fb_test_post") {
      const cfg = fbConfig_();
      if (!cfg.page_id || !cfg.page_token) return json_({ ok: false, error: "ตั้ง FB Page ID + Token ก่อน" });
      const message = String(body.message || "").trim();
      if (!message) return json_({ ok: false, error: "message required" });
      try {
        const url = publishToFb_(cfg, message, body.image_url || "", body.drive_id || "");
        return json_({ ok: true, external_url: url });
      } catch (e) {
        return json_({ ok: false, error: String(e) });
      }
    }

    if (body.action === "install_fb_trigger") {
      const intervalMin = parseInt(String(body.interval_min || "5"), 10);
      uninstallFbTriggers_();
      ScriptApp.newTrigger(FB_TRIGGER_FN).timeBased().everyMinutes(clampInterval_(intervalMin)).create();
      PropertiesService.getScriptProperties().setProperty("FB_POLL_INTERVAL_MIN", String(intervalMin));
      return json_({ ok: true, trigger_installed: true, interval_min: intervalMin });
    }

    if (body.action === "uninstall_fb_trigger") {
      uninstallFbTriggers_();
      return json_({ ok: true, trigger_installed: false });
    }

    if (body.action === "run_fb_scheduler_now") {
      // Manual trigger for debugging — runs the same logic the time-trigger does
      const result = runFbSchedulerImpl_();
      return json_({ ok: true, result: result });
    }

    if (body.action === "fb_post_now") {
      if (!body.post_id) return json_({ ok: false, error: "post_id required" });
      const result = fbPostNowImpl_(String(body.post_id));
      return json_(result);
    }

    if (body.action === "fb_retry_post") {
      if (!body.post_id) return json_({ ok: false, error: "post_id required" });
      const result = fbResetRowImpl_(String(body.post_id));
      return json_(result);
    }

    return json_({ ok: false, error: "unknown action: " + body.action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json_({
    ok: true,
    script_version: SCRIPT_VERSION,
    hint: "POST {action:'ping'|'upload'|'list_backup'|'download'|'init_sheet'|'list_workbooks'|'read_sheet'|'write_sheet'|'fb_post_now'|'fb_retry_post'|...}",
  });
}

/**
 * 👉 รันฟังก์ชันนี้ครั้งเดียวจาก script editor หลัง paste โค้ด v5:
 *    1. เมนูบนสุด → Select function → "authorize"
 *    2. กด ▶ Run
 *    3. Google จะขอสิทธิ์ Sheets (เพิ่มจาก Drive เดิม) → Allow
 * จากนั้นค่อย Deploy → Manage deployments → New version → Deploy
 */
function authorize() {
  // Touch every service we use so Google detects all required OAuth scopes.
  DriveApp.getRootFolder().getName();
  SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().getProperty("_authorize_check");
  ScriptApp.getProjectTriggers();
  // UrlFetchApp is needed for Facebook Graph API calls
  try { UrlFetchApp.fetch("https://www.google.com/generate_204", { muteHttpExceptions: true }); } catch (e) {}
  Logger.log("authorized — Sheets + Drive + Properties + Triggers + UrlFetch scopes granted");
}

function getRoot_() {
  if (TARGET_FOLDER_ID && TARGET_FOLDER_ID.length > 0) {
    return DriveApp.getFolderById(TARGET_FOLDER_ID);
  }
  return getOrCreateFolder_(ROOT_FOLDER_NAME, DriveApp.getRootFolder());
}

function getOrCreateFolder_(name, parent) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function splitPath_(p) {
  return String(p)
    .split("/")
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; });
}

function resolveFolder_(folderPath, create) {
  var folder = getRoot_();
  const segs = splitPath_(folderPath);
  for (var i = 0; i < segs.length; i++) {
    if (create) {
      folder = getOrCreateFolder_(segs[i], folder);
    } else {
      const it = folder.getFoldersByName(segs[i]);
      if (!it.hasNext()) return null;
      folder = it.next();
    }
  }
  return folder;
}

function findSheet_(folderPath, filename) {
  const folder = resolveFolder_(folderPath, false);
  if (!folder) return null;
  const it = folder.getFilesByName(filename);
  while (it.hasNext()) {
    const f = it.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return SpreadsheetApp.openById(f.getId());
    }
  }
  return null;
}

function getOrCreateSheet_(folderPath, filename) {
  const existing = findSheet_(folderPath, filename);
  if (existing) return existing;
  const folder = resolveFolder_(folderPath, true);
  const ss = SpreadsheetApp.create(filename);
  const file = DriveApp.getFileById(ss.getId());
  // moveTo can silently no-op in some Drive setups, leaving the file at
  // "My Drive" root. Try moveTo first, then verify, then fall back to
  // addFile/removeFile if needed.
  try { file.moveTo(folder); } catch (e) { /* try fallback below */ }
  if (!isInFolder_(file, folder)) {
    folder.addFile(file);
    try { DriveApp.getRootFolder().removeFile(file); } catch (e) { /* not at root, fine */ }
  }
  return ss;
}

function isInFolder_(file, folder) {
  const parents = file.getParents();
  const fid = folder.getId();
  while (parents.hasNext()) {
    if (parents.next().getId() === fid) return true;
  }
  return false;
}

function ensureTab_(ss, tabName, headers) {
  var sheet = ss.getSheetByName(tabName);
  if (sheet) return false;
  const sheets = ss.getSheets();
  if (sheets.length === 1 && sheets[0].getName() === "Sheet1" && sheets[0].getLastRow() === 0) {
    sheet = sheets[0];
    sheet.setName(tabName);
  } else {
    sheet = ss.insertSheet(tabName);
  }
  if (headers && headers.length > 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return true;
}

function collectSheets_(folder, prefix, out, depthLeft) {
  if (depthLeft < 0) return;
  const fit = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (fit.hasNext()) {
    const f = fit.next();
    try {
      const ss = SpreadsheetApp.openById(f.getId());
      out.push({
        folder_path: prefix,
        filename: f.getName(),
        file_id: f.getId(),
        file_url: f.getUrl(),
        updated_at: f.getLastUpdated().toISOString(),
        tabs: ss.getSheets().map(function (s) {
          return { name: s.getName(), rows: Math.max(0, s.getLastRow() - 1) };
        }),
      });
    } catch (e) {
      out.push({ folder_path: prefix, filename: f.getName(), file_id: f.getId(), file_url: f.getUrl(), error: String(e) });
    }
  }
  const sit = folder.getFolders();
  while (sit.hasNext()) {
    const sub = sit.next();
    if (sub.getName() === BACKUP_FOLDER_NAME) continue;
    const nextPrefix = prefix ? (prefix + "/" + sub.getName()) : sub.getName();
    collectSheets_(sub, nextPrefix, out, depthLeft - 1);
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
 *   Facebook scheduler + Graph API helpers
 * ============================================================ */

function fbConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    page_id: props.getProperty("FB_PAGE_ID") || "",
    page_token: props.getProperty("FB_PAGE_TOKEN") || "",
  };
}

function clampInterval_(n) {
  // Apps Script time-based triggers: 1, 5, 10, 15, 30 minutes
  if (!n || n < 1) return 5;
  const allowed = [1, 5, 10, 15, 30];
  for (var i = allowed.length - 1; i >= 0; i--) {
    if (n >= allowed[i]) return allowed[i];
  }
  return 5;
}

function hasFbTrigger_() {
  const triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === FB_TRIGGER_FN) return true;
  }
  return false;
}

function uninstallFbTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === FB_TRIGGER_FN) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}

/**
 * Time-triggered entry point. Apps Script invokes this every N minutes.
 * Public so triggers can call it.
 */
function runFbScheduler() {
  runFbSchedulerImpl_();
}

function runFbSchedulerImpl_() {
  // v10 — กั้น trigger ซ้อนกัน ป้องกันโพสต์ซ้ำ
  // ถ้าอีก run หนึ่งกำลังทำงานอยู่ ไม่รอ — return เลย รอ tick ถัดไป
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) {
    const props = PropertiesService.getScriptProperties();
    props.setProperty("FB_LAST_RUN_AT", new Date().toISOString());
    props.setProperty("FB_LAST_RESULT", "skipped — another run in progress");
    return { published: 0, errors: 0, skipped: 0, note: "concurrent run" };
  }
  try {
    return runFbSchedulerCore_();
  } finally {
    lock.releaseLock();
  }
}

function runFbSchedulerCore_() {
  const props = PropertiesService.getScriptProperties();
  const cfg = fbConfig_();
  if (!cfg.page_id || !cfg.page_token) {
    props.setProperty("FB_LAST_ERROR", "ยังไม่ตั้ง Page ID + Token");
    props.setProperty("FB_LAST_RUN_AT", new Date().toISOString());
    return { published: 0, errors: 0, skipped: 0, note: "no config" };
  }

  // Open Social Posts sheet
  const ss = findSheet_(SOCIAL_FOLDER, SOCIAL_FILE);
  if (!ss) {
    props.setProperty("FB_LAST_ERROR", "ไม่พบ Social Posts sheet — push social-posts ก่อน");
    props.setProperty("FB_LAST_RUN_AT", new Date().toISOString());
    return { published: 0, errors: 0, skipped: 0, note: "no sheet" };
  }
  const sheet = ss.getSheetByName(SOCIAL_TAB);
  if (!sheet) {
    props.setProperty("FB_LAST_ERROR", "ไม่พบ tab " + SOCIAL_TAB);
    props.setProperty("FB_LAST_RUN_AT", new Date().toISOString());
    return { published: 0, errors: 0, skipped: 0, note: "no tab" };
  }
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    props.setProperty("FB_LAST_RUN_AT", new Date().toISOString());
    props.setProperty("FB_LAST_RESULT", "queue ว่าง");
    return { published: 0, errors: 0, skipped: 0, note: "empty queue" };
  }
  const cols = scanSocialColumns_(sheet);
  const all = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  const now = new Date();
  let published = 0;
  let errors = 0;
  let skipped = 0;

  for (var r = 1; r < all.length; r++) {
    const row = all[r];
    const platform = String(row[cols.iPlatform] || "").toLowerCase();
    const status = String(row[cols.iStatus] || "").toLowerCase();
    if (platform.indexOf("facebook") < 0 && platform !== "fb") {
      skipped++;
      continue;
    }
    if (status !== "scheduled") {
      // v10: ถ้าเจอ "publishing" ค้างก็ skip — แสดงว่ามี run อื่นกำลังจัดการ
      // (หลุดออกจาก lock ก็ได้แค่ run ถัดไปจะเห็นและทิ้งให้ค้าง — แก้มือผ่าน retry)
      skipped++;
      continue;
    }
    const sched = row[cols.iSched];
    const schedDate = sched ? (sched instanceof Date ? sched : new Date(String(sched))) : null;
    if (schedDate && schedDate.getTime() > now.getTime()) {
      skipped++;
      continue;
    }
    const prevAttempts = cols.iAttemptCount >= 0 ? parseInt(String(row[cols.iAttemptCount] || "0"), 10) || 0 : 0;
    const message = String(row[cols.iCopy] || "").trim();
    if (!message) {
      applyRowUpdates_(sheet, cols, [buildFailureUpdate_(r, prevAttempts, "ไม่มี copy")]);
      errors++;
      continue;
    }

    // v10: Row-level lock — เขียน status="publishing" + flush ก่อนเรียก FB
    // ป้องกัน trigger อื่น (ถ้าหลุด LockService) เห็นแถวเดียวกันเป็น scheduled แล้วยิงซ้ำ
    if (cols.iStatus >= 0) {
      sheet.getRange(r + 1, cols.iStatus + 1).setValue("publishing");
      SpreadsheetApp.flush();
    }

    try {
      const driveId = cols.iAssetDriveId >= 0 ? String(row[cols.iAssetDriveId] || "") : "";
      const assetUrl = cols.iAssetUrl >= 0 ? String(row[cols.iAssetUrl] || "") : "";
      const url = publishToFb_(cfg, message, assetUrl, driveId);
      applyRowUpdates_(sheet, cols, [{
        row: r,
        status: "published",
        external_url: url,
        published_at: new Date().toISOString(),
        error: "",
        last_attempt_at: new Date().toISOString(),
        attempt_count: prevAttempts + 1,
        error_log: "",
      }]);
      published++;
    } catch (e) {
      applyRowUpdates_(sheet, cols, [buildFailureUpdate_(r, prevAttempts, String(e))]);
      errors++;
    }
  }

  props.setProperty("FB_LAST_RUN_AT", now.toISOString());
  props.setProperty("FB_LAST_RESULT", "published=" + published + " errors=" + errors + " skipped=" + skipped);
  props.setProperty("FB_LAST_ERROR", errors > 0 ? "see Sheet rows" : "");
  return { published: published, errors: errors, skipped: skipped };
}

/** Map a Social Posts sheet's headers → column indices (one place to keep in sync). */
function scanSocialColumns_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h); });
  const colOf = function (name) { return headers.indexOf(name); };
  return {
    headers: headers,
    iId: colOf("post_id"),
    iPlatform: colOf("platform"),
    iStatus: colOf("status"),
    iSched: colOf("scheduled_at"),
    iCopy: colOf("copy"),
    iAssetUrl: colOf("asset_url"),
    iAssetDriveId: colOf("asset_drive_id"),
    iExternal: colOf("external_url"),
    iPub: colOf("published_at"),
    iErr: colOf("error"),
    iLastAttempt: colOf("last_attempt_at"),
    iAttemptCount: colOf("attempt_count"),
    iErrLog: colOf("error_log"),
  };
}

/**
 * Build the row update for a failed publish attempt. If we've already retried
 * MAX_ATTEMPTS - 1 times, lock the post to status=failed so the cron stops
 * banging on it. Otherwise keep status=scheduled for the next pass.
 */
function buildFailureUpdate_(rowIdx, prevAttempts, errorText) {
  const nextAttempts = prevAttempts + 1;
  const newStatus = nextAttempts >= MAX_ATTEMPTS ? "failed" : "scheduled";
  return {
    row: rowIdx,
    status: newStatus,
    error: errorText.slice(0, 500),
    last_attempt_at: new Date().toISOString(),
    attempt_count: nextAttempts,
    error_log: errorText.slice(0, 500),
  };
}

/** Apply a list of update objects back to the sheet using the indices from scanSocialColumns_. */
function applyRowUpdates_(sheet, cols, updates) {
  for (var u = 0; u < updates.length; u++) {
    const up = updates[u];
    const sheetRow = up.row + 1;
    if (cols.iStatus >= 0 && up.status) sheet.getRange(sheetRow, cols.iStatus + 1).setValue(up.status);
    if (cols.iExternal >= 0 && up.external_url != null) sheet.getRange(sheetRow, cols.iExternal + 1).setValue(up.external_url);
    if (cols.iPub >= 0 && up.published_at) sheet.getRange(sheetRow, cols.iPub + 1).setValue(up.published_at);
    if (cols.iErr >= 0 && up.error != null) sheet.getRange(sheetRow, cols.iErr + 1).setValue(up.error);
    if (cols.iLastAttempt >= 0 && up.last_attempt_at) sheet.getRange(sheetRow, cols.iLastAttempt + 1).setValue(up.last_attempt_at);
    if (cols.iAttemptCount >= 0 && up.attempt_count != null) sheet.getRange(sheetRow, cols.iAttemptCount + 1).setValue(up.attempt_count);
    if (cols.iErrLog >= 0 && up.error_log != null) sheet.getRange(sheetRow, cols.iErrLog + 1).setValue(up.error_log);
  }
}

/**
 * Publish a single row right now, bypassing the time trigger (BUG-004).
 * Same writeback semantics as the scheduler so the Sheet stays consistent.
 * v10: LockService + row-level "publishing" lock — กัน scheduler trigger
 * ยิงซ้ำเวลา user กดปุ่ม "post now" ขณะ cron กำลัง run อยู่
 */
function fbPostNowImpl_(postId) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return { ok: false, error: "อีก run หนึ่งกำลังทำงาน — ลองอีก 5 วินาที", post_id: postId };
  }
  try {
    return fbPostNowCore_(postId);
  } finally {
    lock.releaseLock();
  }
}

function fbPostNowCore_(postId) {
  const cfg = fbConfig_();
  if (!cfg.page_id || !cfg.page_token) {
    return { ok: false, error: "ตั้ง FB Page ID + Token ก่อน" };
  }
  const ss = findSheet_(SOCIAL_FOLDER, SOCIAL_FILE);
  if (!ss) return { ok: false, error: "ไม่พบ Social Posts sheet — push social-posts ก่อน" };
  const sheet = ss.getSheetByName(SOCIAL_TAB);
  if (!sheet) return { ok: false, error: "ไม่พบ tab " + SOCIAL_TAB };
  const cols = scanSocialColumns_(sheet);
  const lastRow = sheet.getLastRow();
  if (cols.iId < 0 || lastRow < 2) return { ok: false, error: "queue ว่างหรือไม่มี post_id column" };
  const all = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  let rowIdx = -1;
  for (var i = 0; i < all.length; i++) {
    if (String(all[i][cols.iId]) === postId) { rowIdx = i + 1; break; }
  }
  if (rowIdx < 0) return { ok: false, error: "ไม่พบ post_id: " + postId };
  const row = all[rowIdx - 1];

  // v10: เช็คก่อนยิง — ถ้า status เป็น published/publishing แล้ว ห้ามยิงซ้ำ
  const curStatus = cols.iStatus >= 0 ? String(row[cols.iStatus] || "").toLowerCase() : "";
  if (curStatus === "published") {
    const existingUrl = cols.iExternal >= 0 ? String(row[cols.iExternal] || "") : "";
    return { ok: false, error: "โพสต์นี้ published แล้ว — ป้องกันยิงซ้ำ", external_url: existingUrl, post_id: postId };
  }
  if (curStatus === "publishing") {
    return { ok: false, error: "โพสต์นี้กำลัง publish อยู่ — รอสักครู่", post_id: postId };
  }

  const message = String(row[cols.iCopy] || "").trim();
  if (!message) return { ok: false, error: "post นี้ไม่มี copy" };
  const prevAttempts = cols.iAttemptCount >= 0 ? parseInt(String(row[cols.iAttemptCount] || "0"), 10) || 0 : 0;

  // v10: Row-level lock
  if (cols.iStatus >= 0) {
    sheet.getRange(rowIdx + 1, cols.iStatus + 1).setValue("publishing");
    SpreadsheetApp.flush();
  }

  try {
    const driveId = cols.iAssetDriveId >= 0 ? String(row[cols.iAssetDriveId] || "") : "";
    const assetUrl = cols.iAssetUrl >= 0 ? String(row[cols.iAssetUrl] || "") : "";
    const url = publishToFb_(cfg, message, assetUrl, driveId);
    applyRowUpdates_(sheet, cols, [{
      row: rowIdx,
      status: "published",
      external_url: url,
      published_at: new Date().toISOString(),
      error: "",
      last_attempt_at: new Date().toISOString(),
      attempt_count: prevAttempts + 1,
      error_log: "",
    }]);
    return { ok: true, external_url: url, post_id: postId };
  } catch (e) {
    applyRowUpdates_(sheet, cols, [buildFailureUpdate_(rowIdx, prevAttempts, String(e))]);
    return { ok: false, error: String(e), post_id: postId };
  }
}

/**
 * Reset a row that previously errored back to status=scheduled with
 * attempt_count=0 and clear error_log. The next scheduler pass will retry it.
 */
function fbResetRowImpl_(postId) {
  const ss = findSheet_(SOCIAL_FOLDER, SOCIAL_FILE);
  if (!ss) return { ok: false, error: "ไม่พบ Social Posts sheet" };
  const sheet = ss.getSheetByName(SOCIAL_TAB);
  if (!sheet) return { ok: false, error: "ไม่พบ tab " + SOCIAL_TAB };
  const cols = scanSocialColumns_(sheet);
  const lastRow = sheet.getLastRow();
  if (cols.iId < 0 || lastRow < 2) return { ok: false, error: "queue ว่าง" };
  const all = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < all.length; i++) {
    if (String(all[i][cols.iId]) === postId) {
      const sheetRow = i + 2;
      if (cols.iStatus >= 0) sheet.getRange(sheetRow, cols.iStatus + 1).setValue("scheduled");
      if (cols.iAttemptCount >= 0) sheet.getRange(sheetRow, cols.iAttemptCount + 1).setValue(0);
      if (cols.iErrLog >= 0) sheet.getRange(sheetRow, cols.iErrLog + 1).setValue("");
      if (cols.iErr >= 0) sheet.getRange(sheetRow, cols.iErr + 1).setValue("");
      return { ok: true, post_id: postId };
    }
  }
  return { ok: false, error: "ไม่พบ post_id: " + postId };
}

/**
 * Publish to a Facebook Page. Three paths (priority: drive_id > image_url > text):
 *   1. drive_id present → DriveApp.getFileById().getBlob() → multipart upload to /photos
 *   2. image_url is HTTP(s) → FB crawls and attaches the URL
 *   3. Neither → text-only post to /feed
 */
function publishToFb_(cfg, message, image_url, drive_id) {
  if (drive_id) return publishPhotoFromDrive_(cfg, message, drive_id);
  const isUrl = image_url && /^https?:\\/\\//i.test(image_url);
  if (isUrl) return publishPhotoFromUrl_(cfg, message, image_url);
  return publishText_(cfg, message);
}

function publishText_(cfg, message) {
  const endpoint = "https://graph.facebook.com/v18.0/" + cfg.page_id + "/feed";
  const resp = UrlFetchApp.fetch(endpoint, {
    method: "post",
    payload: { access_token: cfg.page_token, message: message },
    muteHttpExceptions: true,
  });
  return parsePostResponse_(resp);
}

function publishPhotoFromUrl_(cfg, message, image_url) {
  const endpoint = "https://graph.facebook.com/v18.0/" + cfg.page_id + "/photos";
  const resp = UrlFetchApp.fetch(endpoint, {
    method: "post",
    payload: { access_token: cfg.page_token, url: image_url, caption: message },
    muteHttpExceptions: true,
  });
  return parsePostResponse_(resp);
}

function publishPhotoFromDrive_(cfg, message, drive_id) {
  var blob;
  try {
    blob = DriveApp.getFileById(drive_id).getBlob();
  } catch (e) {
    throw new Error("Drive file ไม่พบ/เข้าถึงไม่ได้ (id=" + drive_id + "): " + e);
  }
  // UrlFetchApp encodes multipart/form-data when a Blob is included in payload
  const endpoint = "https://graph.facebook.com/v18.0/" + cfg.page_id + "/photos";
  const resp = UrlFetchApp.fetch(endpoint, {
    method: "post",
    payload: {
      access_token: cfg.page_token,
      caption: message,
      source: blob,
    },
    muteHttpExceptions: true,
  });
  return parsePostResponse_(resp);
}

function parsePostResponse_(resp) {
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("HTTP " + code + ": " + text);
  }
  const data = JSON.parse(text);
  // /photos endpoint returns {id, post_id}; /feed returns {id}
  const postId = data.post_id || data.id;
  if (!postId) throw new Error("ไม่ได้ post_id กลับมา: " + text);
  // post_id format: "PAGE_ID_POST_ID" → facebook.com/PAGE_ID/posts/POST_ID
  return "https://www.facebook.com/" + postId.replace("_", "/posts/");
}
`;
}

/** Pre-baked default template (no folder targeting). Kept for back-compat. */
export const APPS_SCRIPT_TEMPLATE = buildAppsScriptTemplate();
