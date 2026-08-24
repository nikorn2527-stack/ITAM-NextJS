# QA Test Report — หน้า Paper Analytics (วิเคราะห์กระดาษ)

| ฟิลด์ | ค่า |
|------|-----|
| **Document ID** | QA-PAPER-001 |
| **Task ID** | QA-003 |
| **Test Date** | 2026-08-23 |
| **Tester** | QA Team |
| **Feature Under Test** | หน้า Paper Analytics (ITAM กระดาษ) |
| **Test Account** | `demo_admin / demo123` (role=admin) |
| **Environment** | Next.js 16.3.2 dev + SQLite (DB มี STK-0001 + audit log) |
| **Viewports** | 1280×800 · 390×844 |
| **Pass Rate** | 7/15 = 47% |

---

## Task ID: QA-003
**Agent:** QA Team
**Task:** ทดสอบหน้า Paper Analytics

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

### Insights สำหรับ ITAM-01:
- **Pattern BUG ระบบ:** Tabs Navigation พังทั้งหมด — พบใน Stock (BUG-STK-001) และ Paper Analytics (BUG-PAPER-001) → น่าจะเป็น root cause เดียวกัน
- **Pattern BUG ระบบ:** "ไม่มี toast หลัง Refresh" — พบในทุกหน้า (Devices, Stock, Dashboard, Paper Analytics)
- **Pattern BUG ระบบ:** "widget headers ไม่มี semantic heading" — พบใน Dashboard และ Paper Analytics
- **Pattern BUG ระบบ:** "Site filter ไม่มี empty state" — พบใน Devices และ Paper Analytics
- **PDF Preview UX:** ไม่มีปุ่มปิด + ไม่ปิดด้วย Escape — ทำให้ user ติดอยู่ ต้องแก้ด่วน

### หลักฐาน:
- 📸 Screenshots: `/home/z/my-project/qa-reports/paper-*.png` (10 รูป)
- 📄 Test Report: `/home/z/my-project/qa-reports/QA-PAPER-001.md`
