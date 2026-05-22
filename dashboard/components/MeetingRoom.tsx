"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ACCENT_BG_SOFT,
  ACCENT_BORDER,
  EMPLOYEES,
  EmployeeMeta,
  EmployeeSlug,
} from "@/lib/employees";
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

interface Respondent {
  slug: EmployeeSlug;
  name: string;
  title: string;
  department: string;
  accent: EmployeeMeta["accent"];
  avatarUrl: string;
  reason: string;
}

type Block =
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

/** A file the agent created during the turn — surfaced as an inline preview. */
interface GeneratedFile {
  path: string;
  name: string;
  mimeType: string;
  size: number;
}

type Msg =
  | {
      role: "user";
      content: string;
      attachments?: Attachment[];
      seedPrompt?: string;
    }
  | {
      role: "assistant";
      respondent: Respondent | null;
      blocks: Block[];
      status: "streaming" | "done" | "error";
      durationMs?: number;
      generatedFiles?: GeneratedFile[];
    };

interface Props {
  /** Optional seed prompt: when changed, autofill input */
  seed: string | null;
  /** Notify parent each time a respondent starts speaking (for sidebar spotlight) */
  onRespondent: (slug: EmployeeSlug | null) => void;
  /** Notify parent when agent likely changed tasks.json (so kanban re-fetches) */
  onAgentTurn: () => void;
}

const CHAT_ID = "meeting-room";

