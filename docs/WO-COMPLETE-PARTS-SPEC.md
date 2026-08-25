# 🔧 WO Complete: Add Parts Step + Stock OUT Validation

> **สำหรับ:** ITAM-01
> **จาก:** QA Team + User Request
> **วันที่:** 2026-08-24
> **Priority:** 🔴 P0 — ต้องเสร็จก่อน cutover
> **เกี่ยวข้องกับ:** Cost Analytics System (`COST-ANALYTICS-SPEC.md`)

---

## 📋 ปัญหาปัจจุบัน

### ปัญหาที่ 1: ปิดงานไม่มีขั้นตอนเบิกอะไหล่

```
โฟลว์ปัจจุบัน:
  แจ้งซ่อม → รับงาน → [เบิกอะไหล่ (ปุ่มแยก)] → ปิดงาน (มีแค่ช่อง note)
                                         ↑
                                    ช่างมักลืมกดปุ่มนี้
                                    → เบิกนอกระบบ → ต้นทุนหาย
```

**ผลกระทบ:**
- ช่างเบิกอะไหล่นอกระบบ → สต็อกไม่ลด → ต้นทุนหาย
- ปิดงานโดยไม่บันทึกอะไหล่ → Cost Analytics ไม่แม่นยำ
- ไม่รู้ว่าใบงานนี้ใช้หมึก/อะไหล่อะไรบ้าง

### ปัญหาที่ 2: Stock OUT ไม่เชื่อม WO แบบแม่นยำ

```
โฟลว์ปัจจุบัน:
  หน้าสต็อก → เบิกออก → ใส่เลขใบงาน (text พิมพ์เอง)
                              ↑
                         พิมพ์ผิดได้ — ไม่มี validation
                         workOrderId = null (ไม่เชื่อมแบบ FK)
```

**ผลกระทบ:**
- ใส่เลข WO ผิด → ต้นทุนไปตกอยู่ใบงานผิด
- `workOrderId` เป็น null → ค้นหาต้นทุนตาม WO ไม่ได้

---

## 🎯 สิ่งที่ต้องทำ — 2 ส่วน

### ส่วนที่ 1: เพิ่ม "ขั้นตอนเบิกอะไหล่" ในหน้าปิดงาน

#### โฟลว์ใหม่ที่ต้องการ:

```
แจ้งซ่อม → รับงาน → ปิดงาน
                         ↓
              ┌──────────────────────────────┐
              │  Dialog "ปิดงาน"              │
              │                              │
              │  ┌─ Step 1: ผลการซ่อม ────┐ │
              │  │ รายละเอียด: ___________  │ │
              │  │ หมวดหมู่: [เลือก▼]       │ │
              │  └─────────────────────────┘ │
              │                              │
              │  ┌─ Step 2: อะไหล่ที่ใช้ ──┐ │  ← เพิ่มใหม่!
              │  │                         │ │
              │  │ ☑ หมึกดำ HP 26A × 1 ขวด│ │
              │  │   ฿800 (yield 1500 แผ่น)│ │
              │  │                         │ │
              │  │ ☑ Drum HP × 1 ชิ้น       │ │
              │  │   ฿3,000 (24 เดือน)     │ │
              │  │                         │ │
              │  │ [+ เพิ่มอะไหล่]           │ │
              │  │                         │ │
              │  │ ต้นทุนรวม: ฿3,800       │ │
              │  └─────────────────────────┘ │
              │                              │
              │  ┌─ Step 3: รูปหลังซ่อม ──┐ │
              │  │ [📷 ถ่ายภาพ]             │ │
              │  └─────────────────────────┘ │
              │                              │
              │  [ยกเลิก]      [ปิดงาน]     │
              └──────────────────────────────┘
```

#### การแก้ไข UI:

**ไฟล์:** `src/components/itam/work-orders-page.tsx`

