---
name: social-publishing
description: เครื่องมือจัดคิว social — ตารางเวลาโพสต์ที่ดีต่อแพลตฟอร์ม, pre-publish checklist, status flow, engagement KPI, JSON schema ของ social-posts.json ใช้เวลา social-media-manager ทำงาน
---

# Social Publishing Toolkit

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
