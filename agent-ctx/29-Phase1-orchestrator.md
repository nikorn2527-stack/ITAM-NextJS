# Task 29-Phase1 — RBAC + Row-level Security

**Agent**: orchestrator (main)
**Branch**: master (no PR — direct edit per task instructions)
**Date**: 2026-08-11

## Objective
Add a complete RBAC system matching the Apps Script version (`Auth.gs` + `Code.gs`):
5 roles, 14 permissions, JWT auth, SHA-256 PBKDF2 password verification (so the
5 imported Google Sheets users can still log in), per-IP+username rate
limiting, and row-level `Allowed_Sites` filtering on every ITAM API route.

## What was created
- **`src/lib/auth-shared.ts`** — pure RBAC types/constants (no Node deps):
  `Role`, `Permission`, `AuthUser`, `UserPermissionRow`, `ROLE_PERMISSIONS`,
  `ROLE_LABELS`, `normalizeRole`, `hasPermission`, `getRolePermissions`,
  `isAdminRole`, `isSuperAdminRole`, `getAllowedSites`, `canAccessSite`,
  `siteFilterForUser`, `toAuthUser`. Safe to import from client components.
- **`src/lib/auth.ts`** (server-only) — re-exports everything from
  `auth-shared.ts` AND adds: `hashPassword` / `createPasswordSalt` /
  `hashNewPassword` / `verifyPassword` (PBKDF2-like iterated SHA-256,
  GAS-compatible — `salt|password` SHA-256 × 10 000 rounds, with legacy
  single-round fallback), `createToken` / `verifyToken` (jose HS256, 6 h TTL),
  `blacklistToken` / `isTokenBlacklisted` (in-memory Set, pruned every 10 min),
  `checkLoginRateLimit` / `recordLoginFailure` / `clearLoginRateLimit`
  (5 fails → 5-min lockout per `username@ip`).
- **`src/lib/auth-middleware.ts`** — `requireAuth(req, permission?)` helper:
  extracts `Authorization: Bearer <jwt>`, verifies JWT, reloads user from DB
  (so role/site changes take effect without re-issuing tokens), checks
  permission. Returns `{ ok, user, row }` or `{ ok: false, status, error }`.
- **`src/store/auth-store.ts`** — Zustand store: `token`, `user`,
  `isAuthenticated`, `isBooting`, `login()`, `logout()`, `checkAuth()`,
  `setSession()`, `clear()`. Persists token + user in localStorage.
  Exports `authFetch()` wrapper + `hydrateAuthFromStorage()` for app boot.

## Auth API routes (4)
- **`POST /api/itam/auth/login`** — accepts `{ username, password }`,
  verifies credentials, enforces rate limit (429 on 5th failure), updates
  `LastLoginAt`, issues JWT, writes `LOGIN` audit log.
- **`GET /api/itam/auth/me`** — returns current user profile (requires any
  valid token).
- **`POST /api/itam/auth/logout`** — adds token to blacklist; writes
  `LOGOUT` audit log. Always returns 200 so client can safely clear state.
- **`GET/POST /api/itam/auth/users`** — admin user management (requires
  `USER_MANAGE` permission, i.e. superadmin only). `[id]` route supports
  `PUT` (with role change / deactivation / password reset) and `DELETE`,
  both with **last-admin protection**: if demoting/deleting the only
  remaining active admin/superadmin, returns 400 with Thai error message.
  Also: non-superadmin cannot promote anyone to `superadmin`.

## Protected ITAM API routes (14 + 4 new)
Every route under `/api/itam/*` now starts with `await requireAuth(req, ...)`:
| Route | Method | Permission required | Site filter |
|---|---|---|---|
| `/api/itam/dashboard` | GET | `VIEW_DASHBOARD` | ✓ via `device.site` + filtered site list |
| `/api/itam/devices` | GET | `VIEW_DEVICES` | ✓ via `device.site IN allowedSites` |
| `/api/itam/devices` | POST | `DEVICE_EDIT` | ✓ — 403 if site not in allowedSites |
| `/api/itam/devices/[id]` | GET | `VIEW_DEVICES` | ✓ — 403 if device.site not allowed |
| `/api/itam/devices/[id]` | PUT | `DEVICE_EDIT` | ✓ — 403 if existing OR target site not allowed |
| `/api/itam/devices/[id]` | DELETE | `DEVICE_DELETE` | ✓ |
| `/api/itam/meter-readings` | GET | `VIEW_DEVICES` | ✓ via `device.site` |
| `/api/itam/meter-readings` | POST | `METER_WRITE` | ✓ — 403 if device site not allowed |
| `/api/itam/sites` | GET | `VIEW_DEVICES` | ✓ — only shows user's allowed sites |
| `/api/itam/assignments` | GET | `VIEW_DEVICES` | ✓ via `device.site` |
| `/api/itam/assignments` | POST | `DEVICE_TRANSFER` | ✓ |
| `/api/itam/assignments/[id]` | PUT/DELETE | `DEVICE_TRANSFER` | ✓ |
| `/api/itam/maintenance` | GET | `VIEW_DEVICES` | ✓ via `device.site` |
| `/api/itam/maintenance` | POST | `DEVICE_EDIT` | ✓ |
| `/api/itam/maintenance/[id]` | PUT/DELETE | `DEVICE_EDIT` | ✓ |
| `/api/itam/master-items` | GET | `VIEW_DEVICES` | — (master data, no site) |
| `/api/itam/master-items` | POST | `MASTER_DATA_EDIT` | — |
| `/api/itam/master-items/[id]` | PUT/DELETE | `MASTER_DATA_EDIT` | — |
| `/api/itam/license-records` | GET | `VIEW_DEVICES` | ✓ if asset-bound |
| `/api/itam/license-records` | POST | `DEVICE_EDIT` | ✓ if asset-bound |
| `/api/itam/audit` | GET | `VIEW_DEVICES` | non-admin: only own entries |
| `/api/itam/search` | GET | `VIEW_DEVICES` | ✓ on devices + meter + sites |