```tsx
// สร้าง CompleteDialog ใหม่ที่มี 3 steps
function CompleteDialog({ wo, open, onClose }) {
  const [note, setNote] = React.useState('')
  const [parts, setParts] = React.useState<PartLine[]>([])
  const [picAfter, setPicAfter] = React.useState<string | null>(null)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ปิดงาน {wo.woNumber}</DialogTitle>
        </DialogHeader>

        {/* Step 1: ผลการซ่อม */}
        <div className="space-y-2">
          <Label>ผลการซ่อม *</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="อธิบายสิ่งที่ซ่อม/แก้ไข..."
          />
        </div>

        {/* Step 2: อะไหล่ที่ใช้ — เพิ่มใหม่ */}
        <div className="space-y-2">
          <Label>อะไหล่ที่ใช้ในการซ่อม</Label>

          {parts.length === 0 && (
            <p className="text-sm text-slate-500">
              ไม่ได้ใช้อะไหล่ (เช่น ปรับแต่ง, ทำความสะอาด)
            </p>
          )}

          {parts.map((p) => (
            <div key={p.key} className="flex items-center gap-2">
              <span className="flex-1 text-sm">
                {p.productName} × {p.quantity} {p.unit}
              </span>
              <span className="text-xs text-slate-500">
                ฿{(p.unitCost * p.quantity).toLocaleString()}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removePart(p.key)}
              >
                ลบ
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={openPartsPicker}
          >
            + เพิ่มอะไหล่
          </Button>

          {parts.length > 0 && (
            <div className="border-t pt-2 text-sm font-semibold">
              ต้นทุนรวม: ฿
              {parts
                .reduce((sum, p) => sum + p.unitCost * p.quantity, 0)
                .toLocaleString()}
            </div>
          )}
        </div>

        {/* Step 3: รูปหลังซ่อม */}
        <div className="space-y-2">
          <Label>รูปหลังซ่อม</Label>
          <CameraCapture onChange={setPicAfter} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={handleComplete} disabled={!note.trim()}>
            ปิดงาน
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

#### API: Complete + Auto-create StockTransactions

**ไฟล์:** `src/app/api/work-orders/[id]/complete/route.ts`

```typescript
// POST /api/work-orders/{id}/complete
// Body: {
//   note: string,
//   resolutionGroup?: string,
//   parts?: Array<{ productCode: string, quantity: number }>,
//   picAfter?: string
// }

export async function POST(req, { params }) {
  // ...auth + validation...

  const body = await req.json()
  const { note, parts, picAfter } = body

  // ── PART 1: ตรวจ pending parts เดิม (มีอยู่แล้ว) ──
  // ถ้ามี parts ที่เบิกก่อนหน้าและยัง PENDING → ปิดไม่ได้
  const pendingPartsCount = await db.stockTransaction.count({
    where: { approvalStatus: 'PENDING', workOrderId: wo.id },
  })
  if (pendingPartsCount > 0) {
    return NextResponse.json(
      { error: 'ยังปิดงานไม่ได้ — มีคำขอเบิกอะไหล่ที่ยังรออนุมัติ' },
      { status: 400 },
    )
  }

  // ── PART 2: สร้าง StockTransactions สำหรับ parts ที่ระบุตอนปิดงาน ──
  // (เพิ่มใหม่ — ถ้ามี parts ใน body)
  if (parts && parts.length > 0) {
    for (const part of parts) {
      const item = await db.stockItem.findUnique({
        where: { productCode: part.productCode },
      })
      if (!item) {
        return NextResponse.json(
          { error: `ไม่พบสินค้ารหัส ${part.productCode}` },
          { status: 400 },
        )
      }
      if (item.quantity < part.quantity) {
        return NextResponse.json(
          { error: `${item.productName} มีไม่พอ (เหลือ ${item.quantity})` },
          { status: 400 },
        )
      }

      // สร้าง StockTransaction (type=OUT, link WO)
      await db.stockTransaction.create({
        data: {
          stockItemId: item.id,
          productCode: item.productCode,
          productName: item.productName,
          type: 'OUT',
          quantity: part.quantity,
          unit: item.unit,
          balanceAfter: item.quantity - part.quantity,
          workOrderId: wo.id,         // ← FK เชื่อม WO
          workOrderNo: wo.woNumber,   // ← เก็บเลข WO ด้วย
          deviceId: wo.deviceId,      // ← เชื่อม Device ด้วย (ถ้ามี)
          cost: (item.unitCost ?? 0) * part.quantity,
          unitCost: item.unitCost,
          txnDate: new Date().toISOString().slice(0, 10),
          performedBy: auth.user.email,
          approvalStatus: 'IMMEDIATE', // ← ไม่ต้องรออนุมัติ (ปิดงานแล้ว)
          remark: `เบิกตอนปิดงาน ${wo.woNumber}`,
        },
      })

      // ลดสต็อก
      await db.stockItem.update({
        where: { id: item.id },
        data: {
          quantity: { decrement: part.quantity },
          lastUpdated: new Date().toISOString(),
        },
      })
    }
  }

  // ── PART 3: ปิดงาน (มีอยู่แล้ว) ──
  const updated = await db.workOrder.update({
    where: { id: wo.id },
    data: {
      status: 'COMPLETED',
      workCompletedAt: new Date(),
      closedAt: new Date(),
      resolution: note,
      picAfter: picAfter ?? wo.picAfter,
      // ...existing fields...
    },
  })

  // ── PART 4: สรุปต้นทุน (ส่งกลับไปแสดง) ──
  const totalPartsCost = parts
    ? await calculatePartsCost(parts)
    : 0

  return NextResponse.json({
    workOrder: updated,
    partsCost: totalPartsCost,
    message: `ปิดงานเรียบร้อย — ต้นทุนอะไหล่ ฿${totalPartsCost.toLocaleString()}`,
  })
}
```

---

### ส่วนที่ 2: แก้ Stock OUT form — เลือก WO จาก dropdown

#### ปัญหา:

```tsx
// ปัจจุบัน: text input พิมพ์เอง
<Input
  placeholder="WO-YYYYMMDD-NNN"
  value={form.workOrderNo}
  onChange={(e) => setForm({ ...form, workOrderNo: e.target.value })}
