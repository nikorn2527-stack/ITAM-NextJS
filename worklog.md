# ITAM-NextJS — Sandbox Handover Worklog

> ไฟล์นี้ใช้สำหรับติดตามสถานะการย้ายและพัฒนาโปรเจ็ค ITAM-NextJS ใน sandbox นี้
> โปรเจ็คต้นฉบับ: https://github.com/nikorn2527-stack/ITAM-NextJS (private repo)

---

## Task ID: MIGRATE-001
Agent: orchestrator (main)
Task: ย้ายโปรเจ็ค ITAM-NextJS จาก GitHub repo มารันใน sandbox Next.js 16 SQLite

Work Log:
- โคลน repo `nikorn2527-stack/ITAM-NextJS` ผ่าน GitHub API tarball (PAT token)
- ลบ sandbox template เดิม (src/prisma/public/tests/docs/scripts/...)
- rsync โค้ด ITAM-NextJS ทั้งหมดมาที่ root `/home/z/my-project/`
- แปลง `prisma/schema.prisma` `provider: postgresql → sqlite` (32 models, 905 lines)
- ลบ `prisma/migrations/` (PG-specific SQL) — ใช้ `db:push` แทน
- ตั้ง `.env`: `DATABASE_URL=file:/home/z/my-project/db/custom.db` (sandbox shell env บังคับ path นี้)
- สร้าง `JWT_SECRET`, `CRON_SECRET`, `NEXTAUTH_SECRET` สำหรับ sandbox
- `bun install` → 934 packages
- `bun run db:push` → สร้าง schema ลง SQLite ครบ 32 models
- รัน `node scripts/create-demo-users.js` → สร้าง 3 demo users:
  - `demo_admin / demo123` (role=admin, isDemo=true)
  - `demo_staff / demo123` (role=editor, isDemo=true)
  - `demo_viewer / demo123` (role=viewer, isDemo=true)
- รัน `bun scripts/seed-authorization-catalog.ts` → 5 roles + 28 permissions + 79 role-permissions
- เพิ่ม `allowedDevOrigins` ใน `next.config.ts` (preview host)
- `bun run dev` → server ready บน port 3000

Bugs พบและแก้:
- **Bug #1**: `/api/sites`, `/api/master`, `/api/meter`, `/api/cycles`, `/api/reports`, `/api/notifications`, `/api/audit`, `/api/settings` (org-profile OK แต่ตัวอื่นไม่ OK), `/api/users`, `/api/templates`, `/api/import`, `/api/search`, `/api/site-rates`, `/api/cost-analytics`, `/api/seed`, `/api/site-attributes`, `/api/health/authz`, `/api/auth/me`, `/api/auth/logout`, `/api/auth/verify-token` คืน 401 — fetch interceptor ใน `src/app/page.tsx` ไม่ครอบคลุม path เหล่านี้
  - **แก้**: ขยาย patch list ใน `page.tsx` ให้ครอบคลุมทุก ITAM API endpoint (ยกเว้น login/register/forgot/reset)
- **Bug #2**: `/api/itam/sites` คืน 500 — `orderBy: { siteCode: 'asc' }` (lowercase) แต่ SiteAttribute model field คือ `SiteCode` (capital) → กรณีนี้น่าจะพังใน production ด้วยแต่ไม่มีใครสังเกตเห็นเพราะ endpoint นี้ไม่ค่อยถูกเรียก
  - **แก้**: เปลี่ยน `siteCode → SiteCode`, `siteName → SiteName` ใน `src/app/api/itam/sites/route.ts`

Verification (agent-browser):
- ✅ `/` load → Login page แสดงผล
- ✅ Login ด้วย `demo_admin / demo123` → เข้า Dashboard สำเร็จ
- ✅ Dashboard: 11 API routes คืน 200 ครบ (dashboard, insights, devices/lifecycle, devices/depreciation, devices/warranty, cycles, reports, meter/reminders, settings/org-profile, notifications)
- ✅ Navigate ไปหน้า "จัดการอุปกรณ์" → แสดงผล, `/api/sites`, `/api/master` คืน 200
- ✅ Navigate ไปหน้า "แจ้งซ่อม" → แสดงผล
- ✅ Navigate ไปหน้า "สต๊อก" → แสดงผล "📦 คลังสต็อก"
- ✅ Navigate ไปหน้า "วิเคราะห์กระดาษ" → แสดงผล "ITAM กระดาษ"
- ✅ Navigate ไปหน้า "ตั้งค่าระบบ" → แสดงผล + `/api/itam/sites` คืน 200

Stage Summary:
- ✅ โปรเจ็ค ITAM-NextJS รันใน sandbox ได้ครบทุกหน้า (login, dashboard, devices, work-orders, stock, paper-analytics, settings)
- ✅ ใช้ `demo_admin / demo123` สำหรับทดสอบ (ตามที่ user ระบุ)
- ✅ ฐานข้อมูล SQLite ใหม่ — ไม่มีข้อมูล devices/stock/work-orders จริง (ต้อง import ทีหลังถ้าต้องการทดสอบข้อมูลจริง)
- ⚠️ Sandbox shell env `DATABASE_URL` บังคับ path `custom.db` — ไม่สามารถเปลี่ยนเป็น `dev.db` ได้
- ⚠️ Cron webDevReview ยังไม่ได้ตั้ง — จะตั้งในขั้นตอนถัดไป

Unresolved:
- ยังไม่มีข้อมูล master (sites, master-items, devices) — ระบบจะแสดง "ยังไม่มีข้อมูล" ทุกที่
- ต้อง import ข้อมูลตัวอย่างเพื่อให้เห็น dashboard ที่สมบูรณ์ (ผ่าน `/api/seed` หรือ `scripts/import-master-item-v3.ts`)
- `/api/itam/events` SSE ใช้เวลา 2.5-3.5 min ต่อ connection (normal สำหรับ SSE long-poll)

---

## Task ID: QA-DEVICES-001
Agent: QA Tester (web dev review)
Task: ทดสอบหน้า "จัดการอุปกรณ์" แบบละเอียด หาบั๊กและช่องโหว่ทั้ง Functional และ UI/UX (ห้ามแก้โค้ด — แค่จับผิด)

Test Account: `demo_admin / demo123` (role=admin, isDemo=true)
Environment: Next.js 16.3.2 dev + SQLite (DB ว่าง — ไม่มี devices/sites/master seeded)

