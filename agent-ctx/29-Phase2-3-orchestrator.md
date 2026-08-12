# Task ID: 29-Phase2-3
# Agent: orchestrator (main) — Phase 2 (Location Transfer) + Phase 3 (Keyboard Meter)

## Scope
Implement the two missing Apps Script parity features in the Next.js ITAM app:
1. **Phase 2** — Location Transfer API + Transfer Dialog UI + AssetSiteCode auto-generation + meter-required-before-transfer enforcement.
2. **Phase 3** — Keyboard-driven meter reading page (search + ↑↓ + Enter to save + progress bar + recently keyed).

## Files added
- `src/lib/asset-site-code.ts` — pure helpers (`parseAssetSiteCodeSeed`, `formatAssetSiteCode`, `normalizeAssetSiteCodeForCompare`, `getSiteCodeForName`, `getSiteNameForCode`, `getNextAssetSiteCode`). The `getNextAssetSiteCode` function:
  - Looks up the SiteCode prefix from `SiteAttribute` (falls back to uppercased site name slice).
  - Probes `LocationHistory` for any prior `toSite === target` row → REUSES that `toAssetSiteCode` (matches GAS "ใช้ทะเบียน Site เดิมเมื่อย้ายกลับ Site ที่เคยอยู่").
  - Otherwise finds `MAX(assetSiteCode)` across all devices currently at that site AND any historical references, then +1 and zero-pads to 5 digits.
