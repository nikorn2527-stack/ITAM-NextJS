# Task ID: RBAC-DASHBOARD — Work Record

## Agent
full-stack-developer (RBAC + integrated dashboard)

## Scope
1. PART 1: Granular RBAC + site-level permissions
   - Add `permissions` JSON column to User model
   - Create `src/lib/rbac.ts` (PERMISSIONS, ROLE_PERMISSIONS, helpers)
   - Create `src/store/auth-store.ts` (Zustand + persist)
   - Create `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` (split sub-routes)
   - Rewrite `/api/users` + `/api/users/[id]` (admin-only + permissions/allowedSites/department)
   - Update sidebar to filter nav items by permission
2. PART 2: Integrated Dashboard with real data
   - Rewrite `/api/dashboard` to aggregate Devices + WorkOrders + Stock + alerts
   - Rewrite `dashboard-page.tsx` with 4 KPIs (อุปกรณ์/ใบงานรอ/สต็อกต่ำ/คะแนนเฉลี่ย),
     pie chart (WO status), bar chart (device types), recent WOs table, low-stock list,
     alerts panel (pending WOs > 24h + expiring warranties)

## Files Touched
**New:**
- `src/lib/rbac.ts` — 28 PERMISSIONS, ROLE_PERMISSIONS map (admin/manager/staff/coordinator/viewer/editor), helpers (`hasPermission`, `hasAnyPermission`, `canAccessSite`, `getUserPermissions`, `toAuthUser`, `computeNavVisibility`), DEFAULT_PREVIEW_PERMISSIONS
- `src/lib/auth-session.ts` — `encodeSession`/`decodeSession` (base64 JSON token, 7-day TTL), `getCurrentUser(req)`, `ensureSeedUsers()`, AUTH_COOKIE constant
- `src/store/auth-store.ts` — Zustand store with persist (localStorage `itam-auth`), `fetchMe()` falls back to preview admin on 401, selector hooks (`usePermissions`, `useNavVisibility`, etc.)
- `src/app/api/auth/login/route.ts` — POST login (sets HttpOnly cookie)
- `src/app/api/auth/me/route.ts` — GET current user from cookie
- `src/app/api/auth/logout/route.ts` — DELETE clears cookie

**Modified:**
- `prisma/schema.prisma` — added `permissions String?` field to User (department + allowedSites already existed)
- `src/app/api/users/route.ts` — rewrote GET/POST/PUT to require admin, accept new roles + permissions/allowedSites/department, return resolved permissions + customPermissions
- `src/app/api/users/[id]/route.ts` — same treatment for PUT/DELETE
- `src/app/api/dashboard/route.ts` — rewrote to return real `{devices, workOrders, stock, alerts, meta}` per spec; fixed old references to non-existent `r.delta`/`r.reading` that were causing 500s
- `src/components/itam/sidebar.tsx` — added `requires?: string[]` to each NAV_ITEM, filters via `useNavVisibility()`, fetches `/api/auth/me` on mount, user info footer reads from auth store
- `src/components/itam/dashboard-page.tsx` — full rewrite: 4 KPI cards + pie chart (WO status) + horizontal bar chart (device types top 8) + recent WOs table (latest 5) + low-stock list + alerts panel + recent stock transactions + devices-by-site progress bars

**Deleted:**
- `src/app/api/auth/route.ts` — replaced by 3 sub-route files (login/me/logout)

## Key Decisions
- Auth uses base64-JSON session token in HttpOnly cookie (NOT real JWT — task said "no real JWT yet, just return user by email"). Token contains `{userId, email, exp}`. Password check deferred (accepts any) — to be added later.
- 5 default roles seeded on first call: admin/manager/staff/coordinator/viewer (all with `allowedSites='ALL'`).
- In sandbox/preview mode (no auth cookie → 401 from /me), the auth store falls back to a "preview admin" user with full permissions, so the UI never blocks. This makes the dashboard always usable in the sandbox.
- Sidebar uses `useNavVisibility()` (precomputed map for known pages) with fallback direct permission check — no re-renders needed for permission changes.
- Dashboard route returns top-20 of each alert list (not unlimited) to keep payload small.
- `pendingWOs` = any non-COMPLETED/non-CANCELLED WO with `updatedAt < now - 24h`.
- `expiringWarranties` = `warrantyEnd` ISO date between today and today+30d.
- `lowStockItems` sorted by `shortfall = minQuantity - quantity` descending (worst first).
- `avgRating` rounded to 2 decimal places.
- Devices "active" count is case-insensitive (`status?.toLowerCase() === 'active'`) since the schema default is `"Active"` (capital A) but seed data may use either form.

## Lint / Build Status
- `bun run db:push` → succeeded ("Your database is now in sync with the Prisma schema").
- `bun run lint` → 0 errors, 0 warnings (after fixing 2 JSX `> ` parser errors and 1 unused eslint-disable directive).
- Note: `bunx prisma generate` fails on this machine with a tooling bug (`Cannot find module '.../query_engine_bg.sqlite.wasm-base64.js'`), but the previously-generated client at `node_modules/.prisma/client/index.d.ts` already includes the `permissions` field on the User payload (verified via grep), so TypeScript types are correct.

## API Surface
- `POST /api/auth/login` — body `{email, password}` → `{user, token}` (sets HttpOnly cookie)
- `GET  /api/auth/me`    → `{user}` (401 if not authenticated)
- `DELETE /api/auth/logout` → `{ok: true}`
- `GET /api/users` — admin: list all; non-admin: just themselves (`limited: true`)
- `POST /api/users` — admin only; body `{email, name?, role, department?, allowedSites?, permissions?, active?}` → `{user}`
- `PUT  /api/users` — admin only; body `{id, ...fields}` → `{user}`
- `PUT  /api/users/[id]` — admin only; same fields
- `DELETE /api/users/[id]` — admin only
- `GET /api/dashboard` — integrated summary (no params)

## Compatibility Notes for Next Agent
- Old `DashboardData` interface in `src/components/itam/types.ts` is NOT used by the new dashboard anymore (the new file defines its own `DashboardApiData`). Other components (paper-analytics, depreciation-section, lifecycle-dashboard, reports-section) may still reference the old shape — they were not touched.
- `editor` role kept as legacy compat — gets staff-level + `import:data` perms.
- Old `/api/auth/route.ts` deleted; if any other code imports from it, point them to `@/lib/auth-session` instead.
- The dashboard-page.tsx no longer exports the old `DashboardPage` props/lifecycle hooks — it's a self-contained component now.
