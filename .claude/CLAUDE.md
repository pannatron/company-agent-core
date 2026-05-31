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

**กติกาเวลาทำงานกับ CSV เหล่านี้ (บังคับ — semi-auto flow):**

ทุกครั้งที่ user สั่งงานที่จะ "อ่านตัวเลข" หรือ "แก้ข้อมูล" ใน CSV ใดใน 5 ไฟล์นี้ (`sales-pipeline.csv`, `employees.csv`, `finance.csv`, `tickets.csv`, `content-calendar.csv`) — agent **ต้องเดิน 3 step นี้เองโดยไม่ต้องรอ user สั่งย่อย** และ **แจ้ง user สั้น ๆ ก่อนแต่ละ step** (ไม่ใช่ silent):

```
[1] "กำลัง pull <topic>…"   → Bash: node scripts/sheets-sync.mjs pull <topic>
[2] "แก้ data/<file>…"      → Edit (เห็น diff, user กดอนุญาตปกติ)
[3] "push กลับขึ้น Sheet…"  → Bash: node scripts/sheets-sync.mjs push <topic>
```

- **ห้ามข้าม step 1** แม้คิดว่า cache สด — ของบน Sheet อาจถูกแก้จากมือถือ/คนอื่นระหว่างนั้น
- **ห้ามข้าม step 3** เด็ดขาด — แก้แล้วไม่ push = Sheet stale + pull ครั้งหน้าทับงานหายเงียบ
- **ห้ามรวบ 3 step เป็น `&&` chain** เพื่อข้าม approval — user อยากกดอนุญาตทีละ step
- ถ้าเป็นแค่ "ดูข้อมูล" ไม่แก้ → ทำแค่ step 1 พอ
- ถ้า `pull` fail (Apps Script down/v ไม่ตรง) → **หยุด** บอก user ห้ามแก้ local ต่อ
- ถ้า user สั่งงานที่ยังขาดข้อมูล (เช่น "เพิ่มพนักงาน" แต่ไม่บอกบัญชี/เงินเดือน) → ถามให้ครบก่อน step 2

ไฟล์ JSON (`kpi.json`, `company-goals.json`, `company-profile.json`, `tasks.json`, `social-posts.json`) ไม่ใช้ flow นี้ — ยังเก็บใน `data/` ปกติ backup ขึ้น Drive ผ่าน `/api/setup/backup`

**ค่า topic ที่ใช้:** `sales-pipeline`, `employees`, `finance`, `tickets`, `content-calendar`

**Dashboard:** หน้า Files มี panel "📊 Google Sheets" — กด pull/push ทีละหัวข้อหรือทั้งหมดได้ และมีปุ่ม "สร้าง Sheets ทุกหัวข้อ" สำหรับ init ครั้งแรก

## Learned Playbook (สำคัญ — agent ทุกตัวอ่าน)

`data/playbook.json` เก็บคำสั่ง/ขั้นตอนที่ **work จริงในเครื่องนี้** ทุก agent ใช้ร่วมกัน เพื่อไม่ต้องลองผิดลองถูกซ้ำ (ก่อนแก้ระบบนี้: agent เสีย 5-6 tool turns ลองผิด `date`, `sips`, `cp` paths)

### Schema
```json
{
  "entries": [
    {
      "id": "kebab-slug",
      "task": "อธิบาย task เป็นภาษาคน (1 บรรทัด ให้ agent อื่น match ได้)",
      "command": "shell command พร้อม {placeholder}",
      "platform": "darwin" | "linux" | "win32" | "*",
      "fallback": "command อีกตัว (optional)",
      "fallback_platform": "linux|win32",
      "verified_at": "YYYY-MM-DD",
      "verified_by": "ชื่อ agent หรือ system-seed",
      "notes": "quirks/gotchas (optional)"
    }
  ]
}
```

### กฎการใช้ playbook (ทุก agent)

