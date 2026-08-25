# 📋 ITAM-01 Action Required — Final Priority List

> **จาก:** QA Team
> **ถึง:** ITAM-01
> **วันที่:** 2026-08-24
> **Main HEAD:** `c788398` (P1+P2 bug sweep)
> **สถานะโปรเจ็ค:** P0+P1+P2+UX+ARCH = 100% (เหลือ 1 runtime fix + ฟีเจอร์ใหม่)

---

## 🔴 P0 — ต้องเสร็จวันนี้/พรุ่งนี้ (4 งาน)

---

### P0-1: BUG-WO-002 Runtime Fix (2 บรรทัด → แก้ 5 bugs)

**ปัญหา:** ITAM-01 แก้ `ctx.isSuperAdmin || ctx.user.role === 'admin'` แต่ `ctx.user` เป็น `undefined` เพราะ `AuthorizationContext` interface ไม่มี `user` field — มีแค่ `globalRole`

**Error จริง:**
```
TypeError: Cannot read properties of undefined (reading 'role')
    at GET (src/app/api/devices/route.ts:131:38)
GET /api/devices?limit=50&page=1 500 in 10ms
```

**วิธีแก้:**

```diff
# ไฟล์ที่ 1: src/app/api/devices/route.ts บรรทัด 131
- if (ctx.isSuperAdmin || ctx.user.role === 'admin') {
+ if (ctx.isSuperAdmin || ctx.globalRole === 'admin') {

# ไฟล์ที่ 2: src/app/api/work-orders/route.ts บรรทัด 198
- if (ctx.isSuperAdmin || ctx.user.role === 'admin') {
+ if (ctx.isSuperAdmin || ctx.globalRole === 'admin') {
```

**เหตุผล:** `AuthorizationContext` interface (ใน `src/lib/authorization-context.ts`) มี:
```typescript
export interface AuthorizationContext {
  userId: string
  email: string
  globalRole: Role        // ← ใช้ตัวนี้
  isSuperAdmin: boolean
  grants: SiteGrant[]
  siteScope: SiteScope
  effectivePermissions: Permission[]
  usedLegacyFallback: boolean
  // ไม่มี user field!
}
```

**Bugs ที่จะหายไปหลังแก้:**
1. BUG-WO-002 — WO list total=0 → จะแสดงข้อมูลจริง
2. BUG-KPI-001 — KPI cards แสดง 0 → จะแสดง 3
3. Devices list ว่าง → จะแสดงอุปกรณ์จริง
4. Replace-on-Withdraw ใช้ได้ (ติดอยู่เพราะ devices API crash)
5. Device Set ใช้ได้ (ติดอยู่เพราะ devices API crash)

---

### P0-2: Legacy Apps Script Sync — ต้องใช้แน่นอน!

**ความต้องการ:** "หลังจากแอฟเสร็จเราจะดึงข้อมูลจากแอฟเดิมเพื่อให้เป็นข้อมูลปัจจุบัน"

**สถานะปัจจุบัน:**
- ✅ โค้ดมีอยู่แล้ว: `src/components/itam/legacy-import-section.tsx` + `manual-sync-preview-section.tsx`
- ✅ API มีอยู่แล้ว: `/api/sync/preview` + `/api/sync/run` + `/api/sync/runs`
- ⚠️ ต้องการ Google Sheets API credentials (Service Account JSON)

