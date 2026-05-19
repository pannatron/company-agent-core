# SOP: ตั้งค่า Facebook auto-post (ครั้งเดียว)

> เป้าหมาย: ให้ระบบโพสต์ลง Facebook Page อัตโนมัติ เมื่อ social-media-manager ตั้ง `status=scheduled`
> ที่ผู้ใช้ทำ: 1 ครั้ง (~15 นาที) — เก็บ Page ID + Page Access Token ที่ไม่หมดอายุ
> หลังจากนั้น: agent ทำงานปกติ ระบบโพสต์ให้

## สิ่งที่ต้องเตรียม
- Facebook Page ที่คุณเป็น admin
- Apps Script ที่ deploy แล้ว (v6 ขึ้นไป) + URL `/exec` ผูกกับ dashboard
- Apps Script รัน `authorize` แล้ว (จะ grant scope `UrlFetchApp` ที่ใช้เรียก Graph API)

---

## ขั้นที่ 1 — สร้าง Facebook App
1. เปิด https://developers.facebook.com/apps/ → กด **Create app**
2. **Use case**: เลือก "Other"
3. **App type**: Business
4. ตั้งชื่อ + อีเมล → Create app

> ไม่ต้อง submit App Review ถ้าจะใช้กับ Page ที่ตัวเองเป็น admin

## ขั้นที่ 2 — เก็บ App ID + App Secret (ใช้ใน step 4)
- ในหน้า App → **Settings → Basic**
- ก๊อป **App ID** และ **App Secret** เก็บไว้ (จะใช้เปลี่ยน short-lived token เป็น long-lived)

## ขั้นที่ 3 — ขอ Short-lived User Token (60 นาที)
1. เปิด https://developers.facebook.com/tools/explorer/
2. มุมบนขวา → เลือก **Application: <ชื่อแอปของคุณ>**
3. **User or Page**: User Token
4. กดปุ่ม **Permissions** → ติ๊ก scopes:
   - `pages_show_list`
   - `pages_manage_posts`
   - `pages_read_engagement`
5. กด **Generate Access Token** → login + Allow
6. ก๊อป token ที่ได้ (ขึ้นต้นด้วย `EAA...`)

## ขั้นที่ 4 — แลกเป็น Long-lived User Token (60 วัน)
เปิด terminal หรือเอาไปใส่ใน URL bar:
```
https://graph.facebook.com/v18.0/oauth/access_token?
  grant_type=fb_exchange_token&
  client_id=<APP_ID>&
  client_secret=<APP_SECRET>&
  fb_exchange_token=<SHORT_USER_TOKEN>
```
(บรรทัดเดียวจริง — เอา newline ออก)

ตอบกลับจะเป็น JSON:
```json
{ "access_token": "EAAx...long...", "token_type": "bearer", "expires_in": 5183999 }
```
ก๊อป `access_token` ใหม่ — นี่คือ long-lived user token

## ขั้นที่ 5 — แลกเป็น Page Access Token (ไม่หมดอายุ!)
กลับไปที่ Graph API Explorer → เปลี่ยน Access Token เป็น long-lived user token ที่ได้
แล้วเรียก:
```
GET /me/accounts
```
ตอบกลับ:
```json
{
  "data": [
    {
      "id": "1234567890",
      "name": "ชื่อ Page ของคุณ",
      "access_token": "EAAx...PAGE_TOKEN..."
    }
  ]
}
```
- `id` ของ Page = **Page ID** ที่จะใส่ใน dashboard
- `access_token` ของ Page = **Page Access Token** — token นี้ **ไม่หมดอายุ** (ตราบใดที่ user token ที่เอามาแลกเป็น long-lived)

## ขั้นที่ 6 — ใส่ใน dashboard
1. เปิด dashboard → tab **Social**
2. ดู panel "📘 Facebook Page auto-post" → กด **🔧 ตั้งค่าครั้งแรก**
3. กรอก:
   - **Page ID**: เลขที่ได้จาก step 5
   - **Page Access Token**: token ยาว ๆ ที่ได้จาก step 5
   - **interval**: 5 นาที (default)
4. กด **บันทึก**
5. กด **▶ ทดสอบโพสต์** → พิมพ์ "test from dashboard 🤖" → กดโพสต์
6. ถ้าเห็น Facebook URL กลับมา ✓ ใช้ได้
7. กลับมาที่ panel หลัก → กด **▶ เปิด auto-post**

จากนี้ — เวลา agent ตั้ง `status=scheduled` ใน `social-posts.json`:
- กด **⬆ Push** (หรือใช้ auto-sync) → ขึ้น Sheets queue
- Apps Script trigger จะโพสต์ให้ใน 5 นาทีถัดไป
- กด **⬇ Pull** → ได้ `external_url` + `published_at` กลับมาใน local

## Troubleshooting

| อาการ | แก้ |
|---|---|
| "ไม่ได้รับอนุญาตให้เรียกใช้ UrlFetchApp" | กลับไปรัน `authorize` ใน Apps Script → Allow scope |
| Test post: "HTTP 400 ... permission" | Token ขาด scope — ทำ step 3-5 ใหม่ ติ๊ก scopes ให้ครบ |
| Trigger ติด แต่ไม่โพสต์ | เปิด script.google.com → ดู Executions ดู error log; ส่วนใหญ่คือ scheduled_at format ผิด (ต้องเป็น ISO) |
| โพสต์แล้วไม่มี external_url กลับ | Pull จาก Sheets ก่อน (ปุ่ม ⬇ Pull) — local มี delay กว่า cloud |

## หมายเหตุเรื่องความปลอดภัย
- Token เก็บใน **Apps Script ScriptProperties** ไม่ใช่ใน source code → ไม่ติด git
- ถ้าคิดว่า token รั่ว → ไปที่ https://www.facebook.com/settings?tab=applications → revoke แอป → กลับมาทำ step 3-5 ใหม่
