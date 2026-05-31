"use client";

import { useEffect, useMemo, useState } from "react";
import { ACCENT_BG_SOFT, EMPLOYEES, EmployeeMeta } from "@/lib/employees";
import Avatar from "./Avatar";
import FBPanel from "./FBPanel";

type PostStatus =
  | "draft"
  | "ready_for_review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

interface Account {
  id: string;
  platform: string;
  handle: string;
  connected: boolean;
  follower_count?: number;
}

interface Engagement {
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
}

interface Post {
  id: string;
  platform: string;
  status: PostStatus;
  title: string;
  copy: string;
  asset_prompt?: string;
  asset_file?: string;
  designer?: string;
  writer?: string;
  approved_by?: string | null;
  scheduled_at?: string;
  published_at?: string;
  external_url?: string;
  campaign?: string;
  notes?: string;
  engagement?: Engagement | null;
  last_attempt_at?: string;
  attempt_count?: number;
  error_log?: string;
}

interface SocialFile {
  updated_at: string;
  accounts: Account[];
  posts: Post[];
}

interface Props {
  refreshSignal: number;
  onPromptCreatorTeam: () => void;
}

interface CardActions {
  onPostNow: (postId: string) => Promise<void>;
  onRetry: (postId: string) => Promise<void>;
  onDelete: (post: Post) => Promise<void>;
  onOpen: (post: Post) => void;
  busyPostId: string | null;
}

/** Statuses that can still be (re)scheduled from the dashboard. */
const SCHEDULABLE: PostStatus[] = ["draft", "ready_for_review", "approved", "scheduled", "failed"];

const COLUMNS: { key: PostStatus | "in_progress"; label: string; statuses: PostStatus[] }[] = [
  { key: "in_progress", label: "ร่าง / กำลังทำ", statuses: ["draft", "ready_for_review", "approved"] },
  { key: "scheduled", label: "ตั้งเวลาแล้ว", statuses: ["scheduled", "publishing", "failed"] },
  { key: "published", label: "เผยแพร่แล้ว", statuses: ["published"] },
];

