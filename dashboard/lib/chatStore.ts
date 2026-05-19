import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR, REPO_ROOT } from "./repo";
import { EMPLOYEES } from "./employees";

/**
 * File-based chat persistence.
 *
 * Each "conversation" gets one file at data/.chats/<id>.json.
 * Reserved IDs:
 *   - "meeting-room"          → the central auto-dispatch chat
 *   - "direct-<employee-slug>" → one-on-one chats with a specific employee
 */

export const CHATS_DIR = path.join(DATA_DIR, ".chats");

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

export interface ChatRecord {
  id: string;
  title: string;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
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

/* ---------- File I/O ---------- */

async function ensureDir() {
  await fs.mkdir(CHATS_DIR, { recursive: true });
}

function chatPath(id: string): string {
  return path.join(CHATS_DIR, `${sanitizeChatId(id)}.json`);
}

export async function loadChat(id: string): Promise<ChatRecord | null> {
  try {
    const raw = await fs.readFile(chatPath(id), "utf8");
    return JSON.parse(raw) as ChatRecord;
  } catch {
    return null;
  }
}

export async function saveChat(record: ChatRecord): Promise<void> {
  await ensureDir();
  record.updated_at = new Date().toISOString();
  if (!record.created_at) record.created_at = record.updated_at;
  if (!record.title) record.title = titleFor(record.id);
  await fs.writeFile(chatPath(record.id), JSON.stringify(record, null, 2), "utf8");
}

export async function deleteChat(id: string): Promise<void> {
  try {
    await fs.unlink(chatPath(id));
  } catch {
    /* ignore */
  }
}

export async function listChats(): Promise<ChatListItem[]> {
  await ensureDir();
  let files: string[] = [];
  try {
    files = await fs.readdir(CHATS_DIR);
  } catch {
    return [];
  }
  const out: ChatListItem[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(CHATS_DIR, f), "utf8");
      const rec = JSON.parse(raw) as ChatRecord;
      out.push({
        id: rec.id,
        title: rec.title || titleFor(rec.id),
        created_at: rec.created_at,
        updated_at: rec.updated_at,
        message_count: rec.messages?.length ?? 0,
      });
    } catch {
      /* ignore corrupt */
    }
  }
  return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/** Append/replace messages for a conversation. */
export async function upsertChatMessages(
  id: string,
  messages: ChatMessage[],
): Promise<ChatRecord> {
  const existing = await loadChat(id);
  const now = new Date().toISOString();
  const rec: ChatRecord = {
    id,
    title: existing?.title || titleFor(id),
    created_at: existing?.created_at || now,
    updated_at: now,
    messages,
  };
  await saveChat(rec);
  return rec;
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
          lines.push(
            `> 🔧 **${b.name}** \`${b.summary}\` ${icon}`,
          );
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

/** Write transcript markdown to outputs/chats/chat-<date>-<id>.md and return rel path. */
export async function dumpTranscript(id: string): Promise<string | null> {
  const rec = await loadChat(id);
  if (!rec || rec.messages.length === 0) return null;
  const md = renderTranscript(rec);
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 16);
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