### Work Log — ลำดับการทดสอบ
1. Login → Dashboard → Navigate ไปหน้า "จัดการอุปกรณ์"
2. ตรวจ layout, header, search bar, filter dropdowns, table structure
3. คลิกปุ่ม "เพิ่มอุปกรณ์" → ตรวจ form structure + labels
4. กด "บันทึก" โดยไม่กรอกข้อมูล → ทดสอบ validation
5. ตรวจ form inputs ทุกตัว (id, name, aria-label)
6. ปิด dialog → ทดสอบ search box typing
7. ทดสอบ status filter (เลือก "ส่งซ่อม")
8. ทดสอบ site filter, warranty filter
9. ทดสอบ pagination + page size selector
10. ทดสอบ "นำเข้า CSV" → ตรวจ dialog + ปุ่ม "ดาวน์โหลดเทมเพลต CSV"
11. ทดสอบ "ส่งออก CSV"
12. ทดสอบ "สแกน QR / บาร์โค้ด" → ตรวจ camera fallback
13. ทดสอบ "พิมพ์สติกเกอร์" (disabled state)
14. ทดสอบ dark mode toggle
15. ทดสอบ responsive (mobile 390px)
16. ทดสอบ Global Search + Alt+T shortcut
17. ทดสอบ Refresh button + toast feedback
18. ตรวจ footer alignment + main/footer overlap

### รายงาน Bugs ที่พบ

#### 🔴 Critical (Functional) — ทำให้ใช้งานฟีเจอร์ไม่ได้

**BUG #1: ปุ่ม "บันทึก" ในฟอร์มเพิ่มอุปกรณ์ ไม่ทำงาน**
- รายละเอียด: กด "บันทึก" ในฟอร์มเพิ่มอุปกรณ์แล้วไม่เกิดอะไรเลย — ไม่มี validation error, ไม่มี toast, ไม่มี POST request ไป server
- สาเหตุที่ตรวจพบ: ปุ่มเป็น `type="submit"` แต่ไม่ได้อยู่ภายใน `<form>` element (`form: null`)
- ผลกระทบ: ไม่สามารถเพิ่มอุปกรณ์ใหม่ผ่าน UI ได้เลย — เป็น blocker ของฟีเจอร์หลัก
- ไฟล์: `src/components/itam/devices-page.tsx` (ส่วน dialog)
- Evidence: `/home/z/my-project/qa-devices-04-validation.png`

**BUG #2: React Query refetch loop — duplicate GET requests**
- รายละเอียด: มี 5 ชุดของ duplicate GET requests ในช่วง 3 วินาที (5 ครั้ง × 4 endpoints = 20 requests ใน 3 วิ)
  - `/api/devices`
  - `/api/devices/lifecycle`
  - `/api/devices/depreciation`
  - `/api/devices/warranty`
- สาเหตุที่สันนิษฐาน: useEffect dependencies ผิด หรือ duplicate query keys หรือ multiple components mount/unmount รอบๆ
- ผลกระทบ: บน production ที่มี 2,378 devices จะเพิ่ม server load 5-10×, ทำให้ client ช้าลง
- Evidence: `/home/z/my-project/dev.log` (ดู network requests ในช่วง timestamp 2816.x)

**BUG #6: Page size selector (pagination) พัง**
- รายละเอียด: เปลี่ยน page size (20 / 50 / 100) ใน pagination แล้ว UI อัปเดตค่า แต่ไม่ trigger API refetch
- API ยังคงส่ง `/api/devices?limit=500` เดิมตลอด — ค่าใน selector ไม่ส่งผลต่อ query
- ผลกระทบ: pagination feature ไม่ทำงาน — user เปลี่ยน page size แล้วจำนวนแถวที่แสดงไม่เปลี่ยน
- Evidence: `/home/z/my-project/dev.log` (เลือก page size 100 แล้วไม่มี request `/api/devices?limit=100` ใหม่)

**BUG #9: "ดาวน์โหลดเทมเพลต CSV" ไม่ทำงาน**
- รายละเอียด: คลิกปุ่มแล้วไม่เกิดอะไร — ไม่มี `<a download>` ถูกสร้าง, ไม่มี blob URL, ไม่มี network request, ไม่มี error
- ผลกระทบ: user ไม่สามารถดาวน์โหลดเทมเพลต CSV เพื่อใช้นำเข้าข้อมูล
- Evidence: `/home/z/my-project/qa-devices-08-import-csv.png`

**BUG #10: "ส่งออก CSV" ไม่ทำงาน**
- รายละเอียด: คลิก "ส่งออก CSV" แล้ว API `/api/devices?limit=500` ถูกเรียก แต่ไม่มีไฟล์ถูกดาวน์โหลด — ไม่มี blob URL สร้างขึ้น, ไม่มี empty CSV, ไม่มี error message
- ผลกระทบ: user ไม่สามารถ export ข้อมูลเป็น CSV ได้
- หมายเหตุ: ในกรณี DB ว่าง ควรมีอย่างน้อย empty CSV หรือ toast บอก "ไม่มีข้อมูลให้ export"

**BUG #12: Global Search ไม่ทำงาน**
- รายละเอียด: พิมพ์ "test" ใน global search (เปิดด้วยปุ่ม "ค้นหาทั่วระบบ" หรือ Alt+T) แล้วไม่มี `/api/search` API call เลย — listbox "Suggestions" ว่างเปล่า
- ผลกระทบ: user ไม่สามารถค้นหาทั่วระบบได้

#### 🟠 Medium (Functional/UX)

**BUG #4: Unwanted cascading request เมื่อ page load**
- รายละเอียด: มี `/api/itam/devices/cascading?field=building&site=HQ` auto-request เมื่อ page load โดย user ยังไม่ได้เลือก site/building ใดๆ
- ผลกระทบ: เปลือง bandwidth + server load โดยไม่จำเป็น

**BUG #5: Page size inconsistency**
- รายละเอียด: UI pagination บอก page size = 50 (default) แต่ API request ใช้ `limit=500`
- ผลกระทบ: ค่าใน UI หลอก user — บอกว่าแสดง 50 แต่จริงๆ โหลด 500

#### 🟡 UX / Accessibility Issues

**BUG #3: Form inputs ไม่มี `id` และ `name` (Accessibility)**
- รายละเอียด: ทุก input ในฟอร์มเพิ่มอุปกรณ์ (ยกเว้น `dev-assetSiteCode`) ไม่มี `id` และ `name` (id="", name="")
- ผลกระทบ:
  - Label ไม่ click ได้ (ไม่ focus input)
  - Screen reader ไม่ประกาศ label ที่ถูกต้อง
  - Browser autofill ไม่ทำงาน
  - Form validation ที่อ้างอิง name ไม่ทำงาน

**BUG #7: Empty filter dropdown ไม่มี empty state message**
- รายละเอียด: Site filter มีแค่ "สาขาทั้งหมด" — เมื่อ DB ไม่มีข้อมูล sites ก็ไม่บอก user ว่า "ยังไม่มีสาขาในระบบ" หรือให้ลิงก์ไปหน้า settings เพื่อเพิ่ม
- ผลกระทบ: user สับสนว่าระบบพังหรือไม่มีข้อมูล

**BUG #8: Dropdown ไม่ปิดด้วย Escape key**
- รายละเอียด: เปิด filter dropdown แล้วกด Escape 2 ครั้ง dropdown ยังไม่ปิด — ต้องคลิกข้างนอก
- ผลกระทบ: ผิดจาก convention มาตรฐาน (Esc = ปิด)

