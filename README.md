# Virtual AI Company (บริษัทเสมือน)

ระบบจำลอง "บริษัท" ที่พนักงานทุกแผนกเป็น **AI subagent** คุยกันได้ ส่งงานข้ามแผนก จัดไฟล์ขึ้นคลาวด์ และโพสต์โซเชียลให้อัตโนมัติ

ใช้งานได้ **2 ทาง** — Claude Code (CLI) หรือ Dashboard (Next.js)

---

## ฟีเจอร์หลัก

- 🧑‍💼 **11 subagents** ครอบทั้งสายขาย / การตลาด / การเงิน / HR / Ops / Support / KPI / Content + CEO
- 💬 **Meeting Room** (ห้องประชุมกลาง) auto-route ไปหาพนักงานที่ตรงเรื่อง + Direct Chat 1-on-1
- 📁 **Auto-categorize ไฟล์** — agent rename สลิป/บิล/payslip/quote ตาม prefix → categorizer ย้ายเข้า subfolder ที่ถูก
- ☁️ **Drive + Google Sheets เป็น source-of-truth** ผ่าน Apps Script Web App (ไม่ต้องใช้ Cloud Console / OAuth ของตัวเอง)
- 🔄 **Auto-sync** — ติ๊กครั้งเดียวในแชต → ทุกครั้ง agent ตอบจบ ระบบ push outputs/ + CSV ขึ้นคลาวด์อัตโนมัติ
- 📘 **Facebook Page auto-post** — Apps Script time-trigger อ่าน Sheet queue + ยิง Graph API ให้
- 📊 KPI / Task Board (Kanban) / Social Queue / Files browser ใน dashboard

---

## 1) ผ่าน Claude Code (CLI)

เปิด terminal ใน root ของโปรเจกต์นี้แล้วรัน Claude Code ตามปกติ พิมพ์เรียกพนักงานได้เลย:

```
@ceo สรุปสุขภาพบริษัทตอนนี้ให้หน่อย
@sales-rep พยากรณ์ยอดเดือนนี้
@finance-analyst ลงรายจ่ายตามสลิปที่แนบ
@hr-manager ลง payslip ของพนักงานคนนี้
@zara ตั้งโพสต์เปิดตัวสินค้าวันพรุ่งนี้ 10 โมง Facebook
```

**Slash commands:**
- `/daily-standup` — สรุป pipeline + KPI + ticket ค้าง (delegate ขนาน)
- `/kpi-report` — รายงาน KPI/OKR ทุกแผนก
- `/sales-forecast` — พยากรณ์ยอดขายจาก pipeline
- `/run-workflow <ชื่อ>` — รัน SOP ที่บันทึกไว้

CEO ใช้ `Task` tool delegate งานข้ามแผนกแบบขนานตามกติกาใน [.claude/CLAUDE.md](.claude/CLAUDE.md)

---

## 2) ผ่าน Dashboard (Next.js)

ใช้ login **Claude Max / Pro** ที่มีอยู่กับ Claude Code ได้เลย ไม่ต้องมี API key

```bash
cd dashboard
npm install
npm run dev
# เปิด http://localhost:3000
```

ครั้งแรก dashboard จะพา setup wizard กรอกชื่อบริษัท / industry / team size

ถ้าอยากใช้ API key แทน: `cp .env.local.example .env.local` แล้วเปิดค่า `ANTHROPIC_API_KEY`

**Tabs ใน dashboard:**

| Tab | ใช้ทำอะไร |
|---|---|
| Meeting Room | ห้องประชุมกลาง auto-route + แนบไฟล์ + auto-sync |
| Task Board | Kanban — agent อัปเดต status ได้ |
| Social | คิวโพสต์โซเชียล + Facebook auto-post config |
| KPI Detail | กราฟ + ตาราง KPI/OKR ทุกแผนก |
| Files | จัดการ outputs/ + เชื่อม Drive + Google Sheets sync |

---

## พนักงาน 11 คน

