# Virtual AI Company — Dashboard (Next.js)

Dashboard สำหรับคุยกับพนักงาน AI ทั้ง 8 แผนกของบริษัทเสมือน พร้อมแผง KPI แบบเรียลไทม์

ใช้ **Claude Agent SDK** เป็นตัวเรียก Claude — โดย default ใช้ login ของ **Claude Max / Pro / Team** ที่คุณ login ไว้กับ Claude Code อยู่แล้ว **ไม่ต้องมี ANTHROPIC_API_KEY**

## คุณสมบัติ

- **Sidebar** การ์ดพนักงาน 8 คน พร้อมไฟ KPI เขียว/เหลือง/แดง ของแต่ละคน
- **หน้าต่างแชต** คุยกับพนักงานทีละคน — รองรับ streaming คำตอบ + render markdown (ตาราง, code block)
- **KPI Panel** อ่านจาก `data/kpi.json` แสดงเป็นการ์ดสีตามสถานะ on/at-risk/off พร้อม progress bar
- พนักงานทุกคน "อ่าน" ไฟล์ `data/` ของตัวเองได้ผ่าน SDK (Read/Grep/Glob) + ค้นเว็บได้ (WebSearch)
- ทั้งหมดวิ่งผ่าน server เท่านั้น — client ไม่เห็น auth หรือ system prompt

## วิธีเริ่มใช้

### ขั้นแรก: ตรวจว่ามี `claude` CLI และ login แล้ว
```bash
which claude            # ต้องเจอ
claude /status          # ต้องเห็นบัญชี Max/Pro
```

ถ้ายังไม่มี ติดตั้งและ login ตามนี้:
```bash
npm install -g @anthropic-ai/claude-code   # หรือใช้ installer ตามวิธีของ Claude Code
claude login                               # login ด้วย Claude Max ของคุณ
```

### ติดตั้งและรัน dashboard
```bash
cd dashboard
npm install
npm run dev
```
เปิด http://localhost:3000

> ไม่ต้องตั้ง `.env.local` เลย หาก login Claude Code แล้ว — SDK จะใช้ token ของ Max ให้อัตโนมัติ

### ถ้าอยากใช้ API key แทน (ทางเลือก)
```bash
cp .env.local.example .env.local
# ตัดเครื่องหมาย # หน้า ANTHROPIC_API_KEY ออก แล้วใส่ค่า
```

## สถาปัตยกรรม

```
dashboard/
├─ app/
│  ├─ layout.tsx          # root layout (Tailwind + global font)
│  ├─ page.tsx            # หน้าหลัก: sidebar + chat + KPI panel
│  ├─ globals.css         # design tokens + base styles
│  └─ api/
│     ├─ chat/route.ts    # POST: ประกอบ system prompt + เรียก SDK
│     ├─ kpi/route.ts     # GET: อ่าน ../data/kpi.json
│     └─ employees/route.ts # GET: รายชื่อพนักงาน
├─ components/
│  ├─ Sidebar.tsx
│  ├─ EmployeeCard.tsx
│  ├─ ChatPane.tsx        # streaming chat + markdown render
│  ├─ KpiPanel.tsx
│  └─ kpi-utils.ts
└─ lib/
   ├─ employees.ts        # registry พนักงาน 8 คน
   ├─ repo.ts             # อ่านไฟล์จาก ../data, ../.claude
   └─ buildSystemPrompt.ts # ประกอบ system prompt จาก CLAUDE.md + agent.md + data
```

## Auth flow

```
Browser  ──POST {employee, messages}──►  /api/chat (server)
                                          │
                                          ├─ อ่าน .claude/agents/<employee>.md
                                          ├─ อ่าน data/*.csv ที่เกี่ยวข้อง
                                          ├─ ประกอบ system prompt
                                          ▼
                              @anthropic-ai/claude-agent-sdk
                                          │
                                          ├─ ใช้ Claude Max login จาก ~/.claude/
                                          │   (หรือ ANTHROPIC_API_KEY ถ้าตั้งไว้)
                                          ▼
                                  Anthropic backend
                                          │
                                          ▼ (stream)
                            แปลงเป็น text stream กลับ browser
```

