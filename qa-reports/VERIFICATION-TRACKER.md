# Verification Tracking — Bugs Pending Fix by ITAM-01

> ไฟล์นี้ใช้ติดตามสถานะ bug ที่ QA รายงาน → ITAM-01 กำลังแก้ → QA รอ verify
> QA Team อัปเดตเมื่อ: 2026-08-23

## 📊 สรุปสถานะ Bug ทั้งหมด

| Task ID | หน้า | จำนวน Bug | Critical | High | Medium | Low |
|---------|-----|---------|----------|------|--------|-----|
| QA-001 (DEVICES) | จัดการอุปกรณ์ | 22 | 6 | 3 | 4 | 9 |
| QA-002 (STOCK) | คลังสต็อก | 16 | 2 | 3 | 5 | 6 |
| QA-002 (DASHBOARD) | Dashboard | 10 | 1 | 2 | 4 | 3 |
| QA-003 (PAPER) | Paper Analytics | 8 | 3 | 2 | 2 | 1 |
| **รวม** | 4 หน้า | **56** | **12** | **10** | **15** | **19** |

---

## 🔄 Bug Lifecycle (สถานะวงจรชีวิต Bug)

```
Open (QA พบ)
   ↓
ITAM-01 แก้ → push commit พร้อม comment ใน GitHub: "Fixes BUG-XXX"
   ↓
QA sync โค้ดใหม่จาก GitHub → re-test bug เดิม
   ↓
Verified ✅ (แก้จริง) → ปิด bug
   ↓ หรือ
Re-opened ❌ (ยังพัง) → รายงานใหม่ใน "Re-test Results"
```

### สถานะที่ใช้:
| Status | ความหมาย | ใครอัปเดต |
|--------|---------|----------|
| 🔴 `Open` | QA รายงานแล้ว รอ ITAM-01 แก้ | QA |
| 🟡 `In Progress` | ITAM-01 กำลังแก้ | ITAM-01 |
| 🟢 `Fixed — Pending Verification` | ITAM-01 แก้เสร็จ + push commit | ITAM-01 |
| ✅ `Verified` | QA re-test ผ่าน | QA |
| ❌ `Re-opened` | QA re-test ไม่ผ่าน | QA |
| ⏸️ `Won't Fix` | ITAM-01 ตัดสินใจไม่แก้ (อธิบายเหตุผล) | ITAM-01 |

---

## 📋 Bug List — ทั้งหมด 56 ตัว (รอ ITAM-01 แก้)

### 🔴 Critical Bugs (12 ตัว — ต้องแก้ก่อน)

#### QA-001 (Devices Page) — 6 Critical
| Bug ID | ปัญหา | Status |
|--------|------|--------|
| BUG-001 | ปุ่ม "บันทึก" ใน form เพิ่มอุปกรณ์ไม่ทำงาน (submit ไม่ trigger) | 🔴 Open |
| BUG-002 | React Query refetch loop — 20 requests ใน 3 วิ | 🔴 Open |
| BUG-006 | Page size selector พัง — เปลี่ยนค่า UI แล้วไม่ refetch | 🔴 Open |
| BUG-009 | "ดาวน์โหลดเทมเพลต CSV" ไม่ทำงาน | 🔴 Open |
| BUG-010 | "ส่งออก CSV" ไม่ดาวน์โหลดไฟล์ | 🔴 Open |
| BUG-012 | Global Search ไม่ทำงาน | 🔴 Open |

#### QA-002 (Stock Page) — 2 Critical
| Bug ID | ปัญหา | Status |
|--------|------|--------|
| BUG-STK-001 | Tabs Navigation พังทั้งหมด | 🔴 Open |
| BUG-STK-003 | Stock IN form "บันทึก" ไม่ทำงาน | 🔴 Open |

#### QA-002 (Dashboard) — 1 Critical
| Bug ID | ปัญหา | Status |
|--------|------|--------|
| BUG-DASH-001 | ปุ่ม "สร้างรอบใหม่" คลิกไม่ตอบ | 🔴 Open |

#### QA-003 (Paper Analytics) — 3 Critical
| Bug ID | ปัญหา | Status |
|--------|------|--------|
| BUG-PAPER-001 | Tabs Navigation พังทั้งหมด | 🔴 Open |
| BUG-PAPER-002 | Date range picker พัง — เปลี่ยนค่าแล้วไม่ refetch | 🔴 Open |
| BUG-PAPER-003 | "Show month picker" ปุ่มไม่ทำงาน | 🔴 Open |

