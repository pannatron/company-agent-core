---
description: รัน SOP ที่บันทึกไว้ใน outputs/sop-<ชื่อ>.md (เรียก ops-manager เป็นตัวประสาน)
argument-hint: "<ชื่อ workflow เช่น new-customer-onboarding>"
---

รัน workflow: **$ARGUMENTS**

ขั้นตอน:
1. ตรวจว่าไฟล์ `outputs/sop-$ARGUMENTS.md` มีอยู่จริง — ถ้าไม่มีให้แจ้ง user และเสนอให้ `@ops-manager` เขียน SOP ใหม่ก่อน
2. อ่าน SOP เพื่อรู้:
   - Trigger / Inputs / Steps / Outputs / Owner per step
3. ใช้ `Task` tool delegate ไปหา subagent ที่ระบุใน owner ของแต่ละ step (ขนานกันถ้า step ไม่มี dependency)
4. รวบผลทุก step สรุปเป็นรายงาน:
   ```
   # Workflow Run: $ARGUMENTS — YYYY-MM-DD
   Status: ✓ completed / ⚠ partial / ✗ failed

   ## Steps
   - [1] <step> by <agent> → result
   - [2] ...

   ## Output files
   - outputs/...
   ```
5. บันทึก `outputs/workflow-run-$ARGUMENTS-YYYY-MM-DD.md`
