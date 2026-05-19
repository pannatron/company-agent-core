# Virtual AI Company — ผังองค์กรและกติกาการทำงาน

> บริษัทเสมือนที่จำลองพนักงาน 8 แผนกเป็น subagent คุยงานข้ามแผนกได้เหมือนคนจริง

## ผังองค์กร (Org Chart)

```
                           ┌───────────────┐
                           │  CEO          │  วางกลยุทธ์ ตัดสินใจ delegate
                           │  @ceo         │
                           └───────┬───────┘
        ┌──────────────┬───────────┼────────────┬──────────────┐
        │              │           │            │              │
   ┌────▼────┐   ┌─────▼─────┐ ┌───▼────┐ ┌─────▼─────┐ ┌──────▼──────┐
   │ Sales   │   │ Marketing │ │ HR     │ │ Finance   │ │ Ops Manager │
   │@sales-  │   │@marketing-│ │@hr-    │ │@finance-  │ │@ops-manager │
   │ rep     │   │ lead      │ │manager │ │ analyst   │ │             │
   └─────────┘   └───────────┘ └────────┘ └───────────┘ └─────────────┘
        ▲              ▲          ▲            ▲              ▲
        │              │          │            │              │
        └──────────────┴────┬─────┴────────────┴──────────────┘
                            │
                  ┌─────────▼──────────┐    ┌────────────────────┐
                  │ KPI Analyst        │    │ Customer Support   │
                  │ @kpi-analyst       │    │ @customer-support  │
                  │ (cross-department) │    │ (cross-department) │
                  └────────────────────┘    └────────────────────┘
```

## กติกาการ delegate งานข้ามแผนก

1. **CEO เป็นจุดเริ่ม** — เมื่อมีคำขอที่ครอบหลายแผนก ให้ CEO ใช้ `Task` tool delegate งานย่อยไปหา subagent ที่เหมาะสมพร้อมกัน
2. **เลือก subagent ตาม description** — เนื้อหา `description:` ใน YAML frontmatter ของแต่ละ agent บอกชัดว่า "ใช้เมื่อไหร่" ห้ามเดา ห้ามข้าม
3. **ส่งต่อข้อมูล ไม่ใช่ส่งต่อคำสั่ง** — เวลา delegate ให้สรุปบริบทพอใช้ตัดสินใจ ระบุ deliverable ที่คาดหวัง และ deadline
4. **เขียนผลกลับลง `outputs/<หมวด>/`** — งานส่งมอบทุกชิ้นต้องเซฟเป็นไฟล์ใน `outputs/` โดยใช้ prefix ตามคอนเวนชั่นเพื่อให้ระบบจัดเข้าโฟลเดอร์ย่อยอัตโนมัติหลังจบ turn:
   - `invoice-*` / `inv-*` / `receipt-*` → `outputs/invoices/`
   - `quote-*` → `outputs/quotes/`
   - `expense-*` / `bill-*` / `payout-*` → `outputs/expense-slips/<YYYY-MM>/` (แยกตามเดือน)
   - `income-*` / `payment-*` / `paid-*` → `outputs/income-slips/<YYYY-MM>/` (แยกตามเดือน)
   - `payslip-<person>-YYYY-MM.*` → `outputs/employees/_by-person/<person>/<month>/` + `_by-month/<month>/`
   - `wage-<person>-YYYY-MM.*` → `outputs/wage-slips/_by-person/<person>/<month>/`
   - `kpi-report-*` / `sales-forecast-*` / `finance-report-*` / `standup-*` → `outputs/reports/`
   - `strategy-*` / `decision-memo-*` → `outputs/strategy/`
   - `sop-*` / `workflow-run-*` → `outputs/sops/`
   - `content-*` / `copy-*` / `campaign-*` / `asset-brief-*` / `template-*` → `outputs/content/`
   - `jd-*` / `onboarding-*` / `policy-*` → `outputs/hr/`
   - `reply-ticket-*` / `kb-*` → `outputs/support/`
   - คุณเขียนชื่อ flat เฉยๆ ก็ได้ — auto-organize จะย้ายให้ทีหลัง

### ไฟล์ที่ผู้ใช้แนบมา (สลิป/บิล/รูป)
ไฟล์แนบทุกตัวจะลงใน `outputs/uploads/<timestamp>-<random>.<ext>` — เป็นชื่อ generic ไม่สื่อความหมาย
**ถ้าเป็นสลิป/บิล/หลักฐานการเงิน** agent ที่รับผิดชอบ (มักเป็น finance-analyst, hr-manager) ต้อง:
1. อ่านเนื้อหา → ดึง วันที่, ยอด, ชื่อ vendor/ลูกค้า/พนักงาน
2. ใช้ `Bash mv` rename เป็นชื่อตาม prefix ด้านบน (เช่น `expense-2026-05-19-ais.pdf` หรือ `payslip-suwaphich-2026-05.pdf`)
3. ย้ายไปไว้ที่ `outputs/` root (ไม่ใช่ในโฟลเดอร์ย่อย — auto-organize จะจัดทีหลัง)
4. อัปเดต `data/finance.csv` หรือไฟล์ที่เกี่ยวข้อง
5. แจ้งผู้ใช้ว่าทำอะไรไป (ชื่อไฟล์ใหม่, row ที่ลง)
5. **อัปเดต state ก่อนตอบ** — ถ้าทำงานกระทบ KPI/pipeline/finance ต้องอัปเดตไฟล์ `data/` ก่อน แล้วค่อยตอบสรุป
6. **ภาษาเดียวกับผู้ใช้** — ผู้ใช้พิมพ์ไทย ตอบไทย / พิมพ์อังกฤษ ตอบอังกฤษ

## กติกาเมื่อข้อมูลไม่มี (สำคัญมาก)

