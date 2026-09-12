# Handover Document — ITAM-NextJS Stability Review

> **สำหรับทีมที่จะรับงานต่อ / ตรวจสอบความเสถียร**
> วันที่อัปเดต: 12 กันยายน 2026
> Commit ล่าสุด: `fba2d05`
> Repo: https://github.com/nikorn2527-stack/ITAM-NextJS

---

## 📋 ภาพรวมสถานะปัจจุบัน

แอป **รันได้และใช้งานได้จริง** บนเครื่อง Windows (clone + `.\setup.ps1` + `bun run dev`) และบน sandbox preview
Login: **admin / test1234**

### ข้อมูลที่มีในระบบ (จริง)
- 2,406 devices
- 4,950 work orders
- 60 stock items + 7,520 stock transactions
- 15,486 meter readings
- 426 MasterItem (28 categories)
- 15 users

---

## ✅ สิ่งที่ทำเสร็จและทำงานได้ (12 commits ล่าสุด)

| Commit | อธิบาย | สถานะ |
|--------|--------|-------|
| `60571b0` | แก้ OOM — lazy PrismaClient Proxy + เพิ่ม missing imports (requireAuth, db) ใน 10 routes | ✅ Verified |
| `6073edf` | สร้าง setup.ps1 (Windows) + setup.sh (Linux/Mac) + auto-sync Prisma provider | ✅ Verified |
| `3849e3a` | แก้ setup.ps1 encoding (UTF-8 BOM สำหรับ PowerShell 5.x) | ✅ Verified |
| `3208076` | แก้ db:seed failures — เพิ่ม VIEW_REPORTS/MANAGE_REPORTS + minimal MasterItem fallback + admin user | ✅ Verified |
| `6f4427c` | แก้ SQLite compatibility — strip `mode: insensitive` ผ่าน $extends interceptor | ✅ Verified |
| `19ef5cb` | แก้ layout.tsx raw `<script>` → `next/script` (หาย error overlay) | ✅ Verified |
| `3df5bd5` | แก้ Settings page crash — เพิ่ม BarChart3 import + ActivePage types | ✅ Verified |
| `161f6c9` | แก้ Work Orders page crash — เพิ่ม `const t = useT()` + skip strip สำหรับ raw query | ✅ Verified |

### หน้าที่ทดสอบผ่าน agent-browser แล้วทำงานได้
- ✅ Login (admin/test1234)
- ✅ Dashboard (KPI + charts + realtime SSE)
- ✅ Devices (list + search + filter)
- ✅ Work Orders (list + 412 items + filters)
- ✅ Settings (ทุก tab: Master Data, Sites, Users, Notifications, Custom Fields, Setup Wizard, ฯลฯ)
- ✅ Language switcher (TH/EN สลับได้ทุกหน้า ผ่าน Zustand persist store)

---

## ⚠️ ความเสถียร — ปัญหาที่ทีมต้องเช็คต่อ

### 🔴 Priority 1 — ความเสี่ยงสูง (อาจทำให้หน้าพังได้)

#### 1.1 "t is not defined" pattern bug (43 components ที่ต้องตรวจ)
สแกนพบว่ามี 43 functions ใน 10+ ไฟล์ที่ใช้ `t()` (i18n translate) โดยไม่ได้ประกาศ `const t = useT()` ใน scope นั้น

**ความเสี่ยง**: เหมือนกับ bug ที่ทำให้ Work Orders page crash — เมื่อ user ทำ action บางอย่าง (เช่น กดปุ่ม export, delete, save) แล้วจะ ReferenceError

