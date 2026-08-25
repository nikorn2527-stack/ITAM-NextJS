# 📊 Cost Analytics — Material & Consumable Cost Calculation System

> **สำหรับ:** ITAM-01
> **จาก:** QA Team + User Request
> **วันที่:** 2026-08-24
> **Priority:** 🔴 P0 — ต้องเสร็จก่อน cutover

---

## 🎯 ความต้องการของ User

> "การคำนวณต้นทุนวัสดุและของสิ้นเปลือง ในส่วนของที่เบิกในสต๊อก
> โดยเฉพาะที่เบิกในส่วนของแจ้งซ่อม และเป็นหัวข้อที่เกี่ยวกับงานเอาไปใช้กับเครื่อง
> จะต้องถูกคำนวณอย่างแม่นยำ"

> "ถ้าประเภทหมึก อาจจะเพิ่มว่าที่ 1 ขวด หรือตลับ สามารถพิมพ์ได้กี่แผ่น
> ส่วนอะไหล่ อาจนำมาคำนวนเป็นค่าเสื่อมต่อเครื่อง"

> "อย่างน้อยที่สุด 1 เดือนเรารู้จำนวนขวดที่ใช้จากการเบิกเข้าออกสต็อก
> แล้วเราหาค่าจากการหาค่าเฉลี่ยแผ่น ถึงไม่ตรง 100% ตอนนี้ก็ต้องหาทางและวิธีคำนวณที่ถูกต้อง"

---

## 🔍 สถานะปัจจุบัน — มีอะไรแล้ว

### ✅ มีแล้ว:

| ฟีเจอร์ | ไฟล์ | สถานะ |
|---------|------|------|
| **StockItem** | `prisma/schema.prisma` | มี `unitCost`, `totalValue`, `category` |
| **StockTransaction** | `prisma/schema.prisma` | มี `cost`, `unitCost`, `workOrderId`, `deviceId` |
| **Site rates** | `SiteAttribute.PaperRateBW/Color` | ฿/แผ่น ขาวดำ + สี ต่อสาขา |
| **Meter readings** | `MeterReading` | มี `pagesBw`, `pagesColor` |
| **Cost Analytics API** | `src/app/api/cost-analytics/route.ts` | มี — แต่คำนวณแค่ paper cost |
| **Paper Analytics** | `src/app/api/itam/paper-analytics/route.ts` | มี — แต่ไม่มี material cost |

### ❌ ยังไม่มี:

| ฟีเจอร์ | ต้องการ |
|---------|--------|
| **หมึก: แผ่นต่อขวด/ตลับ** | StockItem ต้องมี field `yieldPerPage` (กี่แผ่น/ขวด) |
| **อะไหล่: ค่าเสื่อมต่อเครื่อง** | StockItem ต้องมี field `depreciationType` + `usefulLifeMonths` |
| **Material cost per WO** | รวมต้นทุนหมึก + อะไหล่ ที่เบิกในแต่ละใบงาน |
| **Monthly material summary** | รายงานรายเดือน: หมึกกี่ขวด + อะไหล่อะไรบ้าง + ต้นทุนรวม |
| **Cost reconciliation** | เปรียบเทียบ: ต้นทุนหมึก (จากสต็อก) vs ค่ากระดาษ (จากมิเตอร์) |

---

## 🏗️ Design — Material Cost System

### 1. ขยาย StockItem model

```prisma
model StockItem {
  // ...existing fields...

  // ── NEW: Cost calculation fields ──

  // ประเภทการคำนวณต้นทุน
  costType        String?  // 'consumable' | 'spare_part' | 'service'

  // สำหรับหมึก (consumable): 1 ขวด/ตลับ พิมพ์ได้กี่แผ่น
  yieldPerPage    Int?     // เช่น 1500 (แผ่น/ขวด) — ใช้คำนวณต้นทุนต่อแผ่น

  // สำหรับอะไหล่ (spare_part): ค่าเสื่อม
  depreciationMethod  String?  // 'straight_line' | 'usage_based'
  usefulLifeMonths    Int?     // อายุการใช้งาน (เดือน) — สำหรับ straight_line
  usefulLifePages     Int?     // อายุการใช้งาน (แผ่น) — สำหรับ usage_based
}
```

### 2. ประเภทการคำนวณต้นทุน

