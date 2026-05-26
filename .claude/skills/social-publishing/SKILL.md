---
name: social-publishing
description: เครื่องมือจัดคิว social — ตารางเวลาโพสต์ที่ดีต่อแพลตฟอร์ม, pre-publish checklist, status flow, engagement KPI, JSON schema ของ social-posts.json ใช้เวลา social-media-manager ทำงาน
---

# Social Publishing Toolkit

## 0. Fast Path: รูป + ข้อความ → Facebook

ใช้เมื่อผู้ใช้พูดประมาณ: "ทำโพสต์อันนี้แล้วยิงลงเฟส", "ตั้งโพสต์รูปนี้ตอน 19:00", "publish รูปนี้เลย"

**กฎเหล็ก — ห้ามทำ**:
- ❌ **ห้ามใช้ AskUserQuestion** เพื่อ confirm 2-3 ข้อก่อนเขียน — ถ้า user สั่ง "ทำ/ยิง/ตั้ง/post" คือทำได้เลย
- ❌ **ห้าม Edit JSON ก่อน Read** — Edit fail ทันทีเพราะระบบบังคับ Read ก่อน
- ❌ **ห้าม `cd` ออกนอก project root** — ใช้ relative path จาก cwd ได้เลย
- ❌ **ห้าม set `asset_drive_id` เอง** — dashboard auto-lookup จาก `.drive-state.json` ให้
- ❌ **ห้ามใช้รูปดิบจาก `outputs/uploads/`** — ต้อง resize ก่อนเสมอ. `asset_file` ต้องชี้ที่ `outputs/content/...-web.jpg` เท่านั้น **server จะ reject ถ้าไม่ใช่** (validateAssetProcessed: ชื่อต้องมี `-web`, size ≤ 1.5MB)

### ลำดับ 6 ขั้น (consult playbook ทุกขั้นที่เป็น shell)

> **กฎทอง**: ก่อนรัน shell command ตรวจ `data/playbook.json` ก่อนเสมอ — ถ้าเจอ entry ที่ task ใกล้เคียง ใช้ command นั้นเลย แทน {placeholder} ด้วยค่าจริง อย่าคิดเอง รายละเอียดวิธีใช้ playbook อยู่ใน `.claude/CLAUDE.md` section "Learned Playbook"

1. **Read รูปที่ user แนบ** (path `outputs/uploads/<timestamp>-...` จาก system message)

2-3. **rename + resize → `outputs/content/...-web.jpg`** (ทำทีเดียว ห้ามแยก)
   - **playbook lookup**: `task ≈ "prepare-fb-image"` → seed มี entry `prepare-fb-image` แล้ว (รวม cp + sips Z 1080 q85 ในคำสั่งเดียว)
   - ใช้ command จาก playbook เลย แทน `{src} {date} {slug} {ext}` ด้วยค่าจริง
   - **ทำไมต้องรวม 2 step**: ก่อนหน้านี้ agent ทำแค่ cp แล้วลืม resize → server reject post (BUG 2026-05). entry นี้กัน mistake ด้วยการ chain ด้วย `&&`
   - output **บังคับ** เป็น `outputs/content/content-YYYY-MM-DD-<slug>-web.jpg`
   - `asset_file` ใน social-posts.json **ชี้ไปที่ `-web.jpg` เท่านั้น** (ห้ามชี้ master file, ห้ามชี้ uploads)
   - ถ้า sips fail (HEIC/SVG) → ลอง `fallback` field; ยัง fail → แจ้ง user หยุดทันที ห้ามชี้รูปดิบไป push

4. **คำนวณ `scheduled_at`** — ISO + timezone
   - **playbook lookup**: `task ≈ "schedule_at now+N minutes timezone TH"` → seed มี `schedule-at-now-plus-n-min-th`
   - "ยิงเลย" = N=2 (เผื่อ Apps Script รอบถัดไป), "ตั้ง 19:00" = คำนวณเอง
   - ถ้าเครื่อง user timezone อื่น → append entry ใหม่ของ timezone นั้น

5. **Read `data/social-posts.json` → Edit append post entry** (ก่อน `]` ปิด `posts`)
   ```json
   {
     "id": "post-YYYY-MM-DD-<slug>",
     "platform": "Facebook",
     "status": "scheduled",
     "title": "<หัวเรื่อง>",
     "copy": "<เนื้อโพสต์เต็ม>",
     "asset_file": "outputs/content/content-YYYY-MM-DD-<slug>-web.jpg",
     "writer": "<slug>",
     "designer": "<slug>",
     "approved_by": "<slug>",
     "scheduled_at": "<ISO จากขั้น 4>",
     "campaign": "<optional>"
   }
   ```

6. **Push ขึ้น Sheet** — Apps Script ยิงจริงจาก Sheet ไม่ใช่ JSON
   - **playbook lookup**: `task ≈ "push social to sheet"` → seed มี `push-social-sheet`
   - ใช้ curl จาก entry; ถ้า port/host ต่างกัน (เครื่องอื่น) → update entry หลังยืนยัน
   - ถ้า dashboard เปิด auto-sync ไว้ ขั้นนี้ทำให้แล้วหลัง agent turn จบ — agent ไม่ต้อง curl เอง
   - **ถ้า push คืน 400 + issue เกี่ยวกับ asset_file** (เช่น "ไม่มี -web", "ใหญ่เกิน 1.5MB", "ชี้ outputs/uploads/") → แปลว่าข้ามขั้น 2-3 ให้กลับไปรัน `prepare-fb-image` ใหม่ แล้วแก้ `asset_file` ใน social-posts.json ให้ชี้ `-web.jpg` ก่อน push อีกครั้ง

