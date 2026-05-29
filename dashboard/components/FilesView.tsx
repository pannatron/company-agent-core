"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SetupDriveModal from "./SetupDriveModal";
import SheetsPanel from "./SheetsPanel";

interface OutputFile {
  path: string;
  name: string;
  size: number;
  mtime: number;
  mimeType: string;
  category: string;
  synced?: boolean;
  web_link?: string;
}

interface CategoryMeta {
  id: string;
  label: string;
  icon: string;
  description: string;
}

interface DriveStatus {
  connected: boolean;
  userEmail?: string;
  rootFolderUrl?: string;
  rootFolderName?: string;
  configuredAt?: string;
  lastSync?: string;
  fileCount?: number;
  reason?: string;
}

interface SyncFileEntry {
  file: string;
  drive_id?: string;
  url?: string;
  reason?: string;
}

interface SyncResult {
  uploaded: SyncFileEntry[];
  updated: SyncFileEntry[];
  skipped: SyncFileEntry[];
  errors: { file: string; message: string }[];
}

interface BackupStatus {
  ok: boolean;
  last_backup_at?: string;
  file_count_on_drive?: number;
  folder_url?: string;
  reason?: string;
}

interface ProtectedFile {
  file: string;
  reason: "empty" | "header_only" | "shrink";
  local_size: number;
  drive_size?: number;
  detail: string;
}

interface Snapshot {
  timestamp: string;
  reason: "before_backup" | "before_restore" | "before_ai" | "manual";
  files: { name: string; size: number }[];
  total_size: number;
}

