---
name: finance-ops
description: ตัวช่วยการเงิน — สูตร P&L, cashflow forecast, budget variance, เทมเพลต invoice, AR aging, VAT ไทย ใช้เวลา finance-analyst ทำงานกับตัวเลข
---

# Finance Operations

## 1. P&L (Income Statement) — โครงพื้นฐาน
```
Revenue
- COGS (ต้นทุนสินค้า/บริการ)
─────────
= Gross Profit
- OpEx (Salaries, Marketing, Rent, Tools, อื่นๆ)
─────────
= EBITDA
- Depreciation
─────────
= Operating Profit (EBIT)
- Tax (20% นิติบุคคล)
─────────
= Net Profit
```

**Gross Margin %** = Gross Profit ÷ Revenue × 100
**Net Margin %** = Net Profit ÷ Revenue × 100

## 2. Cashflow Forecast (Direct Method) — 3 เดือนข้างหน้า
```
Opening Cash
+ AR Collections (รับจากลูกค้าที่ค้างใน 30/60/90 วัน)
+ Weighted Pipeline (Σ amount × probability ของดีลที่จะปิดเดือนนั้น)
- AP Payments (จ่าย supplier)
- Payroll
- OpEx fixed
- Tax / VAT
─────────
= Closing Cash
```

**Cash Runway (months)** = Cash ÷ Monthly Burn

ถ้า < 3 เดือน → escalate ทันที

## 3. Budget vs Actual
| Item | Budget | Actual | Variance | % | Flag |
|---|---|---|---|---|---|
| Revenue | ... | ... | ... | ... | <±5% ok, >10% ต้องอธิบาย |
| OpEx | ... | ... | ... | ... | over 10% = red |

## 4. AR Aging Buckets
- 0–30 วัน: ปกติ
- 31–60 วัน: ส่ง reminder
- 61–90 วัน: โทร + escalate
- > 90 วัน: ต้องตั้ง provision 50%, > 180 วัน 100%

## 5. Invoice Template (VAT 7%)
```markdown
# INVOICE #INV-YYYYMM-NNN

**ผู้ออก:** <ชื่อบริษัทเรา> | เลขผู้เสียภาษี: ...
**ลูกค้า:** <ชื่อ> | เลขผู้เสียภาษี: ...
**วันที่:** YYYY-MM-DD | **ครบกำหนด:** YYYY-MM-DD (Net 30)

| # | รายการ | จำนวน | ราคา/หน่วย | รวม |
|---|---|---|---|---|
| 1 | ... | ... | ... | ... |

ยอดก่อน VAT: ...
VAT 7%: ...
**ยอดสุทธิ: ... THB**

ชำระโดยโอนเข้า: ธ. ... เลขที่ ... ชื่อบัญชี ...
```

## 6. กฎ VAT ไทย (สรุปย่อ)
- รายได้ > 1.8 ล้าน/ปี → ต้องจด VAT
- VAT ขาย (Output VAT) 7%, VAT ซื้อ (Input VAT) 7% หักได้
- ยื่น ภ.พ. 30 ภายในวันที่ 15 ของเดือนถัดไป
