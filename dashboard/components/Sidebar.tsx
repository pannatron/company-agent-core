"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ACCENT_BG_SOFT, EmployeeMeta } from "@/lib/employees";
import { KpiItem, kpiStatusColor } from "./kpi-utils";
import Avatar from "./Avatar";

type ActiveStatus = "running" | "queued";

interface ChatListItem {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  message_count: number;
}

interface Props {
  employees: EmployeeMeta[];
  kpis: KpiItem[];
  /** Active speaker in Meeting Room — gets a small "ON-AIR" indicator */
  spotlight?: string | null;
  /** Direct-chat selection — null means user is in Meeting Room (no direct chat) */
  selectedDirect: string | null;
  onMeetingRoom: () => void;
  onSelectDirect: (slug: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** slug → status of employees currently running a turn anywhere. */
  activeBySlug: Map<string, ActiveStatus>;
  /** Bump to trigger re-fetch of recent chats (parent ticks this after each agent turn). */
  refreshSignal?: number;
}

const LS_ALL_EMP_OPEN = "ui.sidebar.allEmployeesOpen";

export default function TeamSidebar({
  employees,
  kpis,
  spotlight,
  selectedDirect,
  onMeetingRoom,
  onSelectDirect,
  collapsed,
  onToggleCollapse,
  activeBySlug,
  refreshSignal,
}: Props) {
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Hydrate dropdown state from localStorage once.
  useEffect(() => {
    try {
      setShowAll(localStorage.getItem(LS_ALL_EMP_OPEN) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const reloadChats = useCallback(async () => {
    try {
      const r = await fetch("/api/chats");
      const d = await r.json();
      setChats(Array.isArray(d?.chats) ? d.chats : []);
    } catch {
      /* ignore — keep last known list */
    }
  }, []);

  useEffect(() => {
    void reloadChats();
  }, [reloadChats, refreshSignal]);

  // Poll lightly so a chat the user just opened starts showing up without
  // waiting for the parent's per-turn refreshSignal tick.
  useEffect(() => {
    const id = setInterval(() => {
      void reloadChats();
    }, 8000);
    return () => clearInterval(id);
  }, [reloadChats]);

  const empBySlug = useMemo(() => {
    const m = new Map<string, EmployeeMeta>();
    for (const e of employees) m.set(e.slug, e);
    return m;
  }, [employees]);

  // Recent direct chats — only ones with any messages, sorted server-side
  // by updated_at desc. Skip entries whose slug we can't resolve (stale chat
  // file from a removed employee).
  const recents = useMemo(() => {
    return chats
      .filter(
        (c) =>
          c.message_count > 0 &&
          c.id.startsWith("direct-") &&
          empBySlug.has(c.id.slice("direct-".length)),
      )
      .map((c) => ({
        ...c,
        slug: c.id.slice("direct-".length),
        emp: empBySlug.get(c.id.slice("direct-".length))!,
      }));
  }, [chats, empBySlug]);

  const recentSlugSet = useMemo(
    () => new Set(recents.map((r) => r.slug)),
    [recents],
  );

  // Employees that haven't been chatted with yet (or were cleared) — these
  // live under the dropdown so the recent list stays focused. Active /
  // working ones float to the top of the dropdown.
  const others = useMemo(() => {
    const rest = employees.filter((e) => !recentSlugSet.has(e.slug));
    const active = rest.filter((e) => activeBySlug.has(e.slug));
    const idle = rest.filter((e) => !activeBySlug.has(e.slug));
    return [...active, ...idle];
  }, [employees, recentSlugSet, activeBySlug]);

  async function clearChat(id: string, title: string) {
    if (
      !confirm(
        `เคลียร์ประวัติแชท "${title}"?\n\nลบข้อความทั้งหมดในห้องนี้ (ไม่กระทบไฟล์ในโปรเจกต์)`,
      )
    )
      return;
    setBusyId(id);
    try {
      await fetch(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE" });
      await reloadChats();
    } finally {
      setBusyId(null);
    }
  }

  async function clearAllRecents() {
    if (recents.length === 0) return;
    if (
      !confirm(
        `เคลียร์ประวัติทุกห้อง? (${recents.length} ห้อง)\n\nลบประวัติแชทกับพนักงานทุกคน — Meeting Room ไม่โดน`,
      )
    )
      return;
    setBusyId("__all__");
    try {
      await Promise.all(
        recents.map((c) =>
          fetch(`/api/chats/${encodeURIComponent(c.id)}`, { method: "DELETE" }),
        ),
      );
      await reloadChats();
    } finally {
      setBusyId(null);
    }
  }

  function toggleShowAll(next: boolean) {
    setShowAll(next);
    try {
      localStorage.setItem(LS_ALL_EMP_OPEN, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  return (
    <aside className="flex h-full flex-col border-r border-border bg-surface/30">
      <div className="flex items-center gap-1 border-b border-border px-2 py-2">
        <button
          onClick={onMeetingRoom}
          title="Meeting Room"
          className={[
            "flex flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition",
            selectedDirect === null
              ? "bg-accent-soft text-white"
              : "bg-surface-2 text-ink-dim hover:text-ink",
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <span className="text-base">🏛</span>
          {!collapsed && (
            <div className="flex-1">
              <p className="text-[13px] font-semibold leading-tight">Meeting Room</p>
              <p className="text-[10px] opacity-80">ห้องประชุมกลาง</p>
            </div>
          )}
        </button>
        <button
          onClick={onToggleCollapse}
          title={collapsed ? "ขยาย sidebar" : "ย่อ sidebar"}
          className="shrink-0 rounded-md border border-border bg-surface px-1.5 py-1.5 text-xs text-ink-dim hover:border-accent hover:text-ink"
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {/* ── Recent chats ── */}
        {recents.length > 0 && (
          <section className="mb-3">
            {!collapsed && (
              <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-dim/70">
                  คุยล่าสุด · {recents.length}
                </p>
                <button
                  onClick={clearAllRecents}
                  disabled={busyId === "__all__"}
                  title="เคลียร์ประวัติทุกห้อง"
                  className="rounded px-1.5 py-0.5 text-[10px] text-ink-dim/70 hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                >
                  {busyId === "__all__" ? "…" : "เคลียร์ทั้งหมด"}
                </button>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              {recents.map((c) => (
                <ChatRow
                  key={c.id}
                  employee={c.emp}
                  kpis={kpis}
                  active={selectedDirect === c.slug}
                  onAir={spotlight === c.slug}
                  activeStatus={activeBySlug.get(c.slug) ?? null}
                  updatedAt={c.updated_at}
                  messageCount={c.message_count}
                  onClick={() => onSelectDirect(c.slug)}
                  onClear={() => clearChat(c.id, c.title)}
                  busy={busyId === c.id || busyId === "__all__"}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── All employees (dropdown when there's a recent list to hide behind) ── */}
        {others.length > 0 && (
          <section>
            {!collapsed && (
              <button
                onClick={() => toggleShowAll(!showAll)}
                className="mb-1.5 flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-dim/70 hover:bg-surface hover:text-ink"
                title={showAll ? "ซ่อนรายชื่อพนักงานทั้งหมด" : "ดูพนักงานทั้งหมด"}
              >
                <span>
                  {recents.length > 0 ? "พนักงานคนอื่น" : "พนักงานทั้งหมด"} · {others.length}
                </span>
                <span className="text-[11px] text-ink-dim/60">
                  {showAll ? "▾" : "▸"}
                </span>
              </button>
            )}

            {/* When collapsed → always show; when expanded → hide behind dropdown
                only if we have any recent chats to keep visible above. */}
            {(collapsed || showAll || recents.length === 0) && (
              <div className="flex flex-col gap-1.5">
                {others.map((emp) => (
                  <EmployeeRow
                    key={emp.slug}
                    employee={emp}
                    kpis={kpis}
                    active={selectedDirect === emp.slug}
                    onAir={spotlight === emp.slug}
                    activeStatus={activeBySlug.get(emp.slug) ?? null}
                    onClick={() => onSelectDirect(emp.slug)}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {!collapsed && (
        <footer className="border-t border-border px-4 py-2 text-[10px] text-ink-dim/70">
          Powered by <code className="text-accent">claude-opus-4-8</code>
        </footer>
      )}
    </aside>
  );
}

/** Recent-chat row: same look as EmployeeRow but with last-updated chip
 *  and a 🗑 button that appears on hover (expanded mode only). */
function ChatRow({
  employee,
  kpis,
  active,
  onAir,
  activeStatus,
  updatedAt,
  messageCount,
  onClick,
  onClear,
  busy,
  collapsed,
}: {
  employee: EmployeeMeta;
  kpis: KpiItem[];
  active: boolean;
  onAir: boolean;
  activeStatus: ActiveStatus | null;
  updatedAt: string;
  messageCount: number;
  onClick: () => void;
  onClear: () => void;
  busy: boolean;
  collapsed: boolean;
}) {
  const mine = kpis.filter((k) => employee.kpiIds.includes(k.id));
  const worst = worstStatus(mine.map((k) => k.status));
  const isWorking = activeStatus === "running";
  const isQueued = activeStatus === "queued";
  const ago = relativeTime(updatedAt);

  if (collapsed) {
    return (
      <button
        onClick={onClick}
        title={`${employee.name} · ${employee.title} · ${messageCount} ข้อความ · ${ago}`}
        className={[
          "group relative flex items-center justify-center rounded-lg border p-1 transition",
          isWorking
            ? "border-accent/60 bg-accent-soft/15"
            : active
              ? "border-accent bg-surface"
              : "border-transparent hover:border-border hover:bg-surface",
        ].join(" ")}
      >
        <Avatar employee={employee} size={36} online={onAir || isWorking} ring={onAir || isWorking} />
        {isWorking && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
        )}
        {!isWorking && worst !== "unknown" && (
          <span
            className={`absolute right-0.5 top-0.5 status-dot ${kpiStatusColor(worst)}`}
          />
        )}
      </button>
    );
  }

  return (
    <div
      className={[
        "group relative flex items-center gap-2.5 rounded-lg border pl-2 pr-1 py-1.5 text-left text-sm transition",
        isWorking
          ? "border-accent/60 bg-accent-soft/10 shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
          : active
            ? "border-accent bg-surface text-ink"
            : "border-transparent hover:border-border hover:bg-surface",
      ].join(" ")}
    >
      <button
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
      >
        <Avatar
          employee={employee}
          size={36}
          online={onAir || isWorking}
          ring={onAir || isWorking}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-medium text-ink">
              {employee.name}
            </p>
            {!isWorking && !isQueued && worst !== "unknown" && (
              <span className={`status-dot ${kpiStatusColor(worst)}`} />
            )}
          </div>
          {isWorking ? (
            <p className="flex items-center gap-1 text-[10.5px] font-medium text-accent">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              ทำงานอยู่…
            </p>
          ) : isQueued ? (
            <p className="text-[10.5px] font-medium text-warn">⏳ รอคิว</p>
          ) : (
            <p className="truncate text-[10.5px] text-ink-dim/80">
              {messageCount} ข้อความ · {ago}
            </p>
          )}
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        disabled={busy}
        title="เคลียร์ประวัติห้องนี้"
        className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-ink-dim/50 opacity-0 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100 disabled:opacity-50"
      >
        {busy ? "…" : "🗑"}
      </button>
    </div>
  );
}

/** Employee row — used in the "all employees" dropdown for slugs that
 *  haven't been chatted with yet. Mirrors the old Sidebar row exactly. */
function EmployeeRow({
  employee,
  kpis,
  active,
  onAir,
  activeStatus,
  onClick,
  collapsed,
}: {
  employee: EmployeeMeta;
  kpis: KpiItem[];
  active: boolean;
  onAir: boolean;
  activeStatus: ActiveStatus | null;
  onClick: () => void;
  collapsed: boolean;
}) {
  const mine = kpis.filter((k) => employee.kpiIds.includes(k.id));
  const worst = worstStatus(mine.map((k) => k.status));
  const isWorking = activeStatus === "running";
  const isQueued = activeStatus === "queued";

  if (collapsed) {
    return (
      <button
        onClick={onClick}
        title={`${employee.name} · ${employee.title}${isWorking ? " · กำลังทำงาน" : isQueued ? " · รอคิว" : ""}`}
        className={[
          "group relative flex items-center justify-center rounded-lg border p-1 transition",
          isWorking
            ? "border-accent/60 bg-accent-soft/15"
            : active
              ? "border-accent bg-surface"
              : "border-transparent hover:border-border hover:bg-surface",
        ].join(" ")}
      >
        <Avatar employee={employee} size={36} online={onAir || isWorking} ring={onAir || isWorking} />
        {isWorking && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
        )}
        {!isWorking && worst !== "unknown" && (
          <span
            className={`absolute right-0.5 top-0.5 status-dot ${kpiStatusColor(worst)}`}
          />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={[
        "group flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left text-sm transition",
        isWorking
          ? "border-accent/60 bg-accent-soft/10 shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
          : active
            ? "border-accent bg-surface text-ink"
            : "border-transparent hover:border-border hover:bg-surface",
      ].join(" ")}
    >
      <Avatar
        employee={employee}
        size={36}
        online={onAir || isWorking}
        ring={onAir || isWorking}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-medium text-ink">
            {employee.name}
          </p>
          {!isWorking && !isQueued && worst !== "unknown" && (
            <span className={`status-dot ${kpiStatusColor(worst)}`} />
          )}
        </div>
        {isWorking ? (
          <p className="flex items-center gap-1 text-[10.5px] font-medium text-accent">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            ทำงานอยู่…
          </p>
        ) : isQueued ? (
          <p className="text-[10.5px] font-medium text-warn">⏳ รอคิว</p>
        ) : (
          <p className="truncate text-[10.5px] text-ink-dim">{employee.title}</p>
        )}
      </div>
      <span
        className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${ACCENT_BG_SOFT[employee.accent]}`}
      >
        {employee.firstName}
      </span>
    </button>
  );
}

function worstStatus(statuses: string[]): string {
  if (statuses.includes("off_track")) return "off_track";
  if (statuses.includes("at_risk")) return "at_risk";
  if (statuses.includes("on_track")) return "on_track";
  return "unknown";
}

/** "5 นาทีที่แล้ว", "2 ชม.", "เมื่อวาน", "3 วัน", or short date for older. */
function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  if (diffMs < 0) return "ตอนนี้";
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "เมื่อกี้";
  if (min < 60) return `${min} นาที`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "เมื่อวาน";
  if (day < 7) return `${day} วัน`;
  const d = new Date(t);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
