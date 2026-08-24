# QA Test Report — หน้า Dashboard

| ฟิลด์ | ค่า |
|------|-----|
| **Document ID** | QA-DASH-001 |
| **Task ID** | QA-002 |
| **Test Date** | 2026-08-23 |
| **Tester** | QA Team |
| **Feature Under Test** | หน้า Dashboard |
| **Test Account** | `demo_admin / demo123` (role=admin) |
| **Environment** | Next.js 16.3.2 dev + SQLite (DB มี STK-0001 + audit log จาก QA-STOCK-001) |
| **Viewports** | 1280×800 (desktop) · 390×844 (mobile) |
| **Pass Rate** | 12/22 = 55% |

---

## Task ID: QA-002
**Agent:** QA Team
**Task:** ทดสอบหน้า Dashboard

### Results:

#### ✅ ผ่าน (12 รายการ)
- ✅ Login + Navigate ไป Dashboard
- ✅ โครงสร้าง header + range selector (4 options: เดือนนี้/30วัน/ไตรมาส/ทั้งหมด)
- ✅ Range selector ทำงาน — API `/api/itam/dashboard?range=quarter` 200
- ✅ Refresh button — trigger refetch
- ✅ Site filter dialog — แสดง "ยังไม่มีข้อมูล" empty state
- ✅ Heatmap dialog — แสดง "ยังไม่มีข้อมูล" empty state
- ✅ Customize widgets panel — toggle on/off + count update (10/10 → 9/10)
- ✅ Customize widgets "รีเซ็ต" — reset กลับ 9/10 → 10/10
- ✅ Quick Actions (จดมิเตอร์/สแกน QR/ค้นหา/วิเคราะห์) — enabled + navigate
- ✅ "จัดการรอบ" dialog — empty state "ยังไม่มีรอบจดมิเตอร์"
- ✅ Notifications popover — badge "2" + รายการ audit log
- ✅ "ไปยังหน้าอุปกรณ์" — navigate to Devices
- ✅ Dark mode toggle — class="dark"
- ✅ Mobile responsive (390px) — body=390, main=390, ไม่มี overflow
- ✅ 11 API endpoints 200 (dashboard, insights, lifecycle, depreciation, warranty, cycles, reports, meter/reminders, settings/org-profile, notifications)

#### ❌ ไม่ผ่าน (10 รายการ)

##### 🔴 Critical (1 ตัว)

**BUG-DASH-001: ปุ่ม "สร้างรอบใหม่" คลิกไม่ตอบ**
- อธิบายปัญหา: คลิกปุ่ม "สร้างรอบใหม่" ใน widget "รอบจดมิเตอร์" แล้วไม่เกิดอะไร — ไม่มี dialog เปิด, ไม่มี error, ไม่มี network request
- ผลกระทบ: user ไม่สามารถสร้าง cycle ใหม่จาก Dashboard ได้ (Blocker)
- ไฟล์น่าจะ: `src/components/itam/dashboard-page.tsx` หรือ `cycle-manage-dialog.tsx`
- Evidence: dashboard-06-create-cycle.png

##### 🟠 High (2 ตัว)

**BUG-DASH-002: PDF button disabled โดยไม่มี tooltip**
- อธิบายปัญหา: ปุ่ม PDF disabled (เพราะไม่มีข้อมูล) แต่ไม่มี tooltip บอกเหตุผล ("ต้องมีข้อมูลใน Dashboard ก่อนถึงจะ export PDF ได้")
- ผลกระทบ: user สับสนว่าทำไมกดไม่ได้
- Severity: 🟠 High

**BUG-DASH-003: widget headers ส่วนใหญ่ไม่มี semantic heading (a11y)**
- อธิบายปัญหา: จาก widget cards ทั้งหมด มีแค่ "🔄 วงจรชีวิตอุปกรณ์" ที่ใช้ `<h3>` — ที่เหลือ (Smart Insights, สถานะ/ประเภท, แนวโน้มกระดาษ, อุปกรณ์ตามสาขา, กิจกรรมล่าสุด, ค่าเสื่อมราคา, รายงาน) ใช้ div/span
- ผลกระทบ: Screen reader ข้าม widget headers ไป — user ที่ใช้ screen reader ไม่รู้ว่ามี widget อะไรบ้าง
- Severity: 🟠 High — ละเมิด WCAG 2.1 SC 1.3.1

##### 🟡 Medium (4 ตัว)

**BUG-DASH-004: ปุ่ม "ปรับแต่ง" และ "ปรับแต่งวิดเจ็ต" ทำงานเหมือนกัน**
- อธิบายปัญหา: มี 2 ปุ่ม "ปรับแต่ง" และ "ปรับแต่งวิดเจ็ต" ใน header ที่เปิด dialog เดียวกัน — ซ้ำซ้อน
- ผลกระทบ: user สับสนว่าปุ่มไหนทำอะไร
- Severity: 🟡 Medium UX

**BUG-DASH-005: ปุ่ม "สร้างรายงาน" / "สร้างรายงานแรก" ไม่ปรากฏใน DOM**
- อธิบายปัญหา: ค้นหาปุ่มใน DOM ไม่เจอ — อาจถูกซ่อนด้วย empty state แต่ไม่มี CTA ทดแทน
- ผลกระทบ: user ไม่สามารถสร้าง report แรกจาก Dashboard ได้
- Severity: 🟡 Medium

**BUG-DASH-006: range selector ไม่ persist ใน localStorage**
- อธิบายปัญหา: เลือก "ไตรมาสนี้" แล้ว reload หน้า → กลับเป็น "เดือนนี้" เสมอ
- ผลกระทบ: user ต้องเลือก range ใหม่ทุกครั้ง
- Severity: 🟡 Medium UX

**BUG-DASH-007: ไม่มี toast หลัง Refresh**
- อธิบายปัญหา: คลิก "รีเฟรช" → API refetch แต่ไม่มี toast บอก "รีเฟรชสำเร็จ"
- ผลกระทบ: no feedback — user ไม่รู้ว่า refresh สำเร็จหรือไม่
- Severity: 🟡 Medium UX

##### 🟢 Low (3 ตัว)

**BUG-DASH-008: ไม่มี loading skeleton ตอนรอ dashboard API**
- อธิบายปัญหา: รอโหลด widget แรก → white flash แทน skeleton
- Severity: 🟢 Low

**BUG-DASH-009: ไม่มี aria-label บน widget cards**
- อธิบายปัญหา: widget cards ใช้ text ธรรมดา ไม่มี `aria-label` หรือ `aria-labelledby`
- Severity: 🟢 Low a11y

**BUG-DASH-010: ไม่มี keyboard shortcut สำหรับ refresh**
- อธิบายปัญหา: ต้องคลิกปุ่มเท่านั้น ไม่รองรับ F5 / Ctrl+R
- Severity: 🟢 Low UX

### Priority สำหรับ ITAM-01:
1. 🔴 **P0:** BUG-DASH-001 — "สร้างรอบใหม่" ใช้ไม่ได้ (Blocker ของ cycle feature)
2. 🟠 **P1:** BUG-DASH-002, BUG-DASH-003 — UX + a11y
3. 🟡 **P2:** BUG-DASH-004, 005, 006, 007 — UX improvements
4. 🟢 **P3:** BUG-DASH-008, 009, 010 — polish

### หลักฐาน:
- 📸 Screenshots: `/home/z/my-project/qa-reports/dashboard-*.png` (11 รูป)
- 📄 Test Report: `/home/z/my-project/qa-reports/QA-DASH-001.md`
