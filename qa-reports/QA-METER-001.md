# QA Test Report — หน้าจดมิเตอร์ (Meter Reading Page)

| ฟิลด์ | ค่า |
|------|-----|
| **Document ID** | QA-METER-001 |
| **Task ID** | QA-005 |
| **Test Date** | 2026-08-23 |
| **Tester** | QA Team |
| **Feature Under Test** | หน้าจดมิเตอร์ (Meter Reading) — **หัวใจของระบบเพราะเชื่อม lifecycle ทุกชนิด** |
| **Test Account** | `demo_admin / demo123` (role=admin) |
| **Environment** | Next.js 16.3.2 dev + SQLite (DB seed: 3 devices + INITIAL readings + active cycle) |
| **Viewports** | 1280×800 · 390×844 |
| **Pass Rate** | 9/16 = 56% — **❌ ไม่ผ่าน** |

---

## Task ID: QA-005
**Agent:** QA Team
**Task:** ทดสอบหน้าจดมิเตอร์ (Meter Reading)

### 📝 Context
จดมิเตอร์เป็นจุดสำคัญที่สุดเพราะ:
- เชื่อมโยงกับ lifecycle ของอุปกรณ์ทั้งหมด (ติดตั้ง INITIAL / ถอน FINAL / ย้าย TRANSFER_SITE / จำหน่าย CHECKOUT)
- ข้อมูลที่บันทึกจะถูกใช้ใน Paper Analytics, Reports, Monthly Report
- ถ้าคำนวณ pages ผิด → cost analytics จะผิดตามทั้งหมด
- ใช้คำนวณค่ากระดาษ (฿) ที่จะเรียกเก็บจากแต่ละสาขา

### Results:

#### ✅ ผ่าน (9 รายการ)
- ✅ Login + Navigate ไปหน้าจดมิเตอร์
- ✅ Tabs 2 ตัวแสดงครบ (จดมิเตอร์ + ประวัติมิเตอร์)
- ✅ Device list แสดง 3 เครื่อง + badge "✓ จดแล้ว" + ข้อมูลล่าสุด (BW+สี)
- ✅ Device selection — click เลือก PRT-001 + border-orange highlight
- ✅ Form: BW + Color + หมายเหตุ + บันทึก+ถัดไป
- ✅ **บันทึกมิเตอร์สำเร็จ** — POST `/api/itam/meter-readings` 201 + toast "บันทึกมิเตอร์ PRT-001 · +700 แผ่น" (1500-1000=500 BW + 700-500=200 Color = 700 รวม)
- ✅ Notification system — ส่ง Telegram + LINE OA (log only) หลังบันทึก
- ✅ "จัดการรอบ" dialog — แสดง active cycle + เหลือเวลา 8 วัน + ปุ่ม จบรอบ/ยกเลิก/สร้างรอบใหม่
- ✅ **Transfer-with-meter API ทำงาน** (atomic transaction):
  - Device.site: Udon Thani Test → BKK
  - Device.lastMeterBw: 1000 → 1100 ✅ (อัปเดต!)
  - Device.lastMeterColor: 500 → 600 ✅
  - MeterReading created (eventType=TRANSFER_SITE)
  - DeviceTransfer history created
  - assetSiteCode: BKK-00001
- ✅ Dark mode toggle
- ✅ Mobile responsive (390px) — ไม่มี overflow

#### ❌ ไม่ผ่าน (16 รายการ)

##### 🔴 Critical (5 ตัว — กระทบ financial/cost calculations)

**BUG-METER-001: ปุ่ม "บันทึก + ถัดไป" เป็น type=submit แต่ไม่ได้อยู่ใน `<form>` → click ผ่าน UI ไม่ทำงาน**
- อธิบายปัญหา: คลิกปุ่มผ่าน agent-browser ไม่ทริกเกอร์ submit — ต้องใช้ JS `.click()` ถึงจะทำงาน
- สาเหตุ: pattern เดียวกับ BUG-001 (Devices) + BUG-STK-003 (Stock IN) — `type="submit"` แต่ `form: null`
- ผลกระทบ: user กดปุ่มจริงใน browser อาจจะทำงาน (ผ่าน Enter) แต่ UX แปลก + keyboard navigation พัง
- Severity: 🔴 Critical (pattern bug ระบบ)

**BUG-METER-002: บันทึกค่า rollback (ต่ำกว่าเดิม) ได้โดยไม่มี validation error**
- อธิบายปัญหา: กรอก BW=500 (น้อยกว่า lastMeterBw=1000) → กดบันทึก → บันทึกได้โดยไม่มี error!
- สาเหตุ: ไม่มี validation `meterBw >= lastMeterBw` ที่ frontend หรือ backend
- ผลกระทบ:
  1. ข้อมูลผิดพลาด — meter ลดลง (เป็นไปไม่ได้ในความเป็นจริง)
  2. pages = 0 (clamped) แทนที่จะเป็นค่าติดลบ → cost หาย
  3. ถ้า user พิมพ์ผิด → ไม่มี warning ให้แก้
