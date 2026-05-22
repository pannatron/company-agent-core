"use client";

import { memo, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EmployeeMeta } from "@/lib/employees";
import { summarizeAutoSync, useAutoSync } from "@/lib/useAutoSync";
import Avatar from "./Avatar";
import MentionTextarea from "./MentionTextarea";

interface Attachment {
  path: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
}

type AssistantBlock =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      summary: string;
      input: unknown;
      status: "running" | "ok" | "error";
      preview?: string;
    };

interface UserMessage {
  role: "user";
  content: string;
  attachments?: Attachment[];
}

interface GeneratedFile {
  path: string;
  name: string;
  mimeType: string;
  size: number;
}

interface AssistantMessage {
  role: "assistant";
  blocks: AssistantBlock[];
  status: "streaming" | "done" | "error";
  durationMs?: number;
  generatedFiles?: GeneratedFile[];
}

type Message = UserMessage | AssistantMessage;

interface OutputFile {
  path: string;
  name: string;
  size: number;
  mtime: number;
  mimeType: string;
}

interface Props {
  employee: EmployeeMeta;
}

export default function ChatPane({ employee }: Props) {
  const chatId = `direct-${employee.slug}`;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionStart, setSessionStart] = useState<number>(Date.now());
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  // Pagination — two layers:
  //  1. DOM cap: render only the last `displayCount` messages so the bubble
  //     list stays small regardless of state size.
  //  2. Server pagination: on mount we only fetch the last 60 messages;
  //     `hasMore` + `oldestTimestamp` let us page back into the gzipped
  //     archive when the user scrolls up past what we've loaded.
  const [displayCount, setDisplayCount] = useState(30);
  const [hasMore, setHasMore] = useState(false);
  const [oldestTimestamp, setOldestTimestamp] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const autoSync = useAutoSync();
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset + hydrate from persisted store when employee changes
  useEffect(() => {
    setError(null);
    setInput("");
    setPendingFiles([]);
    setSessionStart(Date.now());
    setOutputs([]);
    setMessages([]);
    setDisplayCount(30);
    setHasMore(false);
    setOldestTimestamp(null);

    let alive = true;
    fetch(`/api/chats/${chatId}?limit=60`)
      .then((r) => r.json())
      .then((rec: PaginatedChat | null) => {
        if (!alive || !rec?.messages) return;
        setMessages(rec.messages.map(hydratePersistedMsg));
        setHasMore(Boolean(rec.has_more));
        if (rec.messages.length > 0) {
          setOldestTimestamp(rec.messages[0].timestamp ?? null);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [employee.slug, chatId]);

  async function loadOlder() {
    // First exhaust messages we already have in state.
    if (displayCount < messages.length) {
      setDisplayCount((c) => Math.min(c + 20, messages.length));
      return;
    }
    if (loadingOlder || !hasMore || !oldestTimestamp) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/chats/${chatId}?limit=60&before=${encodeURIComponent(oldestTimestamp)}`,
      );
      const data = (await res.json()) as PaginatedChat;
      const older = (data.messages ?? []).map(hydratePersistedMsg);
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      setMessages((curr) => [...older, ...curr]);
      setHasMore(Boolean(data.has_more));
      const newOldest = data.messages?.[0]?.timestamp;
      if (newOldest) setOldestTimestamp(newOldest);
      setDisplayCount((c) => c + older.length);
    } catch {
      /* swallow; user can retry */
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming, outputs]);

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `อัปโหลดล้มเหลว ${res.status}`);
        uploaded.push(data as Attachment);
      }
      setPendingFiles((cur) => [...cur, ...uploaded]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removePending(path: string) {
    setPendingFiles((cur) => cur.filter((f) => f.path !== path));
  }

  async function refreshOutputs() {
    try {
      const res = await fetch(`/api/outputs/list?since=${sessionStart}`);
      const data = (await res.json()) as { files: OutputFile[] };
      setOutputs(data.files || []);
    } catch {
      /* ignore */
    }
  }

  function updateLastAssistant(
    updater: (m: AssistantMessage) => AssistantMessage,
  ) {
    setMessages((curr) => {
      const copy = [...curr];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy[i] = updater(copy[i] as AssistantMessage);
          return copy;
        }
      }
      return copy;
    });
  }

  function handleEvent(evt: Record<string, unknown>) {
    const t = evt.type as string;
    if (t === "text") {
      const text = String(evt.text ?? "");
      updateLastAssistant((m) => ({
        ...m,
        blocks: appendText(m.blocks, text),
      }));
    } else if (t === "thinking") {
      const text = String(evt.text ?? "");
      updateLastAssistant((m) => ({
        ...m,
        blocks: appendThinking(m.blocks, text),
      }));
    } else if (t === "tool_use") {
      const block: AssistantBlock = {
        kind: "tool",
        id: String(evt.id ?? ""),
        name: String(evt.name ?? "tool"),
        summary: String(evt.summary ?? ""),
        input: evt.input,
        status: "running",
      };
      updateLastAssistant((m) => ({ ...m, blocks: [...m.blocks, block] }));
    } else if (t === "tool_result") {
      const id = String(evt.id ?? "");
      const ok = Boolean(evt.ok);
      const preview = String(evt.preview ?? "");
      updateLastAssistant((m) => ({
        ...m,
        blocks: m.blocks.map((b) =>
          b.kind === "tool" && b.id === id
            ? { ...b, status: ok ? "ok" : "error", preview }
            : b,
        ),
      }));
    } else if (t === "done") {
      updateLastAssistant((m) => ({
        ...m,
        status: evt.error ? "error" : "done",
        durationMs: typeof evt.duration_ms === "number" ? evt.duration_ms : undefined,
      }));
    } else if (t === "error") {
      const msg = String(evt.message ?? "unknown error");
      setError(msg);
      updateLastAssistant((m) => ({ ...m, status: "error" }));
    }
  }

  async function send() {
    const text = input.trim();
    if ((!text && pendingFiles.length === 0) || streaming) return;

    setError(null);
    const attached = pendingFiles;
    const userMsg: UserMessage = {
      role: "user",
      content: text || "(แนบไฟล์มา — ช่วยดูให้ที)",
      attachments: attached,
    };
    const assistantMsg: AssistantMessage = {
      role: "assistant",
      blocks: [],
      status: "streaming",
    };

    const next = [...messages, userMsg, assistantMsg];
    setMessages(next);
    setInput("");
    setPendingFiles([]);
    setStreaming(true);

    const turnStartAt = Date.now();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employee: employee.slug,
          chatId,
          messages: next
            .filter((m): m is UserMessage | AssistantMessage => true)
            .slice(0, -1) // drop empty assistant placeholder
            .map((m) =>
              m.role === "user"
                ? { role: "user" as const, content: m.content }
                : {
                    role: "assistant" as const,
                    content: blocksToText(m.blocks),
                  },
            ),
          attachments: attached.map((a) => ({
            path: a.path,
            name: a.name,
            mimeType: a.mimeType,
          })),
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            handleEvent(JSON.parse(line));
          } catch {
            // ignore malformed line
          }
        }
      }
      if (buffer.trim()) {
        try {
          handleEvent(JSON.parse(buffer));
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message);
        updateLastAssistant((m) => ({ ...m, status: "error" }));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      refreshOutputs();
      // Attach images created during this turn as inline previews on the last assistant message
      try {
        const res = await fetch(
          `/api/outputs/list?since=${turnStartAt}&includeUploads=0`,
        );
        if (res.ok) {
          const data = (await res.json()) as { files: GeneratedFile[] };
          const images = data.files.filter((f) => f.mimeType.startsWith("image/"));
          if (images.length > 0) {
            updateLastAssistant((m) => ({ ...m, generatedFiles: images }));
          }
        }
      } catch {
        /* ignore — preview is best-effort */
      }
      if (autoSync.enabled) {
        const r = await autoSync.runSync();
        if (r) setToast(summarizeAutoSync(r));
      }
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function saveTranscript() {
    if (messages.length === 0) {
      setToast("ยังไม่มีบทสนทนาให้บันทึก");
      return;
    }
    try {
      const res = await fetch(`/api/chats/${chatId}/dump`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setToast(data.error || "บันทึกไม่สำเร็จ");
        return;
      }
      setToast(`✓ บันทึก ${data.path}  —  Sync now ที่ Files tab เพื่ออัปขึ้น Drive`);
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  async function clearChat() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      setTimeout(() => setConfirmingClear(false), 3500);
      return;
    }
    setConfirmingClear(false);
    try {
      await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
      setMessages([]);
      setError(null);
      setToast("✓ ล้างแชทเรียบร้อย");
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface/60 px-5 py-3 backdrop-blur-sm">
        <Avatar employee={employee} size={40} ring />
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-ink">{employee.name}</h1>
          <p className="text-xs text-ink-dim">
            {employee.title} · {employee.department} · {messages.length} ข้อความ
          </p>
        </div>
        {outputs.length > 0 && (
          <span className="pill pill-ok">
            <span className="status-dot ok" />
            {outputs.length} ไฟล์ที่สร้าง
          </span>
        )}
        <label
          className="flex cursor-pointer select-none items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink"
          title="หลังเอเจ้นต์ตอบเสร็จ จะอัป outputs/ ขึ้น Drive + push CSV ขึ้น Sheets อัตโนมัติ"
        >
          <input
            type="checkbox"
            checked={autoSync.enabled}
            onChange={autoSync.toggle}
            className="h-3 w-3 accent-indigo-500"
          />
          <span>{autoSync.syncing ? "🔄 sync…" : "🔄 auto-sync"}</span>
        </label>
        <button
          onClick={saveTranscript}
          disabled={messages.length === 0 || streaming}
          title="บันทึกบทสนทนาเป็น markdown ลง outputs/chats/"
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-30"
        >
          💾 บันทึก
        </button>
        <button
          onClick={clearChat}
          disabled={messages.length === 0 || streaming}
          className={[
            "rounded-md border px-2.5 py-1 text-[11px] disabled:opacity-30",
            confirmingClear
              ? "border-danger bg-danger/10 text-danger"
              : "border-border bg-surface text-ink-dim hover:border-danger hover:text-danger",
          ].join(" ")}
        >
          {confirmingClear ? "ยืนยัน?" : "🗑"}
        </button>
      </header>

      {toast && (
        <div className="border-b border-ok/30 bg-ok/5 px-5 py-2 text-[11.5px] text-ok">
          {toast}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {messages.length === 0 && !streaming && (
          <EmptyState employee={employee} onPick={(q) => setInput(q)} />
        )}

        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {(messages.length > displayCount || hasMore) && (
            <button
              onClick={loadOlder}
              disabled={loadingOlder}
              className="self-center rounded-full border border-border bg-surface px-4 py-1.5 text-[11px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
            >
              {loadingOlder
                ? "กำลังโหลด…"
                : messages.length > displayCount
                  ? `↑ โหลดข้อความเก่ากว่า (${messages.length - displayCount} ในหน่วยความจำ)`
                  : "↑ โหลดข้อความเก่ากว่าจาก archive"}
            </button>
          )}
          {messages.slice(-displayCount).map((m, i) => {
            // i is offset within the displayed window; compute original index
            // so the "last message" check still works during streaming.
            const origIdx = messages.length - displayCount + i;
            const safeIdx = Math.max(origIdx, i);
            return m.role === "user" ? (
              <UserBubble key={safeIdx} message={m} />
            ) : (
              <AssistantBubble
                key={safeIdx}
                message={m}
                employee={employee}
                streaming={streaming && safeIdx === messages.length - 1}
              />
            );
          })}
          {outputs.length > 0 && <OutputsPanel outputs={outputs} />}
          {error && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-border bg-surface/60 p-3 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl">
          {pendingFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pendingFiles.map((f) => (
                <FileChip
                  key={f.path}
                  file={f}
                  onRemove={() => removePending(f.path)}
                />
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
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
              title="แนบไฟล์ (รูป, PDF, CSV, ข้อความ)"
              className="flex h-[52px] items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-sm text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
            >
              {uploading ? (
                <span className="text-xs">กำลังอัปฯ…</span>
              ) : (
                <>
                  <PaperclipIcon />
                  <span className="hidden text-xs sm:inline">แนบ</span>
                </>
              )}
            </button>
            <MentionTextarea
              value={input}
              onChange={setInput}
              onSubmit={send}
              placeholder={`พิมพ์ถาม ${employee.name}… (Enter ส่ง, @ เพื่อเรียกคน)`}
              rows={2}
              className="input min-h-[52px] flex-1 w-full"
              disabled={streaming}
            />
            {streaming ? (
              <button onClick={stop} className="btn-primary !bg-danger hover:!bg-danger/80">
                หยุด
              </button>
            ) : (
              <button
                onClick={send}
                className="btn-primary"
                disabled={!input.trim() && pendingFiles.length === 0}
              >
                ส่ง
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Bubbles ---------- */

const UserBubble = memo(function UserBubble({ message }: { message: UserMessage }) {
  return (
    <div className="flex justify-end gap-3">
      <div className="max-w-[85%] rounded-2xl bg-accent-soft px-4 py-2.5 text-sm leading-relaxed text-white">
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {message.attachments.map((a) => (
              <AttachmentPreview key={a.path} a={a} dark />
            ))}
          </div>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
});

function GeneratedFilesPreview({ files }: { files: GeneratedFile[] }) {
  const fileUrl = (p: string) =>
    `/api/outputs/file/${p
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`;
  return (
    <div className="mt-3 space-y-1.5 border-t border-border/60 pt-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-dim/70">
        📁 สร้างไฟล์ {files.length} ตัว
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {files.map((f) => (
          <a
            key={f.path}
            href={fileUrl(f.path)}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col overflow-hidden rounded-lg border border-border/60 bg-surface-2/40 hover:border-accent"
            title={`${f.name} · ${Math.round(f.size / 1024)} KB`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileUrl(f.path)}
              alt={f.name}
              className="aspect-square w-full object-cover transition-opacity group-hover:opacity-80"
              loading="lazy"
            />
            <p className="truncate px-1.5 py-1 text-[10px] text-ink-dim group-hover:text-ink">
              {f.name}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}

const AssistantBubble = memo(function AssistantBubble({
  message,
  employee,
  streaming,
}: {
  message: AssistantMessage;
  employee: EmployeeMeta;
  streaming: boolean;
}) {
  const showThinking =
    streaming &&
    (message.blocks.length === 0 ||
      message.blocks[message.blocks.length - 1].kind !== "text");

  return (
    <div className="flex justify-start gap-3">
      <Avatar employee={employee} size={32} className="mt-1" />
      <div className="max-w-[85%] min-w-[200px] rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm leading-relaxed text-ink">
        {message.blocks.length === 0 && !streaming && (
          <p className="text-ink-dim italic">(ไม่มีคำตอบ)</p>
        )}

        <div className="space-y-2">
          {message.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>

        {showThinking && <ThinkingIndicator />}

        {message.generatedFiles && message.generatedFiles.length > 0 && (
          <GeneratedFilesPreview files={message.generatedFiles} />
        )}

        {message.blocks.length > 0 && (
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-1.5 text-[10px] text-ink-dim/60">
            <span>
              {message.status === "done" && message.durationMs != null && (
                <>✓ เสร็จใน {(message.durationMs / 1000).toFixed(1)}s</>
              )}
              {message.status === "error" && (
                <span className="text-danger">✗ จบด้วย error</span>
              )}
            </span>
            <CopyButton
              text={messageTextOnly(message.blocks)}
              label="ก๊อปคำตอบ"
            />
          </div>
        )}
      </div>
    </div>
  );
});

function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard might be blocked — silent */
        }
      }}
      title={done ? "ก๊อปแล้ว" : "ก๊อปข้อความ"}
      className={`inline-flex items-center gap-1 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-ink-dim hover:border-accent hover:text-ink ${className}`}
    >
      {done ? "✓ ก๊อปแล้ว" : `📋 ${label}`}
    </button>
  );
}

/** Concatenate all text-block content in a message (skip tool/thinking blocks). */
function messageTextOnly(blocks: AssistantBlock[]): string {
  return blocks
    .filter((b): b is Extract<AssistantBlock, { kind: "text" }> => b.kind === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();
}

function BlockView({ block }: { block: AssistantBlock }) {
  if (block.kind === "text") {
    return (
      <div className="markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Custom code renderer — adds a copy button to block-level code.
            // Inline code (`like this`) renders as default <code> element.
            pre: ({ children }) => {
              // children is normally a single <code> element; extract its text
              const codeText = extractCodeText(children);
              return (
                <div className="group relative my-2">
                  <pre className="overflow-auto rounded-lg bg-bg/60 p-3 font-mono text-[11.5px] text-ink">
                    {children}
                  </pre>
                  {codeText && (
                    <CopyButton
                      text={codeText}
                      className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  )}
                </div>
              );
            },
          }}
        >
          {block.text}
        </ReactMarkdown>
      </div>
    );
  }
  if (block.kind === "thinking") {
    return <ThinkingBlock text={block.text} />;
  }
  return <ToolBlock block={block} />;
}

/** Pull plain text out of a ReactMarkdown <pre>'s children (which is a <code> element). */
function extractCodeText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(extractCodeText).join("");
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: React.ReactNode } }).props;
    return extractCodeText(props?.children);
  }
  return "";
}

function ToolBlock({
  block,
}: {
  block: Extract<AssistantBlock, { kind: "tool" }>;
}) {
  const tone =
    block.status === "running"
      ? "border-accent/40 bg-accent-soft/10 text-accent"
      : block.status === "error"
        ? "border-danger/40 bg-danger/10 text-danger"
        : "border-ok/30 bg-ok/5 text-ok";
  const icon = TOOL_ICONS[block.name] || "🔧";
  const label = TOOL_LABELS[block.name] || block.name;

  return (
    <div className={`rounded-lg border ${tone} px-2.5 py-1.5 text-xs`}>
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span className="font-semibold">{label}</span>
        {block.summary && (
          <code className="truncate font-mono text-[11px] opacity-80">
            {block.summary}
          </code>
        )}
        <span className="ml-auto flex items-center gap-1 text-[10px] opacity-80">
          {block.status === "running" && (
            <>
              <Spinner />
              <span>กำลังทำงาน…</span>
            </>
          )}
          {block.status === "ok" && <span>เสร็จ ✓</span>}
          {block.status === "error" && <span>ผิดพลาด ✗</span>}
        </span>
      </div>
      {block.preview && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[10px] opacity-70 hover:opacity-100">
            ดูผลที่ได้ (preview)
          </summary>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-bg/40 p-2 font-mono text-[10px] text-ink-dim">
            {block.preview}
          </pre>
        </details>
      )}
    </div>
  );
}

function ThinkingBlock({ text }: { text: string }) {
  return (
    <details className="rounded-lg border border-accent/20 bg-accent-soft/5 px-2.5 py-1.5 text-xs text-ink-dim">
      <summary className="cursor-pointer">
        <span className="font-medium text-accent">🧠 ความคิดภายใน</span>
      </summary>
      <p className="mt-1.5 whitespace-pre-wrap text-[11px] italic leading-relaxed">
        {text}
      </p>
    </details>
  );
}

function ThinkingIndicator() {
  return (
    <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-surface-2/60 px-2 py-1 text-[11px] text-ink-dim">
      <Spinner />
      <span>กำลังคิด…</span>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
  );
}

/* ---------- Attachments / Files ---------- */

function AttachmentPreview({ a, dark }: { a: Attachment; dark: boolean }) {
  const isImage = a.mimeType.startsWith("image/");
  if (isImage) {
    return (
      <a
        href={a.url}
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-lg border border-white/20"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={a.url} alt={a.name} className="h-24 w-24 object-cover" />
      </a>
    );
  }
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noreferrer"
      className={[
        "inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-xs",
        dark
          ? "border-white/20 bg-white/10 text-white hover:bg-white/20"
          : "border-border bg-surface-2 text-ink-dim hover:text-ink",
      ].join(" ")}
    >
      <FileIcon />
      <span className="max-w-[160px] truncate">{a.name}</span>
    </a>
  );
}

function FileChip({ file, onRemove }: { file: Attachment; onRemove: () => void }) {
  const isImage = file.mimeType.startsWith("image/");
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/70 px-2 py-1 text-xs text-ink">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt={file.name} className="h-6 w-6 rounded object-cover" />
      ) : (
        <FileIcon />
      )}
      <span className="max-w-[160px] truncate">{file.name}</span>
      <span className="text-ink-dim/70">{prettyBytes(file.size)}</span>
      <button
        onClick={onRemove}
        className="text-ink-dim hover:text-danger"
        title="ลบไฟล์นี้"
      >
        ✕
      </button>
    </div>
  );
}

const OutputsPanel = memo(function OutputsPanel({ outputs }: { outputs: OutputFile[] }) {
  return (
    <div className="rounded-xl border border-ok/30 bg-ok/5 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ok">
        📁 ไฟล์ที่พนักงานสร้างใน session นี้ ({outputs.length})
      </p>
      <ul className="space-y-1.5">
        {outputs.map((f) => (
          <li
            key={f.path}
            className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5 text-xs"
          >
            <FileIcon />
            <span className="flex-1 truncate font-mono text-ink">{f.path}</span>
            <span className="text-ink-dim/70">{prettyBytes(f.size)}</span>
            <a
              href={`/api/outputs/file/${f.path.split("/").map(encodeURIComponent).join("/")}`}
              download={f.name}
              className="rounded-md bg-accent-soft px-2 py-0.5 text-white hover:bg-accent"
            >
              ดาวน์โหลด
            </a>
            <a
              href={`/api/outputs/file/${f.path.split("/").map(encodeURIComponent).join("/")}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border px-2 py-0.5 text-ink-dim hover:text-ink"
            >
              เปิด
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});

/* ---------- Helpers ---------- */

function appendText(blocks: AssistantBlock[], text: string): AssistantBlock[] {
  const last = blocks[blocks.length - 1];
  if (last && last.kind === "text") {
    return [
      ...blocks.slice(0, -1),
      { kind: "text", text: last.text + text },
    ];
  }
  return [...blocks, { kind: "text", text }];
}

function appendThinking(
  blocks: AssistantBlock[],
  text: string,
): AssistantBlock[] {
  const last = blocks[blocks.length - 1];
  if (last && last.kind === "thinking") {
    return [
      ...blocks.slice(0, -1),
      { kind: "thinking", text: last.text + text },
    ];
  }
  return [...blocks, { kind: "thinking", text }];
}

function blocksToText(blocks: AssistantBlock[]): string {
  return blocks
    .filter((b): b is Extract<AssistantBlock, { kind: "text" }> => b.kind === "text")
    .map((b) => b.text)
    .join("\n");
}

interface PersistedChatMsg {
  role: "user" | "assistant";
  content?: string;
  attachments?: Attachment[];
  blocks?: AssistantBlock[];
  status?: "done" | "error";
  durationMs?: number;
  /** ISO timestamp — used by server pagination's `before=` cursor. */
  timestamp?: string;
}

interface PaginatedChat {
  messages?: PersistedChatMsg[];
  has_more?: boolean;
  message_count?: number;
}

function hydratePersistedMsg(m: PersistedChatMsg): Message {
  if (m.role === "user") {
    return {
      role: "user",
      content: m.content || "",
      attachments: m.attachments,
    };
  }
  return {
    role: "assistant",
    blocks: m.blocks ?? [],
    status: m.status === "error" ? "error" : "done",
    durationMs: m.durationMs,
  };
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const TOOL_LABELS: Record<string, string> = {
  Read: "อ่านไฟล์",
  Write: "เขียนไฟล์",
  Edit: "แก้ไขไฟล์",
  Grep: "ค้นหาในไฟล์",
  Glob: "ค้นชื่อไฟล์",
  Bash: "รันคำสั่ง",
  WebSearch: "ค้นเว็บ",
};

const TOOL_ICONS: Record<string, string> = {
  Read: "📖",
  Write: "✍️",
  Edit: "📝",
  Grep: "🔍",
  Glob: "🗂️",
  Bash: "⚙️",
  WebSearch: "🌐",
};

function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.58 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function EmptyState({
  employee,
  onPick,
}: {
  employee: EmployeeMeta;
  onPick: (q: string) => void;
}) {
  const suggestions = SUGGESTIONS[employee.slug] || SUGGESTIONS.default;
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 pt-10 text-center">
      <Avatar employee={employee} size={64} ring />
      <div>
        <h2 className="text-lg font-semibold text-ink">
          คุยกับ {employee.name}
        </h2>
        <p className="mt-1 text-sm text-ink-dim">{employee.blurb}</p>
        <p className="mt-2 text-xs text-ink-dim/70">
          💡 แนบสลิป/บิล/ไฟล์ Excel ได้ที่ปุ่ม 📎 — AI จะอ่านและสร้างไฟล์กลับให้ดาวน์โหลด
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-ink-dim transition hover:border-accent hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

const SUGGESTIONS: Record<string, string[]> = {
  ceo: [
    "สรุปสุขภาพบริษัทตอนนี้",
    "เดือนหน้าควรโฟกัสอะไรเป็นพิเศษ",
    "วาง strategy memo จากข้อมูล setup",
  ],
  "sales-rep": [
    "พยากรณ์ยอดเดือนนี้ให้หน่อย",
    "ออกใบเสนอราคาให้ลูกค้า X 250,000 บาท",
    "ดีลไหนเสี่ยงสุด",
  ],
  "marketing-lead": [
    "วาง content 1 สัปดาห์",
    "เขียนโพสต์เปิดตัวสินค้าใหม่",
    "ทำแคมเปญ launch",
  ],
  "hr-manager": [
    "เขียน JD ตำแหน่ง Senior Engineer",
    "ใครใกล้ครบโปรเดือนนี้",
    "ออกแบบ onboarding 30/60/90",
  ],
  "finance-analyst": [
    "ดูสลิปนี้แล้วบันทึกเป็นบัญชี",
    "ออก invoice ลูกค้า X 50,000 บาท",
    "Cash runway ตอนนี้กี่เดือน",
  ],
  "ops-manager": [
    "ออกแบบ SOP รับลูกค้าใหม่",
    "ทุกเช้าให้สรุป pipeline+KPI+ticket",
    "ทำ checklist ปิดงวด",
  ],
  "kpi-analyst": [
    "อัปเดต KPI ทุกแผนกตอนนี้",
    "ตัวไหน off-track และทำไม",
    "ทำรายงาน KPI วันนี้",
  ],
  "customer-support": [
    "ดูสลิป complaint นี้แล้วร่างคำตอบ",
    "Ticket ไหนเกิน SLA แล้ว",
    "เพิ่ม KB จากปัญหาที่เจอบ่อย",
  ],
  default: ["ช่วยอะไรได้บ้าง", "สรุปสิ่งที่ดูแลอยู่"],
};
