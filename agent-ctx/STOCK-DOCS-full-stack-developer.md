# STOCK-DOCS — Stock Print/Export Documents

**Task ID:** STOCK-DOCS
**Agent:** full-stack-developer
**Date:** 2026-08-12

## Goal

Add print/export document functionality to the Stock system. Specifically:
- "ใบรับสินค้า" (Stock Receipt) for IN transactions
- "ใบเบิกสินค้า" (Stock Issue) for OUT transactions
- "ใบสั่งซื้อ" (Purchase Order) for each PO
- "Export CSV" buttons for transactions and POs

## Files Created

1. **`src/app/api/stock-items/[id]/print/route.ts`** — GET endpoint that returns a self-contained HTML page for printing a stock transaction.
   - Accepts `?txnId=<id>&type=in|out` query parameters
   - Type is auto-derived from the transaction record if `type` is omitted
   - Groups transactions sharing the same `txnNumber` (multi-item support)
   - HTML includes: header (logo, title, txn number, date), type badge, info section (different fields per type), items table with totals, signatures (different per type), footer
   - For IN: shows supplier, receiver, PO number
   - For OUT: shows requester, department, purpose, approver
   - For ADJUST: shows reason, performed by
   - Print CSS uses `@page { size: A4 portrait; margin: 14mm; }`
   - Auto-triggers `window.print()` on load (only when `window.opener` exists)
   - Includes manual "พิมพ์" and "ปิดหน้าต่าง" buttons
   - Different accent colors per type (emerald for IN, rose for OUT, amber for ADJUST)

2. **`src/app/api/purchase-orders/[id]/print/route.ts`** — GET endpoint that returns a self-contained HTML page for printing a purchase order.
   - HTML includes: header (PO logo, "ใบสั่งซื้อ" title, PO number, order date), status badge, supplier info box, items table (code, name, qty ordered, qty received, unit, unit price, total), total summary, signatures (ผู้สั่งซื้อ, ผู้อนุมัติ, ซัพพลายเออร์), footer
   - Status badge color depends on PO status (open/partial/received/cancelled)
   - Print CSS uses `@page { size: A4 portrait; margin: 14mm; }`
   - Auto-triggers `window.print()` on load

## Files Modified

3. **`src/components/itam/stock-page.tsx`** — Added print + CSV export UI.

   **Imports:** Added `Printer` and `FileDown` icons from `lucide-react`.

   **TypeScript interfaces:**
   - Extended `StockTransaction` with new fields: `stockItemId`, `productCode`, `productName`, `unit`, `unitCost`, `requester`, `department`, `purpose`, `approver`, `approvedAt`, `workOrderNo`, `receiver`, `purchaseOrderNo` (these are returned by the API but were missing from the interface).
   - Cleaned up `PendingStockTransaction` to remove duplicate fields now present in the base interface.

   **Module-level helpers added:**
   - `printDocument(url)` — wraps `window.open(url, '_blank', ...)` and shows a toast error if the pop-up is blocked.
   - `csvCell(value)` — escapes a CSV cell per RFC 4180 (wraps in quotes if it contains comma, quote, or newline; doubles embedded quotes).
   - `downloadCSV(filename, rows)` — builds a CSV file from rows, prepends a UTF-8 BOM so Excel renders Thai correctly, creates a Blob URL, and triggers a download via a temporary `<a>` element.

   **Transaction history table (in detail dialog):**
   - Added "Export CSV" button next to the transaction count badge. Exports all transactions for the current stock item (18 columns including code, name, qty, unit, balance, unit cost, total, vendor/requester, department, purpose, approver, PO number, work order, date, performedBy, remark).
   - Added a new "พิมพ์" column with per-row print buttons:
     - IN transactions: "ใบรับ" button (emerald) → opens `/api/stock-items/{id}/print?txnId={t.id}&type=in`
     - OUT transactions: "ใบเบิก" button (rose) → opens `/api/stock-items/{id}/print?txnId={t.id}&type=out`
     - ADJUST transactions: "ใบปรับ" button (amber) → opens `/api/stock-items/{id}/print?txnId={t.id}`

   **Purchase Orders tab:**
   - Added a header bar above the PO table with the count and an "Export CSV" button. The CSV contains: PO number, order date, supplier, item count, status, total value, ordered by, remark, and a pipe-separated list of items.
   - Added a new "การจัดการ" column with a "พิมพ์ใบสั่งซื้อ" button (teal) per row → opens `/api/purchase-orders/{po.id}/print`.

## Verification

- `bun run lint` — passes with no errors.
- Dev server log shows existing stock-items and purchase-orders API calls still returning 200 OK.
- No compile errors related to the new print routes in the dev log.
- Pre-existing `/api/notifications` and `/api/meter` errors are unrelated to this task.

## Design Notes

- The print HTML pages are fully self-contained (inline CSS, no external dependencies) so they render correctly in a pop-up window.
- Auto-print only fires when `window.opener` exists — prevents accidental print dialogs when users navigate to the URL directly.
- A manual "พิมพ์" button is always available in the bottom-right corner of the print page as a fallback.
- CSV export prepends a UTF-8 BOM (`\uFEFF`) so Microsoft Excel correctly renders Thai characters when opening the file.
- Print accent colors match the existing tab badges: emerald (IN), rose (OUT), amber (ADJUST), teal (PO).
