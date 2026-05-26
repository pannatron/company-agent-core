import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./repo";
import { parseCsv } from "./sheetSync";
import { withFileLock } from "./fileLock";
import { syncAll as syncDriveAll, isConfigured as isDriveConfigured } from "./driveSync";

/**
 * social-posts.json ↔ Google Sheets mirror.
 *
 * The local JSON keeps the canonical accounts[] list (which is NOT mirrored to
 * the Sheet — accounts are config, not a queue). The posts[] array is what we
 * mirror to a flat tabular Sheet so:
 *   - Apps Script time-trigger can poll the Sheet and publish due posts
 *   - Trigger updates the Sheet row (status, external_url, error, engagement)
 *   - Next pull reconstructs posts[] back into the JSON
 *
 * Lives in a separate module from sheetSync.ts because the conversion is
 * post-array-specific (not generic CSV round-trip).
 */

const SOCIAL_PATH = path.join(DATA_DIR, "social-posts.json");

export const SOCIAL_TOPIC = {
  id: "social-posts",
  label: "Social posts queue",
  folder: "📱 Social",
  filename: "Social Posts",
  tab: "queue",
} as const;

export const SOCIAL_HEADERS = [
  "post_id",
  "platform",
  "status",
  "scheduled_at",
  "title",
  "copy",
  "asset_path",
  "asset_url",
  "asset_drive_id",
  "external_url",
  "published_at",
  "engagement_likes",
  "engagement_comments",
  "engagement_shares",
  "engagement_views",
  "approved_by",
  "campaign",
  "writer",
  "designer",
  "error",
  "notes",
  // Diagnostics (BUG-003) — Apps Script writes back on every attempt
  "last_attempt_at",
  "attempt_count",
  "error_log",
] as const;

