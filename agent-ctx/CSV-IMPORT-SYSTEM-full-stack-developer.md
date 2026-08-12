# Task: CSV-IMPORT-SYSTEM

**Agent:** full-stack-developer
**Date:** 2026-08-12
**Status:** ✅ Completed

## Summary

สร้างระบบ CSV import ที่ดึงข้อมูลจาก 3 แอป Apps Script (IT-Asset-Management, Services, Stock) ที่กำลังใช้งานจริง เข้าสู่ Next.js app โดย **ไม่เปลี่ยน Prisma schema** (ใช้ mapping layer แปลง field names แทน)

## Files Created/Modified

| File | Action | Lines |
|------|--------|-------|
| `src/lib/csv-field-mapping.ts` | Created | ~520 |
| `src/app/api/import/route.ts` | Modified | +1500 |
| `src/components/itam/legacy-import-section.tsx` | Created | ~540 |
| `src/components/itam/import-page.tsx` | Modified | +30 |

## What Was Built

### 1. CSV Field Mapping Layer (`csv-field-mapping.ts`)

- `FIELD_MAPPINGS` — 12 sheet types: device, meterReading, deviceTransfer, user, appSetting, masterItem, site, stockItem, stockIn, stockOut, purchaseOrder, workOrder
- รองรับทั้ง **snake_case** (IT-Asset), **PascalCase** (Stock), และ **JSON-flattened** (Services)
- `STATUS_MAPPINGS` — แปลงสถานะ:
  - `🟠รอดำเนินการ` → `PENDING`
  - `🔵สำรวจหน้างาน/แก้ไข` → `IN_PROGRESS`
  - `🟡รอเบิกอะไหล่` → `WAITING_PARTS`
  - `🟢จบงาน` → `COMPLETED`
  - `⚫ยกเลิกงาน` → `CANCELLED`
  - `Active`/`Inactive` → `true`/`false`
  - `IN_USE` → `active`, etc.
- `TEMPLATE_HEADERS` — หัวคอลัมน์ EXACT ตรงกับระบบเก่าทั้ง 12 sheet
- `SOURCE_SHEET_REGISTRY` — registry ของ 3 sources × 12 sheets
- Helpers: `mapCsvRow`, `parseCsv`, `parseDate`, `parseDateTime`, `parseBool`, `toInt`, `toFloat`, `normalizeKey`
- `mapCsvRow` returns `{ data, unmapped }` — track คอลัมน์ที่ไม่ถูก map เป็น warnings

### 2. Import API (`/api/import`)

เพิ่ม Apps Script legacy import path คู่ขนานกับ manual import เดิม:
- ใช้ field `source` ใน FormData เพื่อเลือก path
- รองรับ 3 sources × 12 sheets
- 12 importer functions (ดูรายละเอียดใน worklog.md)
- ทุก importer ส่งกลับ `{ processed, errors, warnings, unmappedColumns }`
- Audit log: action=`IMPORT_LEGACY`, summary ภาษาไทย
- Response ส่ง `summary` object: expectedHeaders, actualHeaders, unmappedColumns, warnings

### 3. Legacy Import UI (`legacy-import-section.tsx`)

- Step 1: เลือก source (3 การ์ด)
- Step 2: เลือก sheet (grid ของ sheets ใน source)
- Upload zone (drag-drop) + Download template button
- Mapping preview (collapsible) — ตาราง CSV Header → Prisma Field
- Export instructions — คำแนะนำเฉพาะ source
- Result dialog — แสดงสรุป, unmapped columns warning, header comparison, warnings, errors

### 4. Import Page (`import-page.tsx`)

- เพิ่ม Tabs (2 tabs): "นำเข้าใหม่ (Manual)" และ "นำเข้าจากระบบเก่า (Apps Script)"
- Import history table อยู่ใต้ tabs (ใช้ร่วมกัน)
- ปรับ `jobTypeLabel` ให้รู้จัก `"legacy:{sheetId}"` format

## Testing (Live curl Tests)

| Source | Sheet | Rows | Result |
|--------|-------|------|--------|
| apps-script-itam | itam-device (28 cols) | 2 | ✅ 2 processed, 0 unmapped |
| apps-script-itam | itam-meter (21 cols) | 2 | ✅ 2 processed, 4 unmapped (correctly warned) |
| apps-script-services | services-workorders | 2 | ✅ 2 processed, emoji-Thai → enum |
| apps-script-stock | stock-products | 3 | ✅ 1 new + 2 duplicates detected |
| apps-script-stock | stock-in | 1 | ✅ 1 processed, lookup ProductCode → StockItem.id |

## Lint

```
$ bun run lint
$ eslint .
(no output = 0 errors)
```

## Compatibility

- ✅ Existing manual import (4 types: device, work-order, stock, meter-reading) — **ไม่กระทบ**
- ✅ Prisma schema (19 models) — **ไม่เปลี่ยน**
- ✅ Existing ImportJob table — เพิ่มเติมด้วย jobType=`legacy:{sheetId}`
- ✅ Existing UI structure — เพิ่ม Tabs คู่ขนาน