- `src/app/api/itam/devices/[id]/transfer/route.ts` — POST handler. Permission: `DEVICE_TRANSFER`. Captures `from` snapshot, enforces meter-required (returns 400 "ต้องจดมิเตอร์ก่อนย้าย" when `meterRequired && !meterReadingId && !skipMeterReason`), auto-generates AssetSiteCode only on cross-site moves (same-site moves keep the existing code), creates LocationHistory with all from/to fields, links the meter reading back to the history row (`eventType=TRANSFER|TRANSFER_SITE`, `eventId=historyRow.id`, `readingType=CHECKOUT`), and writes an audit log entry. Uses `db.$transaction` so device update + history insert are atomic.
- `src/app/api/itam/meter-readings/unread/route.ts` — GET. Returns `{ month, total, read, unread, devices: [...] }` where `devices` are meterRequired + Active + site-allowed + no reading this month, enriched with `lastMeterBw`, `lastMeterColor`, `readThisMonth`, `readAt`, `readBy`. Supports `?search=`, `?month=`, `?limit=` (up to 500), `?includeRead=1` (also returns up to 20 recently-read at the bottom for the keyboard page's "Recently keyed" sidebar). Site-level row security applied.
- `src/components/itam/itam-meter-keyboard.tsx` — full-height keyboard-driven page. Layout: progress bar on top, left = search + filtered list, right = selected device card + meter inputs + delta + RESET warning, bottom = horizontal scroll of last 5 keyed devices with timestamps. Global `keydown` listener: ↑/↓ navigate list (works even while typing in search), Enter in search jumps to BW input, Enter in BW input (BW_COLOR mode) → focus color input, Enter in color input → save + advance to next unread device, Escape clears search. Inputs pre-fill with `lastMeterBw/lastMeterColor` so user can increment. RESET detection forces remark. CSV export of unread list.

## Files modified
- `src/app/api/itam/meter-readings/route.ts` — POST now:
  - Auto-looks-up `prevMeterBw` / `prevMeterColor` from the device's most recent reading when caller doesn't supply them (keyboard page can omit).
  - Stores `meterColor` properly (was already on schema, but call sites weren't passing it).
  - Auto-tags `readingType='RESET'` when new < prev AND caller didn't specify a type.
  - Returns `{ reading, reset, pagesBw, pagesColor }` so caller can react.
- `src/components/itam/itam-device-detail-sheet.tsx` — added "🔄 ย้ายตำแหน่ง" button to the action bar + a new "ประวัติย้าย" tab showing LocationHistory rows. The new `TransferDialog` (inline component) shows:
  - Read-only "ตำแหน่งปัจจุบัน" panel (site, assetSiteCode, building, floor, department, location).
  - Target site Select (from `/api/itam/sites`).
  - Building / Floor / Department / Location inputs with `<datalist>` suggestions derived from existing devices at the chosen site (cascading).
  - AssetSiteCode input — placeholder shows "อัตโนมัติ" when cross-site, "ปล่อยว่าง = เดิม" when same-site.
  - Meter-required enforcement block (amber panel): "จดมิเตอร์เลย" button (opens inline BW + optional Color inputs, calls POST /api/itam/meter-readings first to obtain a `meterReadingId`) OR "ระบุเหตุผลที่จดไม่ได้" textarea (skipMeterReason).
  - "ยืนยันการย้าย" button → POSTs to `/api/itam/devices/[id]/transfer`, toasts "ย้ายอุปกรณ์แล้ว" (or "กลับสู่ AssetSiteCode เดิม" when `reusedAssetSiteCode=true`), invalidates device list + dashboard queries.
- `src/store/app-store.ts` — added `'itam-meter-keyboard'` to the `ActivePage` union.
- `src/components/itam/sidebar.tsx` — added `{ page: 'itam-meter-keyboard', icon: '⌨️', label: 'จดมิเตอร์ (Keyboard)' }` between ITAM มิเตอร์ and ITAM ตั้งค่า.
- `src/app/page.tsx` — imported `ItamMeterKeyboard`, added `{activePage === 'itam-meter-keyboard' && <ItamMeterKeyboard />}` to the page switch.

## Smoke tests (all passed)

Logged in as `dontham` (editor, allowedSites="โรงพยาบาลศูนย์อุดรธานี", has DEVICE_TRANSFER + METER_WRITE permissions):

| # | Test | Expected | Actual |
|---|------|----------|--------|
| 1 | POST `/api/itam/devices/100/transfer` toSite="โรงพยาบาลนครพนม" (not in allowedSites) | 403 | `403` "ไม่มีสิทธิ์ย้ายอุปกรณ์ไปสาขา: โรงพยาบาลนครพนม" ✓ |
| 2 | POST same-site transfer, no meter, no skipMeterReason (device 100 is meterRequired) | 400 | `400` "ต้องจดมิเตอร์ก่อนย้าย — กรุณาจดมิเตอร์หรือระบุเหตุผลที่จดไม่ได้" ✓ |
| 3 | POST same-site transfer with `skipMeterReason="เครื่องดับ จดไม่ได้"` | 200 + assetSiteCode unchanged | `200` device.assetSiteCode=UDH-00100 (kept), LocationHistory.action=TRANSFER, fromCode=UDH-00100 → toCode=UDH-00100, remark="เครื่องดับ จดไม่ได้", movedBy="dontham", reusedAssetSiteCode=true ✓ |
| 4 | POST `/api/itam/meter-readings` (meterBw=88888, readingType=CHECKOUT) → POST transfer with `meterReadingId` | 201 + 200, meter linked back | `201` meter reading created; `200` transfer created; GET meter-readings shows `eventType=TRANSFER, eventId=cmsp05li` (linked to history row) ✓ |
| 5 | POST `/api/itam/meter-readings` with BOTH `meterBw=12345, meterColor=6789` (BW_COLOR mode) | 201 + both stored + pages computed | `201` reading.meterBw=12345, reading.meterColor=6789, prevMeterBw=12864 (auto-looked-up), prevMeterColor=0, pagesBw=0 (clamped, reset), pagesColor=6789, reset=true ✓ |
| 6 | GET `/api/itam/meter-readings/unread?limit=10` | 200 + progress numbers | `200` { month: "2026-08", total: 722, read: 2, unread: 720, devices: [...] } — site-filtered to dontham's site ✓ |

All test data (transfers, meter readings, audit logs) was cleaned up after testing; device 100 was restored to its original state (UDH-00100, ตึก 69 ปี, 1, ธุรการ, เภสัชกรรม).

## Lint
`bun run lint` — 0 errors, 0 warnings.

## Notes / design decisions
- **Same-site vs cross-site AssetSiteCode behavior**: Apps Script generates a NEW AssetSiteCode on cross-site moves only. Same-site moves keep the existing code (otherwise every within-site relocation would burn a sequence number). The API now branches on `isCrossSite = !device.site || device.site !== toSite` BEFORE generating.
- **Reusing prior AssetSiteCode on return**: When a device moves to a site it has lived at before (per `LocationHistory.toSite`), `getNextAssetSiteCode` returns the prior `toAssetSiteCode` instead of incrementing. This mirrors GAS's "ใช้ทะเบียน Site เดิมเมื่อย้ายกลับ Site ที่เคยอยู่".
- **Meter-required enforcement is two-path**: user can either (a) create a fresh meter reading right inside the transfer dialog (which then gets linked back to the history row via `meterReadingId`), or (b) provide a free-text `skipMeterReason` ("เครื่องดับ", etc.) which is stored on the history row's `remark` field. The API rejects the third option (no meter + no reason) with HTTP 400.
- **Keyboard page focus model**: a single `focus: 'search' | 'meter'` state controls where Enter goes. The global `keydown` handler reads `document.activeElement` to disambiguate "Enter in BW input → jump to color" vs "Enter in color input → save". This keeps the page mouse-free.
- **Auto-prev-lookup on meter POST**: the API now auto-fills `prevMeterBw/prevMeterColor` from the device's most recent reading when the caller omits them. This lets the keyboard page send only `{ assetNo, meterBw, meterColor }` — the server computes the delta and RESET flag.
