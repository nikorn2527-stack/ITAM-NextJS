# 🚨 ITAM-01 URGENT — แก้ด่วน + เพิ่มฟีเจอร์ทั้งหมด

> **จาก:** QA Team
> **ถึง:** ITAM-01
> **วันที่:** 2026-08-24
> **Priority:** 🔴🔴 URGENT — ทำให้เสร็จภายใน 4 วัน
> **เป้าหมาย:** จาก 55% → 83% ใช้งานได้จริง (เทียบเท่าแอปเดิม)

---

## 📊 สถานะปัจจุบัน: 55% ใช้งานได้ แต่ติด blocker

```
กระบวนการซ่อม:
  แจ้งซ่อม (70%) → รับงาน (50%) → ซ่อม (60%) → เบิกอะไหล่ (40% ⚠️) → ปิดงาน (50%) → พิมพ์ (60%)

ปัญหา: BUG-WO-002 ทำให้ WO list ว่าง → ทำอะไรต่อไม่ได้
```

---

## 🔴 ส่วนที่ 1: แก้ด่วนวันนี้ (2 งาน — 35 นาที)

### งานที่ 1: BUG-WO-002 Runtime Fix (5 นาที)

**ปัญหา:** `ctx.user.role` เป็น `undefined` → TypeError → API crash 500

```diff
# ไฟล์ที่ 1: src/app/api/devices/route.ts บรรทัด 131
- if (ctx.isSuperAdmin || ctx.user.role === 'admin') {
+ if (ctx.isSuperAdmin || ctx.globalRole === 'admin') {

# ไฟล์ที่ 2: src/app/api/work-orders/route.ts บรรทัด 198
- if (ctx.isSuperAdmin || ctx.user.role === 'admin') {
+ if (ctx.isSuperAdmin || ctx.globalRole === 'admin') {
```

**เหตุผล:** `AuthorizationContext` interface มี `globalRole` ไม่ใช่ `user.role`

**ผล:** WO list แสดง + Devices list แสดง + KPI cards แสดง → 55% → 65%

### งานที่ 2: Seed ContactDirectory (30 นาที)

**ปัญหา:** Guest สร้าง WO ไม่ได้ — `validateGuestContact()` ล้มเหลวเพราะ DB ไม่มี contactDirectory

**วิธีแก้ (เลือก 1 ใน 2):**

**ทางเลือก A — Seed default contacts (แนะนำ):**
```typescript
// scripts/seed-contact-directory.ts
import { db } from '../src/lib/db'

const contacts = [
  { full_name: 'admin', phone: '0812345678', employee_code: '', department: 'IT', active: true },
  { full_name: 'demo_admin', phone: '0812345678', employee_code: '', department: 'IT', active: true },
  { full_name: 'demo_staff', phone: '0812345678', employee_code: '', department: 'IT', active: true },
]

await db.appSetting.upsert({
  where: { key: 'contactDirectory' },
  update: { value: JSON.stringify(contacts) },
  create: { key: 'contactDirectory', value: JSON.stringify(contacts) },
})
```

**ทางเลือก B — Bypass ใน dev mode:**
```typescript
// src/lib/guest-validation.ts — เพิ่มที่ต้นฟังก์ชัน validateGuestContact
if (process.env.NODE_ENV === 'development') {
  return { ok: true, canonicalName: input.name, canonicalPhone: input.phone }
}
```

**ผล:** Guest สร้าง WO ได้ → 65% → 70%

---

## 🔴 ส่วนที่ 2: เพิ่มฟีเจอร์ทั้งหมด (4 งาน — 4 วัน)

### งานที่ 3: เบิกอะไหล่ตอนปิดงาน (3 วัน) — **หัวใจหลัก!**

**ปัญหา:** ตอนปิดงานไม่มีขั้นตอนเบิกอะไหล่ → ช่างลืมเบิก → ต้นทุนหาย

**Spec ฉบับเต็ม:** `/home/z/my-project/docs/WO-COMPLETE-PARTS-SPEC.md`

**สรุปสิ่งที่ต้องทำ:**

1. **CompleteDialog ใหม่ (3 steps):**
```
Step 1: ผลการซ่อม (note) — มีอยู่แล้ว
Step 2: อะไหล่ที่ใช้ — เพิ่มใหม่!
  ├── เลือกสินค้าจาก stock
  ├── ใส่จำนวน
  ├── แสดงต้นทุนรวม
  └── ปิดงาน → สร้าง StockTransaction (type=OUT, workOrderId FK)
Step 3: รูปหลังซ่อม — มีอยู่แล้ว
```

