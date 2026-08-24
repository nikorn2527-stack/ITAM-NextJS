# Verify-002 + Bug List for ITAM-01 (Round 2)

> **จาก:** QA Team
> **ถึง:** ITAM-01
> **วันที่:** 2026-08-23
> **หลัง:** git pull origin main (latest commit `96372fd`)

---

## 1️⃣ Re-test Results

### ✅ BUG-METER-003 — **PARTIAL FIX** (Device.lastMeter ✅ / prevMeter ❌)

**สิ่งที่แก้ (Verified ✅):**
- `src/app/api/itam/meter-readings/route.ts` เพิ่ม `tx.device.update()` แล้ว — Device.lastMeterBw อัปเดตถูก
- ทดสอบ: POST meterBw=2200 → Device.lastMeterBw=2200 ✅
- ทดสอบ: POST meterBw=2500 → Device.lastMeterBw=2500 ✅

**สิ่งที่ยังพัง (Re-open ❌):**
- `prevMeterBw` ใน MeterReading ยังใช้ค่าจาก INITIAL reading (1000) ไม่ใช่ reading ก่อนหน้า
- ทดสอบ:
  - Reading 1: meterBw=2200, prevMeterBw=1000 (INITIAL), pagesBw=1200 ✅
  - Reading 2: meterBw=2500, prevMeterBw=1000 (**ยังเป็น INITIAL!**), pagesBw=1500 ❌ (ควรเป็น 300)

**Root cause:** `findValidPrevReading()` ใช้ `exclusiveCurrentMonth=true` → skip same-month readings → prev ตกไปที่ INITIAL เสมอ

**วิธีแก้:** แก้ `findValidPrevReading` ให้ใช้ `Device.lastMeterBw` เป็น prev (เพราะ Device.lastMeter อัปเดตถูกแล้วจาก fix ของ ITAM-01)
```ts
// ใน meter-readings/route.ts — เปลี่ยนจาก:
const prev = await findValidPrevReading(assetCode, finalReadingMonth, true)
// เป็น:
const prev = {
  meterBw: device.lastMeterBw,
  meterColor: device.lastMeterColor,
  readingType: 'MONTHLY', // treat as latest
}
```

---

### ⚠️ BUG-KPI-001 — **FIXED** (code) แต่ **STILL SHOWS 0** (เพราะ BUG-WO-002)

**สิ่งที่แก้ (Verified ✅):**
- `src/components/itam/devices-page.tsx:535-570` — KPI computation เป็น case-insensitive แล้ว
- มี alias matching: active='active'|'in use', repair='in repair'|'repair', ฯลฯ
- Code ถูกต้อง 100%

**สิ่งที่ยังพัง (Re-open ❌):**
- KPI ยังแสดง 0 ทั้งหมด (ทั้งหมด0, ใช้งานอยู่0, ส่งซ่อม0, สำรอง0)
- สาเหตุ: API `/api/devices` คืน `devices: []` เพราะ BUG-WO-002 (fail-closed สำหรับ admin)
- DB มี 3 devices ที่ status="Active" จริง แต่ API ไม่ส่งมา → KPI คำนวณจาก [] → 0

**Root cause:** ไม่ใช่ BUG-KPI-001 แต่เป็น BUG-WO-002 ที่ยังไม่แก้ → แก้ BUG-WO-002 ก่อน แล้ว BUG-KPI-001 จะทำงาน

---

## 2️⃣ รายการ 44 Bugs ที่เหลือใน 3 หน้า

### 📋 จัดการอุปกรณ์ (Devices) — 22 bugs

#### 🔴 Critical (6 ตัว)
| Bug ID | คำอธิบายสั้น |
|--------|------------|
| BUG-001 | ปุ่ม "บันทึก" เพิ่มอุปกรณ์ type=submit แต่ form=null → click ไม่ trigger |
| BUG-002 | React Query refetch loop — 20 requests ใน 3 วิ (5× duplicate) |
| BUG-006 | Page size selector พัง — เปลี่ยน 20/50/100 แล้วไม่ refetch |
| BUG-009 | "ดาวน์โหลดเทมเพลต CSV" คลิกไม่เกิดอะไร |
| BUG-010 | "ส่งออก CSV" API ถูกเรียก 200 OK แต่ไม่มีไฟล์ดาวน์โหลด |
| BUG-012 | Global Search พิมพ์แล้วไม่มี API request |

#### 🟠 High (3 ตัว)
| Bug ID | คำอธิบายสั้น |
|--------|------------|
| BUG-011 | Mobile — table กว้าง 894px แต่ container 330px ไม่ scroll แนวนอน |
| BUG-004 | auto-call `/api/itam/devices/cascading?field=building&site=HQ` เมื่อ page load |
| BUG-005 | Page size inconsistency — UI บอก 50 แต่ API ใช้ limit=500 |

#### 🟡 Medium (4 ตัว)
| Bug ID | คำอธิบายสั้น |
|--------|------------|
| BUG-003 | Form inputs ไม่มี id/name (a11y) — label click ไม่ได้, autofill ไม่ทำงาน |
| BUG-007 | Empty filter dropdown ไม่มี empty state message ("ยังไม่มีสาขา") |
| BUG-008 | Dropdown ไม่ปิดด้วย Escape key |
| BUG-013 | Misleading label "Notifications alt+T" แต่จริงๆ เปิด Global Search |

