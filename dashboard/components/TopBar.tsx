"use client";

import { CompanyProfile } from "@/lib/companyProfile";
import { formatNumber, KpiItem, kpiStatusColor, pctOfTarget } from "./kpi-utils";

export type ViewKey = "meeting" | "tasks" | "social" | "kpi" | "files";

interface Props {
  company: CompanyProfile;
  kpis: KpiItem[];
  view: ViewKey;
  onView: (v: ViewKey) => void;
  onReconfigure: () => void;
}

const TABS: { key: ViewKey; label: string; icon: string }[] = [
  { key: "meeting", label: "Meeting Room", icon: "🏛" },
  { key: "tasks", label: "Task Board", icon: "📋" },
  { key: "social", label: "Social", icon: "📱" },
  { key: "kpi", label: "KPI Detail", icon: "📊" },
  { key: "files", label: "Files", icon: "📁" },
];

export default function TopBar({
  company,
  kpis,
  view,
  onView,
  onReconfigure,
}: Props) {
  // pick 3 KPIs to surface — prefer KPIs that are worst first
  const sorted = [...kpis].sort((a, b) => statusRank(a.status) - statusRank(b.status));
  const featured = sorted.slice(0, 3);

  return (
    <header className="border-b border-border bg-surface/40 backdrop-blur-sm">
      <div className="flex items-stretch">
        {/* Company brand */}
        <div className="flex items-center gap-3 border-r border-border px-5 py-3">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {company.name || "Virtual AI Company"}
            </p>
            <p className="truncate text-[11px] text-ink-dim">
              {company.industry} · ทีม {company.team_size} คน · {company.currency}
            </p>
          </div>
        </div>

        {/* KPI strip */}
        <div className="flex flex-1 items-center gap-2 overflow-x-auto px-4 py-2">
          {featured.length === 0 ? (
            <p className="text-xs text-ink-dim">ยังไม่มี KPI</p>
          ) : (
            featured.map((k) => <KpiMini key={k.id} k={k} />)
          )}
        </div>

        {/* Settings */}
        <div className="flex items-center border-l border-border px-3">
          <button
            onClick={onReconfigure}
            className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-ink-dim hover:border-accent hover:text-ink"
          >
            ⚙ ตั้งค่าบริษัท
          </button>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex items-center gap-1 border-t border-border/50 px-4">
        {TABS.map((t) => {
          const active = t.key === view;
          return (
            <button
              key={t.key}
              onClick={() => onView(t.key)}
              className={[
                "relative px-3 py-2.5 text-xs font-medium transition",
                active ? "text-ink" : "text-ink-dim hover:text-ink",
              ].join(" ")}
            >
              <span className="mr-1.5">{t.icon}</span>
              {t.label}
              {active && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function KpiMini({ k }: { k: KpiItem }) {
  const dot = kpiStatusColor(k.status);
  const pct = pctOfTarget(k);
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs">
      <span className={`status-dot ${dot}`} />
      <div className="leading-tight">
        <p className="text-[10px] uppercase tracking-wide text-ink-dim/80">
          {k.name}
        </p>
        <p className="font-mono text-ink">
          {formatNumber(k.current, k.unit)}
          <span className="text-ink-dim">
            {" / "}
            {formatNumber(k.target, k.unit)} {k.unit}
          </span>
          <span className="ml-1.5 text-[10px] text-ink-dim/70">({pct}%)</span>
        </p>
      </div>
    </div>
  );
}

function statusRank(s: string): number {
  if (s === "off_track") return 0;
  if (s === "at_risk") return 1;
  if (s === "on_track") return 2;
  return 3;
}