2. **API complete/route.ts — รับ parts[]:**
```typescript
// Body: { note, parts: [{ productCode, quantity }], picAfter }

// 1. สร้าง StockTransaction สำหรับแต่ละ part
for (const part of parts) {
  await db.stockTransaction.create({
    data: {
      type: 'OUT',
      stockItemId: item.id,
      workOrderId: wo.id,         // FK
      workOrderNo: wo.woNumber,
      deviceId: wo.deviceId,
      quantity: part.quantity,
      cost: item.unitCost * part.quantity,
      approvalStatus: 'IMMEDIATE', // ไม่ต้องรออนุมัติ
    }
  })
  // ลดสต็อก
  await db.stockItem.update({ where: { id: item.id }, data: { quantity: { decrement: part.quantity } } })
}

// 2. ปิดงาน (มีอยู่แล้ว)
await db.workOrder.update({ where: { id: wo.id }, data: { status: 'COMPLETED' } })

// 3. ส่งกลับต้นทุนรวม
return { workOrder: updated, partsCost: totalCost }
```

**ไฟล์ที่แก้:**
- `src/components/itam/work-orders-page.tsx` — CompleteDialog (3 steps)
- `src/app/api/work-orders/[id]/complete/route.ts` — รับ parts[] + auto-create StockTransaction

**ผล:** 70% → 80%

---

### งานที่ 4: Stock OUT — เลือก WO จาก dropdown (1 วัน)

**ปัญหา:** Stock OUT ใช้ text input พิมพ์เลข WO → พิมพ์ผิดได้ + workOrderId=null

**สิ่งที่ต้องทำ:**

1. **เปลี่ยน text input → dropdown:**
```tsx
// src/components/itam/stock/stock-out-form.tsx

// ดึง WO ที่เปิดอยู่
const { data: openWorkOrders } = useQuery({
  queryKey: ['open-work-orders'],
  queryFn: async () => {
    const res = await fetch('/api/work-orders?status=PENDING,IN_PROGRESS,WAITING_PARTS')
    return res.json()
  },
})

// เปลี่ยนจาก:
<Input placeholder="WO-YYYYMMDD-NNN" value={form.workOrderNo} />

// เป็น:
<Select value={form.workOrderId} onValueChange={(id) => {
  const wo = openWorkOrders?.find(w => w.id === id)
  setForm({ ...form, workOrderId: id, workOrderNo: wo?.woNumber ?? '' })
}}>
  <SelectTrigger><SelectValue placeholder="เลือกใบงาน (ถ้ามี)" /></SelectTrigger>
  <SelectContent>
    {openWorkOrders?.map(wo => (
      <SelectItem key={wo.id} value={wo.id}>
        {wo.woNumber} — {wo.subject}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

2. **API บันทึก workOrderId (FK):**
```typescript
// src/app/api/stock-items/[id]/transaction/route.ts
if (body.workOrderId) {
  const wo = await db.workOrder.findUnique({ where: { id: body.workOrderId } })
  if (!wo) return NextResponse.json({ error: 'ไม่พบใบงาน' }, { status: 400 })
  transaction.workOrderId = wo.id        // FK
  transaction.workOrderNo = wo.woNumber // text
  transaction.deviceId = wo.deviceId     // เชื่อม Device ด้วย
}
```

**ไฟล์ที่แก้:**
- `src/components/itam/stock/stock-out-form.tsx` — dropdown + state
- `src/app/api/stock-items/[id]/transaction/route.ts` — workOrderId FK + validation

**ผล:** 80% → 83%

---

### งานที่ 5: ต้นทุนวัสดุ + ประมวลผลสอบทาน (10 วัน — ทำหลัง 4 วันแรก)

**Spec ฉบับเต็ม:** `/home/z/my-project/docs/COST-ANALYTICS-SPEC.md`

**สรุป:**

1. **เพิ่ม fields ใน StockItem:**
```prisma
model StockItem {
  // ...existing...
  costType            String?  // 'consumable' | 'spare_part' | 'service'
  yieldPerPage        Int?     // แผ่น/ขวด (หมึก)
  depreciationMethod String?  // 'straight_line' | 'usage_based'
  usefulLifeMonths    Int?     // เดือน (อะไหล่)
  usefulLifePages     Int?     // แผ่น (อะไหล่ usage-based)
}
```

2. **คำนวณต้นทุน 3 ประเภท:**
- หมึก: `unitCost ÷ yieldPerPage` = ต้นทุน/แผ่น
- อะไหล่ (straight-line): `unitCost ÷ usefulLifeMonths` = ต้นทุน/เดือน
- อะไหล่ (usage-based): `unitCost ÷ usefulLifePages` = ต้นทุน/แผ่น

3. **ประมวลผลสอบทาน (Reconciliation):**
```
ต้นทุนหมึก (จากสต็อก) vs ค่ากระดาษ (จากมิเตอร์)
หมึก 6 ขวด × yield = 9,700 แผ่นความสามารถ
พิมพ์จริง 8,500 แผ่น (จากมิเตอร์)
ส่วนต่าง 12% → ปกติ (หมึกเหลือในขวด + waste)
```

**ไฟล์ที่สร้าง:**
- `prisma/schema.prisma` — เพิ่ม fields
- `src/lib/material-cost.ts` — คำนวณต้นทุน
- `src/app/api/cost-analytics/material/route.ts` — API
- Monthly Report + Reports Hub — เพิ่ม section ต้นทุน

**ผล:** 83% → 90%

---

### งานที่ 6: Custom Export/Print Templates (12 วัน — ทำหลัง 10 วัน)

**Spec ฉบับเต็ม:** `/home/z/my-project/docs/CUSTOM-EXPORT-PRINT-SPEC.md`

**สรุป:**
- ExportTemplate model + 9 default templates
- Universal Export Dialog (column picker + rename + reorder)
- Print Template Selection (dialog ก่อน print)
- 9 หน้า: Devices, Meter, WO, Stock, Paper, Audit, Monthly, Dashboard, Reports

**ผล:** 90% → 95%

---

### งานที่ 7: Legacy Sync (1 วัน — ทำท้ายสุดก่อน cutover)

**ความต้องการของ User:** "หลังจากแอฟเสร็จเราจะดึงข้อมูลจากแอฟเดิมเพื่อให้เป็นข้อมูลปัจจุบัน"

**สิ่งที่ต้องทำ:**
1. ตั้งค่า Google Service Account credentials
2. ทดสอบ Preview Sync (ดึงข้อมูลโดยไม่เขียน)
3. ทดสอบ Apply Sync (ดึงข้อมูล + เขียนจริง)
4. ตั้งค่าบน Vercel environment variables

**ผล:** 95% → 100%

---

## 📊 ลำดับการทำ + ผลลัพธ์

```
วันที่ 1 (วันนี้):
  1. แก้ ctx.globalRole (5 นาที)     → 65%  ← WO list แสดง!
  2. Seed contactDirectory (30 นาที) → 70%  ← Guest สร้าง WO ได้!
  3. เริ่ม CompleteDialog + Parts   → กำลังทำ

