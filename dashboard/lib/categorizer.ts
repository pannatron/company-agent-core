import { promises as fs } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./repo";

const OUTPUTS_DIR = path.join(REPO_ROOT, "outputs");

export interface Category {
  id: string;
  label: string;
  icon: string;
  description: string;
  /** Filename patterns (lower-cased) that route to this category */
  patterns: RegExp[];
  /** If true, files whose name contains YYYY-MM are placed in a YYYY-MM subfolder on Drive */
  bucketByMonth?: boolean;
  /**
   * If true, files matching `<prefix>-<person>-YYYY-MM` are also placed in a
   * `_by-person/<person>/` tree. When combined with bucketByMonth the file is
   * duplicated into both `_by-person/<person>/<month>/` and `_by-month/<month>/`
   * so it can be shared either as "this person's full history" or
   * "everyone's slips for this month".
   */
  bucketByPerson?: boolean;
}

/**
 * Ordered list — first match wins. Patterns match the file's basename.
 * The "uploads" category is special: files already there stay; we never move into it.
 * The "misc" category is the implicit fallback.
 */
export const CATEGORIES: Category[] = [
  {
    id: "invoices",
    label: "Invoices & Receipts",
    icon: "🧾",
    description: "ใบแจ้งหนี้ ใบเสร็จ ที่ Finance ออก",
    patterns: [/^invoice-/i, /^inv-/i, /^receipt-/i, /^ใบเสร็จ/i],
  },
  {
    id: "quotes",
    label: "Quotes & Proposals",
    icon: "💰",
    description: "ใบเสนอราคา proposal ส่งลูกค้า",
    patterns: [/^quote-/i, /^proposal-/i, /^loi-/i, /^q-\d{6}/i, /^ใบเสนอราคา/i],
  },
  {
    id: "expense-slips",
    label: "สลิปค่าใช้จ่าย",
    icon: "💸",
    description: "สลิปจ่ายเงิน บิลค่าใช้จ่าย (แยกตามเดือน YYYY-MM)",
    patterns: [
      /^expense-/i,
      /^slip-expense-/i,
      /^bill-/i,
      /^payout-/i,
      /^สลิปจ่าย/i,
      /^ค่าใช้จ่าย-/i,
    ],
    bucketByMonth: true,
  },
  {
    id: "income-slips",
    label: "สลิปรายรับ",
    icon: "💵",
    description: "สลิปรับเงิน หลักฐานการชำระจากลูกค้า (แยกตามเดือน YYYY-MM)",
    patterns: [
      /^income-/i,
      /^slip-income-/i,
      /^payment-/i,
      /^paid-/i,
      /^สลิปรับ/i,
      /^รายรับ-/i,
    ],
    bucketByMonth: true,
  },
  {
    id: "reports",
    label: "Reports & Analytics",
    icon: "📊",
    description: "KPI / Standup / Forecast / รายงานสรุป",
    patterns: [
      /^kpi-report-/i,
      /^sales-forecast-/i,
      /^finance-report-/i,
      /^standup-/i,
      /^daily-standup-/i,
      /^weekly-/i,
      /-report-\d/i,
    ],
  },
  {
    id: "strategy",
    label: "Strategy & Decisions",
    icon: "🎯",
    description: "Strategy memo, decision doc ของ CEO",
    patterns: [/^strategy-/i, /^decision-memo-/i, /^decision-/i, /^memo-/i],
  },
  {
    id: "sops",
    label: "SOP & Workflows",
    icon: "⚙️",
    description: "SOP, workflow run, checklist",
    patterns: [/^sop-/i, /^workflow-run-/i, /^checklist-/i],
  },
  {
    id: "content",
    label: "Content & Copy",
    icon: "📝",
    description: "Copy, asset brief, content plan, campaign brief",
    patterns: [
      /^content-/i,
      /^copy-/i,
      /^campaign-/i,
      /^asset-brief-/i,
      /^template-/i,
      /^post-draft-/i,
      /^reel-/i,
      /^blog-/i,
    ],
  },
  {
    id: "hr",
    label: "HR — JD & Onboarding",
    icon: "👥",
    description: "JD, onboarding, policy, performance review",
    patterns: [
      /^jd-/i,
      /^onboarding-/i,
      /^policy-/i,
      /^review-/i,
      /^pip-/i,
      /^exit-/i,
      /^hr-/i,
    ],
  },
  {
    id: "employees",
    label: "รายชื่อพนักงาน & Payslip",
    icon: "👤",
    description:
      "พนักงาน/พนักงาน part-time (ม.40(1)) — payslip แยกรายคนและรายเดือน",
    patterns: [
      /^employee-/i,
      /^staff-/i,
      /^payslip-/i,
      /^พนักงาน-/i,
      /^สลิปเงินเดือน/i,
    ],
    bucketByMonth: true,
    bucketByPerson: true,
  },
  {
    id: "wage-slips",
    label: "สลิปเงินจ้าง (ผู้รับจ้างอิสระ)",
    icon: "💼",
    description:
      "ผู้รับจ้างอิสระ/ฟรีแลนซ์ (ม.40(2)) — เงินจ้างรายงาน/รายชิ้น แยกรายคนและรายเดือน",
    patterns: [
      /^wage-/i,
      /^contractor-/i,
      /^freelance-/i,
      /^สลิปเงินจ้าง/i,
      /^เงินจ้าง-/i,
    ],
    bucketByMonth: true,
    bucketByPerson: true,
  },
  {
    id: "support",
    label: "Support — Replies & KB",
    icon: "🎫",
    description: "Reply ลูกค้า, knowledge base, incident",
    patterns: [/^reply-ticket-/i, /^reply-/i, /^kb-/i, /^incident-/i, /^faq-/i],
  },
  {
    id: "chats",
    label: "Chat Transcripts",
    icon: "💬",
    description: "บทสนทนาที่ผู้ใช้กดบันทึก",
    patterns: [/^chat-/i, /^conversation-/i, /^transcript-/i],
  },
  {
    id: "uploads",
    label: "User uploads",
    icon: "📎",
    description: "ไฟล์ที่ผู้ใช้แนบเข้ามา (slip, รูป, csv)",
    patterns: [],
  },
];

