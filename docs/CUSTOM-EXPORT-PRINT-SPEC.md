# 📋 Custom Export & Print Template System — Feature Specification

> **สำหรับ:** ITAM-01
> **จาก:** QA Team + User Request
> **วันที่:** 2026-08-24
> **Priority:** 🟡 P1 (หลัง P0 เสร็จ)
> **ระยะเวลาประมาณ:** 1-2 สัปดาห์

---

## 🎯 ความต้องการของ User

> "ทุกหน้าที่มี Export ข้อมูล และพิมพ์สติกเกอร์ จำเป็นต้องมีฟอร์มตั้งต้นจากระบบ
> และต้องสามารถ Custom ทั้งฟอร์มและหัวคอลัมน์ เรียงจัดได้ตามการออกแบบได้อย่างง่ายสะดวก
> และก่อนสั่งปริ้นต้องสามารถเลือกพิมพ์ได้ว่าจะใช้ฟอร์มไหน"

### 3 ข้อหลัก:

1. **ฟอร์มตั้งต้นจากระบบ** — ทุกหน้าที่มี Export/Print ต้องมี default template
2. **Custom ได้ทั้งฟอร์ม + หัวคอลัมน์** — เลือกคอลัมน์ + เรียงลำดับ + เปลี่ยนชื่อ
3. **เลือกฟอร์มก่อนปริ้น** — dialog เลือก template ก่อนสั่ง print/export

---

## 📊 สถานะปัจจุบัน — มีอะไรแล้วบ้าง

### ✅ มีแล้ว:

| ฟีเจอร์ | หน้า | ไฟล์ | สถานะ |
|---------|-----|------|------|
| **Custom Export Dialog** | Devices | `custom-export-dialog.tsx` | ✅ column picker + reorder + format (CSV/Excel/PDF) |
| **Sticker Print Dialog** | Devices | `sticker-print-dialog.tsx` | ✅ size selector + QR code + template |
| **Document Template** | ทั่วไป | `itam-document-editor.tsx` | ✅ editor + save/load |
| **Sticker Template** | ทั่วไป | `itam-sticker-editor.tsx` | ✅ drag-move editor |
| **Simple CSV Export** | Audit, Meter, Stock, Paper | แต่ละหน้า | ⚠️ แบบง่าย — ไม่มี column picker |
| **Print (window.print)** | Monthly, Paper, Dashboard | แต่ละหน้า | ⚠️ แบบง่าย — ไม่มี template selection |
| **DocumentTemplate model** | DB | `schema.prisma` | ✅ name, type, category, content, isDefault |

### ❌ ยังไม่มี:

| ฟีเจอร์ | ต้องการ |
|---------|--------|
| Universal Export Dialog สำหรับทุกหน้า | ขยายจาก Devices → ทุกหน้า |
| Template selection ก่อน print | dialog เลือก template ก่อนสั่งปริ้น |
| Save/Load custom templates | บันทึก template ของ user + เลือกใช้ได้ |
| Column rename | เปลี่ยนชื่อหัวคอลัมน์ได้ |
| Sticker template selection | เลือก sticker template ก่อนพิมพ์ |

---

## 🏗️ Design — Universal Export & Print Template System

### Architecture:

```
┌─────────────────────────────────────────────────────┐
│              Print/Export Button (ทุกหน้า)            │
│                        ↓                            │
│              ┌─────────────────────┐                │
│              │ Template Selection   │                │
│              │ Dialog              │                │
│              │                     │                │
│              │ ┌─────────────────┐ │                │
│              │ │ 📋 Default      │ │ ← ฟอร์มตั้งต้น │
│              │ │ 📋 My Custom 1  │ │ ← user save   │
│              │ │ 📋 My Custom 2  │ │               │
│              │ │ + สร้างใหม่      │ │               │
│              │ └─────────────────┘ │                │
│              │                     │                │
│              │ [Custom ฟอร์ม]      │ ← ปุ่มแก้ไข     │
│              │ [พิมพ์/ส่งออก]      │                │
│              └─────────┬───────────┘                │
│                        ↓                            │
│              ┌─────────────────────┐                │
│              │ Custom Form Editor   │                │
│              │                     │                │
│              │ ┌─ Column Picker ─┐ │                │
│              │ │ ☑ รหัสทรัพย์สิน  │ │                │
│              │ │ ☑ ชื่ออุปกรณ์    │ │                │
│              │ │ ☐ Serial Number  │ │                │
│              │ │ ☑ สถานะ         │ │                │
│              │ └─────────────────┘ │                │
│              │                     │                │
│              │ ┌─ Column Order ───┐ │                │
│              │ │ 1. รหัสทรัพย์สิน │ │ ← drag/reorder│
│              │ │ 2. ชื่ออุปกรณ์   │ │                │
│              │ │ 3. สถานะ        │ │                │
│              │ └─────────────────┘ │                │
│              │                     │                │
│              │ ┌─ Column Rename ─┐ │                │
│              │ │ รหัส → Asset Code│ │ ← เปลี่ยนชื่อ  │
│              │ │ ชื่อ → Device Name│ │                │
│              │ └─────────────────┘ │                │
│              │                     │                │
│              │ Format: [CSV▼]      │                │
│              │ [บันทึกเป็น Template]│                │
│              │ [ส่งออก]            │                │
│              └─────────────────────┘                │
└─────────────────────────────────────────────────────┘
```

