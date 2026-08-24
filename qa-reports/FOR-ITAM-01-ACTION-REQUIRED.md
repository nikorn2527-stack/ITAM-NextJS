# 📋 ITAM-01 Action Required — Bug Fix Summary (Round 2)

> **ส่งให้ ITAM-01** เพื่อดำเนินการแก้ไขต่อ
> จาก: QA Team
> วันที่: 2026-08-23
> สถานะ: รอ ITAM-01 แก้ไข

---

## 📊 สรุปสถานะปัจจุบัน

| รายการ | จำนวน |
|--------|------|
| ✅ ส่งให้ ITAM-01 ทั้งหมด | **78 bugs** (6 หน้า) |
| ✅ ITAM-01 แก้แล้ว (Stock + Dashboard + Paper) | **17 ตัว** |
| ✅ Verified (ผ่าน re-test) | **14 ตัว** |
| ❌ Re-open (แก้แล้วยังพัง) | **2 ตัว** |
| 🔴 **ยังไม่ได้แก้** | **61 ตัว** |

---

## 🚨 รายการ Bug ที่ต้องแก้ (61 ตัว + 2 re-open = 63 ตัว)

### 🔴 P0 — Critical (ต้องแก้ก่อน production cutover)

#### 1. จัดการอุปกรณ์ (Devices) — 6 Critical + 3 High

| Bug ID | Severity | ปัญหา | ไฟล์ที่เกี่ยวข้อง |
|--------|---------|------|---------------|
| **BUG-001** | 🔴 Critical | ปุ่ม "บันทึก" ใน form เพิ่มอุปกรณ์ไม่ทำงาน — `type="submit"` แต่ `form: null` | `src/components/itam/devices-page.tsx` |
| **BUG-002** | 🟠 High | React Query refetch loop — 20 requests ใน 3 วิ (5× duplicate) | `src/components/itam/devices-page.tsx` (useQuery) |
| **BUG-006** | 🔴 Critical | Page size selector พัง — เปลี่ยนค่า UI แล้วไม่ refetch | `src/components/itam/devices-page.tsx` |
| **BUG-009** | 🔴 Critical | "ดาวน์โหลดเทมเพลต CSV" ไม่ทำงาน | `src/components/itam/csv-import-dialog.tsx` |
| **BUG-010** | 🔴 Critical | "ส่งออก CSV" ไม่ดาวน์โหลดไฟล์ | `src/components/itam/devices-page.tsx` |
| **BUG-012** | 🔴 Critical | Global Search ไม่ทำงาน | `src/components/itam/global-search.tsx` |
| BUG-004 | 🟡 Medium | Unwanted cascading request เมื่อ page load | `src/components/itam/cascading-dropdown.tsx` |
| BUG-005 | 🟡 Medium | Page size inconsistency (UI=50, API=500) | `src/components/itam/devices-page.tsx` |
| BUG-011 | 🟠 High | Mobile — table ไม่ scroll แนวนอน | `src/components/itam/devices-page.tsx` |

#### 2. แจ้งซ่อม (Work Orders) — 3 Critical + 1 High

| Bug ID | Severity | ปัญหา | ไฟล์ที่เกี่ยวข้อง |
|--------|---------|------|---------------|
| **BUG-WO-001** | 🔴 Critical | Guest WO creation คืน 403 — `validateGuestContact()` ล้มเหลวเพราะ DB ไม่มี contactDirectory | `src/app/api/work-orders/route.ts:481-497` |
| **BUG-WO-002** | 🔴 Critical | WO list ไม่แสดง — fail-closed สำหรับ admin (non-superadmin) | `src/app/api/work-orders/route.ts:206-216` |
| **BUG-WO-003** | 🔴 Critical | Search box พิมพ์แล้วไม่ trigger API request | `src/components/itam/itam-work-orders.tsx` |
| BUG-WO-004 | 🟠 High | WO list ไม่ refresh หลัง create (cache invalidation) | `src/components/itam/itam-work-orders.tsx` |

#### 3. จดมิเตอร์ (Meter) — 5 Critical + 4 High