export const MISC_CATEGORY: Category = {
  id: "misc",
  label: "Misc",
  icon: "📃",
  description: "ไฟล์ที่ยังไม่จัดหมวด",
  patterns: [],
};

export function categorize(filename: string): string {
  const base = filename.toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.patterns.length === 0) continue;
    if (cat.patterns.some((p) => p.test(base))) return cat.id;
  }
  return "misc";
}

/** Look up category metadata by id; falls back to "misc". */
export function getCategory(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? MISC_CATEGORY;
}

interface OrganizeResult {
  moved: number;
  categories: Record<string, number>;
  errors: string[];
}

/**
 * Walk the top-level of outputs/ and move flat files into their category subfolder.
 * Files already inside a subfolder are left alone.
 */
export async function organize(): Promise<OrganizeResult> {
  await fs.mkdir(OUTPUTS_DIR, { recursive: true });
  const result: OrganizeResult = { moved: 0, categories: {}, errors: [] };

  let items: import("node:fs").Dirent[];
  try {
    items = await fs.readdir(OUTPUTS_DIR, { withFileTypes: true });
  } catch (e) {
    result.errors.push((e as Error).message);
    return result;
  }

  for (const it of items) {
    if (!it.isFile()) continue;
    if (it.name.startsWith(".")) continue;

    const cat = categorize(it.name);
    // Never auto-move into uploads (those come from the upload API only)
    if (cat === "uploads") continue;

    const src = path.join(OUTPUTS_DIR, it.name);
    const destDir = path.join(OUTPUTS_DIR, cat);
    const dest = path.join(destDir, it.name);

    try {
      await fs.mkdir(destDir, { recursive: true });
      // If a file already exists at dest, append a timestamp to avoid clobber
      let finalDest = dest;
      try {
        await fs.access(dest);
        const ts = Date.now();
        const ext = path.extname(it.name);
        const stem = it.name.slice(0, -ext.length);
        finalDest = path.join(destDir, `${stem}.${ts}${ext}`);
      } catch {
        // ok, no conflict
      }
      await fs.rename(src, finalDest);
      result.moved++;
      result.categories[cat] = (result.categories[cat] || 0) + 1;
    } catch (e) {
      result.errors.push(`${it.name}: ${(e as Error).message}`);
    }
  }
  return result;
}
