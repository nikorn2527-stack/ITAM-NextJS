# PR-SYNC-1 Implementation Evidence Checklist

**Target commit:** `ff452f4` (branch `feature/pr-sync-1-implementation`)
**Audit List baseline:** revision v9, commit `cd9dd3b`
**Spec baseline:** revision v6, commit `fb28fd8`
**B4 frozen baseline:** `ee75164`
**Date:** 2026-08-16

---

## Evidence Status

| ID | Evidence | Status | Notes |
|---|---|---|---|
| E-01 | SyncRun/SyncRunItem migration on PostgreSQL | ⏳ PENDING | Migration file created; needs `prisma migrate deploy` on PostgreSQL 16.x |
| E-02 | Preview no-write test | ✅ TEST FILE CREATED | `tests/sync/sync-adapter.test.ts` Group 5; needs DB fixture |
| E-03 | Per-item Site authorization (ctx.canAtSite) | ✅ CODE COMPLETE | Apply + retry routes have per-item check; needs test evidence |
| E-04 | Conditional versioned create/update | ✅ CODE COMPLETE | Apply + retry use expectedVersion/expectedExists; needs test |
| E-05 | Idempotency test | ✅ TEST FILE CREATED | Group 6; needs DB fixture |
| E-06 | Conflict detection test | ✅ TEST FILE CREATED | Group 8; needs DB fixture |
| E-07 | AuditLog redaction + JSON.stringify | ✅ CODE COMPLETE | redacted() + JSON.stringify in apply/retry; needs test |
| E-08 | P2034/retry counters | ✅ CODE COMPLETE | attempts/p2034Count accumulated; needs PostgreSQL test |
| E-09 | Retry atomicity (tx.syncRunItem) | ✅ CODE COMPLETE | I-03 fix: all writes in same tx; needs rollback test |
| E-10 | Site allowlist fail-closed | ✅ CODE COMPLETE | I-07/I-07R1 fix; test file covers empty/unknown/valid |
| E-11 | Authorization (no SYNC_RUN, ADMIN only) | ✅ CODE COMPLETE | All routes use requireAuth('ADMIN'); no SYNC_RUN |
| E-12 | TypeScript compilation | ⏳ PENDING | Needs `npx tsc --noEmit` in CI |
| E-13 | ESLint pass | ⏳ PENDING | Needs `bunx eslint` in CI |
| E-14 | B4 frozen files 0-diff | ✅ VERIFIED | git diff ee75164...ff452f4 on 6 frozen files = 0 |
| E-15 | PostgreSQL migration deploy | ⏳ PENDING | Needs CI with PostgreSQL 16.x |
| E-16 | B4 regression suite | ⏳ PENDING | Needs CI: auth 88 + integration 33 + concurrency 27 |
| E-17 | 3-point integration check | ⏳ PENDING | Needs CI: Device/print/login |
| E-18 | CSV fallback continuity | ✅ OPERATIONAL | CSV import route unchanged; remains available |

---

## สรุปสถานะ

- **Code complete:** 8/18 evidence items (verified in code review)
- **Test file created:** 4/18 (adapter tests with11 groups, needs DB fixture to run)
- **Pending CI/PostgreSQL:** 6/18 (migration, tsc, eslint, regression, integration)

## สิ่งที่ต้องทำใน CI environment

1. `npm install --legacy-peer-deps`
2. `npx prisma migrate deploy` (PostgreSQL 16.x)
3. `npx tsc --noEmit`
4. `bunx eslint src/`
5. `npx vitest run tests/sync/` (with PostgreSQL fixture)
6. Run B4 regression suite
7. Run 3-point integration check
8. Generate artifact with SHA-256

## B4 Frozen Files Verification

```bash
git diff ee75164...ff452f4 -- \
  src/lib/retry-transaction.ts \
  src/lib/wo-authz.ts \
  src/lib/authorization-context.ts \
  src/lib/auth-middleware.ts \
  src/lib/auth-shared.ts \
  src/lib/audit.ts
```

Expected: 0 diff (verified ✅)
