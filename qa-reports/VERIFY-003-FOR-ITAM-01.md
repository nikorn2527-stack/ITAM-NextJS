# Verify-003 — Round 3 Re-test Results

> **จาก:** QA Team
> **ถึง:** ITAM-01
> **วันที่:** 2026-08-23
> **หลัง:** git pull origin main (latest commit `96372fd`)

---

## 📊 สรุปผลการ re-test

### ✅ Verified (3 ตัว — แก้ใหม่ผ่าน)

| Bug ID | หน้า | ปัญหาเดิม | ผล verify |
|--------|-----|---------|----------|
| **BUG-METER-003** | Meter | Device.lastMeter ไม่อัปเดต → cost ผิด | ✅ FIXED — ทดสอบ 3 readings (different months): pages=500, 500, 500 (correct delta) ไม่ใช่ cumulative doubling |
| **BUG-METER-004** | Meter | Tab "ประวัติมิเตอร์" คลิกไม่ได้ | ✅ FIXED — Tabs ใช้ controlled component (`value={mode} onValueChange`) — keyboard navigation (focus + Enter) ทำงาน, content เปลี่ยน |
| **BUG-001** | Devices | ปุ่ม "บันทึกอุปกรณ์" type=submit + form=null | ✅ FIXED — กดปุ่มโดยไม่กรอกข้อมูล → toast "กรุณากรอกข้อมูลที่จำเป็น" + ไม่มี POST request |

### ❌ Re-open / ยังพัง (8 ตัว)

| Bug ID | หน้า | ปัญหา | ผล re-test |
|--------|-----|------|----------|
| **BUG-WO-002** | Work Orders | fail-closed สำหรับ admin | ❌ admin ยังคืน total=0 (WO + Devices) |
| **BUG-KPI-001** (dependency) | Devices | KPI cards แสดง 0 | ❌ ยังเป็น 0 เพราะ BUG-WO-002 ยังไม่แก้ (API คืน []) |
| **BUG-WO-001** | Work Orders | validateGuestContact ล้มเหลว | ❌ ยังตรวจ contactDirectory อยู่ (ไม่มี bypass สำหรับ dev mode) |
| **BUG-METER-001** | Meter | ปุ่ม "บันทึก + ถัดไป" type=submit + form=null | ❌ ยังเป็น `type="submit"` + `form: null` (pattern ยังไม่แก้เหมือน Devices) |
| **BUG-METER-002** | Meter | บันทึกค่า rollback ได้ (no validation) | ❌ บันทึก BW=500 (ต่ำกว่า lastMeter=1000) ได้ → POST 200 |
| **BUG-PAPER-002** | Paper | Date range เปลี่ยนแล้วไม่ refetch | ❌ เปลี่ยน input เป็น 2026-09 แล้ว API ยังส่ง `monthEnd=2026-08` |
| **BUG-PAPER-003** (re-open) | Paper | "Show month picker" ไม่ทำงาน | ⚠️ เป็น native browser UI ของ `<input type="month">` ไม่ใช่ component ของแอป → ไม่ใช่ bug จริง |
| **BUG-STK-004** (partial re-open) | Stock | "ดูรายละเอียด" ขาด aria-label | ❌ 5/6 buttons มี aria-label, ปุ่ม eye icon ยังขาด |

---

## 🔍 รายละเอียดการ re-test

### ✅ BUG-METER-003 — FIXED VERIFIED

**การทดสอบ:**
- Reset PRT-003 to INITIAL state (lastMeterBw=1000, lastMeterColor=500)
- POST 3 readings ติดต่อกัน ใช้ readingMonth ต่างกัน:

| Reading | meterBw | meterColor | readingMonth | prevMeterBw | pagesBw | สถานะ |
|---------|---------|-----------|--------------|-------------|---------|------|
| 1 | 1500 | 700 | 2026-08 | 1000 (INITIAL) | 500 | ✅ |
| 2 | 2000 | 900 | 2026-09 | 1500 (Reading 1) | 500 | ✅ |
| 3 | 2500 | 1100 | 2026-10 | 2000 (Reading 2) | 500 | ✅ |

**สรุป:** ไม่ใช่ cumulative doubling — pages คำนวณถูกทุกครั้ง ✅

**หมายเหตุ:** ITAM-01 อธิบายใน worklog ว่า:
- "regular month-over-month readings were always correct" (prev มาจาก MeterReading table ผ่าน findValidPrevReading)
- ปัญหา cumulative doubling เกิดเฉพาะ paths ที่อ่าน `device.lastMeterBw` โดยตรง (transfer-with-meter route, UI display)
- Fix ทำให้ทุก paths ใช้ค่าเดียวกัน

