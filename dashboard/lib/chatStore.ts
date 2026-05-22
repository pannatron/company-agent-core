import { promises as fs } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { DATA_DIR, REPO_ROOT } from "./repo";
import { EMPLOYEES } from "./employees";
import { withFileLock } from "./fileLock";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Chat persistence — JSONL append-only with a small sidecar meta file.
 *
 * Layout per conversation:
 *   data/.chats/<id>.meta.json       — title / counts / timestamps
 *   data/.chats/<id>.jsonl           — one ChatMessage per line, append-only
 *   data/.chats/<id>.archive.jsonl.gz — gzipped older messages (created when
 *                                       the active jsonl exceeds ACTIVE_LIMIT;
 *                                       only fetched when the client pages back
 *                                       past the active window)
 *
 * Why JSONL?
 *   Appending a new turn no longer rewrites the whole file — at 1k messages
 *   that's 50× less disk I/O per turn. The trade-off is that editing/deleting
 *   a single old message requires rewriting the log. We don't do that today;
 *   if we ever need it, we'll write a compactor instead of slowing down the
 *   hot path.
 *
 * Migration: an old `<id>.json` from the v1 layout is converted to the new
 * format on first access and renamed `<id>.json.bak` (kept until proven).
 *
 * Reserved IDs:
 *   - "meeting-room"           → the central auto-dispatch chat
 *   - "direct-<employee-slug>" → 1:1 chats with a specific employee
 */

export const CHATS_DIR = path.join(DATA_DIR, ".chats");

/** Active log size at which we trigger an archive pass. */
const ACTIVE_LIMIT = 400;
/** How many recent messages stay in the active jsonl after archiving. */
const ACTIVE_KEEP = 200;

export type ChatRespondent = {
  slug: string;
  name: string;
  title: string;
  department: string;
  accent: string;
  avatarUrl?: string;
  reason?: string;
};

export type ChatBlock =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      summary: string;
      status: "running" | "ok" | "error";
      preview?: string;
    };

export type ChatAttachment = {
  path: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
};

export type ChatMessage =
  | {
      role: "user";
      content: string;
      attachments?: ChatAttachment[];
      timestamp: string;
    }
  | {
      role: "assistant";
      respondent: ChatRespondent | null;
      blocks: ChatBlock[];
      status: "done" | "error";
      durationMs?: number;
      timestamp: string;
    };

export interface ChatMeta {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  /** Messages currently in archive.jsonl.gz (i.e. not in active jsonl). */
  archived_count: number;
}

export interface ChatRecord extends ChatMeta {
  messages: ChatMessage[];
}

export interface ChatListItem {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  message_count: number;
}

/* ---------- ID helpers ---------- */

export function sanitizeChatId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "default";
}

/** Derive the conversation ID for a given chat request. */
export function deriveChatId(employee: string, providedId?: string): string {
  if (providedId) return sanitizeChatId(providedId);
  if (employee === "auto" || !employee) return "meeting-room";
  return `direct-${sanitizeChatId(employee)}`;
}

/** Human-readable title from id */
export function titleFor(id: string): string {
  if (id === "meeting-room") return "Meeting Room";
  if (id.startsWith("direct-")) {
    const slug = id.slice("direct-".length);
    const emp = EMPLOYEES.find((e) => e.slug === slug);
    return emp ? `คุยกับ ${emp.name}` : id;
  }
  return id;
}

/* ---------- Paths ---------- */

async function ensureDir(): Promise<void> {
  await fs.mkdir(CHATS_DIR, { recursive: true });
}

function metaPath(id: string): string {
  return path.join(CHATS_DIR, `${sanitizeChatId(id)}.meta.json`);
}
function jsonlPath(id: string): string {
  return path.join(CHATS_DIR, `${sanitizeChatId(id)}.jsonl`);
}
function archivePath(id: string): string {
  return path.join(CHATS_DIR, `${sanitizeChatId(id)}.archive.jsonl.gz`);
}
function legacyJsonPath(id: string): string {
  return path.join(CHATS_DIR, `${sanitizeChatId(id)}.json`);
}

