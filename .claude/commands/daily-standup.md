---
description: สรุป pipeline + KPI + ticket ค้าง ทุกเช้า — รวบจาก 3 แผนกขนานกัน
argument-hint: "(ไม่ต้องมี argument)"
---

รัน **Daily Standup** — รวบรวมสถานะเปิดวัน

ขั้นตอน:
1. ใช้ `Task` tool delegate แบบขนาน 3 ตัว:
   - `@sales-rep` — สรุป pipeline: ดีลเปลี่ยน stage ใน 24 ชม., ดีลใกล้ปิด, ดีลเสี่ยง พร้อมตัวเลข weighted forecast
   - `@kpi-analyst` — อัปเดต `data/kpi.json` แล้วสรุปว่าตัวไหน `on_track` / `at_risk` / `off_track`
   - `@customer-support` — สรุป ticket: open / over-SLA / รอ customer reply

2. รวมผลทั้ง 3 แผนกเป็นรายงานสั้นรูปแบบ:
   ```
   # Daily Standup — YYYY-MM-DD

   ## Pipeline (Sales)
   ...

   ## KPI Snapshot
   ...

   ## Support
   ...

   ## ต้องให้ความสนใจวันนี้ (top 3)
   1. ...
   2. ...
   3. ...
   ```

3. บันทึกเป็น `outputs/standup-YYYY-MM-DD.md`
4. แสดงรายงานในแชตให้ผู้ใช้เห็นทันที