### Data Model (Prisma):

```prisma
model ExportTemplate {
  id          String   @id @default(cuid())
  name        String                    // "ฟอร์มอุปกรณ์มาตรฐาน"
  page        String                    // "devices" | "work-orders" | "stock" | "meter" | "audit" | "paper" | "monthly" | "dashboard"
  type        String                    // "export" | "print" | "sticker"
  isDefault   Boolean  @default(false)  // ฟอร์มตั้งต้นของระบบ
  isSystem    Boolean  @default(false)  // ลบไม่ได้
  createdBy   String?                   // user email (null = system)
  config      String                      // JSON: { columns, format, options }
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([page, type])
  @@index([isDefault])
}
```

### Config JSON structure:

```typescript
interface ExportTemplateConfig {
  columns: ExportColumn[]      // selected + ordered columns
  format: 'csv' | 'xlsx' | 'pdf'
  options: {
    includeHeader: boolean      // แสดงหัวคอลัมน์
    includeTimestamp: boolean    // แสดงวันที่ส่งออก
    includeFilters: boolean     // แสดงตัวกรองที่ใช้
    pageSize?: 'a4' | 'a3' | 'letter'  // สำหรับ PDF
    orientation?: 'portrait' | 'landscape'
  }
}

interface ExportColumn {
  key: string          // "assetCode"
  label: string       // "รหัสทรัพย์สิน" (default) หรือ "Asset Code" (custom)
  group?: string      // "ข้อมูลทั่วไป" | "ที่ตั้ง" | "การเงิน"
  selected: boolean   // ✓ / ✗
  order: number       // ลำดับการแสดง
}
```

---

## 📋 หน้าที่ต้องมี Export/Print Template

| # | หน้า | Export Type | Print Type | Columns Available |
|---|-----|-------------|-----------|-------------------|
| 1 | **จัดการอุปกรณ์** | CSV/Excel/PDF | สติกเกอร์ | 30+ (assetCode, name, brand, model, type, status, site, ฯลฯ) |
| 2 | **จดมิเตอร์** | CSV | — | meterBw, meterColor, pagesBw, pagesColor, readingDate, readBy, ฯลฯ |
| 3 | **แจ้งซ่อม** | CSV/Excel | ใบงาน (PDF) | woNumber, subject, status, priority, reporter, assignedTo, ฯลฯ |
| 4 | **สต๊อก** | CSV/Excel | — | productCode, productName, quantity, unitCost, totalValue, ฯลฯ |
| 5 | **วิเคราะห์กระดาษ** | CSV/Excel | PDF (print) | month, bwPages, colorPages, totalPages, cost, ฯลฯ |
| 6 | **ศูนย์รายงาน** | — | PDF (print) | ขึ้นกับ report group |
| 7 | **รายงานรายเดือน** | CSV | PDF (print) | workOrders, stock, devices summary |
| 8 | **ประวัติการใช้งาน** | CSV | — | date, action, entity, actor, summary |
| 9 | **Dashboard** | — | PDF | KPI cards + charts |

---

## 🚀 Implementation Plan — 4 Phases

### Phase 1: Extend ExportTemplate model + default templates (3 วัน)

**Tasks:**
1. เพิ่ม `ExportTemplate` model ใน `prisma/schema.prisma`
2. สร้าง default templates สำหรับทุกหน้า (9 หน้า × 1 default = 9 templates)
3. สร้าง API `/api/export-templates` (GET list, POST create, PUT update, DELETE)
4. สร้าง API `/api/export-templates/[id]/activate` (ตั้งเป็น default)

**Default templates:**
```
devices-export-default     → 15 columns, CSV, includeHeader=true
meter-export-default       → 8 columns, CSV
workorders-export-default  → 12 columns, CSV
stock-export-default       → 10 columns, CSV
paper-export-default       → 6 columns, CSV
audit-export-default       → 5 columns, CSV
monthly-print-default     → all sections, PDF, A4 portrait
dashboard-print-default   → KPI + charts, PDF, A4 landscape
devices-sticker-default    → small size, QR + assetCode + name
```

### Phase 2: Universal Export Dialog (4 วัน)

**Tasks:**
1. ย้าย `custom-export-dialog.tsx` → `src/shared/components/export-dialog.tsx` (universal)
2. เพิ่ม features:
   - **Template selector** (dropdown บนสุด — เลือก default หรือ custom)
   - **Column rename** (คลิกที่ label → แก้ไขชื่อได้)
   - **Save as template** (บันทึก config เป็น template ใหม่)
   - **Delete template** (ลบ custom template — ห้ามลบ system default)