**BUG #11: Mobile — Table ไม่ scroll แนวนอน**
- รายละเอียด: ใน mobile (390px viewport) — table กว้าง 894px แต่ container กว้าง 330px และ table ไม่สามารถ scroll แนวนอนได้ (`tableScrollable: false`)
- ผลกระทบ: user มือถือไม่เห็นคอลัมน์ครึ่งหลังของตาราง (มิเตอร์ล่าสุด, อัปเดตล่าสุด, การกระทำ)
- Evidence: `/home/z/my-project/qa-devices-10-mobile-390.png`

**BUG #13: Misleading aria-label "Notifications alt+T"**
- รายละเอียด: region มี `aria-label="Notifications alt+T"` แต่กด Alt+T จริงๆ เปิด "Global Search" ไม่ใช่ Notifications
- ผลกระทบ: user สับสน — label บอกอย่าง ปุ่มทำอย่าง

#### 🟢 Minor UX Issues

**UX #1: Date pickers ใน form มี spinbutton Month/Day/Year = 0**
- ไม่ชัดเจนว่าเป็น placeholder หรือค่าจริง — ควรเป็น empty state ที่อ่านง่ายกว่า

**UX #2: ไม่มี toast หลัง Refresh**
- คลิก "รีเฟรช" แล้ว API refetch แต่ไม่มี toast บอก "รีเฟรชสำเร็จ" หรือ "อัปเดต X รายการ"

**UX #3: "พิมพ์สติกเกอร์" disabled ไม่มี tooltip**
- ปุ่ม disabled โดยไม่มี tooltip บอกเหตุผล ("เลือกอุปกรณ์ก่อนเพื่อพิมพ์สติกเกอร์")

**UX #4: ไม่มี `aria-keyshortcuts` attributes**
- ทุก keyboard shortcut เป็น visual label เฉยๆ (เช่น "alt+T") ไม่ใช้ `aria-keyshortcuts` attribute ที่ screen reader จะประกาศ

**UX #5: Logout button ไม่พบใน desktop view**
- ไม่พบปุ่ม "ออกจากระบบ" ใน desktop layout (อาจซ่อนอยู่ใน collapsed sidebar) — ต้องขยาย sidebar ก่อนจึงจะเห็น

### ✅ สิ่งที่ทำงานได้ดี (Sanity Checks ผ่าน)
- ✅ Login flow ทำงาน — `demo_admin/demo123` เข้าระบบได้
- ✅ Page navigation (Dashboard → Devices) ทำงาน
- ✅ Status filter ทำงาน — เลือก "ส่งซ่อม" แล้ว API `/api/devices?status=repair` ถูกเรียก
- ✅ Search box typing ทำงาน (debounce) — API `/api/devices` ถูกเรียก
- ✅ QR scanner dialog เปิดได้ + มี fallback "ใส่รหัสเอง" เมื่อไม่มีกล้อง
- ✅ Dark mode toggle ทำงาน — bg ดำ, text ขาว (lab color space ถูกต้อง)
- ✅ Footer alignment ถูกต้อง — ไม่ overlap main, อยู่ที่ bottom
- ✅ Refresh button ทำงาน — refetch API สำเร็จ
- ✅ Dialog open/close (Add device, Import CSV, QR scanner) ทำงาน
- ✅ Layout responsive desktop 1280px — ทุก element แสดงผล