**ไฟล์ที่ต้องตรวจ** (เรียงตามความเสี่ยง):
```
src/components/itam/devices-page.tsx          — 11 functions (applyBulkDelete, save, printSingleSticker, ฯลฯ)
src/components/itam/reports-section.tsx        — 6 functions (ReportDataView มี 23 t() calls!)
src/components/itam/custom-report-builder.tsx  — 6 functions
src/components/itam/templates-page.tsx         — 4 functions (WorkOrderTab, DocumentTab, StickerTab)
src/components/itam/itam-login.tsx             — 4 functions (submit)
src/components/itam/itam-dashboard.tsx         — 3 functions (exportPdf, drillDown)
src/components/itam/google-sheets-section.tsx   — 4 functions
src/components/itam/monthly-report.tsx          — 1 function (handleExportCSV — 17 t() calls)
src/components/itam/itam-settings.tsx          — 3 functions
src/components/itam/work-orders-page.tsx        — 1 function (handleComplete — อาจจะเหลือ)
```

**วิธีเช็ค**: ดูว่า function นั้นเป็น
- **Module-level function** (ประกาศนอก component) → **ต้องแก้** เพิ่ม `const t = useT()` หรือส่ง `t` เป็น parameter
- **Closure ใน component** (ประกาศใน component ที่มี `const t = useT()` แล้ว) → **ไม่ต้องแก้** (false positive)

**วิธีแก้** (ตัวอย่าง):
```tsx
// ก่อน (bug):
function CreateWorkOrderDialog({...}) {
  const fileInputRef = React.useRef(null)
  return <button aria-label={t('settings.close')}>...</button>  // ← t ไม่ได้ประกาศ
}

// หลัง (แก้แล้ว):
function CreateWorkOrderDialog({...}) {
  const t = useT()  // ← เพิ่มบรรทัดนี้
  const fileInputRef = React.useRef(null)
  return <button aria-label={t('settings.close')}>...</button>
}
```

#### 1.2 TypeScript ignoreBuildErrors = true (754 errors)
`next.config.ts` ตั้ง `typescript.ignoreBuildErrors: true` เพราะมี TS errors เดิม 754 ตัว
**ความเสี่ยง**: บั๊กประเภท "t is not defined" ไม่ถูกจับตอน build — จะเจอตอน runtime เท่านั้น

**วิธีแก้ (ระยะยาว)**:
```bash
# รัน TS check แบบเต็ม
NODE_OPTIONS='--max-old-space-size=3072' npx tsc --noEmit
# แก้ errors ทีละไฟล์ จนกว่าจะ 0
# แล้วเปลี่ยน next.config.ts เป็น ignoreBuildErrors: false
```

#### 1.3 Memory pressure ใน 4GB sandbox
Build (`next build --webpack`) บางครั้ง OOM-killed ใน sandbox 4GB

**วิธีแก้**:
- ใช้ `NODE_OPTIONS='--max-old-space-size=2048'` ตอน build
- ใช้ `--max-old-space-size=3072` ตอน start server
- Production deploy ไป Vercel (มี memory มากกว่า)

---

### 🟡 Priority 2 — ความเสี่ยงปานกลาง

#### 2.1 Language switcher บนเครื่อง user บางครั้งไม่ติด
ใน sandbox ทำงานได้ปกติ แต่ user รายงานว่าบางครั้งสลับไม่ติด

**สาเหตุที่เป็นไปได้**:
- Browser cache / service worker เก่า (แนะนำให้ hard refresh Ctrl+Shift+R)
- Turbopack dev mode HMR issue กับ Zustand persist
- localStorage hydration delay

**วิธีเช็ค**:
```powershell
# รัน production build แทน dev (เหมือน sandbox)
bun run next build --webpack
bun run next start
```

#### 2.2 Missing lucide icon imports (อาจจะมีอีก)
เราแก้ BarChart3 ใน itam-settings.tsx แล้ว แต่อาจจะมี icon อื่นที่หายไปใน components อื่น

**วิธีเช็ค**: รันสแกน (script อยู่ใน worklog Task ID: WORK-ORDERS-PAGE-CRASH-FIX) หรือเปิดทุกหน้าใน browser แล้วดู console errors