/** Statuses we recognise. Pushing an unknown status is rejected by the validator. */
export const POST_STATUSES = [
  "draft",
  "ready_for_review",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

interface Engagement {
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
}

interface Post {
  id: string;
  platform: string;
  status: string;
  title?: string;
  copy?: string;
  asset_prompt?: string;
  /** Local path to image, e.g., "outputs/content/launch-asset.jpg". Used to look up Drive file ID. */
  asset_file?: string;
  /** External image URL (publicly accessible). If present, FB crawls this. */
  asset_url?: string;
  /** Google Drive file ID (looked up from .drive-state.json by asset_file). Apps Script fetches blob + multipart upload. */
  asset_drive_id?: string;
  designer?: string;
  writer?: string;
  approved_by?: string | null;
  scheduled_at?: string;
  published_at?: string;
  external_url?: string;
  campaign?: string;
  engagement?: Engagement | null;
  error?: string;
  notes?: string;
  /** ISO datetime of the most recent Apps Script attempt to publish (BUG-003) */
  last_attempt_at?: string;
  /** Count of attempts so far. Apps Script auto-fails the post once this reaches 3 (BUG-003) */
  attempt_count?: number;
  /** Last error message returned by Facebook / Apps Script (BUG-003) */
  error_log?: string;
}

/* ---------- Drive state lookup for image posts ---------- */

const DRIVE_STATE_PATH = path.join(DATA_DIR, ".drive-state.json");

interface FileSyncEntry {
  drive_id: string;
  url: string;
  synced_at: string;
  size_at_sync: number;
  category: string;
}

interface DriveState {
  files: Record<string, FileSyncEntry>;
}

let driveStateCache: DriveState | null = null;

async function loadDriveState(): Promise<DriveState> {
  if (driveStateCache) return driveStateCache;
  try {
    const raw = await fs.readFile(DRIVE_STATE_PATH, "utf8");
    driveStateCache = JSON.parse(raw) as DriveState;
    return driveStateCache;
  } catch {
    driveStateCache = { files: {} };
    return driveStateCache;
  }
}

/** Reset cache so a fresh state file is read on next call (used between push runs). */
function resetDriveStateCache(): void {
  driveStateCache = null;
}

/**
 * Look up Drive file ID for a local asset path.
 *
 * `assetFile` should be a path relative to the repo root, e.g.,
 *   "outputs/content/launch-asset.jpg"
 * The state file key is `<path>#<tag>` (tag="root" by default).
 * If the file hasn't been Drive-synced yet, returns null.
 */
async function lookupDriveId(assetFile: string | undefined): Promise<string | null> {
  if (!assetFile) return null;
  const state = await loadDriveState();
  // Try direct match first
  const directKey = `${assetFile}#root`;
  if (state.files[directKey]) return state.files[directKey].drive_id;
  // Try any matching tag (by-person / by-month / etc.)
  for (const [key, entry] of Object.entries(state.files)) {
    if (key.startsWith(`${assetFile}#`)) return entry.drive_id;
  }
  return null;
}

interface Account {
  id: string;
  platform: string;
  handle: string;
  connected: boolean;
  follower_count?: number;
  /** Stored config — Page ID / token reference. Tokens themselves live in Apps Script properties, NOT here. */
  page_id?: string;
}

interface SocialFile {
  updated_at: string;
  accounts: Account[];
  posts: Post[];
}

async function readSocialFile(): Promise<SocialFile> {
  try {
    const raw = await fs.readFile(SOCIAL_PATH, "utf8");
    return JSON.parse(raw) as SocialFile;
  } catch {
    return {
      updated_at: new Date().toISOString().slice(0, 10),
      accounts: [],
      posts: [],
    };
  }
}

async function writeSocialFile(data: SocialFile): Promise<void> {
  await fs.mkdir(path.dirname(SOCIAL_PATH), { recursive: true });
  data.updated_at = new Date().toISOString().slice(0, 10);
  await withFileLock(SOCIAL_PATH, () =>
    fs.writeFile(SOCIAL_PATH, JSON.stringify(data, null, 2), "utf8"),
  );
}

/**
 * Convert in-memory posts[] → CSV rows (parallel to SOCIAL_HEADERS).
 *
 * Async because we look up the Drive file ID for each post's `asset_file`
 * from `.drive-state.json`. If the asset isn't yet on Drive, asset_drive_id
 * is left blank and Apps Script falls back to URL/text-only.
 */
export async function postsToRows(posts: Post[]): Promise<string[][]> {
  resetDriveStateCache(); // fresh state for each push
  const rows: string[][] = [];
  for (const p of posts) {
    // Prefer explicitly-set asset_drive_id; otherwise look up by asset_file
    const driveId = p.asset_drive_id || (await lookupDriveId(p.asset_file));
    rows.push([
      p.id ?? "",
      p.platform ?? "",
      p.status ?? "",
      p.scheduled_at ?? "",
      p.title ?? "",
      p.copy ?? "",
      p.asset_file ?? "",
      p.asset_url ?? "",
      driveId ?? "",
      p.external_url ?? "",
      p.published_at ?? "",
      String(p.engagement?.likes ?? ""),
      String(p.engagement?.comments ?? ""),
      String(p.engagement?.shares ?? ""),
      String(p.engagement?.views ?? ""),
      p.approved_by ?? "",
      p.campaign ?? "",
      p.writer ?? "",
      p.designer ?? "",
      p.error ?? "",
      p.notes ?? "",
      p.last_attempt_at ?? "",
      p.attempt_count != null ? String(p.attempt_count) : "",
      p.error_log ?? "",
    ]);
  }
  return rows;
}

/** Rebuild posts[] from Sheet rows. Unknown columns are ignored; missing columns become "". */
export function rowsToPosts(headers: string[], rows: string[][]): Post[] {
  const idx = (name: string) => headers.indexOf(name);
  const col = (row: string[], name: string) => {
    const i = idx(name);
    return i >= 0 && i < row.length ? row[i] : "";
  };
  const num = (s: string): number | undefined => {
    if (!s) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };

  const out: Post[] = [];
  for (const row of rows) {
    const id = col(row, "post_id");
    if (!id) continue; // skip rows without a post_id
    const eng: Engagement = {};
    const likes = num(col(row, "engagement_likes"));
    const comments = num(col(row, "engagement_comments"));
    const shares = num(col(row, "engagement_shares"));
    const views = num(col(row, "engagement_views"));
    if (likes != null) eng.likes = likes;
    if (comments != null) eng.comments = comments;
    if (shares != null) eng.shares = shares;
    if (views != null) eng.views = views;
    const attemptCount = num(col(row, "attempt_count"));
    out.push({
      id,
      platform: col(row, "platform"),
      status: col(row, "status"),
      scheduled_at: col(row, "scheduled_at") || undefined,
      title: col(row, "title") || undefined,
      copy: col(row, "copy") || undefined,
      asset_file: col(row, "asset_path") || undefined,
      asset_url: col(row, "asset_url") || undefined,
      asset_drive_id: col(row, "asset_drive_id") || undefined,
      external_url: col(row, "external_url") || undefined,
      published_at: col(row, "published_at") || undefined,
      engagement: Object.keys(eng).length ? eng : null,
      approved_by: col(row, "approved_by") || undefined,
      campaign: col(row, "campaign") || undefined,
      writer: col(row, "writer") || undefined,
      designer: col(row, "designer") || undefined,
      error: col(row, "error") || undefined,
      notes: col(row, "notes") || undefined,
      last_attempt_at: col(row, "last_attempt_at") || undefined,
      attempt_count: attemptCount,
      error_log: col(row, "error_log") || undefined,
    });
  }
  return out;
}

/* ---------- Validation (BUG-002) ---------- */

export interface ValidationIssue {
  /** Post id (or "<post #N>" if id missing) */
  post_id: string;
  /** Field that failed, or "*" for whole-row issues */
  field: string;
  message: string;
}

/**
 * Validate posts before pushing to Sheet. Catches the schema drift that
 * silently breaks the auto-post pipeline (image posts missing asset_file,
 * scheduled posts missing scheduled_at, unknown statuses, etc).
 *
 * Returns [] when everything is OK. The push API turns a non-empty list
 * into a 400 response so the caller knows exactly what to fix.
 */
export function validatePosts(posts: Post[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  posts.forEach((p, idx) => {
    const ref = p.id || `<post #${idx + 1}>`;
    if (!p.id) {
      issues.push({ post_id: ref, field: "id", message: "id required" });
    } else if (seenIds.has(p.id)) {
      issues.push({ post_id: ref, field: "id", message: "duplicate id" });
    } else {
      seenIds.add(p.id);
    }
    if (!p.platform) {
      issues.push({ post_id: ref, field: "platform", message: "platform required" });
    }
    if (!p.status) {
      issues.push({ post_id: ref, field: "status", message: "status required" });
    } else if (!(POST_STATUSES as readonly string[]).includes(p.status)) {
      issues.push({
        post_id: ref,
        field: "status",
        message: `unknown status "${p.status}" (expected one of ${POST_STATUSES.join(", ")})`,
      });
    }
    if (!p.copy || !p.copy.trim()) {
      issues.push({ post_id: ref, field: "copy", message: "copy required" });
    }

    if (p.status === "scheduled" || p.status === "published") {
      if (!p.scheduled_at) {
        issues.push({
          post_id: ref,
          field: "scheduled_at",
          message: `scheduled_at required for status="${p.status}"`,
        });
      } else if (Number.isNaN(Date.parse(p.scheduled_at))) {
        issues.push({
          post_id: ref,
          field: "scheduled_at",
          message: `scheduled_at "${p.scheduled_at}" is not a valid ISO datetime`,
        });
      }
    }

    // Image post: if the designer left an asset_prompt OR the post is image-bearing
    // (asset_url present), asset_file must point to a local file Drive can sync.
    // This is the bug that bit us — agents created posts with asset_prompt but
    // forgot asset_file, so Apps Script skipped them silently.
    const looksLikeImagePost = !!p.asset_prompt || !!p.asset_url;
    if (looksLikeImagePost && !p.asset_file && !p.asset_url) {
      issues.push({
        post_id: ref,
        field: "asset_file",
        message:
          "image post needs asset_file (local path) or asset_url (public URL) — Apps Script will skip otherwise",
      });
    }

    // Raw upload guard: block posts that point at outputs/uploads/ directly.
    // The uploads folder is the raw drop zone (timestamp filenames). Agents
    // must rename/move to outputs/content/ AND resize to -web.jpg before push,
    // otherwise FB gets a multi-MB phone photo with no edit pass.
    // Only enforced for posts going live — drafts can keep placeholder paths.
    const isGoingLive = p.status === "scheduled" || p.status === "approved";
    if (isGoingLive && p.asset_file && /(^|\/)outputs\/uploads\//.test(p.asset_file)) {
      issues.push({
        post_id: ref,
        field: "asset_file",
        message:
          `asset_file ชี้ไปที่ outputs/uploads/ — รูปดิบที่ยังไม่ผ่าน resize ห้ามโพสต์ตรงๆ. ` +
          `ให้รัน playbook "prepare-fb-image" (cp + resize -Z 1080 → -web.jpg) แล้วชี้ asset_file ไปที่ outputs/content/...-web.jpg`,
      });
    }
  });

  return issues;
}

/**
 * File-system guard: open each scheduled/approved post's image and reject if
 * it looks like a raw, unprocessed asset. Agents have a documented habit of
 * skipping the resize step and posting 4-MB phone photos straight to FB —
 * this is the stop sign.
 *
 * Heuristics (all path/size-based, no image decode):
 *  - Filename should contain "-web" (the convention from playbook entry
 *    `resize-image-web-1080`). Missing → block.
 *  - File size > 1.5 MB → block (a properly resized 1080px JPG q85 is ~150-600 KB).
 *
 * Only checks posts about to go live (status scheduled/approved) with a local
 * asset_file. Missing files are NOT this function's concern — collectMissing()
 * already covers that.
 */
export async function validateAssetProcessed(posts: Post[]): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const REPO_ROOT = path.resolve(DATA_DIR, "..");
  const MAX_BYTES = 1_500_000;

  for (const p of posts) {
    const willGoLive = p.status === "scheduled" || p.status === "approved";
    if (!willGoLive) continue;
    if (!p.asset_file) continue;
    // skip remote URLs — those are caller's responsibility
    if (/^https?:\/\//i.test(p.asset_file)) continue;

    const abs = path.isAbsolute(p.asset_file)
      ? p.asset_file
      : path.join(REPO_ROOT, p.asset_file);
    let size = 0;
    try {
      const st = await fs.stat(abs);
      size = st.size;
    } catch {
      continue; // missing file — let collectMissing report it
    }

    const base = path.basename(p.asset_file).toLowerCase();
    const isImage = /\.(jpe?g|png|webp|gif|heic)$/i.test(base);
    if (!isImage) continue;

    if (!base.includes("-web")) {
      issues.push({
        post_id: p.id,
        field: "asset_file",
        message:
          `รูปยังไม่ผ่าน resize — ชื่อไฟล์ "${base}" ไม่มี suffix "-web". ` +
          `รัน playbook "prepare-fb-image" เพื่อทำ cp + resize -Z 1080 → -web.jpg ก่อนค่อยชี้ asset_file ใหม่`,
      });
      continue; // one issue per post is enough
    }

    if (size > MAX_BYTES) {
      issues.push({
        post_id: p.id,
        field: "asset_file",
        message:
          `รูปใหญ่เกิน (${(size / 1024 / 1024).toFixed(1)} MB > 1.5 MB) — น่าจะเป็นภาพดิบที่ยังไม่ถูก compress. ` +
          `รัน playbook "resize-image-web-1080" (sips -Z 1080 -s formatOptions 85) แล้วใช้ไฟล์ -web.jpg แทน`,
      });
    }
  }

  return issues;
}

/* ---------- Public push / pull ---------- */

const CONFIG_PATH = path.join(DATA_DIR, ".drive-config.json");

async function loadDriveUrl(): Promise<string> {
  const raw = await fs.readFile(CONFIG_PATH, "utf8");
  const cfg = JSON.parse(raw) as { url?: string };
  if (!cfg.url) throw new Error("Drive ยังไม่ได้เชื่อม");
  return cfg.url;
}

async function callScript<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "follow",
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Apps Script ไม่ตอบเป็น JSON — ตรวจว่าเป็น v6+");
  }
}

