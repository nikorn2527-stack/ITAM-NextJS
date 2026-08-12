# STOCK-LINK — Stock Pending Approval + 3-System Link

**Agent**: full-stack-developer
**Task ID**: STOCK-LINK
**Parent**: /home/z/my-project
**Worklog section**: appended to /home/z/my-project/worklog.md

## Objective

Two deliverables:
1. **PART 1 — Stock Pending Approval System**: replicate the old Stock app's "StockOutPending" sheet (20-column approval workflow) as a PENDING/APPROVED/REJECTED state machine on `StockTransaction` that does not reduce stock until approved.
2. **PART 2 — 3-System Link (แจ้งซ่อม → เบิกอะไหล่ → ลดสต็อก)**: wire Work Orders to Stock so a technician can request parts from inside the WO detail dialog, and the WO cannot be closed while parts requests are still PENDING.

## What I read first

- `prisma/schema.prisma` — confirmed `StockTransaction` already had `approver` + `approvedAt` columns (legacy StockOut sheet). Only needed to add `approvalStatus`, `approvalMode`, `autoApproveAt`, `rejectReason`.
- `src/app/api/stock-items/[id]/transaction/route.ts` — pattern for atomic stock update + txn creation; reused for the approve route.
- `src/app/api/work-orders/[id]/complete/route.ts` — to insert the pending-parts check.
- `src/app/api/work-orders/route.ts` — to confirm `woNumber` format `WO-YYYYMMDD-NNN` and audit-log pattern.
- `src/components/itam/work-orders-page.tsx` (~2564 lines) — WorkOrderDetailContent component structure (state, footer buttons, body sections, dialogs at the end).
- `src/components/itam/stock-page.tsx` (~1928 lines) — Tabs structure (items | po), filter bar pattern, table patterns, KPI cards, dialogs.
- `/agent-ctx/A6-STOCK-full-stack-developer.md` and `/agent-ctx/WO-COMPLETE-full-stack-developer.md` for context on prior work.

## Files created

### PART 1 API
- `src/app/api/stock-items/[id]/pending/route.ts` (POST) — create pending stock-out
- `src/app/api/stock-items/[id]/pending/[txnId]/approve/route.ts` (POST) — approve + atomic stock reduction
- `src/app/api/stock-items/[id]/pending/[txnId]/reject/route.ts` (POST) — reject (no stock change)
- `src/app/api/stock-items/pending/route.ts` (GET) — list pending/all with filter

### PART 2 API
- `src/app/api/work-orders/[id]/parts/route.ts` (GET + POST) — list parts + create parts requests
- `src/app/api/work-orders/[id]/parts/[txnId]/approve/route.ts` (POST) — approve parts request

## Files modified

- `prisma/schema.prisma` — added 4 nullable columns to `StockTransaction` (ran `bun run db:push`)
- `src/app/api/work-orders/[id]/complete/route.ts` — block completion when PENDING parts exist (returns the exact Thai message from the spec)
- `src/components/itam/work-orders-page.tsx` — added parts list UI section + parts request dialog + footer "เบิกอะไหล่" button + PartsStatusBadge helper + inline approve/reject
- `src/components/itam/stock-page.tsx` — added 3rd tab "รออนุมัติ" with table, filter bar, reject dialog, pendingStatusBadge helper

## Key design decisions

1. **Stock-item-scoped reject vs WO-scoped approve**: The reject route is `/api/stock-items/{stockItemId}/pending/{txnId}/reject` (it doesn't need to know about the WO). The approve route for parts is `/api/work-orders/{woId}/parts/{txnId}/approve` because it posts a system message on the WO. This keeps the approve UI's WO context tight.
2. **Shared SP-YYYYMMDD-NNN counter**: Both PART 1 (direct pending) and PART 2 (WO parts) use the same `SP-YYYYMMDD-NNN` txn number prefix, distinct from regular `STX-YYYYMMDD-NNN`. This makes pending requests easy to identify in audit logs.
3. **Atomic approve**: Approve uses `db.$transaction` to ensure the stock reduction + txn update happen together. Insufficient-stock check is inside the transaction.
4. **WO status auto-transition**: When a parts request is created, if the WO is not already IN_PROGRESS/WAITING_PARTS, it's flipped to WAITING_PARTS (matches the 3-system link spec: "รออะไหล่").
5. **Null approvalStatus = "immediate"**: Legacy IN/OUT/ADJUST transactions have `approvalStatus=null`. The pending list `status=all` filter explicitly excludes null rows to keep the legacy data clean.
6. **Real-time stock display**: The parts list API includes the `stockItem` relation so the WO detail UI can show current quantity alongside each requested part. Red "ไม่เพียงพอ" sub-label if `stockItem.quantity < txn.quantity`.

## Verification

- `cd /home/z/my-project && bun run lint 2>&1 | tail -5` → 0 errors, 0 warnings.
- `bun run db:push` → schema synced; Prisma client regenerated.
- Started dev server briefly and ran a full end-to-end test:
  - PART 1: create pending → list PENDING → reject → list REJECTED (all correct).
  - PART 2: create parts request → WO status PENDING→WAITING_PARTS → complete blocked with exact Thai message → approve guard returns "สต็อกไม่เพียงพอ" on a 0-quantity item (expected).
- All approval fields (`approvalStatus`, `approvalMode`, `autoApproveAt`, `rejectReason`, `approver`, `approvedAt`) populated correctly.
- Atomic transaction verified on approve (stock reduction + txn update succeed together; insufficient stock throws inside the tx).

## TanStack Query keys

- `['stock-pending', pendingFilter, pendingDebouncedSearch]` — stock page pending tab
- `['wo-parts', wo.id]` — work order detail parts list

Invalidation patterns:
- Approve parts → `['wo-parts', wo.id]`, `['stock-items']`, `['stock-pending']`
- Reject parts → `['wo-parts', wo.id]`, `['stock-pending']`
- Approve pending → `['stock-pending']`, `['stock-items']`, `['stock-item-detail', detailId]` (if open)
- Reject pending → `['stock-pending']`

## Notes for downstream agents

- The `approver`/`approvedAt` fields are reused from the legacy StockOut sheet — no migration conflicts.
- The pending list query at `/api/stock-items/pending` includes the `stockItem` relation (selecting productCode, productName, unit, quantity, active). Useful for any future UI that wants to show current stock alongside each request.
- The WO detail's parts list uses a separate query key `['wo-parts', wo.id]` so it can be invalidated independently of `['work-order', id]` (which is the WO itself). This avoids a full WO refetch on every approve/reject.
- The work-orders-page.tsx file is now ~3160 lines. Future refactors might want to extract the parts dialog + parts list into separate components, but it's manageable for now.
- The stock-page.tsx file is now ~2360 lines. Same caveat — extract pending tab into its own component if it grows further.
