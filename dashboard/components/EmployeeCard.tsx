"use client";

import { EmployeeMeta } from "@/lib/employees";
import { kpiStatusColor, KpiItem } from "./kpi-utils";

interface Props {
  employee: EmployeeMeta;
  kpis: KpiItem[];
  active: boolean;
  onClick: () => void;
}

export default function EmployeeCard({
  employee,
  kpis,
  active,
  onClick,
}: Props) {
  const mine = kpis.filter((k) => employee.kpiIds.includes(k.id));
  const worst = worstStatus(mine.map((k) => k.status));
  const dot = kpiStatusColor(worst);

  return (
    <button
      onClick={onClick}
      className={[
        "group w-full rounded-xl border bg-surface p-3 text-left transition",
        active
          ? "border-accent ring-1 ring-accent"
          : "border-border hover:border-ink-dim/40 hover:bg-surface-2",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft/20 font-mono text-sm font-semibold text-accent">
          {employee.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`status-dot ${dot}`} />
            <p className="truncate text-sm font-semibold text-ink">
              {employee.name}
            </p>
          </div>
          <p className="truncate text-xs text-ink-dim">{employee.title}</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink-dim/80">
            {employee.blurb}
          </p>
        </div>
      </div>

      {mine.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-2">
          {mine.slice(0, 3).map((k) => (
            <span
              key={k.id}
              className={`pill pill-${pillTone(k.status)}`}
              title={k.name}
            >
              <span className={`status-dot ${kpiStatusColor(k.status)}`} />
              {abbreviate(k.name)}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function worstStatus(statuses: string[]): string {
  if (statuses.includes("off_track")) return "off_track";
  if (statuses.includes("at_risk")) return "at_risk";
  if (statuses.includes("on_track")) return "on_track";
  return "unknown";
}

function pillTone(s: string): "ok" | "warn" | "danger" | "muted" {
  if (s === "on_track") return "ok";
  if (s === "at_risk") return "warn";
  if (s === "off_track") return "danger";
  return "muted";
}

function abbreviate(name: string) {
  if (name.length <= 18) return name;
  return name.slice(0, 17) + "…";
}
