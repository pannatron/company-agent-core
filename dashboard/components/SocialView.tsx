"use client";

import { useEffect, useMemo, useState } from "react";
import { ACCENT_BG_SOFT, EMPLOYEES, EmployeeMeta } from "@/lib/employees";
import Avatar from "./Avatar";
import FBPanel from "./FBPanel";

type PostStatus = "draft" | "ready_for_review" | "approved" | "scheduled" | "published";

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
  engagement?: Engagement | null;
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

const COLUMNS: { key: PostStatus | "in_progress"; label: string; statuses: PostStatus[] }[] = [
  { key: "in_progress", label: "ร่าง / กำลังทำ", statuses: ["draft", "ready_for_review", "approved"] },
  { key: "scheduled", label: "ตั้งเวลาแล้ว", statuses: ["scheduled"] },
  { key: "published", label: "เผยแพร่แล้ว", statuses: ["published"] },
];

export default function SocialView({ refreshSignal, onPromptCreatorTeam }: Props) {
  const [data, setData] = useState<SocialFile | null>(null);
  const [loading, setLoading] = useState(true);

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
  }, [refreshSignal]);

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
        <button
          onClick={onPromptCreatorTeam}
          className="rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-white hover:bg-accent"
        >
          + ขอ creator team สร้างโพสต์
        </button>
      </header>

      <FBPanel refreshSignal={refreshSignal} />

      {data && <AccountsStrip accounts={data.accounts} />}

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
              />
            ))}
          </div>
        )}
      </div>
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

function Column({ label, posts }: { label: string; posts: Post[] }) {
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
          posts.map((p) => <PostCard key={p.id} post={p} />)
        )}
      </div>
    </div>
  );
}

function PostCard({ post }: { post: Post }) {
  const writer = EMPLOYEES.find((e) => e.slug === post.writer);
  const designer = EMPLOYEES.find((e) => e.slug === post.designer);
  const approver = EMPLOYEES.find((e) => e.slug === post.approved_by);

  return (
    <div className="rounded-lg border border-border bg-surface p-2.5 shadow-card">
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
        <details className="mt-1.5">
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

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-1.5">
        <div className="flex -space-x-1.5">
          {writer && <Avatar employee={writer} size={18} />}
          {designer && <Avatar employee={designer} size={18} />}
          {approver && <Avatar employee={approver} size={18} />}
        </div>
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
    published: { label: "published", cls: "bg-emerald-500/15 text-emerald-200" },
  };
  const m = map[status];
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
