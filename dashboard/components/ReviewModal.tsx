"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { diffLines, diffWordsWithSpace } from "diff";

/* ---------- shared types (mirror lib/driveSync.ts) ---------- */

type CloudTarget = "sheets" | "drive_backup";

interface ReviewDiffFile {
  name: string;
  status: "added" | "removed" | "modified" | "unchanged";
  before_size: number;
  after_size: number;
  rows_before?: number;
  rows_after?: number;
  cloud_target: CloudTarget;
  cloud_url?: string;
  cloud_url_label?: string;
}

interface OutputReviewFile {
  path: string;
  name: string;
  mime: string;
  size: number;
  mtime: number;
  category: string;
  status: "new" | "modified";
  drive_url?: string;
}

export interface ReviewSummary {
  pending: boolean;
  checkpoint_snapshot_ts: string | null;
  created_at?: string;
  trigger?: string;
  files: ReviewDiffFile[];
  changed_count: number;
  outputs: OutputReviewFile[];
  outputs_pending_count: number;
  /** Drive root folder URL where uploads land — for an "open folder" button. */
  drive_root_url?: string;
}

interface ReviewPreview {
  name: string;
  status: "added" | "removed" | "modified" | "unchanged" | "missing";
  before: string | null;
  after: string | null;
  truncated: boolean;
  cloud_target?: CloudTarget;
  cloud_url?: string;
  cloud_url_label?: string;
}

/* ---------- ReviewBanner: sticky bar shown globally when pending ---------- */

export function ReviewBanner({
  review,
  onOpen,
}: {
  review: ReviewSummary;
  onOpen: () => void;
}) {
  if (!review.pending) return null;
  const data = review.changed_count;
  const outs = review.outputs_pending_count ?? 0;
  return (
    <div className="flex items-center gap-2 border-b border-warn/40 bg-warn/10 px-5 py-1.5 text-[11.5px]">
      <span className="text-warn">⚠</span>
      <span className="font-medium text-warn">
        {data > 0 && `data/ ${data} ไฟล์`}
        {data > 0 && outs > 0 && " · "}
        {outs > 0 && `outputs/ ${outs} ไฟล์`}
      </span>
      <span className="text-ink-dim">
        — รอ confirm ก่อนอัพขึ้นคลาวด์
      </span>
      <div className="flex-1" />
      <button
        onClick={onOpen}
        className="rounded-md border border-warn/50 bg-warn/15 px-2.5 py-1 text-[11px] font-medium text-warn hover:bg-warn/25"
      >
        ดู preview & confirm →
      </button>
    </div>
  );
}

/* ---------- ReviewModal: file list + diff + confirm-to-upload ---------- */

