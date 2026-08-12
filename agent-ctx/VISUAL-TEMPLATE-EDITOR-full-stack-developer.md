# Task ID: VISUAL-TEMPLATE-EDITOR — Work Record

**Agent:** full-stack-developer (GLM)
**Date:** 2026-08-12
**Status:** ✅ Complete

## What was built

A complete **Visual WYSIWYG Template Editor** for the ITAM project — a
drag-and-drop editor that lets users design document templates on a
simulated paper canvas (A4 / A5 / Letter), and a "template binding"
system that lets the user fix a template to a work order so the next
print uses it automatically.

## Files created

| Path | Purpose |
|------|---------|
| `src/lib/template-editor.ts` | Shared types (TemplateElement × 6 types), mm↔px helpers, paper sizes, default layouts, sample data, interpolate() |
| `src/app/api/templates/[id]/render/route.ts` | POST endpoint — renders a template to print-ready HTML using real WO data |
| `src/app/api/work-orders/[id]/print-template/route.ts` | PATCH endpoint — saves `printTemplateId` on a WO (+ optionally promotes default) |
| `src/components/itam/template-editor.tsx` | The WYSIWYG editor — canvas, draggable/resizable elements, toolbar, properties panel, undo/redo |
| `src/components/itam/template-print-dialog.tsx` | The print picker dialog — fixed-template banner, remember checkboxes, calls render API |

## Files modified

| Path | Change |
|------|--------|
| `prisma/schema.prisma` | Added `printTemplateId String?` on `WorkOrder`, `isFixed Boolean @default(false)` on `DocumentTemplate` |
| `src/components/itam/templates-page.tsx` | Replaced JSON editor with `TemplateEditor`; added isFixed toggle/badge |
| `src/components/itam/work-orders-page.tsx` | Replaced `WoPrintForm` with `TemplatePrintDialog`; added `printTemplateId` to WorkOrder type |

## Test results (curl against running dev server)

```
GET  /api/templates?type=work-order              → 200, isFixed: false ✅
POST /api/templates/[id]/render  workOrderId=…   → 200, html returned ✅
PATCH /api/work-orders/[id]/print-template       → 200, printTemplateId updated + AuditLog written ✅
bun run lint                                     → 0 errors, 0 warnings ✅
GET /                                            → 200 ✅
```

## Key design decisions

1. **Units** — All measurements stored in millimetres internally; the
   display layer multiplies by `MM_TO_PX ≈ 3.7795` for screen rendering
   and the rendered HTML uses absolute positioning in `mm` so prints
   come out at the correct physical size.
2. **Drag/resize** — Implemented from scratch with mousedown/mousemove/
   mouseup listeners; 8 resize handles per element; drag snaps to 1 mm.
3. **Inline text editing** — `contentEditable` div, double-click to
   activate; cursor is moved to end on focus.
4. **QR codes** — Generated via `https://api.qrserver.com/v1/create-qr-code/`
   as a simple `<img>` tag (no library install needed). Works both
   client-side (preview) and server-side (render API).
5. **Tables** — Columns are fully configurable (add/remove/reorder,
   editable header, adjustable width, field name). Rows are pulled from
   one of 4 data sources at print time: `work-order-items`,
   `stock-transactions`, `devices`, `custom`.
6. **Template binding** — Two levels of "remember":
   - `printTemplateId` on `WorkOrder` (per-WO)
   - `isFixed` + `isDefault` on `DocumentTemplate` (per-type)
7. **History** — Editor keeps a 50-step undo/redo ring buffer; Ctrl+Z
   and Ctrl+Shift+Z (or Cmd on mac).
8. **Backwards compatibility** — Existing `WoPrintForm` is preserved
   (still imported by other routes if any); the work-orders page now
   uses the new `TemplatePrintDialog` instead.

## What's next (out of scope)

- Multi-page templates (currently single page)
- Element rotation (UI scaffolding exists in the type but is not exposed)
- Export to PDF directly (currently relies on browser's print-to-PDF)
- Locking/grouping elements
