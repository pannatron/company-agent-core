---
name: kpi-framework
description: กรอบคิด KPI/OKR — leading vs lagging, การคำนวณ % บรรลุ, สถานะ on/at-risk/off-track, สูตร KPI ของแต่ละแผนก ใช้เวลา kpi-analyst ทำงาน
---

# KPI Framework

## 1. Leading vs Lagging
- **Lagging** — ผลลัพธ์ที่เกิดแล้ว เปลี่ยนไม่ได้ (Revenue, Profit, Churn)
- **Leading** — ตัวที่ทำได้วันนี้ แล้วผลตามมา (Demos booked, Trial signups, NPS, MQL)

KPI ที่ดี = leading 2 ตัว + lagging 1 ตัว ต่อ objective

## 2. การคำนวณ % บรรลุ
**กรณี "ยิ่งมากยิ่งดี"** (revenue, sign-ups, ...):
```
% = (current ÷ target) × 100
```

**กรณี "ยิ่งน้อยยิ่งดี"** (churn, response time, error rate):
```
% = (target ÷ current) × 100
```

## 3. กรอบสถานะ (ใช้กับ kpi.json)
| %บรรลุ | Status |
|---|---|
| ≥ 90% | `on_track` |
| 70–89% | `at_risk` |
| < 70% | `off_track` |

ถ้าเดือนยังไม่จบ → pro-rate target ก่อนเทียบ
**pro-rated target** = target × (วันที่ผ่านไป ÷ วันทั้งเดือน)

## 4. KPI Library ตามแผนก (default set)
**Sales**
- Monthly New Revenue (lagging)
- Pipeline coverage = Pipeline ÷ Quota (leading, ต้องการ ≥ 3x)
- Win Rate
- Avg Sales Cycle (วัน)

**Marketing**
- MQL จำนวน/เดือน (leading)
- Cost per MQL
- Content reach
- Email CTR

**Finance**
- Gross Margin %
- Cash Runway (เดือน)
- AR Days Outstanding

**HR**
- Time to Hire (วัน)
- Employee NPS
- Voluntary Turnover %

**Support**
- First Response Time
- SLA Compliance %
- CSAT

## 5. KPI Review Cadence
- **Daily**: pipeline change, ticket SLA, cash
- **Weekly**: leading indicators ทุกแผนก
- **Monthly**: lagging + ตัดสินใจ
- **Quarterly**: OKR ทบทวน + ตั้งใหม่

## 6. โครง kpi.json
```json
{
  "kpis": [
    {
      "id": "sales_mrr",
      "name": "Monthly Recurring Revenue",
      "department": "sales",
      "owner": "sales-rep",
      "direction": "higher_is_better",
      "target": 500000,
      "current": 420000,
      "unit": "THB",
      "status": "at_risk",
      "updated_at": "YYYY-MM-DD"
    }
  ]
}
```