export default function SocialView({ refreshSignal, onPromptCreatorTeam }: Props) {
  const [data, setData] = useState<SocialFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [localBump, setLocalBump] = useState(0);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/social")
      .then((r) => r.json())
      .then((d: SocialFile) => {
        if (alive) setData(d);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [refreshSignal, localBump]);

  const reload = () => setLocalBump((n) => n + 1);

  /** Manual refresh: pull the sheet (FB scheduler writes status back there) then
   *  reload the view, so newly-published/processing posts show without waiting
   *  for the 45s auto-poll. */
  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setActionToast(null);
    try {
      const r = await fetch("/api/social/sheet/pull", { method: "POST" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setActionToast(`✗ refresh ไม่สำเร็จ: ${d.error || `HTTP ${r.status}`}`);
      }
    } catch (e) {
      setActionToast(`✗ refresh ไม่สำเร็จ: ${(e as Error).message}`);
    } finally {
      setRefreshing(false);
      reload();
    }
  };

  // BUG-007: Apps Script publishes scheduled posts on its own (every 5 min)
  // and writes status=published back to the Sheet, but the dashboard never
  // saw the update because we only pulled on user action. Poll the Sheet
  // every 45s while this tab is open AND there's at least one scheduled
  // post — stop polling once everything is resolved so we don't hammer
  // Apps Script needlessly.
  useEffect(() => {
    if (!data) return;
    const hasPending = data.posts.some(
      (p) => p.status === "scheduled" || p.status === "failed",
    );
    if (!hasPending) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled || document.hidden) {
        timer = setTimeout(tick, 45_000);
        return;
      }
      try {
        const r = await fetch("/api/social/sheet/pull", { method: "POST" });
        if (!cancelled && r.ok) reload();
      } catch {
        /* transient — just try again next tick */
      } finally {
        if (!cancelled) timer = setTimeout(tick, 45_000);
      }
    };
    timer = setTimeout(tick, 45_000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [data]);

  const onPostNow = async (postId: string) => {
    setBusyPostId(postId);
    setActionToast(null);
    try {
      const r = await fetch("/api/social/fb/post-now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ post_id: postId }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) {
        setActionToast(`✗ ${d.error || `HTTP ${r.status}`}`);
        // Post may already be mid-publish on the server (scheduler grabbed it
        // first). Pull the sheet so its "publishing" status + spinner show,
        // instead of a stale "scheduled" card the user keeps clicking.
        await fetch("/api/social/sheet/pull", { method: "POST" }).catch(() => {});
        reload();
      } else {
        setActionToast(`✓ โพสต์ขึ้น Facebook แล้ว — ${d.external_url || ""}`);
        // Pull sheet back so local JSON reflects new status/external_url
        await fetch("/api/social/sheet/pull", { method: "POST" }).catch(() => {});
        reload();
      }
    } finally {
      setBusyPostId(null);
    }
  };

  const onRetry = async (postId: string) => {
    setBusyPostId(postId);
    setActionToast(null);
    try {
      const r = await fetch("/api/social/fb/retry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ post_id: postId }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) {
        setActionToast(`✗ ${d.error || `HTTP ${r.status}`}`);
      } else {
        setActionToast(`✓ reset เป็น scheduled — รอ trigger ถัดไป`);
        await fetch("/api/social/sheet/pull", { method: "POST" }).catch(() => {});
        reload();
      }
    } finally {
      setBusyPostId(null);
    }
  };

  /**
   * Soft-delete a post from social-posts.json + push to Sheets. Refuses
   * published posts unless the user explicitly confirms a second time, to
   * keep the button safe for casual cleanup of drafts/scheduled.
   */
  const onDelete = async (post: Post) => {
    const labelMap: Record<PostStatus, string> = {
      draft: "draft",
      ready_for_review: "รอ review",
      approved: "approved",
      scheduled: "ตั้งเวลา",
      publishing: "กำลังเผยแพร่",
      published: "เผยแพร่แล้ว",
      failed: "ยิงไม่ออก",
    };
    const stTh = labelMap[post.status] ?? post.status;
    const title = post.title || post.id;
    if (!confirm(`ลบโพสต์นี้?\n\n[${stTh}] ${title}\n\nจะลบจาก social-posts.json + Sheets`)) {
      return;
    }
    setBusyPostId(post.id);
    setActionToast(null);
    try {
      const r = await fetch("/api/social", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ post_id: post.id }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) {
        setActionToast(`✗ ${d.error || `HTTP ${r.status}`}`);
      } else {
        setActionToast(
          `✓ ลบโพสต์ "${title}" แล้ว${d.pushed ? " · sync Sheets แล้ว" : d.pushError ? ` · ⚠ push sheet ล้มเหลว: ${d.pushError}` : ""}`,
        );
        reload();
      }
    } finally {
      setBusyPostId(null);
    }
  };

  /**
   * Schedule (or reschedule) a post: PATCH the local JSON to
   * status=scheduled + scheduled_at, which also pushes the queue to Sheets so
   * the Apps Script trigger publishes it when due. Returns true on full
   * success (incl. Sheet push) so the modal knows whether to close.
   */
  const onSchedule = async (postId: string, scheduledAtIso: string): Promise<boolean> => {
    setBusyPostId(postId);
    setActionToast(null);
    try {
      const r = await fetch("/api/social", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ post_id: postId, scheduled_at: scheduledAtIso }),
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) {
        // 502 = scheduled locally then reverted because the Sheet push failed
        // (e.g. asset not on Drive yet). Reload so the card reflects the revert.
        if (d.reverted) reload();
        setActionToast(`✗ ${d.error || `HTTP ${r.status}`}`);
        return false;
      }
      setActionToast(`✓ ตั้งเวลาโพสต์ ${fmtDate(d.scheduled_at)} แล้ว · sync Sheets`);
      reload();
      return true;
    } finally {
      setBusyPostId(null);
    }
  };

  const previewPost = useMemo(
    () => data?.posts.find((p) => p.id === previewId) ?? null,
    [data, previewId],
  );

  const grouped = useMemo(() => {
    const out = new Map<string, Post[]>();
    if (!data) return out;
    for (const col of COLUMNS) out.set(col.key, []);
    for (const p of data.posts) {
      const col = COLUMNS.find((c) => c.statuses.includes(p.status));
      if (col) out.get(col.key)!.push(p);
    }
    return out;
  }, [data]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-dim">
        กำลังโหลด social queue…
      </div>
    );
  }

  const isEmpty = !data || data.posts.length === 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">Social Queue</h2>
          <p className="text-xs text-ink-dim">
            {data?.posts.length ?? 0} โพสต์ทั้งหมด · อัปเดต {data?.updated_at ?? "—"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            title="ดึงสถานะล่าสุดจาก Sheet (FB scheduler เขียน status กลับที่นั่น)"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-dim hover:border-accent hover:text-ink disabled:opacity-50"
          >
            <span className={refreshing ? "inline-block animate-spin" : "inline-block"}>↻</span>
            {refreshing ? "กำลังรีเฟรช…" : "รีเฟรช"}
          </button>
          <button
            onClick={onPromptCreatorTeam}
            className="rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-white hover:bg-accent"
          >
            + ขอ creator team สร้างโพสต์
          </button>
        </div>
      </header>

      <FBPanel refreshSignal={refreshSignal + localBump} />

      {data && <AccountsStrip accounts={data.accounts} />}

      {actionToast && (
        <div
          className={`border-b px-5 py-2 text-[11px] ${
            actionToast.startsWith("✓")
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/40 bg-rose-500/10 text-rose-200"
          }`}
        >
          {actionToast}
        </div>
      )}

      <div className="flex-1 overflow-x-auto p-4">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center">
            <EmptySocial onPrompt={onPromptCreatorTeam} />
          </div>
        ) : (
          <div className="flex h-full min-w-max gap-3">
            {COLUMNS.map((col) => (
              <Column
                key={col.key}
                label={col.label}
                posts={grouped.get(col.key) ?? []}
                actions={{ onPostNow, onRetry, onDelete, onOpen: (p) => setPreviewId(p.id), busyPostId }}
              />
            ))}
          </div>
        )}
      </div>

      {previewPost && (
        <PostPreviewModal
          key={previewPost.id}
          post={previewPost}
          busy={busyPostId === previewPost.id}
          onClose={() => setPreviewId(null)}
          onSchedule={onSchedule}
        />
      )}
    </div>
  );
}