```
┌─────────────────────────────────────────────────────┐
│              Stock Item (เบิกจากสต็อก)               │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  costType = 'consumable' (หมึก, ผงถ่าน, ฯลฯ)   │  │
│  │                                              │  │
│  │  ต้นทุนต่อการเบิก = unitCost × quantity        │  │
│  │                                              │  │
│  │  ต้นทุนต่อแผ่น = unitCost ÷ yieldPerPage       │  │
│  │  (เช่น ขวดหมึก ฿800, พิมพ์ได้ 1500 แผ่น        │  │
│  │   → ฿0.53/แผ่น)                               │  │
│  │                                              │  │
│  │  ใช้กับ: เครื่องพิมพ์, เครื่องถ่ายเอกสาร        │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  costType = 'spare_part' (อะไหล่)              │  │
│  │                                              │  │
│  │  วิธีที่ 1: Straight-line (เสื่อมตามเวลา)      │  │
│  │  ต้นทุนต่อเดือน = unitCost ÷ usefulLifeMonths  │  │
│  │  (เช่น  drum ฿3000, อายุ 24 เดือน             │  │
│  │   → ฿125/เดือน)                               │  │
│  │                                              │  │
│  │  วิธีที่ 2: Usage-based (เสื่อมตามการใช้งาน)    │  │
│  │  ต้นทุนต่อแผ่น = unitCost ÷ usefulLifePages    │  │
│  │  (เช่น fuser ฿5000, อายุ 100,000 แผ่น         │  │
│  │   → ฿0.05/แผ่น)                               │  │
│  │                                              │  │
│  │  ใช้กับ: drum, fuser, belt, roller, ฯลฯ       │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  costType = 'service' (บริการ)               │  │
│  │                                              │  │
│  │  ต้นทุน = unitCost × quantity (ตรงตัว)       │  │
│  │  (เช่น ค่าซ่อมนอก, ค่าขนส่ง)                   │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 3. Cost Calculation per Work Order

```
ใบงานซ่อม (Work Order) → เบิกหมึก + อะไหล่
    ↓
┌───────────────────────────────────────────────────┐
│  WO-001: ซ่อมเครื่องพิมพ์ HP LJ-26A                │
│                                                   │
│  หมึก:                                            │
│  ├── เบิกหมึกดำ 1 ขวด × ฿800 = ฿800              │
│  │   yieldPerPage = 1500 → ต้นทุน ฿0.53/แผ่น      │
│  │                                                │
│  อะไหล่:                                          │
│  ├── เบิก drum 1 ชิ้น × ฿3,000 = ฿3,000           │
│  │   usefulLifeMonths = 24 → ฿125/เดือน            │
│  │                                                │
│  บริการ:                                         │
│  ├── ค่าซ่อมนอก 1 ครั้ง × ฿500 = ฿500              │
│                                                   │
│  ─────────────────────────────────                │
│  ต้นทุนรวม WO = ฿800 + ฿3,000 + ฿500 = ฿4,300    │
│                                                   │
│  ต้นทุนหมึกต่อแผ่น = ฿0.53                         │
│  (เปรียบเทียบกับ paper rate ฿0.50/แผ่น)            │
└───────────────────────────────────────────────────┘
```

### 4. Monthly Material Summary

```
รายงานต้นทุนวัสดุ ประจำเดือน สิงหาคม 2569
═══════════════════════════════════════════════

📋 หมึกพิมพ์ (Consumable):
┌────────────┬──────┬─────────┬──────────┬────────────┬───────────┐
│ รายการ     │ จำนวน│ ราคา/ขวด│ ต้นทุนรวม │ yield/ขวด  │ ต้นทุน/แผ่น│
├────────────┼──────┼─────────┼──────────┼────────────┼───────────┤
│ หมึกดำ HP   │  3   │ ฿800    │ ฿2,400   │ 1,500 แผ่น │ ฿0.53    │
│ หมึกสี Canon│  2   │ ฿1,200  │ ฿2,400   │ 2,000 แผ่น │ ฿0.60    │
│ หมึกดำ Epson│  1   │ ฿600    │ ฿600     │ 1,200 แผ่น │ ฿0.50    │
├────────────┼──────┼─────────┼──────────┼────────────┼───────────┤
│ รวม        │  6   │         │ ฿5,400   │            │ เฉลี่ย ฿0.55│
└────────────┴──────┴─────────┴──────────┴────────────┴───────────┘

