# A6-STOCK — Stock (สต๊อก) API + UI

**Agent**: full-stack-developer
**Task ID**: A6-STOCK
**Parent**: /home/z/my-project
**Worklog section**: appended to /home/z/my-project/worklog.md

## Files created

**API routes** (all use `import { db } from '@/lib/db'`, `logAudit`, return `{ data }` / `{ data: [...], pagination, stats }`):

- `src/app/api/stock-items/route.ts` — GET (list+filter+pagination+stats) + POST (create with auto `STK-NNNN`)
- `src/app/api/stock-items/[id]/route.ts` — GET (detail w/ transactions) + PUT + DELETE (soft delete)
- `src/app/api/stock-items/[id]/transaction/route.ts` — POST (IN/OUT/ADJUST, atomic via `db.$transaction`, auto `STX-YYYYMMDD-NNN`)
- `src/app/api/purchase-orders/route.ts` — GET (list) + POST (create with items, auto `PO-YYYYMMDD-NNN`, computes totalValue)
- `src/app/api/purchase-orders/[id]/route.ts` — GET (detail w/ items) + PUT (status)

**UI**:
- `src/components/itam/stock-page.tsx` — named export `StockPage`, 'use client', ~1000 lines.

## Files modified

- `src/store/app-store.ts` — added `'stock'` to ActivePage union.
- `src/components/itam/sidebar.tsx` — added `{ page: 'stock', icon: '📦', label: 'สต๊อก' }` to NAV_ITEMS.
- `src/app/page.tsx` — imported `StockPage` + added render branch.
- `src/lib/db.ts` — extended staleness probe to also check stockItem/stockTransaction/purchaseOrder/purchaseOrderItem.

## Verification

- `bun run lint` → 0 errors, 0 warnings.
- `bun run db:push` regenerated Prisma Client; touched next.config.ts to force HMR pickup.
- All 5 endpoints verified end-to-end via curl (200/201; 400 with Thai messages for business-rule errors like insufficient stock / duplicate productCode / missing stockItemId).
- Atomic transaction verified: IN→+5 (balance 15), OUT→-3 (balance 12), ADJUST→=20 (balance 20). Insufficient-stock OUT returns 400.
- Stats computed correctly: total=2, lowStock=1, totalValue=5400 (10×450 + 5×180), thisMonth=2.
- AuditLog entries created for all CREATE/UPDATE/DELETE/STOCK_IN/OUT/ADJUST operations with Thai summaries.

## Notes for downstream agents

- The db.ts staleness probe now also covers StockItem/StockTransaction/PurchaseOrder/PurchaseOrderItem. If you add more Prisma models, extend the probe in `src/lib/db.ts` accordingly.
- Pre-existing /api/work-orders "Cannot read properties of undefined" error is now resolved as a side effect of the db.ts probe extension (the cached client gets rebuilt when any expected model is missing).
- Pre-existing /api/dashboard error ("column lastMeterReading does not exist") is unrelated to this task — left untouched.
- The StockPage uses these TanStack Query keys: `['stock-items', search, category, lowStockOnly]`, `['purchase-orders']`, `['stock-item-detail', detailId]`. Invalidation patterns: after item CRUD → `['stock-items']` (+ `['stock-item-detail', id]` if editing the currently-open detail); after txn → both `['stock-items']` and detail key.