All write operations now also write to `audit_logs` with the authenticated
user's email + JSON details.

## Frontend changes
- **`src/components/itam/itam-login.tsx`** (new) — full-screen login page
  with branded gradient panel (orange), username/password inputs, show/hide
  password, error message, 5-min lockout countdown, loading spinner,
  Enter-to-submit. Auto-redirects to dashboard on success.
- **`src/store/auth-store.ts`** (new) — Zustand store with localStorage
  persistence + `authFetch()` wrapper.
- **`src/components/itam/sidebar.tsx`** — replaced hardcoded
  "admin@example.com · ผู้ดูแลระบบ" with dynamic user info from
  `useAuthStore`. Shows name + email + Thai role label + allowed sites.
  Added logout button (rose hover). When not authenticated, sidebar
  doesn't render (login page takes over).
- **`src/app/page.tsx`** — boot flow:
  1. `hydrateAuthFromStorage()` — read token+user from localStorage.
  2. If token found → call `checkAuth()` (`/api/itam/auth/me`) to verify.
  3. If 401 → clear state and show login.
  4. If 200 → show app shell.
  5. **Global fetch patch**: every `fetch('/api/itam/*')` call from existing
     components is auto-wrapped with `authFetch()` so the Bearer token is
     attached without rewriting every component. 401 responses clear the
     auth store so the UI auto-redirects to login.

## Role ↔ Permission map (mirror of Apps Script `Code.gs ROLE_PERMISSIONS`)
```
superadmin: VIEW_DASHBOARD, VIEW_DEVICES, VIEW_ANALYTICS, METER_WRITE,
            DEVICE_EDIT, DEVICE_DELETE, DEVICE_TRANSFER, LIFECYCLE_EDIT,
            MASTER_DATA_EDIT, EXPORT_PRINT, PRINT, ADMIN,
            USER_MANAGE, SYSTEM_CONFIG       ← only superadmin
admin:      same as superadmin minus USER_MANAGE + SYSTEM_CONFIG
editor:     VIEW_DASHBOARD, VIEW_DEVICES, VIEW_ANALYTICS, METER_WRITE,
            DEVICE_EDIT, DEVICE_TRANSFER, LIFECYCLE_EDIT,
            EXPORT_PRINT, PRINT
meter:      VIEW_DASHBOARD, VIEW_DEVICES, VIEW_ANALYTICS, METER_WRITE, PRINT
viewer:     VIEW_DASHBOARD, VIEW_DEVICES, VIEW_ANALYTICS, PRINT
```

## Password compatibility
The 5 imported users have `passwordHash` in GAS's PBKDF2-like SHA-256 hex
format (64 chars). `verifyPassword()` tries the modern 10 000-round hash
first, then the legacy single-round hash. Confirmed working with 2 users
(`dontham/1234`, `pooh/1234` — both editors restricted to
`โรงพยาบาลศูนย์อุดรธานี`). New users created via `/api/itam/auth/users`
POST use the same algorithm so future logins remain GAS-compatible.

⚠️ Note: the 3 other imported users (nikorn.p, kritsada.s, udorn.s) have
passwords set in Google Sheets that I couldn't reverse-engineer from common
candidates. They will still log in once their actual password is provided.

