import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

/**
 * In-memory job registry for parallel chat turns.
 *
 * Every POST /api/chat call registers a Job here so that:
 *   1. The dashboard can show a "live ticker" of work happening in other
 *      rooms (e.g. while you're in @sales-rep, @marketing-lead is finishing
 *      a post in their own room).
 *   2. SSE clients (/api/jobs/stream) get push notifications when a job
 *      finishes — no polling.
 *   3. We have a handle to abort a running turn from a different tab.
 *
 * Scope: process-local. Survives nothing; one Next.js worker = one registry.
 * Good enough for solo/small-team usage; swap to Redis or a file-backed log
 * if we ever need multi-instance.
 */

export type JobStatus = "queued" | "running" | "done" | "error" | "aborted";

export interface JobRecord {
  id: string;
  chatId: string;
  employeeSlug: string;
  employeeName: string;
  employeeAccent?: string;
  /** Short preview of the user's prompt (≤ 120 chars). */
  prompt: string;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  /** First ~200 chars of the assistant's reply, set when status === "done". */
  resultPreview?: string;
  errorMessage?: string;
}

/** Event payload broadcast to SSE subscribers. */
export type JobEvent =
  | { type: "started"; job: JobRecord }
  | { type: "status"; job: JobRecord }
  | { type: "finished"; job: JobRecord }
  | { type: "snapshot"; jobs: JobRecord[] };

interface AbortHandle {
  abort: () => void;
}

class JobRegistry {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly aborts = new Map<string, AbortHandle>();
  private readonly emitter = new EventEmitter();
  /** Cap recent-history to keep memory bounded. */
  private readonly maxKept = 200;

  constructor() {
    // Many SSE clients may attach; default 10 is too low.
    this.emitter.setMaxListeners(0);
  }

  start(input: {
    chatId: string;
    employeeSlug: string;
    employeeName: string;
    employeeAccent?: string;
    prompt: string;
    abort?: AbortHandle;
  }): JobRecord {
    const job: JobRecord = {
      id: randomUUID(),
      chatId: input.chatId,
      employeeSlug: input.employeeSlug,
      employeeName: input.employeeName,
      employeeAccent: input.employeeAccent,
      prompt: truncate(input.prompt, 120),
      status: "queued",
      startedAt: Date.now(),
    };
    this.jobs.set(job.id, job);
    if (input.abort) this.aborts.set(job.id, input.abort);
    this.evict();
    this.emit({ type: "started", job });
    return job;
  }

  markRunning(id: string): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "queued") return;
    job.status = "running";
    this.emit({ type: "status", job });
  }

  finish(
    id: string,
    outcome:
      | { status: "done"; resultPreview?: string }
      | { status: "error"; errorMessage: string }
      | { status: "aborted" },
  ): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = outcome.status;
    job.finishedAt = Date.now();
    job.durationMs = job.finishedAt - job.startedAt;
    if (outcome.status === "done") {
      job.resultPreview = outcome.resultPreview
        ? truncate(outcome.resultPreview, 220)
        : undefined;
    } else if (outcome.status === "error") {
      job.errorMessage = outcome.errorMessage;
    }
    this.aborts.delete(id);
    this.emit({ type: "finished", job });
  }

  abort(id: string): boolean {
    const handle = this.aborts.get(id);
    if (!handle) return false;
    try {
      handle.abort();
    } catch {
      /* ignore */
    }
    this.finish(id, { status: "aborted" });
    return true;
  }

  list(): JobRecord[] {
    return [...this.jobs.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  subscribe(listener: (evt: JobEvent) => void): () => void {
    this.emitter.on("event", listener);
    // Replay current state so a fresh subscriber sees in-flight work.
    listener({ type: "snapshot", jobs: this.list() });
    return () => this.emitter.off("event", listener);
  }

  private emit(evt: JobEvent): void {
    this.emitter.emit("event", evt);
  }

  /** Drop oldest finished jobs once we exceed maxKept. */
  private evict(): void {
    if (this.jobs.size <= this.maxKept) return;
    const sorted = [...this.jobs.values()].sort(
      (a, b) => (a.finishedAt ?? Infinity) - (b.finishedAt ?? Infinity),
    );
    for (const job of sorted) {
      if (this.jobs.size <= this.maxKept) break;
      if (job.status === "queued" || job.status === "running") continue;
      this.jobs.delete(job.id);
    }
  }
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/**
 * Module-level singleton. Next.js may HMR this in dev — store on globalThis
 * so we keep one registry across reloads (otherwise active jobs vanish on
 * code edit).
 */
const KEY = Symbol.for("company-agent-core.jobRegistry");
type GlobalWithRegistry = typeof globalThis & { [KEY]?: JobRegistry };
const g = globalThis as GlobalWithRegistry;
export const jobRegistry: JobRegistry = g[KEY] ?? (g[KEY] = new JobRegistry());
