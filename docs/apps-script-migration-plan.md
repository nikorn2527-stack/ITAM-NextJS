# Apps Script to Next.js Migration Plan

## Scope

This document compares the three legacy Google Apps Script applications with the current Next.js application and defines which capabilities should be preserved, replaced, or improved. The implementation target is PostgreSQL/Supabase on Vercel. Legacy spreadsheet limitations such as row-by-row writes, Script Properties, weak authentication, silent skips, and trigger-dependent workflows are not carried forward.

## Capability matrix

| Legacy application | Capability | Next.js status | Decision | Target implementation |
|---|---|---|---|---|
| IT Asset Management | Device CRUD, bulk edits, import, lifecycle, transfer, assignments | Implemented through device, import, lifecycle, transfer, and assignment APIs | Preserve and strengthen | Keep active Prisma fields, transactional updates, audit entries, and legacy response aliases |
| IT Asset Management | Meter readings, cycles, previous-reading rules, lifecycle reading types | Meter API now implements lifecycle-aware previous selection, INITIAL/RESET/FINAL/CHECKOUT/SEND_REPAIR/RETURN handling, mode-switch baseline, same-month initial baseline, and bounded per-row batch results; cycle/snapshot verification remains separate | Improve | Keep the server-side rules transactional and add cycle-close/snapshot verification where the current schema supports it |
| IT Asset Management | Dashboard, paper analytics, cost/utilization, reports | Implemented | Preserve and improve | Keep server-side aggregation and add explicit date/site filters and typed DTOs |
| IT Asset Management | Master data, sites, rates, licenses, templates, stickers | Implemented | Preserve | Keep CRUD and rendering APIs; maintain legacy request/response aliases where needed |
| IT Asset Management | Auth/RBAC, audit, notifications, search | Implemented | Improve | Use active User/AuditLog/Site models, role/site filtering, masked notification settings, and structured audit detail |
| Services | Work orders, guest intake, assignments, completion, messages, images, reviews | Implemented | Preserve and improve | Keep API workflow, validation, transaction boundaries, and responsive UI |
| Services | Approved stock request synchronization and automatic work-order close | Partially missing; approval parity was added | Improve | Close WAITING_PARTS work orders when all linked requests are approved, copy onsite image to after image when absent, and audit the transition |
| Services | Contact directory and service-location lookup | Contact directory admin CRUD is implemented in AppSetting JSON with soft-delete and audit logging; site/location lookup remains represented by Site/WorkOrder fields | Improve | Keep typed validation, admin-only writes, and avoid duplicating Site/Organization models |
| Services | Subject/resolution options and external notifications | Subject/resolution options admin CRUD is implemented in AppSetting JSON with replace and soft-delete operations; LINE/notification routes exist | Improve | Persist options in AppSetting with validation; keep provider credentials masked and optional |
| Services | Dashboard/report aggregation | Implemented in part; public read-only work-order tracking endpoint added with a narrower whitelist than Apps Script | Improve | Add typed aggregation DTOs and server-side date/site filters rather than spreadsheet formulas |
| Stock | Products, stock-in/out, adjustments, purchase orders, exports | Implemented | Preserve and improve | Use Prisma transactions, computed balances, validation, and typed export DTOs |
| Stock | Pending approval create/list/single approve/reject | Implemented | Preserve | Keep current API contract and audit/notification behavior |
| Stock | Batch approve/reject | Missing | Add | Implement one transactional endpoint with per-item results, stock checks, and audit entries; do not partially hide failures |
| Stock | SLA auto-approval and persisted approval settings | Data fields exist; orchestration/settings are missing | Add | Store settings in AppSetting, expose admin-only GET/PUT, and provide a bounded idempotent auto-approval service/route suitable for Vercel Cron |
| Stock | External pending queue sync and source_key dedupe | Missing | Add only with explicit source contract | Prefer authenticated API/webhook or bounded import job; do not read another spreadsheet directly from request handlers |
| Stock | Sync status back to source row | Not suitable for direct Vercel request path | Replace | Return an import/sync report and persist sourceKey/processedFlag; perform external write-back through a dedicated worker or connector |
| Stock | User/admin/password/config sheet management | Replaced by Next.js auth/settings | Replace | Use User, AppSetting, RBAC, and audit; never reproduce plaintext password or spreadsheet admin reset flows |

## Priority implementation order

1. **Stock pending approval parity:** batch approval/rejection, persisted automation settings, and bounded SLA auto-approval. These are the clearest business workflows present in Stock Apps Script but missing around the existing Next.js single-item routes.
2. **Importer reliability:** keep bounded ranges, header normalization, idempotent upserts, dry-run, row-level error reporting, and relation preflight. A successful import must report inserted, updated, skipped, and failed rows.
3. **Meter business rules:** lifecycle-aware previous-reading and reading-type parity is implemented in `/api/meter`; cycle-close and snapshot verification remain the next bounded follow-up.
4. **Services operational parity:** contact directory, subject/resolution options, and public work-order tracking are implemented using Site, User, AppSetting, and WorkOrder without adding duplicate spreadsheet-shaped models.
5. **External synchronization:** replace spreadsheet coupling with authenticated API/webhook or an explicit import job. This should not be implemented as an unbounded serverless request.

## Non-functional upgrades

The Next.js implementation should use authenticated server-side route handlers, role/site authorization, Prisma transactions for stock and work-order state changes, idempotency keys for imports and external sync, bounded pagination, structured audit logs, and explicit error responses. Vercel build configuration must retain a separate `tsc --noEmit` CI gate because the current Next.js configuration allows the build to ignore TypeScript errors.

## Vercel configuration review from repository

The repository indicates that `DATABASE_URL` and `JWT_SECRET` are required runtime variables. The datasource must be PostgreSQL/Supabase and must not use a `file:` URL. Code also references `NEXTAUTH_SECRET` and `NODE_ENV`; `NEXTAUTH_SECRET` should be configured if the corresponding authentication path is enabled. Notification provider credentials are stored as masked application settings and are not required boot variables. Actual Vercel values cannot be confirmed from the repository alone and must be checked in Vercel Project Settings without exposing their values.

## Data migration conclusion

The Google Sheets source contains real rows. A dry-run using Node's native TypeScript stripping successfully fetched bounded rows from the main sheets, confirming the source is not header-only; License_Records currently has zero source rows. Empty Supabase tables are therefore most consistent with importer-level row failures being swallowed, malformed full-sheet CSV headers, dependency ordering between devices and meter/history rows, missing DATABASE_URL at execution time, or an import command that was never run against the target database. The importer must be run in dry-run mode first, then by bounded sheet groups, with its summary and error report retained as the migration record.