#### 2.3 Stale Prisma model references
เราแก้ `prisma.deviceType` / `prisma.brand` / `prisma.model` ใน seed scripts แล้ว แต่อาจจะมีใน route handlers อื่นอีก

**วิธีเช็ค**:
```bash
rg "\bdb\.(deviceType|brand|model|snapshot)\b|\bprisma\.(deviceType|brand|model|snapshot)\b" src/app/api/
```

---

### 🟢 Priority 3 — การปรับปรุง (nice-to-have)

#### 3.1 ไม่มี automated tests
มี `vitest.config.ts` และ `tests/` folder แต่ยังไม่ครอบคลุม golden paths

**แนะนำ**: สร้าง Playwright e2e tests สำหรับ:
- Login flow
- Dashboard render
- Devices CRUD
- Work Orders CRUD
- Settings render

#### 3.2 Database: SQLite (dev) vs PostgreSQL (prod)
ตอนนี้ dev ใช้ SQLite, prod ใช้ PostgreSQL (Supabase)
`scripts/set-prisma-provider.mjs` auto-sync provider ให้แล้ว แต่ต้องระวัง:
- SQLite ไม่รองรับ `mode: insensitive` (เราแก้ด้วย interceptor แล้ว)
- SQLite ไม่รองรับ `Prisma.join` บางรูปแบบ
- Raw SQL ใน dashboard route ใช้ syntax ที่รองรับทั้งสอง DB แล้ว

---

## 🧪 วิธีเทสความเสถียร (แนะนำให้ทีมทำ)

### Step 1: Setup บนเครื่อง Windows
```powershell
git clone https://github.com/nikorn2527-stack/ITAM-NextJS.git
cd ITAM-NextJS
.\setup.ps1
bun run db:seed
bun run dev
```

### Step 2: Manual testing ทุกหน้า
เปิด `http://localhost:3000` → login admin/test1234 → คลิกผ่านทุกเมนู:

| เมนู | สิ่งที่ต้องเช็ค |
|------|---------------|
| แดชบอร์ด | KPI แสดง, charts render, realtime badge (เขียว) |
| จัดการอุปกรณ์ | list โหลด, search ทำงาน, filter ทำงาน, คลิกดู detail |
| จดมิเตอร์ | cycle แสดง, keyboard input ทำงาน |
| แจ้งซ่อม | list โหลด (412 items), filter status/priority, สร้าง WO ใหม่ |
| ตาราง PM | schedule list แสดง |
| สต๊อก | stock items แสดง, stock-in/out form |
| วิเคราะห์กระดาษ | charts render |
| เทมเพลต | template list, editor |
| นำเข้าข้อมูล | CSV upload form |
| ศูนย์รายงาน | report list render |
| ตั้งค่าระบบ | ทุก tab render (Master Data, Sites, Users, ฯลฯ) |
| ประวัติการใช้งาน | audit log แสดง |

### Step 3: ทดสอบ action ที่ใช้ `t()`
ทดสอบ actions เหล่านี้เพราะเป็นจุดที่ "t is not defined" bug จะเกิด:
- สร้าง device ใหม่ + บันทึก
- ลบ device (bulk delete)
- Export CSV
- Print sticker
- สร้าง work order ใหม่
- ปิด work order (complete)
- สร้าง report
- Export report CSV
- สร้าง template
- Save settings

### Step 4: ทดสอบ language switcher
- คลิกปุ่ม TH/EN ใน sidebar ทุกหน้า
- ตรวจว่า nav text เปลี่ยนภาษา
- ตรวจ localStorage `itam-lang` เปลี่ยนค่า

### Step 5: ตรวจ console errors
- เปิด DevTools (F12) → Console
- คลิกผ่านทุกหน้า ดูว่ามี error ไหม
- ถ้าเจอ `ReferenceError: t is not defined` → ดู Priority 1.1 ด้านบน

---

