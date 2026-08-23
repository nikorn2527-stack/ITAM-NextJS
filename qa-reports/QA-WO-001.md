# QA Test Report — หน้าแจ้งซ่อม (Work Orders Page)

| ฟิลด์ | ค่า |
|------|-----|
| **Document ID** | QA-WO-001 |
| **Task ID** | QA-004 |
| **Test Date** | 2026-08-23 |
| **Tester** | QA Team |
| **Feature Under Test** | หน้าแจ้งซ่อม (Work Orders) |
| **Test Account** | `demo_admin / demo123` (role=admin) |
| **Environment** | Next.js 16.3.2 dev + SQLite (DB มี 1 WO: PPIT0001) |
| **Viewports** | 1280×800 · 390×844 |
| **Pass Rate** | 9/15 = 60% |

---

## Task ID: QA-004
**Agent:** QA Team
**Task:** ทดสอบหน้าแจ้งซ่อม (Work Orders)

### Results:

#### ✅ ผ่าน (9 รายการ)
- ✅ Login + Navigate ไปหน้า "แจ้งซ่อม"
- ✅ โครงสร้าง header + รีเฟรช + แจ้งซ่อมใหม่ + ค้นหา + สแกน QR + กรองสถานะ + กรองความเร่งด่วน
- ✅ Stats cards แสดงครบ (รอดำเนินการ / กำลังซ่อม / เสร็จแล้ว / ยกเลิก)
- ✅ Status filter — 5 สถานะ (รอ/กำลังซ่อม/รออะไหล่/เสร็จแล้ว/ยกเลิก)
- ✅ Priority filter — 4 ระดับ (ปกติ/ปานกลาง/สูง/ด่วน)
- ✅ Create WO form — validation ทำงานดี (ปุ่ม disabled จนกว่าจะกรอก required ครบ)
- ✅ External mode (ลูกค้าภายนอก) — toggle switch ทำงาน + เพิ่ม field "ชื่อลูกค้า *"
- ✅ Create external WO — POST `/api/work-orders` 201 + toast "สร้างใบแจ้งซ่อม PPIT0001 แล้ว" + บันทึก DB จริง (WO count: 1)
- ✅ QR scanner dialog + fallback "ใส่รหัสเอง"
- ✅ Dark mode toggle
- ✅ Mobile responsive (390px) — ไม่มี overflow
- ✅ Form a11y — ทุก input มี id unique (wo-location, wo-reporter, wo-tel ฯลฯ)

#### ❌ ไม่ผ่าน (6 รายการ)

##### 🔴 Critical (3 ตัว)

**BUG-WO-001: Guest WO creation คืน 403 — validateGuestContact ล้มเหลวเพราะ DB ไม่มี contactDirectory**
- อธิบายปัญหา: สร้าง WO แบบ "ไม่ใช่ลูกค้าภายนอก" (guest flow) → POST `/api/work-orders` คืน 403 + toast "ยังไม่มีข้อมูลผู้ติดต่อในระบบ (contactDirectory) กรุณาติดต่อผู้ดูแล"
- สาเหตุ: `validateGuestContact()` ตรวจว่าชื่อ+เบอร์อยู่ใน ContactDirectory table — แต่ DB sandbox ว่าง (ไม่มี contactDirectory entries)
- ผลกระทบ: user ปกติไม่สามารถสร้าง WO ได้ (ต้องเปิด "ลูกค้าภายนอก" เท่านั้น)
- ไฟล์: `src/app/api/work-orders/route.ts:481-497`
- Severity: 🔴 Critical — Blocker ของ guest flow
- Workaround: เปิด "ลูกค้าภายนอก" + กรอก "ชื่อลูกค้า *"

**BUG-WO-002: WO list ไม่แสดงใบงานที่สร้าง — fail-closed สำหรับ non-superadmin**
- อธิบายปัญหา: หลัง create WO สำเร็จ (POST 201) → list ยังแสดง "ยังไม่มีใบแจ้งซ่อม" — API `/api/work-orders?page=1&pageSize=12` คืน `data: [], total: 0` ทั้งที่ DB มี WO จริง (PPIT0001)
- สาเหตุ: `buildAuthorizationContext` ทำให้ demo_admin (role=admin, allowedSites=ALL) ไม่ใช่ superadmin + ไม่มี site grants → fail-closed → คืน empty list
- ผลกระทบ: admin ไม่เห็น WO ที่ตนเองสร้าง → ไม่สามารถ manage WO ได้
- ไฟล์: `src/app/api/work-orders/route.ts:206-216` (fail-closed branch)
- Severity: 🔴 Critical — Blocker ของ WO management