| Bug ID | Severity | ปัญหา | ไฟล์ที่เกี่ยวข้อง |
|--------|---------|------|---------------|
| **BUG-METER-001** | 🔴 Critical | ปุ่ม "บันทึก + ถัดไป" type=submit แต่ form: null | `src/components/itam/itam-meter-unified.tsx` |
| **BUG-METER-002** | 🔴 Critical | บันทึกค่า rollback (ต่ำกว่าเดิม) ได้โดยไม่มี validation | `src/app/api/itam/meter-readings/route.ts` |
| 🔴🔴 **BUG-METER-003** | 🔴 **CRITICAL!** | **Device.lastMeter ไม่อัปเดต → cost ผิด 3-9× (เห็นใน production: 945,298 แทนที่จะเป็น ~1600)** | `src/app/api/itam/meter-readings/route.ts` |
| **BUG-METER-004** | 🔴 Critical | Tab "ประวัติมิเตอร์" คลิกไม่ได้ — Tabs Navigation พัง | `src/components/itam/itam-meter-unified.tsx` |
| **BUG-METER-005** | 🔴 Critical | ปุ่ม "บันทึก + ถัดไป" ไม่ auto-move ไป device ถัดไป | `src/components/itam/itam-meter-unified.tsx` |
| BUG-METER-006 | 🟠 High | Search box พิมพ์แล้ว list ไม่กรอง | `src/components/itam/itam-meter-unified.tsx` |
| BUG-METER-007 | 🟠 High | Export CSV คลิกไม่เกิดอะไร | `src/components/itam/itam-meter-unified.tsx` |
| BUG-METER-008 | 🟠 High | Refresh button ไม่มี toast | `src/components/itam/itam-meter-unified.tsx` |
| BUG-METER-009 | 🟠 High | Keyboard shortcuts ไม่ทำงาน (↑↓/Enter/Esc) | `src/components/itam/itam-meter-unified.tsx` |

#### 4. Re-open (แก้แล้วยังพัง) — 2 ตัว

| Bug ID | หน้า | ปัญหา | สิ่งที่ต้องทำ |
|--------|-----|------|----------|
| **BUG-PAPER-003** | Paper | "Show month picker" ปุ่มไม่ทำงาน | เช็ค onClick handler / Popover state ใน `itam-paper-analytics.tsx` |
| **BUG-STK-004** (partial) | Stock | 5/6 row buttons มี aria-label แล้ว แต่ "ดูรายละเอียด" (eye icon) ยังไม่มี | เพิ่ม `aria-label="ดูรายละเอียด"` ใน `stock-inventory.tsx` |

---

### 🟡 P1 — Medium (ควรแก้ก่อน Go-Live)

#### Devices (4 ตัว)
| Bug ID | ปัญหา |
|--------|------|
| BUG-003 | Form inputs ไม่มี id/name (a11y) |
| BUG-007 | Empty filter dropdown ไม่มี empty state |
| BUG-008 | Dropdown ไม่ปิดด้วย Escape |
| BUG-013 | Misleading label "Notifications alt+T" |

#### Work Orders (2 ตัว)
| Bug ID | ปัญหา |
|--------|------|
| BUG-WO-005 | Form inputs ไม่มี name attribute |
| BUG-WO-006 | ไม่มี empty state message สำหรับ contactDirectory missing |

#### Meter (4 ตัว)
| Bug ID | ปัญหา |
|--------|------|
| BUG-METER-010 | Number inputs ไม่มี id/aria-label |
| BUG-METER-011 | ไม่มี page heading h1 |
| BUG-METER-012 | List items ใช้ `<li>` แต่ไม่ได้อยู่ใน `<ul>` |
| BUG-METER-013 | "✓ จดแล้ว" badge ไม่อัปเดต |

---

### 🟢 P2 — Low (cosmetic/polish)

#### Devices (9 ตัว)
BUG-014 ถึง BUG-022 — ดูใน `QA-DEVICES-001.md`

#### Stock (6 ตัว)
BUG-STK-007 ถึง BUG-STK-016 (ยกเว้นที่แก้แล้ว) — ดูใน `QA-STOCK-001.md`

