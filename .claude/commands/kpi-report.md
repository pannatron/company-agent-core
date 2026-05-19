---
description: รายงาน KPI/OKR ทุกแผนก พร้อมสถานะ on/off track และคำแนะนำ
argument-hint: "(ไม่ต้องมี argument)"
---

รัน **KPI Report**

ขั้นตอน:
1. ใช้ `Task` tool เรียก `@kpi-analyst` พร้อม instruction:
   - อ่าน `data/sales-pipeline.csv`, `data/finance.csv`, `data/tickets.csv`, `data/content-calendar.csv`, `data/employees.csv`
   - recompute ค่า current ของ KPI ทุกตัวใน `data/kpi.json`
   - อัปเดต `status` และ `updated_at`
   - สร้างรายงานสรุป

2. รายงานต้องประกอบด้วย:
   - **Headline**: "X / Y KPI อยู่ในระดับ on-track"
   - ตาราง: `KPI | Owner | เป้า | ปัจจุบัน | %บรรลุ | สถานะ`
   - ข้อสังเกต 3-5 ข้อ (จุดที่ดี, จุดที่ต้องเร่ง)
   - คำแนะนำ 1-2 ข้อ ว่าควร delegate ใครทำอะไรต่อ

3. บันทึก `outputs/kpi-report-YYYY-MM-DD.md`
