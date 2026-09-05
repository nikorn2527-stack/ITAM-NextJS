# Handover Document — Public QR Repair System

> สำหรับทีมที่จะรับงานต่อ
> วันที่: 5 กันยายน 2026
> Commit ล่าสุด: `7d1cd0f` (security: P0-2 harden — reject legacy sessions)
> Production: https://itam-next-js.vercel.app/

---

## 📋 สถานะปัจจุบัน

### ✅ ทำเสร็จแล้ว (พร้อมใช้งาน)

1. **Schema foundation**
   - `PublicReporter` model (3-tier identity: LINE Tier 1/2, anonymous Tier 3)
   - `Device.replacedById` (self-FK for device replacement)
   - `WorkOrder.publicReporterId` (FK)
   - `LicenseRecord.deviceId` (real FK; `Asset_No` kept for legacy sync) + `isActive`
   - `SiteAttribute`: `LiffId`, `LiffAutoFriendLine`, `PublicRepairDailyLimit`, `PublicRepairIpDailyLimit`

2. **Public APIs** (no auth required)
   - `GET /api/public/devices/[shortId]` — sanitized device info
   - `POST /api/public/repairs` — submit repair request with anti-spam (rate-limit per phone/IP, blacklist)

3. **LINE Login v2.1 Web flow**
   - `/api/auth/line/login` — initiate OAuth (state cookie + redirect)
   - `/api/auth/line/callback` — exchange code → set `line_session` cookie (24h)
   - `/api/auth/line/logout` — clear session
   - `/api/auth/line/me` — return current LINE session info
   - `/login/line` — public LINE login page (with Suspense for static gen)

4. **Public UI components**
   - `src/components/public/public-device-card.tsx` — sanitized device card with 3 action buttons
   - `src/components/public/public-repair-form.tsx` — multi-tier form (LINE / anonymous)
   - `src/components/public/public-repair-success.tsx` — success screen
   - `src/hooks/use-line-session.ts` — client hook for LINE session
   - `src/components/itam/problem-category-selector.tsx` — extracted reusable component

5. **DeviceAccessory features**
   - Device Set children section + parent banner (`device-set-children-section.tsx`)
   - Accessory sticker print button (uses existing StickerPrintDialog with `qrContentFor`)
   - Replace device dialog + API endpoint (`/api/devices/[id]/replace`) with transaction + demo guard

6. **LicenseRecord FK migration + imports/exports**
   - `scripts/migrate-license-device-id.ts` — backfill `deviceId` from `Asset_No`
   - `/api/devices/accessories/{import,export}` — CSV
   - `/api/licenses/{import,export}` — CSV

7. **Smart QR router public mode** (`/qr/[type]/[id]/page.tsx`)
   - If staff token → resolve + route to staff page (existing behavior)
   - If no token → render PublicDeviceCard (was: blocked "กรุณาเข้าสู่ระบบ")
   - State machine: card → form-line | form-anonymous → success
   - LINE callback auto-resume via sessionStorage

8. **Sticker template update**
   - Simplified "hotline + LINE" text → "สแกน QR เพื่อแจ้งซ่อม · โทร {{hotline}}"
   - (LINE Login handles auto-friend, no need to print @lineOA on sticker)

9. **Demo cross-contamination guards**
   - Device Set parentDeviceId move: parent/child must have same `isDemo`
   - Device replace endpoint: old/new must have same `isDemo` (`DEMO_MISMATCH`)
   - Accessory/License imports: `isDemo` inherited from parent device

10. **Vercel build automation**
    - `vercel.json` buildCommand: `npx prisma generate && npx prisma db push --accept-data-loss && next build --webpack`
    - `package.json` postinstall: `prisma generate`
    - Schema auto-syncs to production DB on every deploy

---

## ⚠️ ช่องว่างสำคัญ — ต้องทำต่อ

### Gap 1: PublicReporter.lineUserId ไม่ได้ copy ไป WorkOrder.lineUserId