#### Dashboard (3 ตัว)
BUG-DASH-008, BUG-DASH-009, BUG-DASH-010 — ดูใน `QA-DASH-001.md`

#### Meter (3 ตัว)
BUG-METER-014, BUG-METER-015, BUG-METER-016 — ดูใน `QA-METER-001.md`

---

## 🎯 Pattern Bugs — แก้ root cause แก้ครั้งเดียวได้หลาย bugs

| Pattern | Bugs ที่เกี่ยวข้อง | วิธีแก้ |
|---------|---------------|------|
| **Form submit (type=submit + form=null)** | BUG-001 (Devices), BUG-METER-001 (Meter) | เปลี่ยน `type="submit"` → `type="button"` + เพิ่ม `<form>` wrapper (เหมือนที่แก้ใน Stock IN) |
| **Tabs Navigation พัง** | BUG-METER-004 (Meter) | เพิ่ม `onClick` handler ใน tab (เหมือนที่แก้ใน Stock + Paper) |
| **ไม่มี toast หลัง Refresh** | BUG-METER-008 (Meter), BUG-015 (Devices) | เพิ่ม `toast.success()` หลัง refetch (เหมือนที่แก้ใน Dashboard + Paper) |
| **CSV export พัง** | BUG-009, BUG-010 (Devices), BUG-METER-007 (Meter) | เพิ่ม blob URL + `<a download>` (เหมือนที่ควรจะเป็น) |
| **Search box พิมพ์ไม่ trigger API** | BUG-WO-003 (WO), BUG-METER-006 (Meter), BUG-012 (Devices Global Search) | เพิ่ม `onChange` handler + debounce |
| **widget headers ไม่มี h3** | BUG-METER-011 (Meter), BUG-DASH-003 (Dashboard — แก้แล้ว) | เปลี่ยน `<div>` → `<h3>` (เหมือนที่แก้ใน card.tsx) |

→ **แก้ pattern 6 ตัวนี้ → ลด bug ได้ ~15 ตัวพร้อมกัน**

---

## 🔥 PRIORITY สูงสุด — แก้ก่อนอื่นอื่น

### #1: BUG-METER-003 (Critical — กระทบ cost ทั้งระบบ)

**ปัญหา:** Device.lastMeterBw/lastMeterColor ไม่อัปเดตหลังจดมิเตอร์ปกติ
- ผล: pages นับรวมตั้งแต่ INITIAL ทุกครั้ง → cost ผิด 3-9×
- Evidence: production แสดง 945,298 แทนที่จะเป็น ~1,600

**วิธีแก้:**
```ts
// ใน src/app/api/itam/meter-readings/route.ts
// หลังบรรทัด await db.meterReading.create({...})
// เพิ่ม:
await db.device.update({
  where: { id: device.id },
  data: {
    lastMeterBw: meterBw,
    lastMeterColor: meterColor,
  },
});
```

**ต้นแบบที่ทำถูกแล้ว:** `src/app/api/devices/[id]/transfer-with-meter/route.ts` — copy logic มาใช้

---

### #2: BUG-WO-002 (Critical — Blocker ของ WO workflow)

**ปัญหา:** fail-closed policy ทำให้ demo_admin (role=admin) ไม่เห็น WO ที่ตนเองสร้าง

**วิธีแก้:**
```ts
// ใน src/app/api/work-orders/route.ts:206-216
// เพิ่มเงื่อนไข: admin role = เห็นทุก WO (เหมือน superadmin)
if (ctx.isSuperAdmin || ctx.user.role === 'admin') {
  // no scope filter
}
```

---

### #3: BUG-WO-001 (Critical — Guest ไม่สามารถสร้าง WO)

**ปัญหา:** `validateGuestContact()` ล้มเหลวเพราะ ContactDirectory table ว่าง

**วิธีแก้ (เลือก 1 ใน 2):**
- **(A) Seed ContactDirectory** — เพิ่ม demo entries สำหรับ testing
- **(B) Bypass validation ใน dev mode** — `if (process.env.NODE_ENV === 'development') skip validation`

