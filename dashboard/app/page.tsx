"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopBar, { type ViewKey } from "@/components/TopBar";
import TeamSidebar from "@/components/Sidebar";
import MeetingRoom from "@/components/MeetingRoom";
import ChatPane from "@/components/ChatPane";
import TaskBoardView from "@/components/TaskBoard";
import SocialView from "@/components/SocialView";
import KpiPanel from "@/components/KpiPanel";
import FilesView from "@/components/FilesView";
import { EmployeeMeta, EMPLOYEES, EmployeeSlug } from "@/lib/employees";
import { KpiFile, KpiItem } from "@/components/kpi-utils";
import { CompanyProfile } from "@/lib/companyProfile";

export default function HomePage() {
  const router = useRouter();
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [kpis, setKpis] = useState<KpiItem[]>([]);
  const [kpiUpdated, setKpiUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<ViewKey>("meeting");
  /** null = central meeting room, otherwise slug = direct chat */
  const [direct, setDirect] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<EmployeeSlug | null>(null);
  const [seedPrompt, setSeedPrompt] = useState<string | null>(null);
  const [tasksRefresh, setTasksRefresh] = useState(0);

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
        setKpiUpdated(kpiJson.updated_at ?? null);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // Re-fetch KPIs whenever an agent finishes a turn (they may have edited kpi.json)
  const refreshKpi = useCallback(async () => {
    try {
      const res = await fetch("/api/kpi");
      const j = (await res.json()) as KpiFile;
      setKpis(j.kpis ?? []);
      setKpiUpdated(j.updated_at ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  const onAgentTurn = useCallback(() => {
    setTasksRefresh((n) => n + 1);
    refreshKpi();
  }, [refreshKpi]);

  if (loading || !company) {
    return (
      <main className="flex h-screen items-center justify-center text-ink-dim">
        กำลังโหลดข้อมูลบริษัท…
      </main>
    );
  }

  const directEmployee = direct
    ? EMPLOYEES.find((e) => e.slug === direct)
    : undefined;

  return (
    <main className="grid h-screen grid-rows-[auto_1fr] bg-bg">
      <TopBar
        company={company}
        kpis={kpis}
        view={view}
        onView={setView}
        onReconfigure={() => router.push("/setup")}
      />

      <div className="grid min-h-0 grid-cols-[260px_1fr_320px]">
        <TeamSidebar
          employees={EMPLOYEES}
          kpis={kpis}
          spotlight={spotlight}
          selectedDirect={direct}
          onMeetingRoom={() => {
            setDirect(null);
            setView("meeting");
          }}
          onSelectDirect={(slug) => {
            setDirect(slug);
            setView("meeting"); // direct chat lives inside the "meeting" slot
          }}
        />

        <div className="flex min-h-0 flex-col">
          {view === "meeting" &&
            (direct && directEmployee ? (
              <DirectChatHeader
                employee={directEmployee}
                onExit={() => setDirect(null)}
              />
            ) : null)}

          {view === "meeting" ? (
            direct && directEmployee ? (
              <div className="min-h-0 flex-1">
                <ChatPane key={directEmployee.slug} employee={directEmployee} />
              </div>
            ) : (
              <MeetingRoom
                seed={seedPrompt}
                onRespondent={setSpotlight}
                onAgentTurn={onAgentTurn}
              />
            )
          ) : null}

          {view === "tasks" && (
            <TaskBoardView
              refreshSignal={tasksRefresh}
              onPromptOps={() => {
                setSeedPrompt(
                  "@Priya เพิ่ม task ใหม่ในบอร์ด default ชื่อ ___ owner ___ due ___",
                );
                setDirect(null);
                setView("meeting");
              }}
            />
          )}

          {view === "social" && (
            <SocialView
              refreshSignal={tasksRefresh}
              onPromptCreatorTeam={() => {
                setSeedPrompt(
                  "@Noah เขียน LinkedIn post หัวข้อ ___ พร้อม asset brief ให้ Lin แล้วส่ง Zara schedule วันที่ ___",
                );
                setDirect(null);
                setView("meeting");
              }}
            />
          )}

          {view === "kpi" && (
            <KpiPanel kpis={kpis} updatedAt={kpiUpdated} fullScreen />
          )}

          {view === "files" && <FilesView />}
        </div>

        <RightRail kpis={kpis} updatedAt={kpiUpdated} />
      </div>
    </main>
  );
}

function DirectChatHeader({
  employee,
  onExit,
}: {
  employee: EmployeeMeta;
  onExit: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2/50 px-5 py-2">
      <p className="text-[11px] text-ink-dim">
        คุณกำลังคุยตัวต่อตัวกับ <strong className="text-ink">{employee.firstName}</strong>
      </p>
      <button
        onClick={onExit}
        className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink"
      >
        ← กลับห้องประชุม
      </button>
    </div>
  );
}

function RightRail({
  kpis,
  updatedAt,
}: {
  kpis: KpiItem[];
  updatedAt: string | null;
}) {
  return (
    <div className="min-h-0">
      <KpiPanel kpis={kpis} updatedAt={updatedAt} />
    </div>
  );
}
