"use client";

import { useEffect, useRef, useState } from "react";
import { ClientJob } from "@/lib/useJobStream";

interface ConsoleLine {
  id: string;
  ts: number;
  who: string;
  msg: string;
  tone: "info" | "ok" | "warn" | "err";
}

interface Props {
  active: ClientJob[];
  recentFinishes: ClientJob[];
}

/**
 * Bottom panel — two columns:
 *   - SYSTEM CONSOLE: append-only log of events (started / finished / errored)
 *   - ACTIVE JOBS:    live list of currently-running agents with elapsed time
 */
export default function OfficeConsole({ active, recentFinishes }: Props) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const seenStartsRef = useRef<Set<string>>(new Set());
  const seenFinishesRef = useRef<Set<string>>(new Set());

  // Track start events (running or queued jobs we haven't logged yet)
  useEffect(() => {
    const newLines: ConsoleLine[] = [];
    for (const job of active) {
      const key = `start:${job.id}`;
      if (seenStartsRef.current.has(key)) continue;
      if (job.status === "running") {
        seenStartsRef.current.add(key);
        newLines.push({
          id: key,
          ts: job.startedAt,
          who: job.employeeName,
          msg: `เริ่มงาน — "${truncate(job.prompt, 50)}"`,
          tone: "info",
        });
      }
    }
    if (newLines.length) {
      setLines((cur) => [...cur, ...newLines].slice(-100));
    }
  }, [active]);

  // Track finish events
  useEffect(() => {
    const newLines: ConsoleLine[] = [];
    for (const job of recentFinishes) {
      const key = `finish:${job.id}`;
      if (seenFinishesRef.current.has(key)) continue;
      seenFinishesRef.current.add(key);
      const tone: ConsoleLine["tone"] =
        job.status === "done" ? "ok" : job.status === "error" ? "err" : "warn";
      const msg =
        job.status === "done"
          ? `ทำเสร็จใน ${formatDuration(job.durationMs)} — ${truncate(
              job.resultPreview || job.prompt,
              50,
            )}`
          : job.status === "error"
            ? `เกิด error: ${truncate(job.errorMessage || "unknown", 50)}`
            : `งานถูกยกเลิก`;
      newLines.push({
        id: key,
        ts: job.finishedAt || Date.now(),
        who: job.employeeName,
        msg,
        tone,
      });
    }
    if (newLines.length) {
      setLines((cur) => [...cur, ...newLines].slice(-100));
    }
  }, [recentFinishes]);

  // Auto-scroll to bottom on new line.
  const consoleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const visible = lines.slice(-30);

  return (
    <div className="office-console grid grid-cols-[1.4fr_1fr] gap-0 border-t-2 border-border bg-surface/80">
      {/* System Console */}
      <div className="border-r-2 border-border">
        <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-3 py-1.5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink">
            ▸ System Console
          </p>
          <span className="font-mono text-[10px] text-ink-dim">
            {lines.length} events
          </span>
        </div>
        <div
          ref={consoleRef}
          className="h-[160px] overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
        >
          {visible.length === 0 ? (
            <p className="text-ink-dim">— ยังไม่มี event — ลองเริ่มงานจาก meeting room</p>
          ) : (
            visible.map((line) => (
              <div key={line.id} className="flex gap-2">
                <span className="text-ink-dim">[{formatTime(line.ts)}]</span>
                <span className={toneClass(line.tone)}>{line.who}:</span>
                <span className="text-ink">{line.msg}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Active Jobs */}
      <div>
        <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-3 py-1.5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink">
            ▸ Active Jobs
          </p>
          <span
            className={
              "font-mono text-[10px] " +
              (active.length > 0 ? "text-emerald-400" : "text-ink-dim")
            }
          >
            {active.length} running
          </span>
        </div>
        <div className="h-[160px] overflow-y-auto px-3 py-2 font-mono text-[11px]">
          {active.length === 0 ? (
            <p className="text-ink-dim">— ทุกคนว่าง —</p>
          ) : (
            <ul className="space-y-1.5">
              {active.map((j) => (
                <ActiveJobRow key={j.id} job={j} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveJobRow({ job }: { job: ClientJob }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - job.startedAt);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Date.now() - job.startedAt), 1000);
    return () => clearInterval(t);
  }, [job.startedAt]);

  return (
    <li className="flex items-start gap-2 leading-tight">
      <span
        className={
          "status-dot mt-1.5 " + (job.status === "queued" ? "warn" : "ok")
        }
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-ink">
          <span className="font-bold">{job.employeeName}</span>
          <span className="text-ink-dim"> · {formatElapsed(elapsed)}</span>
        </p>
        <p className="truncate text-[10px] text-ink-dim">
          {job.currentActivity || truncate(job.prompt, 50)}
        </p>
      </div>
    </li>
  );
}

function toneClass(t: ConsoleLine["tone"]) {
  switch (t) {
    case "ok":
      return "text-emerald-400 font-bold";
    case "err":
      return "text-rose-400 font-bold";
    case "warn":
      return "text-amber-400 font-bold";
    default:
      return "text-indigo-300 font-bold";
  }
}

function truncate(s: string, n: number) {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.getHours().toString().padStart(2, "0") +
    ":" +
    d.getMinutes().toString().padStart(2, "0") +
    ":" +
    d.getSeconds().toString().padStart(2, "0")
  );
}

function formatDuration(ms?: number): string {
  if (!ms) return "?";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
