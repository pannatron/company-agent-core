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
import DataView from "@/components/DataView";
import JobTicker from "@/components/JobTicker";
import {
  ReviewBanner,
  ReviewModal,
  type ReviewSummary,
} from "@/components/ReviewModal";
import { EmployeeMeta, EMPLOYEES, EmployeeSlug } from "@/lib/employees";
import { KpiFile, KpiItem } from "@/components/kpi-utils";
import { CompanyProfile } from "@/lib/companyProfile";
import { useJobStream } from "@/lib/useJobStream";

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

  // Collapsible side panels — persisted to localStorage so layout sticks.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem("ui.sidebarCollapsed") === "1");
      setRailCollapsed(localStorage.getItem("ui.railCollapsed") === "1");
      // Honor a pending direct-chat handoff from Office mode.
      const pending = localStorage.getItem("ui.openDirect");
      if (pending) {
        localStorage.removeItem("ui.openDirect");
        setDirect(pending);
        setView("meeting");
      }
      localStorage.setItem("ui.mode", "dashboard");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("ui.sidebarCollapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const toggleRail = useCallback(() => {
    setRailCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("ui.railCollapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
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

  // Global review state — banner+modal shown across every view whenever the
  // AI has edited a reviewable file and the user hasn't confirmed yet.
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const refreshReview = useCallback(async () => {
    try {
      const res = await fetch("/api/data/review");
      const data = (await res.json()) as ReviewSummary;
      setReview(data);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    refreshReview();
    const onFocus = () => refreshReview();
    window.addEventListener("focus", onFocus);
    // Poll every 6s so edits made by a background dispatch show up without a
    // manual refresh. Cheap — the endpoint is a few file stats + a diff.
    const t = setInterval(refreshReview, 6000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(t);
    };
  }, [refreshReview]);

  const onAgentTurn = useCallback(() => {
    setTasksRefresh((n) => n + 1);
    refreshKpi();
    refreshReview();
  }, [refreshKpi, refreshReview]);

  // Subscribe to job stream at the page level so the sidebar can highlight
  // and reorder employees that are currently running a turn.
  const { active: activeJobs } = useJobStream();
  const activeBySlug = new Map<string, "running" | "queued">();
  for (const j of activeJobs) {
    activeBySlug.set(j.employeeSlug, j.status === "queued" ? "queued" : "running");
  }

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

  // chatId of the currently visible room — used by JobTicker to know which
  // jobs to hide (the room itself already shows its own streaming UI).
  const currentChatId =
    view === "meeting" ? (direct ? `direct-${direct}` : "meeting-room") : undefined;

  const jumpToRoom = (chatId: string) => {
    if (chatId === "meeting-room") setDirect(null);
    else if (chatId.startsWith("direct-")) setDirect(chatId.slice("direct-".length));
    setView("meeting");
  };

  return (
    <>
      <main
        className={`grid h-screen ${review?.pending ? "grid-rows-[auto_auto_1fr]" : "grid-rows-[auto_1fr]"} bg-bg`}
      >
      <TopBar
        company={company}
        kpis={kpis}
        view={view}
        onView={setView}
        onReconfigure={() => router.push("/setup")}
      />

      {review?.pending && (
        <ReviewBanner review={review} onOpen={() => setReviewOpen(true)} />
      )}

      <div
        className="grid min-h-0"
        style={{
          gridTemplateColumns: `${sidebarCollapsed ? 56 : 260}px 1fr ${railCollapsed ? 48 : 320}px`,
        }}
      >
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
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
          activeBySlug={activeBySlug}
          refreshSignal={tasksRefresh}
        />

        <div className="flex min-h-0 flex-col">
          <JobTicker currentChatId={currentChatId} onJumpToRoom={jumpToRoom} />

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
                onOpenDirect={(slug) => {
                  setDirect(slug);
                  setView("meeting");
                }}
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

          {view === "data" && <DataView />}

          {view === "files" && <FilesView />}
        </div>

        <RightRail
          kpis={kpis}
          updatedAt={kpiUpdated}
          collapsed={railCollapsed}
          onToggleCollapse={toggleRail}
        />
      </div>
    </main>
    {review && (
      <ReviewModal
        open={reviewOpen}
        review={review}
        onClose={() => setReviewOpen(false)}
        onRefresh={refreshReview}
      />
    )}
  </>
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
  collapsed,
  onToggleCollapse,
}: {
  kpis: KpiItem[];
  updatedAt: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <div className="min-h-0">
      <KpiPanel
        kpis={kpis}
        updatedAt={updatedAt}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
    </div>
  );
}