#### 🟢 Low (9 ตัว)
| Bug ID | คำอธิบายสั้น |
|--------|------------|
| BUG-014 | Date pickers มี spinbutton Month/Day/Year = 0 (placeholder ไม่ชัด) |
| BUG-015 | ไม่มี toast หลัง Refresh button |
| BUG-016 | "พิมพ์สติกเกอร์" disabled ไม่มี tooltip บอกเหตุผล |
| BUG-017 | ไม่มี aria-keyshortcuts attributes บน shortcut buttons |
| BUG-018 | Logout button ไม่เห็นใน desktop collapsed sidebar |
| BUG-019 | Dialog ไม่มี focus trap (Tab ออกจาก dialog ได้) |
| BUG-020 | Search box ไม่มี clear (×) button |
| BUG-021 | Filter chip ไม่แสดงค่าที่เลือกแบบ visual badge |
| BUG-022 | ไม่มี skeleton loader ตอนรอ data (white flash) |

---

### 📋 แจ้งซ่อม (Work Orders) — 6 bugs

#### 🔴 Critical (3 ตัว)
| Bug ID | คำอธิบายสั้น |
|--------|------------|
| BUG-WO-001 | Guest WO creation คืน 403 — validateGuestContact ล้มเหลวเพราะ DB ไม่มี contactDirectory |
| BUG-WO-002 | WO list fail-closed สำหรับ admin (non-superadmin) → API คืน [] ทั้งที่ DB มี WO |
| BUG-WO-003 | Search box พิมพ์แล้วไม่ trigger API request |

#### 🟠 High (1 ตัว)
| Bug ID | คำอธิบายสั้น |
|--------|------------|
| BUG-WO-004 | WO list ไม่ refresh หลัง create (cache invalidation) |

#### 🟡 Medium (2 ตัว)
| Bug ID | คำอธิบายสั้น |
|--------|------------|
| BUG-WO-005 | Form inputs ไม่มี name attribute (browser autofill ไม่ทำงาน) |
| BUG-WO-006 | ไม่มี empty state message สำหรับ contactDirectory missing |

---

### 📋 จดมิเตอร์ (Meter) — 16 bugs

#### 🔴 Critical (5 ตัว)
| Bug ID | คำอธิบายสั้น |
|--------|------------|
| BUG-METER-001 | ปุ่ม "บันทึก + ถัดไป" type=submit แต่ form=null (pattern เดียวกับ BUG-001) |
| BUG-METER-002 | บันทึกค่า rollback (ต่ำกว่าเดิม) ได้โดยไม่มี validation |
| BUG-METER-003 | **PARTIAL FIX** — Device.lastMeter ✅ อัปเดต / prevMeter ❌ ยังใช้ INITIAL |
| BUG-METER-004 | Tab "ประวัติมิเตอร์" คลิกไม่ได้ — Tabs Navigation พัง (pattern เดียวกับ Stock/Paper) |
| BUG-METER-005 | ปุ่ม "บันทึก + ถัดไป" ไม่ auto-move ไป device ถัดไป |

#### 🟠 High (4 ตัว)
| Bug ID | คำอธิบายสั้น |
|--------|------------|
| BUG-METER-006 | Search box พิมพ์ "PRT-003" แล้ว list ไม่กรอง |
| BUG-METER-007 | Export CSV คลิกไม่เกิดอะไร (pattern เดียวกับ BUG-009/010) |
| BUG-METER-008 | Refresh button ไม่มี toast (pattern เดียวกับ Dashboard/Paper) |
| BUG-METER-009 | Keyboard shortcuts ไม่ทำงาน (↑↓/Enter/Esc) — help text บอกแต่ใช้ไม่ได้ |

#### 🟡 Medium (4 ตัว)
| Bug ID | คำอธิบายสั้น |
|--------|------------|
| BUG-METER-010 | Number inputs ไม่มี id/aria-label (a11y) |
| BUG-METER-011 | ไม่มี page heading h1 (ละเมิด WCAG 2.4.6) |
| BUG-METER-012 | List items ใช้ `<li>` แต่ไม่ได้อยู่ใน `<ul>` (semantic HTML) |
| BUG-METER-013 | "✓ จดแล้ว" badge ไม่อัปเดตหลังบันทึกใหม่ |

#### 🟢 Low (3 ตัว)
| Bug ID | คำอธิบายสั้น |
|--------|------------|
| BUG-METER-014 | Prev meter display ไม่แสดงใน form — user ไม่รู้ค่าก่อนหน้า |
| BUG-METER-015 | ไม่มี bulk entry mode (multi-device meter entry) |
| BUG-METER-016 | ไม่มี skeleton loader ตอนรอ device list |

---

## 3️⃣ Re-open Bugs (ต้อง re-investigate)

### ❌ BUG-PAPER-003 (Re-open) — "Show month picker" ปุ่มไม่ทำงาน

