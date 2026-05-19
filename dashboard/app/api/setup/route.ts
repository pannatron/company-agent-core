import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/repo";
import { CompanyProfile, emptyProfile } from "@/lib/companyProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_PATH = path.join(DATA_DIR, "company-profile.json");
const GOALS_PATH = path.join(DATA_DIR, "company-goals.json");

/** CSV files reset to a header-only state in blank mode */
const BLANK_CSV_FILES = {
  "sales-pipeline.csv":
    "deal_id,customer,contact,stage,amount,probability,expected_close,last_activity,owner,next_action\n",
  "content-calendar.csv":
    "content_id,title,type,channel,publish_date,status,owner,keyword,cta\n",
  "employees.csv":
    "emp_id,name,role,department,status,start_date,salary_thb,manager,probation_end,last_review\n",
  "finance.csv":
    "month,revenue,cogs,opex_salary,opex_marketing,opex_rent,opex_tools,opex_other,cash_balance,ar_outstanding\n",
  "tickets.csv":
    "ticket_id,customer,subject,priority,status,created_at,last_update,assignee,first_response_at,resolution\n",
};

/** JSON files reset to an empty-but-valid shell in blank mode */
const BLANK_JSON_FILES: Record<string, unknown> = {
  "tasks.json": {
    updated_at: new Date().toISOString().slice(0, 10),
    boards: [
      {
        id: "default",
        name: "งานของฉัน",
        columns: [
          { id: "backlog", name: "Backlog" },
          { id: "doing", name: "กำลังทำ" },
          { id: "review", name: "รอตรวจ" },
          { id: "done", name: "เสร็จ" },
        ],
      },
    ],
    tasks: [],
  },
  "social-posts.json": {
    updated_at: new Date().toISOString().slice(0, 10),
    accounts: [],
    posts: [],
  },
};

export async function GET() {
  try {
    const raw = await fs.readFile(PROFILE_PATH, "utf8");
    const profile = JSON.parse(raw) as CompanyProfile;
    return Response.json({ complete: true, profile });
  } catch {
    return Response.json({ complete: false, profile: emptyProfile() });
  }
}

export async function POST(req: NextRequest) {
  let body: Partial<CompanyProfile>;
  try {
    body = (await req.json()) as Partial<CompanyProfile>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const profile: CompanyProfile = {
    ...emptyProfile(),
    ...body,
    setup_completed_at: new Date().toISOString(),
    setup_version: 1,
  };

  if (!profile.name?.trim()) {
    return Response.json({ error: "ต้องใส่ชื่อบริษัท" }, { status: 400 });
  }

  // 1) Write profile
  await fs.writeFile(PROFILE_PATH, JSON.stringify(profile, null, 2), "utf8");

  // 2) Rewrite company-goals.json with new targets + NSM + KRs
  const goals = {
    company_name: profile.name,
    industry: profile.industry,
    fiscal_year: String(profile.fiscal_year),
    north_star_metric: {
      name: profile.nsm_name,
      current: profile.nsm_current,
      target_eoy: profile.nsm_target,
      unit: profile.nsm_unit,
    },
    quarterly_objectives: [
      {
        quarter: currentQuarterLabel(profile.fiscal_year),
        objective: profile.quarterly_objective || "(ยังไม่กำหนด)",
        key_results: profile.key_results
          .filter((kr) => kr.trim().length > 0)
          .map((kr) => ({ kr, owner: "—" })),
      },
    ],
    annual_targets: {
      revenue_thb: profile.annual_revenue_target,
      gross_margin_pct: profile.gross_margin_target_pct,
      monthly_revenue_target: profile.monthly_revenue_target,
      current_cash: profile.current_cash,
      monthly_opex_estimate: profile.monthly_opex_estimate,
    },
    monthly_targets_thb: nextSixMonthTargets(profile.monthly_revenue_target),
  };
  await fs.writeFile(GOALS_PATH, JSON.stringify(goals, null, 2), "utf8");

  // 3) If blank mode → wipe transactional CSVs + JSON + reset kpi.json
  if (profile.data_mode === "blank") {
    await Promise.all([
      ...Object.entries(BLANK_CSV_FILES).map(([file, header]) =>
        fs.writeFile(path.join(DATA_DIR, file), header, "utf8"),
      ),
      ...Object.entries(BLANK_JSON_FILES).map(([file, obj]) =>
        fs.writeFile(
          path.join(DATA_DIR, file),
          JSON.stringify(obj, null, 2),
          "utf8",
        ),
      ),
    ]);
    await fs.writeFile(
      path.join(DATA_DIR, "kpi.json"),
      JSON.stringify(buildBlankKpi(profile), null, 2),
      "utf8",
    );
  }

  return Response.json({ ok: true, profile });
}

function currentQuarterLabel(year: number): string {
  const q = Math.floor(new Date().getMonth() / 3) + 1;
  return `Q${q}-${year}`;
}

function nextSixMonthTargets(monthly: number): Record<string, number> {
  const now = new Date();
  const out: Record<string, number> = {};
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out[key] = monthly;
  }
  return out;
}

function buildBlankKpi(p: CompanyProfile) {
  return {
    updated_at: new Date().toISOString().slice(0, 10),
    kpis: [
      {
        id: "company_nsm",
        name: p.nsm_name,
        department: "executive",
        owner: "ceo",
        direction: "higher_is_better",
        target: p.nsm_target,
        current: p.nsm_current,
        unit: p.nsm_unit,
        status: "off_track",
        note: "ตั้งใหม่จาก setup wizard",
      },
      {
        id: "sales_monthly_revenue",
        name: "Monthly New Revenue",
        department: "sales",
        owner: "sales-rep",
        direction: "higher_is_better",
        target: p.monthly_revenue_target,
        current: 0,
        unit: "THB",
        status: "off_track",
        note: "ยังไม่มีข้อมูลรายเดือน",
      },
      {
        id: "fin_cash_runway",
        name: "Cash Runway",
        department: "finance",
        owner: "finance-analyst",
        direction: "higher_is_better",
        target: 6,
        current:
          p.monthly_opex_estimate > 0
            ? Math.round((p.current_cash / p.monthly_opex_estimate) * 10) / 10
            : 0,
        unit: "months",
        status: "at_risk",
        note: `cash ${p.current_cash.toLocaleString()} / burn ${p.monthly_opex_estimate.toLocaleString()}/เดือน`,
      },
    ],
  };
}