### Stage Summary
- **หน้าจัดการอุปกรณ์** มี Critical bugs 6 ตัว ที่ทำให้ฟีเจอร์หลักใช้งานไม่ได้:
  - เพิ่มอุปกรณ์ (BUG #1)
  - Pagination (BUG #6)
  - Import/Export CSV (BUG #9, #10)
  - Global Search (BUG #12)
  - React Query refetch loop (BUG #2)
- **Accessibility** มีปัญหาหนัก — inputs ไม่มี id/name, dropdown ไม่ปิดด้วย Esc, label หลอก
- **Mobile responsive** มีปัญหา — table ไม่ scroll
- **Unresolved** — ทุก bug ข้างต้นยังไม่ได้แก้ไข (ตามกฎ QA: ห้ามแก้ — แค่รายงาน)
- **Priority recommendations สำหรับ ITAM-01**:
  1. 🔴 ด่วนที่สุด: แก้ BUG #1 (form submit) + BUG #6 (pagination) — ทำให้ฟีเจอร์หลักใช้ได้
  2. 🔴 ด่วน: แก้ BUG #2 (refetch loop) — กระทบ production perf
  3. 🟠 กลาง: แก้ BUG #9, #10 (CSV) + BUG #12 (search)
  4. 🟡 ทีหลัง: แก้ UX/a11y issues (#3, #7, #8, #11, #13)

### Screenshots (evidence)
- `/home/z/my-project/qa-devices-01-initial.png` — initial load
- `/home/z/my-project/qa-devices-02-add-form.png` — add device button clicked
- `/home/z/my-project/qa-devices-03-add-dialog.png` — add device dialog opened
- `/home/z/my-project/qa-devices-04-validation.png` — submit empty form (no validation)
- `/home/z/my-project/qa-devices-05-after-cancel.png` — after cancel
- `/home/z/my-project/qa-devices-06-stuck-dropdown.png` — dropdown won't close
- `/home/z/my-project/qa-devices-07-fresh-load.png` — fresh reload
- `/home/z/my-project/qa-devices-08-import-csv.png` — import CSV dialog
- `/home/z/my-project/qa-devices-09-qr-scanner.png` — QR scanner dialog
- `/home/z/my-project/qa-devices-10-mobile-390.png` — mobile 390px view
- `/home/z/my-project/qa-devices-11-dark-mode.png` — dark mode
- `/home/z/my-project/qa-devices-12-dark-mode-2.png` — dark mode confirmed

---

## 📢 Communication Protocol — กฎการสื่อสารระหว่างทีม

> ตามที่ user แนะนำ — ทีม QA และทีม Dev (ITAM-01) ต้องทำงานร่วมกันผ่าน `worklog.md` และ contract ที่ตกลงกัน

### 1. ศูนย์กลางข้อมูล: `worklog.md`
- **ไฟล์เดียว** ที่ทั้งสองทีมอ่านเพื่อเข้าใจสถานะปัจจุบัน
- แต่ละทีมบันทึก Task ID ของตัวเอง ในรูปแบบ:
  - `QA-XXX-###` — สำหรับทีม QA (เช่น `QA-DEVICES-001`)
  - `DEV-XXX-###` — สำหรับทีม Dev / ITAM-01 (เช่น `DEV-FIX-BUG-001`)
- ห้ามลบ section ของอีกทีม — ใส่ `---` คั่นแล้วต่อท้ายเท่านั้น

### 2. ไฟล์ที่ "ห้ามแตะ" (Do-Not-Touch Lists)

#### 🔒 ไฟล์ของทีม QA — ITAM-01 ห้ามแก้ไข
| ไฟล์ / โฟลเดอร์ | เหตุผล |
|----------------|--------|
| `/home/z/my-project/qa-reports/*.md` | เอกสารการตรวจรับ — เป็นหลักฐานตรวจสอบ |
| `/home/z/my-project/qa-videos/*` | วิดีโอ + screenshots การเทส |
| `/home/z/my-project/worklog.md` (ส่วน `QA-*`) | ประวัติการทดสอบ |

#### 🔒 ไฟล์ของทีม Dev / ITAM-01 — QA ห้ามแก้ไข
| ไฟล์ / โฟลเดอร์ | เหตุผล |
|----------------|--------|
| `/home/z/my-project/src/**` (โค้ดทั้งหมด) | โค้ดแอป — QA ทำหน้าที่แค่ทดสอบ ไม่แก้ |
| `/home/z/my-project/prisma/**` | Database schema |
| `/home/z/my-project/scripts/**` | Migration / seed scripts |
| `/home/z/my-project/worklog.md` (ส่วน `MIGRATE-*`, `DEV-*`) | ประวัติการพัฒนา |

#### 🤝 ไฟล์ที่ทั้งสองทีมอ่านร่วมกัน (Read-Only Contract)
| ไฟล์ | หน้าที่ |
|------|--------|
| `/home/z/my-project/src/components/itam/types.ts` | **Shared Types Contract** — ทั้งสองทีมต้องอ้างอิง type จากไฟล์นี้ |
| `/home/z/my-project/prisma/schema.prisma` | Database schema — reference only |
| `/home/z/my-project/package.json` | Dependency manifest — reference only |

### 3. Shared Types Contract

ทีม Dev (ITAM-01) และทีม QA ต้องใช้ type definitions จาก:

📁 `src/components/itam/types.ts` (635 lines)

หาก Dev เปลี่ยน type ในไฟล์นี้ ต้องแจ้ง QA ใน worklog ที่ส่วน `DEV-TYPES-CHANGE` เพื่อ QA ปรับ test cases ตาม

หาก QA พบว่า type ไม่ตรงกับ implementation (เช่น form ไม่มี field ที่ type บอก) — รายงานใน `QA-TYPES-MISMATCH` section

### 4. Workflow ระหว่างทีม

```
┌─────────────┐         bug report          ┌─────────────┐
│   QA Team   │ ─────────────────────────> │   ITAM-01   │
│             │   qa-reports/QA-XXX.md      │  (Dev)      │
│             │ <───────────────────────── │             │
└─────────────┘     fix commit + DEV-FIX   └─────────────┘
       │                                          │
       │  re-test (verify fix)                    │
       ▼                                          ▼
   update QA-XXX.md                          update DEV-FIX-XXX
   status: Open → Verified ✅               status: In Progress → Done ✅
```

### 5. ตัวอย่าง Task ID Convention

| Pattern | ใช้สำหรับ |
|---------|---------|
| `QA-DEVICES-###` | ทดสอบหน้า Devices |
| `QA-WORKORDERS-###` | ทดสอบหน้า Work Orders |
| `QA-STOCK-###` | ทดสอบหน้า Stock |
| `QA-METER-###` | ทดสอบหน้า Meter Reading |
| `QA-SETTINGS-###` | ทดสอบหน้า Settings |
| `QA-AUTH-###` | ทดสอบ Auth / RBAC |
| `DEV-FIX-BUG-###` | Dev แก้ bug ตามรายงาน QA |
| `DEV-FEATURE-###` | Dev สร้างฟีเจอร์ใหม่ |
| `DEV-REFACTOR-###` | Dev ปรับโครงสร้างโค้ด |

### 6. กฎเพิ่มเติม

- ✅ QA สามารถ: สร้างไฟล์ใน `qa-reports/`, `qa-videos/`, append worklog ส่วน QA
- ❌ QA ห้าม: แก้ไฟล์ใน `src/`, `prisma/`, `scripts/` หรือลบ worklog ส่วน Dev
- ✅ Dev สามารถ: แก้ไฟล์ใน `src/`, `prisma/`, `scripts/`, append worklog ส่วน Dev
- ❌ Dev ห้าม: แก้ไฟล์ใน `qa-reports/`, `qa-videos/` หรือลบ worklog ส่วน QA
- ✅ ทั้งสองทีม: อ่านไฟล์ใน `qa-reports/`, `src/components/itam/types.ts`, `prisma/schema.prisma` ได้ตลอด

---

## 📊 สถานะปัจจุบัน (Snapshot)

| ทีม | Task ล่าสุด | สถานะ |
|-----|-----------|--------|
| MIGRATE | MIGRATE-001 | ✅ เสร็จ — รันได้ทุกหน้า |
| QA | QA-DEVICES-001 | ✅ เสร็จ — รายงาน 22 bugs |
| DEV | — | ⏳ รอรับรายงาน QA-DEVICES-001 เพื่อเริ่มแก้ |

### Priority recommendations สำหรับ ITAM-01 (ตามลำดับ):

1. 🔴 **P0 — แก้ด่วน**: BUG-001 (form submit), BUG-006 (pagination), BUG-009 (CSV template), BUG-010 (export CSV), BUG-012 (global search)
2. 🟠 **P1 — แก้ก่อน Go-Live**: BUG-002 (refetch loop), BUG-011 (mobile table scroll)
3. 🟡 **P2 — แก้ Polish**: BUG-003 (form a11y), BUG-004, BUG-005, BUG-007, BUG-008, BUG-013
4. 🟢 **P3 — ทีหลัง**: BUG-014 ถึง BUG-022 (cosmetic)

---

## 📁 โครงสร้างไฟล์ QA ปัจจุบัน

```
/home/z/my-project/
├── worklog.md                          # 📋 ศูนย์กลางข้อมูล (MIGRATE + QA + DEV)
├── qa-reports/
│   └── QA-DEVICES-001.md              # 📄 Test Report หน้า Devices
├── qa-videos/
│   ├── 01-devices-page-qa.webm        # 🎥 วิดีโอการเทส (~2 นาที)
│   └── step-*.png (11 รูป)            # 📸 screenshots แต่ละ step
└── src/components/itam/types.ts       # 🤝 Shared Types Contract
```


---

## Task ID: QA-STOCK-001
Agent: QA Tester (web dev review — round 2)
Task: ทดสอบหน้า "คลังสต็อก" (Stock Page) แบบละเอียด หาบั๊กและช่องโหว่ทั้ง Functional และ UI/UX (ห้ามแก้โค้ด — แค่จับผิด)

Test Account: `demo_admin / demo123` (role=admin, isDemo=true)
Environment: Next.js 16.3.2 dev + SQLite (DB เริ่มว่าง → สร้าง STK-0001 + ทำ transaction + ลบ)

### Work Log — ลำดับการทดสอบ
1. Login → Dashboard → Navigate ไปหน้า "คลังสต็อก"
2. ตรวจ tabs (8 ตัว) + Overview tab empty state
3. คลิก Inventory tab → ตรวจ filters + table
4. คลิก "เพิ่มสินค้า" → กรอก form → สร้าง STK-0001 (Toner HP 26A)
5. ตรวจ form a11y (id, name, aria-label)
6. ทดสอบ tab navigation (รับเข้า → เบิกออก → รออนุมัติ → ใบสั่งซื้อ → ประวัติ → สรุป → ภาพรวม)
7. ทดสอบ Stock IN ผ่าน row action button + form validation
8. ทดสอบ Stock OUT ผ่าน row action button + overdraw validation + valid transaction
9. ทดสอบ delete + confirm dialog
10. ทดสอบ mobile responsive (390×844)
11. ทดสอบ dark mode toggle

### รายงาน Bugs ที่พบ (16 ตัว)

#### 🔴 Critical (Blocker)
- **BUG-STK-001**: Tabs Navigation พังทั้งหมด — คลิก tab ใดๆ selected ยังเป็น "คลังสินค้า" เสมอ → user เข้าถึง Stock IN/OUT/Pending/PO/History/Summary ผ่าน tab ไม่ได้
- **BUG-STK-003**: Stock IN form "บันทึก" ไม่ทำงาน — กดแล้วไม่มี validation, ไม่มี POST request (เหมือน BUG-001 ของ Devices page)

#### 🟠 High
- **BUG-STK-002**: ไม่มี success toast หลัง create/update/delete/transaction (เงียบสนิท)
- **BUG-STK-005**: Mobile responsive พัง — viewport เปลี่ยนแล้ว layout ไม่ปรับ
- **BUG-STK-006**: Delete ใช้ native browser `confirm()` แทน shadcn AlertDialog

#### 🟡 Medium
- **BUG-STK-004**: row action buttons มี `title` แต่ไม่มี `aria-label` (a11y ต่ำ)
- **BUG-STK-010**: Stock IN form ไม่มี "บันทึกและเพิ่มอีก" สำหรับ bulk entry
- **BUG-STK-011**: ไม่แสดง "last updated by" ใน row (audit trail missing)
- **BUG-STK-015**: Stock IN form ไม่มีการเลือก purchase order

#### 🟢 Low (cosmetic)
- BUG-STK-007: ไม่มี skeleton loader
- BUG-STK-008: ไม่มี empty state สำหรับ filter dropdowns
- BUG-STK-009: ไม่มี keyboard shortcut "เพิ่มสินค้า" (Ctrl+N)
- BUG-STK-012: ไม่มี search filter clear (×) button
- BUG-STK-013: ตารางไม่มี column visibility toggle
- BUG-STK-014: "ReorderPoint" header ควรเป็น "จุดสั่งซื้อซ้ำ"
- BUG-STK-016: row hover ไม่มี highlight

### ✅ สิ่งที่ทำงานได้ดี (8/16 ผ่าน)
- ✅ Login + Navigate
- ✅ Tabs 8 ตัวแสดงครบ (visual)
- ✅ Overview tab empty state
- ✅ Inventory tab filters + table
- ✅ Add stock item — POST 201 + table update
- ✅ Form inputs a11y — ทุก input มี id unique (เก่งกว่า Devices page มาก!)
- ✅ Stock OUT overdraw validation
- ✅ Stock OUT valid transaction — POST 201 + table update (10→7)
- ✅ Delete accept → DELETE 200
- ✅ Dark mode + Footer alignment

### เปรียบเทียบกับ Devices Page (QA-DEVICES-001)
- Stock Page มี UX ที่ดีกว่าในด้าน: form a11y + button disabled state + overdraw validation
- Stock Page มี bug ร้ายแรงกว่าในด้าน: tab navigation (Devices ไม่มี tabs)
- ทั้งสองหน้า: form submit ของ Stock IN ก็พังเหมือน Devices (น่าจะเป็น pattern เดียวกัน)

### Stage Summary
- Pass Rate: 8/16 = 50%
- Critical bugs 2 ตัว (BUG-STK-001, BUG-STK-003) — ต้องแก้ก่อน cutover
- วิดีโอ: `/home/z/my-project/qa-videos/stock/01-stock-page-qa.webm` (2.6 MB, ~3 นาที)
- Screenshots: 18 รูปใน `/home/z/my-project/qa-videos/stock/`
- Test Report: `/home/z/my-project/qa-reports/QA-STOCK-001.md`

### Priority recommendations สำหรับ ITAM-01
1. 🔴 **P0**: แก้ BUG-STK-001 (Tabs) — เป็น root cause ของการเข้าถึงฟีเจอร์ 6 ตัวไม่ได้
2. 🔴 **P0**: แก้ BUG-STK-003 (Stock IN form submit) — เหมือน BUG-001 ของ Devices page
3. 🟠 **P1**: แก้ BUG-STK-005 (Mobile) + BUG-STK-002 (toasts) + BUG-STK-006 (AlertDialog)
4. 🟡 **P2**: แก้ BUG-STK-004, BUG-STK-010, BUG-STK-011, BUG-STK-015
5. 🟢 **P3**: แก้ BUG-STK-007, 008, 009, 012, 013, 014, 016 (cosmetic)

### Insights สำหรับ ITAM-01
- pattern ของ bug "form submit ไม่ทำงาน" เหมือนกันใน Devices + Stock IN → น่าจะเป็น pattern เดียวกัน (ปุ่ม `type="submit"` ไม่ได้อยู่ใน `<form>`)
- Stock OUT form ทำงานปกติ — แสดงว่ามีบาง form ใช้ pattern ที่ถูกต้อง → ให้ดู Stock OUT form เป็นต้นแบบ
- Form a11y ของ Stock ดีมาก (มี id ครบ) → ให้ทำแบบเดียวกันใน Devices page ด้วย


---

## Task ID: QA-001
Agent: QA Team
Task: ทดสอบหน้าจัดการอุปกรณ์ (Devices Page)

**Test Date:** 2026-08-23
**Test Account:** demo_admin / demo123 (role=admin)
**Environment:** Next.js 16.3.2 dev + SQLite (DB ว่าง)
**Pass Rate:** 9/22 = 41%

### Results:

#### ✅ ผ่าน (9 รายการ)
- ✅ Login flow — demo_admin/demo123 เข้าระบบได้
- ✅ Page navigation (Dashboard → จัดการอุปกรณ์) — h1 แสดงถูกต้อง
- ✅ Empty state UX — แสดง "ยังไม่มีอุปกรณ์ในระบบ" + ปุ่ม CTA "เพิ่มอุปกรณ์"
- ✅ Status filter — เลือก "ส่งซ่อม" แล้ว API `/api/devices?status=repair&limit=500` 200
- ✅ Search box typing — debounce ทำงาน, API `/api/devices` ถูกเรียก
- ✅ QR scanner dialog — เปิดได้ + มี fallback "ใส่รหัสเอง" เมื่อไม่มีกล้อง
- ✅ Dark mode toggle — bg=ดำ, text=ขาว (lab color space ถูกต้อง)
- ✅ Footer alignment — main bottom=767, footer top=767, ไม่ overlap
- ✅ Refresh button — API refetch สำเร็จ

#### ❌ ไม่ผ่าน (22 รายการ)

##### 🔴 Critical (6 ตัว — ทำให้ฟีเจอร์หลักใช้ไม่ได้)

**BUG-001: ปุ่ม "บันทึก" ใน form เพิ่มอุปกรณ์ไม่ทำงาน**
- อธิบายปัญหา: กดปุ่ม "บันทึก" ในฟอร์มเพิ่มอุปกรณ์แล้วไม่เกิดอะไรเลย — ไม่มี validation error, ไม่มี toast, ไม่มี POST request ไป server
- สาเหตุ: ปุ่มเป็น `type="submit"` แต่ไม่ได้อยู่ใน `<form>` element (`form: null`) → submit event ไม่ trigger
- ผลกระทบ: ไม่สามารถเพิ่มอุปกรณ์ใหม่ผ่าน UI ได้เลย (Blocker ของฟีเจอร์หลัก)
- ไฟล์: `src/components/itam/devices-page.tsx`

**BUG-002: React Query refetch loop — duplicate GET requests**
- อธิบายปัญหา: มี 5 ชุดของ duplicate GET requests ในช่วง 3 วินาที (20 requests รวม) — `/api/devices`, `/api/devices/lifecycle`, `/api/devices/depreciation`, `/api/devices/warranty`
- ผลกระทบ: บน production (2,378 devices) จะเพิ่ม server load 5-10×, ทำให้ client ช้าลง

**BUG-006: Page size selector (pagination) พัง**
- อธิบายปัญหา: เปลี่ยน page size (20/50/100) แล้ว UI อัปเดตค่า แต่ไม่ trigger API refetch — API ยังคงส่ง `/api/devices?limit=500` เดิมตลอด
- ผลกระทบ: pagination feature ไม่ทำงาน — user เปลี่ยน page size แล้วจำนวนแถวที่แสดงไม่เปลี่ยน

**BUG-009: "ดาวน์โหลดเทมเพลต CSV" ไม่ทำงาน**
- อธิบายปัญหา: คลิกปุ่มแล้วไม่เกิดอะไร — ไม่มี `<a download>` ถูกสร้าง, ไม่มี blob URL, ไม่มี network request, ไม่มี error
- ผลกระทบ: user ไม่สามารถดาวน์โหลดเทมเพลต CSV เพื่อใช้นำเข้าข้อมูล

**BUG-010: "ส่งออก CSV" ไม่ทำงาน**
- อธิบายปัญหา: คลิก "ส่งออก CSV" แล้ว API `/api/devices?limit=500` ถูกเรียก 200 OK แต่ไม่มีไฟล์ถูกดาวน์โหลด — ไม่มี blob URL, ไม่มี empty CSV, ไม่มี error message
- ผลกระทบ: user ไม่สามารถ export ข้อมูลเป็น CSV ได้

**BUG-012: Global Search ไม่ทำงาน**
- อธิบายปัหหา: พิมพ์ "test" ใน global search (เปิดด้วยปุ่ม "ค้นหาทั่วระบบ" หรือ Alt+T) แล้วไม่มี `/api/search` API call เลย — listbox "Suggestions" ว่างเปล่า
- ผลกระทบ: user ไม่สามารถค้นหาทั่วระบบได้

##### 🟠 High (3 ตัว)

**BUG-011: Mobile — Table ไม่ scroll แนวนอน**
- อธิบายปัญหา: ใน mobile (390px viewport) — table กว้าง 894px แต่ container 330px และ table ไม่สามารถ scroll แนวนอนได้
- ผลกระทบ: user มือถือไม่เห็นคอลัมน์ครึ่งหลังของตาราง (มิเตอร์ล่าสุด, อัปเดตล่าสุด, การกระทำ)

**BUG-004: Unwanted cascading request เมื่อ page load**
- อธิบายปัญหา: มี `/api/itam/devices/cascading?field=building&site=HQ` auto-request เมื่อ page load โดย user ยังไม่ได้เลือก site/building ใดๆ
- ผลกระทบ: เปลือง bandwidth + server load โดยไม่จำเป็น

**BUG-005: Page size inconsistency**
- อธิบายปัญหา: UI pagination บอก page size = 50 (default) แต่ API request ใช้ `limit=500`
- ผลกระทบ: ค่าใน UI หลอก user — บอกว่าแสดง 50 แต่จริงๆ โหลด 500

##### 🟡 Medium (4 ตัว)

**BUG-003: Form inputs ไม่มี `id` และ `name` (Accessibility)**
- อธิบายปัญหา: ทุก input ในฟอร์มเพิ่มอุปกรณ์ (ยกเว้น `dev-assetSiteCode`) ไม่มี `id` และ `name` (id="", name="")
- ผลกระทบ: Label ไม่ click ได้, Screen reader ไม่ประกาศ label, Browser autofill ไม่ทำงาน
- ละเมิด WCAG 2.1: SC 1.3.1, SC 3.3.2, SC 4.1.2

**BUG-007: Empty filter dropdown ไม่มี empty state message**
- อธิบายปัญหา: Site filter มีแค่ "สาขาทั้งหมด" — เมื่อ DB ไม่มีข้อมูล sites ก็ไม่บอก user ว่า "ยังไม่มีสาขาในระบบ"
- ผลกระทบ: user สับสนว่าระบบพังหรือไม่มีข้อมูล

**BUG-008: Dropdown ไม่ปิดด้วย Escape key**
- อธิบายปัญหา: เปิด filter dropdown แล้วกด Escape 2 ครั้ง dropdown ยังไม่ปิด — ต้องคลิกข้างนอก
- ผลกระทบ: ผิดจาก convention มาตรฐาน (Esc = ปิด)

**BUG-013: Misleading aria-label "Notifications alt+T"**
- อธิบายปัญหา: region มี `aria-label="Notifications alt+T"` แต่กด Alt+T จริงๆ เปิด "Global Search" ไม่ใช่ Notifications
- ผลกระทบ: user สับสน — label บอกอย่าง ปุ่มทำอย่าง

##### 🟢 Low (9 ตัว — cosmetic)

**BUG-014:** Date pickers มี spinbutton Month/Day/Year = 0 (placeholder ไม่ชัดเจน)
**BUG-015:** ไม่มี toast หลัง Refresh button (no feedback)
**BUG-016:** "พิมพ์สติกเกอร์" disabled ไม่มี tooltip บอกเหตุผล
**BUG-017:** ไม่มี `aria-keyshortcuts` attributes บน shortcut buttons
**BUG-018:** Logout button ไม่เห็นใน desktop collapsed sidebar
**BUG-019:** Dialog ไม่มี focus trap (Tab ออกจาก dialog ได้)
**BUG-020:** Search box ไม่มี clear (×) button
**BUG-021:** Filter chip ไม่แสดงค่าที่เลือกแบบ visual badge
**BUG-022:** ไม่มี skeleton loader ตอนรอ data (white flash)

### Priority สำหรับ ITAM-01:
1. 🔴 **P0 (ด่วนที่สุด):** BUG-001, BUG-006 — ทำให้ฟีเจอร์หลักใช้ได้ (เพิ่ม device + pagination)
2. 🔴 **P0 (ด่วน):** BUG-002 — กระทบ production performance
3. 🟠 **P1:** BUG-009, BUG-010, BUG-012 — CSV import/export + global search
4. 🟡 **P2:** BUG-003, BUG-004, BUG-005, BUG-007, BUG-008, BUG-013 — UX/a11y
5. 🟢 **P3:** BUG-014 ถึง BUG-022 — cosmetic/polish

### หลักฐาน:
- 📄 เอกสารฉบับเต็ม: `/home/z/my-project/qa-reports/QA-DEVICES-001.md`
- 📸 Screenshots: `/home/z/my-project/qa-videos/step-*.png` (11 รูป)

---


---

## Task ID: QA-002
Agent: QA Team
Task: ทดสอบหน้า Dashboard

**Test Date:** 2026-08-23
**Test Account:** demo_admin / demo123 (role=admin)
**Environment:** Next.js 16.3.2 dev + SQLite (DB มี STK-0001 + audit log จาก QA-STOCK-001)
**Pass Rate:** 12/22 = 55%

### Results:

#### ✅ ผ่าน (12 รายการ)
- ✅ Login + Navigate ไป Dashboard
- ✅ โครงสร้าง header + range selector (4 options: เดือนนี้/30วัน/ไตรมาส/ทั้งหมด)
- ✅ Range selector ทำงาน — API `/api/itam/dashboard?range=quarter` 200
- ✅ Refresh button — trigger refetch
- ✅ Site filter dialog — empty state "ยังไม่มีข้อมูล"
- ✅ Heatmap dialog — empty state "ยังไม่มีข้อมูล"
- ✅ Customize widgets panel — toggle on/off + count update (10/10 → 9/10)
- ✅ Customize "รีเซ็ต" — reset กลับ 9/10 → 10/10
- ✅ Quick Actions (จดมิเตอร์/สแกน QR/ค้นหา/วิเคราะห์) — navigate ถูกต้อง
- ✅ "จัดการรอบ" dialog — empty state "ยังไม่มีรอบจดมิเตอร์"
- ✅ Notifications popover — badge "2" + รายการ audit log
- ✅ "ไปยังหน้าอุปกรณ์" — navigate to Devices
- ✅ Dark mode toggle
- ✅ Mobile responsive (390px) — ไม่มี overflow
- ✅ 11 API endpoints 200

#### ❌ ไม่ผ่าน (10 รายการ)

##### 🔴 Critical (1 ตัว)
**BUG-DASH-001: ปุ่ม "สร้างรอบใหม่" คลิกไม่ตอบ**
- อธิบายปัญหา: คลิกปุ่ม "สร้างรอบใหม่" ใน widget "รอบจดมิเตอร์" แล้วไม่เกิดอะไร — ไม่มี dialog เปิด, ไม่มี error, ไม่มี network request
- ผลกระทบ: user ไม่สามารถสร้าง cycle ใหม่จาก Dashboard ได้ (Blocker)
- ไฟล์น่าจะ: `src/components/itam/dashboard-page.tsx` หรือ `cycle-manage-dialog.tsx`

##### 🟠 High (2 ตัว)
**BUG-DASH-002: PDF button disabled โดยไม่มี tooltip**
- อธิบายปัญหา: ปุ่ม PDF disabled (เพราะไม่มีข้อมูล) แต่ไม่มี tooltip บอกเหตุผล
- ผลกระทบ: user สับสนว่าทำไมกดไม่ได้

**BUG-DASH-003: widget headers ส่วนใหญ่ไม่มี semantic heading (a11y)**
- อธิบายปัญหา: จาก widget cards ทั้งหมด มีแค่ "🔄 วงจรชีวิตอุปกรณ์" ที่ใช้ `<h3>` — ที่เหลือใช้ div/span
- ผลกระทบ: Screen reader ข้าม widget headers ไป — user ไม่รู้ว่ามี widget อะไรบ้าง
- ละเมิด WCAG 2.1 SC 1.3.1

##### 🟡 Medium (4 ตัว)
**BUG-DASH-004: ปุ่ม "ปรับแต่ง" และ "ปรับแต่งวิดเจ็ต" ทำงานเหมือนกัน**
- อธิบายปัญหา: มี 2 ปุ่มใน header ที่เปิด dialog เดียวกัน — ซ้ำซ้อน

**BUG-DASH-005: ปุ่ม "สร้างรายงาน" / "สร้างรายงานแรก" ไม่ปรากฏใน DOM**
- อธิบายปัญหา: ค้นหาปุ่มใน DOM ไม่เจอ — อาจถูกซ่อนด้วย empty state แต่ไม่มี CTA ทดแทน

**BUG-DASH-006: range selector ไม่ persist ใน localStorage**
- อธิบายปัญหา: เลือก "ไตรมาสนี้" แล้ว reload → กลับเป็น "เดือนนี้" เสมอ

**BUG-DASH-007: ไม่มี toast หลัง Refresh**
- อธิบายปัญหา: คลิก "รีเฟรช" → API refetch แต่ไม่มี toast บอก "รีเฟรชสำเร็จ"

##### 🟢 Low (3 ตัว)
- **BUG-DASH-008:** ไม่มี loading skeleton ตอนรอ dashboard API (white flash)
- **BUG-DASH-009:** ไม่มี aria-label บน widget cards
- **BUG-DASH-010:** ไม่มี keyboard shortcut สำหรับ refresh (F5/Ctrl+R)

### Priority สำหรับ ITAM-01:
1. 🔴 **P0:** BUG-DASH-001 — "สร้างรอบใหม่" Blocker ของ cycle feature
2. 🟠 **P1:** BUG-DASH-002, BUG-DASH-003 — UX + a11y
3. 🟡 **P2:** BUG-DASH-004, 005, 006, 007 — UX improvements
4. 🟢 **P3:** BUG-DASH-008, 009, 010 — polish

### หลักฐาน:
- 📸 Screenshots: `/home/z/my-project/qa-reports/dashboard-*.png` (11 รูป)
- 📄 Test Report: `/home/z/my-project/qa-reports/QA-DASH-001.md`


---

## Task ID: QA-003
Agent: QA Team
Task: ทดสอบหน้า Paper Analytics (วิเคราะห์กระดาษ)

**Test Date:** 2026-08-23
**Test Account:** demo_admin / demo123 (role=admin)
**Environment:** Next.js 16.3.2 dev + SQLite (DB มี STK-0001 + audit log)
**Pass Rate:** 7/15 = 47%

### Results:

#### ✅ ผ่าน (7 รายการ)
- ✅ Login + Navigate ไปหน้า "ITAM กระดาษ"
- ✅ โครงสร้างหน้า: header + date range + site filter + building/department textboxes + 4 tabs (ภาพรวม/จัดอันดับ/3เดือน/รายละเอียด)
- ✅ API `/api/itam/paper-analytics?view=overview&monthStart=2026-03&monthEnd=2026-08` 200
- ✅ Refresh button — trigger refetch
- ✅ PDF export — เปิด print preview พร้อมตาราง "การใช้กระดาษรายเดือน" (6 เดือน) + "5 แผนกใช้กระดาษสูงสุด"
- ✅ Dark mode toggle
- ✅ Mobile responsive (390px) — ไม่มี overflow, cards จัด 2 คอลัมน์
- ✅ 103 chart elements แสดงผล (recharts)

#### ❌ ไม่ผ่าน (8 รายการ)

##### 🔴 Critical (3 ตัว)

**BUG-PAPER-001: Tabs Navigation พังทั้งหมด**
- อธิบายปัญหา: คลิก tab ใดๆ (จัดอันดับ / 3 เดือน / รายละเอียด / ภาพรวม) → `aria-selected=true` ยังคงเป็น "ภาพรวม" เสมอ
- ผลกระทบ: user ไม่สามารถเข้าถึงมุมมองอื่นๆ นอกจาก "ภาพรวม" ได้ — pattern เดียวกับ Stock page (BUG-STK-001)
- Severity: 🔴 Critical — Blocker ของ 3 ฟีเจอร์

**BUG-PAPER-002: Date range picker พัง — เปลี่ยนค่าแล้วไม่ refetch**
- อธิบายปัญหา: เปลี่ยนค่า input `type="month"` เป็น "2026-01" → ไม่ trigger API refetch — API ยังส่ง `monthStart=2026-03&monthEnd=2026-08` เดิม
- ผลกระทบ: user เปลี่ยนช่วงเวลาวิเคราะห์แล้วข้อมูลไม่อัปเดต
- Severity: 🔴 Critical — ฟีเจอร์หลักของหน้าใช้ไม่ได้

**BUG-PAPER-003: "Show month picker" ปุ่มไม่ทำงาน**
- อธิบายปัญหา: คลิกปุ่ม "Show month picker" แล้วไม่เกิด calendar/popover ขึ้น
- ผลกระทบ: user ต้องพิมพ์เลขเดือน/ปีเองใน spinbutton แทนการเลือกจาก calendar
- Severity: 🔴 Critical — UX แย่

##### 🟠 High (2 ตัว)

**BUG-PAPER-004: PDF Preview ไม่มีปุ่ม "ปิด" และไม่ปิดด้วย Escape**
- อธิบายปัญหา: PDF preview เปิดขึ้นแล้ว user ติดอยู่ — ไม่มีปุ่ม "ปิด" และกด Escape ไม่ปิด ต้อง refresh หน้าเท่านั้น
- ผลกระทบ: user ติดอยู่ใน PDF preview ไม่สามารถกลับไปหน้า Paper Analytics ได้ (ต้อง reload ทั้ง page)
- Severity: 🟠 High — UX แย่มาก

**BUG-PAPER-005: Site filter ไม่มี empty state message**
- อธิบายปัญหา: Site filter มีแค่ "ทุกสาขา" — เมื่อ DB ไม่มีข้อมูล sites ก็ไม่บอก user ว่า "ยังไม่มีสาขาในระบบ"
- ผลกระทบ: user สับสนว่าระบบพังหรือไม่มีข้อมูล — pattern เดียวกับ Devices page (BUG-007)
- Severity: 🟠 High UX

##### 🟡 Medium (2 ตัว)

**BUG-PAPER-006: ไม่มี toast หลัง Refresh**
- อธิบายปัญหา: คลิก "รีเฟรช" → API refetch สำเร็จ แต่ไม่มี toast บอก "รีเฟรชสำเร็จ"
- ผลกระทบ: no feedback — pattern เดียวกับทุกหน้า
- Severity: 🟡 Medium UX

**BUG-PAPER-007: widget headers ไม่มี semantic heading (a11y)**
- อธิบายปัญหา: มีแค่ h1 "ITAM กระดาษ" — widget headers (ตัวชี้วัดหลัก, การใช้กระดาษรายเดือน, 5 แผนกใช้กระดาษสูงสุด) ใช้ div/h2 ใน PDF preview แต่ไม่มี heading ในหน้าหลัก
- ผลกระทบ: Screen reader ข้าม widget headers ไป — pattern เดียวกับ Dashboard (BUG-DASH-003)
- Severity: 🟡 Medium a11y — ละเมิด WCAG 2.1 SC 1.3.1

##### 🟢 Low (1 ตัว)

**BUG-PAPER-008: Month/Year inputs ไม่มี id/name (a11y)**
- อธิบายปัญหา: ทั้ง 2 `<input type="month">` ไม่มี `id` และ `name` (id="", name="")
- ผลกระทบ: Label click ไม่ได้, Screen reader ไม่ประกาศ label, Browser autofill ไม่ทำงาน
- Severity: 🟢 Low a11y

### Priority สำหรับ ITAM-01:
1. 🔴 **P0:** BUG-PAPER-001, BUG-PAPER-002, BUG-PAPER-003 — ฟีเจอร์หลักใช้ไม่ได้
2. 🟠 **P1:** BUG-PAPER-004, BUG-PAPER-005 — UX แย่
3. 🟡 **P2:** BUG-PAPER-006, BUG-PAPER-007 — UX/a11y
4. 🟢 **P3:** BUG-PAPER-008 — cosmetic

### Insights สำหรับ ITAM-01 (Pattern Bugs ข้ามหน้า):
- **Tabs Navigation พัง** — พบใน Stock + Paper Analytics → น่าจะเป็น root cause เดียวกัน (shared Tab component)
- **ไม่มี toast หลัง Refresh** — พบในทุกหน้า (Devices, Stock, Dashboard, Paper Analytics) → pattern เดียวกัน
- **widget headers ไม่มี semantic heading** — พบใน Dashboard + Paper Analytics
- **Site filter ไม่มี empty state** — พบใน Devices + Paper Analytics
- **PDF Preview ไม่มีปุ่มปิด** — พบเฉพาะ Paper Analytics (แต่รุนแรงเพราะ user ติดอยู่)

### หลักฐาน:
- 📸 Screenshots: `/home/z/my-project/qa-reports/paper-*.png` (10 รูป)
- 📄 Test Report: `/home/z/my-project/qa-reports/QA-PAPER-001.md`