---

## 📁 ไฟล์อ้างอิงสำหรับ ITAM-01

### Test Reports (รายละเอียดครบทุก bug):
| ไฟล์ | หน้า | Bugs |
|------|-----|------|
| `/qa-reports/QA-DEVICES-001.md` | จัดการอุปกรณ์ | 22 |
| `/qa-reports/QA-STOCK-001.md` | คลังสต็อก | 16 |
| `/qa-reports/QA-DASH-001.md` | Dashboard | 10 |
| `/qa-reports/QA-PAPER-001.md` | Paper Analytics | 8 |
| `/qa-reports/QA-WO-001.md` | แจ้งซ่อม | 6 |
| `/qa-reports/QA-METER-001.md` | จดมิเตอร์ | 16 |
| `/qa-reports/VERIFY-001.md` | Verification (re-test) | 13/15 verified |
| `/qa-reports/VERIFICATION-TRACKER.md` | Bug tracker รวม | 78 |

### Worklog:
- `/home/z/my-project/worklog.md` (1088+ บรรทัด — ทุก task ตั้งแต่ MIGRATE-001)

---

## 📝 สิ่งที่ ITAM-01 ต้องแจ้งเมื่อแก้เสร็จ

```
Task ID: DEV-FIX-XXX
Agent: ITAM-01

Bugs Fixed (commit <hash>):
- BUG-001 ✅ (commit abc1234) — <คำอธิบายสั้น>
- BUG-WO-002 ✅ (commit def5678) — <คำอธิบายสั้น>
- BUG-METER-003 ✅ (commit ghi9012) — <คำอธิบายสั้น>

Bugs Won't Fix:
- BUG-XXX ⏸️ — <เหตุผล>

Files Changed:
- src/components/itam/devices-page.tsx
- src/app/api/work-orders/route.ts
- src/app/api/itam/meter-readings/route.ts
```

---

## 🚦 Priority Order (แนะนำลำดับการแก้)

| ลำดับ | Bug ID | เหตุผล |
|------|--------|------|
| 1 | 🔴🔴 **BUG-METER-003** | กระทบ cost ทั้งระบบ (945K แทน 1.6K) |
| 2 | 🔴 **BUG-WO-002** | Blocker ของ WO workflow |
| 3 | 🔴 **BUG-WO-001** | Guest ไม่สามารถสร้าง WO |
| 4 | 🔴 **BUG-METER-002** | Data integrity (rollback) |
| 5 | 🔴 **BUG-METER-001** | Form submit pattern (เหมือน Stock IN) |
| 6 | 🔴 **BUG-METER-004** | Tabs pattern (เหมือน Stock + Paper) |
| 7 | 🔴 **BUG-METER-005** | Bulk entry workflow |
| 8 | 🔴 **BUG-001** | Devices form submit pattern |
| 9 | 🔴 **BUG-002** | Refetch loop (performance) |
| 10 | 🔴 **BUG-006** | Pagination |
| 11 | 🔴 **BUG-009, BUG-010** | CSV export pattern |
| 12 | 🔴 **BUG-012** | Global search |
| 13 | 🔴 **BUG-WO-003** | WO search pattern |
| 14 | ❌ **BUG-PAPER-003** (re-open) | Month picker |
| 15 | ❌ **BUG-STK-004** (re-open) | aria-label เพิ่ม 1 ปุ่ม |

---

## ✅ สรุป

- **รอ ITAM-01 แก้:** 61 bugs ใหม่ + 2 re-open = **63 ตัว**
- **แก้ pattern 6 ตัว** → ลด bug ได้ ~15 ตัวพร้อมกัน
- **Priority สูงสุด:** BUG-METER-003 (กระทบ cost)
- **Pattern bugs:** ใช้วิธีเดียวกับที่แก้ใน Stock + Dashboard + Paper แล้ว

---

**ส่งโดย:** QA Team
**วันที่:** 2026-08-23
**สถานะ:** ⏳ รอ ITAM-01 แก้ไข