/* ---------- Migration from v1 (<id>.json) ---------- */

async function migrateIfLegacy(id: string): Promise<void> {
  const legacy = legacyJsonPath(id);
  const meta = metaPath(id);
  try {
    await fs.access(meta);
    return; // already migrated
  } catch {
    /* meta missing — fall through */
  }
  let raw: string;
  try {
    raw = await fs.readFile(legacy, "utf8");
  } catch {
    return; // nothing to migrate
  }
  let parsed: {
    id?: string;
    title?: string;
    created_at?: string;
    updated_at?: string;
    messages?: ChatMessage[];
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const msgs = Array.isArray(parsed.messages) ? parsed.messages : [];
  await ensureDir();
  const jsonl = jsonlPath(id);
  const lines = msgs.map((m) => JSON.stringify(m)).join("\n");
  await fs.writeFile(jsonl, lines ? lines + "\n" : "", "utf8");
  const now = new Date().toISOString();
  const metaRec: ChatMeta = {
    id,
    title: parsed.title || titleFor(id),
    created_at: parsed.created_at || now,
    updated_at: parsed.updated_at || now,
    message_count: msgs.length,
    archived_count: 0,
  };
  await fs.writeFile(meta, JSON.stringify(metaRec, null, 2), "utf8");
  // Keep the original file as .bak until we trust the new format
  try {
    await fs.rename(legacy, legacy + ".bak");
  } catch {
    /* ignore */
  }
}

/* ---------- Low-level reads ---------- */

async function readMeta(id: string): Promise<ChatMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(id), "utf8");
    return JSON.parse(raw) as ChatMeta;
  } catch {
    return null;
  }
}

async function writeMeta(meta: ChatMeta): Promise<void> {
  await ensureDir();
  await fs.writeFile(metaPath(meta.id), JSON.stringify(meta, null, 2), "utf8");
}

/** Read all lines from a JSONL file, ignoring blanks and parse errors. */
async function readJsonl(file: string): Promise<ChatMessage[]> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return [];
  }
  const out: ChatMessage[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as ChatMessage);
    } catch {
      /* skip corrupt line */
    }
  }
  return out;
}

async function readArchive(id: string): Promise<ChatMessage[]> {
  let buf: Buffer;
  try {
    buf = await fs.readFile(archivePath(id));
  } catch {
    return [];
  }
  const raw = (await gunzip(buf)).toString("utf8");
  const out: ChatMessage[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as ChatMessage);
    } catch {
      /* skip */
    }
  }
  return out;
}

async function writeArchive(id: string, msgs: ChatMessage[]): Promise<void> {
  const lines = msgs.map((m) => JSON.stringify(m)).join("\n");
  const buf = await gzip(Buffer.from(lines ? lines + "\n" : "", "utf8"));
  await ensureDir();
  await fs.writeFile(archivePath(id), buf);
}

/* ---------- Public read API ---------- */

export interface LoadOptions {
  /** Return at most this many messages (taken from the tail). */
  limit?: number;
  /** Only return messages with timestamp < this ISO string. */
  before?: string;
  /** When true, decompress and include the archive in the search range. */
  includeArchive?: boolean;
}

/** Get just the meta record (no message body) — cheap, for room lists. */
export async function loadChatMeta(id: string): Promise<ChatMeta | null> {
  await migrateIfLegacy(id);
  return readMeta(id);
}

/** Load messages with optional pagination. */
export async function loadChatMessages(
  id: string,
  opts: LoadOptions = {},
): Promise<ChatMessage[]> {
  await migrateIfLegacy(id);
  const active = await readJsonl(jsonlPath(id));

  // Decide whether we need the archive. We pull it when:
  //   - caller explicitly asked, OR
  //   - caller is paging back (`before`) and that timestamp predates the
  //     earliest message we have in active.
  let pool = active;
  const needArchive =
    opts.includeArchive ||
    (opts.before &&
      active.length > 0 &&
      opts.before <= active[0].timestamp);
  if (needArchive) {
    const archived = await readArchive(id);
    pool = [...archived, ...active];
  }

  let filtered = pool;
  if (opts.before) {
    filtered = filtered.filter((m) => m.timestamp < opts.before!);
  }
  if (opts.limit && filtered.length > opts.limit) {
    filtered = filtered.slice(filtered.length - opts.limit);
  }
  return filtered;
}

