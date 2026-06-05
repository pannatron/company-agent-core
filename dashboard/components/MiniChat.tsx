"use client";

import { useCallback, useEffect, useRef, useState, type ClipboardEvent } from "react";
import { EmployeeMeta } from "@/lib/employees";

/* ================================================================== *
 *  MiniChat — in-game chat popup opened by pressing E at a desk.
 *
 *  A trimmed sibling of ChatPane: streams plain assistant text from
 *  /api/chat (same NDJSON protocol, same `direct-<slug>` chatId so the
 *  full history is still persisted server-side). It hydrates the last
 *  page of history on open (so reopening a desk shows the prior chat)
 *  but skips file uploads, tool-call rendering and back-pagination to
 *  stay light and game-like. Tool activity collapses into a "กำลังทำงาน…"
 *  status line instead of detailed blocks.
 * ================================================================== */

interface Attachment {
  path: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  status?: "streaming" | "done" | "error";
  activity?: string; // last tool summary while streaming, shown as a status hint
  durationMs?: number; // assistant turn wall-clock, shown in the "done" badge
  attachments?: Attachment[]; // files the user attached to this turn
}

/* ---- Persisted history shapes (mirror of lib/chatStore ChatMessage) --- */
type HistBlock =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; summary?: string };
interface HistMsg {
  role: "user" | "assistant";
  content?: string;
  blocks?: HistBlock[];
  status?: "done" | "error";
  durationMs?: number;
  attachments?: Attachment[];
}

