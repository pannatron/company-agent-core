"use client";

import { EMPLOYEES } from "@/lib/employees";
import { formatNumber, KpiItem, kpiStatusColor, pctOfTarget } from "./kpi-utils";
import Avatar from "./Avatar";

interface Props {
  kpis: KpiItem[];
  updatedAt: string | null;
  fullScreen?: boolean;
}

export default function KpiPanel({ kpis, updatedAt, fullScreen = false }: Props) {
  const counts = {
    on_track: kpis.filter((k) => k.status === "on_track").length,
    at_risk: kpis.filter((k) => k.status === "at_risk").length,
    off_track: kpis.filter((k) => k.status === "off_track").length,
  };

  return (
    <aside
      className={[
        "flex h-full flex-col bg-surface/40 backdrop-blur-sm",
        fullScreen ? "" : "border-l border-border",
      ].join(" ")}
    >
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className={[
            "font-semibold uppercase tracking-wide text-ink-dim",
            fullScreen ? "text-sm text-ink" : "text-sm",
          ].join(" ")}>
            {fullScreen ? "KPI / OKR ของบริษัท" : "KPI Snapshot"}
          </h2>
          {updatedAt && (
            <span className="text-[10px] text-ink-dim/60">อัปเดต {updatedAt}</span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="pill pill-ok">
            <span className="status-dot ok" />
            on-track {counts.on_track}
          </span>
          <span className="pill pill-warn">
            <span className="status-dot warn" />
            at-risk {counts.at_risk}
          </span>
          <span className="pill pill-danger">
            <span className="status-dot danger" />
            off-track {counts.off_track}
          </span>
        </div>
      </header>

      <div className={["flex-1 overflow-y-auto p-3", fullScreen ? "" : ""].join(" ")}>
        {kpis.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-dim">ยังไม่มี KPI</p>
        ) : (
          <ul
            className={[
              fullScreen
                ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
                : "space-y-2",
            ].join(" ")}
          >
            {kpis.map((k) => (
              <KpiRow key={k.id} k={k} expanded={fullScreen} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function KpiRow({ k, expanded }: { k: KpiItem; expanded: boolean }) {
  const pct = pctOfTarget(k);
  const dot = kpiStatusColor(k.status);
  const owner = EMPLOYEES.find((e) => e.slug === k.owner);

  return (
    <li className="card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={["font-medium text-ink", expanded ? "text-sm" : "truncate text-sm"].join(" ")}>{k.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-dim">
            <span>{k.department}</span>
            {owner && (
              <>
                <span>·</span>
                <Avatar employee={owner} size={14} />
                <span>{owner.firstName}</span>
              </>
            )}
          </div>
        </div>
        <span className={`pill pill-${dot}`}>
          <span className={`status-dot ${dot}`} />
          {pct}%
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-base font-semibold text-ink">
          {formatNumber(k.current, k.unit)}
        </span>
        <span className="text-xs text-ink-dim">
          / {formatNumber(k.target, k.unit)} {k.unit}
        </span>
      </div>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/60">
        <div
          className={[
            "h-full transition-all",
            dot === "ok" && "bg-ok",
            dot === "warn" && "bg-warn",
            dot === "danger" && "bg-danger",
            dot === "muted" && "bg-ink-dim",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
        />
      </div>

      {k.note && (
        <p className="mt-1.5 text-[11px] leading-snug text-ink-dim/80">
          {k.note}
        </p>
      )}
    </li>
  );
}
