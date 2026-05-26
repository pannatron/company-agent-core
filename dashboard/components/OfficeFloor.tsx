"use client";

import { useMemo } from "react";
import {
  ACCENT_BORDER,
  ACCENT_BG_SOFT,
  EMPLOYEES,
  EmployeeMeta,
  EmployeeSlug,
} from "@/lib/employees";
import { ClientJob } from "@/lib/useJobStream";
import OfficeDesk from "./OfficeDesk";

interface Zone {
  id: string;
  title: string;
  subtitle: string;
  /** Tailwind grid columns count for desks in this zone. */
  cols: number;
  slugs: EmployeeSlug[];
}

const ZONES: Zone[] = [
  {
    id: "executive",
    title: "Executive Wing",
    subtitle: "วางกลยุทธ์ ตัดสินใจข้ามแผนก",
    cols: 1,
    slugs: ["ceo"],
  },
  {
    id: "creative",
    title: "Creative Studio",
    subtitle: "Marketing + Creator Team",
    cols: 4,
    slugs: ["marketing-lead", "content-designer", "copywriter", "social-media-manager"],
  },
  {
    id: "revenue",
    title: "Revenue Row",
    subtitle: "Sales + Finance",
    cols: 2,
    slugs: ["sales-rep", "finance-analyst"],
  },
  {
    id: "ops",
    title: "Ops & People",
    subtitle: "Operations + HR + Analytics",
    cols: 3,
    slugs: ["ops-manager", "hr-manager", "kpi-analyst"],
  },
  {
    id: "support",
    title: "Customer Front",
    subtitle: "ติดต่อลูกค้าโดยตรง",
    cols: 1,
    slugs: ["customer-support"],
  },
];

interface Props {
  jobsBySlug: Map<string, ClientJob>;
  onOpenDirect: (slug: EmployeeSlug) => void;
}

export default function OfficeFloor({ jobsBySlug, onOpenDirect }: Props) {
  const bySlug = useMemo(() => {
    const m = new Map<EmployeeSlug, EmployeeMeta>();
    for (const e of EMPLOYEES) m.set(e.slug, e);
    return m;
  }, []);

  return (
    <div className="office-floor space-y-5 p-5">
      {ZONES.map((zone) => (
        <ZoneBlock
          key={zone.id}
          zone={zone}
          bySlug={bySlug}
          jobsBySlug={jobsBySlug}
          onOpenDirect={onOpenDirect}
        />
      ))}
    </div>
  );
}

function ZoneBlock({
  zone,
  bySlug,
  jobsBySlug,
  onOpenDirect,
}: {
  zone: Zone;
  bySlug: Map<EmployeeSlug, EmployeeMeta>;
  jobsBySlug: Map<string, ClientJob>;
  onOpenDirect: (slug: EmployeeSlug) => void;
}) {
  const workingCount = zone.slugs.filter((s) => {
    const j = jobsBySlug.get(s);
    return j?.status === "running" || j?.status === "queued";
  }).length;

  return (
    <section className="office-zone">
      <header className="mb-2 flex items-baseline justify-between">
        <div>
          <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-ink">
            ▸ {zone.title}
          </h2>
          <p className="font-mono text-[10px] text-ink-dim">{zone.subtitle}</p>
        </div>
        <span
          className={
            "font-mono text-[10px] " +
            (workingCount > 0 ? "text-emerald-400" : "text-ink-dim")
          }
        >
          {workingCount > 0 ? `${workingCount} working` : "idle"}
        </span>
      </header>

      <div
        className="office-zone-grid grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${zone.cols}, minmax(0, 1fr))`,
        }}
      >
        {zone.slugs.map((slug) => {
          const emp = bySlug.get(slug);
          if (!emp) return null;
          return (
            <OfficeDesk
              key={slug}
              employee={emp}
              job={jobsBySlug.get(slug)}
              onOpenDirect={() => onOpenDirect(slug)}
            />
          );
        })}
      </div>
    </section>
  );
}

// Re-export for typing convenience.
export { ACCENT_BORDER, ACCENT_BG_SOFT };
