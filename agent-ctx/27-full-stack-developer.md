# Task ID: 27 — Add 6 missing ITAM UI features

## Scope
Add Device CRUD, Device Detail Drawer (with meter/assignment/maintenance tabs), Audit Log Viewer, Dashboard enhancements (PDF/Sites/Heatmap/Cycle modals), Bulk Meter Entry, CSV Export to the Next.js ITAM pages.

## Outcome
All 6 features implemented against real DB (2,378 devices, 14,269 readings, 281 audit logs). Lint clean (EXIT 0). All /api/itam/* routes return 200/201.

## Files touched
- NEW: src/components/itam/itam-audit.tsx (220 lines)
- NEW: src/components/itam/itam-device-detail-sheet.tsx (360 lines)
- REWRITTEN: src/components/itam/itam-devices.tsx (470 lines — added CRUD + CSV export + detail sheet trigger)
- REWRITTEN: src/components/itam/itam-meter.tsx (480 lines — added inline BulkMeterDialog)
- REWRITTEN: src/components/itam/itam-dashboard.tsx (360 lines — added PDF + Sites + Heatmap + Cycle modals)
- EXTENDED: src/app/api/itam/audit/route.ts (added page+pagination)
- EXTENDED: src/app/api/itam/dashboard/route.ts (added ?extra=1 → heatmap + per-site stats)
- src/store/app-store.ts (added 'itam-audit' page type)
- src/components/itam/sidebar.tsx (added nav item "📜 ITAM ประวัติ")
- src/app/page.tsx (added ItamAudit import + render)
- src/components/itam/footer.tsx (added itam-* page labels)

## Test results
- /api/itam/audit?page=1&limit=3 → 281 total, 3 returned with pagination metadata ✓
- /api/itam/audit?action=LOGIN → 54 LOGIN records filtered ✓
- /api/itam/dashboard → 5 totals + byType + bySite (6 sites with deviceCount+activeCount+paperSheets) ✓
- /api/itam/dashboard?extra=1 → adds heatmapMonths[6] + heatmap[12 rows × 6 months] ✓
- /api/itam/devices/100 → device + 10 meterReadings + assignments + maintenanceLogs ✓
- POST /api/itam/maintenance → 201 created (cleaned up via DELETE) ✓
- POST /api/itam/assignments (real device) → 201 created (cleaned up via DELETE) ✓
- POST /api/itam/meter-readings → 201 created (cleaned up via Prisma) ✓
- Lint EXIT 0

## Known out-of-scope issue
- /api/notifications route uses OLD schema fields (assetCode/name/purchaseDate/warrantyMonths/type) — pre-existing, was already failing before Task 27, will be addressed separately
