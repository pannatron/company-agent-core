"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const LS_KEY = "company-agent-core:auto-sync";

interface AutoSyncResult {
  /** uploads counted in /api/drive/sync */
  outputs?: number;
  /** topics pushed to Sheets */
  sheets?: number;
  /** rows pushed to the social-posts Sheet */
  social?: number;
  errors: { source: "drive" | "sheets" | "social"; message: string }[];
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
      // BUG-005: Drive sync MUST finish before pushing social posts, because
      // social push reads .drive-state.json to attach asset_drive_id to each
      // row. If they run in parallel, a brand-new image file lands on Drive
      // *after* social push reads the state, so the row ships with an empty
      // asset_drive_id and Apps Script falls back to text-only.
      const driveRes = await Promise.allSettled([
        fetch("/api/drive/sync", { method: "POST" }).then((r) =>
          r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || `HTTP ${r.status}`)),
        ),
      ]).then((arr) => arr[0]);

      const [sheetsRes, socialRes] = await Promise.allSettled([
        fetch("/api/sheets/push", { method: "POST" }).then((r) =>
          r.ok ? r.json() : r.json().then((j) => Promise.reject(j.error || `HTTP ${r.status}`)),
        ),
        // BUG-001 — push social-posts.json along with the CSV topics so agents
        // never leave the Sheet stale after editing data/social-posts.json.
        fetch("/api/social/sheet/push", { method: "POST" }).then((r) =>
          r.ok
            ? r.json()
            : r.json().then((j) => {
                const issues = Array.isArray(j.issues)
                  ? ` (${j.issues.length} validation issue${j.issues.length === 1 ? "" : "s"})`
                  : "";
                return Promise.reject(`${j.error || `HTTP ${r.status}`}${issues}`);
              }),
        ),
      ]);

      const result: AutoSyncResult = { errors: [] };
      if (driveRes.status === "fulfilled") {
        const d = driveRes.value as {
          uploaded?: number | unknown[];
          updated?: number | unknown[];
          errors?: { file: string; message: string }[];
        };
        const countOf = (v: number | unknown[] | undefined): number =>
          Array.isArray(v) ? v.length : v ?? 0;
        result.outputs = countOf(d.uploaded) + countOf(d.updated);
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
      if (socialRes.status === "fulfilled") {
        const s = socialRes.value as { rows?: number };
        result.social = s.rows ?? 0;
      } else {
        result.errors.push({ source: "social", message: String(socialRes.reason) });
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
  if (r.social != null) parts.push(`Social ${r.social}`);
  let msg = `🔄 auto-sync: ${parts.join(" · ") || "ไม่มีไฟล์เปลี่ยน"}`;
  if (r.errors.length > 0) msg += ` (error ${r.errors.length})`;
  return msg;
}