function AccountsStrip({ accounts }: { accounts: Account[] }) {
  if (!accounts?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/30 px-5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-dim/70">
        Connected accounts
      </p>
      {accounts.map((a) => (
        <span
          key={a.id}
          className={[
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
            a.connected
              ? "border-ok/30 bg-ok/10 text-ok"
              : "border-border bg-surface text-ink-dim",
          ].join(" ")}
        >
          <PlatformIcon platform={a.platform} size={14} />
          <span className="font-medium">{a.handle}</span>
          {a.connected && a.follower_count ? (
            <span className="opacity-70">· {fmtFollowers(a.follower_count)}</span>
          ) : !a.connected ? (
            <span className="opacity-70">· ยังไม่เชื่อม</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function Column({
  label,
  posts,
  actions,
}: {
  label: string;
  posts: Post[];
  actions: CardActions;
}) {
  return (
    <div className="flex w-[320px] shrink-0 flex-col rounded-xl border border-border bg-surface/40">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
          {label}
        </p>
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-dim">
          {posts.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {posts.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] text-ink-dim/60">
            ไม่มีโพสต์
          </p>
        ) : (
          posts.map((p) => <PostCard key={p.id} post={p} actions={actions} />)
        )}
      </div>
    </div>
  );
}

function PostCard({ post, actions }: { post: Post; actions: CardActions }) {
  const writer = EMPLOYEES.find((e) => e.slug === post.writer);
  const designer = EMPLOYEES.find((e) => e.slug === post.designer);
  const approver = EMPLOYEES.find((e) => e.slug === post.approved_by);

  const canSchedule = SCHEDULABLE.includes(post.status);

  return (
    <div
      onClick={() => actions.onOpen(post)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          actions.onOpen(post);
        }
      }}
      title="คลิกเพื่อดูโพสต์เต็ม"
      className="cursor-pointer rounded-lg border border-border bg-surface p-2.5 shadow-card transition hover:border-accent/50 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      <div className="flex items-center gap-1.5">
        <PlatformIcon platform={post.platform} size={16} />
        <StatusPill status={post.status} />
        {post.campaign && (
          <span className="ml-auto rounded bg-surface-2 px-1.5 py-0.5 text-[9.5px] text-ink-dim">
            {post.campaign}
          </span>
        )}
      </div>

      <p className="mt-2 text-[12.5px] font-medium leading-snug text-ink">
        {post.title}
      </p>

      <p className="mt-1 line-clamp-3 whitespace-pre-line text-[10.5px] leading-snug text-ink-dim">
        {post.copy}
      </p>

      {post.asset_file && (
        <AssetPreview path={post.asset_file} alt={post.title} />
      )}

      {(post.scheduled_at || post.published_at) && (
        <p className="mt-1.5 text-[10px] text-ink-dim/80">
          {post.status === "published" && post.published_at
            ? `เผยแพร่: ${fmtDate(post.published_at)}`
            : post.scheduled_at
              ? `ตั้งเวลา: ${fmtDate(post.scheduled_at)}`
              : ""}
        </p>
      )}

      {post.asset_prompt && (
        <details className="mt-1.5" onClick={(e) => e.stopPropagation()}>
          <summary className="cursor-pointer text-[10px] text-accent">
            🎨 Asset brief
          </summary>
          <p className="mt-1 line-clamp-4 rounded bg-surface-2/40 p-1.5 text-[10px] italic leading-snug text-ink-dim">
            {post.asset_prompt}
          </p>
        </details>
      )}

      {post.engagement && (
        <div className="mt-2 grid grid-cols-4 gap-1 rounded bg-surface-2/40 p-1.5 text-[10px]">
          <Stat label="❤" value={post.engagement.likes} />
          <Stat label="💬" value={post.engagement.comments} />
          <Stat label="↗" value={post.engagement.shares} />
          <Stat label="👁" value={post.engagement.views} />
        </div>
      )}

      {post.error_log && (
        <div
          className="mt-2 rounded border border-rose-400/40 bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-200"
          title={post.error_log}
        >
          <p className="font-medium">
            🔴 ยิงไม่ออก{post.attempt_count ? ` · ลอง ${post.attempt_count} ครั้ง` : ""}
          </p>
          <p className="mt-0.5 line-clamp-2 opacity-80">{post.error_log}</p>
          {post.last_attempt_at && (
            <p className="mt-0.5 text-[9px] opacity-60">
              ล่าสุด: {fmtDate(post.last_attempt_at)}
            </p>
          )}
        </div>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-1.5"
      >
        <div className="flex -space-x-1.5">
          {writer && <Avatar employee={writer} size={18} />}
          {designer && <Avatar employee={designer} size={18} />}
          {approver && <Avatar employee={approver} size={18} />}
        </div>
        <div className="flex items-center gap-1.5">
          {post.status === "publishing" && (
            <span
              className="inline-flex items-center gap-1 rounded border border-sky-400/40 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-200"
              title="กำลังเผยแพร่ขึ้น Facebook — รอสักครู่ อย่ากดซ้ำ"
            >
              <span className="h-2.5 w-2.5 animate-spin rounded-full border border-sky-300/40 border-t-sky-200" />
              กำลังเผยแพร่…
            </span>
          )}
          {canSchedule && (
            <button
              onClick={() => actions.onOpen(post)}
              disabled={actions.busyPostId === post.id}
              className="rounded border border-violet-400/40 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-200 hover:border-violet-300 disabled:opacity-50"
              title={post.status === "scheduled" ? "แก้เวลาตั้งโพสต์" : "ตั้งเวลาโพสต์"}
            >
              {post.status === "scheduled" ? "📅 แก้เวลา" : "📅 ตั้งเวลา"}
            </button>
          )}
          {post.status === "scheduled" && (
            <button
              onClick={() => actions.onPostNow(post.id)}
              disabled={actions.busyPostId === post.id}
              className="rounded border border-accent/40 bg-accent/15 px-1.5 py-0.5 text-[10px] text-ink hover:border-accent disabled:opacity-50"
              title="ยิงโพสต์เลย ไม่รอ scheduler"
            >
              {actions.busyPostId === post.id ? "…" : "▶ Post Now"}
            </button>
          )}
          {post.status === "failed" && (
            <button
              onClick={() => actions.onRetry(post.id)}
              disabled={actions.busyPostId === post.id}
              className="rounded border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200 hover:border-amber-300 disabled:opacity-50"
              title="reset attempt_count + error_log แล้วให้ trigger ลองใหม่"
            >
              {actions.busyPostId === post.id ? "…" : "↻ Retry"}
            </button>
          )}
          {/* Delete — visible for everything except already-published posts.
              Drafts/scheduled/failed get a one-click cleanup; published is
              skipped here on purpose (use Facebook directly for that). */}
          {post.status !== "published" && post.status !== "publishing" && (
            <button
              onClick={() => actions.onDelete(post)}
              disabled={actions.busyPostId === post.id}
              title="ลบโพสต์นี้ออกจากระบบ + Sheets (ไม่กระทบ Facebook)"
              className="rounded border border-rose-400/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-200 hover:border-rose-300 disabled:opacity-50"
            >
              {actions.busyPostId === post.id ? "…" : "🗑"}
            </button>
          )}
          {post.external_url ? (
            <a
              href={post.external_url}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-accent hover:underline"
            >
              เปิดโพสต์ ↗
            </a>
          ) : (
            <span className="text-[10px] text-ink-dim/60">
              {writer?.firstName || designer?.firstName || "—"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Build the dashboard URL for a local asset path. social-posts.json stores
 * paths like "outputs/content/foo.png"; the `/api/outputs/file/[...path]`
 * route mounts UNDER outputs/, so strip the leading "outputs/" first.
 */
function buildAssetUrl(p: string): string {
  const stripped = p.replace(/^outputs\//, "");
  return "/api/outputs/file/" + stripped.split("/").map(encodeURIComponent).join("/");
}

/** Format a Date into the value a <input type="datetime-local"> expects (local wall-clock). */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Full-post preview modal. Shows the complete copy, full-size asset (image or
 * inline video player) and all metadata that the compact card truncates — and,
 * for any not-yet-published post, an inline scheduler (datetime picker → set
 * status=scheduled + push to Sheets).
 */
function PostPreviewModal({
  post,
  busy,
  onClose,
  onSchedule,
}: {
  post: Post;
  busy: boolean;
  onClose: () => void;
  onSchedule: (postId: string, iso: string) => Promise<boolean>;
}) {
  const writer = EMPLOYEES.find((e) => e.slug === post.writer);
  const designer = EMPLOYEES.find((e) => e.slug === post.designer);
  const approver = EMPLOYEES.find((e) => e.slug === post.approved_by);
  const canSchedule = SCHEDULABLE.includes(post.status);

  const assetUrl = post.asset_file ? buildAssetUrl(post.asset_file) : null;
  const isVideo = !!post.asset_file && /\.(mp4|mov|webm|m4v)$/i.test(post.asset_file);
  const isImage = !!post.asset_file && /\.(png|jpe?g|webp|gif|avif|heic|heif)$/i.test(post.asset_file);

  // Default the picker to the existing schedule (in local time) or now+1h.
  const defaultWhen = useMemo(() => {
    if (post.scheduled_at && !Number.isNaN(Date.parse(post.scheduled_at))) {
      return toLocalInputValue(new Date(post.scheduled_at));
    }
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return toLocalInputValue(d);
  }, [post.scheduled_at]);
  const [when, setWhen] = useState(defaultWhen);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const submit = async () => {
    if (!when || busy) return;
    const iso = new Date(when).toISOString();
    const ok = await onSchedule(post.id, iso);
    if (ok) onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="my-auto w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <PlatformIcon platform={post.platform} size={18} />
          <StatusPill status={post.status} />
          {post.campaign && (
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-dim">
              {post.campaign}
            </span>
          )}
          <button
            onClick={onClose}
            className="ml-auto rounded-md px-2 py-0.5 text-lg leading-none text-ink-dim hover:bg-surface-2 hover:text-ink"
            title="ปิด (Esc)"
          >
            ×
          </button>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-4 py-3">
          <h3 className="text-sm font-semibold leading-snug text-ink">{post.title}</h3>

          {assetUrl && isVideo && (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={assetUrl}
              controls
              className="mt-3 max-h-[55vh] w-full rounded-lg border border-border bg-black"
            />
          )}
          {assetUrl && isImage && (
            <a href={assetUrl} target="_blank" rel="noreferrer" title="เปิดรูปต้นฉบับ">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl}
                alt={post.title}
                className="mt-3 max-h-[55vh] w-full rounded-lg border border-border object-contain"
              />
            </a>
          )}
          {assetUrl && !isVideo && !isImage && (
            <a
              href={assetUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex items-center gap-1.5 rounded-md border border-border bg-surface-2/40 px-2 py-1.5 text-[11px] text-ink-dim hover:text-accent"
            >
              📎 {post.asset_file?.split("/").pop()}
            </a>
          )}

          <p className="mt-3 whitespace-pre-line text-[12.5px] leading-relaxed text-ink">
            {post.copy}
          </p>

          {post.asset_prompt && (
            <div className="mt-3 rounded-md bg-surface-2/40 p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-dim">
                🎨 Asset brief
              </p>
              <p className="mt-1 whitespace-pre-line text-[11px] italic leading-snug text-ink-dim">
                {post.asset_prompt}
              </p>
            </div>
          )}

          {post.notes && (
            <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] leading-snug text-amber-200">
              <span className="font-semibold">📝 Notes: </span>
              <span className="whitespace-pre-line">{post.notes}</span>
            </div>
          )}

          {(post.scheduled_at || post.published_at) && (
            <p className="mt-3 text-[11px] text-ink-dim">
              {post.published_at
                ? `เผยแพร่: ${fmtDate(post.published_at)}`
                : post.scheduled_at
                  ? `ตั้งเวลาไว้: ${fmtDate(post.scheduled_at)}`
                  : ""}
            </p>
          )}

          {post.engagement && (
            <div className="mt-3 grid grid-cols-4 gap-1 rounded bg-surface-2/40 p-2 text-[11px]">
              <Stat label="❤" value={post.engagement.likes} />
              <Stat label="💬" value={post.engagement.comments} />
              <Stat label="↗" value={post.engagement.shares} />
              <Stat label="👁" value={post.engagement.views} />
            </div>
          )}

          {post.error_log && (
            <div className="mt-3 rounded border border-rose-400/40 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-200">
              <p className="font-medium">
                🔴 ยิงไม่ออก{post.attempt_count ? ` · ลอง ${post.attempt_count} ครั้ง` : ""}
              </p>
              <p className="mt-0.5 whitespace-pre-line opacity-80">{post.error_log}</p>
            </div>
          )}

          <div className="mt-3 flex items-center gap-3 border-t border-border/60 pt-2 text-[10px] text-ink-dim">
            {writer && <span>✍ {writer.firstName}</span>}
            {designer && <span>🎨 {designer.firstName}</span>}
            {approver && <span>✓ {approver.firstName}</span>}
            <span className="ml-auto font-mono opacity-60">{post.id}</span>
          </div>

          {post.status === "publishing" && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-500/5 p-3 text-[11px] text-sky-200">
              <span className="h-3 w-3 animate-spin rounded-full border border-sky-300/40 border-t-sky-200" />
              กำลังเผยแพร่ขึ้น Facebook — รอสักครู่ อย่ากดซ้ำ
            </div>
          )}

          {/* Scheduler */}
          {canSchedule && (
            <div className="mt-3 rounded-lg border border-violet-400/30 bg-violet-500/5 p-3">
              <p className="text-[11px] font-semibold text-violet-200">
                📅 {post.status === "scheduled" ? "แก้เวลาตั้งโพสต์" : "ตั้งเวลาโพสต์"}
              </p>
              <p className="mt-0.5 text-[10px] text-ink-dim">
                ตั้งแล้ว Apps Script จะโพสต์ขึ้น Facebook เองเมื่อถึงเวลา (เช็คทุก 5 นาที)
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-[12px] text-ink [color-scheme:dark]"
                />
                <button
                  onClick={submit}
                  disabled={busy || !when}
                  className="rounded-md bg-violet-500/80 px-3 py-1 text-[12px] font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {busy ? "กำลังตั้ง…" : post.status === "scheduled" ? "อัปเดตเวลา" : "เข้า schedule"}
                </button>
              </div>
            </div>
          )}

          {post.external_url && (
            <a
              href={post.external_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-[12px] text-accent hover:underline"
            >
              เปิดโพสต์บน Facebook ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Render the post's image asset (or a file chip if it's a non-image).
 * `path` comes from social-posts.json as something like
 *   "outputs/content/foo.png" — the `/api/outputs/file/[...path]` route
 * mounts UNDER outputs/, so we strip the leading "outputs/" before
 * building the URL. Hide the element on load error so a stale row
 * pointing at a missing file doesn't show a broken-image icon.
 */
function AssetPreview({ path, alt }: { path: string; alt?: string }) {
  const [hidden, setHidden] = useState(false);
  const isImage = /\.(png|jpe?g|webp|gif|avif|heic|heif)$/i.test(path);
  const url = buildAssetUrl(path);
  if (hidden) return null;
  if (!isImage) {
    return (
      <div className="mt-2 flex items-center gap-1.5 rounded-md border border-border bg-surface-2/40 px-2 py-1 text-[10px] text-ink-dim">
        <span>📎</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="truncate hover:text-accent"
          title={path}
        >
          {path.split("/").pop()}
        </a>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="mt-2 block overflow-hidden rounded-md border border-border bg-surface-2/40"
      title="คลิกเพื่อเปิดรูปต้นฉบับ"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt || path}
        loading="lazy"
        className="block max-h-[200px] w-full object-cover"
        onError={() => setHidden(true)}
      />
    </a>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="text-center">
      <p className="text-ink-dim">{label}</p>
      <p className="font-mono text-ink">{fmtNum(value ?? 0)}</p>
    </div>
  );
}

function StatusPill({ status }: { status: PostStatus }) {
  const map: Record<PostStatus, { label: string; cls: string }> = {
    draft: { label: "draft", cls: "bg-ink-dim/15 text-ink-dim" },
    ready_for_review: { label: "review", cls: "bg-amber-500/15 text-amber-200" },
    approved: { label: "approved", cls: "bg-cyan-500/15 text-cyan-200" },
    scheduled: { label: "scheduled", cls: "bg-violet-500/15 text-violet-200" },
    publishing: { label: "publishing", cls: "bg-sky-500/20 text-sky-200 animate-pulse" },
    published: { label: "published", cls: "bg-emerald-500/15 text-emerald-200" },
    failed: { label: "failed", cls: "bg-rose-500/20 text-rose-200" },
  };
  const m = map[status] ?? { label: status, cls: "bg-ink-dim/15 text-ink-dim" };
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider ${m.cls}`}>
      {m.label}
    </span>
  );
}

function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  const p = platform.toLowerCase();
  const conf: Record<string, { bg: string; ch: string }> = {
    linkedin: { bg: "bg-sky-600", ch: "in" },
    facebook: { bg: "bg-blue-600", ch: "f" },
    instagram: { bg: "bg-gradient-to-br from-fuchsia-500 to-amber-500", ch: "📷" },
    x: { bg: "bg-black", ch: "𝕏" },
    twitter: { bg: "bg-black", ch: "𝕏" },
    tiktok: { bg: "bg-black", ch: "♪" },
    youtube: { bg: "bg-red-600", ch: "▶" },
  };
  const c = conf[p] || { bg: "bg-surface-2", ch: "?" };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded font-bold text-white ${c.bg}`}
      style={{ width: size, height: size, fontSize: size * 0.6 }}
      title={platform}
    >
      {c.ch}
    </span>
  );
}

function EmptySocial({ onPrompt }: { onPrompt: () => void }) {
  const team = EMPLOYEES.filter((e) => e.department === "Creator Team");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex -space-x-3">
        {team.map((m: EmployeeMeta) => (
          <Avatar key={m.slug} employee={m} size={48} ring />
        ))}
      </div>
      <div>
        <h2 className="text-base font-semibold text-ink">Creator Team พร้อมแล้ว</h2>
        <p className="mt-1 max-w-md text-sm text-ink-dim">
          ยังไม่มีโพสต์ในคิว — ลองพิมพ์ในห้องประชุมว่า{" "}
          <em>"@Noah เขียน LinkedIn post เปิดตัวคอร์ส"</em> แล้ว{" "}
          <em>"@Zara schedule พรุ่งนี้ 09:00"</em>
        </p>
      </div>
      <button
        onClick={onPrompt}
        className="rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-white hover:bg-accent"
      >
        ไปคุยกับ Creator Team
      </button>
    </div>
  );
}

function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtFollowers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k followers`;
  return `${n} followers`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("th-TH", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
