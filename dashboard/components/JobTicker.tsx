"use client";

import { useEffect, useRef, useState } from "react";
import { abortJob, useJobStream, type ClientJob } from "@/lib/useJobStream";

interface Toast {
  id: string;
  text: string;
  href?: string;
  tone: "success" | "error";
}

interface Props {
  /**
   * The chatId of the room rendering the ticker. Jobs in this room are
   * hidden from the "other rooms" strip (the room itself already shows
   * its own streaming state), and we don't toast on their completion.
   */
  currentChatId?: string;
  /**
   * Called when the user clicks a finished-elsewhere notification — the
   * parent can switch the active room to that chatId.
   */
  onJumpToRoom?: (chatId: string) => void;
}

/**
 * Live strip of agent runs happening in other rooms.
 *
 * Two pieces:
 *   1. Header pill showing N agents currently working (with names).
 *   2. Transient toast when a job in *another* room finishes — clickable
 *      to jump to that room.
 *
 * Subscribed to /api/jobs/stream via SSE so updates are instant; no polling.
 */
export default function JobTicker({ currentChatId, onJumpToRoom }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const { connected, active } = useJobStream({
    onFinish: (job) => {
      if (job.chatId === currentChatId) return; // own room — chat UI shows it
      pushToast(job);
    },
  });

  function pushToast(job: ClientJob) {
    const id = job.id;
    const text =
      job.status === "done"
        ? `${job.employeeName} ทำเสร็จแล้ว ใน "${roomLabel(job.chatId)}"`
        : job.status === "error"
          ? `${job.employeeName} เจอ error ใน "${roomLabel(job.chatId)}"`
          : `${job.employeeName} ถูกยกเลิก`;
    setToasts((cur) => [
      ...cur.filter((t) => t.id !== id),
      { id, text, href: job.chatId, tone: job.status === "error" ? "error" : "success" },
    ]);
    const prev = toastTimers.current.get(id);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      setToasts((cur) => cur.filter((t) => t.id !== id));
      toastTimers.current.delete(id);
    }, 8000);
    toastTimers.current.set(id, timer);
  }

  useEffect(
    () => () => {
      for (const t of toastTimers.current.values()) clearTimeout(t);
      toastTimers.current.clear();
    },
    [],
  );

  // Strip shows agents working *elsewhere*. We still surface own-room
  // activity through the existing chat streaming UI.
  const elsewhere = active.filter((j) => j.chatId !== currentChatId);

  return (
    <>
      {(elsewhere.length > 0 || !connected) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 bg-slate-900/40 px-3 py-1.5 text-xs">
          {!connected && (
            <span className="text-ink-dim/70">เชื่อมต่อสถานะงาน…</span>
          )}
          {elsewhere.map((j) => (
            <ActiveChip
              key={j.id}
              job={j}
              onJump={onJumpToRoom}
              onAbort={() => abortJob(j.id)}
            />
          ))}
        </div>
      )}

      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => t.href && onJumpToRoom?.(t.href)}
              className={[
                "pointer-events-auto rounded-lg border px-3 py-2 text-left text-xs shadow-lg backdrop-blur",
                t.tone === "error"
                  ? "border-red-400/40 bg-red-500/10 text-red-200"
                  : "border-emerald-400/40 bg-emerald-500/10 text-emerald-200",
              ].join(" ")}
            >
              <div>{t.text}</div>
              {t.href && (
                <div className="mt-0.5 text-[10px] opacity-60">
                  กดเพื่อเปิดห้อง →
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function ActiveChip({
  job,
  onJump,
  onAbort,
}: {
  job: ClientJob;
  onJump?: (chatId: string) => void;
  onAbort?: () => void;
}) {
  const [elapsed, setElapsed] = useState(() => Date.now() - job.startedAt);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - job.startedAt), 1000);
    return () => clearInterval(id);
  }, [job.startedAt]);

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft/10 px-2 py-0.5 text-accent">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
      <button
        type="button"
        onClick={() => onJump?.(job.chatId)}
        className="hover:underline"
        title={`${roomLabel(job.chatId)} • "${job.prompt}"`}
      >
        {job.employeeName}
      </button>
      <span className="text-[10px] text-ink-dim">{fmtElapsed(elapsed)}</span>
      <button
        type="button"
        onClick={onAbort}
        className="text-[10px] text-ink-dim hover:text-red-300"
        title="ยกเลิกงานนี้"
      >
        ×
      </button>
    </span>
  );
}

function roomLabel(chatId: string): string {
  if (chatId === "meeting-room") return "ห้องรวม";
  if (chatId.startsWith("direct-")) return `@${chatId.slice("direct-".length)}`;
  return chatId;
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
