"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CompanyProfile } from "@/lib/companyProfile";
import { formatNumber, KpiItem, kpiStatusColor, pctOfTarget } from "./kpi-utils";

export type ViewKey = "meeting" | "tasks" | "social" | "kpi" | "data" | "files";

interface Props {
  company: CompanyProfile;
  kpis: KpiItem[];
  view: ViewKey;
  onView: (v: ViewKey) => void;
  onReconfigure: () => void;
}

const TABS: { key: ViewKey; label: string; icon: string }[] = [
  { key: "meeting", label: "Meeting", icon: "🏛" },
  { key: "tasks", label: "Tasks", icon: "📋" },
  { key: "social", label: "Social", icon: "📱" },
  { key: "kpi", label: "KPI", icon: "📈" },
  { key: "data", label: "Data", icon: "📊" },
  { key: "files", label: "Files", icon: "📁" },
];

export default function TopBar({
  company,
  kpis,
  view,
  onView,
  onReconfigure,
}: Props) {
  const router = useRouter();
  const goOffice = () => {
    try {
      localStorage.setItem("ui.mode", "office");
    } catch {
      /* ignore */
    }
    router.push("/office");
  };
  // Surface only KPIs that need attention (worst first, max 2)
  const alerts = kpis
    .filter((k) => k.status === "off_track" || k.status === "at_risk")
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))
    .slice(0, 2);

  // Probe whether a real logo exists. Falls back to gradient mark if not.
  const [hasLogo, setHasLogo] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/brand/logo?info=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((info: { exists?: boolean } | null) => {
        if (alive && info?.exists) setHasLogo(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <header className="flex items-center gap-3 border-b border-border bg-surface/40 px-4 py-2 backdrop-blur-sm">
      {/* Company brand (compact) */}
      <div className="flex min-w-0 items-center gap-2.5">
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/api/brand/logo"
            alt={company.name || "Logo"}
            className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-border bg-surface-2"
          />
        ) : (
          <div className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
        )}
        <p className="hidden truncate text-sm font-semibold text-ink md:block">
          {company.name || "Virtual AI Company"}
        </p>
      </div>

      <span className="hidden h-6 w-px shrink-0 bg-border md:block" />

      {/* Tabs (primary nav) */}
      <nav className="flex shrink-0 items-center gap-0.5">
        {TABS.map((t) => {
          const active = t.key === view;
          return (
            <button
              key={t.key}
              onClick={() => onView(t.key)}
              className={[
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                active
                  ? "bg-surface-2 text-ink shadow-sm ring-1 ring-border"
                  : "text-ink-dim hover:bg-surface-2/60 hover:text-ink",
              ].join(" ")}
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* KPI alerts (only off-track / at-risk) */}
      <div className="hidden items-center gap-1.5 lg:flex">
        {alerts.length === 0 ? (
          <span className="rounded-md bg-surface-2/60 px-2 py-1 text-[10px] text-ink-dim">
            ✓ KPI ปกติ
          </span>
        ) : (
          alerts.map((k) => <KpiAlert key={k.id} k={k} />)
        )}
      </div>

      {/* Mode switcher — jump to Office simulation */}
      <button
        onClick={goOffice}
        title="สลับไปโหมด Office (จำลอง)"
        className="hidden items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-ink-dim hover:border-accent hover:text-ink sm:flex"
      >
        <span>🏢</span>
        <span>Office mode</span>
      </button>

      {/* Settings */}
      <button
        onClick={onReconfigure}
        title="ตั้งค่าบริษัท"
        className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs text-ink-dim hover:border-accent hover:text-ink"
      >
        ⚙
      </button>
    </header>
  );
}

function KpiAlert({ k }: { k: KpiItem }) {
  const dot = kpiStatusColor(k.status);
  const pct = pctOfTarget(k);
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[11px]"
      title={`${k.name}: ${formatNumber(k.current, k.unit)} / ${formatNumber(k.target, k.unit)} ${k.unit}`}
    >
      <span className={`status-dot ${dot}`} />
      <span className="max-w-[140px] truncate text-ink">{k.name}</span>
      <span className="font-mono text-ink-dim">{pct}%</span>
    </div>
  );
}

function statusRank(s: string): number {
  if (s === "off_track") return 0;
  if (s === "at_risk") return 1;
  if (s === "on_track") return 2;
  return 3;
}
