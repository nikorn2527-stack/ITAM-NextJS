# Task A7-SETTINGS — Settings Page V2

**Agent:** full-stack-developer
**Task ID:** A7-SETTINGS
**Date:** 2025

## Goal

Build the Settings page (`SettingsPageV2`) for the ITAM project at `/home/z/my-project`:
- Tab 1: Organization Profile (ชื่อแอป, โลโก้, tagline, สี, ประเภทอุตสาหกรรม, ภาษา, สกุลเงิน)
- Tab 2: Asset Number Pattern (list + activate + create dialog with live preview)
- Tab 3: General settings (Allow Excel Import, Timezone)

## Files Created / Modified

| File | Action | Notes |
|------|--------|-------|
| `src/components/itam/settings-page-v2.tsx` | **Created** | New 'use client' component `SettingsPageV2` (~810 lines) |
| `src/app/page.tsx` | **Modified** | Swapped `SettingsPage` → `SettingsPageV2` for the `settings` active page; old `settings-page.tsx` preserved for reference |

## Implementation Details

### APIs used (already existed)
- `GET/PUT /api/settings/org-profile` → returns `{ profile: OrgProfile }`
- `GET/POST /api/settings/asset-patterns` → returns `{ patterns: [...], active: {...} }`
- `POST /api/settings/asset-patterns/[id]/activate` → returns `{ ok: true }`

### Component structure
- `SettingsPageV2` (main) — wraps `useQuery(['org-profile'])`, renders header + `<Tabs>` with 3 triggers
- `OrgProfileTab` — `useMutation` to PUT, ColorField sub-component with `<input type="color">` + hex input, live sidebar mockup preview on the right
- `AssetPatternTab` — `useQuery(['asset-patterns'])`, card grid of patterns with `isActive` Badge, "ใช้รูปแบบนี้" button + `useMutation` to activate; create-pattern dialog
- `CreatePatternDialog` — form with name, pattern (monospace), description, defaultPrefix, seqPadding, seqStart; segment help table; live preview using `previewAssetNumber()` helper
- `GeneralTab` — Switch for `allowExcelImport`, Select for timezone, save button

### Live preview helper
`previewAssetNumber(pattern, defaultPrefix)` replaces `{prefix}`, `{seq:N}`, `{year:2|4}`, `{month:2}`, `{dept:N}`, `{type:N}`, `{site:N}` with mock values so the admin sees what their generated asset code will look like before saving.

### Logo preview helper
`LogoPreview` — if `logoUrl` starts with `http`/`https`, render `<img>`; else render a styled div with the emoji/text (up to 2 chars); fallback to `<Building2>` icon. Used both in the form and in the sidebar mockup.

### Styling
- Orange (#f97316) primary color and teal (#0d9488) accent color used throughout for consistency with the rest of the app
- No indigo/blue colors used
- Tailwind responsive (`md:grid-cols-2`, `lg:grid-cols-[1fr_320px]`)
- Skeletons for loading states; toast (sonner) for feedback

## Verification

- `bun run lint` → **0 errors, 0 warnings** ✅
- Dev server log shows `GET /` returning 200 OK ✅
- File structure validated; `SettingsPageV2` exported as named export ✅

## Decisions / Notes
- Old `settings-page.tsx` kept intact for reference (not deleted)
- The PUT `/api/settings/org-profile` expects the full profile; in `GeneralTab` we merge the existing profile with the changed fields before PUT, so saving only `allowExcelImport` + `timezone` doesn't wipe other fields
- Default pattern values in create dialog: `{prefix}-{seq:5}`, prefix `ASSET`, seqPadding 5, seqStart 1 — matches the simplest existing default pattern
- Color picker is the native `<input type="color">` paired with a hex text input for flexibility