export default function FilesView() {
  const [files, setFiles] = useState<OutputFile[]>([]);
  const [cats, setCats] = useState<CategoryMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeUploads, setIncludeUploads] = useState(false);
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showSetup, setShowSetup] = useState(false);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [backupToast, setBackupToast] = useState<string | null>(null);
  const [protectedFiles, setProtectedFiles] = useState<ProtectedFile[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmingRestoreTs, setConfirmingRestoreTs] = useState<string | null>(
    null,
  );
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  const loadSnapshots = useCallback(async () => {
    try {
      const res = await fetch("/api/setup/backup/history");
      const data = (await res.json()) as { snapshots?: Snapshot[] };
      setSnapshots(data.snapshots || []);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [filesRes, driveRes, backupRes] = await Promise.all([
        fetch(`/api/outputs/list?includeUploads=${includeUploads ? 1 : 0}`),
        fetch("/api/drive/status"),
        fetch("/api/setup/backup"),
      ]);
      const fd = (await filesRes.json()) as {
        files: OutputFile[];
        categories: CategoryMeta[];
      };
      setFiles(fd.files || []);
      setCats(fd.categories || []);
      setDrive((await driveRes.json()) as DriveStatus);
      setBackupStatus((await backupRes.json()) as BackupStatus);
      await loadSnapshots();
    } finally {
      setLoading(false);
    }
  }, [includeUploads, loadSnapshots]);

  async function snapshotNow() {
    setSnapshotBusy(true);
    setBackupToast(null);
    try {
      const res = await fetch("/api/setup/backup/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "snapshot" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBackupToast(data.error || "snapshot ล้มเหลว");
      } else {
        setBackupToast(`✓ บันทึก snapshot สำเร็จ — ${data.snapshot.files.length} ไฟล์`);
      }
      await loadSnapshots();
    } catch (e) {
      setBackupToast((e as Error).message);
    } finally {
      setSnapshotBusy(false);
    }
  }

  async function restoreSnapshot(timestamp: string) {
    if (confirmingRestoreTs !== timestamp) {
      setConfirmingRestoreTs(timestamp);
      setTimeout(() => {
        setConfirmingRestoreTs((cur) => (cur === timestamp ? null : cur));
      }, 4000);
      return;
    }
    setConfirmingRestoreTs(null);
    setSnapshotBusy(true);
    setBackupToast(null);
    try {
      const res = await fetch("/api/setup/backup/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore", timestamp }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBackupToast(data.error || "ย้อนกลับล้มเหลว");
      } else {
        setBackupToast(
          `✓ ย้อนกลับสำเร็จ — เขียนทับ ${data.restored} ไฟล์ (เก็บของเดิมก่อน restore ไว้แล้ว)`,
        );
      }
      await load();
    } catch (e) {
      setBackupToast((e as Error).message);
    } finally {
      setSnapshotBusy(false);
    }
  }

  async function deleteSnapshot(timestamp: string) {
    setSnapshotBusy(true);
    try {
      await fetch("/api/setup/backup/history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", timestamp }),
      });
      await loadSnapshots();
    } finally {
      setSnapshotBusy(false);
    }
  }

  async function backupNow(force = false) {
    setBacking(true);
    setBackupToast(null);
    if (!force) setProtectedFiles([]);
    try {
      const res = await fetch(
        `/api/setup/backup${force ? "?force=1" : ""}`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBackupToast(data.error || `backup ล้มเหลว`);
      } else {
        const protectedCount = Array.isArray(data.protected)
          ? data.protected.length
          : 0;
        setProtectedFiles(
          protectedCount > 0 ? (data.protected as ProtectedFile[]) : [],
        );
        const prefix = data.uploaded > 0 ? "✓" : protectedCount > 0 ? "⚠" : "·";
        setBackupToast(
          `${prefix} Backup ${force ? "(บังคับทับ) " : ""}— อัป ${data.uploaded} ไฟล์` +
            (data.skipped ? `, ข้าม ${data.skipped}` : "") +
            (protectedCount > 0 ? `, ป้องกัน ${protectedCount}` : "") +
            (data.errors?.length ? `, error ${data.errors.length}` : ""),
        );
      }
      await load();
    } catch (e) {
      setBackupToast((e as Error).message);
    } finally {
      setBacking(false);
    }
  }

  async function restoreNow() {
    if (!confirmingRestore) {
      setConfirmingRestore(true);
      setTimeout(() => setConfirmingRestore(false), 4000);
      return;
    }
    setConfirmingRestore(false);
    setRestoring(true);
    setBackupToast(null);
    try {
      const res = await fetch("/api/setup/restore", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBackupToast(data.error || `restore ล้มเหลว`);
      } else {
        setBackupToast(
          `✓ Restore สำเร็จ — ดึงคืน ${data.restored} ไฟล์ (ลองรีโหลดหน้า)`,
        );
      }
      await load();
    } catch (e) {
      setBackupToast((e as Error).message);
    } finally {
      setRestoring(false);
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  async function organize() {
    setOrganizing(true);
    try {
      await fetch("/api/outputs/organize", { method: "POST" });
      await load();
    } finally {
      setOrganizing(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/drive/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(data as SyncResult);
      } else {
        setSyncResult({
          uploaded: [],
          updated: [],
          skipped: [],
          errors: [{ file: "—", message: data.error || `HTTP ${res.status}` }],
        });
      }
      await load();
    } finally {
      setSyncing(false);
    }
  }

  function toggle(id: string) {
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Group files by category, preserving CATEGORIES order */
  const grouped = useMemo(() => {
    const map = new Map<string, OutputFile[]>();
    for (const c of cats) map.set(c.id, []);
    for (const f of files) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return Array.from(map.entries())
      .map(([id, list]) => {
        const meta = cats.find((c) => c.id === id) || {
          id,
          label: id,
          icon: "📃",
          description: "",
        };
        return { meta, files: list };
      })
      .filter((g) => g.files.length > 0);
  }, [cats, files]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-dim">
        กำลังโหลด…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-base font-semibold text-ink">ไฟล์ทั้งหมด</h2>
          <p className="text-xs text-ink-dim">
            {files.length} ไฟล์ · จัดอัตโนมัติเข้า {grouped.length} หมวด
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-ink-dim">
            <input
              type="checkbox"
              checked={includeUploads}
              onChange={(e) => setIncludeUploads(e.target.checked)}
              className="accent-indigo-500"
            />
            แสดงไฟล์ที่ผู้ใช้อัปโหลด
          </label>
          <button
            onClick={organize}
            disabled={organizing}
            title="จัดไฟล์ flat ใน outputs/ เข้าโฟลเดอร์ย่อยตามประเภท"
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
          >
            {organizing ? "กำลังจัด…" : "🗂 จัดไฟล์"}
          </button>
          <button
            onClick={load}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink"
          >
            🔄
          </button>
        </div>
      </header>

      <DrivePanel
        drive={drive}
        syncing={syncing}
        syncResult={syncResult}
        backup={backupStatus}
        backupToast={backupToast}
        backing={backing}
        restoring={restoring}
        confirmingRestore={confirmingRestore}
        protectedFiles={protectedFiles}
        snapshots={snapshots}
        showHistory={showHistory}
        snapshotBusy={snapshotBusy}
        confirmingRestoreTs={confirmingRestoreTs}
        onSync={syncNow}
        onBackup={() => backupNow(false)}
        onForceBackup={() => backupNow(true)}
        onDismissProtected={() => setProtectedFiles([])}
        onRestore={restoreNow}
        onToggleHistory={() => setShowHistory((v) => !v)}
        onSnapshotNow={snapshotNow}
        onRestoreSnapshot={restoreSnapshot}
        onDeleteSnapshot={deleteSnapshot}
        onConnect={() => setShowSetup(true)}
        onDisconnect={async () => {
          await fetch("/api/drive/config", { method: "DELETE" });
          await load();
        }}
      />

      <SheetsPanel />

      <SetupDriveModal
        open={showSetup}
        onClose={() => setShowSetup(false)}
        onConnected={() => {
          load();
        }}
      />

      <div className="flex-1 overflow-y-auto p-4">
        {grouped.length === 0 ? (
          <EmptyOutputs />
        ) : (
          <div className="space-y-3">
            {grouped.map(({ meta, files }) => (
              <CategorySection
                key={meta.id}
                meta={meta}
                files={files}
                collapsed={collapsed.has(meta.id)}
                onToggle={() => toggle(meta.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Drive Panel ---------- */

function DrivePanel({
  drive,
  syncing,
  syncResult,
  backup,
  backupToast,
  backing,
  restoring,
  confirmingRestore,
  protectedFiles,
  snapshots,
  showHistory,
  snapshotBusy,
  confirmingRestoreTs,
  onSync,
  onBackup,
  onForceBackup,
  onDismissProtected,
  onRestore,
  onToggleHistory,
  onSnapshotNow,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onConnect,
  onDisconnect,
}: {
  drive: DriveStatus | null;
  syncing: boolean;
  syncResult: SyncResult | null;
  backup: BackupStatus | null;
  backupToast: string | null;
  backing: boolean;
  restoring: boolean;
  confirmingRestore: boolean;
  protectedFiles: ProtectedFile[];
  snapshots: Snapshot[];
  showHistory: boolean;
  snapshotBusy: boolean;
  confirmingRestoreTs: string | null;
  onSync: () => void;
  onBackup: () => void;
  onForceBackup: () => void;
  onDismissProtected: () => void;
  onRestore: () => void;
  onToggleHistory: () => void;
  onSnapshotNow: () => void;
  onRestoreSnapshot: (ts: string) => void;
  onDeleteSnapshot: (ts: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  if (!drive) return null;
  const ok = drive.connected;

  return (
    <div
      className={[
        "border-b border-border px-5 py-3",
        ok ? "bg-emerald-500/5" : "bg-surface-2/30",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <div
          className={[
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base",
            ok
              ? "bg-emerald-500/20 text-emerald-200"
              : "bg-surface-2 text-ink-dim",
          ].join(" ")}
        >
          ☁
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            Google Drive
            <span
              className={[
                "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                ok ? "bg-ok/15 text-ok" : "bg-ink-dim/15 text-ink-dim",
              ].join(" ")}
            >
              {ok ? "เชื่อมแล้ว" : "ยังไม่เชื่อม"}
            </span>
          </p>
          {ok ? (
            <p className="truncate text-[11px] text-ink-dim">
              account <strong className="text-ink">{drive.userEmail}</strong>
              {drive.rootFolderUrl && (
                <>
                  {" · "}
                  <a
                    href={drive.rootFolderUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline"
                  >
                    {drive.rootFolderName || "เปิดโฟลเดอร์"}
                  </a>
                </>
              )}
              {drive.lastSync && <> · sync ล่าสุด {fmtDate(drive.lastSync)}</>}
              {typeof drive.fileCount === "number" && (
                <> · {drive.fileCount} ไฟล์</>
              )}
            </p>
          ) : (
            <p className="text-[11px] text-ink-dim">
              {drive.reason || "paste URL ของ Apps Script เพื่อเริ่ม sync"}
            </p>
          )}
        </div>

        {ok ? (
          <>
            <button
              onClick={onSync}
              disabled={syncing}
              className="rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-white hover:bg-accent disabled:opacity-40"
            >
              {syncing ? "กำลัง sync…" : "☁ Sync now"}
            </button>
            <button
              onClick={onDisconnect}
              title="ยกเลิกการเชื่อม"
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-[11px] text-ink-dim hover:border-danger hover:text-danger"
            >
              ยกเลิก
            </button>
          </>
        ) : (
          <button
            onClick={onConnect}
            className="rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-white hover:bg-accent"
          >
            + เชื่อม Drive
          </button>
        )}
      </div>

      {syncResult && (
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          <details className="inline-block">
            <summary className="cursor-pointer">
              <span className="pill pill-ok">
                <span className="status-dot ok" />
                +{syncResult.uploaded.length} ใหม่
              </span>
            </summary>
            {syncResult.uploaded.length > 0 && (
              <ul className="ml-1 mt-1 space-y-0.5 text-[10px] text-ink-dim">
                {syncResult.uploaded.slice(0, 8).map((e, i) => (
                  <li key={i}>
                    <code>{e.file}</code>
                    {e.drive_id && (
                      <span className="opacity-60"> · {e.drive_id.slice(0, 10)}…</span>
                    )}
                  </li>
                ))}
                {syncResult.uploaded.length > 8 && (
                  <li className="opacity-60">+{syncResult.uploaded.length - 8} อีก</li>
                )}
              </ul>
            )}
          </details>
          <details className="inline-block">
            <summary className="cursor-pointer">
              <span
                className="pill"
                style={{
                  background: "rgb(var(--accent-soft) / 0.15)",
                  color: "rgb(var(--accent))",
                }}
              >
                ↻ {syncResult.updated.length} อัปเดต
              </span>
            </summary>
            {syncResult.updated.length > 0 && (
              <ul className="ml-1 mt-1 space-y-0.5 text-[10px] text-ink-dim">
                {syncResult.updated.slice(0, 8).map((e, i) => (
                  <li key={i}>
                    <code>{e.file}</code>
                    {e.drive_id && (
                      <span className="opacity-60"> · {e.drive_id.slice(0, 10)}…</span>
                    )}
                  </li>
                ))}
                {syncResult.updated.length > 8 && (
                  <li className="opacity-60">+{syncResult.updated.length - 8} อีก</li>
                )}
              </ul>
            )}
          </details>
          <span className="pill pill-muted">
            ⤳ {syncResult.skipped.length} ข้าม
          </span>
          {syncResult.errors.length > 0 && (
            <details className="ml-2 inline-block">
              <summary className="cursor-pointer rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-medium text-danger">
                <span className="status-dot danger inline-block align-middle" />{" "}
                {syncResult.errors.length} error
              </summary>
              <ul className="mt-1 space-y-0.5 text-[10px] text-danger">
                {syncResult.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    <code>{e.file}</code>: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {ok && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
          <span className="text-[11px] font-medium text-ink-dim">
            💾 Setup backup
          </span>
          <span className="text-[10.5px] text-ink-dim/70">
            {backup?.last_backup_at
              ? `ล่าสุด ${fmtDate(backup.last_backup_at)}`
              : "ยังไม่เคย backup"}
            {typeof backup?.file_count_on_drive === "number" && (
              <> · {backup.file_count_on_drive} ไฟล์บน Drive</>
            )}
          </span>
          <button
            onClick={onBackup}
            disabled={backing || restoring}
            className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-ink hover:border-accent disabled:opacity-40"
          >
            {backing ? "กำลัง backup…" : "💾 Backup ตอนนี้"}
          </button>
          <button
            onClick={onRestore}
            disabled={
              backing || restoring || (backup?.file_count_on_drive ?? 0) === 0
            }
            className={[
              "rounded-md border px-2 py-1 text-[11px] disabled:opacity-40",
              confirmingRestore
                ? "border-warn bg-warn/10 text-warn"
                : "border-border bg-surface text-ink hover:border-accent",
            ].join(" ")}
            title="ดึง setup ไฟล์ที่ backup ไว้บน Drive กลับมาที่เครื่อง (เขียนทับของเดิม)"
          >
            {restoring
              ? "กำลัง restore…"
              : confirmingRestore
                ? "ยืนยัน restore? (เขียนทับ)"
                : "♻ Restore"}
          </button>
          <button
            onClick={onToggleHistory}
            className={[
              "rounded-md border px-2 py-1 text-[11px] disabled:opacity-40",
              showHistory
                ? "border-accent bg-accent/10 text-ink"
                : "border-border bg-surface text-ink hover:border-accent",
            ].join(" ")}
            title="ดู snapshots ของ data/ ที่บันทึกอัตโนมัติก่อน backup/restore — กดย้อนกลับได้"
          >
            📜 ประวัติ {snapshots.length > 0 && `(${snapshots.length})`}
          </button>
          {backup?.folder_url && (
            <a
              href={backup.folder_url}
              target="_blank"
              rel="noreferrer"
              className="text-[10.5px] text-accent underline"
            >
              เปิดโฟลเดอร์
            </a>
          )}
          {backup && !backup.ok && backup.reason && (
            <span className="text-[10.5px] text-warn">⚠ {backup.reason}</span>
          )}
          {backupToast && (
            <span
              className={[
                "text-[10.5px]",
                backupToast.startsWith("✓")
                  ? "text-ok"
                  : backupToast.startsWith("⚠")
                    ? "text-warn"
                    : "text-danger",
              ].join(" ")}
            >
              {backupToast}
            </span>
          )}
        </div>
      )}

      {ok && protectedFiles.length > 0 && (
        <ProtectedFilesPanel
          files={protectedFiles}
          busy={backing || restoring}
          onForce={onForceBackup}
          onDismiss={onDismissProtected}
        />
      )}

      {ok && showHistory && (
        <HistoryPanel
          snapshots={snapshots}
          busy={snapshotBusy || backing || restoring}
          confirmingRestoreTs={confirmingRestoreTs}
          onSnapshotNow={onSnapshotNow}
          onRestoreSnapshot={onRestoreSnapshot}
          onDeleteSnapshot={onDeleteSnapshot}
        />
      )}
    </div>
  );
}

/* ---------- Snapshot history panel ---------- */

function HistoryPanel({
  snapshots,
  busy,
  confirmingRestoreTs,
  onSnapshotNow,
  onRestoreSnapshot,
  onDeleteSnapshot,
}: {
  snapshots: Snapshot[];
  busy: boolean;
  confirmingRestoreTs: string | null;
  onSnapshotNow: () => void;
  onRestoreSnapshot: (ts: string) => void;
  onDeleteSnapshot: (ts: string) => void;
}) {
  return (
    <div className="mt-2 rounded-md border border-border bg-surface/40 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-ink-dim">
          📜 Local snapshots — ย้อนกลับ data/ ของเครื่องนี้
        </span>
        <button
          onClick={onSnapshotNow}
          disabled={busy}
          className="rounded-md border border-border bg-surface px-2 py-0.5 text-[10.5px] text-ink hover:border-accent disabled:opacity-40"
        >
          {busy ? "กำลังบันทึก…" : "📸 บันทึกตอนนี้"}
        </button>
      </div>
      {snapshots.length === 0 ? (
        <div className="text-[10.5px] text-ink-dim/70">
          ยังไม่มี snapshot — ระบบจะบันทึกอัตโนมัติก่อน Backup / Restore ครั้งถัดไป
          (เก็บ 10 รอบล่าสุด)
        </div>
      ) : (
        <ul className="space-y-1">
          {snapshots.map((s) => (
            <li
              key={s.timestamp}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-bg px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px] text-ink">
                  <span className="font-mono text-[10.5px]">
                    {fmtSnapshotTs(s.timestamp)}
                  </span>
                  <span
                    className={[
                      "rounded px-1 py-px text-[9.5px]",
                      reasonStyle(s.reason),
                    ].join(" ")}
                  >
                    {reasonLabel(s.reason)}
                  </span>
                </div>
                <div className="text-[10px] text-ink-dim/80">
                  {s.files.length} ไฟล์ · {fmtBytes(s.total_size)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onRestoreSnapshot(s.timestamp)}
                  disabled={busy}
                  className={[
                    "rounded-md border px-2 py-0.5 text-[10.5px] disabled:opacity-40",
                    confirmingRestoreTs === s.timestamp
                      ? "border-warn bg-warn/10 text-warn"
                      : "border-border bg-surface text-ink hover:border-accent",
                  ].join(" ")}
                >
                  {confirmingRestoreTs === s.timestamp
                    ? "ยืนยัน? (เขียนทับ)"
                    : "↩ ย้อนกลับ"}
                </button>
                <button
                  onClick={() => onDeleteSnapshot(s.timestamp)}
                  disabled={busy}
                  className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10.5px] text-ink-dim hover:border-danger hover:text-danger disabled:opacity-40"
                  title="ลบ snapshot นี้"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fmtSnapshotTs(ts: string): string {
  // Convert 2026-05-27T10-30-15Z → 2026-05-27 10:30:15
  const m = ts.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/);
  if (!m) return ts;
  return `${m[1]} ${m[2]}:${m[3]}:${m[4]}`;
}

function reasonLabel(r: Snapshot["reason"]): string {
  if (r === "before_backup") return "ก่อน backup";
  if (r === "before_restore") return "ก่อน restore";
  if (r === "before_ai") return "ก่อน AI แก้";
  return "manual";
}

function reasonStyle(r: Snapshot["reason"]): string {
  if (r === "before_backup") return "bg-accent/10 text-accent";
  if (r === "before_restore") return "bg-warn/10 text-warn";
  if (r === "before_ai") return "bg-fuchsia-500/10 text-fuchsia-400";
  return "bg-ink-dim/10 text-ink-dim";
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* ---------- Protected files warning ---------- */

function ProtectedFilesPanel({
  files,
  busy,
  onForce,
  onDismiss,
}: {
  files: ProtectedFile[];
  busy: boolean;
  onForce: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mt-2 rounded-md border border-warn/40 bg-warn/5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-warn">
          ⚠ Backup ป้องกัน {files.length} ไฟล์ — ของใหม่อาจมีปัญหา
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onForce}
            disabled={busy}
            className="rounded-md border border-warn/60 bg-warn/10 px-2 py-0.5 text-[10.5px] font-medium text-warn hover:bg-warn/20 disabled:opacity-40"
            title="ทับของบน Drive ด้วย local ปัจจุบันโดยข้าม guard ทั้งหมด"
          >
            {busy ? "กำลังบังคับ…" : "บังคับ backup ทับ"}
          </button>
          <button
            onClick={onDismiss}
            disabled={busy}
            className="rounded-md border border-border bg-surface px-2 py-0.5 text-[10.5px] text-ink-dim hover:border-accent disabled:opacity-40"
          >
            ปิด
          </button>
        </div>
      </div>
      <ul className="mt-1.5 space-y-0.5 text-[10.5px] text-ink-dim">
        {files.map((f) => (
          <li key={f.file}>
            <code className="text-ink">{f.file}</code> —{" "}
            <span className="text-warn">{labelReason(f.reason)}</span>
            <span className="text-ink-dim/80"> · {f.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function labelReason(r: ProtectedFile["reason"]): string {
  if (r === "empty") return "ไฟล์ว่าง";
  if (r === "header_only") return "CSV เหลือแค่ header";
  return "เล็กกว่าของเดิมเกิน 50%";
}

/* ---------- Category section ---------- */

function CategorySection({
  meta,
  files,
  collapsed,
  onToggle,
}: {
  meta: CategoryMeta;
  files: OutputFile[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface/40">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left hover:bg-surface-2/40"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{meta.icon}</span>
          <div>
            <p className="text-sm font-semibold text-ink">{meta.label}</p>
            <p className="text-[10px] text-ink-dim">{meta.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-dim">
            {files.length}
          </span>
          <span className="text-ink-dim">{collapsed ? "›" : "⌄"}</span>
        </div>
      </button>
      {!collapsed && (
        <ul className="divide-y divide-border/50">
          {files.map((f) => (
            <FileRow key={f.path} file={f} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FileRow({ file }: { file: OutputFile }) {
  const url = `/api/outputs/file/${file.path.split("/").map(encodeURIComponent).join("/")}`;
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-surface-2/30">
      <span className="text-sm">{pickIcon(file.path, file.mimeType)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-ink">{file.name}</p>
        <p className="text-[10.5px] text-ink-dim">
          {prettyBytes(file.size)} · {fmtDate(file.mtime)}
        </p>
      </div>
      {file.synced && file.web_link && (
        <a
          href={file.web_link}
          target="_blank"
          rel="noreferrer"
          title="เปิดบน Google Drive"
          className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-emerald-200 hover:bg-emerald-500/25"
        >
          ☁
        </a>
      )}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="rounded-md border border-border bg-surface-2 px-2 py-0.5 text-ink-dim hover:text-ink"
      >
        เปิด
      </a>
      <a
        href={url}
        download={file.name}
        className="rounded-md bg-accent-soft px-2 py-0.5 text-white hover:bg-accent"
      >
        ↓
      </a>
    </li>
  );
}

function EmptyOutputs() {
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <div className="text-4xl">📁</div>
      <p className="mt-2 text-sm text-ink-dim">
        ยังไม่มีไฟล์ — ลองสั่งพนักงานในห้องประชุมออก invoice, รายงาน, JD, SOP
        แล้วระบบจะจัดเข้าโฟลเดอร์ย่อยอัตโนมัติ
      </p>
    </div>
  );
}

function pickIcon(filePath: string, mime: string): string {
  if (mime.startsWith("image/")) return "🖼";
  if (mime === "application/pdf") return "📄";
  if (filePath.endsWith(".csv") || mime.includes("csv")) return "📊";
  if (filePath.endsWith(".json")) return "🧩";
  if (filePath.endsWith(".md")) return "📝";
  return "📃";
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(value: string | number): string {
  try {
    const d = typeof value === "number" ? new Date(value) : new Date(value);
    return d.toLocaleString("th-TH", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}