Client ไม่เคยเห็น token, ไม่เคยรู้ system prompt — มีแค่ข้อความ user/assistant

## เก็บไฟล์อัตโนมัติ + Google Drive sync

ทุกไฟล์ที่พนักงาน AI สร้างจะถูก **จัดลงโฟลเดอร์ย่อยใน `outputs/`** อัตโนมัติหลังจบ turn ตาม prefix ของชื่อไฟล์:

```
outputs/
  invoices/     # invoice-*, inv-*
  quotes/       # quote-*
  reports/      # kpi-report-*, sales-forecast-*, standup-*
  strategy/     # strategy-*, decision-memo-*
  sops/         # sop-*, workflow-run-*
  content/      # content-*, copy-*, campaign-*, asset-brief-*
  hr/           # jd-*, onboarding-*, policy-*
  support/      # reply-ticket-*, kb-*
  uploads/      # ไฟล์ที่ผู้ใช้แนบเข้ามา
  misc/         # อื่น ๆ
```

### Sync ขึ้น Google Drive (optional, แต่ง่ายมาก)
ใช้ **Google Apps Script Web App** เป็นตัวรับ — ไม่ต้องเปิด Cloud Console, ไม่ต้องสร้าง service account, ไม่ต้องตั้ง env var

1. ในแท็บ **📁 Files** กดปุ่ม **+ เชื่อม Drive**
2. ก๊อปสคริปต์ที่ระบบแสดงให้
3. เปิด [script.google.com → New project](https://script.google.com/home/projects/create) → paste → Save
4. กด **Deploy** → New deployment → Type: **Web app**
5. ตั้ง **Execute as: Me** + **Who has access: Anyone** → Deploy → Authorize
6. ก๊อป **Web app URL** (ลงท้ายด้วย `/exec`) มาวางใน dashboard → กด **ทดสอบและเชื่อม**

เสร็จแล้ว — กด **☁ Sync now** ทุกครั้งที่อยากอัปไฟล์ขึ้น Drive ส่วนตัว

ระบบจะ:
- สร้างโฟลเดอร์ **Virtual AI Company/** บน Drive ของคุณเอง
- สร้าง subfolder ตาม category (`🧾 Invoices & Receipts`, `📊 Reports & Analytics`, ฯลฯ)
- Upload ใหม่ / update ที่เปลี่ยน / skip ไฟล์ที่ขนาดไม่เปลี่ยน
- จำสถานะใน `data/.drive-state.json` (gitignored)
- ทุกไฟล์ที่ sync แล้วมีไอคอน ☁ ใน Files tab คลิกเปิดบน Drive ได้

ยกเลิกการเชื่อม: กดปุ่ม "ยกเลิก" — ลบแค่ `data/.drive-config.json` (ไฟล์ที่อัปไปแล้วยังอยู่บน Drive)

## หมายเหตุ

- ต้องรันจากโฟลเดอร์ `dashboard/` เพื่อให้ `process.cwd()` ชี้ถูก (พ่อโฟลเดอร์คือ repo root)
- ไฟล์ `data/` และ `.claude/agents/` อ่านสด ๆ ทุก request — แก้แล้วเห็นผลทันทีโดยไม่ต้อง restart
- การ stream ผ่าน SDK จะเป็น chunk ของ text (ไม่ใช่ token-by-token) — ยังเห็นทยอยออก ไม่ใช่รอครั้งเดียวจบ
- ถ้าได้ error `Cannot find module '@anthropic-ai/claude-agent-sdk'` แปลว่า `npm install` ยังไม่จบ
- ถ้าได้ error `claude: command not found` แปลว่า Claude Code ยังไม่อยู่ใน PATH — ติดตั้งและ login ก่อน
