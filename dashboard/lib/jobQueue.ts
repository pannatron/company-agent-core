import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { AgentQuestion } from "./agentQuestions";

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
  /**
   * Server-side question detection result, computed against the FULL final
   * reply (not the truncated preview) at finish time. Lets the meeting
   * room render the ❓ banner + Option chips reliably even when the
   * question/options sit past the preview cutoff.
   */
  awaitingAnswer?: AgentQuestion;
  /**
   * Short live-activity hint while status === "running" — what the agent
   * is doing *right now* (latest text snippet, "ใช้ Bash", "กำลังคิด").
   * Lets the meeting room render "Lin: ⚙ ใช้ Edit" instead of an opaque
   * 3-minute spinner, so the user can tell long tasks apart from stuck
   * ones without clicking into the direct room.
   */
  currentActivity?: string;
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

  /** Update live activity on a running job and notify SSE subscribers.
   *  No-op if the job is already finished/errored/aborted. */
  progress(id: string, activity: string): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running") return;
    const next = activity.trim().slice(0, 140);
    if (job.currentActivity === next) return;
    job.currentActivity = next;
    this.emit({ type: "status", job });
  }

  finish(
    id: string,
    outcome:
      | {
          status: "done";
          resultPreview?: string;
          awaitingAnswer?: AgentQuestion;
        }
      | { status: "error"; errorMessage: string }
      | { status: "aborted" },
  ): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = outcome.status;
    job.finishedAt = Date.now();
    job.durationMs = job.finishedAt - job.startedAt;
    if (outcome.status === "done") {
      // Smart preview: keep an opening hint (~200 chars) AND the tail
      // (~800 chars) with a "…" gap. Agents put conclusions and
      // clarifying questions at the END of the reply (after tables,
      // option lists, recommendations) — a naïve head-only truncate
      // drops exactly the part the meeting room needs to surface as a
      // ❓ banner. Tail-bias guarantees the question survives even on
      // long replies (Alex's "Option A/B/C — แนะนำ X, จะเลือกไหน?"
      // pattern is ~1500-2500 chars).
      job.resultPreview = outcome.resultPreview
        ? smartPreview(outcome.resultPreview, 200, 800)
        : undefined;
      job.awaitingAnswer = outcome.awaitingAnswer;
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
 * Head-and-tail preview: short opening + full tail joined by "…". Used
 * because agents finalize with a question/recommendation at the END of
 * long replies, and a head-only truncate would drop it. We keep newlines
 * around the "…" so the front-end's markdown render gives the gap some
 * visual breathing room.
 */
function smartPreview(s: string, headChars: number, tailChars: number): string {
  if (!s) return "";
  // Collapse runs of spaces/tabs but PRESERVE newlines. The agent-question
  // parser anchors options to line boundaries ("**Option A — ...**\n"),
  // so flattening every \s into a single space would hide the structure
  // and make A/B/C chips silently disappear.
  const collapse = (x: string) => x.replace(/[ \t]+/g, " ");
  const t = collapse(s).trim();
  if (t.length <= headChars + tailChars + 3) return t;
  const head = t.slice(0, headChars).trim();
  const tail = t.slice(t.length - tailChars).trim();
  return `${head}\n…\n${tail}`;
}

/**
 * Module-level singleton. Next.js may HMR this in dev — store on globalThis
 * so we keep one registry across reloads (otherwise active jobs vanish on
 * code edit).
 *
 * When the class shape changes (e.g. we add `progress()` here), the
 * cached instance still points at the OLD prototype and would throw
 * "x is not a function" until a full restart. Re-linking the prototype
 * lets the cached instance pick up the new methods while preserving its
 * jobs map + listeners + in-flight aborts. Safe because the instance's
 * own fields are identical across versions — we only ever add methods.
 */
const KEY = Symbol.for("company-agent-core.jobRegistry");
type GlobalWithRegistry = typeof globalThis & { [KEY]?: JobRegistry };
const g = globalThis as GlobalWithRegistry;
const cached = g[KEY];
if (cached && !(cached instanceof JobRegistry)) {
  Object.setPrototypeOf(cached, JobRegistry.prototype);
}
export const jobRegistry: JobRegistry =
  cached ?? (g[KEY] = new JobRegistry());
