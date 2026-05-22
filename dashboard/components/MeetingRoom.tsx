"use client";

/**
 * Meeting room = dispatch board (not a chat log).
 *
 * User types a request → server picks the right employee → SDK iteration runs
 * in the background and persists into `direct-<slug>` (the employee's own
 * room). The meeting room only shows a compact "task card" per dispatch:
 * who took it, what they were asked, a status pill (กำลังคิด / เสร็จแล้ว /
 * error) and a short result preview. The input stays enabled so the user can
 * fire the next task to a different employee without waiting.
 *
 * Detailed thinking / tool calls / full reply live in the employee's direct
 * chat — click "เปิดห้อง" on a card to jump there.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ACCENT_BG_SOFT,
  ACCENT_BORDER,
  EMPLOYEES,
  EmployeeMeta,
  EmployeeSlug,
} from "@/lib/employees";
import { summarizeAutoSync, useAutoSync } from "@/lib/useAutoSync";
import { useJobStream, abortJob, type ClientJob } from "@/lib/useJobStream";
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
  avatarUrl?: string;
  reason: string;
}

/** A dispatched task — purely client-side state, hydrated from /api/jobs/stream. */
interface Task {
  jobId: string;
  prompt: string;
  attachments?: Attachment[];
  respondent: Respondent;
  /** Hint from POST /api/chat — overridden by job stream once it arrives. */
  initialStatus: "queued";
  /** ISO seconds when we dispatched (used while jobStream snapshot loads). */
  dispatchedAt: number;
}

interface DispatchResponse {
  ok: boolean;
  job_id: string;
  chat_id: string;
  respondent: Respondent;
}

interface Props {
  /** Optional seed prompt: when changed, autofill input */
  seed: string | null;
  /** Notify parent each time a respondent starts speaking (for sidebar spotlight) */
  onRespondent: (slug: EmployeeSlug | null) => void;
  /** Notify parent when agent likely changed tasks.json (so kanban re-fetches) */
  onAgentTurn: () => void;
  /** Jump to a direct chat room (used by "เปิดห้อง" button on task cards). */
  onOpenDirect: (slug: EmployeeSlug) => void;
}

const LS_TASK_ORDER = "meeting-room.dispatched-job-ids";

