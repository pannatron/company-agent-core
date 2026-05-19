import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./repo";
import { parseCsv } from "./sheetSync";

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
] as const;

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
  asset_file?: string;
  asset_url?: string;
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
  await fs.writeFile(SOCIAL_PATH, JSON.stringify(data, null, 2), "utf8");
}

/** Convert in-memory posts[] → CSV rows (parallel to SOCIAL_HEADERS). */
export function postsToRows(posts: Post[]): string[][] {
  return posts.map((p) => [
    p.id ?? "",
    p.platform ?? "",
    p.status ?? "",
    p.scheduled_at ?? "",
    p.title ?? "",
    p.copy ?? "",
    p.asset_file ?? "",
    p.asset_url ?? "",
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
  ]);
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
    out.push({
      id,
      platform: col(row, "platform"),
      status: col(row, "status"),
      scheduled_at: col(row, "scheduled_at") || undefined,
      title: col(row, "title") || undefined,
      copy: col(row, "copy") || undefined,
      asset_file: col(row, "asset_path") || undefined,
      asset_url: col(row, "asset_url") || undefined,
      external_url: col(row, "external_url") || undefined,
      published_at: col(row, "published_at") || undefined,
      engagement: Object.keys(eng).length ? eng : null,
      approved_by: col(row, "approved_by") || undefined,
      campaign: col(row, "campaign") || undefined,
      writer: col(row, "writer") || undefined,
      designer: col(row, "designer") || undefined,
      error: col(row, "error") || undefined,
      notes: col(row, "notes") || undefined,
    });
  }
  return out;
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

/** Read social-posts.json → push posts[] into Sheets. */
export async function pushSocialPosts(): Promise<{
  rows: number;
  workbook_url?: string;
}> {
  const url = await loadDriveUrl();
  const data = await readSocialFile();
  const rows = postsToRows(data.posts);
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