**สิ่งที่ ITAM-01 แก้:** (จาก commit f067807 รอบก่อน)
- แก้ใน `src/components/itam/itam-paper-analytics.tsx`

**ผล re-test ล่าสุด (หลัง git pull รอบนี้):**
- กดปุ่ม "Show month picker" → calendar/popover ยังไม่เปิด ❌
- ไม่มี console error, ไม่มี network request

**สิ่งที่ต้อง re-investigate:**
1. ตรวจว่า commit ล่าสุดยังมี fix อยู่หรือถูก revert ไป
2. ตรวจ Popover component + onClick handler
3. เช็คว่ามี `<Popover>` wrapper รอบ `<Calendar>` หรือไม่
4. ตรวจ `data-state="open"` หลัง click

---

### ❌ BUG-STK-004 (Partial Re-open) — "ดูรายละเอียด" button ขาด aria-label

**สิ่งที่ ITAM-01 แก้:**
- เพิ่ม aria-label ใน `src/components/itam/stock/stock-inventory.tsx`

**ผล re-test ล่าสุด:**
- 5/6 row buttons มี aria-label ✅ (รับเข้า/เบิกออก/ปรับปรุง/แก้ไข/ลบ)
- 1/6 ยังขาด: "ดูรายละเอียด" (eye icon, lucide-eye) ❌

**สิ่งที่ต้อง re-investigate:**
1. ค้นหาปุ่ม eye icon ใน `stock-inventory.tsx`
2. เพิ่ม `aria-label="ดูรายละเอียด"` ให้ครบทุกปุ่ม

---

## 4️⃣ Pattern Bugs (แก้ root cause → แก้หลาย bugs พร้อมกัน)

| Pattern | Bugs | วิธีแก้ |
|---------|-----|------|
| **Form submit (type=submit + form=null)** | BUG-001 (Devices), BUG-METER-001 (Meter) | เปลี่ยน `type="submit"` → `type="button"` + เพิ่ม `<form>` wrapper (เหมือนที่แก้ใน Stock IN) |
| **Tabs Navigation พัง** | BUG-METER-004 | เพิ่ม `onClick` handler (เหมือนที่แก้ใน Stock + Paper) |
| **ไม่มี toast หลัง Refresh** | BUG-015 (Devices), BUG-METER-008 | เพิ่ม `toast.success()` หลัง refetch (เหมือน Dashboard + Paper) |
| **CSV export พัง** | BUG-009, BUG-010 (Devices), BUG-METER-007 | เพิ่ม blob URL + `<a download>` |
| **Search box ไม่ trigger API** | BUG-012 (Devices), BUG-WO-003, BUG-METER-006 | เพิ่ม `onChange` handler + debounce |
| **fail-closed สำหรับ admin** | BUG-WO-002 (Blocker ของ KPI + WO list) | admin role = เห็นทุก WO (เหมือน superadmin) |

---

## 5️⃣ Priority Order สำหรับ ITAM-01

| ลำดับ | Bug ID | เหตุผล |
|------|--------|------|
| 1 | 🔴🔴 **BUG-METER-003** (re-open partial) | prevMeter ยังใช้ INITIAL → cost ผิด |
| 2 | 🔴 **BUG-WO-002** | Blocker ของ WO workflow + KPI cards (BUG-KPI-001 จะทำงานหลังแก้) |
| 3 | 🔴 **BUG-WO-001** | Guest สร้าง WO ไม่ได้ |
| 4 | 🔴 **BUG-METER-002** | Rollback validation |
| 5 | 🔴 **BUG-001** + **BUG-METER-001** | Form submit pattern (แก้ครั้งเดียวได้ 2 bugs) |
| 6 | 🔴 **BUG-METER-004** | Tabs pattern (เหมือน Stock + Paper ที่แก้แล้ว) |
| 7 | 🔴 **BUG-METER-005** | Bulk entry workflow |
| 8 | 🔴 **BUG-002** | Refetch loop (performance) |
| 9 | 🔴 **BUG-006, BUG-009, BUG-010** | Devices pagination + CSV |
| 10 | 🔴 **BUG-012, BUG-WO-003, BUG-METER-006** | Search pattern (แก้ครั้งเดียวได้ 3 bugs) |
| 11 | 🔴 **BUG-PAPER-003** (re-open) | Month picker — re-investigate |
| 12 | ❌ **BUG-STK-004** (re-open partial) | เพิ่ม aria-label 1 ปุ่ม |

---

## 6️⃣ สรุป

- **44 bugs ที่เหลือ** ใน 3 หน้า (Devices 22 + Work Orders 6 + Meter 16)
- **2 re-open** (BUG-PAPER-003 + BUG-STK-004 partial)
- **1 partial fix** (BUG-METER-003 — Device.lastMeter ✅ / prevMeter ❌)
- **1 dependent fix** (BUG-KPI-001 — code ถูก แต่ติด BUG-WO-002)

**รอ ITAM-01 push commit ใหม่ → QA จะ sync + re-test ต่อ**

---

**ส่งโดย:** QA Team
**วันที่:** 2026-08-23
