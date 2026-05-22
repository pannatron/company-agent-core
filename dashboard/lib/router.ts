import { EMPLOYEES, EmployeeMeta, EmployeeSlug } from "./employees";

interface RouteResult {
  slug: EmployeeSlug;
  reason: string;
}

/**
 * Decide which employee should respond in the central meeting room.
 *
 * Priority:
 *   1. Explicit @mention (e.g. "@Jordan", "@finance")
 *   2. Keyword heuristic on the message
 *   3. Fallback to CEO
 */
export function routeMessage(text: string): RouteResult {
  const lower = text.toLowerCase();

  // 1) Mention by first name / slug / department
  for (const emp of EMPLOYEES) {
    const candidates = [
      emp.firstName.toLowerCase(),
      emp.slug,
      emp.department.toLowerCase(),
    ];
    for (const c of candidates) {
      if (
        lower.includes(`@${c}`) ||
        lower.includes(`@${c.replace(/-/g, " ")}`)
      ) {
        return { slug: emp.slug, reason: `@mention ${emp.firstName}` };
      }
    }
  }

  // 2) Keyword matches — order matters (specific verbs before generic platforms)
  const rules: Array<{ slug: EmployeeSlug; re: RegExp; label: string }> = [
    // Design verbs first — most specific
    {
      slug: "content-designer",
      re: /(ออกแบบ|วาด(รูป|ภาพ)|design\b|graphic|visual|cover|banner|thumbnail|asset\s*brief|mood\s*board|aspect\s*ratio|mockup|template)/i,
      label: "ออกแบบ visual",
    },
    // Writing verbs second — "เขียน" MUST be followed by a copy-specific noun
    // (so "เขียน JD" / "เขียน รายงาน" fall through to HR/KPI)
    {
      slug: "copywriter",
      re: /(copywrit|caption|headline|\bhook\b|\bcopy\b|เขียน\s*(โพสต์|post|caption|hook|copy|พาดหัว|ข้อความ|บทความ|content)|พาดหัว|cta\b|tagline|slogan|newsletter|อีเมล\s*(การ)?ตลาด)/i,
      label: "เขียน copy",
    },
    // Social distribution verbs / platform routing
    {
      slug: "social-media-manager",
      re: /(publish|schedule|ตั้งเวลา|ลงโพส(?:ต์)?|คิวโพส(?:ต์)?|engagement|reach|impressions|\bsocial\b|linkedin|facebook\b|\bfb\b|instagram|\big\b|twitter|tiktok|reels?|story|ตาราง\s*(?:การ)?\s*(?:โพส(?:ต์)?|เผยแพร่)|โพส(?:ต์)?\s*(?:ลง|ขึ้น|ใน))/i,
      label: "Social / publish",
    },
    {
      slug: "finance-analyst",
      // NOTE: `งบ` alone matches "ยังไงบ้าง"; require a finance continuation or
      // a non-attaching follower so we don't fire on tone-marked บ้/บั/บา etc.
      re: /(เงิน|finance|cashflow|cash\s*flow|บัญชี|accounting|invoice|งบ(?=ประมาณ|การเงิน|กำไร|ดุล|ขาดทุน|รายเ|ไตร|รวม|ปี|เดือน|[\s,.\-]|$)|budget|รายได้|revenue|กำไร|profit|ขาดทุน|loss|สลิป|slip|ภาษี|tax|vat|งวด|payroll|เงินเดือน|opex|gross\s*margin|runway)/i,
      label: "การเงิน/บัญชี",
    },
    {
      slug: "sales-rep",
      re: /(ขาย|sales|pipeline|ดีล|deal|forecast|พยากรณ์(ยอด)?|ยอด(ขาย|เดือน|รายเดือน)?|ใบเสนอราคา|quote|quota|ปิด(การ)?ขาย|prospect|lead|crm)/i,
      label: "ขาย/ดีล/pipeline",
    },
    {
      slug: "marketing-lead",
      re: /(การตลาด|marketing|คอนเทนต์|content|โพสต์|post|แคมเปญ|campaign|seo|โฆษณา|ad\s|brand|แบรนด์|landing|website|เว็บไซต์|email\s*marketing)/i,
      label: "การตลาด/คอนเทนต์",
    },
    {
      slug: "hr-manager",
      re: /(hr|จ้าง|recruit|jd|job\s*description|onboarding|พนักงาน|employee|ลา\s|leave|ประเมิน|review|payroll|headcount|พนักงานใหม่|exit)/i,
      label: "HR/พนักงาน",
    },
    {
      slug: "customer-support",
      re: /(support|ticket|complaint|ร้องเรียน|kb|knowledge\s*base|sla|customer\s*service|ลูกค้า\s*(บ่น|โกรธ|แจ้ง)|csat)/i,
      label: "ลูกค้า/ticket",
    },
    {
      slug: "ops-manager",
      re: /(sop|workflow|automate|task|board|process|ขั้นตอน|ทำซ้ำ|recurring|เพิ่ม(งาน|task|บอร์ด)|มอบหมาย|assign|kanban)/i,
      label: "SOP/task/process",
    },
    {
      slug: "kpi-analyst",
      re: /(kpi|okr|ตัวชี้วัด|metric|รายงาน|report|สถานะ|on[\s-]*track|off[\s-]*track|scorecard|dashboard)/i,
      label: "KPI/OKR/รายงาน",
    },
  ];

  for (const r of rules) {
    if (r.re.test(text)) {
      return { slug: r.slug, reason: r.label };
    }
  }

  // 3) Default: CEO handles strategic / catch-all / cross-department
  return { slug: "ceo", reason: "คำถามภาพรวม/กลยุทธ์" };
}

export function findByMention(text: string): EmployeeMeta | undefined {
  const slug = routeMessage(text).slug;
  return EMPLOYEES.find((e) => e.slug === slug);
}

/**
 * Return ONLY an explicit @mention match (firstName / slug / department).
 * Used by the chat route to detect "user is explicitly switching speaker"
 * vs. "user is just continuing the conversation" — the latter should stick
 * to the last respondent rather than fall through to keyword routing.
 */
export function detectExplicitMention(text: string): EmployeeSlug | null {
  const lower = text.toLowerCase();
  for (const emp of EMPLOYEES) {
    const candidates = [
      emp.firstName.toLowerCase(),
      emp.slug,
      emp.department.toLowerCase(),
    ];
    for (const c of candidates) {
      if (
        lower.includes(`@${c}`) ||
        lower.includes(`@${c.replace(/-/g, " ")}`)
      ) {
        return emp.slug;
      }
    }
  }
  return null;
}
