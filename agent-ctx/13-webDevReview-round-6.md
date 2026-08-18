# Task 13 — webDevReview round 6 (full-stack-developer)

Started: round 6 enhancements to stable ITAM Next.js app.

## Scope (3 features + styling polish)

### Feature 1 — Notifications Panel (Alerts Center)
- New API `src/app/api/notifications/route.ts` aggregates:
  1. Warranty expired / expiring (within 30 days) — uses purchaseDate + warrantyMonths.
  2. Meter reminders — meterable devices not yet read in active cycle.
  3. Cycle ending soon (endDate within 7 days).
  4. Recent audit activity (last 3 CREATE/DELETE/BULK_*).
- New component `src/components/itam/notifications-popover.tsx`:
  - Popover triggered by bell button.
  - Red/orange badge with unread count, pulse animation when there are expired alerts.
  - Filter tabs: ทั้งหมด / รอบจดมิเตอร์ / รับประกัน / ระบบ.
  - Items have colored left border by severity (rose=expired, amber=expiring/warning, teal=info).
  - Click item → navigate to relevant page (devices/meter/cycle manage).
  - Mark-all-read stored in localStorage (timestamp).
- Bell is rendered in the sidebar header area.

### Feature 2 — Auto-create Next Cycle + Cycle Templates
- AppSetting keys: `cycleTemplate.enabled`, `cycleTemplate.durationDays`, `cycleTemplate.autoCreate`.
- When ending a cycle in cycle-manage-dialog → if `cycleTemplate.autoCreate === 'true'`, show a suggestion dialog (success emerald check + new cycle form preview) → "สร้างรอบใหม่" creates a cycle starting today, ending today + durationDays; "ภายหลัง" closes.
- Settings AppTab gets a new "ตั้งค่ารอบจดมิเตอร์อัตโนมัติ" Card with CalendarClock icon header, subtle gradient bg, switch + number input + helper text.

### Feature 3 — Dashboard PDF Export
- New `src/components/itam/dashboard-pdf-export.tsx` — `exportDashboardPdf(data, range, orgName)` opens a new window, writes a full HTML doc with @page A4 + print CSS, professional layout (orange accent headers, slate text, bordered tables, Thai font stack).
- Dashboard page gets a "📄 ส่งออก PDF" button in the toolbar (after refresh, before/after seed).
- Popup-blocked → toast warning.

### Styling polish
- Bell: pulsing red dot when there are critical (expired) alerts. Badge count with orange bg. Hover state.
- Notification items: colored left border (4px) by severity, subtle hover bg, icon in soft-colored circle.
- Cycle auto-suggestion dialog: success emerald check icon + clear form preview for the new cycle.
- Dashboard PDF button: matching style with other toolbar buttons, focus-visible ring.
- Settings cycle template section: distinct Card with CalendarClock icon header, subtle gradient bg.
- Sidebar header: bell + theme toggle + logo well-aligned, no overflow on mobile.

## Files planned

NEW:
- `src/app/api/notifications/route.ts`
- `src/components/itam/notifications-popover.tsx`
- `src/components/itam/dashboard-pdf-export.tsx`

EDIT:
- `src/components/itam/sidebar.tsx` (add bell)
- `src/components/itam/dashboard-page.tsx` (PDF button + onClick)
- `src/components/itam/cycle-manage-dialog.tsx` (auto-create suggestion dialog after end action)
- `src/components/itam/settings-page.tsx` (cycle template Card in AppTab)

## Context loaded
- Read worklog (Tasks 1-12).
- Re-read prisma schema, sidebar, dashboard-page, cycle-manage-dialog, types, settings-page AppTab, dashboard API, settings API, cycles API, meter reminders API, devices warranty API, audit API.
- Sidebar classic dark layout (240px, #0f172a, orange active accent #f97316/#fb923c) preserved exactly.
- Dev server healthy (200s across all endpoints).
