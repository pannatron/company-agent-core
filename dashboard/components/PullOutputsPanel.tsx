"use client";

import { useCallback, useState } from "react";

interface PullFile {
  path: string;
  filename: string;
  file_id: string;
  size: number;
  status: "missing" | "size_diff";
}

interface PullReview {
  ok: boolean;
  files: PullFile[];
  junk_skipped: number;
  synced: number;
  error?: string;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Reverse-pull panel: ask Drive what media this server is missing, let the user
 * tick which to download, then pull them into local outputs/. Self-contained —
 * owns its own fetch/state so FilesView doesn't need extra props.
 */
export default function PullOutputsPanel() {
  const [review, setReview] = useState<PullReview | null>(null);
  const [checking, setChecking] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    setToast(null);
    try {
      const res = await fetch("/api/outputs/pull");
      const data = (await res.json()) as PullReview;
      if (!res.ok || !data.ok) {
        setReview(null);
        setToast(`✗ ${data.error || `HTTP ${res.status}`}`);
        return;
      }
      setReview(data);
      setSelected(new Set(data.files.map((f) => f.file_id))); // default: all ticked
      if (data.files.length === 0) {
        setToast(
          `✓ ครบแล้ว — ไม่มีไฟล์ต้องดึง (sync ${data.synced} · กรองขยะ ${data.junk_skipped})`,
        );
      }
    } catch (e) {
      setReview(null);
      setToast(`✗ ${(e as Error).message}`);
    } finally {
      setChecking(false);
    }
  }, []);

  const pull = useCallback(async () => {
    if (selected.size === 0) return;
    setPulling(true);
    setToast(null);
    try {
      const res = await fetch("/api/outputs/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file_ids: [...selected] }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        pulled?: string[];
        errors?: { file: string; message: string }[];
        error?: string;
      };
      if (!res.ok || data.error) {
        setToast(`✗ ${data.error || `HTTP ${res.status}`}`);
        return;
      }
      const n = data.pulled?.length ?? 0;
      const e = data.errors?.length ?? 0;
      setToast(
        e > 0
          ? `ดึงสำเร็จ ${n} · ล้มเหลว ${e} — ${data.errors?.[0]?.message ?? ""}`
          : `✓ ดึงสำเร็จ ${n} ไฟล์`,
      );
      await check(); // refresh — pulled files drop out of the list
    } catch (e) {
      setToast(`✗ ${(e as Error).message}`);
    } finally {
      setPulling(false);
    }
  }, [selected, check]);

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalBytes =
    review?.files
      .filter((f) => selected.has(f.file_id))
      .reduce((s, f) => s + f.size, 0) ?? 0;

  return (
    <div className="border-b border-border bg-surface/40 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-ink">⬇ Pull รูป/วิดีโอ จาก Drive</h3>
          <p className="text-[11px] text-ink-dim">
            ดึงไฟล์ outputs/ ที่อยู่บน Drive แต่เครื่องนี้ยังไม่มี (เทียบจากโครงสร้างโฟลเดอร์บน Drive)
          </p>
        </div>
        <button
          onClick={check}
          disabled={checking || pulling}
          className="shrink-0 rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
        >
          {checking ? "กำลังเช็ค…" : "🔍 เช็คว่ามีอะไรให้ดึง"}
        </button>
      </div>

      {toast && (
        <p className="mt-2 rounded-md bg-surface px-2.5 py-1.5 text-[11px] text-ink-dim">
          {toast}
        </p>
      )}

      {review && review.files.length > 0 && (
        <div className="mt-2">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-dim">
            <span>
              พบ {review.files.length} ไฟล์ให้ดึง · กรองขยะ {review.junk_skipped} ·
              sync แล้ว {review.synced}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setSelected(new Set(review.files.map((f) => f.file_id)))
                }
                className="text-accent hover:underline"
              >
                เลือกหมด
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-ink-dim hover:underline"
              >
                ล้าง
              </button>
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-surface">
            {review.files.map((f) => (
              <label
                key={f.file_id}
                className="flex cursor-pointer items-center gap-2 border-b border-border/50 px-2.5 py-1.5 text-[11px] last:border-0 hover:bg-surface/60"
              >
                <input
                  type="checkbox"
                  checked={selected.has(f.file_id)}
                  onChange={() => toggle(f.file_id)}
                  className="accent-indigo-500"
                />
                <span className="flex-1 truncate text-ink" title={f.path}>
                  {f.path}
                </span>
                <span
                  className={
                    f.status === "missing"
                      ? "shrink-0 rounded bg-amber-500/15 px-1.5 text-amber-500"
                      : "shrink-0 rounded bg-sky-500/15 px-1.5 text-sky-500"
                  }
                >
                  {f.status === "missing" ? "ขาด" : "ขนาดต่าง"}
                </span>
                <span className="shrink-0 text-ink-dim">{fmtSize(f.size)}</span>
              </label>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-ink-dim">
              เลือก {selected.size} ไฟล์ · {fmtSize(totalBytes)}
            </span>
            <button
              onClick={pull}
              disabled={pulling || selected.size === 0}
              className="rounded-md border border-accent bg-accent/10 px-3 py-1 text-[11px] font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              {pulling ? "กำลังดึง…" : `⬇ ดึงที่เลือก (${selected.size})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
