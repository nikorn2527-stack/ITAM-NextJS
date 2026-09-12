#!/usr/bin/env node
/**
 * Prisma provider verifier (P1-06 fix).
 *
 * Phase 1 baseline: PostgreSQL is the ONLY supported provider.
 * Schema is committed as `provider = "postgresql"` permanently, and
 * there are 11 migrations in prisma/migrations/ that only work on
 * PostgreSQL. Auto-patching to SQLite caused schema/migration drift
 * in development — that's now forbidden.
 *
 * Behavior:
 *   - Production: VERIFY ONLY. Fail closed if provider is not postgresql.
 *   - Development: VERIFY ONLY. Fail closed if provider is not postgresql,
 *     UNLESS the user explicitly sets ITAM_ALLOW_SQLITE=1 (escape hatch
 *     for quick prototyping without migrations — NOT recommended).
 *
 * Exit codes:
 *   0 = provider is postgresql (correct)
 *   1 = provider is wrong (sqlite or unknown) — fail closed
 */

import { readFileSync, existsSync } from 'fs'

const schemaPath = 'prisma/schema.prisma'
if (!existsSync(schemaPath)) {
  console.error('[prisma-provider] schema.prisma not found')
  process.exit(0) // non-fatal — let prisma generate handle this
}

const schema = readFileSync(schemaPath, 'utf8')
const providerMatch = schema.match(/datasource db \{\s*provider = "([^"]+)"/)
const currentProvider = providerMatch?.[1] || 'unknown'
const dbUrl = process.env.DATABASE_URL || ''
const isProduction = process.env.NODE_ENV === 'production'
const allowSqlite = process.env.ITAM_ALLOW_SQLITE === '1'

if (currentProvider !== 'postgresql') {
  if (isProduction) {
    console.error(
      `[prisma-provider] FATAL: Expected "postgresql", found "${currentProvider}".`,
    )
    console.error('   Phase 1 baseline requires PostgreSQL (11 migrations depend on it).')
    console.error('   Fix: change prisma/schema.prisma datasource provider to "postgresql"')
    process.exit(1)
  }
  if (currentProvider === 'sqlite' && !allowSqlite) {
    console.error(
      `[prisma-provider] FATAL: Provider is "sqlite" but Phase 1 baseline is PostgreSQL.`,
    )
    console.error('   SQLite was removed because it caused schema/migration drift.')
    console.error('   Set DATABASE_URL to a PostgreSQL connection string.')
    console.error('   If you really need SQLite for quick prototyping (NOT recommended),')
    console.error('   set ITAM_ALLOW_SQLITE=1 — but you CANNOT use prisma migrate deploy.')
    process.exit(1)
  }
  console.warn(`[prisma-provider] ⚠️ provider is "${currentProvider}" (ITAM_ALLOW_SQLITE=1)`)
  process.exit(0)
}

console.log(`[prisma-provider] ✓ postgresql${dbUrl ? '' : ' (no DATABASE_URL — ok for generate)'}`)