| Slug | ชื่อ | ตำแหน่ง | ใช้เมื่อ |
|---|---|---|---|
| `ceo` | Alex Chen | Chief Executive | ภาพรวม กลยุทธ์ ตัดสินใจระดับสูง |
| `sales-rep` | Jordan Park | Account Executive | pipeline ดีล forecast quote |
| `marketing-lead` | Sarah Mitchell | Marketing Lead | คอนเทนต์ แคมเปญ SEO content calendar |
| `content-designer` | Lin Tanaka | Content Designer | asset brief, visual design |
| `copywriter` | Noah Brooks | Copywriter | caption hook headline CTA |
| `social-media-manager` | Zara Ahmed | Social Media Manager | schedule + publish ลง Facebook/IG/LinkedIn/X |
| `hr-manager` | Maya Okonkwo | Head of People | JD onboarding payslip wage |
| `finance-analyst` | Daniel Reyes | Finance Lead | รายรับ-รายจ่าย invoice cashflow VAT |
| `ops-manager` | Priya Anand | Operations Lead | SOP workflow automation |
| `kpi-analyst` | Mei Zhang | Data & KPI Lead | รวบ KPI/OKR ทุกแผนก |
| `customer-support` | Rafael Silva | Customer Success Lead | ticket KB incident screenshot |

---

## สถาปัตยกรรม (3 ชั้น)

```
[Local คุณ]                [Apps Script (Web App)]            [Google Drive + Sheets]
   ↓                              ↓                                    ↓
 data/*.csv      ←─push/pull─→  /exec POST {action, ...}    ←─→  📊 Sales Pipeline (Sheet)
 outputs/*       ──upload────→  upload action               ──→  💸 expense-slips/2026-05/
 social-posts    ──push────→    write_sheet                 ──→  📱 Social Posts queue
                                runFbScheduler (cron 5 min) ──→  Facebook Page
```

1. **Local** — agent อ่าน/เขียน `data/*.csv` + `outputs/` ตามปกติ
2. **Apps Script** — Web App ที่ deploy ครั้งเดียวบน script.google.com เป็นตัวกลาง (ผู้ใช้รัน, ไม่ต้องมี OAuth)
3. **Cloud** — Drive folders (auto-categorize) + Google Sheets (5 หัวข้อแยกไฟล์) + Facebook Graph API

---

## โครงสร้างไฟล์

```
company-agent-core/
├─ .claude/
│  ├─ CLAUDE.md                  # ผังองค์กร + กติกา delegate + slip naming convention
│  ├─ agents/                    # 11 subagent
│  ├─ skills/                    # 11 domain toolkit
│  └─ commands/                  # 4 slash commands
├─ data/                         # CSV/JSON ของแต่ละองค์กร — gitignored
│  ├─ sales-pipeline.csv         # ↔ 📊 Sales/Sales Pipeline (Sheet)
│  ├─ employees.csv              # ↔ 👤 HR/Employees
│  ├─ finance.csv                # ↔ 💰 Finance/Finance
│  ├─ tickets.csv                # ↔ 🎫 Support/Tickets
│  ├─ content-calendar.csv       # ↔ 📝 Marketing/Content Calendar
│  ├─ social-posts.json          # ↔ 📱 Social/Social Posts queue
│  ├─ kpi.json, company-goals.json, company-profile.json, tasks.json
│  └─ .drive-config / .sheets-state / .backup-state  (sync state)
├─ outputs/                      # ที่ agent เซฟไฟล์ส่งมอบ — gitignored ยกเว้น sop-*.md
│  ├─ invoices/, quotes/, expense-slips/, income-slips/
│  ├─ employees/, wage-slips/, content/, hr/, support/
│  ├─ reports/, strategy/, sops/, chats/, uploads/
│  └─ sop-*.md                   # SOP ที่ใช้ร่วมกันได้ — committed
├─ dashboard/                    # Next.js App Router + TS + Tailwind
├─ scripts/
│  └─ sheets-sync.mjs            # CLI ให้ agent pull/push Sheets
└─ .gitignore                    # กัน data/* + outputs/* ที่เป็น org-specific
```

---

## Slip / Attachment workflow (ทุก agent)

เวลาแนบสลิป/บิล/ภาพหลักฐานเข้าแชต ระบบทำให้แบบนี้:

```
ผู้ใช้แนบไฟล์ (📎) → outputs/uploads/<timestamp>-<random>.<ext>
    ↓
agent (ตาม domain): อ่าน → rename → ย้ายไป outputs/<prefix>-*.<ext>
    ↓
categorizer (auto-organize หลังจบ turn): ย้ายเข้า outputs/<หมวด>/<YYYY-MM>/
    ↓
[auto-sync ถ้าติ๊ก] /api/drive/sync + /api/sheets/push
    ↓
✓ ขึ้นไป Drive ในโฟลเดอร์ที่ถูก + Sheet ตามข้อมูลตรงกัน
```

ตารางสรุป prefix ที่ใช้:

