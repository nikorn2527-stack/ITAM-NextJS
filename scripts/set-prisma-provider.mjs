#!/usr/bin/env node
/**
 * Auto-detect Prisma provider from DATABASE_URL and patch schema.prisma.
 * 
 * - URL starts with "file:" → sqlite (local dev/sandbox)
 * - URL starts with "postgres" → postgresql (Vercel/production)
 * - URL starts with "mysql" → mysql
 * 
 * Run before `prisma generate` / `prisma db push` / `next build`.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'

const schemaPath = 'prisma/schema.prisma'
if (!existsSync(schemaPath)) {
  console.error('[set-prisma-provider] schema.prisma not found')
  process.exit(0) // non-fatal
}

const dbUrl = process.env.DATABASE_URL || ''
let provider = 'sqlite'
if (dbUrl.startsWith('postgres')) provider = 'postgresql'
else if (dbUrl.startsWith('mysql')) provider = 'mysql'
else if (dbUrl.startsWith('file:')) provider = 'sqlite'

let schema = readFileSync(schemaPath, 'utf8')
const oldProviderMatch = schema.match(/datasource db \{\s*provider = "([^"]+)"/)
const oldProvider = oldProviderMatch?.[1]

if (oldProvider === provider) {
  console.log(`[set-prisma-provider] already ${provider}, no change`)
  process.exit(0)
}

// Replace provider in datasource block only (not generator)
schema = schema.replace(
  /(datasource db \{\s*provider = ")([^"]+)"/,
  `$1${provider}"`
)

// For sqlite: remove @db.Decimal(...) annotations (PostgreSQL-specific)
if (provider === 'sqlite') {
  schema = schema.replace(/ @db\.Decimal\(\d+, \d+\)/g, '')
} 
// For postgresql: we need to add @db.Decimal back — but that's complex.
// Instead, we keep Decimal fields without @db modifier (works in both).

writeFileSync(schemaPath, schema)
console.log(`[set-prisma-provider] ${oldProvider} → ${provider}`)
