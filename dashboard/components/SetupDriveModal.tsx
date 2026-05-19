"use client";

import { useEffect, useMemo, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConnected: () => void;
}

type UrlKind = "apps_script" | "drive_folder" | "unknown" | "empty";

function detectKind(url: string): UrlKind {
  const u = url.trim();
  if (!u) return "empty";
  if (/^https:\/\/script\.google\.com\/macros\/s\/[^/?]+\/exec/.test(u)) return "apps_script";
  if (/^https:\/\/drive\.google\.com\/.*\/folders\/[a-zA-Z0-9_-]+/.test(u)) return "drive_folder";
  return "unknown";
}

function extractFolderId(url: string): string | null {
  const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export default function SetupDriveModal({ open, onClose, onConnected }: Props) {
  /** Whatever the user pastes — could be a Drive folder URL or an Apps Script /exec URL */
  const [pastedUrl, setPastedUrl] = useState("");
  /** Apps Script exec URL (the final piece). May be filled directly from pastedUrl. */
  const [execUrl, setExecUrl] = useState("");
  const [script, setScript] = useState("");
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ email?: string; folder?: string } | null>(null);

  const kind = useMemo(() => detectKind(pastedUrl), [pastedUrl]);
  const folderId = useMemo(
    () => (kind === "drive_folder" ? extractFolderId(pastedUrl) : null),
    [kind, pastedUrl],
  );

  // Reset transient state when reopened
  useEffect(() => {
    if (open) {
      setPastedUrl("");
      setExecUrl("");
      setScript("");
      setError(null);
      setSuccess(null);
      setCopied(false);
    }
  }, [open]);

  // Auto-detect: when user pastes an exec URL, surface it for one-click connect.
  useEffect(() => {
    if (kind === "apps_script") setExecUrl(pastedUrl.trim());
  }, [kind, pastedUrl]);

  // When user pastes a Drive folder URL, fetch a script customized for that folder.
  useEffect(() => {
    if (kind !== "drive_folder" || !folderId) {
      // For unknown / apps_script kinds, also keep a default script available
      if (kind === "unknown" || kind === "empty") {
        fetch("/api/drive/config")
          .then((r) => r.json())
          .then((d: { apps_script: string }) => setScript(d.apps_script))
          .catch(() => {});
      }
      return;
    }
    fetch(`/api/drive/config?folder_id=${encodeURIComponent(folderId)}`)
      .then((r) => r.json())
      .then((d: { apps_script: string }) => setScript(d.apps_script))
      .catch(() => {});
  }, [kind, folderId]);

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("ก๊อปไม่ได้ — เลือกใน textarea แล้ว Cmd/Ctrl+C เอง");
    }
  }

  async function connect() {
    if (!execUrl.trim()) return;
    setTesting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/drive/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: execUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || `เชื่อมไม่สำเร็จ (HTTP ${res.status})`);
        return;
      }
      setSuccess({ email: data.userEmail, folder: data.rootFolderName });
      setTimeout(() => {
        onConnected();
        onClose();
      }, 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink">เชื่อม Google Drive</h2>
            <p className="text-xs text-ink-dim">
              วาง Drive folder URL หรือ Apps Script exec URL ก็ได้ — ระบบจะรู้เอง
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-dim hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="max-h-[78vh] overflow-y-auto p-5 space-y-5">
          {/* Step 0: smart input */}
          <section>
            <label className="mb-1 block text-xs font-medium text-ink-dim">
              วาง URL ที่นี่
            </label>
            <input
              type="url"
              value={pastedUrl}
              onChange={(e) => setPastedUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/...  หรือ  https://script.google.com/macros/s/.../exec"
              className="input"
              autoFocus
            />
            <UrlKindHint kind={kind} folderId={folderId} />
          </section>

          {/* Direct connect path — pastedUrl is already an exec URL */}
          {kind === "apps_script" && (
            <section className="space-y-3 rounded-xl border border-accent/30 bg-accent-soft/5 p-4">
              <p className="text-sm font-medium text-ink">
                ✓ ตรวจพบ Apps Script exec URL — เชื่อมได้เลย
              </p>
              {error && (
                <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}
              {success && (
                <SuccessBox success={success} />
              )}
              <button
                onClick={connect}
                disabled={testing || !!success}
                className="btn-primary"
              >
                {testing ? "กำลังทดสอบ…" : success ? "✓ เชื่อมแล้ว" : "ทดสอบและเชื่อม"}
              </button>
            </section>
          )}

          {/* Two-step path — user gave a Drive folder URL (or hasn't pasted yet) */}
          {kind !== "apps_script" && (
            <>
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-ink">
                  {kind === "drive_folder"
                    ? "1. ก๊อปสคริปต์ (ตั้งให้บันทึกเข้าโฟลเดอร์ของคุณแล้ว)"
                    : "1. ก๊อปสคริปต์"}
                </h3>
                {kind === "drive_folder" && folderId && (
                  <p className="text-[11px] text-ink-dim">
                    สคริปต์จะเขียนเข้าโฟลเดอร์{" "}
                    <code className="text-accent">{folderId}</code> โดยตรง
                  </p>
                )}

                <div className="relative">
                  <button
                    onClick={copyScript}
                    disabled={!script}
                    className="absolute right-2 top-2 z-10 rounded-md border border-border bg-bg/90 px-2 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
                  >
                    {copied ? "✓ ก๊อปแล้ว" : "ก๊อปทั้งหมด"}
                  </button>
                  <textarea
                    readOnly
                    value={script || "กำลังโหลดสคริปต์…"}
                    className="h-48 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 font-mono text-[11px] text-ink"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>

                <div className="rounded-lg border border-border bg-surface-2/40 p-3 text-[11.5px] text-ink">
                  <p className="mb-2 font-semibold">2. ขั้นตอนบน Google</p>
                  <ol className="list-decimal space-y-1 pl-5 text-ink-dim">
                    <li>
                      เปิด{" "}
                      <a
                        href="https://script.google.com/home/projects/create"
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent underline"
                      >
                        script.google.com → New project
                      </a>
                    </li>
                    <li>
                      เลือกโค้ดเดิมทั้งหมด <kbd className="rounded bg-bg px-1">Cmd/Ctrl+A</kbd>{" "}
                      → ลบทิ้ง → วางโค้ดที่ก๊อปไว้ → เซฟ
                    </li>
                    <li>
                      กด <strong className="text-ink">Deploy</strong> → New deployment →{" "}
                      <strong className="text-ink">Web app</strong>
                    </li>
                    <li>
                      ตั้ง <strong className="text-ink">Execute as: Me</strong> +{" "}
                      <strong className="text-ink">Who has access: Anyone</strong>
                    </li>
                    <li>
                      กด Deploy → ครั้งแรก Google ขอ authorize → Advanced → <em>Go to (unsafe)</em> → Allow
                    </li>
                    <li>
                      ก๊อป <strong className="text-ink">Web app URL</strong> ที่ลงท้าย{" "}
                      <code className="text-accent">/exec</code>
                    </li>
                  </ol>
                </div>
              </section>

              <section className="space-y-2 border-t border-border pt-4">
                <h3 className="text-sm font-semibold text-ink">3. วาง exec URL</h3>
                <input
                  type="url"
                  value={execUrl}
                  onChange={(e) => setExecUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") connect();
                  }}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="input"
                  disabled={testing || !!success}
                />
                {error && (
                  <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {error}
                  </div>
                )}
                {success && <SuccessBox success={success} />}
                <div className="flex justify-end">
                  <button
                    onClick={connect}
                    disabled={testing || !execUrl.trim() || !!success}
                    className="btn-primary"
                  >
                    {testing ? "กำลังทดสอบ…" : success ? "✓ เชื่อมแล้ว" : "ทดสอบและเชื่อม"}
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function UrlKindHint({ kind, folderId }: { kind: UrlKind; folderId: string | null }) {
  if (kind === "empty") {
    return (
      <p className="mt-1 text-[11px] text-ink-dim">
        💡 วาง <strong>Drive folder URL</strong> (
        <code className="text-accent">/folders/...</code>) → ระบบจะปั้นสคริปต์ที่บันทึกเข้าโฟลเดอร์นั้นให้
        หรือ <strong>Apps Script exec URL</strong> → เชื่อมทันที
      </p>
    );
  }
  if (kind === "apps_script") {
    return (
      <p className="mt-1 text-[11px] text-ok">
        ✓ Apps Script exec URL — กดปุ่ม “ทดสอบและเชื่อม” ด้านล่างได้เลย
      </p>
    );
  }
  if (kind === "drive_folder") {
    return (
      <p className="mt-1 text-[11px] text-accent">
        ✓ Drive folder URL ({folderId ? `id: ${folderId.slice(0, 14)}…` : ""}) — สคริปต์ด้านล่างจะถูกตั้งให้บันทึกเข้าโฟลเดอร์นี้
      </p>
    );
  }
  return (
    <p className="mt-1 text-[11px] text-warn">
      ⚠ URL นี้ระบบไม่รู้จัก — ใช้ได้แค่ <code className="text-accent">drive.google.com/.../folders/...</code> หรือ{" "}
      <code className="text-accent">script.google.com/macros/s/.../exec</code>
    </p>
  );
}

function SuccessBox({ success }: { success: { email?: string; folder?: string } }) {
  return (
    <div className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">
      <p className="font-medium">✓ เชื่อมเรียบร้อย</p>
      <p className="mt-0.5 text-xs">
        Account <strong>{success.email}</strong>
        {success.folder && (
          <>
            {" · "}บันทึกเข้า <strong>{success.folder}</strong>
          </>
        )}
      </p>
    </div>
  );
}
