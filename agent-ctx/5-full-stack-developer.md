# Task ID: 5 — full-stack-developer

## Objective
Build the Next.js 16 preview of the IT Asset Management (ITAM) app at `/home/z/my-project`, replicating the restored classic 240px fixed dark sidebar (branch `restore/classic-sidebar`) with orange active item, 5 pages, device CRUD, meter reading, master data management.

## Plan
- Edit `prisma/schema.prisma` → Device, MasterItem, MeterReading, Cycle, Site, AppSetting
- Edit `src/app/globals.css` → custom scrollbar
- Create `src/app/providers.tsx` → QueryClientProvider
- Create `src/store/app-store.ts` → zustand (activePage, sidebarOpen)
- Create `src/components/itam/sidebar.tsx` → classic 240px dark sidebar
- Create `src/components/itam/footer.tsx` → sticky footer
- Create 5 page components + master-data-modal
- Create API routes under `src/app/api/**`
- Edit `src/app/layout.tsx` (Providers + sonner Toaster)
- Edit `src/app/page.tsx` (app shell)
- `bun run db:push`, `bun run lint`, check dev.log

## Work Log
- Read prior worklog (Task 1 orchestrator restored classic sidebar on branch restore/classic-sidebar).
- Inspected existing scaffold: Next 16, TS 5, shadcn New York, Prisma+SQLite, sonner, recharts, zustand, @tanstack/react-query all already installed.
- Dev server already running on port 3000.

## Final Summary
- Edited `prisma/schema.prisma` → 6 models (Device, MasterItem, MeterReading, Cycle, Site, AppSetting). `bun run db:push` succeeded; Prisma Client generated.
- Created `src/app/providers.tsx` (QueryClientProvider + ThemeProvider), `src/store/app-store.ts` (zustand: activePage/sidebarOpen), `src/components/itam/sidebar.tsx` (classic 240px fixed dark sidebar #0f172a, orange active item #fb923c/#f97316, cycle countdown bar, user role, Powered by PNG TEAM footer, mobile hamburger + backdrop), `src/components/itam/footer.tsx` (sticky mt-auto footer), `src/components/itam/types.ts` (shared types + status helpers).
- Created 5 page components: `dashboard-page.tsx` (4 KPI cards + donut + bar chart + top usage + recent activity + auto-seed-on-empty), `devices-page.tsx` (toolbar search/status/site filters, full CRUD table with Add/Edit Dialog + AlertDialog delete confirm, max-h-[60vh] scroll), `meter-page.tsx` (cycle bento card + devices table + reading Dialog with RESET/exceed-20000 validation + cycle manage dialog), `paper-analytics-page.tsx` (4 KPIs + line chart + horizontal bar chart), `settings-page.tsx` (Tabs: app/master/sites/users, default tab=app, master tab has the 3 restored sync buttons Model/Dept/Labels + CRUD table), `master-data-modal.tsx` (shared MasterItem add/edit modal).
- Created 10 API route files under `src/app/api/**`: devices (list/create + [id] get/put/delete), master (list/create + [id] put/delete + sync POST), meter (list with aggregate=monthly|byDevice + POST with RESET/exceed validation + device.lastMeterReading update), cycles (list/create with auto-end previous active), sites (list/create), dashboard (aggregated totals/byStatus/byType/topUsage/recentActivity), settings (get all / put upsert), seed (POST idempotent: 3 sites, 36 master items, 12 devices, 1 active cycle, ~21 meter readings, 5 settings).
- Edited `src/app/layout.tsx` (Providers wrapper + sonner Toaster + Thai lang + ITAM metadata), `src/app/page.tsx` (app shell: Sidebar + active page + Footer in min-h-screen flex flex-col, md:ml-[240px] main content), `src/app/globals.css` (.itam-scroll custom scrollbar + min-height fill).
- `bun run lint` → 0 errors, 0 warnings.
- Dev server running on port 3000; `GET /` 200, `GET /api/dashboard` 200. Auto-seed fired on first empty load and populated DB (12 devices, 21 readings, active cycle). All API endpoints verified via curl: dashboard, devices, sites, cycles, master sync (model=18/dept=18/labels=42 updated), meter monthly aggregation, settings, meter POST validations (RESET requires remark → 400, exceed 20000 → warning).

Stage Summary:
- Complete polished ITAM preview app built and running. Classic 240px fixed dark sidebar with orange active item faithfully replicated. All 5 pages functional with Thai labels, orange/teal palette (no indigo/blue), responsive mobile hamburger, sticky footer, loading skeletons, sonner toasts. Device CRUD + meter reading with full validation + master data management with the 3 restored sync buttons all working. Seed endpoint works and auto-fires on empty dashboard.