**ปัญหา:**
- เมื่อช่างปิดงาน → `notifyWorkOrderCompleted` ใช้ `wo.lineUserId` เพื่อ push ข้อความกลับไป LINE OA
- แต่ WO ที่สร้างจาก `/api/public/repairs` ไม่ได้ copy `lineUserId` จาก PublicReporter มาใส่
- ผล: ผู้ใช้ QR จะไม่ได้รับ notification ว่างานเสร็จแล้ว

**วิธีแก้:**
ใน `/api/public/repairs/route.ts` ตอนสร้าง WorkOrder:
```ts
// เพิ่มบรรทัดนี้
lineUserId: reporter.lineUserId,  // copy จาก PublicReporter ไป WorkOrder
```

**ไฟล์:** `src/app/api/public/repairs/route.ts` (ค้นหา `WorkOrder.create` หรือ `db.workOrder.create`)

---

### Gap 2: ผู้ใช้ต้องเพิ่ม LINE OA เป็นเพื่อนก่อน ถึงจะรับ push ได้

**ปัญหา:**
- LINE Push API ส่งได้ก็ต่อเมื่อ user **เพิ่ม OA เป็นเพื่อนแล้ว**
- ถ้ายังไม่เพิ่ม → push fail (401) — ระบบ silent swallow error
- ผู้ใช้ QR ใหม่อาจยังไม่ได้เพิ่ม OA → ไม่ได้รับ notification

**วิธีแก้ (เลือก 1 ทาง):**

**ทาง A — LINE Login + bot_prompt=aggressive**
- ใน `/api/auth/line/login` ตอนสร้าง authorize URL:
  ```ts
  // เพิ่ม parameter bot_prompt=aggressive
  const url = `${authorizeUrl}?response_type=code&client_id=${channelId}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}&bot_prompt=aggressive`
  ```
- LINE จะเด้งหน้า "เพิ่มเพื่อน OA" หลัง login (ถ้ายังไม่ได้เพิ่ม)
- ต้องตั้งค่าใน LINE Console ให้ LINE Login Channel เชื่อมกับ LINE OA เดิม

**ทาง B — LIFF (แนะนำ)**
- สร้าง LIFF app ใน LINE Developers Console ของ OA เดิม
- LIFF URL = `https://itam-next-js.vercel.app/qr/scan` (หน้าใหม่)
- ใน LIFF จะ detect LINE userId อัตโนมัติ (ไม่ต้อง login ซ้ำ)
- ใช้ `liff.getFriendship()` เช็คว่าเพิ่ม OA หรือยัง — ถ้ายัง → แสดงปุ่ม "เพิ่มเพื่อน"
- เมื่อเพิ่มแล้ว → เปิดฟอร์มแจ้งซ่อม

---

### Gap 3: PENDING_REVIEW status ไม่อยู่ใน allowlist

**ปัญหา:**
- `/api/public/repairs` สร้าง WO ด้วย `status = 'PENDING_REVIEW'` สำหรับ Tier 2/3
- แต่ `VALID_STATUSES` ใน `/api/work-orders/route.ts` ไม่มี `PENDING_REVIEW`
- ผล: staff filter WO list โดย `PENDING_REVIEW` จะไม่เจอ + KPI strip นับไม่ครบ

**วิธีแก้:**
ใน `src/app/api/work-orders/route.ts`:
```ts
const VALID_STATUSES = [
  'PENDING',
  'PENDING_REVIEW',  // เพิ่มบรรทัดนี้
  'IN_PROGRESS',
  'WAITING_PARTS',
  'COMPLETED',
  'CANCELLED',
] as const
```

**ไฟล์:** `src/app/api/work-orders/route.ts` (ค้นหา `VALID_STATUSES`)

---

### Gap 4: phone scope ไม่ได้ขอ — Tier 1 ไม่ทำงาน

**ปัญหา:**
- `src/lib/line-login.ts` ตั้ง `scope = 'profile openid'`
- ไม่มี `phone` scope → ทุกคนที่ login ผ่าน LINE จะกลายเป็น Tier 2 (มี LINE userId แต่ไม่มีเบอร์)
- ทำให้ต้องกรอกเบอร์มือถือทุกครั้ง แม้ login ด้วย LINE แล้ว