วันที่ 2-4:
  3. เบิกอะไหล่ตอนปิดงาน (3 วัน)   → 80%  ← กระบวนการครบ!
  4. Stock OUT dropdown (1 วัน)     → 83%  ← เบิกเชื่อม WO แม่นยำ!

วันที่ 5-14:
  5. ต้นทุนวัสดุ + Cost Analytics (10 วัน) → 90%

วันที่ 15-26:
  6. Custom Export/Print (12 วัน)         → 95%

วันที่ 27:
  7. Legacy Sync (1 วัน)                  → 100% ← Cutover!
```

---

## ✅ Checklist — ทำเสร็จทั้งหมด 7 งาน = 100%

- [ ] งานที่ 1: แก้ `ctx.globalRole` (2 บรรทัด)
- [ ] งานที่ 2: Seed contactDirectory (หรือ bypass dev mode)
- [ ] งานที่ 3: CompleteDialog + Parts Step (3 วัน) — Spec: `WO-COMPLETE-PARTS-SPEC.md`
- [ ] งานที่ 4: Stock OUT dropdown + workOrderId FK (1 วัน) — Spec: `WO-COMPLETE-PARTS-SPEC.md`
- [ ] งานที่ 5: Cost Analytics System (10 วัน) — Spec: `COST-ANALYTICS-SPEC.md`
- [ ] งานที่ 6: Custom Export/Print (12 วัน) — Spec: `CUSTOM-EXPORT-PRINT-SPEC.md`
- [ ] งานที่ 7: Legacy Sync (1 วัน) — ท้ายสุดก่อน cutover

---

## 📁 เอกสารอ้างอิงทั้งหมด

| ไฟล์ | เนื้อหา |
|------|--------|
| `/home/z/my-project/docs/FOR-ITAM-01-FINAL-PRIORITY-LIST.md` | Priority list รวม (P0+P1+P2) |
| `/home/z/my-project/docs/WO-COMPLETE-PARTS-SPEC.md` | ปิดงาน + เบิกอะไหล่ (งานที่ 3+4) |
| `/home/z/my-project/docs/COST-ANALYTICS-SPEC.md` | ต้นทุนวัสดุ + ประมวลผลสอบทาน (งานที่ 5) |
| `/home/z/my-project/docs/CUSTOM-EXPORT-PRINT-SPEC.md` | Custom Export/Print templates (งานที่ 6) |
| `/home/z/my-project/docs/MODULE-ARCHITECTURE-GUIDE.md` | Module migration guide |
| `/home/z/my-project/worklog.md` | 1713 บรรทัด — ทุก Task ID |

---

**ส่งโดย:** QA Team
**วันที่:** 2026-08-24
**สถานะ:** 🔴 URGENT — เริ่มจากงานที่ 1 (5 นาที) ทันที!