🔧 อะไหล่ (Spare Parts):
┌────────────┬──────┬─────────┬──────────┬────────────┬───────────┐
│ รายการ     │ จำนวน│ ราคา/ชิ้น│ ต้นทุนรวม │ อายุ(เดือน) │ ต้นทุน/เดือน│
├────────────┼──────┼─────────┼──────────┼────────────┼───────────┤
│ Drum HP    │  1   │ ฿3,000  │ ฿3,000   │ 24         │ ฿125     │
│ Fuser Canon│  1   │ ฿5,000  │ ฿5,000   │ 100K แผ่น  │ ฿0.05/แผ่น│
├────────────┼──────┼─────────┼──────────┼────────────┼───────────┤
│ รวม        │  2   │         │ ฿8,000   │            │           │
└────────────┴──────┴─────────┴──────────┴────────────┴───────────┘

💼 บริการ (Service):
┌────────────┬──────┬─────────┬──────────┐
│ รายการ     │ จำนวน│ ราคา    │ ต้นทุนรวม │
├────────────┼──────┼─────────┼──────────┤
│ ค่าซ่อมนอก  │  2   │ ฿500    │ ฿1,000   │
└────────────┴──────┴─────────┴──────────┘

═══════════════════════════════════════════════
📊 สรุปต้นทุนรวมเดือน: ฿14,400
   หมึก: ฿5,400 (38%)
   อะไหล่: ฿8,000 (56%)
   บริการ: ฿1,000 (7%)

📊 ต้นทุนหมึกเฉลี่ย: ฿0.55/แผ่น
   (เปรียบเทียบ paper rate: ฿0.50/แผ่น → ต่าง ฿0.05/แผ่น)

📊 Reconciliation:
   หมึกที่เบิก: 6 ขวด → ครอบคลุม 9,700 แผ่น
   แผ่นที่พิมพ์จริง: 8,500 แผ่น (จากมิเตอร์)
   ส่วนต่าง: 1,200 แผ่น (12%) → หมึกเหลือในขวด + waste
