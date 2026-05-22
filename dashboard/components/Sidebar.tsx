"use client";

import { ACCENT_BG_SOFT, EmployeeMeta } from "@/lib/employees";
import { KpiItem, kpiStatusColor } from "./kpi-utils";
import Avatar from "./Avatar";

type ActiveStatus = "running" | "queued";

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
}

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
}: Props) {
  // Active employees float to the top; rest keep their original order.
  const active = employees.filter((e) => activeBySlug.has(e.slug));
  const idle = employees.filter((e) => !activeBySlug.has(e.slug));

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
        {active.length > 0 && (
          <>
            {!collapsed && (
              <p className="mb-2 flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                </span>
                กำลังทำงาน · {active.length}
              </p>
            )}
            <div className="mb-3 flex flex-col gap-1.5">
              {active.map((emp) => (
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
            {!collapsed && <div className="mb-2 h-px bg-border/60" />}
          </>
        )}

        {!collapsed && (
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-ink-dim/70">
            {active.length > 0 ? "ว่าง" : "พนักงาน · เข้าออฟฟิศใครก็ได้"}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          {idle.map((emp) => (
            <EmployeeRow
              key={emp.slug}
              employee={emp}
              kpis={kpis}
              active={selectedDirect === emp.slug}
              onAir={spotlight === emp.slug}
              activeStatus={null}
              onClick={() => onSelectDirect(emp.slug)}
              collapsed={collapsed}
            />
          ))}
        </div>
      </div>

      {!collapsed && (
        <footer className="border-t border-border px-4 py-2 text-[10px] text-ink-dim/70">
          Powered by <code className="text-accent">claude-opus-4-7</code>
        </footer>
      )}
    </aside>
  );
}

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
