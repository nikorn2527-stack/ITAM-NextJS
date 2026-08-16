# PR-SYNC-1 Implementation Evidence Checklist

**Implementation code:** commit `ff452f4`
**Evidence/test commit:** commit under review
**Audit List baseline:** revision v9, commit `cd9dd3b`
**Spec baseline:** revision v6, commit `fb28fd8`
**B4 frozen baseline:** `ee75164`
**Date:** 2026-08-16

---

## Evidence Status

| ID | Evidence | Status | Source | Notes |
|---|---|---|---|---|
| E-01 | SyncRun/SyncRunItem migration on PostgreSQL | PENDING | CI required | Migration file exists; needs `prisma migrate deploy` |
| E-02 | Preview no-write test | TODO | `tests/sync/` Group 5 | Needs PostgreSQL fixture |
| E-03 | Per-item Site authorization | CODE REVIEWED | `src/app/api/sync/run/route.ts` | ctx.canAtSite() per item; needs test |
| E-04 | Conditional versioned create/update | CODE REVIEWED | `src/app/api/sync/run/route.ts` | expectedVersion/expectedExists; needs test |
| E-05 | Idempotency test | TODO | `tests/sync/` Group 6 | Needs PostgreSQL fixture |
| E-06 | Conflict detection test | TODO | `tests/sync/` Group 8 | Needs PostgreSQL fixture |
| E-07 | AuditLog redaction + JSON.stringify | CODE REVIEWED | `src/app/api/sync/run/route.ts` | redacted() + JSON.stringify; needs test |
| E-08 | P2034/retry counters | CODE REVIEWED | `src/app/api/sync/run/route.ts` | attempts/p2034Count; needs test |
| E-09 | Retry atomicity (tx.syncRunItem) | CODE REVIEWED | `src/app/api/sync/runs/[id]/retry/route.ts` | I-03 fix; needs rollback test |
| E-10 | Site allowlist fail-closed | CODE REVIEWED + TESTED | `src/lib/sync-adapter.ts` + `tests/sync/` | Unit tests: valid/unknown/empty allowlist |
| E-11 | Authorization (no SYNC_RUN, ADMIN only) | CODE REVIEWED | All sync routes | requireAuth('ADMIN'); no SYNC_RUN |
| E-12 | TypeScript compilation | PENDING | CI required | `npx tsc --noEmit` |
| E-13 | ESLint pass | PENDING | CI required | `npx eslint src/` |
| E-14 | B4 frozen files 0-diff | VERIFIED | git diff | `git diff ee75164...HEAD -- <6 files>` = 0 |
| E-15 | PostgreSQL migration deploy | PENDING | CI required | `prisma migrate deploy` on PostgreSQL 16.x |
| E-16 | B4 regression suite | PENDING | CI required | auth 88 + integration 33 + concurrency 27 |
| E-17 | 3-point integration check | PENDING | CI required | Device/print/login |
| E-18 | CSV fallback continuity | OPERATIONAL | code review | CSV import route unchanged |

---

## สรุปสถานะ (counted from table — single source of truth)

| Status | Count | Items |
|---|---|---|
| CODE REVIEWED | 6 | E-03, E-04, E-07, E-08, E-09, E-11 |
| CODE REVIEWED + TESTED | 1 | E-10 |
| TODO (needs PostgreSQL fixture) | 4 | E-02, E-05, E-06 |
| VERIFIED | 1 | E-14 |
| OPERATIONAL | 1 | E-18 |
| PENDING (CI required) | 5 | E-01, E-12, E-13, E-15, E-16, E-17 |
| **Total** | **18** | |

> **Note:** CODE REVIEWED = code verified in audit but runtime test evidence still required.
> PENDING count = 6 (E-01, E-12, E-13, E-15, E-16, E-17). Previous version said 5 — corrected.

---

## CI Steps Required

```bash
# 1. Install dependencies (pinned)
npm ci --legacy-peer-deps

# 2. Generate Prisma client
npx prisma generate

# 3. Run migration on PostgreSQL 16.x
DATABASE_URL="postgresql://..." npx prisma migrate deploy

# 4. TypeScript check
npx tsc --noEmit

# 5. ESLint
npx eslint src/

# 6. Run sync tests (requires PostgreSQL)
DATABASE_URL="postgresql://..." npx vitest run tests/sync/

# 7. Run B4 regression
npx tsx tests/auth/authorization-matrix.test.ts
npx tsx tests/auth/route-integration.test.ts
npx tsx tests/auth/concurrency.test.ts

# 8. Generate artifact
tar czf pr-sync-1-artifact.tgz ...
sha256sum pr-sync-1-artifact.tgz
```

## B4 Frozen Files Verification

```bash
git diff ee75164...HEAD -- \
  src/lib/retry-transaction.ts \
  src/lib/wo-authz.ts \
  src/lib/authorization-context.ts \
  src/lib/auth-middleware.ts \
  src/lib/auth-shared.ts \
  src/lib/audit.ts
```

Expected: 0 diff (verified ✅)
