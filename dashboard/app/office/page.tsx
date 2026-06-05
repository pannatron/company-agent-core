"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CompanyProfile } from "@/lib/companyProfile";
import { useJobStream, type ClientJob } from "@/lib/useJobStream";
import { EMPLOYEES, type EmployeeSlug } from "@/lib/employees";
import { KpiFile, KpiItem, pctOfTarget } from "@/components/kpi-utils";
import OfficeGame from "@/components/OfficeGame";
import OfficeConsole from "@/components/OfficeConsole";

export default function OfficePage() {
  const router = useRouter();
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [kpis, setKpis] = useState<KpiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLogo, setHasLogo] = useState(false);

  // Side toasts — pop in when any agent finishes, so the user notices even if
  // that desk's over-head bubble is off-screen (camera follows the player).
  const [toasts, setToasts] = useState<JobToast[]>([]);
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const handleFinish = useCallback((job: ClientJob) => {
    const t: JobToast = {
      id: job.id,
      slug: job.employeeSlug as EmployeeSlug,
      name: job.employeeName,
      accent: job.employeeAccent,
      status: job.status,
    };
    setToasts((cur) => [...cur.filter((x) => x.id !== t.id), t].slice(-4));
    const prev = toastTimers.current.get(t.id);
    if (prev) clearTimeout(prev);
    toastTimers.current.set(
      t.id,
      setTimeout(() => {
        setToasts((cur) => cur.filter((x) => x.id !== t.id));
        toastTimers.current.delete(t.id);
      }, 5000),
    );
  }, []);
  useEffect(() => {
    const timers = toastTimers.current;
    return () => timers.forEach((id) => clearTimeout(id));
  }, []);

  // Bumped each time a toast is clicked so OfficeGame re-opens that desk's chat.
  const [chatRequest, setChatRequest] = useState<{ slug: EmployeeSlug; n: number } | null>(null);
  const reqN = useRef(0);
  const openToastChat = useCallback((slug: EmployeeSlug) => {
    reqN.current += 1;
    setChatRequest({ slug, n: reqN.current });
    setToasts((cur) => cur.filter((x) => x.slug !== slug));
  }, []);

  const { active, recent, connected } = useJobStream({ onFinish: handleFinish });

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

  // Map of the job to surface per employee slug.
  const jobsBySlug = useMemo(() => {
    const m = new Map<string, ClientJob>();
    // Prefer the most recent running/queued job per employee.
    for (const j of active) {
      const existing = m.get(j.employeeSlug);
      if (!existing || j.startedAt > existing.startedAt) {
        m.set(j.employeeSlug, j);
      }
    }
    // For employees with no live job, surface their most-recent finished job so
    // OfficeGame can flash a brief "done ✅" bubble (it self-expires by
    // finishedAt — an old job here just renders idle Zzz).
    for (const j of recent) {
      if (active.some((a) => a.employeeSlug === j.employeeSlug)) continue;
      const existing = m.get(j.employeeSlug);
      if (!existing || j.startedAt > existing.startedAt) {
        m.set(j.employeeSlug, j);
      }
    }
    return m;
  }, [active, recent]);

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
      <div className="relative min-h-0 overflow-hidden">
        <OfficeGame
          jobsBySlug={jobsBySlug}
          onOpenDirect={openDirect}
          openRequest={chatRequest}
        />

        {/* Side toast stack — "job done" pop-ups; click to open that desk's chat */}
        <div className="absolute right-3 top-3 z-20 flex w-60 flex-col gap-2">
          {toasts.map((t) => (
            <ToastCard key={t.id} toast={t} onClick={() => openToastChat(t.slug)} />
          ))}
        </div>
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

interface JobToast {
  id: string;
  slug: EmployeeSlug;
  name: string;
  accent?: string;
  status: ClientJob["status"];
}

function ToastCard({ toast, onClick }: { toast: JobToast; onClick: () => void }) {
  const ok = toast.status === "done";
  const icon = ok ? "✅" : toast.status === "aborted" ? "🚫" : "⚠️";
  const label = ok ? "ทำงานเสร็จแล้ว" : toast.status === "aborted" ? "ถูกยกเลิก" : "เกิดข้อผิดพลาด";
  const accent = toast.accent || (ok ? "#34d399" : "#fb7185");
  return (
    <button
      type="button"
      onClick={onClick}
      className="office-toast flex w-full items-center gap-2.5 border-2 border-border bg-surface/95 px-3 py-2 text-left shadow-[3px_3px_0_0_rgba(0,0,0,0.35)] backdrop-blur-sm transition hover:bg-surface-2 hover:shadow-[4px_4px_0_0_rgba(0,0,0,0.45)] active:translate-x-[1px] active:translate-y-[1px]"
      style={{ borderLeftColor: accent, borderLeftWidth: 4 }}
    >
      <span className="text-base leading-none">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[11px] font-bold text-ink">
          {truncate(toast.name, 22)}
        </p>
        <p className="font-mono text-[9px] uppercase tracking-wider text-ink-dim">
          {label} · กดเปิดแชท
        </p>
      </div>
      <span className="font-mono text-xs text-ink-dim">›</span>
    </button>
  );
}

function truncate(s: string, n: number) {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