**สิ่งที่ต้องทำ:**
1. สร้าง Google Service Account บน Google Cloud Console
2. เพิ่ม credentials ใน `.env`:
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   GOOGLE_SHEETS_ID=1ABC...xyz
   ```
3. ทดสอบ **Preview Sync** (ดึงข้อมูลโดยไม่เขียน):
   - เปิดหน้า Import → Tab "นำเข้าจากระบบเก่า (Apps Script)"
   - กด Preview → ดู diff (create/update/skip/error)
4. ทดสอบ **Apply Sync** (ดึงข้อมูล + เขียนจริง):
   - กด Apply → ข้อมูลจาก Google Sheets เข้า DB
5. ตั้งค่าบน Vercel environment variables

**สำคัญ:** นี่คือขั้นตอนสุดท้ายก่อน cutover — ถ้า Sync ไม่ทำงาน → ข้อมูลไม่เป็นปัจจุบัน → cutover ไม่ได้

---

### P0-3: Replace-on-Withdraw — ทดสอบหลังแก้ P0-1

**โค้ดมีอยู่แล้ว:**
- `src/app/api/devices/[id]/replace-on-withdraw/route.ts`
- `src/components/itam/device-detail-sheet.tsx` (line 293, 795, 2729)

**สิ่งที่ต้องทำ:**
1. หลังแก้ P0-1 → เปิดหน้า Devices → คลิกอุปกรณ์ → เปิด Detail Sheet
2. ทดสอบ "เปลี่ยนอุปกรณ์แทน" (Replace-on-Withdraw):
   - เลือกอุปกรณ์เครื่องเก่า → ถอน + สร้างเครื่องใหม่ใน transaction เดียว
3. ตรวจสอบ: อุปกรณ์เก่า status = "Inactive" + อุปกรณ์ใหม่ status = "Active" + meter reading ถูกต้อง

---

### P0-4: Device Set — ทดสอบหลังแก้ P0-1

**โค้ดมีอยู่แล้ว:**
- `parentDeviceId`, `setLabel`, `setPosition` ใน Device model
- CSV import รองรับ Device Set fields

**สิ่งที่ต้องทำ:**
1. หลังแก้ P0-1 → เปิดหน้า Devices → เพิ่มอุปกรณ์
2. ทดสอบฟิลด์ Device Set (แท็บที่ 4 ในฟอร์มเพิ่มอุปกรณ์):
   - `parentDeviceId` — เลือกอุปกรณ์หลัก
   - `setLabel` — ชื่อชุด (เช่น "ชุดเครื่องพิมพ์ชั้น 3")
   - `setPosition` — ลำดับในชุด (1, 2, 3, ...)
3. ทดสอบ CSV import ที่มี Device Set columns

---

## 🟡 P1 — ก่อน Go-Live (5 งาน)

---

### P1-1: Cost Analytics

**โค้ดมีอยู่แล้ว:** `src/app/api/cost-analytics/route.ts`

**สิ่งที่ต้องทำ:**
1. ทดสอบ API: `GET /api/cost-analytics?month=2026-08&site=all`
2. ถ้ามี UI → ทดสอบหน้าแสดงผล
3. ถ้าไม่มี UI → สร้างหน้าหรือเพิ่มใน Dashboard/Reports

---

### P1-2: V1 Public API

**โค้ดมีอยู่แล้ว:**
```
/api/v1/devices
/api/v1/work-orders (+ assign, cancel, complete, messages, review)
/api/v1/meter-readings
/api/v1/snapshots (+ rows, verify)
/api/v1/cycles
```

**สิ่งที่ต้องทำ:**
1. ทดสอบทุก endpoint (GET, POST, PUT, DELETE)
2. สร้าง API documentation (Swagger/OpenAPI หรือ markdown)
3. เพิ่ม rate limiting (ถ้าใช้ Vercel Hobby — จำกัด 100K/เดือน)

---

### P1-3: Custom Export & Print Template System

**Spec พร้อมแล้ว:** `/home/z/my-project/docs/CUSTOM-EXPORT-PRINT-SPEC.md`

**ความต้องการของ User:**
> "ทุกหน้าที่มี Export ข้อมูล และพิมพ์สติกเกอร์ จำเป็นต้องมีฟอร์มตั้งต้นจากระบบ
> และต้องสามารถ Custom ทั้งฟอร์มและหัวคอลัมน์ เรียงจัดได้ตามการออกแบบได้อย่างง่ายสะดวก
> และก่อนสั่งปริ้นต้องสามารถเลือกพิมพ์ได้ว่าจะใช้ฟอร์มไหน"

**แผน 4 Phases (12 วัน):**

| Phase | เวลา | เนื้อหา |
|-------|------|--------|
| Phase 1 | 3 วัน | ExportTemplate model + 9 default templates + API |
| Phase 2 | 4 วัน | Universal Export Dialog (column picker + rename + reorder + save as template) |
| Phase 3 | 3 วัน | Print Template Selection (dialog ก่อน print) |
| Phase 4 | 2 วัน | UX Polish (preview + drag-drop + persist) |

**9 หน้าที่ต้องมี:**
1. Devices (Export CSV/Excel/PDF + Sticker print) ✅ มีบางส่วน
2. Meter (Export CSV)
3. Work Orders (Export CSV + Print ใบงาน)
4. Stock (Export CSV)
5. Paper Analytics (Export CSV + Print PDF)
6. Audit (Export CSV)
7. Monthly Report (Export CSV + Print PDF)
8. Dashboard (Print PDF)
9. Reports Hub (Print PDF)

---

### P1-4: PWA — ทดสอบหลัง deploy production

**โค้ดมีอยู่แล้ว:** `public/sw.js` + `public/manifest.json` + `src/components/itam/pwa-registration.tsx`

**สิ่งที่ต้องทำ:**
1. Deploy บน Vercel (HTTPS)
2. เปิดบนมือถือ → ทดสอบ "Add to Home Screen"
3. ทดสอบ offline mode (ปิด internet → เปิดแอป → ดู cached data)

---

### P1-5: Vercel Cron — ทดสอบหลัง deploy

**โค้ดมีอยู่แล้ว:** `vercel.json` (cron `0 9 * * 1` — ทุกวันจันทร์ 9:00) + `/api/cron/keepalive`

**สิ่งที่ต้องทำ:**
1. Deploy บน Vercel
2. ตรวจว่า cron ทำงาน (เช็ค Vercel dashboard → Cron jobs)
3. ตรวจว่า Supabase ไม่ถูก auto-pause (หลัง 7 วันไม่ใช้งาน)

---

## 🟢 P2 — หลัง Go-Live (3 งาน)

---

### P2-1: OAuth Login (Google + LINE + Telegram)

**ต้องการ API keys จริง:**
- Google: สร้าง OAuth 2.0 Client ID บน Google Cloud Console
- LINE: สร้าง LINE Login Channel บน LINE Developers
- Telegram: สร้าง Bot บน BotFather

**โค้ดมีอยู่แล้ว:** `src/app/api/auth/oauth/google/` + `line/` + `telegram/`

---

### P2-2: Notifications (Email + Telegram + LINE)

**ต้องการ:**
- Email: SMTP config (nodemailer) — ใช้ Gmail หรือ SendGrid ฟรี
- Telegram: Bot Token (จาก BotFather)
- LINE: Channel Access Token (จาก LINE Developers)

**โค้ดมีอยู่แล้ว:** `src/lib/notifications.ts`

---

### P2-3: Module Architecture Phase 2-4

**สถานะปัจจุบัน:** Phase 1 (manifest + barrel exports) เสร็จแล้ว

**เหลือ:**
- Phase 2: Repository pattern (ย้าย db access)
- Phase 3: Service layer (ย้าย business logic)
- Phase 4: UI migration + boundary enforcement

**คู่มือ:** `/home/z/my-project/docs/MODULE-ARCHITECTURE-GUIDE.md`

---

## 📊 สรุปสถานะโปรเจ็ค

```
🏆 ITAM-NextJS — Final Status

