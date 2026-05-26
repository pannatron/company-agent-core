"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CompanyProfile } from "@/lib/companyProfile";
import { useJobStream, type ClientJob } from "@/lib/useJobStream";
import { EMPLOYEES, type EmployeeSlug } from "@/lib/employees";
import { KpiFile, KpiItem, pctOfTarget } from "@/components/kpi-utils";
import OfficeScene from "@/components/OfficeScene";
import OfficeConsole from "@/components/OfficeConsole";

export default function OfficePage() {
  const router = useRouter();
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [kpis, setKpis] = useState<KpiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLogo, setHasLogo] = useState(false);

  const { active, recent, connected } = useJobStream();

  // Persist mode so refresh keeps the user in Office.
  useEffect(() => {
    try {
      localStorage.setItem("ui.mode", "office");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const setupRes = await fetch("/api/setup");
        const setup = (await setupRes.json()) as {
          complete: boolean;
          profile: CompanyProfile;
        };
        if (!setup.complete) {
          router.replace("/setup");
          return;
        }
        setCompany(setup.profile);

        const kpiRes = await fetch("/api/kpi");
        const kpiJson = (await kpiRes.json()) as KpiFile;
        setKpis(kpiJson.kpis ?? []);

        const info = await fetch("/api/brand/logo?info=1")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (info?.exists) setHasLogo(true);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // Map of active job per employee slug.
  const jobsBySlug = useMemo(() => {
    const m = new Map<string, ClientJob>();
    // Prefer the most recent running/queued job per employee.
    for (const j of active) {
      const existing = m.get(j.employeeSlug);
      if (!existing || j.startedAt > existing.startedAt) {
        m.set(j.employeeSlug, j);
      }
    }
    return m;
  }, [active]);

  const workingNow = active.length;
  const totalAgents = EMPLOYEES.length;

  // Headline KPI alerts — same convention as dashboard.
  const alerts = useMemo(
    () =>
      kpis
        .filter((k) => k.status === "off_track" || k.status === "at_risk")
        .slice(0, 3),
    [kpis],
  );

  if (loading || !company) {
    return (
      <main className="flex h-screen items-center justify-center font-mono text-ink-dim">
        loading office…
      </main>
    );
  }

  const goDashboard = () => {
    try {
      localStorage.setItem("ui.mode", "dashboard");
    } catch {
      /* ignore */
    }
    router.push("/");
  };

  const openDirect = (slug: EmployeeSlug) => {
    try {
      localStorage.setItem("ui.mode", "dashboard");
      localStorage.setItem("ui.openDirect", slug);
    } catch {
      /* ignore */
    }
    router.push("/");
  };

  return (
    <main className="office-mode grid h-screen grid-rows-[auto_1fr_auto] bg-bg">
      {/* TOP BAR */}
      <header className="border-b-2 border-border bg-surface/60 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {hasLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/api/brand/logo"
                alt={company.name || "Logo"}
                className="h-8 w-8 shrink-0 border-2 border-border bg-surface-2 object-cover"
              />
            ) : (
              <div className="h-8 w-8 shrink-0 border-2 border-border bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
            )}
            <div className="hidden md:block">
              <p className="truncate font-mono text-sm font-bold uppercase tracking-wider text-ink">
                {company.name || "Virtual AI Company"}
              </p>
              <p className="font-mono text-[10px] text-ink-dim">
                {connected ? "● online" : "○ offline"} ·{" "}
                <span className="text-emerald-400">{workingNow}</span>/
                {totalAgents} agents working
              </p>
            </div>
          </div>

          <span className="hidden h-8 w-px shrink-0 bg-border md:block" />

          {/* KPI strip — pixel style */}
          <div className="hidden flex-1 items-center gap-2 lg:flex">
            {alerts.length === 0 ? (
              <span className="border-2 border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
                ✓ KPI ปกติทั้งหมด
              </span>
            ) : (
              alerts.map((k) => (
                <span
                  key={k.id}
                  className={[
                    "border-2 px-2 py-1 font-mono text-[10px] uppercase tracking-wider",
                    k.status === "off_track"
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-300",
                  ].join(" ")}
                  title={`${k.name}: ${k.current} / ${k.target} ${k.unit}`}
                >
                  {truncate(k.name, 20)} · {pctOfTarget(k)}%
                </span>
              ))
            )}
          </div>

          <div className="flex-1 lg:hidden" />

          {/* Mode switcher — back to dashboard */}
          <ModeSwitcher mode="office" onSwitch={goDashboard} />
        </div>
      </header>

      {/* OFFICE FLOOR */}
      <div className="min-h-0 overflow-hidden">
        <OfficeScene jobsBySlug={jobsBySlug} onOpenDirect={openDirect} />
      </div>

      {/* CONSOLE */}
      <OfficeConsole active={active} recentFinishes={recent} />
    </main>
  );
}

function ModeSwitcher({
  mode,
  onSwitch,
}: {
  mode: "dashboard" | "office";
  onSwitch: () => void;
}) {
  return (
    <div className="flex shrink-0 border-2 border-border bg-surface">
      <button
        onClick={mode === "office" ? onSwitch : undefined}
        className={[
          "px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition",
          mode === "dashboard"
            ? "bg-accent-soft text-white"
            : "text-ink-dim hover:bg-surface-2 hover:text-ink",
        ].join(" ")}
      >
        Dashboard
      </button>
      <button
        onClick={mode === "dashboard" ? onSwitch : undefined}
        className={[
          "px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition",
          mode === "office"
            ? "bg-accent-soft text-white"
            : "text-ink-dim hover:bg-surface-2 hover:text-ink",
        ].join(" ")}
      >
        Office
      </button>
    </div>
  );
}

function truncate(s: string, n: number) {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
