"use client";

import { useCallback, useEffect, useState } from "react";

interface TopicStatus {
  id: string;
  label: string;
  folder: string;
  filename: string;
  tab: string;
  localFile: string;
  exists_on_drive: boolean;
  workbook_url?: string;
  drive_rows?: number;
  drive_updated_at?: string;
  local_exists: boolean;
  local_rows?: number;
  pulled_at?: string;
  pushed_at?: string;
}

interface SheetsStatus {
  connected: boolean;
  reason?: string;
  root_url?: string;
  script_version?: string;
  needs_v5_upgrade: boolean;
  topics: TopicStatus[];
}

interface PullPushResult {
  pulled?: { id: string; rows: number }[];
  pushed?: { id: string; rows: number }[];
  created?: string[];
  existed?: string[];
  pushed_rows?: number;
  errors: { id: string; message: string }[];
}

export default function SheetsPanel() {
  const [status, setStatus] = useState<SheetsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<{
    open: boolean;
    script: string;
    copied: boolean;
  }>({ open: false, script: "", copied: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/sheets/status");
      setStatus((await r.json()) as SheetsStatus);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openUpgrade() {
    setUpgrade({ open: true, script: "กำลังโหลด…", copied: false });
    try {
      const r = await fetch("/api/drive/config");
      const d = (await r.json()) as { apps_script: string };
      setUpgrade({ open: true, script: d.apps_script, copied: false });
    } catch (e) {
      setUpgrade({
        open: true,
        script: `// โหลดสคริปต์ไม่ได้: ${(e as Error).message}`,
        copied: false,
      });
    }
  }

  async function copyUpgradeScript() {
    try {
      await navigator.clipboard.writeText(upgrade.script);
      setUpgrade((u) => ({ ...u, copied: true }));
      setTimeout(() => setUpgrade((u) => ({ ...u, copied: false })), 2000);
    } catch {
      /* ignore */
    }
  }

  async function callAction(path: string, label: string, body?: object) {
    setBusy(label);
    setToast(null);
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await r.json()) as PullPushResult & { error?: string };
      if (!r.ok || data.error) {
        setToast(`✗ ${data.error || `HTTP ${r.status}`}`);
      } else {
        const errN = data.errors?.length ?? 0;
        let msg = `✓ ${label} สำเร็จ`;
        if (data.created || data.existed || data.pushed_rows != null) {
          // init response
          const newCount = data.created?.length ?? 0;
          const existCount = data.existed?.length ?? 0;
          msg += ` — สร้างใหม่ ${newCount}, มีอยู่แล้ว ${existCount}, ส่งข้อมูล ${data.pushed_rows ?? 0} rows`;
        } else {
          const ok = (data.pulled?.length ?? 0) + (data.pushed?.length ?? 0);
          msg += ` — ${ok} หัวข้อ`;
        }
        if (errN) msg += `, error ${errN}`;
        setToast(msg);
      }
      await load();
    } catch (e) {
      setToast(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const initAll = () => callAction("/api/sheets/init", "Init");
  const pullAll = () => callAction("/api/sheets/pull", "Pull ทั้งหมด");
  const pushAll = () => callAction("/api/sheets/push", "Push ทั้งหมด");
  const pullOne = (id: string) =>
    callAction("/api/sheets/pull", `Pull ${id}`, { topic: id });
  const pushOne = (id: string) =>
    callAction("/api/sheets/push", `Push ${id}`, { topic: id });

  if (loading) {
    return (
      <div className="border-b border-border bg-surface/30 px-5 py-3 text-xs text-ink-dim">
        กำลังโหลดสถานะ Sheets…
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="border-b border-border bg-surface/30 px-5 py-3 text-xs text-ink-dim">
        📊 Google Sheets sync — เชื่อม Drive ก่อนถึงจะใช้ได้
      </div>
    );
  }

  // Apps Script ที่ deploy ยังเป็น v4 หรือเก่ากว่า — ต้อง paste โค้ดใหม่ทับก่อน
  if (status.needs_v5_upgrade) {
    return (
      <section className="border-b border-amber-500/40 bg-amber-500/10 px-5 py-4">
        <h3 className="text-sm font-semibold text-amber-200">
          ⚠ Apps Script ของคุณยังเป็น v{status.script_version || "?"} — ต้องอัปเป็น v5
        </h3>
        <p className="mt-1 text-[11px] text-amber-100/80">
          v5 เพิ่ม action <code>init_sheet / read_sheet / write_sheet</code> ที่ Sheets sync ใช้
          — ของเดิมเลยขึ้น <code>unknown action: write_sheet</code>
        </p>

        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[11.5px] text-amber-50/90">
          <li>กด &ldquo;ก๊อปสคริปต์ v5&rdquo; ด้านล่าง</li>
          <li>
            เปิด{" "}
            <a
              href="https://script.google.com"
              target="_blank"
              rel="noreferrer"
              className="underline text-amber-200"
            >
              script.google.com
            </a>{" "}
            → โปรเจ็กเดิมที่เชื่อมอยู่
          </li>
          <li>
            เลือกโค้ดทั้งหมด (<kbd className="rounded bg-bg/40 px-1">Cmd/Ctrl+A</kbd>) → ลบ → วางโค้ดที่ก๊อป → เซฟ
          </li>
          <li className="text-amber-100">
            <strong className="text-amber-50">⚠ ห้ามข้าม:</strong>{" "}
            เมนูบนสุด → <strong>Select function: authorize</strong> → กด ▶ Run →{" "}
            Google จะขอสิทธิ์ Sheets เพิ่ม → <strong>Allow</strong>
            <br />
            <span className="text-amber-200/70">
              (ถ้าข้าม จะเจอ &ldquo;ไม่ได้รับอนุญาตให้เรียกใช้ SpreadsheetApp.create&rdquo;)
            </span>
          </li>
          <li>
            Deploy → <strong>Manage deployments</strong> → ✏️ → Version: <strong>New version</strong>{" "}
            → Deploy (URL เดิม /exec ใช้ต่อได้)
          </li>
          <li>กลับมาที่หน้านี้ → กด 🔄 รีโหลด — ถ้าเป็น v5 แล้วจะหายเตือน</li>
        </ol>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={openUpgrade}
            className="rounded-md border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 text-[11.5px] text-amber-50 hover:border-amber-300"
          >
            📋 ก๊อปสคริปต์ v5
          </button>
          <button
            onClick={load}
            className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] text-ink-dim hover:border-accent hover:text-ink"
          >
            🔄 รีโหลดสถานะ
          </button>
        </div>

        {upgrade.open && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => setUpgrade((u) => ({ ...u, open: false }))}
          >
            <div
              className="relative w-full max-w-3xl rounded-2xl border border-border bg-bg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                <h2 className="text-base font-semibold text-ink">
                  Apps Script v5 — paste ทับโค้ดเดิม
                </h2>
                <button
                  onClick={() => setUpgrade((u) => ({ ...u, open: false }))}
                  className="rounded p-1 text-ink-dim hover:bg-surface-2 hover:text-ink"
                >
                  ✕
                </button>
              </header>
              <div className="p-5">
                <div className="relative">
                  <button
                    onClick={copyUpgradeScript}
                    className="absolute right-2 top-2 z-10 rounded-md border border-border bg-bg/90 px-2 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink"
                  >
                    {upgrade.copied ? "✓ ก๊อปแล้ว" : "ก๊อปทั้งหมด"}
                  </button>
                  <textarea
                    readOnly
                    value={upgrade.script}
                    className="h-[60vh] w-full resize-none rounded-lg border border-border bg-surface-2 p-3 font-mono text-[11px] text-ink"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  const initialized = status.topics.some((t) => t.exists_on_drive);

  return (
    <section className="border-b border-border bg-surface/30 px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            📊 Google Sheets (source of truth)
          </h3>
          <p className="mt-0.5 text-[11px] text-ink-dim">
            CSV ใน <code className="text-ink/80">data/</code>{" "}
            เป็น cache — pull ก่อนอ่าน, push หลังแก้
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={initAll}
            disabled={busy !== null}
            className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] text-ink hover:border-accent disabled:opacity-50"
            title="สร้าง Sheets ทุกหัวข้อ (ถ้ายังไม่มี) แล้ว push ข้อมูล CSV ปัจจุบันขึ้นไปด้วย"
          >
            {busy === "Init"
              ? "กำลัง setup…"
              : initialized
                ? "🔧 Setup ซ้ำ (sync ข้อมูลล่าสุด)"
                : "🚀 Setup ทุกหัวข้อ + ส่งข้อมูล"}
          </button>
          <button
            onClick={pullAll}
            disabled={busy !== null}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
            title="อ่านจาก Sheets → เขียนทับ CSV ทุกตัวใน data/"
          >
            {busy?.startsWith("Pull") ? "⬇ กำลังดึง…" : "⬇ Pull ทั้งหมด"}
          </button>
          <button
            onClick={pushAll}
            disabled={busy !== null}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
            title="อ่าน CSV ใน data/ → เขียนทับ Sheets ทุกหัวข้อ"
          >
            {busy?.startsWith("Push") ? "⬆ กำลังส่ง…" : "⬆ Push ทั้งหมด"}
          </button>
          <button
            onClick={load}
            className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink"
            title="รีโหลดสถานะ"
          >
            🔄
          </button>
        </div>
      </div>

      {toast && (
        <p
          className={`mt-2 text-[11px] ${
            toast.startsWith("✓") ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {toast}
        </p>
      )}

      <div className="mt-3 grid grid-cols-1 gap-1.5 md:grid-cols-2">
        {status.topics.map((t) => (
          <TopicRow
            key={t.id}
            t={t}
            busy={busy}
            onPull={() => pullOne(t.id)}
            onPush={() => pushOne(t.id)}
          />
        ))}
      </div>
    </section>
  );
}

function TopicRow({
  t,
  busy,
  onPull,
  onPush,
}: {
  t: TopicStatus;
  busy: string | null;
  onPull: () => void;
  onPush: () => void;
}) {
  const last =
    t.pulled_at && t.pushed_at
      ? t.pulled_at > t.pushed_at
        ? `pulled ${shortTime(t.pulled_at)}`
        : `pushed ${shortTime(t.pushed_at)}`
      : t.pulled_at
        ? `pulled ${shortTime(t.pulled_at)}`
        : t.pushed_at
          ? `pushed ${shortTime(t.pushed_at)}`
          : "ยังไม่เคย sync";

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-surface/50 px-2.5 py-1.5 text-[11px]">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">
          <span className="text-ink-dim">{t.folder}/</span>
          {t.filename}
          {t.workbook_url && (
            <a
              href={t.workbook_url}
              target="_blank"
              rel="noreferrer"
              className="ml-1.5 text-accent hover:underline"
            >
              ↗
            </a>
          )}
        </p>
        <p className="truncate text-[10px] text-ink-dim">
          <span>
            cloud:{" "}
            {t.exists_on_drive
              ? `${t.drive_rows ?? "?"} rows`
              : "ยังไม่มี"}
          </span>
          {" · "}
          <span>
            local:{" "}
            {t.local_exists ? `${t.local_rows ?? 0} rows` : "ไม่มี"}
          </span>
          {" · "}
          <span>{last}</span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onPull}
          disabled={busy !== null || !t.exists_on_drive}
          className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-40"
          title="ดึงจาก Sheets → CSV"
        >
          ⬇
        </button>
        <button
          onClick={onPush}
          disabled={busy !== null || !t.local_exists}
          className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-40"
          title="ส่งจาก CSV → Sheets"
        >
          ⬆
        </button>
      </div>
    </div>
  );
}

function shortTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return iso;
  }
}