- Severity: 🔴 Critical — Blocker ของ data integrity

**BUG-METER-003: Device.lastMeterBw/lastMeterColor ไม่อัปเดตหลังจดมิเตอร์ปกติ**
- อธิบายปัญหา: หลังจด meter สำเร็จ → MeterReading ถูกสร้าง + pages คำนวณถูก แต่ **Device.lastMeterBw ยังเป็นค่าเดิม** (1000 ไม่ใช่ 1500)
- ผลกระทบ:
  1. การจดครั้งต่อไป prevMeter ผิด → pages ผิด
  2. **การจดครั้งที่ 2 ใช้ prevMeter = 1000 (INITIAL) ไม่ใช่ prevMeter = 1500 (จากครั้งก่อน)**
  3. pages นับรวมตั้งแต่ INITIAL ทุกครั้ง → pages เพิ่มขึ้นเรื่อยๆ แม้จดติดต่อกัน → **cost analytics ผิดทั้งหมด**
- **เปรียบเทียบ:** Transfer-with-meter endpoint อัปเดต Device.lastMeter แล้ว — แสดงว่ามี 2 code paths ที่ต่างกัน
- Severity: 🔴 Critical — Blocker ของทุก report ที่ใช้ pages

**BUG-METER-004: Tab "ประวัติมิเตอร์" คลิกไม่ได้ — Tabs Navigation พัง**
- อธิบายปัญหา: คลิก tab "ประวัติมิเตอร์" → aria-selected ยังเป็น "จดมิเตอร์" เสมอ
- ผลกระทบ: user ไม่สามารถดูประวัติมิเตอร์ย้อนหลังได้ผ่าน tab
- Pattern: เดียวกับ BUG-STK-001 (Stock) + BUG-PAPER-001 (Paper) — แต่ Stock และ Paper แก้แล้วใน VERIFY-001
- Severity: 🔴 Critical — Blocker ของ history view

**BUG-METER-005: ปุ่ม "บันทึก + ถัดไป" ไม่ auto-move ไป device ถัดไป**
- อธิบายปัญหา: หลังบันทึก PRT-001 → device selection ไม่ย้ายไป PRT-002 อัตโนมัติ (ตามชื่อปุ่ม "บันทึก + **ถัดไป**")
- ผลกระทบ: user ต้อง click PRT-002 เอง → workflow ช้าลงสำหรับ bulk entry
- Severity: 🔴 Critical — Bulk entry workflow ใช้ไม่ได้

##### 🟠 High (4 ตัว)

**BUG-METER-006: Search box พิมพ์ "PRT-003" แล้ว list ไม่กรอง**
- อธิบายปัญหา: พิมพ์ "PRT-003" → list ยังแสดง 3 รายการ (ไม่ filter)
- ผลกระทบ: search feature ใช้ไม่ได้
- Severity: 🟠 High — pattern เดียวกับ BUG-WO-003 (Work Orders)

**BUG-METER-007: Export CSV คลิกแล้วไม่เกิดอะไร**
- อธิบายปัญหา: คลิก "Export CSV" → ไม่มีไฟล์ดาวน์โหลด, ไม่มี toast, ไม่มี network request
- ผลกระทบ: export ข้อมูล meter ไม่ได้
- Pattern: เดียวกับ BUG-009, BUG-010 (Devices) — CSV export พังทุกหน้า
- Severity: 🟠 High

**BUG-METER-008: Refresh button ไม่มี toast**
- อธิบายปัญหา: คลิก "รีเฟรช" → API refetch แต่ไม่มี toast "รีเฟรชสำเร็จ"
- Pattern: เดียวกับทุกหน้าก่อนแก้ (Dashboard + Paper แก้แล้ว แต่ Meter ยังไม่แก้)
- Severity: 🟠 High UX

**BUG-METER-009: Keyboard shortcuts ไม่ทำงาน (↑↓ / Enter / Esc)**
- อธิบายปัญหา: help text บอก "↑↓ เลือกเครื่อง · Enter ไปที่ช่องกรอก · Esc ล้าง" แต่:
  - กด ArrowDown → device selection ไม่เลื่อน
  - กด Esc → ปิด page ไปเลย (close dialog แทนที่จะ clear input)
- ผลกระทบ: keyboard-driven workflow ใช้ไม่ได้ — ต้อง click เองทุกครั้ง
- Severity: 🟠 High — UX แย่สำหรับ power users

##### 🟡 Medium (4 ตัว)

