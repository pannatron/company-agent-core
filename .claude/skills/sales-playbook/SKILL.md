---
name: sales-playbook
description: คู่มือการขาย B2B — pipeline stages, qualification framework (BANT/MEDDIC), forecast formula, เทมเพลตใบเสนอราคา/อีเมลติดตาม ใช้เวลา sales-rep ทำงานกับ pipeline
---

# Sales Playbook

## 1. Pipeline Stages (standard)
| Stage | นิยาม | Default Probability |
|---|---|---|
| Lead | ติดต่อแล้วยังไม่ qualified | 5% |
| Qualified | ผ่าน BANT แล้ว | 20% |
| Proposal | ส่งใบเสนอราคาแล้ว | 40% |
| Negotiation | ต่อรองเงื่อนไข/ราคา | 70% |
| Closed Won | เซ็นสัญญา | 100% |
| Closed Lost | แพ้ | 0% |

## 2. Qualification: BANT
- **B**udget — มีงบ และอยู่ในช่วงที่เราขายได้?
- **A**uthority — คนที่คุยตัดสินใจได้จริงไหม?
- **N**eed — ปัญหาที่เราแก้ได้จริง?
- **T**imeline — จะตัดสินใจเมื่อไหร่?

ขาด ≥ 2 ตัว → กลับไปอยู่ Lead ไม่ขยับ probability

## 3. Forecast Formula
**Weighted Forecast** = Σ (Amount × Probability) สำหรับดีลที่ยังไม่ปิด

**Best Case** = Σ Amount ของ Proposal + Negotiation
**Commit** = Σ Amount ของ Negotiation ที่มี close date ในเดือน

## 4. Risk Flags (ต้อง escalate)
- ดีลค้าง stage เดิม > 14 วัน
- Probability ลดลงระหว่างเดือน
- ลูกค้าเปลี่ยน contact 2 ครั้งใน 30 วัน
- Close date เลื่อนเกิน 2 ครั้ง

## 5. เทมเพลตใบเสนอราคา
```markdown
# ใบเสนอราคา #Q-YYYYMM-NNN
ลูกค้า: <ชื่อบริษัท>
ติดต่อ: <ชื่อ>
วันที่: <YYYY-MM-DD> | ยืนราคา 30 วัน

## รายการ
| # | รายการ | จำนวน | ราคา/หน่วย | รวม |
|---|---|---|---|---|
| 1 | ... | ... | ... | ... |

ยอดรวม: ...
ภาษี 7%: ...
**สุทธิ: ...**

## เงื่อนไข
- ชำระ 50% มัดจำ / 50% ส่งมอบ
- ระยะเวลาส่งมอบ X สัปดาห์หลังเซ็น
- รวม revision 2 รอบ
```

## 6. เทมเพลตอีเมลติดตาม
- **Day 0**: ขอบคุณที่คุยวันนี้ + สรุปสิ่งที่ตกลง
- **Day 3**: ส่งข้อมูลเพิ่ม + ask soft
- **Day 7**: ask ตรง — "เราต้องเตรียมอะไรเพื่อช่วยให้ตัดสินใจง่ายขึ้น?"
- **Day 14**: breakup email — "ขอปิดเคสไว้ก่อนได้ไหม จะติดต่อใหม่ Q หน้า?"