export default function MeetingRoom({
  seed,
  onRespondent,
  onAgentTurn,
  onOpenDirect,
}: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoSync = useAutoSync();

  // Subscribe to global job stream so each task card animates live.
  const { all: jobsList } = useJobStream();
  const jobsById = useMemo(() => {
    const m = new Map<string, ClientJob>();
    for (const j of jobsList) m.set(j.id, j);
    return m;
  }, [jobsList]);

  // Hydrate task order from localStorage on mount so a page refresh doesn't
  // wipe the board. We only persist ids — the rest comes from job stream.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_TASK_ORDER);
      if (!raw) return;
      const ids = JSON.parse(raw) as string[];
      if (!Array.isArray(ids)) return;
      // Re-hydrate skeleton tasks; real data will fill in once snapshot arrives.
      setTasks((cur) => {
        if (cur.length > 0) return cur; // already populated
        return ids.map<Task>((id) => ({
          jobId: id,
          prompt: "(โหลด…)",
          respondent: PLACEHOLDER_RESPONDENT,
          initialStatus: "queued",
          dispatchedAt: 0,
        }));
      });
    } catch {
      /* ignore */
    }
  }, []);

  // Persist task order whenever it changes.
  useEffect(() => {
    try {
      const ids = tasks.map((t) => t.jobId);
      localStorage.setItem(LS_TASK_ORDER, JSON.stringify(ids.slice(-50)));
    } catch {
      /* ignore */
    }
  }, [tasks]);

  // Once a task's job arrives from snapshot, backfill its prompt/respondent if
  // we only had a placeholder (e.g. after page refresh). Crucially, we bail
  // out by returning the same `cur` reference when nothing changed —
  // otherwise `cur.map()` would mint a fresh array every render and create
  // an infinite loop with `jobsById`'s identity churn.
  useEffect(() => {
    setTasks((cur) => {
      let changed = false;
      const next = cur.map((t) => {
        if (t.respondent !== PLACEHOLDER_RESPONDENT) return t;
        const j = jobsById.get(t.jobId);
        if (!j) return t;
        changed = true;
        return {
          ...t,
          prompt: j.prompt,
          respondent: {
            slug: j.employeeSlug as EmployeeSlug,
            name: j.employeeName,
            title: "",
            department: "",
            accent: (j.employeeAccent as EmployeeMeta["accent"]) || "indigo",
            reason: "",
          },
          dispatchedAt: j.startedAt,
        };
      });
      return changed ? next : cur;
    });
  }, [jobsById]);

  // Surface "currently working" respondent to sidebar spotlight (most recent
  // running task wins). Notify "no one" once everything is idle.
  useEffect(() => {
    const running = [...tasks]
      .reverse()
      .map((t) => jobsById.get(t.jobId))
      .find((j) => j && (j.status === "running" || j.status === "queued"));
    onRespondent(running ? (running.employeeSlug as EmployeeSlug) : null);
  }, [tasks, jobsById, onRespondent]);

  // When any of our tasks just finished, refresh KPI/task-board for the parent.
  const prevStatusesRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    let changed = false;
    const next = new Map<string, string>();
    for (const t of tasks) {
      const j = jobsById.get(t.jobId);
      const status = j?.status ?? "queued";
      next.set(t.jobId, status);
      const prev = prevStatusesRef.current.get(t.jobId);
      if (
        prev &&
        (prev === "running" || prev === "queued") &&
        status !== "running" &&
        status !== "queued"
      ) {
        changed = true;
      }
    }
    prevStatusesRef.current = next;
    if (changed) {
      onAgentTurn();
      if (autoSync.enabled) {
        autoSync.runSync().then((r) => {
          if (r) setToast(summarizeAutoSync(r));
        });
      }
    }
  }, [tasks, jobsById, onAgentTurn, autoSync]);

  useEffect(() => {
    if (seed && !dispatching) setInput(seed);
  }, [seed, dispatching]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [tasks.length]);

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

  async function dispatch(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text && pendingFiles.length === 0) return;

    setError(null);
    const attached = pendingFiles;

    setDispatching(true);
    setInput("");
    setPendingFiles([]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          employee: "auto",
          dispatch: true,
          // No `last_respondent` here on purpose. The dispatch board treats each
          // task as independent — routing must be fresh per prompt (keyword +
          // explicit @mention), not "continue with whoever spoke last". The
          // sticky hint is only useful inside a 1-on-1 thread (ChatPane).
          messages: [{ role: "user" as const, content: text || "(แนบไฟล์มา — ช่วยดูให้ที)" }],
          attachments: attached.map((a) => ({
            path: a.path,
            name: a.name,
            mimeType: a.mimeType,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as DispatchResponse;
      const task: Task = {
        jobId: data.job_id,
        prompt: text || "(แนบไฟล์มา — ช่วยดูให้ที)",
        attachments: attached.length > 0 ? attached : undefined,
        respondent: data.respondent,
        initialStatus: "queued",
        dispatchedAt: Date.now(),
      };
      setTasks((cur) => [...cur, task]);
    } catch (e) {
      setError((e as Error).message);
      // restore input so user can retry without retyping
      setInput(text);
      setPendingFiles(attached);
    } finally {
      setDispatching(false);
    }
  }

  function clearBoard() {
    setTasks([]);
    try {
      localStorage.removeItem(LS_TASK_ORDER);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface/40 px-5 py-2">
        <div className="flex items-center gap-2 text-[11px] text-ink-dim">
          <span className="status-dot ok" />
          <span>
            บอร์ดสั่งงาน · {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            {tasks.length > 0 && (
              <>
                {" · "}
                <ActiveCounter tasks={tasks} jobsById={jobsById} />
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <label
            className="flex cursor-pointer select-none items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink"
            title="หลังจากเอเจ้นต์ทำงานเสร็จ จะอัปไฟล์ใน outputs/ ขึ้น Drive และ push CSV ขึ้น Sheets อัตโนมัติ"
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
            onClick={clearBoard}
            disabled={tasks.length === 0}
            title="ล้างบอร์ด (รายละเอียดแชทในห้องย่อยของแต่ละคนยังอยู่)"
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-30"
          >
            🗑 ล้างบอร์ด
          </button>
        </div>
      </div>

      {toast && (
        <div className="border-b border-ok/30 bg-ok/5 px-5 py-2 text-[11.5px] text-ok">
          {toast}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tasks.length === 0 && (
          <EmptyBoard onPick={(q) => setInput(q)} />
        )}
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {tasks.map((t) => (
            <TaskCard
              key={t.jobId}
              task={t}
              job={jobsById.get(t.jobId)}
              onOpenDirect={onOpenDirect}
            />
          ))}
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
          <AgentPickerBar
            input={input}
            disabled={uploading}
            onPing={(firstName) => {
              const trimmed = input.trim();
              const composed = trimmed ? `@${firstName} ${trimmed}` : `@${firstName}`;
              dispatch(composed);
            }}
          />
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
              disabled={uploading}
              title="แนบไฟล์"
              className="flex h-[52px] items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-sm text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
            >
              {uploading ? <span className="text-xs">อัปฯ…</span> : <PaperclipIcon />}
            </button>
            <MentionTextarea
              value={input}
              onChange={setInput}
              onSubmit={dispatch}
              placeholder="สั่งงาน… พิมพ์ @ เพื่อเลือกคน  ·  ส่งงานต่อได้ทันที ไม่ต้องรอคนก่อนหน้าจบ"
              rows={2}
              className="input min-h-[52px] flex-1 w-full"
              disabled={false}
            />
            <button
              onClick={() => dispatch()}
              className="btn-primary"
              disabled={dispatching || (!input.trim() && pendingFiles.length === 0)}
              title="ส่งงาน — จะเปิด session ใหม่ คุณสั่งคนอื่นต่อได้เลย"
            >
              {dispatching ? "ส่ง…" : "ส่งงาน"}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-ink-dim/60">
            งานทำในห้องย่อยของแต่ละคน · บอร์ดนี้แสดงแค่สถานะ · กด &ldquo;เปิดห้อง&rdquo; เพื่อดูรายละเอียดเต็ม
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------- Task card ---------- */

function TaskCard({
  task,
  job,
  onOpenDirect,
}: {
  task: Task;
  job: ClientJob | undefined;
  onOpenDirect: (slug: EmployeeSlug) => void;
}) {
  const status = job?.status ?? task.initialStatus;
  const accent = task.respondent.accent ?? "indigo";
  const borderClass = ACCENT_BORDER[accent];
  const chipBg = ACCENT_BG_SOFT[accent];

  const [elapsed, setElapsed] = useState(() =>
    job?.startedAt ? Date.now() - job.startedAt : 0,
  );
  useEffect(() => {
    if (status !== "running" && status !== "queued") return;
    const startedAt = job?.startedAt ?? task.dispatchedAt;
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
  }, [status, job?.startedAt, task.dispatchedAt]);

  // Prefer the real EmployeeMeta from the registry so the avatar uses the
  // same seed as everywhere else; fall back to a synthetic stub for
  // placeholder/unknown respondents.
  const employee: EmployeeMeta = useMemo(() => {
    const real = EMPLOYEES.find((e) => e.slug === task.respondent.slug);
    if (real) return real;
    return {
      slug: task.respondent.slug,
      name: task.respondent.name,
      firstName: task.respondent.name.split(" ")[0],
      title: task.respondent.title || "",
      department: task.respondent.department || "",
      accent,
      blurb: "",
      avatarSeed: task.respondent.name,
      kpiIds: [],
      dataFiles: [],
    };
  }, [task.respondent, accent]);

  return (
    <div className={`rounded-2xl border ${borderClass} bg-surface px-4 py-3 text-sm shadow-sm`}>
      <div className="flex items-start gap-3">
        <Avatar employee={employee} size={36} ring />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{task.respondent.name}</span>
            {task.respondent.title && (
              <>
                <span className="text-ink-dim">·</span>
                <span className="text-[11px] text-ink-dim">{task.respondent.title}</span>
              </>
            )}
            {task.respondent.reason && (
              <span className={`pill ${chipBg}`}>↳ {task.respondent.reason}</span>
            )}
            <StatusPill status={status} elapsed={elapsed} job={job} className="ml-auto" />
          </div>

          <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-[13px] text-ink-dim">
            <span className="text-ink-dim/60">› </span>
            {task.prompt}
          </p>

          {task.attachments && task.attachments.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {task.attachments.map((a) => (
                <span
                  key={a.path}
                  className="inline-flex items-center gap-1 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-dim"
                  title={a.name}
                >
                  📎 <span className="max-w-[140px] truncate">{a.name}</span>
                </span>
              ))}
            </div>
          )}

          {/* Result preview when done */}
          {status === "done" && job?.resultPreview && (
            <p className="mt-2 line-clamp-3 rounded-md bg-surface-2/40 px-2.5 py-1.5 text-[12px] text-ink">
              {job.resultPreview}
            </p>
          )}
          {status === "error" && job?.errorMessage && (
            <p className="mt-2 rounded-md border border-danger/30 bg-danger/5 px-2.5 py-1.5 text-[11.5px] text-danger">
              ✗ {job.errorMessage}
            </p>
          )}

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-1.5">
            <span className="text-[10px] text-ink-dim/60">
              {status === "done" && job?.durationMs != null && (
                <>✓ เสร็จใน {(job.durationMs / 1000).toFixed(1)}s</>
              )}
              {status === "aborted" && <span className="text-ink-dim">⊘ ยกเลิกแล้ว</span>}
            </span>
            <div className="flex items-center gap-1.5">
              {(status === "running" || status === "queued") && job && (
                <button
                  onClick={() => abortJob(job.id)}
                  className="rounded-md border border-border bg-surface px-2 py-0.5 text-[10.5px] text-ink-dim hover:border-danger hover:text-danger"
                  title="ยกเลิกงานนี้"
                >
                  × ยกเลิก
                </button>
              )}
              <button
                onClick={() => onOpenDirect(task.respondent.slug)}
                className="rounded-md border border-accent/30 bg-accent-soft/10 px-2 py-0.5 text-[10.5px] text-accent hover:bg-accent-soft/20"
                title={`เปิดห้องของ ${task.respondent.name.split(" ")[0]} เพื่อดูรายละเอียดเต็ม`}
              >
                เปิดห้อง →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  status,
  elapsed,
  job,
  className = "",
}: {
  status: ClientJob["status"];
  elapsed: number;
  job: ClientJob | undefined;
  className?: string;
}) {
  if (status === "running" || status === "queued") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-accent-soft/15 px-2 py-0.5 text-[11px] text-accent ${className}`}
      >
        <Spinner />
        <span>{status === "queued" ? "เข้าคิว…" : "กำลังคิด"}</span>
        <span className="opacity-70">{fmtElapsed(elapsed)}</span>
      </span>
    );
  }
  if (status === "done") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-ok/10 px-2 py-0.5 text-[11px] text-ok ${className}`}
      >
        ✓ เสร็จแล้ว
        {job?.durationMs != null && (
          <span className="opacity-70">{(job.durationMs / 1000).toFixed(1)}s</span>
        )}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[11px] text-danger ${className}`}
      >
        ✗ ผิดพลาด
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-dim ${className}`}
    >
      ⊘ ยกเลิก
    </span>
  );
}

function ActiveCounter({
  tasks,
  jobsById,
}: {
  tasks: Task[];
  jobsById: Map<string, ClientJob>;
}) {
  const counts = useMemo(() => {
    let active = 0;
    let done = 0;
    for (const t of tasks) {
      const j = jobsById.get(t.jobId);
      const s = j?.status ?? "queued";
      if (s === "running" || s === "queued") active++;
      else if (s === "done") done++;
    }
    return { active, done };
  }, [tasks, jobsById]);
  if (counts.active === 0 && counts.done === 0) return null;
  return (
    <>
      {counts.active > 0 && (
        <span className="text-accent">{counts.active} กำลังทำ</span>
      )}
      {counts.active > 0 && counts.done > 0 && <span className="text-ink-dim"> · </span>}
      {counts.done > 0 && <span className="text-ok">{counts.done} เสร็จ</span>}
    </>
  );
}

/* ---------- Picker / empty / helpers ---------- */

function AgentPickerBar({
  input,
  onPing,
  disabled,
}: {
  input: string;
  onPing: (firstName: string) => void;
  disabled?: boolean;
}) {
  const hasText = input.trim().length > 0;
  return (
    <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-ink-dim/70">
        {hasText ? "สั่ง →" : "เรียกใคร →"}
      </span>
      {EMPLOYEES.map((e) => (
        <button
          key={e.slug}
          type="button"
          onClick={() => onPing(e.firstName)}
          disabled={disabled}
          title={
            hasText
              ? `สั่งงานนี้ให้ ${e.firstName} (${e.title})`
              : `เรียก ${e.firstName} (${e.title})`
          }
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-ink-dim transition hover:border-accent hover:bg-accent-soft/15 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Avatar employee={e} size={18} />
          <span className="font-medium">@{e.firstName}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyBoard({ onPick }: { onPick: (q: string) => void }) {
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
        <h2 className="text-lg font-semibold text-ink">บอร์ดสั่งงาน</h2>
        <p className="mt-1 max-w-md text-sm text-ink-dim">
          พิมพ์งาน — ระบบจะส่งให้พนักงานที่เกี่ยวข้องทำในห้องของเขาเอง
          บอร์ดนี้แสดงแค่สถานะ “กำลังคิด / เสร็จแล้ว”
          คุณสั่งคนถัดไปได้ทันทีโดยไม่ต้องรอ
        </p>
        <p className="mt-2 text-xs text-ink-dim/70">
          💡 <code className="text-accent">@Jordan</code> /{" "}
          <code className="text-accent">@Daniel</code> เพื่อระบุคน · กด &ldquo;เปิดห้อง&rdquo; ที่การ์ดเพื่อดูรายละเอียดเต็ม
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

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Placeholder used while waiting for the first job-stream snapshot to fill in
 *  details about a task we loaded from localStorage. */
const PLACEHOLDER_RESPONDENT: Respondent = {
  slug: "ceo",
  name: "…",
  title: "",
  department: "",
  accent: "indigo",
  reason: "",
};
