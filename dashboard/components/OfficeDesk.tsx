"use client";

import Avatar from "./Avatar";
import {
  ACCENT_BORDER,
  ACCENT_BG_SOFT,
  EmployeeMeta,
} from "@/lib/employees";
import { ClientJob } from "@/lib/useJobStream";

interface Props {
  employee: EmployeeMeta;
  job?: ClientJob;
  onOpenDirect: () => void;
}

type DeskState = "idle" | "queued" | "running" | "thinking";

function deriveState(job?: ClientJob): DeskState {
  if (!job) return "idle";
  if (job.status === "queued") return "queued";
  if (job.status === "running") {
    if (
      job.currentActivity &&
      /กำลังคิด|thinking/i.test(job.currentActivity)
    ) {
      return "thinking";
    }
    return "running";
  }
  return "idle";
}

const STATE_LABEL: Record<DeskState, string> = {
  idle: "idle",
  queued: "queued",
  running: "working",
  thinking: "thinking",
};

const STATE_DOT: Record<DeskState, string> = {
  idle: "muted",
  queued: "warn",
  running: "ok",
  thinking: "ok",
};

export default function OfficeDesk({ employee, job, onOpenDirect }: Props) {
  const state = deriveState(job);
  const accent = employee.accent;
  const borderCls = ACCENT_BORDER[accent];

  // Activity bubble — shown only when actively working.
  const bubble =
    state === "running" || state === "thinking" || state === "queued"
      ? job?.currentActivity ||
        (state === "queued" ? "เข้าคิวรอ…" : "กำลังทำงาน…")
      : null;

  return (
    <button
      onClick={onOpenDirect}
      className={[
        "office-desk group relative flex flex-col items-center gap-2",
        "border-2 bg-surface/60 px-3 pb-3 pt-5",
        "transition hover:bg-surface-2",
        borderCls,
        state === "running" || state === "thinking"
          ? "office-desk-working"
          : "",
      ].join(" ")}
      title={`${employee.name} — ${employee.title}`}
    >
      {/* Speech bubble (only while active) */}
      {bubble && (
        <div
          className={[
            "office-bubble absolute left-1/2 z-10 -translate-x-1/2",
            "max-w-[200px] -translate-y-full",
            "border bg-surface px-2 py-1 font-mono text-[10px] leading-tight text-ink",
            borderCls,
          ].join(" ")}
          style={{ top: "-6px" }}
        >
          {truncate(bubble, 60)}
          <span className="office-bubble-tail" aria-hidden />
        </div>
      )}

      {/* Avatar with pulse ring when working */}
      <div className="relative">
        <Avatar employee={employee} size={56} ring />
        {(state === "running" || state === "thinking") && (
          <span className="office-pulse" aria-hidden />
        )}
      </div>

      {/* Name + role */}
      <div className="text-center">
        <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-ink">
          {employee.firstName}
        </p>
        <p className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
          {employee.title}
        </p>
      </div>

      {/* Status pill */}
      <div
        className={[
          "flex items-center gap-1.5 border px-1.5 py-0.5",
          "font-mono text-[9px] uppercase tracking-wider",
          state === "idle"
            ? "border-border text-ink-dim"
            : ACCENT_BG_SOFT[accent] + " " + borderCls,
        ].join(" ")}
      >
        <span className={`status-dot ${STATE_DOT[state]}`} />
        {STATE_LABEL[state]}
      </div>
    </button>
  );
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