**ก่อนรัน shell command ที่อาจ platform-specific** (date, file ops, image tools, archive, ฯลฯ):
1. **Grep playbook ก่อน** — `grep -i "<keyword>" data/playbook.json` หรือ Read แล้วหา `entries[*].task` ที่ใกล้เคียง
2. **เจอ + platform ตรง** (`uname -s` == entry.platform หรือ entry.platform == `"*"`) → **ใช้คำสั่งนั้นเลย** แทน {placeholder} ด้วยค่าจริง อย่าคิดเอง
3. **เจอ task ตรง แต่ platform ไม่ตรง** → ใช้ `fallback` ถ้ามี ไม่งั้นค่อยคิดเอง
4. **ไม่เจอ** → คิดคำสั่งเอง รัน ถ้า work → **append entry ใหม่** ลง playbook ทันที (อ่าน-edit-save ผ่าน Edit tool, ห้ามลบของคนอื่น)

**ที่ควรเซฟลง playbook**:
- คำสั่งที่เคยลองผิดลองถูก (sips/imagemagick, ffmpeg, date, find -exec)
- API endpoint ของ dashboard (curl URL + payload pattern)
- Path quirks ของเครื่อง user (ที่อยู่ของ asset, output, dashboard port)
- ขั้นตอนยาวที่มีโอกาสพลาดถ้าทำซ้ำ (เช่น "rename + move + sync slip การเงิน 5 step")

**ที่ไม่ควรเซฟ**:
- คำสั่ง one-off (เช่น "Edit ไฟล์ X บรรทัด Y" — เป็น context-specific)
- ข้อมูลจริง (ตัวเลข KPI, ชื่อลูกค้า) — playbook เก็บแค่ "วิธีทำ" ไม่ใช่ "ข้อมูล"
- ข้อมูล secret (token, password) — ห้ามเด็ดขาด

**ตัวอย่าง flow**:
```
user: ตั้งโพสต์รูปนี้ลงเฟส
agent: [Grep playbook "resize" → เจอ entry resize-image-web-1080]
agent: [รัน sips -Z 1080 ... ทันที — ไม่ลองคำสั่งอื่น]
agent: [Grep playbook "schedule" → เจอ schedule-at-now-plus-n-min-th]
agent: [รัน TZ=Asia/Bangkok date -v+2M ... ทันที]
agent: [...append post, push sheet via curl entry...]
```

ครั้งแรก seed มี 3 entries: `resize-image-web-1080`, `schedule-at-now-plus-n-min-th`, `push-social-sheet` — entries จะเติมเองตามที่ agent ใช้งานจริง

## AI Video/Image Generation (EvoLink: gpt-image-2-gen + seedance-2-video-gen)

ใช้ทำคลิปแอนิเมชันเป็น series (เช่น Borot เด็กผจญภัยโลกเสมือน). บทเรียนจริง + flow ที่ work (ดูคำสั่งเต็มใน `data/playbook.json` entries: `storyboard-3x3-grid-to-video`, `video-gen-mandatory-inputs-rule`, `run-evolink-image-video-skill`, `upload-image-public-url`).

### Pipeline หลัก (3x3 grid method)
1. **LOCK ตัวละครก่อนเริ่ม series** — gen character turnaround sheet (3x3: front/3-4/side/back/expressions) ต่อ 1 ตัว เก็บเป็น canonical ref ถาวร (`outputs/content/borot-series/*-sheet*.png`)
2. **gen storyboard grid ของแต่ละ EP** — GPT-Image 3x3 (9 ฉาก) รูปเดียว, ใส่ character sheets เป็น `--image` ref (คงตัวละคร)
3. **gen video** — Seedance, โยน grid → คลิป montage 15s

### ⛔ กฎเหล็ก: ห้าม gen วิดีโอทันที (ยิ่ง EP ต่อเนื่อง)
video input ต้องมีครบ **3 องค์ประกอบ** เสมอ:
1. **เฟรมท้ายวิดีโอ EP ก่อนหน้า** (snap: `ffmpeg -y -sseof -0.4 -i ep.mp4 -update 1 -frames:v 1 lf.png`) — ความต่อเนื่อง
2. **character sheet ตัวละครหลักทุกตัว** — กัน drift
3. **storyboard grid ของ EP นั้น** — คุมเนื้อเรื่อง