**วิธีแก้:**
1. ใน LINE Developers Console → Channel → Permissions → ขอ "Phone number" scope
   - ต้องรอ LINE review 3-5 วันทำการ
2. หลัง approve → แก้ `src/lib/line-login.ts`:
   ```ts
   scope: 'profile openid phone',
   ```
3. หลังแก้ → Tier 1 จะทำงาน: user ไม่ต้องกรอกเบอร์ (ระบบเห็นจาก LINE phone scope)

---

### Gap 5: Auto-fill ข้อมูลเดิม — ✅ ทำแล้ว

**สถานะ:** เสร็จแล้ว (commit เดิม)

- `/api/public/reporter/me?siteCode=xxx` endpoint มีอยู่แล้ว (ทำใน Phase 2-c)
- `public-repair-form.tsx` มี auto-fill logic อยู่แล้ว (บรรทัด 190-229)
- เมื่อ user login LINE แล้ว → ระบบ fetch `/api/public/reporter/me` → auto-fill ชื่อ+เบอร์+อีเมล
- user เห็นข้อมูลตัวเองอยู่แล้ว แค่เลือกปัญหา + ส่ง

---

## 📚 เอกสารอ้างอิง

1. **SYSTEM-ARCHITECTURE.md** — แผนภาพระบบทั้งหมด (สร้างโดย research subagent)
2. **worklog.md** — ประวัติการทำงานทั้งหมด (ดู sections ล่าสุด: PUBLIC-QR-*)
3. **prisma/schema.prisma** — 42 models (รวม PublicReporter ใหม่)
4. **vercel.json** — build config + crons

---

## 🔑 Environment Variables (Vercel)

| Variable | Purpose | Set? |
|---|---|---|
| `LINE_LOGIN_CHANNEL_ID` | LINE Login Channel (verify identity) | ✅ `2011459838` |
| `LINE_LOGIN_CHANNEL_SECRET` | LINE Login Channel secret | ✅ |
| `JWT_SECRET` | Sign JWT tokens for staff auth | ✅ |
| `DATABASE_URL` | Supabase Postgres pooler URL | ✅ |
| `NEXTAUTH_URL` | App base URL | ✅ |
| `NEXTAUTH_SECRET` | Legacy NextAuth secret | ✅ |
| `R2_*` | Cloudflare R2 (photo storage) | ✅ |
| `SUPABASE_*` | Supabase client keys | ✅ |

---

## 🧪 วิธีทดสอบ

### Test 1: Public Device Card
เปิดใน incognito/private window:
```
https://itam-next-js.vercel.app/qr/d/eg52u316?action=repair
```
ควรเห็น Public Device Card ของ ZEBRA DS2208 + 3 ปุ่ม

### Test 2: LINE Login Flow
1. กดปุ่ม "แจ้งซ่อมด้วย LINE"
2. redirect ไป access.line.me
3. ใส่ LINE account → approve
4. กลับมาที่ฟอร์มแจ้งซ่อม (Tier 2 — ต้องกรอกเบอร์)

### Test 3: Anonymous Flow
1. กดปุ่ม "แจ้งซ่อมด้วยเบอร์มือถือ"
2. กรอกชื่อ + เบอร์ + ปัญหา
3. ส่ง → ได้ WO number + tracking URL

### Test 4: Replace Device
1. เปิด device detail → กด "เปลี่ยนเครื่องหลัก"
2. เลือกเครื่องใหม่ + เลือก items ที่จะย้าย
3. กรอกเหตุผล (min 5 ตัวอักษร)
4. ยืนยัน → เครื่องเดิม status=Replaced + items ย้าย

---

## 🚀 สิ่งที่ควรทำต่อ (priority order)

### ✅ ทำเสร็จแล้วทั้งหมด (commits `d411de6` + `53c62d9` + `60b7887` + `7d1cd0f`)