**BUG-METER-010: Number inputs ไม่มี id และ aria-label**
- อธิบายปัญหา: ทั้ง BW และ Color inputs ไม่มี `id`, `aria-label`, `name` → screen reader ไม่รู้ว่า input ไหนคือ BW หรือ Color
- ผลกระทบ: a11y ต่ำ — ละเมิด WCAG 2.1 SC 1.3.1, SC 4.1.2
- Severity: 🟡 Medium a11y

**BUG-METER-011: ไม่มี page heading h1 (a11y)**
- อธิบายปัญหา: ไม่มี h1 ในหน้า Meter (มีแค่ h2 "จัดการรอบจดมิเตอร์" ใน dialog)
- ผลกระทบ: ละเมิด WCAG 2.4.6 Page Bypass — screen reader ไม่รู้หน้าไหน
- Severity: 🟡 Medium a11y

**BUG-METER-012: List items ใช้ `<li>` แต่ไม่ได้อยู่ใน `<ul>` (semantic HTML)**
- อธิบายปัญหา: list items ใช้ `<li>` แต่ไม่มี parent `<ul>` หรือ `<ol>`
- ผลกระทบ: screen reader ไม่ประกาศ "list 3 items"
- Severity: 🟡 Medium a11y

**BUG-METER-013: "✓ จดแล้ว" badge ไม่อัปเดตหลังบันทึกใหม่**
- อธิบายปัญหา: หลังบันทึก PRT-001 รอบใหม่ → badge ยังแสดง "✓ จดแล้ว" (เดิม) แทนที่จะเปลี่ยนสถานะ
- ผลกระทบ: user ไม่รู้ว่าจดแล้วสำหรับรอบนี้หรือยัง
- Severity: 🟡 Medium UX

##### 🟢 Low (3 ตัว)

- **BUG-METER-014:** Prev meter display ไม่แสดงใน form — user ไม่รู้ค่าก่อนหน้าที่จะเทียบ
- **BUG-METER-015:** ไม่มี bulk entry mode (multi-device meter entry) — ต้องจดทีละเครื่อง
- **BUG-METER-016:** ไม่มี skeleton loader ตอนรอ device list

### ไม่ได้ทดสอบ (เพราะ BUG-METER-004 Tabs พัง):
- ❌ ประวัติมิเตอร์ filter + search + export
- ❌ Meter readings by cycle report
- ❌ Per-device reading history detail

### Priority สำหรับ ITAM-01:
1. 🔴 **P0 (ด่วนที่สุด — กระทบ cost):** BUG-METER-003 — แก้ Device.lastMeter อัปเดตหลังจด meter ปกติ (เหมือน transfer-with-meter endpoint ทำถูกแล้ว)
2. 🔴 **P0 (data integrity):** BUG-METER-002 — เพิ่ม validation `meterBw >= lastMeterBw` ที่ frontend + backend
3. 🔴 **P0:** BUG-METER-004 — แก้ Tabs navigation (pattern เดียวกับ Stock + Paper ที่แก้แล้ว)
4. 🔴 **P0:** BUG-METER-005 — auto-move ไป device ถัดไปหลังบันทึก (เพื่อ bulk entry workflow)
5. 🔴 **P0:** BUG-METER-001 — เปลี่ยน type=submit → type=button + เพิ่ม form wrapper (pattern เดียวกับ BUG-001)
6. 🟠 **P1:** BUG-METER-006, BUG-METER-007, BUG-METER-008, BUG-METER-009
7. 🟡 **P2:** BUG-METER-010, BUG-METER-011, BUG-METER-012, BUG-METER-013

### 💡 Insights สำหรับ ITAM-01:
- **ที่สำคัญที่สุด:** BUG-METER-003 — เปรียบเทียบ code path ระหว่าง `meter-readings` endpoint ปกติ vs `transfer-with-meter` endpoint — ตัวหลังอัปเดต Device.lastMeter แล้ว แต่ตัวแรกไม่ → copy logic จาก transfer-with-meter มาใช้
- **Pattern BUG ระบบที่ยังไม่แก้:** Tabs navigation (BUG-METER-004), CSV export (BUG-METER-007), Refresh toast (BUG-METER-008) — ITAM-01 แก้ใน Stock + Dashboard + Paper แล้ว แต่ยังไม่ได้แก้ใน Meter → ใช้วิธีเดียวกัน
- **Form a11y:** Meter form ไม่มี id/name/aria-label (เหมือน Devices page เดิม ก่อนแก้) → ทำให้เหมือน Stock form ที่มี id unique
- **Atomic transaction:** Transfer-with-meter ทำงานถูกต้อง — ใช้เป็นต้นแบบสำหรับ meter-readings endpoint ปกติ

### 📁 หลักฐาน:
- 📸 `/home/z/my-project/qa-reports/meter-*.png` (3 รูป)
- 📄 Test Report: `/home/z/my-project/qa-reports/QA-METER-001.md`
- 🗄️ DB verification: ใช้ `bun -e` ตรวจ MeterReading + Device tables โดยตรง
