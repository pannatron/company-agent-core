"use client";

import { useEffect, useState } from "react";
import { ACCENT_BG_SOFT, EMPLOYEES, EmployeeMeta } from "@/lib/employees";
import Avatar from "./Avatar";

interface TaskColumn {
  id: string;
  name: string;
}

interface TaskBoardModel {
  id: string;
  name: string;
  columns: TaskColumn[];
}

interface Task {
  id: string;
  board: string;
  column: string;
  title: string;
  owner: string;
  due?: string;
  priority?: "high" | "med" | "low";
  note?: string;
}

interface TasksFile {
  updated_at: string;
  boards: TaskBoardModel[];
  tasks: Task[];
}

interface Props {
  refreshSignal: number; // bump to force a reload
  onPromptOps: () => void;
}

export default function TaskBoardView({ refreshSignal, onPromptOps }: Props) {
  const [data, setData] = useState<TasksFile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((d: TasksFile) => {
        if (alive) setData(d);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [refreshSignal]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-dim">
        กำลังโหลด task board…
      </div>
    );
  }
  if (!data || data.boards.length === 0) {
    return (
      <EmptyBoard onPrompt={onPromptOps} />
    );
  }

  const board = data.boards[0];
  const byCol = new Map<string, Task[]>();
  for (const col of board.columns) byCol.set(col.id, []);
  for (const t of data.tasks.filter((t) => t.board === board.id)) {
    if (!byCol.has(t.column)) byCol.set(t.column, []);
    byCol.get(t.column)!.push(t);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{board.name}</h2>
          <p className="text-xs text-ink-dim">
            {data.tasks.length} งานทั้งหมด · อัปเดต {data.updated_at}
          </p>
        </div>
        <button
          onClick={onPromptOps}
          className="rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-white hover:bg-accent"
        >
          + ขอ Priya เพิ่ม task
        </button>
      </div>

      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex h-full min-w-max gap-3">
          {board.columns.map((col) => (
            <Column
              key={col.id}
              name={col.name}
              tasks={byCol.get(col.id) ?? []}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Column({ name, tasks }: { name: string; tasks: Task[] }) {
  return (
    <div className="flex w-[280px] shrink-0 flex-col rounded-xl border border-border bg-surface/40">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
          {name}
        </p>
        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-dim">
          {tasks.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {tasks.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] text-ink-dim/60">
            ไม่มีงานในคอลัมน์นี้
          </p>
        ) : (
          tasks.map((t) => <TaskCard key={t.id} task={t} />)
        )}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const owner = EMPLOYEES.find((e) => e.slug === task.owner);
  const due = task.due ? daysUntil(task.due) : null;
  return (
    <div className="rounded-lg border border-border bg-surface p-2.5 shadow-card">
      <div className="flex items-start gap-2">
        <PriorityDot priority={task.priority} />
        <p className="flex-1 text-[12.5px] leading-snug text-ink">
          {task.title}
        </p>
      </div>
      {task.note && (
        <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-snug text-ink-dim">
          {task.note}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        {owner ? (
          <OwnerChip owner={owner} />
        ) : (
          <span className="text-[10px] text-ink-dim">ไม่มี owner</span>
        )}
        {due && (
          <span
            className={[
              "text-[10px] font-medium",
              due.color === "danger" && "text-danger",
              due.color === "warn" && "text-warn",
              due.color === "ok" && "text-ok",
              due.color === "muted" && "text-ink-dim",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {due.label}
          </span>
        )}
      </div>
    </div>
  );
}

function OwnerChip({ owner }: { owner: EmployeeMeta }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ACCENT_BG_SOFT[owner.accent]}`}
    >
      <Avatar employee={owner} size={16} />
      {owner.firstName}
    </span>
  );
}

function PriorityDot({ priority }: { priority?: string }) {
  const cls =
    priority === "high"
      ? "bg-danger"
      : priority === "med"
        ? "bg-warn"
        : priority === "low"
          ? "bg-ok"
          : "bg-ink-dim/40";
  return (
    <span
      className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${cls}`}
      title={`priority: ${priority || "n/a"}`}
    />
  );
}

function daysUntil(due: string): { label: string; color: string } {
  const target = new Date(due).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0)
    return { label: `เลย ${Math.abs(diff)} วัน`, color: "danger" };
  if (diff === 0) return { label: "วันนี้", color: "warn" };
  if (diff <= 3) return { label: `อีก ${diff} วัน`, color: "warn" };
  if (diff <= 14) return { label: `อีก ${diff} วัน`, color: "ok" };
  return { label: `อีก ${diff} วัน`, color: "muted" };
}

function EmptyBoard({ onPrompt }: { onPrompt: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-4xl">📋</div>
      <h2 className="text-base font-semibold text-ink">ยังไม่มีบอร์ดงาน</h2>
      <p className="max-w-md text-sm text-ink-dim">
        ลองพิมพ์ในห้องประชุมว่า <em>"@Priya สร้างบอร์ดใหม่ชื่อ ลูกค้าใหม่ Q3"</em>
      </p>
      <button
        onClick={onPrompt}
        className="rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-medium text-white hover:bg-accent"
      >
        ไปคุยกับ Priya
      </button>
    </div>
  );
}
