# Virtual AI Company (บริษัทเสมือน)

ระบบจำลอง "บริษัท" ที่พนักงานทุกแผนกเป็น **AI subagent** คุยกันได้ ส่งงานข้ามแผนกได้ และตัดสินใจจากข้อมูลจริงในโฟลเดอร์ `data/`

ใช้งานได้ **2 ทาง**:

## 1) ผ่าน Claude Code (CLI) — พิมพ์ `@ชื่อพนักงาน`

เปิด terminal ใน root ของโปรเจกต์นี้ แล้วรัน Claude Code ตามปกติ จากนั้นพิมพ์เรียกพนักงานได้ทันที:

```
@ceo สรุปสุขภาพบริษัทตอนนี้ให้หน่อย
@sales-rep พยากรณ์ยอดเดือนนี้
@kpi-analyst อัปเดต KPI ทุกแผนก
@ops-manager ทุกเช้าให้สรุป pipeline+KPI+ticket
@finance-analyst cash runway เหลือกี่เดือน
```

**Slash command ลัด**:
- `/daily-standup` — สรุป pipeline + KPI + ticket ค้าง (delegate 3 แผนกขนาน)
- `/kpi-report` — รายงาน KPI/OKR ทุกแผนกพร้อมสถานะ
- `/sales-forecast` — พยากรณ์ยอดขายจาก pipeline
- `/run-workflow <ชื่อ>` — รัน SOP ที่บันทึกไว้

CEO ใช้ `Task` tool delegate งานข้ามแผนกแบบขนานได้ตามกติกาใน `.claude/CLAUDE.md`

## 2) ผ่าน Dashboard (Next.js)

ใช้ login **Claude Max / Pro** ที่คุณมีอยู่กับ Claude Code ได้เลย ไม่ต้องมี API key

```bash
# (ครั้งเดียว) ตรวจว่า login Claude Code แล้ว
claude /status

# รัน dashboard
cd dashboard
npm install
npm run dev
# เปิด http://localhost:3000
```

ถ้าอยากใช้ API key แทน: `cp .env.local.example .env.local` แล้วเปิดค่า `ANTHROPIC_API_KEY` ที่ comment ไว้

มีฟีเจอร์:
- Sidebar การ์ดพนักงาน 8 คน + ไฟ KPI (เขียว/เหลือง/แดง)
- หน้าต่างแชต streaming + render markdown
- KPI Panel เรียลไทม์อ่านจาก `data/kpi.json`
- ใช้ `@anthropic-ai/claude-agent-sdk` ฝั่ง server — token/key ไม่หลุดไป client

## โครงสร้างไฟล์

```
company-agent-core/
├─ .claude/
│  ├─ CLAUDE.md                  # ผังองค์กร + กติกา delegate
│  ├─ agents/                    # subagent พนักงาน 8 คน
│  │  ├─ ceo.md
│  │  ├─ sales-rep.md
│  │  ├─ marketing-lead.md
│  │  ├─ hr-manager.md
│  │  ├─ finance-analyst.md
│  │  ├─ ops-manager.md
│  │  ├─ kpi-analyst.md
│  │  └─ customer-support.md
│  ├─ skills/                    # ความเชี่ยวชาญ 8 แผนก
│  │  ├─ company-strategy/SKILL.md
│  │  ├─ sales-playbook/SKILL.md
│  │  ├─ content-engine/SKILL.md
│  │  ├─ hr-toolkit/SKILL.md
│  │  ├─ finance-ops/SKILL.md
│  │  ├─ workflow-automation/SKILL.md
│  │  ├─ kpi-framework/SKILL.md
│  │  └─ support-handbook/SKILL.md
│  └─ commands/
│     ├─ daily-standup.md
│     ├─ kpi-report.md
│     ├─ sales-forecast.md
│     └─ run-workflow.md
├─ data/                         # ฐานข้อมูลจำลอง — แก้ได้
│  ├─ sales-pipeline.csv
│  ├─ content-calendar.csv
│  ├─ employees.csv
│  ├─ finance.csv
│  ├─ tickets.csv
│  ├─ company-goals.json
│  └─ kpi.json
├─ outputs/                      # ที่ทุก agent เซฟไฟล์ส่งมอบ
└─ dashboard/                    # Next.js App Router + TS + Tailwind
```

## พนักงาน 8 คน

| Slug | ชื่อ | ตำแหน่ง | ใช้เมื่อ |
|---|---|---|---|
| `ceo` | สมชาย วงศ์วิวัฒน์ | CEO | ภาพรวม กลยุทธ์ ตัดสินใจระดับสูง |
| `sales-rep` | Pranee Kittipong | Sales Rep | pipeline ดีล forecast |
| `marketing-lead` | Krit Sukhum | Marketing Lead | คอนเทนต์ แคมเปญ SEO |
| `hr-manager` | Wipa Charoen | HR Manager | JD onboarding ประเมินผล |
| `finance-analyst` | Tanawat P. | Finance Analyst | งบประมาณ cashflow invoice |
| `ops-manager` | Achara N. | Ops Manager | SOP workflow automation |
| `kpi-analyst` | Marisa W. | KPI Analyst | รวบ KPI/OKR ทุกแผนก |
| `customer-support` | Phongsak T. | Support Lead | ticket KB ตอบลูกค้า |

## หลักการทำงานสั้นๆ

1. ผู้ใช้พิมพ์เรียกพนักงาน (Claude Code) หรือเลือกในแถบ sidebar (dashboard)
2. ระบบประกอบ system prompt = `.claude/CLAUDE.md` + `.claude/agents/<slug>.md` + ไฟล์ `data/` ที่เกี่ยวข้อง
3. CEO/Ops Manager ใช้ `Task` tool delegate งานย่อยข้ามแผนกขนานกันได้
4. ทุกงานส่งมอบ บันทึกเป็นไฟล์ใน `outputs/` (ชื่อ `YYYY-MM-DD-<หัวข้อ>.md`)
5. KPI Analyst อัปเดต `data/kpi.json` หลัง recompute ตัวเลขจากไฟล์ดิบ