3. เชื่อมทุกหน้าเข้ากับ Export Dialog:
   - Devices → มีอยู่แล้ว ✅
   - Meter, Work Orders, Stock, Paper, Audit → เพิ่ม
4. ทุกหน้าส่ง `availableColumns` เข้า dialog

### Phase 3: Print Template Selection (3 วัน)

**Tasks:**
1. สร้าง `PrintTemplateDialog` — เปิดก่อนสั่ง print
2. แสดง template options:
   - เลือก template (default / custom)
   - เลือกหน้ากระดาษ (A4 / A3 / Letter)
   - เลือกทิศทาง (Portrait / Landscape)
   - เลือก sections ที่จะพิมพ์ (สำหรับ Monthly Report)
3. แทนที่ `window.print()` ด้วย `PrintTemplateDialog` ในทุกหน้า:
   - Dashboard → PDF
   - Paper Analytics → PDF
   - Monthly Report → PDF
   - Reports Hub → PDF
4. สำหรับสติกเกอร์:
   - เพิ่ม template selector ใน `StickerPrintDialog`
   - เลือก sticker template ก่อนพิมพ์

### Phase 4: UX Polish + Persist (2 วัน)

**Tasks:**
1. บันทึก last-used template ใน localStorage (จดจำตัวเลือกล่าสุด)
2. Auto-select default template เมื่อเปิด dialog
3. Preview ก่อน print/export:
   - CSV: แสดง 5 แถวแรกในตาราง
   - PDF: แสดง preview หน้าแรก
   - Sticker: แสดง preview สติกเกอร์
4. Drag-and-drop reorder (ใช้ @dnd-kit ที่มีอยู่แล้ว)
5. Column grouping (จัดกลุ่มคอลัมน์: ข้อมูลทั่วไป / ที่ตั้ง / การเงิน)

---

## 📁 File Structure

```
src/
├── shared/
│   ├── components/
│   │   ├── export-dialog.tsx          ← Universal Export Dialog
│   │   ├── print-template-dialog.tsx   ← Print Template Selection
│   │   └── sticker-template-dialog.tsx ← Sticker Template Selection
│   └── types/
│       └── export-template.ts          ← ExportTemplate types
├── modules/
│   └── templates/
│       ├── service.ts                  ← TemplateService (CRUD)
│       ├── repository.ts               ← db.exportTemplate.*
│       └── api.ts                      ← /api/export-templates
```

---

## 🎯 Acceptance Criteria

### ✅ ฟอร์มตั้งต้นจากระบบ
- [ ] ทุกหน้า (9 หน้า) มี default template
- [ ] Default template ลบไม่ได้ (isSystem=true)
- [ ] Default template แก้ไขไม่ได้ (แต่ copy แล้วแก้ได้)

### ✅ Custom ฟอร์ม + หัวคอลัมน์
- [ ] เลือก/ยกเลิกคอลัมน์ได้ (checkbox)
- [ ] เรียงลำดับคอลัมน์ได้ (drag-and-drop หรือ up/down)
- [ ] เปลี่ยนชื่อหัวคอลัมน์ได้ (click to edit)
- [ ] จัดกลุ่มคอลัมน์ได้ (ข้อมูลทั่วไป / ที่ตั้ง / การเงิน)
- [ ] บันทึกเป็น template ใหม่ได้ (save as)
- [ ] ลบ custom template ได้

### ✅ เลือกฟอร์มก่อนปริ้น
- [ ] กดปุ่ม Export/Print → เปิด Template Selection Dialog
- [ ] แสดงรายการ templates (default + custom)
- [ ] เลือก template → แสดง preview
- [ ] กด "พิมพ์/ส่งออก" → ทำงานตาม template ที่เลือก
- [ ] จดจำ template ล่าสุด (localStorage)

### ✅ ทุกหน้ามี Export/Print
- [ ] Devices: Export CSV/Excel/PDF + Sticker print ✅ (มีอยู่แล้ว)
- [ ] Meter: Export CSV
- [ ] Work Orders: Export CSV + Print ใบงาน
- [ ] Stock: Export CSV
- [ ] Paper Analytics: Export CSV + Print PDF
- [ ] Audit: Export CSV
- [ ] Monthly Report: Export CSV + Print PDF
- [ ] Dashboard: Print PDF
- [ ] Reports Hub: Print PDF

---

## 📊 Estimated Effort

| Phase | เวลา | Tasks |
|-------|------|-------|
| Phase 1: Model + defaults | 3 วัน | Prisma model + 9 default templates + API |
| Phase 2: Universal Export Dialog | 4 วัน | ย้าย + เพิ่ม features + เชื่อมทุกหน้า |
| Phase 3: Print Template Selection | 3 วัน | PrintTemplateDialog + แทนที่ window.print |
| Phase 4: UX Polish | 2 วัน | Preview + drag-drop + persist |
| **รวม** | **12 วัน** | |

---

**สร้างโดย:** QA Team
**วันที่:** 2026-08-24