### ตอบ user สั้น

```
✓ post-2026-05-22-3dprint scheduled 13:17 น.
  → Apps Script จะยิงภายใน 5 นาที
  → ถ้าไม่ขึ้นใน 10 นาที กด pull จาก Social tab
```

### ครั้งแรกที่ไม่มีอะไรใน playbook (เครื่องใหม่)

- agent ลองคำสั่ง default (เช่น sips บน macOS, magick บน linux) → ถ้า work → **append เข้า playbook ทันที** พร้อม timestamp + verified_by
- ครั้งถัดไป agent คนใดก็เจอ entry นี้ ใช้ได้เลย ไม่ต้องลองใหม่
- **อย่าฮาร์ดโค้ด command ใน skill** — เก็บไว้ใน playbook เท่านั้น เพื่อให้ portable

## 1. Status Flow ของโพสต์
```
draft → ready_for_review → approved → scheduled → published
                                      ↘ rejected ↗ (กลับไปแก้)
```

ทุกครั้งที่อัปเดต `status` ต้องเซ็ต field ตามนี้:
- `ready_for_review` → ใส่ `writer` + `designer`
- `approved` → ใส่ `approved_by`
- `scheduled` → ใส่ `scheduled_at` (ISO datetime)
- `published` → ใส่ `published_at` + `external_url`

## 2. Optimal Time Windows (Thai audience)
| Platform | วัน | เวลา (TH) |
|---|---|---|
| LinkedIn | Tue-Thu | 08:00-10:00, 17:00-19:00 |
| Facebook | ทุกวัน | 11:00-13:00, 19:00-21:00 |
| Instagram | ทุกวัน | 11:00-13:00, 19:00-22:00 |
| X (Twitter) | ทุกวัน | 09:00-10:00, 15:00-16:00 |
| TikTok | ทุกวัน | 18:00-22:00 |

หลีกเลี่ยง: คืนวันศุกร์-เสาร์เช้า (engagement ต่ำสำหรับ B2B)

## 3. Pre-publish Checklist (ทำก่อนเปลี่ยน status เป็น scheduled)
- [ ] `copy` ผ่าน Noah แล้วและตรง brand voice
- [ ] `asset_prompt` หรือไฟล์รูปจาก Lin (และ aspect ratio ตรงแพลตฟอร์ม)
- [ ] CTA ชัด + link tracking (UTM) ใส่แล้ว
- [ ] Hashtag เช็ค → ห้าม banned, ≥ 1 brand tag
- [ ] Mention คนถูกต้อง (@partner / @customer)
- [ ] วันเวลาตรง timezone (Asia/Bangkok = UTC+7)
- [ ] Approved_by ระบุชื่อ marketing-lead หรือ CEO

## 4. JSON Schema (data/social-posts.json)
```json
{
  "updated_at": "YYYY-MM-DD",
  "accounts": [
    { "id": "linkedin-company", "platform": "LinkedIn", "handle": "...", "connected": true|false }
  ],
  "posts": [
    {
      "id": "POST-001",
      "platform": "LinkedIn",
      "status": "draft" | "ready_for_review" | "approved" | "scheduled" | "published",
      "title": "หัวข้อสั้น (ใช้ใน UI)",
      "copy": "ตัวเนื้อโพสต์เต็ม",
      "asset_prompt": "บรรยายรูป/ไฟล์ asset ที่จะใช้",
      "asset_file": "outputs/uploads/xxx.png  (optional)",
      "designer": "content-designer",
      "writer": "copywriter",
      "approved_by": "marketing-lead",
      "scheduled_at": "ISO datetime",
      "published_at": "ISO datetime  (เมื่อ status = published)",
      "external_url": "https://...  (link ของโพสต์จริง)",
      "campaign": "Q2-launch  (optional, ลิงก์กับ marketing campaign)",
      "engagement": { "likes": 0, "comments": 0, "shares": 0, "views": 0 }
    }
  ]
}
```

## 5. Engagement Score (สำหรับสรุปสัปดาห์)
```
score = likes + (comments × 3) + (shares × 5)
reach_efficiency = score ÷ views × 1000   // เท่ากับ engagement per 1k impressions
```

**Benchmarks (Thai SME):**
- LinkedIn: ≥ 30 score / 1k views = good
- Facebook page: ≥ 20 / 1k
- Instagram: ≥ 40 / 1k (audience นิยม save / comment)
- X: ≥ 15 / 1k

## 6. หลังโพสต์ — Post-Mortem 24 ชม.
- เก็บ engagement ครั้งแรก 6 ชม. → คาดเดา reach รวม
- ถ้า engagement rate < 50% ของค่าเฉลี่ย → ทำ A/B กับ caption รอบใหม่
- ถ้าโพสต์ดี → re-purpose ลง platform อื่น ภายใน 7 วัน
