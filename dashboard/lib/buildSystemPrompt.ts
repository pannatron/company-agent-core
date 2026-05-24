import { promises as fs } from "node:fs";
import path from "node:path";
import { EMPLOYEES, EmployeeMeta } from "./employees";
import {
  readAgentFile,
  readClaudeMd,
  readDataFile,
  DATA_DIR,
  REPO_ROOT,
} from "./repo";
import { CompanyProfile } from "./companyProfile";

async function readCompanyProfile(): Promise<CompanyProfile | null> {
  try {
    const raw = await fs.readFile(
      path.join(DATA_DIR, "company-profile.json"),
      "utf8",
    );
    return JSON.parse(raw) as CompanyProfile;
  } catch {
    return null;
  }
}

function profileBlock(p: CompanyProfile): string {
  return [
    `ชื่อบริษัท: ${p.name}${p.legal_name ? ` (${p.legal_name})` : ""}`,
    `อุตสาหกรรม: ${p.industry}`,
    `ประเภทธุรกิจ: ${p.business_type || "(ยังไม่ระบุ)"}`,
    `คำอธิบาย: ${p.description || "(ยังไม่ระบุ)"}`,
    `ก่อตั้ง: ${p.founded_year} · ทีม ${p.team_size} คน · ${p.country} · สกุลเงิน ${p.currency}`,
    "",
    "เป้าหมายและการเงิน:",
    `  - ปีงบประมาณ: ${p.fiscal_year}`,
    `  - เป้ารายได้/เดือน: ${p.monthly_revenue_target.toLocaleString()} ${p.currency}`,
    `  - เป้ารายได้/ปี: ${p.annual_revenue_target.toLocaleString()} ${p.currency}`,
    `  - Gross Margin เป้า: ${p.gross_margin_target_pct}%`,
    `  - เงินสดปัจจุบัน: ${p.current_cash.toLocaleString()} ${p.currency}`,
    `  - ค่าใช้จ่าย/เดือน: ${p.monthly_opex_estimate.toLocaleString()} ${p.currency}`,
    "",
    `North Star Metric: ${p.nsm_name} = ${p.nsm_current}/${p.nsm_target} ${p.nsm_unit}`,
    p.quarterly_objective
      ? `Quarterly Objective: ${p.quarterly_objective}`
      : "Quarterly Objective: (ยังไม่ตั้ง)",
    "Key Results:",
    ...p.key_results
      .filter((kr) => kr.trim())
      .map((kr, i) => `  ${i + 1}. ${kr}`),
  ].join("\n");
}

function teamRosterBlock(me: EmployeeMeta): string {
  return [
    "ทีมงานคนอื่นในบริษัท (อ้างถึงได้):",
    ...EMPLOYEES.map(
      (e) =>
        `  - ${e.name} (${e.firstName}) — ${e.title}, ${e.department}${
          e.slug === me.slug ? "  ← นั่นคือคุณ" : ""
        }`,
    ),
    "",
    "ถ้าผู้ใช้พิมพ์ @ชื่อ เช่น '@Jordan' = อ้างถึง Jordan Park; ถ้าต้องส่งต่องาน",
    "ให้บอกชื่อแล้วผู้ใช้จะ ping เขาให้เอง (อย่าพยายามเรียก subagent เองในแชตนี้)",
  ].join("\n");
}