## 📁 ไฟล์สำคัญที่ทีมต้องดู

### โค้ดหลัก
```
src/lib/db.ts                          ← lazy PrismaClient + SQLite interceptor (แก้ OOM + insensitive)
src/lib/auth-shared.ts                 ← ROLE_PERMISSIONS + PERMISSION_GROUPS (เพิ่ม VIEW_REPORTS/MANAGE_REPORTS แล้ว)
src/lib/i18n.ts                        ← GLOSSARY (1433 lines, TH/EN)
src/store/i18n-store.ts                ← Zustand persist store (lang switcher)
src/store/app-store.ts                 ← ActivePage type (เพิ่ม pm-schedules, material-cost แล้ว)
src/app/layout.tsx                     ← next/script (แก้ error overlay แล้ว)
src/app/home-client.tsx                ← KeepAlivePage pattern (เก็บ state ทุกหน้า)
src/components/itam/sidebar.tsx         ← nav config + lang/theme switcher
```

### Setup & Deployment
```
setup.ps1                              ← Windows PowerShell setup (one-step)
setup.sh                               ← Linux/Mac bash setup
scripts/set-prisma-provider.mjs        ← auto-sync provider กับ DATABASE_URL
.env.example                           ← template (Mode A SQLite / Mode B PostgreSQL)
README.md                              ← คำแนะนำ Windows + วิธีติดตั้ง
```

### Seed scripts
```
scripts/seed-all.ts                    ← master seed (9 modules, profile: demo/production)
scripts/seed-authorization-catalog.ts  ← Role/Permission/RolePermission (30 perms, 5 roles, 88 mappings)
scripts/seed-master-catalog-v2.ts      ← MasterItem 28 categories (64+ items)
scripts/create-demo-users.js           ← admin/test1234 + demo_admin/demo123 + 2 อื่น
```

### Documentation
```
worklog.md                             ← ประวัติการแก้ไขทั้งหมด (21600+ lines, ดู 300 บรรทัดสุดท้าย)
HANDOVER.md                            ← เอกสารนี้
SYSTEM-ARCHITECTURE.md                 ← สถาปัตยกรรมระบบ
```

---

## 🎯 ลำดับความสำคัญในการแก้ไข (แนะนำ)

### สัปดาห์ที่ 1 — ความเสถียรหลัก
1. **แก้ "t is not defined" bug** ใน 43 components (Priority 1.1) — ทำให้ทุก action ทำงานได้
2. **ทดสอบ action ทั้งหมด** ตาม Step 3 ด้านบน
3. **แก้ TS errors** ทีละไฟล์ จนกว่าจะเหลือ < 100 ตัว แล้วเปิด `ignoreBuildErrors: false`

### สัปดาห์ที่ 2 — ความครบถ้วน
4. **ทดสอบทุกหน้า** ตาม Step 2 ด้านบน จนครบทุกเมนู
5. **แก้ missing icon imports** ถ้าเจอเพิ่ม
6. **เขียน Playwright e2e tests** สำหรับ golden paths

### สัปดาห์ที่ 3 — Production readiness
7. **Deploy ไป Vercel** (มี memory มากกว่า sandbox)
8. **ทดสอบบน PostgreSQL** (เปลี่ยน DATABASE_URL + รัน migration)
9. **ตั้ง cron backup** ฐานข้อมูล

---

## 📞 ข้อมูลติดต่อ / อ้างอิง

- **Repo**: https://github.com/nikorn2527-stack/ITAM-NextJS
- **Login**: admin / test1234
- **Commit ล่าสุด**: `fba2d05`
- **Worklog**: `/home/z/my-project/worklog.md` (ดู 300 บรรทัดสุดท้ายสำหรับ context ล่าสุด)

### ประวัติการแก้ไขล่าสุด (12 commits)
ดูใน `worklog.md` — แต่ละ Task ID มีรายละเอียด root cause + fix + verification
