# Task WO-MULTIIMG-QR — Multi-image per stage + QR scan in Work Orders

**Agent:** full-stack-developer (single agent — no subagents needed)
**Task ID:** WO-MULTIIMG-QR
**Date:** 2025
**Parent project:** /home/z/my-project

## Goal

Upgrade the WorkOrder (แจ้งซ่อม) UI in the Next.js ITAM project:

1. **Multi-image per stage (9 รูป/ขั้นตอน)** — replace the old single
   `picBefore` / `picOnsite` / `picAfter` columns with the new
   `WorkOrderImage` relation. Both the create form ("before" stage) and
   the detail dialog (all three stages) must support up to 9 images,
   with thumbnails, per-image delete, and full-size view.
2. **QR / barcode scan** in the WO form's asset-code field and in the
   WO list search box.
3. **Search improvement** — already matched `employeeCode` /
   `assignedTo` / `detailsAdmin` / `resolution` server-side; updated the
   placeholder text to advertise it.

## Approach (single-agent, no subagents)

The task touched a tightly-coupled set of files (store, global UI,
API route, page component) so it was done in one pass instead of
spawning subagents:

1. **`src/store/app-store.ts`** — added `qrScannerOpen`,
   `setQrScannerOpen`, `lastQrScan`, `qrScanNonce`, `publishQrScan`,
   `clearLastQrScan`. The nonce lets consumers detect repeated scans of
   the same value.
2. **`src/components/itam/qr-scanner-dialog.tsx`** (new) — global
   scanner. Uses `getUserMedia({ video: { facingMode: { ideal:
   'environment' } } })` for the back camera, runs `jsQR` on each
   `requestAnimationFrame` from a hidden canvas, falls back to manual
   text entry if camera is blocked/unavailable.
3. **`src/app/page.tsx`** — mounts `<QrScannerDialog />` alongside
   `<GlobalSearch />`.
4. **`src/app/api/work-orders/[id]/images/route.ts`** (new) —
   `GET` returns `{ data: WorkOrderImage[], grouped: { before, onsite, after } }`,
   `POST` body `{ stage, image_data, fileName?, uploadedBy? }`,
   `DELETE ?imageId=` removes one row. Cap 12 images/stage; audit logs
   each add/delete.
5. **`src/app/api/work-orders/route.ts`** — POST now also accepts
   `picBeforeImages: string[]`; each item becomes a `WorkOrderImage`
   row with `stage='before'`. Legacy single-`picBefore` is mirrored
   into the table when the array is empty (backward compat).
6. **`src/components/itam/work-orders-page.tsx`** (the big one):
   - New `WorkOrderImage` + `ImagesGroupedResponse` types
   - `NewFormState.picBeforeImages: string[]` replaces the single pic
   - `compressImage` reworked: canvas resize to max **1024 px**, JPEG
     **quality 0.7**, white-bg fill, step-down to 0.4 if > 1.5 MB
   - Create dialog: hidden `<input type="file" accept="image/*"
     capture="environment" multiple>` reuses one ref; thumbnail grid
     with per-image `X` delete; `ScanLine` button inside the
     asset-code field that calls `setQrScannerOpen(true)`
   - List search: same `ScanLine` button inside the input; placeholder
     now lists `รหัสพนักงาน / ช่าง / ผลการแก้ไข`
   - Detail content: `useQuery(['wo-images', wo.id])`, plus
     `useMemo`s for `beforeImages`/`onsiteImages`/`afterImages` that
     fall back to legacy `picBefore`/`picOnsite`/`picAfter` (synthetic
     IDs prefixed `legacy-`)
   - New `WoImageStageGroup` component (replaces old `WoImage`):
     colored dot per stage, count badge, "เพิ่มรูป" button, thumbnail
     grid with hover toolbar (Eye = view full size, Trash2 = delete)
   - Full-size lightbox dialog (black backdrop, object-contain, X
     button)
   - Scan-consumer arbitration: `WorkOrdersPage` only consumes a scan
     when `!createOpen`; `CreateWorkOrderDialog` only consumes when
     `open`. Both depend on `qrScanNonce`.

## Verification

- `bun run lint` → **0 errors, 0 warnings**
- `prisma generate` + `prisma db push` confirmed `WorkOrderImage` is in
  the client and the SQLite table exists.
- API contract:
  - `GET /api/work-orders/[id]/images` → `{ data, grouped: { before, onsite, after } }`
  - `POST /api/work-orders/[id]/images` body `{ stage, image_data, fileName?, uploadedBy? }` → 201
  - `DELETE /api/work-orders/[id]/images?imageId=…` → `{ ok: true }`

## Notes for future agents

- The `QrScannerDialog` is global; any page can open it via
  `useAppStore.getState().setQrScannerOpen(true)` and consume the scan
  by subscribing to `qrScanNonce` (NOT `lastQrScan` directly — repeated
  identical scans won't fire a state change otherwise).
- Legacy single-pic images on old WOs appear as `legacy-` prefixed
  synthetic `WorkOrderImage` rows. They are read-only (no delete
  button). To migrate them properly, run a one-shot script that
  copies `picBefore`/`picOnsite`/`picAfter` into `WorkOrderImage`
  rows and nulls the originals.
- The complete dialog still has its own single-picAfter upload. Both
  flows coexist: if no `WorkOrderImage` row exists for stage `after`,
  the legacy `picAfter` is shown; once any `after` WorkOrderImage is
  added, the legacy one is hidden.