export default function MeetingRoom({ seed, onRespondent, onAgentTurn }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoSync = useAutoSync();

  // Load any persisted conversation on mount (and after employee/tab switches)
  useEffect(() => {
    let alive = true;
    fetch(`/api/chats/${CHAT_ID}`)
      .then((r) => r.json())
      .then((rec: { messages?: PersistedMsg[] } | null) => {
        if (!alive || !rec?.messages) return;
        setMessages(rec.messages.map(hydrateMsg));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Apply seeded prompt from outside
  useEffect(() => {
    if (seed && !streaming) {
      setInput(seed);
    }
  }, [seed, streaming]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function uploadFiles(fl: FileList | null) {
    if (!fl?.length) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded: Attachment[] = [];
      for (const file of Array.from(fl)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `อัปโหลดล้มเหลว ${res.status}`);
        uploaded.push(data as Attachment);
      }
      setPendingFiles((c) => [...c, ...uploaded]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removePending(p: string) {
    setPendingFiles((c) => c.filter((f) => f.path !== p));
  }

  function updateLast(updater: (m: Extract<Msg, { role: "assistant" }>) => Extract<Msg, { role: "assistant" }>) {
    setMessages((curr) => {
      const copy = [...curr];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy[i] = updater(copy[i] as Extract<Msg, { role: "assistant" }>);
          return copy;
        }
      }
      return copy;
    });
  }

  function handleEvent(evt: Record<string, unknown>) {
    const t = evt.type as string;
    if (t === "respondent") {
      const r: Respondent = {
        slug: String(evt.slug ?? "ceo") as EmployeeSlug,
        name: String(evt.name ?? ""),
        title: String(evt.title ?? ""),
        department: String(evt.department ?? ""),
        accent: String(evt.accent ?? "indigo") as EmployeeMeta["accent"],
        avatarUrl: String(evt.avatarUrl ?? ""),
        reason: String(evt.reason ?? ""),
      };
      onRespondent(r.slug);
      updateLast((m) => ({ ...m, respondent: r }));
    } else if (t === "text") {
      updateLast((m) => ({ ...m, blocks: appendText(m.blocks, String(evt.text ?? "")) }));
    } else if (t === "thinking") {
      updateLast((m) => ({ ...m, blocks: appendThinking(m.blocks, String(evt.text ?? "")) }));
    } else if (t === "tool_use") {
      const block: Block = {
        kind: "tool",
        id: String(evt.id ?? ""),
        name: String(evt.name ?? "tool"),
        summary: String(evt.summary ?? ""),
        status: "running",
      };
      updateLast((m) => ({ ...m, blocks: [...m.blocks, block] }));
    } else if (t === "tool_result") {
      const id = String(evt.id ?? "");
      const ok = Boolean(evt.ok);
      const preview = String(evt.preview ?? "");
      updateLast((m) => ({
        ...m,
        blocks: m.blocks.map((b) =>
          b.kind === "tool" && b.id === id
            ? { ...b, status: ok ? "ok" : "error", preview }
            : b,
        ),
      }));
    } else if (t === "done") {
      updateLast((m) => ({
        ...m,
        status: evt.error ? "error" : "done",
        durationMs: typeof evt.duration_ms === "number" ? evt.duration_ms : undefined,
      }));
    } else if (t === "error") {
      setError(String(evt.message ?? "unknown error"));
      updateLast((m) => ({ ...m, status: "error" }));
    }
  }

  async function send() {
    const text = input.trim();
    if ((!text && pendingFiles.length === 0) || streaming) return;

    setError(null);
    const attached = pendingFiles;
    const next: Msg[] = [
      ...messages,
      {
        role: "user",
        content: text || "(แนบไฟล์มา — ช่วยดูให้ที)",
        attachments: attached,
      },
      {
        role: "assistant",
        respondent: null,
        blocks: [],
        status: "streaming",
      },
    ];
    setMessages(next);
    setInput("");
    setPendingFiles([]);
    setStreaming(true);

    const turnStartAt = Date.now();
    const ac = new AbortController();
    abortRef.current = ac;

    // Last assistant who actually replied — used by chat route for sticky
    // routing so the speaker doesn't ping-pong on every message
    const lastAssistant = [...messages]
      .reverse()
      .find((m): m is Extract<Msg, { role: "assistant" }> => m.role === "assistant");
    const lastRespondent = lastAssistant?.respondent?.slug;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employee: "auto",
          last_respondent: lastRespondent,
          messages: next
            .slice(0, -1)
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
            /* ignore */
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
        updateLast((m) => ({ ...m, status: "error" }));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      onRespondent(null);
      onAgentTurn();
      // Find images the agent created during this turn and attach as inline previews
      try {
        const res = await fetch(
          `/api/outputs/list?since=${turnStartAt}&includeUploads=0`,
        );
        if (res.ok) {
          const data = (await res.json()) as { files: GeneratedFile[] };
          const images = data.files.filter((f) => f.mimeType.startsWith("image/"));
          if (images.length > 0) {
            updateLast((m) => ({ ...m, generatedFiles: images }));
          }
        }
      } catch {
        /* ignore — preview is best-effort */
      }
      // Auto-sync to Drive + Sheets if user has the toggle on
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
      const res = await fetch(`/api/chats/${CHAT_ID}/dump`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setToast(data.error || `บันทึกไม่สำเร็จ`);
        return;
      }
      setToast(`✓ บันทึก ${data.path}  —  Sync now ที่แท็บ Files เพื่ออัปขึ้น Drive`);
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
      await fetch(`/api/chats/${CHAT_ID}`, { method: "DELETE" });
      setMessages([]);
      setError(null);
      onRespondent(null);
      setToast("✓ ล้างแชทเรียบร้อย  —  ไฟล์ที่บันทึกไว้ใน outputs/chats/ ยังอยู่");
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface/40 px-5 py-2">
        <div className="flex items-center gap-2 text-[11px] text-ink-dim">
          <span className="status-dot ok" />
          <span>บันทึกอัตโนมัติ · {messages.length} ข้อความ</span>
        </div>
        <div className="flex items-center gap-1.5">
          <label
            className="flex cursor-pointer select-none items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink"
            title="หลังจากเอเจ้นต์ตอบเสร็จ จะอัปไฟล์ใน outputs/ ขึ้น Drive และ push CSV ขึ้น Sheets อัตโนมัติ"
          >
            <input
              type="checkbox"
              checked={autoSync.enabled}
              onChange={autoSync.toggle}
              className="h-3 w-3 accent-indigo-500"
            />
            <span>
              {autoSync.syncing ? "🔄 sync…" : "🔄 auto-sync"}
            </span>
          </label>
          <button
            onClick={saveTranscript}
            disabled={messages.length === 0 || streaming}
            title="บันทึกบทสนทนาเป็น markdown ลง outputs/chats/ → ดูได้ใน Files tab (sync Drive ได้)"
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-30"
          >
            💾 บันทึก
          </button>
          <button
            onClick={clearChat}
            disabled={messages.length === 0 || streaming}
            title="ลบบทสนทนาทั้งหมด (ไฟล์ที่บันทึกไว้ใน outputs/chats/ ไม่ถูกลบ)"
            className={[
              "rounded-md border px-2.5 py-1 text-[11px] disabled:opacity-30",
              confirmingClear
                ? "border-danger bg-danger/10 text-danger"
                : "border-border bg-surface text-ink-dim hover:border-danger hover:text-danger",
            ].join(" ")}
          >
            {confirmingClear ? "ยืนยันลบ?" : "🗑 ล้างแชท"}
          </button>
        </div>
      </div>

      {toast && (
        <div className="border-b border-ok/30 bg-ok/5 px-5 py-2 text-[11.5px] text-ok">
          {toast}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {messages.length === 0 && !streaming && (
          <EmptyMeetingRoom onPick={(q) => setInput(q)} />
        )}
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <UserBubble key={i} message={m} />
            ) : (
              <AssistantBubble
                key={i}
                message={m}
                streaming={streaming && i === messages.length - 1}
              />
            ),
          )}
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
              title="แนบไฟล์"
              className="flex h-[52px] items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-sm text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
            >
              {uploading ? <span className="text-xs">อัปฯ…</span> : <PaperclipIcon />}
            </button>
            <MentionTextarea
              value={input}
              onChange={setInput}
              onSubmit={send}
              placeholder="ถามอะไรก็ได้… ระบบจะเรียกพนักงานที่ตรงเรื่องมาตอบ (พิมพ์ @ เพื่อเลือกคน)"
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

function UserBubble({ message }: { message: Extract<Msg, { role: "user" }> }) {
  return (
    <div className="flex justify-end gap-3">
      <div className="max-w-[85%] rounded-2xl bg-accent-soft px-4 py-2.5 text-sm leading-relaxed text-white">
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {message.attachments.map((a) => (
              <AttachPreview key={a.path} a={a} dark />
            ))}
          </div>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

function AssistantBubble({
  message,
  streaming,
}: {
  message: Extract<Msg, { role: "assistant" }>;
  streaming: boolean;
}) {
  const r = message.respondent;
  const accent = r?.accent ?? "indigo";
  const borderClass = ACCENT_BORDER[accent];
  const chipClass = ACCENT_BG_SOFT[accent];

  return (
    <div className="flex justify-start gap-3">
      <div className="shrink-0 pt-2">
        {r ? (
          <Avatar employee={{ name: r.name, avatarSeed: r.name, accent }} size={36} ring />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-xs text-ink-dim">…</div>
        )}
      </div>
      <div className={`max-w-[85%] min-w-[220px] rounded-2xl border ${borderClass} bg-surface px-4 py-2.5 text-sm leading-relaxed text-ink`}>
        {r && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-1.5 text-[11px]">
            <span className="font-semibold text-ink">{r.name}</span>
            <span className="text-ink-dim">·</span>
            <span className="text-ink-dim">{r.title}</span>
            <span className={`pill ml-auto ${chipClass.replace("bg-", "bg-")}`}>
              ↳ {r.reason}
            </span>
          </div>
        )}
        {!r && streaming && (
          <p className="flex items-center gap-2 text-xs text-ink-dim italic">
            <Spinner /> กำลังหาคนที่ตรงเรื่องที่สุด…
          </p>
        )}

        {message.blocks.length === 0 && r && !streaming && (
          <p className="text-ink-dim italic">(ไม่มีคำตอบ)</p>
        )}

        <div className="space-y-2">
          {message.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>

        {streaming &&
          r &&
          (message.blocks.length === 0 ||
            message.blocks[message.blocks.length - 1].kind !== "text") && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-surface-2/60 px-2 py-1 text-[11px] text-ink-dim">
              <Spinner />
              <span>กำลังคิด…</span>
            </div>
          )}

        {message.generatedFiles && message.generatedFiles.length > 0 && (
          <GeneratedFilesPreview files={message.generatedFiles} />
        )}

        {message.status === "done" && message.durationMs != null && (
          <div className="mt-2 border-t border-border/60 pt-1.5 text-[10px] text-ink-dim/60">
            ✓ เสร็จใน {(message.durationMs / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    </div>
  );
}

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

function BlockView({ block }: { block: Block }) {
  if (block.kind === "text") {
    return (
      <div className="markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
      </div>
    );
  }
  if (block.kind === "thinking") {
    return (
      <details className="rounded-lg border border-accent/20 bg-accent-soft/5 px-2.5 py-1.5 text-xs text-ink-dim">
        <summary className="cursor-pointer">
          <span className="font-medium text-accent">🧠 ความคิดภายใน</span>
        </summary>
        <p className="mt-1.5 whitespace-pre-wrap text-[11px] italic">{block.text}</p>
      </details>
    );
  }
  return <ToolBlock block={block} />;
}

function ToolBlock({ block }: { block: Extract<Block, { kind: "tool" }> }) {
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
              <Spinner /> <span>กำลังทำงาน…</span>
            </>
          )}
          {block.status === "ok" && <span>เสร็จ ✓</span>}
          {block.status === "error" && <span>ผิดพลาด ✗</span>}
        </span>
      </div>
      {block.preview && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[10px] opacity-70 hover:opacity-100">
            ดูผลที่ได้
          </summary>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-bg/40 p-2 font-mono text-[10px] text-ink-dim">
            {block.preview}
          </pre>
        </details>
      )}
    </div>
  );
}

/* ---------- Empty + helpers ---------- */

function EmptyMeetingRoom({ onPick }: { onPick: (q: string) => void }) {
  const samples = [
    "สรุปสุขภาพบริษัทตอนนี้",
    "เพิ่ม task ส่ง proposal โรงเรียนสาธิตให้ Jordan due 2026-05-25",
    "พยากรณ์ยอดเดือนนี้",
    "ทำคอนเทนต์ launch หลักสูตร 3D Printing",
    "Cash runway เหลือกี่เดือน",
    "Ticket อะไรเกิน SLA",
  ];
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 pt-10 text-center">
      <div className="flex -space-x-3">
        {EMPLOYEES.slice(0, 5).map((e) => (
          <Avatar key={e.slug} employee={e} size={42} ring />
        ))}
      </div>
      <div>
        <h2 className="text-lg font-semibold text-ink">ห้องประชุมกลาง</h2>
        <p className="mt-1 max-w-sm text-sm text-ink-dim">
          ถามอะไรก็ได้ — ระบบจะเลือกพนักงานที่ตรงเรื่องที่สุดให้กระโดดเข้ามาตอบ
        </p>
        <p className="mt-2 text-xs text-ink-dim/70">
          💡 ใช้ <code className="text-accent">@Jordan</code> /{" "}
          <code className="text-accent">@Daniel</code> เพื่อระบุคน
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {samples.map((s) => (
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

function AttachPreview({ a, dark }: { a: Attachment; dark: boolean }) {
  const isImage = a.mimeType.startsWith("image/");
  if (isImage) {
    return (
      <a href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-white/20">
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
      <button onClick={onRemove} className="text-ink-dim hover:text-danger" title="ลบไฟล์นี้">
        ✕
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
  );
}

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

function appendText(blocks: Block[], text: string): Block[] {
  const last = blocks[blocks.length - 1];
  if (last && last.kind === "text") {
    return [...blocks.slice(0, -1), { kind: "text", text: last.text + text }];
  }
  return [...blocks, { kind: "text", text }];
}

function appendThinking(blocks: Block[], text: string): Block[] {
  const last = blocks[blocks.length - 1];
  if (last && last.kind === "thinking") {
    return [...blocks.slice(0, -1), { kind: "thinking", text: last.text + text }];
  }
  return [...blocks, { kind: "thinking", text }];
}

function blocksToText(blocks: Block[]): string {
  return blocks
    .filter((b): b is Extract<Block, { kind: "text" }> => b.kind === "text")
    .map((b) => b.text)
    .join("\n");
}

/** Shape used by /api/chats/<id> response */
interface PersistedMsg {
  role: "user" | "assistant";
  content?: string;
  attachments?: Attachment[];
  respondent?: Respondent | null;
  blocks?: Block[];
  status?: "done" | "error";
  durationMs?: number;
  timestamp?: string;
}

function hydrateMsg(m: PersistedMsg): Msg {
  if (m.role === "user") {
    return {
      role: "user",
      content: m.content || "",
      attachments: m.attachments,
    };
  }
  return {
    role: "assistant",
    respondent: m.respondent ?? null,
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
