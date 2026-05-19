"use client";

import { ACCENT_BG_SOFT, EmployeeMeta } from "@/lib/employees";
import { KpiItem, kpiStatusColor } from "./kpi-utils";
import Avatar from "./Avatar";

interface Props {
  employees: EmployeeMeta[];
  kpis: KpiItem[];
  /** Active speaker in Meeting Room — gets a small "ON-AIR" indicator */
  spotlight?: string | null;
  /** Direct-chat selection — null means user is in Meeting Room (no direct chat) */
  selectedDirect: string | null;
  onMeetingRoom: () => void;
  onSelectDirect: (slug: string) => void;
}

export default function TeamSidebar({
  employees,
  kpis,
  spotlight,
  selectedDirect,
  onMeetingRoom,
  onSelectDirect,
}: Props) {
  return (
    <aside className="flex h-full flex-col border-r border-border bg-surface/30">
      <div className="border-b border-border px-3 py-3">
        <button
          onClick={onMeetingRoom}
          className={[
            "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition",
            selectedDirect === null
              ? "bg-accent-soft text-white"
              : "bg-surface-2 text-ink-dim hover:text-ink",
          ].join(" ")}
        >
          <span className="text-base">🏛</span>
          <div className="flex-1">
            <p className="font-semibold">Meeting Room</p>
            <p className="text-[10px] opacity-80">ห้องประชุมกลาง — auto-dispatch</p>
          </div>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-ink-dim/70">
          พนักงาน · เข้าออฟฟิศใครก็ได้
        </p>
        <div className="flex flex-col gap-1.5">
          {employees.map((emp) => (
            <EmployeeRow
              key={emp.slug}
              employee={emp}
              kpis={kpis}
              active={selectedDirect === emp.slug}
              onAir={spotlight === emp.slug}
              onClick={() => onSelectDirect(emp.slug)}
            />
          ))}
        </div>
      </div>

      <footer className="border-t border-border px-4 py-2 text-[10px] text-ink-dim/70">
        Powered by <code className="text-accent">claude-opus-4-7</code>
      </footer>
    </aside>
  );
}

function EmployeeRow({
  employee,
  kpis,
  active,
  onAir,
  onClick,
}: {
  employee: EmployeeMeta;
  kpis: KpiItem[];
  active: boolean;
  onAir: boolean;
  onClick: () => void;
}) {
  const mine = kpis.filter((k) => employee.kpiIds.includes(k.id));
  const worst = worstStatus(mine.map((k) => k.status));

  return (
    <button
      onClick={onClick}
      className={[
        "group flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left text-sm transition",
        active
          ? "border-accent bg-surface text-ink"
          : "border-transparent hover:border-border hover:bg-surface",
      ].join(" ")}
    >
      <Avatar employee={employee} size={36} online={onAir} ring={onAir} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-medium text-ink">
            {employee.name}
          </p>
          {worst !== "unknown" && (
            <span className={`status-dot ${kpiStatusColor(worst)}`} />
          )}
        </div>
        <p className="truncate text-[10.5px] text-ink-dim">{employee.title}</p>
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