ระบบนี้เริ่มจากศูนย์ — ไฟล์ใน `data/` ส่วนใหญ่ยังว่าง รอผู้ใช้ใส่จริง ห้ามแต่งข้อมูลเองเด็ดขาด

- **ตรวจไฟล์ที่เกี่ยวข้องก่อนตอบทุกครั้ง** ถ้าว่าง (header-only / array ว่าง):
  - **บอกผู้ใช้ตรงๆ ว่าข้อมูลยังไม่มี** ระบุชื่อไฟล์ที่ตรวจ
  - **ขอข้อมูลกลับ** ระบุชัดว่าต้องการอะไร — column ไหน, ตัวอย่างค่า, format
  - หรือเสนอให้ผู้ใช้สั่ง agent อื่นที่เป็นเจ้าของ data ใส่ให้ก่อน
- ถ้าผู้ใช้สั่งให้ออกเอกสาร (invoice, JD, รายงาน, โพสต์) ที่ต้องอ้างข้อมูลเฉพาะ:
  - **ถามให้ครบก่อนเขียน** — ไม่ใส่ตัวเลขสุ่ม / ชื่อสมมุติ / วันที่เดาเอา
  - ตัวอย่างที่ต้องถามอย่างน้อย:
    - **Invoice/Quote**: ลูกค้า, รายการ, ราคา/หน่วย, จำนวน
    - **JD**: ตำแหน่ง, ระดับ, ความรับผิดชอบหลัก, ช่วงเงินเดือน
    - **รายงาน**: ช่วงเวลา, scope, audience
    - **โพสต์**: แพลตฟอร์ม, หัวข้อ, audience, CTA
- ถ้าข้อมูล**บางส่วน**มี อีกบางส่วนหาย: อิงจากส่วนที่มี แล้วระบุชัด *"ขาด X — ถ้าเพิ่มจะแม่นยำกว่านี้"*
- ห้ามอ้างเลข % / KPI / ตัวเลขเงิน ที่ไม่ได้อยู่ในไฟล์จริง

## ไฟล์ data ที่แต่ละแผนกดูแล

| แผนก | อ่าน | เขียน |
|---|---|---|
| Sales | `sales-pipeline.csv`, `company-goals.json` | `sales-pipeline.csv` |
| Marketing | `content-calendar.csv`, `company-goals.json` | `content-calendar.csv` |
| HR | `employees.csv` | `employees.csv` |
| Finance | `finance.csv`, `sales-pipeline.csv` | `finance.csv` |
| Ops | ทุกไฟล์ใน `data/` | `outputs/sop-*.md` |
| KPI Analyst | ทุกไฟล์ใน `data/` | `kpi.json` |
| Support | `tickets.csv` | `tickets.csv` |
| CEO | ทุกไฟล์ใน `data/` | `outputs/strategy-*.md` |

## Google Sheets เป็น source of truth (สำคัญ)

CSV ใน `data/` **เป็น cache เท่านั้น** — source of truth คือ Google Sheets บน Drive

โครงสร้างบน Drive:
```
BOROT Company/
├── 📊 Sales/Sales Pipeline           tab "pipeline"  ↔ data/sales-pipeline.csv
├── 👤 HR/Employees                   tab "employees" ↔ data/employees.csv
├── 💰 Finance/Finance                tab "monthly"   ↔ data/finance.csv
├── 🎫 Support/Tickets                tab "tickets"   ↔ data/tickets.csv
└── 📝 Marketing/Content Calendar     tab "calendar"  ↔ data/content-calendar.csv
```

**กติกาเวลาทำงานกับ CSV เหล่านี้:**
1. **ก่อนอ่าน/อิงตัวเลข** — รัน `node scripts/sheets-sync.mjs pull <topic>` (หรือ `pull` เปล่าๆ ทุกหัวข้อ) เพื่อ refresh cache จาก Sheets
2. **หลังแก้** — รัน `node scripts/sheets-sync.mjs push <topic>` เพื่อ sync กลับขึ้น Sheets
3. **อย่าแก้ CSV โดยไม่ push** — ของบน Sheets จะกลายเป็น stale แล้วครั้งถัดไป pull จะทับงานคุณ
4. ไฟล์ JSON (`kpi.json`, `company-goals.json`, `company-profile.json`, `tasks.json`, `social-posts.json`) ยังเก็บใน `data/` ปกติ — backup ขึ้น Drive ผ่าน `/api/setup/backup` ไม่ใช่ Sheets

**ค่า topic ที่ใช้:** `sales-pipeline`, `employees`, `finance`, `tickets`, `content-calendar`

**Dashboard:** หน้า Files มี panel "📊 Google Sheets" — กด pull/push ทีละหัวข้อหรือทั้งหมดได้ และมีปุ่ม "สร้าง Sheets ทุกหัวข้อ" สำหรับ init ครั้งแรก

## Slash commands ที่มี

- `/daily-standup` — สรุป pipeline + KPI + ticket ค้าง ทุกเช้า
- `/kpi-report` — รายงาน KPI ทุกแผนก พร้อมสถานะ on/off track
- `/sales-forecast` — พยากรณ์ยอดขายจาก pipeline ปัจจุบัน
- `/run-workflow <ชื่อ>` — รัน SOP ที่บันทึกไว้ใน `outputs/sop-*.md`

## คอนเวนชัน

- **เวลา**: ใช้รูปแบบ ISO `YYYY-MM-DD`
- **เงิน**: หน่วย THB เสมอ ใส่คอมม่าทุก 3 หลัก
- **ชื่อไฟล์ output**: `YYYY-MM-DD-<หัวข้อ>.md`
- **โทนคำตอบ**: มืออาชีพ กระชับ มีตัวเลขประกอบ ไม่ใส่ emoji เกินจำเป็น