| สิ่งที่ผู้ใช้แนบ | agent | rename เป็น | ลง state |
|---|---|---|---|
| สลิปจ่าย/บิล | finance-analyst | `expense-` / `bill-` | finance.csv |
| สลิปรับเงิน | finance-analyst | `income-` / `payment-` | finance.csv |
| invoice/ใบเสร็จ | finance-analyst | `invoice-` / `receipt-` | finance.csv |
| สลิปเงินเดือนพนักงาน | hr-manager | `payslip-<คน>-YYYY-MM` | employees.csv |
| สลิปจ้างฟรีแลนซ์ | hr-manager | `wage-<คน>-YYYY-MM` | employees.csv |
| Quote/PO/LOI/สัญญา | sales-rep | `quote-...-signed/po/contract` / `loi-` | sales-pipeline.csv |
| Screenshot ปัญหาลูกค้า | customer-support | `incident-<ticket-id>-` | tickets.csv |
| Asset/reference | marketing-lead | `asset-brief-` / `content-...-asset` | content-calendar.csv |

รายละเอียดเพิ่มเติม → [.claude/CLAUDE.md](.claude/CLAUDE.md)

---

## Setup คลาวด์ (ครั้งเดียว)

### ขั้น 1 — Apps Script Web App
1. เปิด dashboard → tab Files → กด "เชื่อม Drive"
2. ก๊อปสคริปต์ที่ขึ้นมา → ไปวางที่ [script.google.com](https://script.google.com) (New project)
3. ⚠ **สำคัญ:** ก่อน Deploy ต้องรัน `authorize` ก่อน (Select function → ▶ Run → Allow ทุก scope)
4. Deploy → New deployment → Web app → Execute as: Me / Access: Anyone → Deploy
5. ก๊อป URL `/exec` กลับมาวางใน dashboard

### ขั้น 2 — Sheets sync
- Files tab → SheetsPanel → กด **"🚀 Setup ทุกหัวข้อ + ส่งข้อมูล"** ครั้งเดียว
- จะสร้าง 5 subfolders + Sheets ใน Drive root พร้อม push data ปัจจุบันขึ้นไปเป็น baseline

### ขั้น 3 — Facebook auto-post (ถ้าใช้)
ดู [outputs/sop-facebook-autopost-setup.md](outputs/sop-facebook-autopost-setup.md) — 6 ขั้นตอนหา long-lived Page Access Token + ตั้งค่าใน dashboard

### ขั้น 4 — เปิด auto-sync
ในแชต (Meeting Room / Direct Chat) → ติ๊ก **🔄 auto-sync** ครั้งเดียว — จำใน localStorage

---

## CLI สำหรับ sync จาก terminal

```bash
node scripts/sheets-sync.mjs status               # ดูสถานะ cloud vs local
node scripts/sheets-sync.mjs pull                 # Sheets → data/*.csv
node scripts/sheets-sync.mjs push                 # data/*.csv → Sheets
node scripts/sheets-sync.mjs pull employees       # หัวข้อเดียว
```

Topics: `sales-pipeline`, `employees`, `finance`, `tickets`, `content-calendar`

---

## หลักการทำงานสั้นๆ

1. ผู้ใช้เรียกพนักงาน (CLI หรือ dashboard) → router ส่งให้ subagent ที่ตรงเรื่อง
2. System prompt ประกอบจาก: `CLAUDE.md` + `agents/<slug>.md` + `skills/<...>/SKILL.md` + ไฟล์ `data/` ที่เกี่ยวข้อง
3. CEO / Ops Manager ใช้ `Task` tool delegate งานข้ามแผนกขนานกันได้
4. งานส่งมอบ → `outputs/` ตาม prefix → categorizer ย้ายเข้าหมวด
5. ถ้า auto-sync ติ๊ก → push ขึ้นคลาวด์อัตโนมัติทุก turn
6. Facebook Page: agent ตั้ง `status=scheduled` → Apps Script trigger โพสต์ให้ใน 5 นาที

---

## License & ขอบเขต

- ไฟล์ใน `data/` และ `outputs/` ของแต่ละบริษัท **ไม่ committed** (อยู่ใน `.gitignore`) — repo นี้คือเฟรมเวิร์ค ส่วน data เป็นของแต่ละองค์กร
- Apps Script รันใน Google ของผู้ใช้แต่ละคน — token / FB Page Access Token เก็บใน Apps Script ScriptProperties ไม่หลุดมา git
