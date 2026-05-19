"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const LS_KEY = "company-agent-core:auto-sync";

interface AutoSyncResult {
  /** uploads counted in /api/drive/sync */
  outputs?: number;
  /** topics pushed to Sheets */
  sheets?: number;
  errors: { source: "drive" | "sheets"; message: string }[];
}

/**
 * Auto-sync toggle for chat UIs. When enabled, calling `runSync()` after each
 * agent turn pushes outputs/ → Drive and CSVs → Sheets in parallel.
 *
 * State persists across sessions via localStorage.
 */
export function useAutoSync() {
  const [enabled, setEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<AutoSyncResult | null>(null);
  /** Most recent sync run id — used to discard stale results when a newer run finishes first */
  const runIdRef = useRef(0);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (raw === "1") setEnabled(true);
    } catch {
      /* SSR / disabled storage */
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(LS_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const runSync = useCallback(async (): Promise<AutoSyncResult | null> => {
    if (!enabled) return null;
    const runId = ++runIdRef.current;
    setSyncing(true);
    try {
      const [driveRes, sheetsRes] = await Promise.allSettled([
        fetch("/api/drive/sync", { method: "POST" }).then((r) =>
          r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || `HTTP ${r.status}`)),
        ),
        fetch("/api/sheets/push", { method: "POST" }).then((r) =>
          r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || `HTTP ${r.status}`)),
        ),
      ]);

      const result: AutoSyncResult = { errors: [] };
      if (driveRes.status === "fulfilled") {
        const d = driveRes.value as {
          uploaded?: number;
          updated?: number;
          errors?: { file: string; message: string }[];
        };
        result.outputs = (d.uploaded ?? 0) + (d.updated ?? 0);
        for (const err of d.errors ?? []) {
          result.errors.push({ source: "drive", message: `${err.file}: ${err.message}` });
        }
      } else {
        result.errors.push({ source: "drive", message: String(driveRes.reason) });
      }
      if (sheetsRes.status === "fulfilled") {
        const s = sheetsRes.value as {
          pushed?: { id: string }[];
          errors?: { id: string; message: string }[];
        };
        result.sheets = s.pushed?.length ?? 0;
        for (const err of s.errors ?? []) {
          result.errors.push({ source: "sheets", message: `${err.id}: ${err.message}` });
        }
      } else {
        result.errors.push({ source: "sheets", message: String(sheetsRes.reason) });
      }

      // Discard if a newer sync already finished
      if (runId === runIdRef.current) setLastResult(result);
      return result;
    } finally {
      if (runId === runIdRef.current) setSyncing(false);
    }
  }, [enabled]);

  return { enabled, toggle, runSync, syncing, lastResult };
}

/** Short single-line summary of a sync result, for toast display. */
export function summarizeAutoSync(r: AutoSyncResult): string {
  const parts: string[] = [];
  if (r.outputs != null) parts.push(`Drive ${r.outputs}`);
  if (r.sheets != null) parts.push(`Sheets ${r.sheets}`);
  let msg = `🔄 auto-sync: ${parts.join(" · ") || "ไม่มีไฟล์เปลี่ยน"}`;
  if (r.errors.length > 0) msg += ` (error ${r.errors.length})`;
  return msg;
}
