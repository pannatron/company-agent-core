export type EmployeeSlug =
  | "ceo"
  | "sales-rep"
  | "marketing-lead"
  | "hr-manager"
  | "finance-analyst"
  | "ops-manager"
  | "kpi-analyst"
  | "customer-support"
  | "content-designer"
  | "copywriter"
  | "social-media-manager";

export interface EmployeeMeta {
  slug: EmployeeSlug;
  name: string;
  firstName: string;     // used for @mentions
  title: string;
  department: string;
  /** Tailwind color token used for accents (e.g. ring, dot, bubble border) */
  accent:
    | "indigo"
    | "rose"
    | "amber"
    | "emerald"
    | "sky"
    | "violet"
    | "teal"
    | "fuchsia"
    | "cyan"
    | "pink"
    | "orange";
  /** DiceBear seed; deterministic avatar */
  avatarSeed: string;
  blurb: string;
  kpiIds: string[];
  dataFiles: string[];
}

export const EMPLOYEES: EmployeeMeta[] = [
  {
    slug: "ceo",
    name: "Alex Chen",
    firstName: "Alex",
    title: "Chief Executive",
    department: "Executive",
    accent: "indigo",
    avatarSeed: "Alexander Chen",
    blurb: "วางกลยุทธ์ ตัดสินใจระดับสูง และจัดสรรงานข้ามแผนก",
    kpiIds: ["company_nsm"],
    dataFiles: [
      "company-profile.json",
      "company-goals.json",
      "kpi.json",
      "tasks.json",
      "social-posts.json",
    ],
  },
  {
    slug: "sales-rep",
    name: "Jordan Park",
    firstName: "Jordan",
    title: "Account Executive",
    department: "Sales",
    accent: "rose",
    avatarSeed: "Jordan Park",
    blurb: "ดูแล pipeline ติดตามดีล ออกใบเสนอราคา และพยากรณ์ยอด",
    kpiIds: ["sales_monthly_revenue", "sales_pipeline_coverage"],
    dataFiles: ["company-profile.json", "sales-pipeline.csv", "company-goals.json"],
  },
  {
    slug: "marketing-lead",
    name: "Sarah Mitchell",
    firstName: "Sarah",
    title: "Marketing Lead",
    department: "Marketing",
    accent: "fuchsia",
    avatarSeed: "Sarah Mitchell",
    blurb: "วางคอนเทนต์ แคมเปญ และดูแลแบรนด์โทน — กำกับทีม creator",
    kpiIds: ["mkt_mql_month", "mkt_cpl"],
    dataFiles: [
      "company-profile.json",
      "content-calendar.csv",
      "social-posts.json",
      "company-goals.json",
    ],
  },
  {
    slug: "content-designer",
    name: "Lin Tanaka",
    firstName: "Lin",
    title: "Content Designer",
    department: "Creator Team",
    accent: "cyan",
    avatarSeed: "Lin Tanaka",
    blurb: "ออกแบบ visual asset และ template ของทุกโพสต์",
    kpiIds: [],
    dataFiles: [
      "company-profile.json",
      "social-posts.json",
      "content-calendar.csv",
    ],
  },
  {
    slug: "copywriter",
    name: "Noah Brooks",
    firstName: "Noah",
    title: "Copywriter",
    department: "Creator Team",
    accent: "pink",
    avatarSeed: "Noah Brooks",
    blurb: "เขียน copy / caption / hook / CTA ทุกแพลตฟอร์ม",
    kpiIds: [],
    dataFiles: [
      "company-profile.json",
      "social-posts.json",
      "content-calendar.csv",
    ],
  },
  {
    slug: "social-media-manager",
    name: "Zara Ahmed",
    firstName: "Zara",
    title: "Social Media Manager",
    department: "Creator Team",
    accent: "orange",
    avatarSeed: "Zara Ahmed",
    blurb: "จัดคิวโพสต์ schedule + publish + ติดตาม engagement",
    kpiIds: [],
    dataFiles: [
      "company-profile.json",
      "social-posts.json",
      "content-calendar.csv",
    ],
  },
  {
    slug: "hr-manager",
    name: "Maya Okonkwo",
    firstName: "Maya",
    title: "Head of People",
    department: "People",
    accent: "amber",
    avatarSeed: "Maya Okonkwo",
    blurb: "ดูแลพนักงาน จ้างงาน onboarding และประเมินผล",
    kpiIds: ["hr_turnover", "hr_time_to_hire"],
    dataFiles: ["company-profile.json", "employees.csv"],
  },
  {
    slug: "finance-analyst",
    name: "Daniel Reyes",
    firstName: "Daniel",
    title: "Finance Lead",
    department: "Finance",
    accent: "emerald",
    avatarSeed: "Daniel Reyes",
    blurb: "งบประมาณ cashflow รายงานการเงิน และออก invoice",
    kpiIds: ["fin_gross_margin", "fin_cash_runway"],
    dataFiles: ["company-profile.json", "finance.csv", "sales-pipeline.csv", "company-goals.json"],
  },
  {
    slug: "ops-manager",
    name: "Priya Anand",
    firstName: "Priya",
    title: "Operations Lead",
    department: "Operations",
    accent: "teal",
    avatarSeed: "Priya Anand",
    blurb: "ออกแบบ SOP ดูแล task board และ automate workflow",
    kpiIds: ["ops_workflow_cycle"],
    dataFiles: ["company-profile.json", "company-goals.json", "kpi.json", "tasks.json"],
  },
  {
    slug: "kpi-analyst",
    name: "Mei Zhang",
    firstName: "Mei",
    title: "Data & KPI Lead",
    department: "Analytics",
    accent: "violet",
    avatarSeed: "Mei Zhang",
    blurb: "รวบ KPI/OKR ทุกแผนก ทำ dashboard และรายงาน",
    kpiIds: [],
    dataFiles: [
      "company-profile.json",
      "kpi.json",
      "sales-pipeline.csv",
      "finance.csv",
      "tickets.csv",
      "content-calendar.csv",
      "employees.csv",
      "tasks.json",
      "company-goals.json",
    ],
  },
  {
    slug: "customer-support",
    name: "Rafael Silva",
    firstName: "Rafael",
    title: "Customer Success Lead",
    department: "Support",
    accent: "sky",
    avatarSeed: "Rafael Silva",
    blurb: "ตอบลูกค้า จัดการ ticket และอัปเดต knowledge base",
    kpiIds: ["support_sla", "support_csat"],
    dataFiles: ["company-profile.json", "tickets.csv"],
  },
];