/>
// → พิมพ์ผิดได้, workOrderId = null
```

#### วิธีแก้:

```tsx
// ใหม่: dropdown เลือก WO ที่เปิดอยู่
const { data: openWorkOrders } = useQuery({
  queryKey: ['open-work-orders'],
  queryFn: async () => {
    const res = await fetch('/api/work-orders?status=PENDING,IN_PROGRESS,WAITING_PARTS')
    return res.json()
  },
})

<Select
  value={form.workOrderId}
  onValueChange={(id) => {
    const wo = openWorkOrders?.find(w => w.id === id)
    setForm({
      ...form,
      workOrderId: id,
      workOrderNo: wo?.woNumber ?? '',
    })
  }}
>
  <SelectTrigger>
    <SelectValue placeholder="เลือกใบงาน (ถ้ามี)" />
  </SelectTrigger>
  <SelectContent>
    {openWorkOrders?.map(wo => (
      <SelectItem key={wo.id} value={wo.id}>
        {wo.woNumber} — {wo.subject}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

#### API: Stock OUT — บันทึก workOrderId

```typescript
// POST /api/stock-items/{id}/transaction
// Body: { type: 'OUT', quantity, workOrderId?, workOrderNo?, ... }

// เพิ่ม: ถ้ามี workOrderId → ตรวจสอบว่า WO นั้นมีจริง
if (body.workOrderId) {
  const wo = await db.workOrder.findUnique({
    where: { id: body.workOrderId },
  })
  if (!wo) {
    return NextResponse.json(
      { error: 'ไม่พบใบงานที่ระบุ' },
      { status: 400 },
    )
  }
  // บันทึกทั้ง workOrderId (FK) + workOrderNo (text)
  transaction.workOrderId = wo.id
  transaction.workOrderNo = wo.woNumber
  transaction.deviceId = wo.deviceId // เชื่อม Device ด้วย
}
```

---

## 📊 ผลลัพธ์หลังแก้

### ทั้ง 2 วิธีเบิกอะไหล่จะเชื่อม WO แบบแม่นยำ:

```
WO Detail Sheet → แสดงอะไหล่ที่เบิกทั้งหมด:
├── วิธีที่ 1: เบิกจาก WO (ปุ่ม "เบิกอะไหล่")     → workOrderId FK ✅
├── วิธีที่ 2: เบิกตอนปิดงาน (Step 2 ใน Dialog)  → workOrderId FK ✅ (ใหม่!)
└── วิธีที่ 3: เบิกจากหน้าสต็อก (Stock OUT)      → workOrderId FK ✅ (แก้แล้ว)
```

### Cost Analytics จะแม่นยำ:

```
ต้นทุนต่อใบงาน = SUM(StockTransaction.cost WHERE workOrderId = WO.id)

ตัวอย่าง:
WO-001: ซ่อมเครื่องพิมพ์ HP
├── หมึกดำ 1 ขวด × ฿800 = ฿800   (เบิกตอนปิดงาน) ← ใหม่!
├── Drum 1 ชิ้น × ฿3,000 = ฿3,000 (เบิกจาก WO)
└── รวม: ฿3,800
```

---

## 📋 Implementation Tasks

| # | งาน | ไฟล์ | เวลา |
|---|-----|------|------|
| 1 | สร้าง CompleteDialog ใหม่ (3 steps: note + parts + photo) | `work-orders-page.tsx` | 1 วัน |
| 2 | แก้ API complete: รับ parts[] → สร้าง StockTransaction | `complete/route.ts` | 0.5 วัน |
| 3 | Parts picker (reuse จาก WO Parts ที่มีอยู่แล้ว) | `work-orders-page.tsx` | 0.5 วัน |
| 4 | แก้ Stock OUT form: เปลี่ยน text → dropdown เลือก WO | `stock-out-form.tsx` | 0.5 วัน |
| 5 | แก้ Stock OUT API: บันทึก workOrderId (FK) + validate | `stock-items/[id]/transaction/route.ts` | 0.5 วัน |
| 6 | ทดสอบ: เบิกอะไหล่ทั้ง 3 วิธี → ตรวจ workOrderId | — | 0.5 วัน |
| **รวม** | | | **3.5 วัน** |

---

## ✅ Acceptance Criteria

### ส่วนที่ 1: Complete Dialog + Parts Step
- [ ] กด "ปิดงาน" → เปิด Dialog ที่มี 3 steps
- [ ] Step 1: ผลการซ่อม (note) — มีอยู่แล้ว
- [ ] Step 2: อะไหล่ที่ใช้ — เลือกสินค้า + จำนวน + แสดงต้นทุนรวม
- [ ] Step 3: รูปหลังซ่อม — มีอยู่แล้ว
- [ ] ปิดงาน → สร้าง StockTransaction (type=OUT, workOrderId FK, approvalStatus=IMMEDIATE)
- [ ] สต็อกลดอัตโนมัติ
- [ ] ถ้าไม่มีอะไหล่ → ปิดงานได้ปกติ (Step 2 ว่างได้)

### ส่วนที่ 2: Stock OUT Validation
- [ ] Stock OUT form: เลือก WO จาก dropdown (ไม่ใช่ text input)
- [ ] Dropdown แสดงเฉพาะ WO ที่เปิดอยู่ (PENDING/IN_PROGRESS/WAITING_PARTS)
- [ ] เลือก WO → บันทึก `workOrderId` (FK) + `workOrderNo` (text)
- [ ] ถ้าใส่ WO ผิด → error "ไม่พบใบงาน"
- [ ] ถ้าไม่เลือก WO → เบิกได้ปกติ (ไม่บังคับ)

### ทั้ง 2 ส่วน
- [ ] WO Detail Sheet แสดงอะไหล่ที่เบิกทั้ง 3 วิธี
- [ ] Cost Analytics รวมต้นทุนจากทั้ง 3 วิธี (ผ่าน `workOrderId` FK)

---

**สร้างโดย:** QA Team
**วันที่:** 2026-08-24
**Priority:** 🔴 P0 — ต้องเสร็จก่อน cutover
**เกี่ยวข้องกับ:** `COST-ANALYTICS-SPEC.md` (ระบบต้นทุนวัสดุ)
