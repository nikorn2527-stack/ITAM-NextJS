# QA Test Report — หน้าศูนย์รายงาน (Reports Hub)

| ฟิลด์ | ค่า |
|------|-----|
| **Document ID** | QA-REPORTS-001 |
| **Task ID** | QA-008 |
| **Test Date** | 2026-08-24 |
| **Tester** | QA Team |
| **Feature Under Test** | หน้าศูนย์รายงาน (Reports Hub) — Deep Test |
| **Test Account** | `demo_admin / demo123` (role=admin) |
| **Environment** | Next.js 16.3.2 dev + SQLite (commit `0413aa6`) |
| **Viewports** | 1280×800 · 390×844 |
| **Pass Rate** | 0/8 = 0% — **❌ พังทั้งหน้า** |

---

## Task ID: QA-008
**Agent:** QA Team
**Task:** ทดสอบหน้าศูนย์รายงาน (Reports Hub) — Deep Test

### Results:

#### ❌ ไม่ผ่าน (8 รายการ — พังทั้งหน้า!)

##### 🔴 Critical (4 ตัว)

**BUG-REPORTS-001: หน้า Reports Hub พังทั้งหน้า — "This page couldn't load"**
- อธิบายปัญหา: คลิก "ศูนย์รายงาน" → หน้าแสดง error "This page couldn't load"
- Console error: `TypeError: Cannot read properties of undefined (reading 'toLocaleString')`
- ที่ `formatNumber` ใน `src/components/itam/reports/shared.tsx:79`
- เรียกจาก `DevicesReport` ใน `src/components/itam/reports/devices-report.tsx:26`
- เรียกจาก `ReportsHub` ใน `src/components/itam/reports-hub.tsx:345`
- Severity: 🔴 Critical — **Blocker ของทั้งหน้า**

**BUG-REPORTS-002: API ส่ง `summary: {}` เพราะ admin ไม่มี Site ที่ได้รับอนุญาต**
- อธิบายปัญหา: ทุก report group (devices/workorders/stock/meters/approvals) คืน `summary: {}` + `error: "ไม่มี Site ที่ได้รับอนุญาต"`
- สาเหตุ: `buildAuthorizationContext` ทำให้ admin ไม่มี siteScope → API คืน empty summary
- Pattern: **เดียวกับ BUG-WO-002 (fail-closed สำหรับ admin)**
- ผลกระทบ: ทั้ง 5 report groups พังทั้งหมด
- Severity: 🔴 Critical — **Root cause ของ BUG-REPORTS-001**

**BUG-REPORTS-003: ไม่มี error boundary ดัก TypeError**
- อธิบายปัญหา: เมื่อ `summary` เป็น `{}` แล้ว `formatNumber(s.total)` เรียก `undefined.toLocaleString()` → crash ทั้งหน้า (ไม่มี fallback)
- Severity: 🔴 Critical — ควรมี try/catch หรือ default value
- ไฟล์: `src/components/itam/reports/shared.tsx:79`

**BUG-REPORTS-004: `lang=""` attribute หายไปเมื่อ error**
- อธิบายปัญหา: เมื่อหน้าแสดง "This page couldn't load" → `document.documentElement.lang` เป็นค่าว่าง
- ผลกระทบ: screen reader ไม่รู้ภาษา — ละเมิด WCAG 3.1.1 Language of Page
- Severity: 🔴 Critical a11y

##### 🟡 Medium (4 ตัว)

**BUG-REPORTS-005: ไม่มี h2/h3 headings เมื่อ error (a11y)**
- อธิบายปัญหา: หน้า error มีแค่ h1 "This page couldn't load" ไม่มี h2/h3
- Severity: 🟡 Medium a11y

**BUG-REPORTS-006: ไม่มี error recovery — กดปุ่ม "รีเฟรช" ไม่ได้**
- อธิบายปัญหา: หน้า error ไม่มีปุ่ม "ลองอีกครั้ง" หรือ "กลับหน้าหลัก"
- Severity: 🟡 Medium UX

**BUG-REPORTS-007: ไม่ได้ทดสอบ 5 report groups (เพราะพังทั้งหน้า)**
- ไม่สามารถทดสอบ:
  - Devices report (filter + generate + export)
  - Work Orders report
  - Stock report
  - Meters report
  - Approvals report + pending approval flow
- Severity: 🟡 Medium — รอแก้ BUG-REPORTS-001 ก่อน

**BUG-REPORTS-008: ไม่ได้ทดสอบ Mobile + dark mode (เพราะพังทั้งหน้า)**
- Severity: 🟡 Medium — รอแก้ BUG-REPORTS-001 ก่อน

### Pattern Bugs (สำคัญมาก!):

| Pattern | Bugs ทั้งหมด |
|---------|-------------|
| **admin ไม่มีสิทธิ์ (fail-closed)** | BUG-WO-002, BUG-SETTINGS-002, BUG-SETTINGS-004, **BUG-REPORTS-002** |

→ **แก้ root cause 1 ครั้ง (admin role = all permissions) → แก้ 4 bugs พร้อมกัน!**

### Priority สำหรับ ITAM-01:
1. 🔴 **P0 (ด่วนที่สุด):** แก้ admin permission — admin role ต้องมี siteScope = 'all' (จะแก้ BUG-WO-002 + BUG-SETTINGS-002 + BUG-SETTINGS-004 + BUG-REPORTS-002 พร้อมกัน)
2. 🔴 **P0:** BUG-REPORTS-003 — เพิ่ม null check ใน `formatNumber`: `return (value ?? 0).toLocaleString('th-TH')`
3. 🔴 **P0:** BUG-REPORTS-001 — แก้ตาม BUG-REPORTS-002 (admin permission)
4. 🔴 **P0:** BUG-REPORTS-004 — ตั้ง `lang="th"` ใน html ตลอดเวลา (ไม่ใช่แค่ตอน load สำเร็จ)
5. 🟡 **P2:** BUG-REPORTS-005, 006, 007, 008

### Insights:
- **Reports Hub พังเพราะ root cause เดียวกับ Work Orders + Settings** — admin ไม่มี site grants → ทุก report API คืน empty summary → DevicesReport crash
- **แก้ 1 bug (admin permission) → แก้ Reports Hub + Work Orders + Settings User Management + Settings Pending Users ทั้งหมด**
- **Bug สำคัญอีกตัว:** ไม่มี null check ใน formatNumber — ควรเป็น defensive programming (return 0 แทน crash)

### หลักฐาน:
- 📸 `/home/z/my-project/qa-reports/reports-*.png` (2 รูป — error state)
- 📄 Test Report: `/home/z/my-project/qa-reports/QA-REPORTS-001.md`