export function ReviewModal({
  open,
  review,
  onClose,
  onRefresh,
}: {
  open: boolean;
  review: ReviewSummary;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const changedFiles = useMemo(
    () => review.files.filter((f) => f.status !== "unchanged"),
    [review.files],
  );
  const outputs = review.outputs ?? [];

  /** Selected names from data/ side (filename, e.g. "employees.csv") */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Selected outputs/-relative paths (e.g. "content/launch.png") */
  const [selectedOutputs, setSelectedOutputs] = useState<Set<string>>(new Set());
  /** Active preview target — `{kind:"file"|"output", id}` */
  const [active, setActive] = useState<
    { kind: "file"; name: string } | { kind: "output"; path: string } | null
  >(null);
  const [preview, setPreview] = useState<ReviewPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingRevert, setConfirmingRevert] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ file: string; message: string }[]>([]);

  const activeFile = active?.kind === "file" ? active.name : null;
  const activeOutput =
    active?.kind === "output"
      ? outputs.find((o) => o.path === active.path)
      : undefined;

  // Default: every changed file is checked. Reset whenever the modal opens or
  // the file list changes.
  useEffect(() => {
    if (open) {
      setSelected(new Set(changedFiles.map((f) => f.name)));
      setSelectedOutputs(new Set(outputs.map((o) => o.path)));
      setActive((curr) => {
        if (
          curr?.kind === "file" &&
          changedFiles.some((f) => f.name === curr.name)
        )
          return curr;
        if (
          curr?.kind === "output" &&
          outputs.some((o) => o.path === curr.path)
        )
          return curr;
        if (changedFiles[0])
          return { kind: "file", name: changedFiles[0].name };
        if (outputs[0]) return { kind: "output", path: outputs[0].path };
        return null;
      });
      setErrors([]);
      setToast(null);
    }
  }, [open, changedFiles, outputs]);

  const [previewError, setPreviewError] = useState<string | null>(null);

  // Load preview when active file changes
  useEffect(() => {
    if (!open || !activeFile) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/data/review?file=${encodeURIComponent(activeFile)}`,
        );
        const ct = res.headers.get("content-type") || "";
        if (!res.ok || !ct.includes("json")) {
          const text = await res.text().catch(() => "");
          throw new Error(
            `HTTP ${res.status} — ${text.slice(0, 120) || "no body"}`,
          );
        }
        const data = (await res.json()) as ReviewPreview;
        if (!cancelled) setPreview(data);
      } catch (e) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError((e as Error).message);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, activeFile]);

  const toggleFile = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const toggleOutput = useCallback((p: string) => {
    setSelectedOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  const toggleAllFiles = useCallback(() => {
    setSelected((prev) =>
      prev.size === changedFiles.length
        ? new Set()
        : new Set(changedFiles.map((f) => f.name)),
    );
  }, [changedFiles]);

  const toggleAllOutputs = useCallback(() => {
    setSelectedOutputs((prev) =>
      prev.size === outputs.length
        ? new Set()
        : new Set(outputs.map((o) => o.path)),
    );
  }, [outputs]);

  const totalSelected = selected.size + selectedOutputs.size;
  const totalChanged = changedFiles.length + outputs.length;

  async function confirmUpload() {
    if (totalSelected === 0) {
      // Nothing selected → "accept without upload"
      setBusy(true);
      try {
        const res = await fetch("/api/data/review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "accept" }),
        });
        const data = await res.json();
        if (data.ok) {
          setToast("✓ ยอมรับการแก้ไขแล้ว (ไม่ได้อัพขึ้นคลาวด์)");
          onRefresh();
          setTimeout(onClose, 800);
        } else {
          setToast(data.error || "accept ล้มเหลว");
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    setErrors([]);
    try {
      const res = await fetch("/api/data/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          push_files: Array.from(selected),
          push_outputs: Array.from(selectedOutputs),
        }),
      });
      const data = await res.json();
      const pushed = data.pushed?.length ?? 0;
      if (data.ok) {
        setToast(`✓ อัพขึ้นคลาวด์สำเร็จ ${pushed} ไฟล์`);
        setErrors([]);
        onRefresh();
        setTimeout(onClose, 1200);
      } else {
        setToast(data.error || `อัพได้บางส่วน (${pushed} ไฟล์)`);
        if (Array.isArray(data.errors)) setErrors(data.errors);
      }
    } catch (e) {
      setToast(`เชื่อมต่อล้มเหลว: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function doRevert() {
    if (!confirmingRevert) {
      setConfirmingRevert(true);
      setTimeout(() => setConfirmingRevert(false), 4000);
      return;
    }
    setConfirmingRevert(false);
    setBusy(true);
    try {
      const res = await fetch("/api/data/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "revert" }),
      });
      const data = await res.json();
      if (data.ok) {
        setToast(`✓ ย้อนกลับเรียบร้อย — เขียนทับ ${data.restored ?? 0} ไฟล์`);
        onRefresh();
        setTimeout(onClose, 1000);
      } else {
        setToast(data.error || "revert ล้มเหลว");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink">
              🔍 Review การแก้ไขจาก AI
            </h2>
            <p className="text-[11px] text-ink-dim">
              data/ {changedFiles.length} ไฟล์ · outputs/ {outputs.length} ไฟล์
              {" — "}ติ๊กเพื่อเลือกที่จะอัพขึ้นคลาวด์
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {review.drive_root_url && (
              <a
                href={review.drive_root_url}
                target="_blank"
                rel="noopener noreferrer"
                title="เปิดโฟลเดอร์ปลายทางบน Google Drive ที่เก็บไฟล์ที่อัพแล้ว"
                className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/20"
              >
                ↗ เปิดโฟลเดอร์บน Drive
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded p-1 text-ink-dim hover:bg-surface-2 hover:text-ink"
              aria-label="close"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr]">
          {/* File list */}
          <aside className="flex min-h-0 flex-col border-r border-border bg-surface/30">
            <div className="flex-1 overflow-y-auto">
              {/* Section 1: data/ files */}
              <div className="border-b border-border">
                <div className="flex items-center justify-between bg-surface-2/30 px-3 py-1.5 text-[10.5px]">
                  <label className="flex cursor-pointer items-center gap-1.5 font-medium text-ink-dim">
                    <input
                      type="checkbox"
                      checked={
                        changedFiles.length > 0 &&
                        selected.size === changedFiles.length
                      }
                      onChange={toggleAllFiles}
                      disabled={changedFiles.length === 0}
                      className="h-3 w-3 accent-accent"
                    />
                    <span>📋 data/ ({changedFiles.length})</span>
                  </label>
                  <span className="text-ink-dim/70">
                    {selected.size}/{changedFiles.length}
                  </span>
                </div>
                <div className="p-1.5">
                  {changedFiles.length === 0 ? (
                    <p className="px-2 py-2 text-[10.5px] text-ink-dim/70">
                      ไม่มีไฟล์ data ที่เปลี่ยน
                    </p>
                  ) : (
                    changedFiles.map((f) => (
                      <FileRow
                        key={f.name}
                        file={f}
                        active={activeFile === f.name}
                        checked={selected.has(f.name)}
                        onCheck={() => toggleFile(f.name)}
                        onSelect={() =>
                          setActive({ kind: "file", name: f.name })
                        }
                        error={errors.find((e) => e.file === f.name)?.message}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Section 2: outputs/ files */}
              <div>
                <div className="flex items-center justify-between bg-surface-2/30 px-3 py-1.5 text-[10.5px]">
                  <label className="flex cursor-pointer items-center gap-1.5 font-medium text-ink-dim">
                    <input
                      type="checkbox"
                      checked={
                        outputs.length > 0 &&
                        selectedOutputs.size === outputs.length
                      }
                      onChange={toggleAllOutputs}
                      disabled={outputs.length === 0}
                      className="h-3 w-3 accent-accent"
                    />
                    <span>🖼 outputs/ ({outputs.length})</span>
                  </label>
                  <span className="text-ink-dim/70">
                    {selectedOutputs.size}/{outputs.length}
                  </span>
                </div>
                <div className="p-1.5">
                  {outputs.length === 0 ? (
                    <p className="px-2 py-2 text-[10.5px] text-ink-dim/70">
                      ไม่มี output ใหม่รอ upload
                    </p>
                  ) : (
                    outputs.map((o) => (
                      <OutputRow
                        key={o.path}
                        output={o}
                        active={active?.kind === "output" && active.path === o.path}
                        checked={selectedOutputs.has(o.path)}
                        onCheck={() => toggleOutput(o.path)}
                        onSelect={() =>
                          setActive({ kind: "output", path: o.path })
                        }
                        error={
                          errors.find((e) => e.file === `outputs/${o.path}`)
                            ?.message
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>

          {/* Diff preview */}
          <section className="min-h-0 overflow-hidden">
            {active?.kind === "file" ? (
              <DiffPreview
                file={active.name}
                preview={preview}
                loading={previewLoading}
                error={previewError}
              />
            ) : activeOutput ? (
              <OutputPreview output={activeOutput} />
            ) : (
              <div className="flex h-full items-center justify-center text-[12px] text-ink-dim">
                เลือกไฟล์ทางซ้ายเพื่อดู preview
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center gap-2 border-t border-border bg-surface/50 px-5 py-3">
          {toast && (
            <span
              className={[
                "rounded px-2 py-1 text-[11px]",
                toast.startsWith("✓")
                  ? "bg-ok/15 text-ok"
                  : "bg-danger/15 text-danger",
              ].join(" ")}
            >
              {toast}
            </span>
          )}
          <div className="flex-1" />
          <button
            onClick={doRevert}
            disabled={busy}
            className={[
              "rounded-md border px-3 py-1.5 text-[11.5px] font-medium disabled:opacity-40",
              confirmingRevert
                ? "border-warn bg-warn/15 text-warn"
                : "border-border bg-surface text-ink-dim hover:border-warn hover:text-warn",
            ].join(" ")}
          >
            {confirmingRevert
              ? "ยืนยัน? เขียนทับด้วย snapshot"
              : "↩ ย้อนกลับทั้งหมด"}
          </button>
          <button
            onClick={confirmUpload}
            disabled={busy || totalChanged === 0}
            className="rounded-md border border-ok/60 bg-ok/15 px-3.5 py-1.5 text-[11.5px] font-medium text-ok hover:bg-ok/25 disabled:opacity-40"
          >
            {busy
              ? "กำลังอัพ…"
              : totalSelected === 0
                ? "✓ ยอมรับ (ไม่อัพคลาวด์)"
                : `✓ อัพ ${totalSelected} ไฟล์ขึ้นคลาวด์`}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------- FileRow: one entry in the left list ---------- */

function FileRow({
  file,
  active,
  checked,
  onCheck,
  onSelect,
  error,
}: {
  file: ReviewDiffFile;
  active: boolean;
  checked: boolean;
  onCheck: () => void;
  onSelect: () => void;
  error?: string;
}) {
  return (
    <div
      onClick={onSelect}
      className={[
        "mb-1 flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-[11px]",
        active
          ? "bg-surface-2 ring-1 ring-accent/40"
          : "hover:bg-surface-2/60",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onCheck}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 h-3 w-3 accent-accent"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <code className="truncate text-ink">{file.name}</code>
          <StatusPill status={file.status} />
          {file.cloud_url && (
            <a
              href={file.cloud_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={
                file.cloud_url_label ?? "เปิดที่อยู่ปัจจุบันบน Drive ก่อนอัพ"
              }
              className="rounded border border-border bg-surface px-1 py-px text-[9px] text-ink-dim hover:border-accent hover:text-accent"
            >
              ↗ Drive
            </a>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-ink-dim">
          <CloudTargetLabel target={file.cloud_target} />
          <span>·</span>
          <span>{diffSummary(file)}</span>
        </div>
        {error && (
          <div className="mt-1 rounded bg-danger/15 px-1.5 py-0.5 text-[9.5px] text-danger">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- OutputRow: one entry in the outputs/ section of left list ---------- */

function OutputRow({
  output,
  active,
  checked,
  onCheck,
  onSelect,
  error,
}: {
  output: OutputReviewFile;
  active: boolean;
  checked: boolean;
  onCheck: () => void;
  onSelect: () => void;
  error?: string;
}) {
  const isImage = output.mime.startsWith("image/");
  return (
    <div
      onClick={onSelect}
      className={[
        "mb-1 flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-[11px]",
        active ? "bg-surface-2 ring-1 ring-accent/40" : "hover:bg-surface-2/60",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onCheck}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 h-3 w-3 accent-accent"
      />
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/outputs/file/${encodeURI(output.path)}`}
          alt=""
          className="h-8 w-8 shrink-0 rounded border border-border object-cover"
          loading="lazy"
        />
      ) : (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded border border-border bg-surface text-[14px]">
          {iconForMime(output.mime)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <code className="truncate text-ink">{output.name}</code>
          <span
            className={[
              "rounded px-1 py-px text-[9px] font-medium",
              output.status === "new"
                ? "bg-ok/15 text-ok"
                : "bg-warn/15 text-warn",
            ].join(" ")}
          >
            {output.status === "new" ? "ใหม่" : "แก้"}
          </span>
        </div>
        <div className="mt-0.5 text-[10px] text-ink-dim">
          <code className="text-ink-dim/80">{output.category}/</code> ·{" "}
          {fmtBytes(output.size)}
        </div>
        {error && (
          <div className="mt-1 rounded bg-danger/15 px-1.5 py-0.5 text-[9.5px] text-danger">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function iconForMime(mime: string): string {
  if (mime.startsWith("image/")) return "🖼";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime === "application/pdf") return "📄";
  if (mime.startsWith("text/")) return "📝";
  if (mime.includes("json")) return "{ }";
  if (mime.includes("csv") || mime.includes("excel")) return "📊";
  return "📦";
}

/* ---------- OutputPreview: right pane when an outputs/ row is active ---------- */

function OutputPreview({ output }: { output: OutputReviewFile }) {
  const src = `/api/outputs/file/${encodeURI(output.path)}`;
  const isImage = output.mime.startsWith("image/");
  const isPdf = output.mime === "application/pdf";
  const isVideo = output.mime.startsWith("video/");
  const isText =
    output.mime.startsWith("text/") ||
    output.mime.includes("json") ||
    output.mime.includes("csv") ||
    output.mime === "application/markdown" ||
    output.name.endsWith(".md");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface/50 px-3 py-2 text-[10.5px]">
        <code className="text-ink">outputs/{output.path}</code>
        <span
          className={[
            "rounded px-1.5 py-0.5 font-medium",
            output.status === "new"
              ? "bg-ok/15 text-ok"
              : "bg-warn/15 text-warn",
          ].join(" ")}
        >
          {output.status === "new" ? "ยังไม่เคยขึ้น Drive" : "ขึ้นแล้วแต่มีแก้"}
        </span>
        <span className="text-ink-dim">
          {fmtBytes(output.size)} · {output.mime}
        </span>
        <div className="flex-1" />
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent hover:bg-accent/20"
        >
          ↗ เปิดไฟล์ local
        </a>
        {output.drive_url && (
          <a
            href={output.drive_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-border bg-surface px-2 py-0.5 text-[10.5px] text-ink-dim hover:border-accent hover:text-accent"
          >
            ↗ ตัวเก่าบน Drive
          </a>
        )}
      </div>
      <div className="flex-1 overflow-auto bg-surface/20 p-4">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={output.name}
            className="mx-auto max-h-full max-w-full rounded border border-border object-contain shadow-lg"
          />
        ) : isPdf ? (
          <iframe
            src={src}
            className="h-full w-full rounded border border-border bg-white"
            title={output.name}
          />
        ) : isVideo ? (
          <video
            src={src}
            controls
            className="mx-auto max-h-full max-w-full rounded border border-border"
          />
        ) : isText ? (
          <TextOutputPreview src={src} mime={output.mime} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[11px] text-ink-dim">
            <span className="text-4xl">{iconForMime(output.mime)}</span>
            <p>ไม่มี preview สำหรับไฟล์ประเภทนี้</p>
            <p className="text-[10px]">
              กด &ldquo;↗ เปิดไฟล์ local&rdquo; เพื่อดูเนื้อหา
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TextOutputPreview({ src, mime }: { src: string; mime: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(src)
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) setText(t.slice(0, 64 * 1024)); // cap to 64KB
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);
  if (error)
    return <p className="text-[11px] text-danger">โหลดไม่ได้: {error}</p>;
  if (text === null)
    return <p className="text-[11px] text-ink-dim">กำลังโหลด…</p>;
  return (
    <pre className="whitespace-pre-wrap break-all rounded border border-border bg-bg px-3 py-2 font-mono text-[10.5px] text-ink">
      {text}
      {text.length === 64 * 1024 && (
        <span className="block pt-2 text-[10px] text-ink-dim">
          … (truncated to 64KB; ดูทั้งหมดที่ &ldquo;↗ เปิดไฟล์ local&rdquo;)
        </span>
      )}
    </pre>
  );
}

function StatusPill({ status }: { status: ReviewDiffFile["status"] }) {
  const map: Record<ReviewDiffFile["status"], { label: string; cls: string }> = {
    added: { label: "ใหม่", cls: "bg-ok/15 text-ok" },
    removed: { label: "ลบ", cls: "bg-danger/15 text-danger" },
    modified: { label: "แก้", cls: "bg-warn/15 text-warn" },
    unchanged: { label: "เหมือนเดิม", cls: "bg-surface-2 text-ink-dim" },
  };
  const m = map[status];
  return (
    <span className={`rounded px-1 py-px text-[9px] font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}

function CloudTargetLabel({ target }: { target: CloudTarget | undefined }) {
  if (target === "sheets") return <span>📊 Google Sheets</span>;
  if (target === "drive_backup") return <span>💾 Drive Backup</span>;
  return <span className="text-ink-dim/60">? (server เก่า)</span>;
}

function diffSummary(f: ReviewDiffFile): string {
  if (f.status === "added") {
    if (f.rows_after !== undefined) return `ใหม่ +${f.rows_after} แถว`;
    return `ใหม่ ${fmtBytes(f.after_size)}`;
  }
  if (f.status === "removed") {
    if (f.rows_before !== undefined) return `ลบทั้งไฟล์ -${f.rows_before} แถว`;
    return `ลบ ${fmtBytes(f.before_size)}`;
  }
  if (f.rows_before !== undefined && f.rows_after !== undefined) {
    const d = f.rows_after - f.rows_before;
    if (d === 0) return `แก้ค่าในแถว · ${fmtBytes(f.after_size)}`;
    if (d > 0) return `+${d} แถว · ${fmtBytes(f.after_size)}`;
    return `${d} แถว · ${fmtBytes(f.after_size)}`;
  }
  const delta = f.after_size - f.before_size;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${fmtBytes(delta)} · ${fmtBytes(f.after_size)}`;
}

function fmtBytes(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1024) return `${n}B`;
  if (abs < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

/* ---------- DiffPreview: side-by-side before/after ---------- */

function DiffPreview({
  file,
  preview,
  loading,
  error,
}: {
  file: string;
  preview: ReviewPreview | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-ink-dim">
        กำลังโหลด preview…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[11px] text-ink-dim">
        <span className="text-2xl">⚠️</span>
        <p className="font-medium text-danger">โหลด preview ไม่ได้</p>
        <code className="max-w-md whitespace-pre-wrap break-all rounded bg-danger/10 px-2 py-1 text-[10px] text-danger">
          {error}
        </code>
        <p className="text-ink-dim/80">
          ลอง restart dev server (เช่น <code>cd dashboard && npm run dev</code>)
          แล้ว reload หน้า
        </p>
      </div>
    );
  }
  if (!preview) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-ink-dim">
        โหลด preview ไม่ได้
      </div>
    );
  }

  return (
    <GitDiffPreview
      file={file}
      before={preview.before ?? ""}
      after={preview.after ?? ""}
      truncated={preview.truncated}
      cloudUrl={preview.cloud_url}
      cloudUrlLabel={preview.cloud_url_label}
    />
  );
}

/* ---------- GitDiffPreview: unified git-diff style for any text file ---------- */

interface DiffLine {
  /** "context" = unchanged, "del" = -, "add" = + */
  kind: "context" | "del" | "add";
  /** Original line number on the "before" side (undefined for add lines). */
  beforeNo?: number;
  /** Line number on the "after" side (undefined for del lines). */
  afterNo?: number;
  text: string;
  /** When this line is part of a del/add *pair* (modified), word-level segments. */
  wordParts?: { value: string; added?: boolean; removed?: boolean }[];
}

interface DiffHunk {
  beforeStart: number;
  beforeCount: number;
  afterStart: number;
  afterCount: number;
  lines: DiffLine[];
}

/** Context lines to keep around each hunk (git diff -U3 default). */
const CONTEXT_LINES = 3;

function buildHunks(before: string, after: string): {
  hunks: DiffHunk[];
  stats: { added: number; removed: number };
} {
  const changes = diffLines(before, after);

  // Flatten changes into a sequence of typed lines with synthesized line numbers
  const all: DiffLine[] = [];
  let beforeNo = 0;
  let afterNo = 0;
  let added = 0;
  let removed = 0;

  for (let ci = 0; ci < changes.length; ci++) {
    const ch = changes[ci];
    const lines = stripTrailingNewline(ch.value).split("\n");
    if (ch.added) {
      // Pair with the immediately-preceding "removed" block (if any) for
      // word-level intraline highlighting.
      const prev = changes[ci - 1];
      let perLineWordParts: DiffLine["wordParts"][] | null = null;
      if (prev && prev.removed) {
        const removedLines = stripTrailingNewline(prev.value).split("\n");
        perLineWordParts = lines.map((addLine, idx) => {
          const delLine = removedLines[idx] ?? "";
          return diffWordsWithSpace(delLine, addLine);
        });
        // Also annotate the just-pushed "del" lines with their counterpart parts
        const startIdx = all.length - removedLines.length;
        for (let k = 0; k < removedLines.length && k < lines.length; k++) {
          const delIdx = startIdx + k;
          if (delIdx >= 0 && all[delIdx]?.kind === "del") {
            all[delIdx].wordParts = diffWordsWithSpace(
              removedLines[k],
              lines[k],
            );
          }
        }
      }
      for (let i = 0; i < lines.length; i++) {
        afterNo++;
        added++;
        all.push({
          kind: "add",
          afterNo,
          text: lines[i],
          wordParts: perLineWordParts?.[i],
        });
      }
    } else if (ch.removed) {
      for (let i = 0; i < lines.length; i++) {
        beforeNo++;
        removed++;
        all.push({ kind: "del", beforeNo, text: lines[i] });
      }
    } else {
      for (let i = 0; i < lines.length; i++) {
        beforeNo++;
        afterNo++;
        all.push({ kind: "context", beforeNo, afterNo, text: lines[i] });
      }
    }
  }

  // Group into hunks: changed lines + CONTEXT_LINES of context on each side
  const isChange = (l: DiffLine) => l.kind !== "context";
  const hunks: DiffHunk[] = [];
  let i = 0;
  while (i < all.length) {
    // Skip context until next change
    while (i < all.length && !isChange(all[i])) i++;
    if (i >= all.length) break;
    // Walk back CONTEXT_LINES of context
    const start = Math.max(0, i - CONTEXT_LINES);
    // Find end of changed region (allow merging if gap < 2*CONTEXT)
    let j = i;
    while (j < all.length) {
      // Skip changes
      while (j < all.length && isChange(all[j])) j++;
      // Look ahead: if another change within 2*CONTEXT, keep going
      let lookAhead = j;
      let contextSeen = 0;
      while (
        lookAhead < all.length &&
        !isChange(all[lookAhead]) &&
        contextSeen < CONTEXT_LINES * 2
      ) {
        lookAhead++;
        contextSeen++;
      }
      if (lookAhead < all.length && isChange(all[lookAhead])) {
        j = lookAhead;
        continue;
      }
      break;
    }
    const end = Math.min(all.length, j + CONTEXT_LINES);
    const slice = all.slice(start, end);
    // Compute hunk header
    let firstBefore = 0;
    let firstAfter = 0;
    let beforeCount = 0;
    let afterCount = 0;
    for (const ln of slice) {
      if (ln.kind !== "add") {
        if (!firstBefore && ln.beforeNo) firstBefore = ln.beforeNo;
        beforeCount++;
      }
      if (ln.kind !== "del") {
        if (!firstAfter && ln.afterNo) firstAfter = ln.afterNo;
        afterCount++;
      }
    }
    hunks.push({
      beforeStart: firstBefore || 1,
      beforeCount,
      afterStart: firstAfter || 1,
      afterCount,
      lines: slice,
    });
    i = end;
  }

  return { hunks, stats: { added, removed } };
}

function stripTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s.slice(0, -1) : s;
}

function GitDiffPreview({
  file,
  before,
  after,
  truncated,
  cloudUrl,
  cloudUrlLabel,
}: {
  file: string;
  before: string;
  after: string;
  truncated: boolean;
  cloudUrl?: string;
  cloudUrlLabel?: string;
}) {
  const { hunks, stats } = useMemo(
    () => buildHunks(before, after),
    [before, after],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface/50 px-3 py-2 text-[10.5px]">
        <code className="text-ink">{file}</code>
        {stats.removed > 0 && (
          <span className="rounded bg-danger/15 px-1.5 py-0.5 font-medium text-danger">
            −{stats.removed}
          </span>
        )}
        {stats.added > 0 && (
          <span className="rounded bg-ok/15 px-1.5 py-0.5 font-medium text-ok">
            +{stats.added}
          </span>
        )}
        {stats.removed === 0 && stats.added === 0 && (
          <span className="text-ink-dim">ไม่มีการเปลี่ยนแปลง</span>
        )}
        <div className="flex-1" />
        {cloudUrl && (
          <a
            href={cloudUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent hover:bg-accent/20"
            title={cloudUrlLabel ?? "เปิดที่อยู่ปัจจุบันบน Drive"}
          >
            ↗ {cloudUrlLabel ?? "เปิด Drive"}
          </a>
        )}
        {truncated && (
          <span className="text-ink-dim/80">ตัดแสดง 32KB แรก</span>
        )}
      </div>
      <div className="flex-1 overflow-auto font-mono text-[10.5px] leading-relaxed">
        {hunks.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] text-ink-dim">
            (เนื้อหาเหมือนเดิม)
          </p>
        ) : (
          hunks.map((h, hi) => <Hunk key={hi} hunk={h} />)
        )}
      </div>
    </div>
  );
}

function Hunk({ hunk }: { hunk: DiffHunk }) {
  return (
    <div className="border-b border-border/40">
      <div className="border-y border-accent/30 bg-accent/10 px-3 py-1 text-[10px] text-accent/90">
        @@ -{hunk.beforeStart},{hunk.beforeCount} +{hunk.afterStart},{hunk.afterCount} @@
      </div>
      {hunk.lines.map((ln, i) => (
        <DiffLineRow key={i} line={ln} />
      ))}
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const bg =
    line.kind === "del"
      ? "bg-danger/10"
      : line.kind === "add"
        ? "bg-ok/10"
        : "";
  const sign = line.kind === "del" ? "−" : line.kind === "add" ? "+" : " ";
  const signCls =
    line.kind === "del"
      ? "text-danger"
      : line.kind === "add"
        ? "text-ok"
        : "text-ink-dim/40";
  return (
    <div className={`flex ${bg}`}>
      <span className="w-10 shrink-0 select-none border-r border-border/20 px-1 py-0.5 text-right text-[9.5px] text-ink-dim/60">
        {line.beforeNo ?? ""}
      </span>
      <span className="w-10 shrink-0 select-none border-r border-border/20 px-1 py-0.5 text-right text-[9.5px] text-ink-dim/60">
        {line.afterNo ?? ""}
      </span>
      <span
        className={`w-5 shrink-0 select-none px-1 py-0.5 text-center font-bold ${signCls}`}
      >
        {sign}
      </span>
      <span className="flex-1 whitespace-pre-wrap break-all px-2 py-0.5 text-ink">
        {line.wordParts ? (
          line.wordParts.map((p, i) =>
            line.kind === "del" && p.added ? null : line.kind === "add" &&
              p.removed ? null : (
              <span
                key={i}
                className={
                  p.added
                    ? "rounded bg-ok/35 text-ink"
                    : p.removed
                      ? "rounded bg-danger/35 text-ink line-through"
                      : ""
                }
              >
                {p.value}
              </span>
            ),
          )
        ) : (
          <>{line.text}</>
        )}
      </span>
    </div>
  );
}