export function getEmployee(slug: string): EmployeeMeta | undefined {
  return EMPLOYEES.find((e) => e.slug === slug);
}

export function avatarUrl(seed: string, size = 64): string {
  const params = new URLSearchParams({
    seed,
    radius: "50",
    backgroundColor: "transparent",
  });
  return `https://api.dicebear.com/9.x/notionists/svg?${params.toString()}&size=${size}`;
}

/** Tailwind class lookups derived from accent token. */
export const ACCENT_RING: Record<EmployeeMeta["accent"], string> = {
  indigo: "ring-indigo-400/70",
  rose: "ring-rose-400/70",
  amber: "ring-amber-400/70",
  emerald: "ring-emerald-400/70",
  sky: "ring-sky-400/70",
  violet: "ring-violet-400/70",
  teal: "ring-teal-400/70",
  fuchsia: "ring-fuchsia-400/70",
  cyan: "ring-cyan-400/70",
  pink: "ring-pink-400/70",
  orange: "ring-orange-400/70",
};

export const ACCENT_BG_SOFT: Record<EmployeeMeta["accent"], string> = {
  indigo: "bg-indigo-500/15 text-indigo-200",
  rose: "bg-rose-500/15 text-rose-200",
  amber: "bg-amber-500/15 text-amber-200",
  emerald: "bg-emerald-500/15 text-emerald-200",
  sky: "bg-sky-500/15 text-sky-200",
  violet: "bg-violet-500/15 text-violet-200",
  teal: "bg-teal-500/15 text-teal-200",
  fuchsia: "bg-fuchsia-500/15 text-fuchsia-200",
  cyan: "bg-cyan-500/15 text-cyan-200",
  pink: "bg-pink-500/15 text-pink-200",
  orange: "bg-orange-500/15 text-orange-200",
};

export const ACCENT_BORDER: Record<EmployeeMeta["accent"], string> = {
  indigo: "border-indigo-500/40",
  rose: "border-rose-500/40",
  amber: "border-amber-500/40",
  emerald: "border-emerald-500/40",
  sky: "border-sky-500/40",
  violet: "border-violet-500/40",
  teal: "border-teal-500/40",
  fuchsia: "border-fuchsia-500/40",
  cyan: "border-cyan-500/40",
  pink: "border-pink-500/40",
  orange: "border-orange-500/40",
};