### 🟠 High Bugs (10 ตัว)
| Bug ID | หน้า | ปัญหา | Status |
|--------|-----|------|--------|
| BUG-011 | Devices | Mobile — table ไม่ scroll แนวนอน | 🔴 Open |
| BUG-004 | Devices | Unwanted cascading request | 🔴 Open |
| BUG-005 | Devices | Page size inconsistency | 🔴 Open |
| BUG-STK-002 | Stock | ไม่มี success toast หลัง action | 🔴 Open |
| BUG-STK-005 | Stock | Mobile responsive พัง | 🔴 Open |
| BUG-STK-006 | Stock | Delete ใช้ native confirm() | 🔴 Open |
| BUG-DASH-002 | Dashboard | PDF button disabled ไม่มี tooltip | 🔴 Open |
| BUG-DASH-003 | Dashboard | widget headers ไม่มี semantic heading | 🔴 Open |
| BUG-PAPER-004 | Paper | PDF Preview ไม่มีปุ่มปิด | 🔴 Open |
| BUG-PAPER-005 | Paper | Site filter ไม่มี empty state | 🔴 Open |

### 🟡 Medium + 🟢 Low (34 ตัว)
ดูรายละเอียดใน:
- `/home/z/my-project/qa-reports/QA-DEVICES-001.md`
- `/home/z/my-project/qa-reports/QA-STOCK-001.md`
- `/home/z/my-project/qa-reports/QA-DASH-001.md`
- `/home/z/my-project/qa-reports/QA-PAPER-001.md`

---

## 🔁 Re-test Workflow (เมื่อ ITAM-01 แก้เสร็จ)

เมื่อ ITAM-01 push commit ใหม่ และแจ้งว่าแก้ bug ไหนเสร็จ ให้ QA:

1. **Sync โค้ดใหม่จาก GitHub:**
   ```bash
   cd /home/z/my-project
   # โหลด tarball ใหม่
   curl -sL -H "Authorization: token ${GH_TOKEN}" -o /tmp/itam.tar.gz https://api.github.com/repos/nikorn2527-stack/ITAM-NextJS/tarball
   mkdir -p /tmp/itam-new && tar -xzf /tmp/itam.tar.gz -C /tmp/itam-new --strip-components=1
   # rsync เฉพาะ src/ + scripts/ + prisma/ (ห้ามทับ qa-reports/ qa-videos/ worklog.md)
   rsync -a --exclude='node_modules' --exclude='.git' --exclude='.env' /tmp/itam-new/src/ ./src/
   rsync -a /tmp/itam-new/prisma/ ./prisma/
   rsync -a /tmp/itam-new/scripts/ ./scripts/
   ```

2. **Push schema ใหม่ (ถ้ามีการแก้ schema):**
   ```bash
   bun run db:push  # ใช้ --accept-data-loss ถ้าจำเป็น
   ```

3. **Restart dev server:**
   ```bash
   pkill -f "next dev"; sleep 2; (nohup bun run dev > dev.log 2>&1 &)
   ```

4. **Re-test bug เฉพาะที่ ITAM-01 บอกว่าแก้:**
   - ดู Bug ID ที่แจ้ง
   - ทำตาม test steps ใน test report ของ bug นั้น
   - อัปเดต status ในไฟล์นี้: `Fixed → Verified` หรือ `Fixed → Re-opened`

5. **สร้าง Verification Report:**
   - บันทึกใน `/home/z/my-project/qa-reports/VERIFY-XXX.md`
   - สรุปผลส่งให้ ITAM-01 ในรูปแบบ Task ID / Agent / Task / Results

---

## 📝 สิ่งที่ ITAM-01 ต้องแจ้งเมื่อแก้เสร็จ

เมื่อ ITAM-01 push commit ที่แก้ bug แล้ว แจ้ง QA ในรูปแบบนี้:

```
Task ID: DEV-FIX-XXX
Agent: ITAM-01
Task: แก้ bug ตามรายงาน QA

Bugs Fixed (commit <hash>):
- BUG-001 ✅ (commit abc1234) — เพิ่ม <form> wrapper รอบ dialog
- BUG-STK-001 ✅ (commit def5678) — แก้ setActiveTab ใน Tabs component
- BUG-PAPER-002 ✅ (commit ghi9012) — เพิ่ม onChange handler ใน input[type=month]

Bugs Won't Fix:
- BUG-014 ⏸️ — เหตุผล: spinbutton=0 เป็น default ของ native date picker

Files Changed:
- src/components/itam/devices-page.tsx (BUG-001)
- src/components/itam/stock/index.tsx (BUG-STK-001)
- src/components/itam/paper-analytics-page.tsx (BUG-PAPER-002)
```

---

## 🚦 ขั้นตอนปัจจุบัน (2026-08-23)

1. ✅ QA ส่งรายงาน 4 หน้า (Devices, Stock, Dashboard, Paper) — 56 bugs
2. 🔄 **ITAM-01 กำลังแก้ bug** (ตามที่คุณบอก "แก้")
3. ⏳ QA รอ — เมื่อ ITAM-01 แจ้งว่าแก้เสร็บ + push commit, QA จะ:
   - Sync โค้ดใหม่
   - Re-test bug เฉพาะที่แก้
   - รายงานผล verify ให้ ITAM-01

**สถานะ:** 🟡 Waiting for ITAM-01 to push fixes
