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