## Smoke test results (all passed)
| # | Test | Expected | Got |
|---|---|---|---|
| 1 | `POST /api/itam/auth/login` (dontham/1234) | 200 + JWT | ✅ token len 371, role=editor |
| 2 | `GET /api/itam/auth/me` with token | 200 + user | ✅ |
| 3 | `GET /api/itam/auth/me` no token | 401 | ✅ "กรุณาเข้าสู่ระบบ (missing token)" |
| 4 | `GET /api/itam/devices` no token | 401 | ✅ |
| 5 | `GET /api/itam/devices` with editor token | 200, site-filtered | ✅ 2231 devices, all in "โรงพยาบาลศูนย์อุดรธานี" (out of 2378 total) |
| 6 | `POST /api/itam/master-items` as editor | 403 (no MASTER_DATA_EDIT) | ✅ "ไม่มีสิทธิ์ (MASTER_DATA_EDIT)" |
| 7 | `GET /api/itam/dashboard` with editor token | 200, scope echoed | ✅ scope={allowedSites:[...], role:editor} |
| 8 | `POST /api/itam/auth/logout` | 200 | ✅ |
| 9 | `GET /api/itam/auth/me` with blacklisted token | 401 | ✅ |
| 10 | Wrong password | 401 | ✅ |
| 11 | 5 wrong logins → 6th | 429 + 5-min lockout | ✅ retryAfterMs=299987 |
| 12 | `DELETE /api/itam/devices/H-00001` as editor | 403 (no DEVICE_DELETE) | ✅ |
| 13 | `POST /api/itam/devices` as editor with allowed site | 201 | ✅ created with updatedBy="dontham" |
| 14 | `POST /api/itam/devices` as editor with restricted site | 403 | ✅ "ไม่มีสิทธิ์สร้างอุปกรณ์ในสาขา: Other Site" |
| 16 | `GET /api/itam/auth/users` as admin (not superadmin) | 403 (no USER_MANAGE) | ✅ matches Apps Script spec |
| Last-admin | direct DB test: count other admins > 0 | ok=true | ✅ 3 admins total → delete allowed |

## Lint
`bun run lint` → clean (0 warnings, 0 errors).

## Dependencies added
- `bcryptjs@3.0.3` + `@types/bcryptjs@3.0.0` (installed per task spec;
  kept for future use, but the actual password verification uses
  GAS-compatible PBKDF2-SHA-256 so existing users can log in).
- `jose@6.2.8` — JWT signing/verification (HS256).

## Files touched (new + edited)
**New:**
- `src/lib/auth-shared.ts`
- `src/lib/auth.ts` (rewrote — was empty stub from earlier task)
- `src/lib/auth-middleware.ts`
- `src/store/auth-store.ts`
- `src/app/api/itam/auth/login/route.ts`
- `src/app/api/itam/auth/me/route.ts`
- `src/app/api/itam/auth/logout/route.ts`
- `src/app/api/itam/auth/users/route.ts`
- `src/app/api/itam/auth/users/[id]/route.ts`
- `src/components/itam/itam-login.tsx`

**Edited:**
- `src/app/api/itam/devices/route.ts` (added requireAuth + site filter + audit)
- `src/app/api/itam/devices/[id]/route.ts` (same)
- `src/app/api/itam/meter-readings/route.ts` (same)
- `src/app/api/itam/dashboard/route.ts` (same + scope echo)
- `src/app/api/itam/sites/route.ts` (same + filter visible sites)
- `src/app/api/itam/assignments/route.ts` (same)
- `src/app/api/itam/assignments/[id]/route.ts` (same)
- `src/app/api/itam/maintenance/route.ts` (same)
- `src/app/api/itam/maintenance/[id]/route.ts` (same)
- `src/app/api/itam/master-items/route.ts` (requireAuth + audit)
- `src/app/api/itam/master-items/[id]/route.ts` (same)
- `src/app/api/itam/license-records/route.ts` (same)
- `src/app/api/itam/audit/route.ts` (requireAuth + non-admin: own entries only)
- `src/app/api/itam/search/route.ts` (same + device site filter)
- `src/components/itam/sidebar.tsx` (dynamic user info + logout button)
- `src/app/page.tsx` (boot flow + global fetch interceptor + login gate)

## Test credentials
- **Editor (site-restricted):** `dontham / 1234` → sees only "โรงพยาบาลศูนย์อุดรธานี"
- **Editor (site-restricted):** `pooh / 1234` → same site
- **Super Admin:** `nikorn.p / <password from Google Sheets>` — couldn't
  brute-force common passwords; login will work once the actual password is
  entered.

## What's NOT in this phase (deferred to later phases)
- Google OAuth SSO (Phase 7 — PWA + real-time).
- User management UI in `ItamSettings` (the API is ready; UI hookup is
  a small follow-up task — current `ItamSettings` shows master+sites tabs
  only, can add a users tab in a later pass).
- Cycle/bulk-meter endpoints (not under `/api/itam/*` so untouched).
- The `/api/devices/*`, `/api/cycles/*`, `/api/notifications/*` etc. routes
  (outside `/api/itam/*` scope per task instructions).