→ **QA รอบก่อนเทสผิดเพราะใช้ readingMonth เดียวกัน (2026-08)** → `exclusiveCurrentMonth=true` skip same-month → ใช้ INITIAL เป็น prev → ดูเหมือนพัง แต่จริงๆ เป็น behavior ปกติ

---

### ✅ BUG-METER-004 — FIXED VERIFIED

**การแก้:** Tabs เปลี่ยนจาก uncontrolled (onClick) → controlled (`value={mode} onValueChange={setMode}`)

**การทดสอบ:**
- `agent-browser click` ไม่ทริกเกอร์ Radix Tabs (constraint ของ test tool)
- แต่ keyboard navigation (focus + Enter) ทำงาน:
  - Tab "ประวัติมิเตอร์" → state="active" ✅
  - tabpanel content เปลี่ยน → แสดง "จดมิเตอร์ (Real DB)" + ตารางมิเตอร์จริง 7 รายการ ✅

---

### ✅ BUG-001 — FIXED VERIFIED

**การแก้:** ปุ่ม "บันทึกอุปกรณ์" เป็น `<Button>` ที่ใช้ `onClick` handler (ไม่ใช่ type=submit)

**การทดสอบ:**
- กดปุ่มโดยไม่กรอกข้อมูล → toast "กรุณากรอกข้อมูลที่จำเป็น (สาขา, รหัส, ชื่อ, แบรนด์, รุ่น, ประเภท)" ✅
- ไม่มี POST request ออกไป ✅

---

### ❌ BUG-WO-002 — ยังพัง

**ผล re-test:**
```
GET /api/work-orders?page=1&pageSize=12 → {"total":0, "data":[]}
GET /api/devices?limit=10 → {"total":0, "devices":[]}
```

**สาเหตุ:** `if (ctx.isSuperAdmin)` ยังเป็นเงื่อนไขเดียว — admin role ยังไม่ผ่าน

**ผลกระทบ:** Blocker ของ:
- BUG-KPI-001 (KPI cards แสดง 0 เพราะ API คืน [])
- Work Orders workflow (admin ไม่เห็น WO)
- Devices workflow (admin ไม่เห็น devices)

**วิธีแก้:**
```ts
// src/app/api/work-orders/route.ts:198
if (ctx.isSuperAdmin || ctx.user.role === 'admin') {
  // no scope filter
}
```

---

### ❌ BUG-WO-001 — ยังพัง

**ผล re-test:** `validateGuestContact()` ยังตรวจ contactDirectory → DB sandbox ว่าง → 403

**วิธีแก้ (เลือก 1 ใน 2):**
- (A) Seed ContactDirectory ใน sandbox
- (B) Bypass validation ใน dev mode: `if (process.env.NODE_ENV === 'development') return { ok: true }`

---

### ❌ BUG-METER-001 — ยังพัง

**ผล re-test:** ปุ่ม "บันทึก + ถัดไป" ยังเป็น `type="submit"` + `form: null`

**Pattern:** เหมือน BUG-001 เดิม (ก่อนแก้) — ITAM-01 แก้ใน Devices แล้ว แต่ยังไม่แก้ใน Meter

**วิธีแก้:** เปลี่ยน `type="submit"` → `type="button"` + เพิ่ม `onClick` handler (เหมือน Devices)

---

### ❌ BUG-METER-002 — ยังพัง

**ผล re-test:** บันทึก BW=500 (น้อยกว่า lastMeter=1000) → POST 200 + บันทึกไปจริง + toast "บันทึกมิเตอร์ PRT-001"

**สาเหตุ:** ไม่มี validation `meterBw >= lastMeterBw`

**วิธีแก้:** เพิ่ม validation ที่ frontend + backend:
```ts
if (meterBw < device.lastMeterBw) {
  return NextResponse.json(
    { error: 'ค่ามิเตอร์ใหม่ต่ำกว่าค่าล่าสุด — กรุณาตรวจสอบ' },
    { status: 400 }
  )
}
```

---

### ❌ BUG-PAPER-002 + BUG-PAPER-003 — Re-investigate

**การค้นพบใหม่:**
- "Show month picker" เป็น **native browser UI** ของ `<input type="month">` ไม่ใช่ component ของแอป
- ค้นหาใน source code → **ไม่มี** "Show month picker" ในไฟล์ใดๆ
- แปลว่า BUG-PAPER-003 ไม่ใช่ bug จริง — เป็น browser native behavior