/** Flatten an assistant message's text blocks into one display string. */
function blocksToText(blocks: HistBlock[] | undefined): string {
  return (blocks ?? [])
    .filter((b): b is { kind: "text"; text: string } => b.kind === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();
}

/** Map a persisted chat message to a MiniChat Turn (drops thinking/tool blocks). */
function histToTurn(m: HistMsg): Turn {
  if (m.role === "user")
    return { role: "user", text: m.content || "", attachments: m.attachments };
  return {
    role: "assistant",
    text: blocksToText(m.blocks),
    status: m.status === "error" ? "error" : "done",
    durationMs: m.durationMs,
  };
}

const ACCENT: Record<EmployeeMeta["accent"], string> = {
  indigo: "#818cf8",
  rose: "#fb7185",
  amber: "#fbbf24",
  emerald: "#34d399",
  sky: "#38bdf8",
  violet: "#a78bfa",
  teal: "#2dd4bf",
  fuchsia: "#e879f9",
  cyan: "#22d3ee",
  pink: "#f472b6",
  orange: "#fb923c",
};

interface Props {
  employee: EmployeeMeta;
  onClose: () => void;
  /** Escape hatch: leave the game and open the full ChatPane in the dashboard. */
  onOpenFull: () => void;
}

export default function MiniChat({ employee, onClose, onOpenFull }: Props) {
  const chatId = `direct-${employee.slug}`;
  const accent = ACCENT[employee.accent] || "#818cf8";
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Focus the input on open so the user can type immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Hydrate the last page of persisted history so reopening a desk shows the
  // prior conversation (same store ChatPane uses). Newest 30 turns is plenty
  // for the game popup; the full thread stays available via "เปิดเต็ม".
  useEffect(() => {
    let alive = true;
    setLoadingHistory(true);
    fetch(`/api/chats/${chatId}?limit=30`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rec: { messages?: HistMsg[] } | null) => {
        if (!alive) return;
        const msgs = rec?.messages ?? [];
        setTurns(
          msgs
            .map(histToTurn)
            .filter((t) => t.text || (t.attachments && t.attachments.length > 0)),
        );
      })
      .catch(() => {
        /* offline / new chat — start empty */
      })
      .finally(() => {
        if (alive) setLoadingHistory(false);
      });
    return () => {
      alive = false;
    };
  }, [chatId]);

  // Auto-scroll to newest.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  // ESC closes (capture phase so it wins over the game's keydown handler).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (streaming) abortRef.current?.abort();
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, streaming]);

  const patchLastAssistant = useCallback(
    (fn: (t: Turn) => Turn) => {
      setTurns((cur) => {
        const i = cur.length - 1;
        if (i < 0 || cur[i].role !== "assistant") return cur;
        const next = cur.slice();
        next[i] = fn(next[i]);
        return next;
      });
    },
    [],
  );

  // Upload picked/pasted files to /api/upload (same endpoint + Attachment shape
  // ChatPane uses) and stage them as pending chips until the next send.
  async function uploadFiles(fileList: FileList | File[] | null) {
    if (!fileList || (fileList as { length?: number }).length === 0) return;
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(fileList as ArrayLike<File>)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `อัปโหลดล้มเหลว ${res.status}`);
        uploaded.push(data as Attachment);
      }
      setPendingFiles((cur) => [...cur, ...uploaded]);
    } catch (e) {
      setTurns((cur) => [
        ...cur,
        { role: "assistant", text: `แนบไฟล์ไม่สำเร็จ: ${(e as Error).message}`, status: "error" },
      ]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removePending(path: string) {
    setPendingFiles((cur) => cur.filter((f) => f.path !== path));
  }

  // Paste an image (screenshot / copied file) straight into the input to attach.
  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    void uploadFiles(files);
  }

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && pendingFiles.length === 0) || streaming) return;

    const history = turns
      .filter((t) => t.text)
      .map((t) => ({ role: t.role, content: t.text }));
    const attached = pendingFiles;
    const content = text || "(แนบไฟล์มา — ช่วยดูให้ที)";
    const userTurn: Turn = {
      role: "user",
      text: content,
      attachments: attached.length ? attached : undefined,
    };
    const asstTurn: Turn = { role: "assistant", text: "", status: "streaming" };
    setTurns((cur) => [...cur, userTurn, asstTurn]);
    setInput("");
    setPendingFiles([]);
    setStreaming(true);

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employee: employee.slug,
          chatId,
          messages: [...history, { role: "user", content }],
          attachments: attached.map((a) => ({
            path: a.path,
            name: a.name,
            mimeType: a.mimeType,
          })),
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handle = (evt: Record<string, unknown>) => {
        const ty = evt.type as string;
        if (ty === "text") {
          const chunk = String(evt.text ?? "");
          patchLastAssistant((t) => ({ ...t, text: t.text + chunk }));
        } else if (ty === "tool_use") {
          patchLastAssistant((t) => ({
            ...t,
            activity: String(evt.summary ?? "กำลังทำงาน…"),
          }));
        } else if (ty === "done") {
          const dur = typeof evt.duration_ms === "number" ? (evt.duration_ms as number) : undefined;
          patchLastAssistant((t) => ({
            ...t,
            status: "done",
            activity: undefined,
            durationMs: dur ?? t.durationMs,
          }));
        } else if (ty === "error") {
          patchLastAssistant((t) => ({
            ...t,
            status: "error",
            text: t.text || String(evt.message ?? "เกิดข้อผิดพลาด"),
          }));
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            handle(JSON.parse(line));
          } catch {
            /* ignore malformed line */
          }
        }
      }
      if (buffer.trim()) {
        try {
          handle(JSON.parse(buffer));
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        patchLastAssistant((t) => ({
          ...t,
          status: "error",
          text: t.text || (e as Error).message,
        }));
      } else {
        patchLastAssistant((t) => ({ ...t, status: "done", activity: undefined }));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, turns, pendingFiles, employee.slug, chatId, patchLastAssistant]);

  return (
    <div
      className="absolute inset-0 z-30 flex items-end justify-center p-4 sm:items-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative flex h-[420px] w-full max-w-md flex-col overflow-hidden rounded-lg border-2 bg-surface shadow-2xl"
        style={{ borderColor: accent }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — pixel game style */}
        <div
          className="flex items-center justify-between border-b-2 border-border px-3 py-2"
          style={{ background: accent + "22" }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded border-2 text-xs font-bold"
              style={{ borderColor: accent, color: accent }}
            >
              {employee.firstName.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-mono text-xs font-bold text-ink">
                {employee.firstName}
              </p>
              <p className="truncate font-mono text-[10px] text-ink-dim">
                {employee.title}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onOpenFull}
              title="เปิดแชทเต็มในหน้า Dashboard (มีประวัติ + แนบไฟล์)"
              className="font-mono text-[10px] text-ink-dim hover:text-ink"
            >
              เปิดเต็ม ↗
            </button>
            <button
              onClick={onClose}
              className="font-mono text-[10px] text-ink-dim hover:text-ink"
            >
              [ ปิด · ESC ]
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 font-mono text-xs">
          {turns.length === 0 ? (
            loadingHistory ? (
              <p className="text-ink-dim">กำลังโหลดแชทเก่า…</p>
            ) : (
              <p className="text-ink-dim">
                พิมพ์ข้อความเพื่อคุยกับ {employee.firstName} ได้เลย —
                ประวัติเต็มดูได้ในหน้า Dashboard
              </p>
            )
          ) : (
            <div className="space-y-2.5">
              {turns.map((t, i) => (
                <div
                  key={i}
                  className={t.role === "user" ? "text-right" : "text-left"}
                >
                  <span
                    className={[
                      "inline-block max-w-[85%] whitespace-pre-wrap rounded-md px-2.5 py-1.5 text-left align-top leading-relaxed",
                      t.role === "user"
                        ? "bg-accent-soft/80 text-white"
                        : "bg-surface-2 text-ink",
                      t.status === "error" ? "text-rose-300" : "",
                    ].join(" ")}
                  >
                    {t.role === "user" &&
                      t.attachments &&
                      t.attachments.length > 0 && (
                        <span className="mb-1 flex flex-wrap gap-1">
                          {t.attachments.map((a) => (
                            <MiniAttachment key={a.path} a={a} />
                          ))}
                        </span>
                      )}
                    {t.text || (
                      <span className="text-ink-dim">
                        {t.activity || "กำลังคิด…"}
                      </span>
                    )}
                    {t.status === "streaming" && t.text && (
                      <span className="ml-0.5 animate-pulse">▍</span>
                    )}
                  </span>
                  {t.role === "assistant" &&
                    t.status === "streaming" &&
                    t.activity &&
                    t.text && (
                      <p className="mt-0.5 text-[10px] text-ink-dim">
                        ⚙ {t.activity}
                      </p>
                    )}
                  {t.role === "assistant" && t.status === "done" && t.text && (
                    <p className="mt-0.5 text-[10px] text-emerald-400">
                      ✓ ตอบเสร็จแล้ว
                      {t.durationMs != null && (
                        <span className="text-ink-dim">
                          {" "}
                          · {(t.durationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                    </p>
                  )}
                  {t.role === "assistant" && t.status === "error" && (
                    <p className="mt-0.5 text-[10px] text-rose-400">✕ เกิดข้อผิดพลาด</p>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t-2 border-border px-2.5 py-2">
          {pendingFiles.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {pendingFiles.map((f) => (
                <MiniFileChip
                  key={f.path}
                  file={f}
                  onRemove={() => removePending(f.path)}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,.heic,.heif,application/pdf,text/csv,text/plain,application/json,.xls,.xlsx"
              className="hidden"
              onChange={(e) => uploadFiles(e.target.files)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading || streaming}
              title="แนบไฟล์ (รูป, PDF, CSV, ข้อความ) — วางรูปก็ได้"
              className="grid h-[34px] w-9 shrink-0 place-items-center rounded border-2 border-border bg-bg text-ink-dim hover:border-accent hover:text-ink disabled:opacity-40"
            >
              {uploading ? (
                <span className="animate-pulse text-[9px]">…</span>
              ) : (
                <PaperclipIcon />
              )}
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                // Keep keystrokes out of the game's WASD handler while typing.
                e.stopPropagation();
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`คุยกับ ${employee.firstName}…`}
              disabled={streaming}
              className="flex-1 rounded border-2 border-border bg-bg px-2.5 py-1.5 font-mono text-xs text-ink outline-none placeholder:text-ink-dim focus:border-accent disabled:opacity-60"
            />
            {streaming ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="rounded border-2 border-rose-500/50 bg-rose-500/10 px-2.5 py-1.5 font-mono text-xs font-bold text-rose-300 hover:bg-rose-500/20"
              >
                หยุด
              </button>
            ) : (
              <button
                onClick={send}
                disabled={!input.trim() && pendingFiles.length === 0}
                className="rounded border-2 px-2.5 py-1.5 font-mono text-xs font-bold disabled:opacity-40"
                style={{ borderColor: accent, color: accent }}
              >
                ส่ง
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Attachment bits (compact siblings of ChatPane's) ------------------- */

function PaperclipIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Thumbnail/chip shown on a sent user turn. */
function MiniAttachment({ a }: { a: Attachment }) {
  if (a.mimeType.startsWith("image/")) {
    return (
      <a
        href={a.url}
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded border border-white/30"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={a.name} className="h-10 w-10 object-cover" />
      </a>
    );
  }
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded border border-white/30 bg-white/10 px-1.5 py-0.5 text-[10px] text-white"
    >
      <FileIcon />
      <span className="max-w-[110px] truncate">{a.name}</span>
    </a>
  );
}

/** Removable chip shown in the composer for a staged (not-yet-sent) file. */
function MiniFileChip({
  file,
  onRemove,
}: {
  file: Attachment;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded border-2 border-border bg-surface-2/70 px-1.5 py-0.5 font-mono text-[10px] text-ink">
      {file.mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt={file.name} className="h-5 w-5 rounded object-cover" />
      ) : (
        <FileIcon />
      )}
      <span className="max-w-[110px] truncate">{file.name}</span>
      <span className="text-ink-dim/70">{prettyBytes(file.size)}</span>
      <button
        onClick={onRemove}
        className="text-ink-dim hover:text-rose-400"
        title="ลบไฟล์นี้"
      >
        ✕
      </button>
    </div>
  );
}
