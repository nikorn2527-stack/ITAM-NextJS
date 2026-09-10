#!/usr/bin/env node
/**
 * P0#4 Security: Verify Prisma provider is PostgreSQL (fail-closed).
 *
 * Per consultant P0#4 recommendation:
 *   - schema.prisma should be committed as `provider = "postgresql"` permanently
 *   - This script no longer PATCHES the file — it VERIFIES and fails if wrong
 *   - In dev sandbox, if DATABASE_URL starts with "file:" (SQLite), we allow
 *     SQLite but warn — this is the ONLY exception
 *
 * Exit codes:
 *   0 = provider is correct (postgresql in production, any in dev)
 *   1 = provider is wrong (postgresql expected in production but not found)
 */

import { readFileSync, existsSync } from 'fs'

const schemaPath = 'prisma/schema.prisma'
if (!existsSync(schemaPath)) {
  console.error('[check-prisma-provider] schema.prisma not found')
  process.exit(0) // non-fatal — let prisma generate handle this
}

const schema = readFileSync(schemaPath, 'utf8')
const providerMatch = schema.match(/datasource db \{\s*provider = "([^"]+)"/)
const currentProvider = providerMatch?.[1] || 'unknown'
const dbUrl = process.env.DATABASE_URL || ''
const isProduction = process.env.NODE_ENV === 'production'
const isDev = dbUrl.startsWith('file:')

if (isProduction) {
  // Production: MUST be postgresql — fail if not
  if (currentProvider !== 'postgresql') {
    console.error(`[check-prisma-provider] FATAL: Expected "postgresql" in production, found "${currentProvider}"`)
    console.error('Fix: change prisma/schema.prisma datasource provider to "postgresql"')
    process.exit(1)
  }
  console.log('[check-prisma-provider] ✓ postgresql (production)')
} else if (isDev) {
  // Dev sandbox with SQLite: allow but warn
  if (currentProvider === 'sqlite') {
    console.log('[check-prisma-provider] ⚠️ sqlite (dev sandbox — OK for testing)')
  } else if (currentProvider === 'postgresql') {
    console.log('[check-prisma-provider] ✓ postgresql (dev)')
  } else {
    console.warn(`[check-prisma-provider] ⚠️ unexpected provider: ${currentProvider}`)
  }
} else {
  // No DATABASE_URL or unknown: just check it's postgresql
  if (currentProvider === 'postgresql') {
    console.log('[check-prisma-provider] ✓ postgresql')
  } else {
    console.warn(`[check-prisma-provider] ⚠️ provider is "${currentProvider}" — expected "postgresql"`)
    console.warn('Set DATABASE_URL to a PostgreSQL connection string for production-like testing.')
  }
}
