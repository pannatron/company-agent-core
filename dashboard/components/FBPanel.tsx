"use client";

import { useCallback, useEffect, useState } from "react";

interface FbStatus {
  page_id: string;
  page_token_set: boolean;
  page_token_preview: string;
  poll_interval_min: number;
  trigger_installed: boolean;
  last_run_at: string;
  last_error: string;
  last_result: string;
  script_version?: string;
  needs_v6_upgrade: boolean;
}

interface Props {
  /** Increment to force a refetch (e.g. after pushing posts) */
  refreshSignal?: number;
}

export default function FBPanel({ refreshSignal }: Props) {
  const [status, setStatus] = useState<FbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/social/fb/status");
      if (r.ok) setStatus((await r.json()) as FbStatus);
      else setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  async function runNow() {
    setBusy("run");
    setToast(null);
    try {
      const r = await fetch("/api/social/fb/run", { method: "POST" });
      const d = await r.json();
      if (!r.ok) setToast(`✗ ${d.error || `HTTP ${r.status}`}`);
      else
        setToast(
          `✓ scheduler run — published ${d.published}, errors ${d.errors}, skipped ${d.skipped}`,
        );
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleTrigger() {
    if (!status) return;
    setBusy("toggle");
    setToast(null);
    try {
      const path = status.trigger_installed
        ? "/api/social/fb/disable"
        : "/api/social/fb/enable";
      const r = await fetch(path, { method: "POST" });
      const d = await r.json();
      if (!r.ok) setToast(`✗ ${d.error || `HTTP ${r.status}`}`);
      else
        setToast(
          status.trigger_installed
            ? "✓ ปิด auto-posting แล้ว"
            : `✓ เปิด auto-posting (ทุก ${d.interval_min} นาที)`,
        );
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function pushPosts() {
    setBusy("push");
    setToast(null);
    try {
      const r = await fetch("/api/social/sheet/push", { method: "POST" });
      const d = await r.json();
      if (!r.ok) setToast(`✗ ${d.error || `HTTP ${r.status}`}`);
      else setToast(`✓ push ${d.rows} โพสต์ขึ้น Sheet`);
    } finally {
      setBusy(null);
    }
  }

  async function pullPosts() {
    setBusy("pull");
    setToast(null);
    try {
      const r = await fetch("/api/social/sheet/pull", { method: "POST" });
      const d = await r.json();
      if (!r.ok) setToast(`✗ ${d.error || `HTTP ${r.status}`}`);
      else setToast(`✓ pull ${d.posts} โพสต์กลับมาที่ social-posts.json`);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="border-b border-border bg-surface/30 px-5 py-3 text-xs text-ink-dim">
        กำลังโหลด Facebook config…
      </div>
    );
  }

  if (!status) {
    return (
      <div className="border-b border-border bg-surface/30 px-5 py-3 text-xs text-ink-dim">
        📘 Facebook auto-post — เชื่อม Drive ก่อน
      </div>
    );
  }

  if (status.needs_v6_upgrade) {
    return (
      <section className="border-b border-amber-500/40 bg-amber-500/10 px-5 py-3">
        <h3 className="text-sm font-semibold text-amber-200">
          ⚠ Apps Script ของคุณยังเป็น v{status.script_version || "?"} — ต้องอัปเป็น v6 ก่อน
        </h3>
        <p className="mt-1 text-[11px] text-amber-100/80">
          v6 เพิ่ม Facebook posting + time trigger — เปิด Files tab → กด &ldquo;📋 ก๊อปสคริปต์&rdquo; แล้ว paste ทับใน script.google.com
        </p>
      </section>
    );
  }

  const hasConfig = !!status.page_id && status.page_token_set;
  const dotColor = !hasConfig
    ? "bg-ink-dim"
    : status.trigger_installed
      ? "bg-emerald-400"
      : "bg-amber-400";

  return (
    <section className="border-b border-border bg-surface/30 px-5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">
            📘 Facebook Page auto-post{" "}
            <span className={`ml-2 inline-block h-2 w-2 rounded-full ${dotColor}`} />
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-ink-dim">
            {!hasConfig
              ? "ยังไม่ตั้ง Page ID + Token"
              : status.trigger_installed
                ? `auto-posting on — โพสต์ทุก ${status.poll_interval_min} นาที · Page ${status.page_id}`
                : `config พร้อม — ยังไม่ติด trigger (Page ${status.page_id})`}
          </p>
          {status.last_run_at && (
            <p className="mt-0.5 text-[10px] text-ink-dim/80">
              last run: {shortTime(status.last_run_at)} ·{" "}
              {status.last_result || "—"}
              {status.last_error && (
                <span className="ml-2 text-rose-300">
                  · err: {status.last_error}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setShowSetup(true)}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink"
          >
            {hasConfig ? "⚙ ตั้งค่า" : "🔧 ตั้งค่าครั้งแรก"}
          </button>
          <button
            onClick={pushPosts}
            disabled={!!busy}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
            title="ส่ง social-posts.json → Sheet queue"
          >
            {busy === "push" ? "⬆…" : "⬆ Push"}
          </button>
          <button
            onClick={pullPosts}
            disabled={!!busy}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
            title="ดึง Sheet → social-posts.json"
          >
            {busy === "pull" ? "⬇…" : "⬇ Pull"}
          </button>
          <button
            onClick={runNow}
            disabled={!hasConfig || !!busy}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
            title="รัน scheduler เลย ไม่รอเวลา trigger"
          >
            {busy === "run" ? "▶…" : "▶ Run now"}
          </button>
          <button
            onClick={toggleTrigger}
            disabled={!hasConfig || !!busy}
            className={[
              "rounded-md border px-2.5 py-1 text-[11px] disabled:opacity-50",
              status.trigger_installed
                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:border-emerald-300"
                : "border-accent/50 bg-accent/15 text-ink hover:border-accent",
            ].join(" ")}
          >
            {busy === "toggle"
              ? "…"
              : status.trigger_installed
                ? "⏸ ปิด auto-post"
                : "▶ เปิด auto-post"}
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

      <SetupModal
        open={showSetup}
        status={status}
        onClose={() => setShowSetup(false)}
        onSaved={async () => {
          setShowSetup(false);
          await load();
        }}
      />
    </section>
  );
}

function SetupModal({
  open,
  status,
  onClose,
  onSaved,
}: {
  open: boolean;
  status: FbStatus;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pageId, setPageId] = useState(status.page_id);
  const [pageToken, setPageToken] = useState("");
  const [interval, setIntervalMin] = useState(status.poll_interval_min || 5);
  const [testMsg, setTestMsg] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPageId(status.page_id);
      setPageToken("");
      setIntervalMin(status.poll_interval_min || 5);
      setTestMsg("");
      setMsg(null);
    }
  }, [open, status]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        page_id: pageId,
        poll_interval_min: interval,
      };
      if (pageToken.trim()) body.page_token = pageToken.trim();
      const r = await fetch("/api/social/fb/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) setMsg(`✗ ${d.error || `HTTP ${r.status}`}`);
      else {
        setMsg("✓ บันทึก config แล้ว");
        setTimeout(onSaved, 700);
      }
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    if (!testMsg.trim()) {
      setMsg("กรอกข้อความทดสอบก่อน");
      return;
    }
    setTesting(true);
    setMsg(null);
    try {
      const r = await fetch("/api/social/fb/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: testMsg }),
      });
      const d = await r.json();
      if (!r.ok) setMsg(`✗ ${d.error || `HTTP ${r.status}`}`);
      else setMsg(`✓ โพสต์ทดสอบสำเร็จ — ${d.external_url}`);
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
        className="relative w-full max-w-xl rounded-2xl border border-border bg-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold text-ink">
            📘 ตั้งค่า Facebook auto-post
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-dim hover:bg-surface-2 hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="max-h-[78vh] space-y-4 overflow-y-auto p-5">
          <details className="rounded-lg border border-border bg-surface-2/40 p-3 text-[11.5px] text-ink-dim open:bg-surface-2/60">
            <summary className="cursor-pointer text-ink">
              📋 วิธีหา Page ID + Page Access Token (กดเปิด)
            </summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5">
              <li>
                เปิด{" "}
                <a
                  href="https://developers.facebook.com/apps/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline"
                >
                  developers.facebook.com/apps
                </a>{" "}
                → Create app → Business type
              </li>
              <li>
                ในแอป → Add Product → <strong>Facebook Login for Business</strong>
              </li>
              <li>
                เปิด{" "}
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline"
                >
                  Graph API Explorer
                </a>{" "}
                → เลือก App ของคุณ → Get User Access Token →{" "}
                ติ๊ก scopes: <code>pages_show_list</code>,{" "}
                <code>pages_manage_posts</code>, <code>pages_read_engagement</code>
              </li>
              <li>
                ใน Explorer พิมพ์: <code>/me/accounts</code> → กด Submit →
                เจอ list ของ Pages ที่คุณดูแล
              </li>
              <li>
                คัดลอก <code>id</code> ของ Page ที่ต้องการ → ใส่ในช่อง &ldquo;Page ID&rdquo;
              </li>
              <li>
                คัดลอก <code>access_token</code> ของ Page นั้น (อยู่ใน response เดียวกัน) → ใส่ในช่อง
                &ldquo;Page Access Token&rdquo; ด้านล่าง
              </li>
              <li>
                <strong>แนะนำ:</strong> Token นี้สั้น (1 ชม.) — แลกเป็น long-lived (60 วัน) ด้วย:{" "}
                <code className="break-all text-[10px]">
                  /oauth/access_token?grant_type=fb_exchange_token&amp;client_id=APP_ID&amp;client_secret=APP_SECRET&amp;fb_exchange_token=SHORT_TOKEN
                </code>{" "}
                แล้วเรียก <code>/me/accounts</code> อีกรอบ — Page token ที่ได้จะไม่หมดอายุ
              </li>
            </ol>
          </details>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-dim">
              Page ID
            </label>
            <input
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              placeholder="1234567890"
              className="input"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-dim">
              Page Access Token{" "}
              {status.page_token_set && (
                <span className="text-[10px] text-emerald-300">
                  · ปัจจุบัน: {status.page_token_preview} (ปล่อยว่างถ้าไม่เปลี่ยน)
                </span>
              )}
            </label>
            <textarea
              value={pageToken}
              onChange={(e) => setPageToken(e.target.value)}
              placeholder="EAAxxxxxxxxxx..."
              rows={2}
              className="input font-mono text-[11px]"
            />
            <p className="mt-1 text-[10px] text-ink-dim">
              เก็บใน ScriptProperties ของ Apps Script — ไม่ถูก commit ลง git
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-dim">
              ความถี่ที่ scheduler จะวิ่ง (นาที — ใช้ได้: 1, 5, 10, 15, 30)
            </label>
            <input
              type="number"
              value={interval}
              min={1}
              max={30}
              onChange={(e) => setIntervalMin(parseInt(e.target.value, 10) || 5)}
              className="input"
            />
          </div>

          <div className="border-t border-border pt-3">
            <label className="mb-1 block text-xs font-medium text-ink-dim">
              ทดสอบโพสต์ (จะโพสจริงเลย — ใช้คำว่า &ldquo;test&rdquo; แล้วลบทีหลังได้)
            </label>
            <textarea
              value={testMsg}
              onChange={(e) => setTestMsg(e.target.value)}
              placeholder="test post from dashboard 🤖"
              rows={2}
              className="input"
            />
            <div className="mt-2 flex justify-end">
              <button
                onClick={runTest}
                disabled={testing || !status.page_token_set}
                className="rounded-md border border-border bg-surface px-3 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
                title={
                  !status.page_token_set
                    ? "Save Token ก่อน"
                    : "โพสต์เลย"
                }
              >
                {testing ? "กำลังโพสต์…" : "▶ ทดสอบโพสต์"}
              </button>
            </div>
          </div>

          {msg && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                msg.startsWith("✓")
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : "border-rose-400/40 bg-rose-500/10 text-rose-200"
              }`}
            >
              {msg.startsWith("✓") && msg.includes("https://") ? (
                <>
                  {msg.split("—")[0]}—{" "}
                  <a
                    href={msg.split("— ")[1]}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {msg.split("— ")[1]}
                  </a>
                </>
              ) : (
                msg
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button
              onClick={onClose}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-ink-dim hover:border-accent hover:text-ink"
            >
              ยกเลิก
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </div>
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
