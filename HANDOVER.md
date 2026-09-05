# Handover Document — Public QR Repair System

> สำหรับทีมที่จะรับงานต่อ
> วันที่: 5 กันยายน 2026
> Commit ล่าสุด: `ca883cf`
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

### Gap 5: Auto-fill ข้อมูลเดิม — ยังไม่ได้ทำ

**ปัญหา:**
- คนที่เคยแจ้งซ่อมแล้ว (มี PublicReporter record) → ครั้งต่อไปยังต้องกรอกชื่อ+เบอร์+อีเมลใหม่
- น่าจะ auto-fill ข้อมูลเดิมให้

**วิธีแก้:**
1. สร้าง endpoint `/api/public/reporter/me?lineUserId=xxx`
   - ค้น PublicReporter โดย `lineUserId`
   - Return `{ name, phone, email, reportCount, lastReportAt }` หรือ 404
2. แก้ `public-repair-form.tsx`:
   - ใน `useEffect` ตอนมี `lineSession?.userId` → fetch `/api/public/reporter/me`
   - ถ้าเจอ → `setName(data.name)`, `setPhone(data.phone)`, `setEmail(data.email)`
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

1. **Gap 1** — เชื่อม `PublicReporter.lineUserId` → `WorkOrder.lineUserId` (10 นาที)
2. **Gap 3** — เพิ่ม `PENDING_REVIEW` ใน `VALID_STATUSES` (5 นาที)
3. **Gap 5** — Auto-fill ข้อมูลเดิม (1-2 ชั่วโมง)
4. **Gap 2 ทาง A** — เพิ่ม `bot_prompt=aggressive` (15 นาที — ต้องตั้งใน LINE Console ด้วย)
5. **Gap 2 ทาง B** — LIFF integration (4-8 ชั่วโมง — ต้องสร้าง LIFF app ใน LINE Console)
6. **Gap 4** — ขอ phone scope จาก LINE (รอ review 3-5 วัน)

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