**BUG-WO-003: Search box พิมพ์แล้วไม่ trigger API request**
- อธิบายปัญหา: พิมพ์ "PPIT" ในช่องค้นหา → ไม่มี `/api/work-orders?q=PPIT` ออกไปเลย
- ผลกระทบ: search feature ใช้ไม่ได้ — user ไม่สามารถค้นหา WO ได้
- ไฟล์: `src/components/itam/itam-work-orders.tsx` (search handler)
- Severity: 🔴 Critical — search ใช้ไม่ได้

##### 🟠 High (1 ตัว)

**BUG-WO-004: WO list ไม่ refresh หลัง create (cache invalidation)**
- อธิบายปัญหา: หลัง POST 201 สำเร็จ + toast แสดง → list ไม่ auto-refresh ต้องกด "รีเฟรช" เอง
- ผลกระทบ: user สร้าง WO แล้วไม่เห็นใน list ทันที (คิดว่าพัง)
- Severity: 🟠 High UX

##### 🟡 Medium (2 ตัว)

**BUG-WO-005: Form inputs ไม่มี `name` attribute**
- อธิบายปัญหา: ทุก input มี id แต่ `name=""` (ว่าง) → browser autofill ไม่ทำงาน
- ผลกระทบ: user ไม่สามารถใช้ browser autofill สำหรับชื่อ/เบอร์โทร
- Severity: 🟡 Medium a11y

**BUG-WO-006: ไม่มี empty state message สำหรับ contactDirectory missing**
- อธิบายปัญหา: เมื่อ guest WO creation ล้มเหลวเพราะ contactDirectory ว่าง → toast error ไม่แนะนำวิธีแก้ (เช่น "ไปเพิ่ม contactDirectory ที่หน้า Settings")
- ผลกระทบ: user ไม่รู้จะแก้ยังไง
- Severity: 🟡 Medium UX

### ไม่ได้ทดสอบ (เพราะ BUG-WO-002):
- ❌ WO detail view (click row → detail sheet)
- ❌ รับงาน (Assign)
- ❌ ปิดงาน (Complete)
- ❌ แชทในใบงาน (Messages)
- ❌ รูปภาพ (Images)
- ❌ พิมพ์ใบงาน (Print)
- ❌ Status flow (PENDING → IN_PROGRESS → DONE)

### Priority สำหรับ ITAM-01:
1. 🔴 **P0:** BUG-WO-002 — แก้ fail-closed สำหรับ admin role (ควรให้ admin เห็นทุก WO ไม่ใช่ fail-closed)
2. 🔴 **P0:** BUG-WO-003 — แก้ search box onChange handler
3. 🔴 **P0:** BUG-WO-001 — seed contactDirectory หรือแก้ validateGuestContact ให้ bypass ใน dev mode
4. 🟠 **P1:** BUG-WO-004 — เพิ่ม queryClient.invalidateQueries(['work-orders']) หลัง create
5. 🟡 **P2:** BUG-WO-005, BUG-WO-006

### 💡 Insights สำหรับ ITAM-01:
- **fail-closed policy** เป็น security best practice แต่ทำให้ demo_admin (admin) ไม่เห็น WO → ควรแก้ให้ admin role ทำหน้าที่เหมือน superadmin ใน dev environment
- **Pattern BUG ระบบ:** "ไม่มี cache invalidation หลัง create" เหมือน Stock (BUG-STK-002) — แต่ Stock แก้แล้ว Work Orders ยังไม่แก้
- **Form a11y ดี** — ทุก input มี id unique (เหมือน Stock) — แต่ยังขาด name attribute

### 📁 หลักฐาน:
- 📸 `/home/z/my-project/qa-reports/wo-*.png` (5 รูป)
- 📄 Test Report: `/home/z/my-project/qa-reports/QA-WO-001.md`
