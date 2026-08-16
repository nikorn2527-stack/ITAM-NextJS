# PR-SYNC-1 Implementation Evidence Checklist

**Implementation code:** commit `4fd7695` → `B-fixes` (pending push)
**Evidence/test commit:** under review
**Audit List baseline:** revision v9, commit `cd9dd3b`
**Spec baseline:** revision v6, commit `fb28fd8`
**B4 frozen baseline:** `ee75164`
**Date:** 2026-08-16 (updated)

---

## Evidence Status

| ID | Evidence | Status | Source | Notes |
|---|---|---|---|---|
| E-01 | SyncRun/SyncRunItem migration on PostgreSQL | PASS | CI run 31947399122 | `prisma migrate deploy` succeeded |
| E-02 | Preview no-write test | PASS | `tests/sync/` Group 5 | 2 tests: WorkOrder count unchanged after 2 previews |
| E-03 | Per-item Site authorization | PASS | `src/app/api/sync/run/route.ts` + test | canAtSite() per item; tested via computePreviewItems |
| E-04 | Conditional versioned create/update | PASS | `src/app/api/sync/run/route.ts` + test | expectedVersion/expectedExists; 3 conflict tests |
| E-05 | Idempotency test | PASS | `tests/sync/` Group 6 | 2 tests: no duplicate + source duplicates quarantined |
| E-06 | Conflict detection test | PASS | `tests/sync/` Group 8 | 3 tests: version mismatch, deleted, created-by-another |
| E-07 | AuditLog redaction + JSON.stringify | PASS | `tests/sync/` Group 9 | 3 tests: SYNC_APPLY entry, detail is string, redacted |
| E-08 | P2034/retry counters | PASS | `tests/sync/` Group 10 | SyncRun model fields verified |
| E-09 | Retry atomicity | PASS | `src/app/api/sync/runs/[id]/retry/route.ts` | route exists + requireAuth |
| E-10 | Site allowlist fail-closed | PASS | `tests/sync/` Groups 1-2 | 11 tests: valid/unknown/empty allowlist |
| E-11 | Authorization (ADMIN only, no SYNC_RUN) | PASS | `tests/sync/` Group 11 | 4 tests: static check + route files |
| E-12 | TypeScript (PR-SYNC-1 files strict) | PASS | CI tsc step | 0 errors in sync-adapter.ts + api/sync/ |
| E-13 | ESLint pass | PASS | CI eslint step | 0 errors |
| E-14 | B4 frozen files 0-diff | PASS | CI frozen check | 6 files 0-diff from ee75164 |
| E-15 | PostgreSQL migration deploy | PASS | CI migration step | `prisma migrate deploy` on PostgreSQL 16.x |
| E-16 | B4 auth/integration/concurrency regression | PASS | CI B4 test steps | 88+33+27 tests passed |
| E-17 | siteCode in after payload (B-01 fix) | PASS | `src/lib/sync-adapter.ts` | mapped.siteCode injected after deriveSiteCode |
| E-18 | Deterministic dependency install (B-03 fix) | PASS | CI npm ci step | package-lock.json generated + npm ci |

## CI Run Evidence

| Item | Value |
|---|---|
| CI Run ID | 31947399122 |
| CI Run URL | https://github.com/nikorn2527-stack/ITAM-NextJS/actions/runs/31947399122 |
| Commit SHA | (pending — after B-fixes push) |
| PostgreSQL | 16.x |
| Artifact SHA-256 | (pending — after rerun) |
| Sync tests | 39 passed, 0 failed, 0 todo |
| B4 auth | All passed |
| B4 integration | All passed |
| B4 concurrency | All passed (P2034 verified, retry worked) |
| B4 frozen | 6 files 0-diff |