```

### 5. Cost Reconciliation (ประมวลผลสอบทาน)

```
┌──────────────────────────────────────────────────────┐
│  การประมวลผลสอบทานต้นทุน (Cost Reconciliation)        │
│                                                      │
│  แหล่งที่ 1: ต้นทุนจากสต็อก (เบิกหมึก)                  │
│  หมึก 6 ขวด × yieldPerPage = 9,700 แผ่นความสามารถ    │
│  ต้นทุน: ฿5,400                                      │
│  ต้นทุนต่อแผ่น: ฿0.56                                 │
│                                                      │
│  แหล่งที่ 2: ต้นทุนจากมิเตอร์ (พิมพ์จริง)                 │
│  พิมพ์จริง 8,500 แผ่น × paper rate ฿0.50 = ฿4,250    │
│  ต้นทุนต่อแผ่น: ฿0.50                                 │
│                                                      │
│  ═════════════════════════════                       │
│  ส่วนต่าง: ฿1,150 (27%)                               │
│  สาเหตุที่เป็นไปได้:                                    │
│  1. หมึกเหลือในขวด (ไม่ใช้หมด 100%)                    │
│  2. หมึกเสีย/หก/เสื่อม                                │
│  3. Paper rate ไม่รวมต้นทุนหมึก (เป็นค่ากระดาษอย่างเดียว) │
│  4. มิเตอร์ไม่ตรง (rollback/waste)                     │
│                                                      │
│  ═════════════════════════════                       │
│  คำแนะนำ:                                             │
│  → ใช้ต้นทุนจากสต็อกเป็นหลัก (แม่นยำกว่า)               │
│  → paper rate ใช้สำหรับเรียกเก็บจากสาขา (billing)     │
│  → ส่วนต่าง 10-20% เป็นปกติ (หมึกเหลือในขวด + waste)   │
└──────────────────────────────────────────────────────┘
```

---

## 📋 Implementation Plan — 3 Phases

### Phase 1: Data Model + Stock Item Enhancement (3 วัน)

**Tasks:**
1. เพิ่ม fields ใน `StockItem`:
   ```prisma
   costType           String?  // 'consumable' | 'spare_part' | 'service'
   yieldPerPage       Int?     // แผ่น/ขวด (สำหรับหมึก)
   depreciationMethod String?  // 'straight_line' | 'usage_based'
   usefulLifeMonths   Int?     // เดือน (สำหรับอะไหล่ straight_line)
   usefulLifePages    Int?     // แผ่น (สำหรับอะไหล่ usage_based)
   ```

2. อัปเดต Stock IN form — เพิ่มฟิลด์ costType + yieldPerPage + depreciation

3. สร้าง default categories:
   ```
   หมึกพิมพ์     → costType = 'consumable', yieldPerPage required
   อะไหล่        → costType = 'spare_part', depreciationMethod required
   บริการ       → costType = 'service'
   วัสดุสิ้นเปลือง → costType = 'consumable', yieldPerPage optional
   ```

4. อัปเดต Stock OUT form — เมื่อเบิกเพื่อ WO → บันทึก cost + unitCost อัตโนมัติ

### Phase 2: Cost Calculation + WO Integration (4 วัน)

**Tasks:**
1. สร้าง `src/lib/material-cost.ts`:
   ```typescript
   // คำนวณต้นทุนหมึกต่อแผ่น
   function calcInkCostPerPage(unitCost: number, yieldPerPage: number): number {
     return unitCost / yieldPerPage
   }

   // คำนวณต้นทุนอะไหล่ต่อเดือน (straight-line)
   function calcSparePartCostPerMonth(unitCost: number, usefulLifeMonths: number): number {
     return unitCost / usefulLifeMonths
   }

   // คำนวณต้นทุนอะไหล่ต่อแผ่น (usage-based)
   function calcSparePartCostPerPage(unitCost: number, usefulLifePages: number): number {
     return unitCost / usefulLifePages
   }

   // คำนวณต้นทุนรวม WO
   function calcWorkOrderCost(transactions: StockTransaction[]): WOCostSummary {
     // รวมหมึก + อะไหล่ + บริการ
   }

   // คำนวณต้นทุนหมึกรายเดือน
   function calcMonthlyInkCost(transactions: StockTransaction[], month: string): MonthlyInkCost {
     // หมึกที่เบิก × yieldPerPage = แผ่นความสามารถ
     // เปรียบเทียบกับแผ่นที่พิมพ์จริงจากมิเตอร์
   }
   ```

2. อัปเดต WO Detail Sheet — แสดงต้นทุนรวม (หมึก + อะไหล่ + บริการ)

3. อัปเดต WO Complete — สรุปต้นทุนก่อนปิดงาน

4. บันทึกต้นทุนใน `StockTransaction.cost` อัตโนมัติตอนเบิกออก

### Phase 3: Monthly Report + Reconciliation (3 วัน)

**Tasks:**
1. สร้าง API `/api/cost-analytics/material`:
   ```typescript
   GET /api/cost-analytics/material?month=2026-08&site=all

   Response:
   {
     ink: {
       totalBottles: 6,
       totalCost: 5400,
       avgCostPerPage: 0.55,
       items: [...]
     },
     spareParts: {
       totalItems: 2,
       totalCost: 8000,
       monthlyDepreciation: 125,
       items: [...]
     },
     service: {
       totalCost: 1000,
       items: [...]
     },
     totalCost: 14400,
     reconciliation: {
       inkCoveragePages: 9700,     // แผ่นที่หมึกครอบคลุม
       actualPrintedPages: 8500,   // แผ่นที่พิมพ์จริง
       difference: 1200,
       differencePercent: 12,
       stockCostPerPage: 0.56,
       meterCostPerPage: 0.50
     }
   }
   ```

2. เพิ่ม section "ต้นทุนวัสดุ" ใน Monthly Report

3. เพิ่ม section "ประมวลผลสอบทาน" (reconciliation) ใน Monthly Report

4. เพิ่มใน Reports Hub → "รายงานต้นทุนวัสดุ"

---

## 📊 สรุป

| ด้าน | รายละเอียด |
|------|----------|
| **เป้าหมาย** | รู้ต้นทุนหมึก + อะไหล่ + บริการ ต่อเดือน ต่อสาขา ต่อเครื่อง |
| **ความแม่นยำ** | หมึก: คำนวณจาก yieldPerPage (แผ่น/ขวด) — ไม่ตรง 100% แต่ใกล้เคียง |
| **ความแม่นยำ** | อะไหล่: คำนวณจากค่าเสื่อม (straight-line หรือ usage-based) |
| **ประมวลผลสอบทาน** | เปรียบเทียบต้นทุนหมึก (จากสต็อก) vs ค่ากระดาษ (จากมิเตอร์) |
| **ส่วนต่าง 10-20%** | ปกติ — หมึกเหลือในขวด + waste + มิเตอร์ไม่ตรง |

| Phase | เวลา | เนื้อหา |
|-------|------|--------|
| Phase 1 | 3 วัน | Data model + Stock form enhancement |
| Phase 2 | 4 วัน | Cost calculation + WO integration |
| Phase 3 | 3 วัน | Monthly report + reconciliation |
| **รวม** | **10 วัน** | |

---

**สร้างโดย:** QA Team
**วันที่:** 2026-08-24
**Priority:** 🔴 P0 — ต้องเสร็จก่อน cutover