แล้วยิง **Seedance reference mode** (3-9 รูป): `--mode reference --image "<lastframe>,<kid_sheet>,<borot_sheet>,<ep_grid>"` + prompt อ้างรูปตามเลข ("begin from image 1; boy=image 2; mascot=image 3; follow storyboard image 4"). EP แรกไม่มีเฟรมก่อน → video = โยน grid montage.

### ปัญหาที่เจอ + วิธีแก้ (สำคัญ — อย่าลองผิดซ้ำ)
- **ตัวละคร drift/เพี้ยน** = ใช้ image-to-video (1-2 รูป) คุม character ไม่ได้ → ต้อง **reference mode** ใส่ sheet ด้วยทุกครั้ง
- **API ดึงรูป input ไม่ได้** (`image_processing_error: try a different host`) = **catbox.moe EvoLink ดึงไม่ได้** (HEAD content-length:0). ใช้ **x0.at** (`curl -F "file=@f" https://x0.at`). 0x0.st ตายแล้ว, telegra.ph reject, tmpfiles DNS ไม่ resolve
- **API key** อยู่ `dashboard/.env.local` ชื่อ var `Evolink_API_KEY` (ตัวพิมพ์ผสม! ไม่ใช่ EVOLINK_API_KEY). `set -a; . file; set +a` มัก**ได้ค่าว่าง** (source flaky) → ใช้ grep-extract: `KEY=$(grep -i '^[[:space:]]*Evolink_API_KEY[[:space:]]*=' dashboard/.env.local | head -1 | sed -E 's/^[^=]*=[[:space:]]*//; s/^["'"'"']//; s/["'"'"']$//' | tr -d '\r\n'); export EVOLINK_API_KEY="$KEY"`
- **content_policy_violation** (GPT-Image เข้มเรื่องเด็ก+ความรุนแรง) → เลี่ยง 'child/kid + bedroom/night', คำรุนแรง (attacks/blasts/shatter/clash/mech combat). ใช้ 'fictional cartoon adventurer, not photorealistic, not a real person' + ฉาก daytime + tone wholesome/non-violent (บอส = อุปสรรค แก้ด้วยความฉลาด ไม่ใช่ต่อสู้)
- **quota_exceeded / HTTP 502** = EvoLink route ตันชั่วคราว (ไม่ใช่บัคเรา) → **รอแล้ว retry ทีละครั้ง อย่ายิงรัว** (เคยพลาดยิงวิดีโอซ้อนหลายตัวตอน service ล่ม = เปลือง)
- **script POLL_TIMEOUT** (video 6 นาที / image 5 นาที) แต่ task เสร็จบนเซิร์ฟเวอร์ → อย่า gen ใหม่! poll API ตรงเอง: `GET https://api.evolink.ai/v1/tasks/<task_id>` (ใช้ Monitor tool). recover URL จาก `.results[0]`
- **jq พังกับ response บางตัว** (`control characters must be escaped` — API ใส่ raw newline/dup keys ตอน error) → ใช้ `python3 -c "import json..."` หรือ `grep -oE 'https://files\.evolink\.ai/[^" ]+\.(png|mp4)'` ดึง URL แทน
- **task_id สับสน** = อย่าเดา/อย่าอ่าน log ก่อน submit เขียนเสร็จ. รอ `TASK_SUBMITTED:` ใน log ก่อน แล้วค่อย grep task_id จริง (ลบ log เก่าก่อน gen ใหม่ด้วย `rm -f`). เห็น `TASK_SUBMITTED` แล้ว = อย่ายิงซ้ำ
- **output URL** (`files.evolink.ai`) อายุ 24 ชม. → โหลดเก็บทันที
- **Seedance max 15s/คลิป** — อยากยาว >15s: crop grid เป็น 9 panel (cell 682px, ตัด caption band ล่าง ~140px) → animate ทีละ 4s → `ffmpeg concat`
- **continuity ข้าม EP** = snap เฟรมท้าย EP ก่อน เป็น input EP ถัดไป (last-frame chaining) เสมอ

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