/**
 * Backward-compat: load the whole chat as a single record.
 * Includes the archive — only use this for transcript dump or small chats.
 */
export async function loadChat(id: string): Promise<ChatRecord | null> {
  await migrateIfLegacy(id);
  const meta = await readMeta(id);
  if (!meta) return null;
  const messages = await loadChatMessages(id, { includeArchive: true });
  return { ...meta, messages };
}

export async function listChats(): Promise<ChatListItem[]> {
  await ensureDir();
  let files: string[] = [];
  try {
    files = await fs.readdir(CHATS_DIR);
  } catch {
    return [];
  }
  // Migrate any stragglers so we can rely on .meta.json below.
  const legacy = files.filter((f) => f.endsWith(".json") && !f.endsWith(".meta.json"));
  for (const f of legacy) {
    const id = f.slice(0, -".json".length);
    await migrateIfLegacy(id);
  }
  // Re-list after migration
  try {
    files = await fs.readdir(CHATS_DIR);
  } catch {
    return [];
  }
  const out: ChatListItem[] = [];
  for (const f of files) {
    if (!f.endsWith(".meta.json")) continue;
    try {
      const raw = await fs.readFile(path.join(CHATS_DIR, f), "utf8");
      const m = JSON.parse(raw) as ChatMeta;
      out.push({
        id: m.id,
        title: m.title || titleFor(m.id),
        created_at: m.created_at,
        updated_at: m.updated_at,
        message_count: m.message_count,
      });
    } catch {
      /* skip corrupt */
    }
  }
  return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/* ---------- Public write API ---------- */

/**
 * Append messages to a chat's active jsonl. Updates meta atomically and
 * triggers an archive pass if the active log has grown past ACTIVE_LIMIT.
 *
 * This is the hot-path write. We hold the per-file lock so two concurrent
 * turns can't interleave their appends in unpredictable order.
 */
export async function appendChatMessages(
  id: string,
  messages: ChatMessage[],
): Promise<ChatMeta> {
  if (messages.length === 0) {
    const cur = (await loadChatMeta(id)) ?? initialMeta(id);
    return cur;
  }
  return withFileLock(jsonlPath(id), async () => {
    await migrateIfLegacy(id);
    await ensureDir();
    const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
    await fs.appendFile(jsonlPath(id), lines, "utf8");

    const now = new Date().toISOString();
    const prev = (await readMeta(id)) ?? initialMeta(id, now);
    const next: ChatMeta = {
      ...prev,
      title: prev.title || titleFor(id),
      created_at: prev.created_at || now,
      updated_at: now,
      message_count: prev.message_count + messages.length,
    };
    await writeMeta(next);

    // Phase 2 — archive cold messages if the active log got too big.
    if (next.message_count - next.archived_count > ACTIVE_LIMIT) {
      try {
        await rollArchive(id, next);
      } catch {
        /* archive failure is non-fatal — active log keeps working */
      }
    }
    return next;
  });
}

function initialMeta(id: string, now = new Date().toISOString()): ChatMeta {
  return {
    id,
    title: titleFor(id),
    created_at: now,
    updated_at: now,
    message_count: 0,
    archived_count: 0,
  };
}

/**
 * Move all-but-the-last-ACTIVE_KEEP messages from the active jsonl into the
 * gzipped archive. Existing archive is decompressed and the moved chunk is
 * concatenated onto it. Done under the same file lock as appends.
 */
async function rollArchive(id: string, meta: ChatMeta): Promise<void> {
  const active = await readJsonl(jsonlPath(id));
  if (active.length <= ACTIVE_KEEP) return;
  const cutoff = active.length - ACTIVE_KEEP;
  const toArchive = active.slice(0, cutoff);
  const remain = active.slice(cutoff);

  const existingArchive = await readArchive(id);
  await writeArchive(id, [...existingArchive, ...toArchive]);

  // Rewrite active jsonl with just the recent tail.
  const recentLines = remain.map((m) => JSON.stringify(m)).join("\n");
  await fs.writeFile(jsonlPath(id), recentLines ? recentLines + "\n" : "", "utf8");

  meta.archived_count += toArchive.length;
  await writeMeta(meta);
}

export async function deleteChat(id: string): Promise<void> {
  await Promise.all(
    [metaPath(id), jsonlPath(id), archivePath(id), legacyJsonPath(id), legacyJsonPath(id) + ".bak"].map(
      (p) =>
        fs.unlink(p).catch(() => {
          /* ignore */
        }),
    ),
  );
}

/* ---------- Markdown transcript renderer ---------- */

export function renderTranscript(rec: ChatRecord): string {
  const lines: string[] = [];
  lines.push(`# ${rec.title}`);
  lines.push("");
  lines.push(`- **Conversation ID:** \`${rec.id}\``);
  lines.push(`- **เริ่มต้น:** ${rec.created_at}`);
  lines.push(`- **อัปเดตล่าสุด:** ${rec.updated_at}`);
  lines.push(`- **จำนวนข้อความ:** ${rec.messages.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const m of rec.messages) {
    if (m.role === "user") {
      lines.push(`### 👤 ผู้ใช้ — _${fmt(m.timestamp)}_`);
      lines.push("");
      if (m.attachments?.length) {
        lines.push("**แนบไฟล์:**");
        for (const a of m.attachments) {
          lines.push(`- \`${a.path}\` (${a.mimeType}, ${a.name})`);
        }
        lines.push("");
      }
      if (m.content?.trim()) {
        lines.push(m.content);
      }
    } else {
      const r = m.respondent;
      const who = r ? `${r.name} — ${r.title}` : "Assistant";
      lines.push(`### 🤖 ${who} — _${fmt(m.timestamp)}_`);
      if (r?.reason) {
        lines.push(`> _ถูกเรียกเพราะ: ${r.reason}_`);
      }
      lines.push("");

      for (const b of m.blocks) {
        if (b.kind === "text") {
          lines.push(b.text);
          lines.push("");
        } else if (b.kind === "thinking") {
          lines.push("<details><summary>🧠 ความคิดภายใน</summary>");
          lines.push("");
          lines.push(b.text);
          lines.push("");
          lines.push("</details>");
          lines.push("");
        } else if (b.kind === "tool") {
          const icon = b.status === "ok" ? "✓" : b.status === "error" ? "✗" : "…";
          lines.push(`> 🔧 **${b.name}** \`${b.summary}\` ${icon}`);
          if (b.preview) {
            lines.push(">");
            for (const ln of b.preview.split("\n")) {
              lines.push(`> ${ln}`);
            }
          }
          lines.push("");
        }
      }

      if (m.durationMs != null) {
        lines.push(`_เสร็จใน ${(m.durationMs / 1000).toFixed(1)} วินาที_`);
        lines.push("");
      }
    }
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}

/** Write transcript markdown to outputs/chats/chat-<date>-<id>.md. */
export async function dumpTranscript(id: string): Promise<string | null> {
  const rec = await loadChat(id);
  if (!rec || rec.messages.length === 0) return null;
  const md = renderTranscript(rec);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const filename = `chat-${stamp}-${sanitizeChatId(id)}.md`;
  const dir = path.join(REPO_ROOT, "outputs", "chats");
  await fs.mkdir(dir, { recursive: true });
  const full = path.join(dir, filename);
  await fs.writeFile(full, md, "utf8");
  return path.relative(REPO_ROOT, full).split(path.sep).join("/");
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