interface WriteSheetResponse {
  ok: boolean;
  rows_written?: number;
  workbook_url?: string;
  error?: string;
}

interface ReadSheetResponse {
  ok: boolean;
  headers?: string[];
  rows?: string[][];
  workbook_url?: string;
  error?: string;
}

/** Thrown by pushSocialPosts when validation fails. Push route turns this into 400. */
export class SocialPostValidationError extends Error {
  issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(
      `social-posts.json validation failed (${issues.length} issue${issues.length === 1 ? "" : "s"})`,
    );
    this.name = "SocialPostValidationError";
    this.issues = issues;
  }
}

/** Read social-posts.json → validate → push posts[] into Sheets. */
export async function pushSocialPosts(): Promise<{
  rows: number;
  workbook_url?: string;
}> {
  const url = await loadDriveUrl();
  const data = await readSocialFile();
  const issues = validatePosts(data.posts);
  if (issues.length > 0) {
    throw new SocialPostValidationError(issues);
  }

  const assetProcessedIssues = await validateAssetProcessed(data.posts);
  if (assetProcessedIssues.length > 0) {
    throw new SocialPostValidationError(assetProcessedIssues);
  }

  // BUG-006: Catch posts that are about to be published but whose image asset
  // isn't on Drive yet. If we let these through, Apps Script publishes the
  // post as text-only (no fallback) and we silently lose the image.
  //
  // First pass: try to auto-sync missing assets to Drive so the user doesn't
  // have to babysit. Only if the file is *still* missing after sync do we
  // throw — usually that means the asset_file path is wrong or the file
  // doesn't exist on disk.
  const collectMissing = async (): Promise<ValidationIssue[]> => {
    resetDriveStateCache();
    const missing: ValidationIssue[] = [];
    for (const p of data.posts) {
      const willBePublished = p.status === "scheduled" || p.status === "approved";
      if (!willBePublished) continue;
      if (!p.asset_file) continue; // text-only post — OK
      if (p.asset_drive_id) continue; // explicitly set
      const driveId = await lookupDriveId(p.asset_file);
      if (driveId) continue;
      if (p.asset_url) continue; // external URL fallback — Apps Script will use it
      missing.push({
        post_id: p.id,
        field: "asset_drive_id",
        message: `asset_file "${p.asset_file}" ยังไม่ sync ขึ้น Drive`,
      });
    }
    return missing;
  };

  let assetIssues = await collectMissing();
  if (assetIssues.length > 0 && (await isDriveConfigured())) {
    // Try an opportunistic drive sync so the user doesn't have to switch
    // tabs and click manually. Swallow errors — we'll re-validate and emit
    // a clear message either way.
    try {
      await syncDriveAll();
    } catch {
      /* fall through to second validation pass */
    }
    assetIssues = await collectMissing();
  }
  if (assetIssues.length > 0) {
    // Re-message now that we know auto-sync didn't help.
    for (const iss of assetIssues) {
      iss.message = `${iss.message} — ลอง sync เองแล้วก็ยังไม่เจอ; ตรวจว่าไฟล์มีอยู่จริงในเครื่อง หรือใส่ asset_url แทน (ถ้า push เลย รูปจะหายตอนโพสต์จริง)`;
    }
    throw new SocialPostValidationError(assetIssues);
  }

  const rows = await postsToRows(data.posts);
  const r = await callScript<WriteSheetResponse>(url, {
    action: "write_sheet",
    folder_path: SOCIAL_TOPIC.folder,
    filename: SOCIAL_TOPIC.filename,
    tab: SOCIAL_TOPIC.tab,
    headers: SOCIAL_HEADERS,
    rows,
  });
  if (!r.ok) throw new Error(r.error || "write_sheet failed");
  return { rows: r.rows_written ?? rows.length, workbook_url: r.workbook_url };
}

/** Read Sheets → rebuild posts[] → write social-posts.json (preserving accounts[]). */
export async function pullSocialPosts(): Promise<{
  posts: number;
  workbook_url?: string;
}> {
  const url = await loadDriveUrl();
  const r = await callScript<ReadSheetResponse>(url, {
    action: "read_sheet",
    folder_path: SOCIAL_TOPIC.folder,
    filename: SOCIAL_TOPIC.filename,
    tab: SOCIAL_TOPIC.tab,
  });
  if (!r.ok) throw new Error(r.error || "read_sheet failed");
  const posts = rowsToPosts(r.headers || [], r.rows || []);
  const current = await readSocialFile();
  current.posts = posts;
  await writeSocialFile(current);
  return { posts: posts.length, workbook_url: r.workbook_url };
}

/** Re-export parseCsv so the API routes don't have to import it from sheetSync directly */
export { parseCsv };