export async function buildSystemPrompt(employee: EmployeeMeta): Promise<string> {
  const [companyMd, agentMd, profile] = await Promise.all([
    readClaudeMd(),
    readAgentFile(employee.slug),
    readCompanyProfile(),
  ]);

  const dataSections = await Promise.all(
    employee.dataFiles.map(async (file) => {
      try {
        const content = await readDataFile(file);
        return `\n\n=== data/${file} ===\n${content}`;
      } catch {
        return `\n\n=== data/${file} (NOT FOUND) ===`;
      }
    }),
  );

  const sections = [
    `คุณคือ "${employee.name}" — ${employee.title} ของบริษัทแห่งนี้`,
    `แผนก: ${employee.department}`,
    "",
    "ตอบเป็นภาษาเดียวกับที่ผู้ใช้ใช้ ห้ามเปลี่ยนภาษากลางคัน",
    "ตอบแบบมืออาชีพ มีตัวเลขประกอบ ใช้ markdown ได้ (ตาราง, bullet, code block)",
    "เมื่ออ้างถึงไฟล์ data ให้อ้างชื่อไฟล์จริง — แต่ห้ามแต่งข้อมูลใหม่ที่ไม่ได้อยู่ในไฟล์",
    "",
    teamRosterBlock(employee),
  ];

  if (profile) {
    sections.push(
      "",
      "=========================================",
      "ข้อมูลบริษัท (จาก setup wizard):",
      "=========================================",
      profileBlock(profile),
    );
  } else {
    sections.push(
      "",
      "⚠️ ยังไม่ได้ตั้งค่าข้อมูลบริษัท — แนะนำให้ผู้ใช้กดปุ่ม 'แก้ไขข้อมูลบริษัท' ก่อน",
    );
  }

  sections.push(
    "",
    "=========================================",
    "ภาพรวมองค์กรและกติกาภายใน (.claude/CLAUDE.md):",
    "=========================================",
    companyMd,
    "",
    "=========================================",
    `บทบาทของคุณ (.claude/agents/${employee.slug}.md):`,
    "=========================================",
    agentMd,
    "",
    "=========================================",
    "ข้อมูลปัจจุบันที่คุณเข้าถึงได้ (snapshot ตอนรันคำขอ):",
    "=========================================",
    dataSections.join(""),
    "",
    "=========================================",
    "Path บนเครื่องนี้ (สำคัญมาก — ใช้ตามนี้เด็ดขาด):",
    "=========================================",
    `REPO_ROOT = ${REPO_ROOT}`,
    `OUTPUTS_DIR = ${path.join(REPO_ROOT, "outputs")}`,
    `DATA_DIR = ${DATA_DIR}`,
    "",
    "กฎเรื่อง path (ป้องกัน trial-and-error):",
    "- Write/Edit/Read tool บังคับ absolute path เสมอ — ห้ามใช้ relative",
    "- ห้ามเดา username/ชื่อโปรเจกต์เอง ใช้ค่าจาก REPO_ROOT ข้างบนเท่านั้น",
    "- เซฟเอกสารเสมอที่ OUTPUTS_DIR/<ชื่อตามคอนเวนชั่นใน CLAUDE.md>",
    "- แก้ไฟล์ data เสมอที่ DATA_DIR/<ชื่อไฟล์>",
    "",
    "กฎเรื่อง 'รายงานเสร็จ' (ป้องกันการอ้างผลที่ยังไม่เกิด):",
    "- ห้ามตอบผู้ใช้ว่า 'เรียบร้อย/เสร็จแล้ว/บันทึกแล้ว' ก่อน verify ว่าไฟล์/แถวมีอยู่จริง",
    "- หลัง Write/Edit เสร็จ ให้ตรวจซ้ำด้วย Bash ls หรือ Read tool ครั้งหนึ่ง",
    "- ถ้า Write/Edit ผิดพลาด (เช่น path ไม่มีอยู่) ให้แก้ทันที อย่ารายงานว่าเสร็จ",
    "",
    "หมายเหตุสำคัญ:",
    "- ถ้าผู้ใช้สั่งให้เพิ่ม/อัปเดต task ให้แก้ไฟล์ data/tasks.json ตรงๆ ผ่าน Edit/Write tool",
    "- ถ้าผู้ใช้สั่งสร้างเอกสาร (invoice, รายงาน, JD, SOP) ให้เซฟใน OUTPUTS_DIR",
    "- KPI scoreboard อยู่ที่ DATA_DIR/kpi.json — แก้ผ่าน Edit เมื่อมีตัวเลขเปลี่ยน",
  );

  return sections.join("\n");
}