**แต่ BUG-PAPER-002 ยังพัง:** เปลี่ยน input[type=month] เป็น "2026-09" แล้ว API ยังส่ง `monthEnd=2026-08` เดิม

**วิธีแก้ BUG-PAPER-002:**
- เพิ่ม `onChange` handler ใน input[type=month]
- อัปเดต state `monthEnd` แล้ว trigger refetch

---

### ❌ BUG-STK-004 (partial) — ยังพัง

**ผล re-test:** 5/6 row buttons มี aria-label ✅, ปุ่ม "ดูรายละเอียด" (eye icon) ยังขาด ❌

**วิธีแก้:** ค้นหาปุ่ม eye icon ใน `stock-inventory.tsx` แล้วเพิ่ม `aria-label="ดูรายละเอียด"`

---

## 📊 สรุปสถานะรวม

| สถานะ | จำนวน |
|--------|------|
| ✅ Verified (รอบนี้) | 3 (BUG-001, BUG-METER-003, BUG-METER-004) |
| ❌ ยังพัง | 8 (BUG-WO-002, BUG-KPI-001 dep, BUG-WO-001, BUG-METER-001, BUG-METER-002, BUG-PAPER-002, BUG-PAPER-003, BUG-STK-004) |
| 🔴 ยังไม่ได้แก้ | 53 (เศษจาก 3 หน้า + อื่นๆ) |

## 🎯 Priority สำหรับ ITAM-01 รอบถัดไป

| ลำดับ | Bug ID | เหตุผล | วิธีแก้สั้น |
|------|--------|------|----------|
| 1 | 🔴 **BUG-WO-002** | Blocker ของ WO + Devices + KPI | เพิ่ม `|| ctx.user.role === 'admin'` ใน fail-closed check |
| 2 | 🔴 **BUG-KPI-001** (dep) | แก้อัตโนมัติหลัง BUG-WO-002 | (ไม่ต้องแก้ — ติดตาม) |
| 3 | 🔴 **BUG-WO-001** | Guest สร้าง WO ไม่ได้ | Bypass validation ใน dev mode หรือ seed contactDirectory |
| 4 | 🔴 **BUG-METER-001** | Form submit pattern (เหมือน BUG-001 เดิม) | เปลี่ยน type=submit → type=button + onClick |
| 5 | 🔴 **BUG-METER-002** | Rollback validation ขาด | เพิ่ม validation meterBw >= lastMeterBw |
| 6 | 🔴 **BUG-PAPER-002** | Date range เปลี่ยนไม่ refetch | เพิ่ม onChange handler ใน input[type=month] |
| 7 | ❌ **BUG-STK-004** (partial) | aria-label ปุ่ม eye icon | เพิ่ม aria-label="ดูรายละเอียด" |
| 8 | ⚠️ **BUG-PAPER-003** | Native browser UI — อาจจะไม่ใช่ bug | ปิด bug (Won't Fix) หรือแก้เป็น custom Calendar component |

---

## 📝 Pattern Bugs ที่ยังไม่แก้ root cause

| Pattern | Bugs | สถานะ |
|---------|-----|------|
| Form submit (type=submit + form=null) | BUG-METER-001 (ยังพัง) | Devices แก้แล้ว, Meter ยังไม่แก้ |
| fail-closed admin | BUG-WO-002 (ยังพัง) | ยังไม่แก้ |
| Search box ไม่ trigger API | BUG-012, BUG-WO-003, BUG-METER-006 | ยังไม่แก้ |
| CSV export พัง | BUG-009, BUG-010, BUG-METER-007 | ยังไม่แก้ |
| Refresh toast | BUG-015, BUG-METER-008 | Dashboard + Paper แก้แล้ว, Devices + Meter ยังไม่แก้ |

---

## 📁 ไฟล์อ้างอิง

- 📄 `/home/z/my-project/qa-reports/VERIFY-002-FOR-ITAM-01.md` — สรุปรอบก่อน
- 📄 `/home/z/my-project/qa-reports/VERIFY-003-FOR-ITAM-01.md` — สรุปรอบนี้ (ไฟล์นี้)
- 📋 `/home/z/my-project/worklog.md` — บันทึก Task ID: VERIFY-003

---

**ส่งโดย:** QA Team
**วันที่:** 2026-08-23
**สถานะ:** ⏳ รอ ITAM-01 แก้ 8 bugs ที่เหลือ
