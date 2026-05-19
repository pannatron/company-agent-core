---
description: พยากรณ์ยอดขายจาก pipeline ปัจจุบัน (Weighted / Best Case / Commit)
argument-hint: "[เดือน เช่น 2026-06 หรือเว้นว่างเพื่อใช้เดือนปัจจุบัน]"
---

รัน **Sales Forecast** สำหรับเดือน: $ARGUMENTS (ถ้าเว้นว่างใช้เดือนปัจจุบัน)

ขั้นตอน:
1. ใช้ `Task` tool เรียก `@sales-rep`:
   - อ่าน `data/sales-pipeline.csv`
   - กรองดีลที่ `expected_close` อยู่ในเดือนเป้าหมาย
   - คำนวณ 3 ตัวเลข:
     - **Weighted Forecast** = Σ(amount × probability)
     - **Best Case** = Σ amount ของ Proposal + Negotiation
     - **Commit** = Σ amount ของ Negotiation ที่ close date อยู่ในเดือน
   - เทียบกับ target เดือนนั้นจาก `data/company-goals.json`
   - ระบุ top 5 ดีลที่จะกระทบ forecast มากที่สุด + ความเสี่ยง

2. รูปแบบรายงาน:
   ```
   # Sales Forecast — <เดือน>
   Target: ... | Weighted: ... | Best: ... | Commit: ...
   Coverage = Pipeline ÷ Target = X.Xx (ต้องการ ≥ 3x)

   ## Top deals
   | Customer | Stage | Amount | Prob | Close | Risk |
   |---|---|---|---|---|---|

   ## Recommendation
   - ...
   ```

3. บันทึก `outputs/sales-forecast-YYYY-MM.md`
