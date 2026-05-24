"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentQuestion } from "./agentQuestions";

/**
 * Client-side mirror of JobRecord (kept in sync manually — server type lives
 * in lib/jobQueue.ts; this file must stay browser-safe so we redeclare).
 */
export interface ClientJob {
  id: string;
  chatId: string;
  employeeSlug: string;
  employeeName: string;
  employeeAccent?: string;
  prompt: string;
  status: "queued" | "running" | "done" | "error" | "aborted";
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  resultPreview?: string;
  /** Server-side question detection — set when the agent's final reply is a
   *  clarifying question / multi-choice question. The meeting room renders
   *  the ❓ banner + Option chips from this when present, falling back to
   *  scanning the truncated preview otherwise. */
  awaitingAnswer?: AgentQuestion;
  /** Live activity hint while running: latest text snippet, "ใช้ Bash",
   *  "กำลังคิด…". Rendered under the spinner so the user can tell a
   *  3-minute genuine task apart from a stuck one. */
  currentActivity?: string;
  errorMessage?: string;
}

type ServerEvent =
  | { type: "started"; job: ClientJob }
  | { type: "status"; job: ClientJob }
  | { type: "finished"; job: ClientJob }
  | { type: "snapshot"; jobs: ClientJob[] };

interface Options {
  /** Callback fired exactly once when a job finishes in any room. */
  onFinish?: (job: ClientJob) => void;
  /** When provided, scope `active` and `recent` getters to this chatId. */
  scopeChatId?: string;
}

/**
 * Subscribe to /api/jobs/stream (SSE) and expose a live job list.
 *
 * Reconnects with exponential backoff if the connection drops. Listeners
 * are stable (refs) so re-renders don't break the subscription.
 */
export function useJobStream(opts: Options = {}) {
  const [jobs, setJobs] = useState<Record<string, ClientJob>>({});
  const [connected, setConnected] = useState(false);
  const onFinishRef = useRef(opts.onFinish);
  const seenFinishedRef = useRef<Set<string>>(new Set());
  onFinishRef.current = opts.onFinish;

  useEffect(() => {
    let es: EventSource | null = null;
    let retry = 0;
    let cancelled = false;

    const connect = () => {
      es = new EventSource("/api/jobs/stream");
      es.onopen = () => {
        setConnected(true);
        retry = 0;
      };
      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data) as ServerEvent;
          if (evt.type === "snapshot") {
            const map: Record<string, ClientJob> = {};
            for (const j of evt.jobs) map[j.id] = j;
            setJobs(map);
            for (const j of evt.jobs) {
              if (j.status !== "queued" && j.status !== "running") {
                seenFinishedRef.current.add(j.id);
              }
            }
          } else {
            setJobs((cur) => ({ ...cur, [evt.job.id]: evt.job }));
            if (
              evt.type === "finished" &&
              !seenFinishedRef.current.has(evt.job.id)
            ) {
              seenFinishedRef.current.add(evt.job.id);
              onFinishRef.current?.(evt.job);
            }
          }
        } catch {
          /* malformed event — skip */
        }
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        if (cancelled) return;
        const delay = Math.min(15_000, 500 * 2 ** retry);
        retry += 1;
        setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, []);

  // Memoize derived arrays so consumers (e.g. MeetingRoom's task board)
  // don't see a new identity on every render — that would cascade through
  // their useEffect/useMemo deps and, in extreme cases, loop infinitely.
  const scopeChatId = opts.scopeChatId;
  const list = useMemo(
    () => Object.values(jobs).sort((a, b) => b.startedAt - a.startedAt),
    [jobs],
  );
  const scoped = useMemo(
    () => (scopeChatId ? list.filter((j) => j.chatId === scopeChatId) : list),
    [list, scopeChatId],
  );
  const active = useMemo(
    () =>
      scoped.filter((j) => j.status === "queued" || j.status === "running"),
    [scoped],
  );
  const recent = useMemo(
    () =>
      scoped.filter(
        (j) => j.status === "done" || j.status === "error" || j.status === "aborted",
      ),
    [scoped],
  );

  return { connected, all: list, active, recent };
}

export async function abortJob(id: string): Promise<boolean> {
  const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
  return res.ok;
}