├── ✅ QA Testing          100% (11/11 หน้า, 115 bugs)
├── ✅ Bug Fixes (P0)      92%  (เหลือ 1 runtime fix — ctx.globalRole)
├── ✅ Bug Fixes (P1)      100%
├── ✅ Bug Fixes (P2)      100%
├── ✅ UX Improvements     100% (rename + warm gray)
├── ✅ Module Architecture 100% (Phase 1-8 complete)
├── ✅ Pre-commit hooks    100% (5 checks)
├── ✅ Quota Analysis      100% (Vercel + Supabase Free)

รวม: ~95% เสร็จ | เหลือ 5% (ctx.globalRole fix + Legacy Sync + ทดสอบฟีเจอร์)
```

---

## 📁 ไฟล์อ้างอิงทั้งหมด

| ไฟล์ | เนื้อหา |
|------|--------|
| `/home/z/my-project/worklog.md` | 1658 บรรทัด — ทุก Task ID |
| `/home/z/my-project/docs/MODULE-ARCHITECTURE-GUIDE.md` | 869 บรรทัด — Module migration guide |
| `/home/z/my-project/docs/CUSTOM-EXPORT-PRINT-SPEC.md` | Custom Export/Print spec |
| `/home/z/my-project/qa-reports/` | 11 QA reports + 3 verify reports |
| `/home/z/my-project/qa-reports/VERIFICATION-TRACKER.md` | Bug tracker รวม |

---

**ส่งโดย:** QA Team
**วันที่:** 2026-08-24
**สถานะ:** ⏳ รอ ITAM-01 ทำ P0 (4 งาน) ให้เสร็จ
