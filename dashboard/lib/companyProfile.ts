export interface CompanyProfile {
  /** Company identity */
  name: string;
  legal_name?: string;
  industry: string;          // e.g. "SaaS", "ค้าปลีก", "บริการ"
  business_type: string;     // free text — what you actually do
  description: string;       // 2-3 sentence pitch
  founded_year: number;
  team_size: number;         // headcount today
  country: string;           // default "ไทย"
  currency: string;          // default "THB"

  /** Budget & targets */
  fiscal_year: number;
  monthly_revenue_target: number;
  annual_revenue_target: number;
  current_cash: number;
  monthly_opex_estimate: number;
  gross_margin_target_pct: number;

  /** North Star + quarterly OKR */
  nsm_name: string;
  nsm_unit: string;
  nsm_target: number;
  nsm_current: number;
  quarterly_objective: string;
  key_results: string[];

  /** Sample-vs-blank choice */
  data_mode: "sample" | "blank";

  /** Setup metadata */
  setup_completed_at: string; // ISO date
  setup_version: number;
}

export const INDUSTRY_OPTIONS = [
  "SaaS / Software",
  "E-commerce / ค้าปลีก",
  "Marketing / Agency",
  "บริการ / Consulting",
  "Manufacturing / โรงงาน",
  "F&B / ร้านอาหาร",
  "Education / การศึกษา",
  "Healthcare / สุขภาพ",
  "Real Estate / อสังหา",
  "Logistics / ขนส่ง",
  "อื่นๆ",
];

export function emptyProfile(): CompanyProfile {
  const now = new Date();
  return {
    name: "",
    legal_name: "",
    industry: "SaaS / Software",
    business_type: "",
    description: "",
    founded_year: now.getFullYear(),
    team_size: 1,
    country: "ไทย",
    currency: "THB",
    fiscal_year: now.getFullYear(),
    monthly_revenue_target: 1000000,
    annual_revenue_target: 12000000,
    current_cash: 2000000,
    monthly_opex_estimate: 800000,
    gross_margin_target_pct: 70,
    nsm_name: "Active Paying Customers",
    nsm_unit: "customers",
    nsm_target: 100,
    nsm_current: 0,
    quarterly_objective: "",
    key_results: ["", "", ""],
    data_mode: "sample",
    setup_completed_at: "",
    setup_version: 1,
  };
}
