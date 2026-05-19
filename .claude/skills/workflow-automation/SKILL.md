---
name: workflow-automation
description: คู่มือออกแบบ SOP และ workflow ข้ามแผนก — โครง SOP, trigger types, RACI, การแปลง SOP เป็น slash command ใช้เวลา ops-manager ทำงาน automate
---

# Workflow Automation

## 1. SOP Template (มาตรฐาน)
```markdown
# SOP: <ชื่อขั้นตอน>
**Version:** 1.0 | **Owner:** <แผนก> | **Updated:** YYYY-MM-DD

## Trigger
เมื่อไหร่ที่จะรันขั้นตอนนี้ (เวลา / event / manual command)

## Inputs
- ไฟล์/ข้อมูลที่ต้องใช้
- เงื่อนไขเริ่มต้นที่ต้องเป็นจริง

## Steps
1. <แผนก/agent> — ทำ X → ส่งต่อ Y ให้ <แผนก/agent>
2. ...
3. ...

## Outputs
- ไฟล์/รายงานที่ออกมา + ที่เก็บ

## Owner & Escalation
- Owner รายขั้น (RACI)
- ถ้าติดที่ขั้นไหน escalate ใคร ภายในกี่ชั่วโมง

## Frequency
daily / weekly / monthly / on-demand

## KPI ของ SOP เอง
- Cycle time เป้าหมาย: ...
- Error rate ยอมรับได้: ...
```

## 2. Trigger Types
| Type | ตัวอย่าง |
|---|---|
| **Schedule** | ทุกวัน 09:00, ทุกจันทร์, ทุกสิ้นเดือน |
| **Event** | ดีลเปลี่ยน stage, มี ticket priority สูง, employee onboarding |
| **Threshold** | cash < 3 เดือน, KPI off-track, AR > 60 วัน |
| **Manual** | ผู้ใช้เรียก slash command |

## 3. RACI ฉบับย่อ
- **R**esponsible — คนทำงานจริง
- **A**ccountable — คนรับผิดชอบสุดท้าย (1 คนต่อขั้น)
- **C**onsulted — ปรึกษาก่อนตัดสินใจ
- **I**nformed — แจ้งให้ทราบหลังเสร็จ

## 4. แปลง SOP → Slash Command
1. ระบุ trigger ที่ user เรียกได้ (เช่น `/daily-standup`)
2. ระบุ subagent ที่จะ delegate (`@kpi-analyst`, `@sales-rep`, ...)
3. ระบุ output ที่ user จะเห็น (สรุปสั้น + ลิงก์ไฟล์ใน `outputs/`)
4. เขียนเป็นไฟล์ `.claude/commands/<ชื่อ>.md` ที่บอก Claude ว่าต้อง:
   - อ่านไฟล์อะไร
   - เรียก subagent ตัวไหน
   - รวบผลแบบไหน
   - บันทึกไฟล์ที่ไหน

## 5. ตัวอย่าง cross-department workflow
**Workflow: รับลูกค้าใหม่ (New Customer Onboarding)**
```
[sales-rep] ปิดดีล → อัปเดต sales-pipeline.csv stage=Closed Won
    ↓
[finance-analyst] ออก invoice → บันทึก finance.csv
    ↓ (ขนาน)
[customer-support] สร้าง ticket onboarding ใน tickets.csv
[marketing-lead] เพิ่มลูกค้าเข้า welcome email sequence
    ↓
[kpi-analyst] อัปเดต KPI: new_customers, MRR
```
