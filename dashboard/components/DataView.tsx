"use client";

import { useCallback, useEffect, useState } from "react";

type SheetKey =
  | "employees.csv"
  | "sales-pipeline.csv"
  | "finance.csv"
  | "tickets.csv"
  | "content-calendar.csv";

interface SheetMeta {
  key: SheetKey;
  label: string;
  icon: string;
}

const SHEETS: SheetMeta[] = [
  { key: "employees.csv", label: "Employees", icon: "👤" },
  { key: "sales-pipeline.csv", label: "Sales Pipeline", icon: "💼" },
  { key: "finance.csv", label: "Finance", icon: "💰" },
  { key: "tickets.csv", label: "Tickets", icon: "🎫" },
  { key: "content-calendar.csv", label: "Content", icon: "📝" },
];

interface SheetData {
  ok: boolean;
  name: string;
  headers: string[];
  rows: string[][];
  total_rows: number;
  size_bytes: number;
  mtime?: number;
}

interface ReviewDiffFile {
  name: string;
  status: "added" | "removed" | "modified" | "unchanged";
  before_size: number;
  after_size: number;
  rows_before?: number;
  rows_after?: number;
}

interface ReviewSummary {
  pending: boolean;
  checkpoint_snapshot_ts: string | null;
  created_at?: string;
  trigger?: string;
  files: ReviewDiffFile[];
  changed_count: number;
}

export default function DataView() {
  const [active, setActive] = useState<SheetKey>("employees.csv");
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const loadSheet = useCallback(async (key: SheetKey) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/data/sheet/${encodeURIComponent(key)}`);
      const data = (await res.json()) as SheetData;
      setSheet(data);
    } catch {
      setSheet(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Pull the currently-open topic straight from Google Sheets → local CSV,
  // then refresh the table. Lets the Data tab fetch fresh data without
  // hopping over to the Files tab's Sheets panel.
  const pullFromSheets = useCallback(
    async (key: SheetKey) => {
      const topic = key.replace(/\.csv$/, "");
      setPulling(true);
      setToast(null);
      try {
        const res = await fetch("/api/sheets/pull", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topic }),
        });
        const data = (await res.json()) as {
          pulled?: { id: string; rows: number }[];
          errors?: { id: string; message: string }[];
          error?: string;
        };
        if (!res.ok || data.error) {
          setToast(`✗ pull ไม่สำเร็จ — ${data.error || `HTTP ${res.status}`}`);
        } else if (data.errors?.length) {
          setToast(`✗ ${data.errors[0].message}`);
        } else {
          const rows = data.pulled?.[0]?.rows ?? 0;
          setToast(`✓ ดึงจาก Sheets แล้ว — ${rows} แถว`);
        }
        await loadSheet(key);
      } catch (e) {
        setToast(`✗ ${(e as Error).message}`);
      } finally {
        setPulling(false);
      }
    },
    [loadSheet],
  );

  const loadReview = useCallback(async () => {
    try {
      const res = await fetch("/api/data/review");
      const data = (await res.json()) as ReviewSummary;
      setReview(data);
    } catch {
      setReview(null);
    }
  }, []);

  useEffect(() => {
    loadSheet(active);
  }, [active, loadSheet]);

  useEffect(() => {
    loadReview();
    // Re-check pending review whenever the tab regains focus (AI may have
    // edited data while user was elsewhere).
    const onFocus = () => loadReview();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadReview]);

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface/40 px-5 py-3 backdrop-blur-sm">
        <h2 className="text-sm font-semibold text-ink">📊 Quick Dashboard</h2>
        <span className="text-[11px] text-ink-dim">
          ข้อมูลล่าสุดในชีตหลัก — กดดูได้ที่นี่โดยไม่ต้องเปิด Google Sheets
        </span>
        <div className="flex-1" />
        <button
          onClick={() => pullFromSheets(active)}
          disabled={pulling}
          title="ดึงข้อมูลล่าสุดจาก Google Sheets → เขียนทับ CSV แล้วโหลดใหม่"
          className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] text-ink hover:border-accent disabled:opacity-50"
        >
          {pulling ? "⬇ กำลังดึง…" : "⬇ Pull จาก Sheets"}
        </button>
        <button
          onClick={() => {
            loadSheet(active);
            loadReview();
          }}
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] text-ink-dim hover:border-accent hover:text-ink"
        >
          🔄
        </button>
      </header>

      {/* Global review banner now lives in app/page.tsx so it surfaces across
          every view (not just the Data tab) — see ReviewModal. The data tab
          keeps the per-file changed dot below for at-a-glance scanning. */}

      {toast && (
        <div
          className={[
            "border-b border-border px-5 py-2 text-[11px]",
            toast.startsWith("✓") ? "text-ok" : "text-danger",
          ].join(" ")}
        >
          {toast}
        </div>
      )}

      <nav className="flex flex-wrap gap-1 border-b border-border px-5 py-2">
        {SHEETS.map((s) => {
          const isActive = s.key === active;
          const fileReview = review?.files.find((f) => f.name === s.key);
          const changed =
            fileReview && fileReview.status !== "unchanged";
          return (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={[
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                isActive
                  ? "bg-surface-2 text-ink ring-1 ring-border"
                  : "text-ink-dim hover:bg-surface-2/60 hover:text-ink",
              ].join(" ")}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
              {changed && (
                <span className="rounded bg-warn/15 px-1 text-[9.5px] text-warn">
                  ●
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-[11px] text-ink-dim">กำลังโหลด…</div>
        ) : !sheet || sheet.rows.length === 0 ? (
          <EmptySheet name={active} />
        ) : (
          <SheetTable sheet={sheet} />
        )}
      </div>
    </div>
  );
}

/* ---------- Sheet table ---------- */

function SheetTable({ sheet }: { sheet: SheetData }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface/40">
      <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5 text-[11px] text-ink-dim">
        <span>
          <code className="text-ink">{sheet.name}</code> ·{" "}
          {sheet.total_rows} แถว · {fmtBytes(sheet.size_bytes)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-surface-2/60">
              {sheet.headers.map((h) => (
                <th
                  key={h}
                  className="sticky top-0 border-b border-border px-2 py-1.5 text-left font-semibold text-ink-dim"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-border/40 hover:bg-surface-2/40"
              >
                {sheet.headers.map((_, c) => (
                  <td
                    key={c}
                    className="border-r border-border/20 px-2 py-1 text-ink"
                  >
                    {row[c] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmptySheet({ name }: { name: SheetKey }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface/40 px-4 py-12 text-center">
      <span className="text-2xl">📭</span>
      <p className="text-[12px] font-medium text-ink">ยังไม่มีข้อมูลใน {name}</p>
      <p className="text-[10.5px] text-ink-dim">
        ลองสั่ง AI ในแชท เช่น &quot;เพิ่มพนักงาน X&quot; หรือ pull จาก Google
        Sheets
      </p>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