#### LINE integration (เรื่องที่ 1)
- ✅ **Gap 1** — เชื่อม `PublicReporter.lineUserId` → `WorkOrder.lineUserId`
- ✅ **Gap 2 (บางส่วน)** — `bot_prompt=aggressive` ใน LINE Login URL
- ✅ **Gap 3** — `PENDING_REVIEW` ใน `VALID_STATUSES` + `VALID_SOURCES` เพิ่ม `line_liff`, `public_qr`, `line`
- ✅ **Gap 5** — Auto-fill ข้อมูลเดิม (มีอยู่แล้วใน code)

#### อุปกรณ์ต่อพ่วง (เรื่องที่ 2 — ทำตั้งแต่ commit `16d7959`)
- ✅ DeviceAccessory model + CRUD APIs
- ✅ Import/Export CSV
- ✅ Sticker button (ใช้ StickerPrintDialog + qrContentFor)
- ✅ Device Set children section + parent banner
- ✅ Replace device dialog + API (transaction + demo guard)

#### Security P0 fixes (ตาม audit report)
- ✅ **P0-1 (code)** — ลบ `google-service-account.json` จาก Git + เพิ่ม `.gitignore` + อ่านจาก env var `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- ✅ **P0-1 (user action)** — Revoke key เดิม + สร้าง key ใหม่ + ตั้ง env var ใน Vercel ✅
- ✅ **P0-2** — Migrate legacy Base64 session → signed JWT (HS256 via jose) + reject legacy in production
- ✅ **P0-3a** — ปิด `/api/seed` ใน production
- ✅ **P0-3b** — เพิ่ม `ADMIN` auth ให้ `/api/notifications/send`
- ✅ **P0-3c** — เพิ่ม `VIEW_AUDIT` auth ให้ `/api/audit`

### ⏳ ยังเหลือ (P1-P2 — ไม่ critical)

1. **Gap 2 ทาง B** — LIFF integration (4-8 ชั่วโมง)
   - ต้องสร้าง LIFF app ใน LINE Developers Console
   - ตั้งค่า LIFF URL → เปิดใน LINE app โดยตรง (ไม่ต้อง login ซ้ำ)

2. **Gap 4** — ขอ phone scope จาก LINE (รอ review 3-5 วัน)
   - ใน LINE Console → Channel → Permissions → ขอ "Phone number" scope

3. **P1** — เปิด TypeScript และ lint gate ใน build (ปิด `ignoreBuildErrors`)
   - ต้องแก้ type errors ที่ค้างอยู่ก่อน

4. **P1** — แก้ dependency installation (`npm ci` ไม่ผ่านเพราะ peer dep conflict)

5. **P1** — แยก TypeScript scope (ตอนนี้รวมไฟล์ scripts/tests ทั้งหมด)

6. **P1** — แก้ snapshot feature ที่อ้าง model ซึ่งถูกลบ (`meterReportSnapshot`)

7. **P2** — ลดขนาด component และ route (work-orders-page.tsx 214KB, devices-page.tsx 175KB, etc.)

8. **P2** — เปิด ESLint rules ที่ถูกปิดกลับทีละชุด

9. **P2** — ทำ structured logging (แทน console.log กระจัดกระจาย)

10. **P2** — ทำความสะอาด repository (backup files, *.tsbuildinfo, PR metadata)

---

## 📞 ข้อมูลติดต่อ/อ้างอิง

- Production URL: https://itam-next-js.vercel.app/
- GitHub: https://github.com/nikorn2527-stack/ITAM-NextJS
- LINE Login Channel ID: `2011459838`
- Supabase project: `[REDACTED]`
- Vercel project ID: `prj_PO95TuF9YxGBliPOlaSgEsKfAV7r`

---

## 📝 หมายเหตุ

- แอปช่าง = mobile view ของแอปเดียวกัน (auto-detect ด้วย `useMobileDetect()`)
- LINE OA เดิมยังใช้งานอยู่ (รับแจ้งซ่อมผ่าน webhook) — ไม่ต้องยุ่ง
- Public QR Repair เป็นช่องทางเสริม ไม่ใช่ทดแทน
- Cron job ทุก 15 นาที (`webDevReview`) จะตรวจสอบและทำงานต่ออัตโนมัติ
