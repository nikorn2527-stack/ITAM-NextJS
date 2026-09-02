/**
 * restore-db.ts — Restore database from JSON backup.
 *
 * Usage:
 *   bun run scripts/restore-db.ts ./backups/backup-2026-08-31.json
 *
 * WARNING: This will DELETE all existing data and replace with backup.
 * Use only for disaster recovery.
 *
 * Flow:
 *   1. Read backup JSON
 *   2. For each table: deleteMany → createMany
 *   3. Report restored row counts
 */

import { db } from '../src/lib/db'
import { readFileSync } from 'node:fs'

interface BackupData {
  meta: {
    timestamp: string
    prismaVersion: string
    tableCount: number
    totalRows: number
  }
  tables: Record<string, unknown[]>
}

async function main() {
  const backupFile = process.argv[2]
  if (!backupFile) {
    console.error('❌ Usage: bun run scripts/restore-db.ts <backup-file.json>')
    process.exit(1)
  }

  console.log('📦 Database Restore')
  console.log('─'.repeat(50))
  console.log(`Backup file: ${backupFile}`)
  console.log('⚠️  WARNING: This will DELETE all existing data!')
  console.log('─'.repeat(50))

  // Read backup
  let backup: BackupData
  try {
    const raw = readFileSync(backupFile, 'utf8')
    backup = JSON.parse(raw) as BackupData
  } catch (err) {
    console.error('❌ Failed to read backup file:', err)
    process.exit(1)
  }

  console.log(`Backup timestamp: ${backup.meta.timestamp}`)
  console.log(`Tables in backup: ${backup.meta.tableCount}`)
  console.log(`Total rows: ${backup.meta.totalRows}`)
  console.log('─'.repeat(50))

  // Reverse order for restore (respect foreign key constraints)
  const tableNames = Object.keys(backup.tables).reverse()

  let totalRestored = 0

  for (const table of tableNames) {
    const rows = backup.tables[table]
    if (!rows || rows.length === 0) {
      console.log(`  ⏭️  ${table}: 0 rows — skip`)
      continue
    }

    try {
      const prismaModel = (db as unknown as Record<string, {
        deleteMany: () => Promise<{ count: number }>
        createMany: (args: { data: unknown[] }) => Promise<{ count: number }>
      }>)[table]

      if (!prismaModel) {
        console.log(`  ⚠️  ${table}: model not found — skip`)
        continue
      }

      // Delete existing rows
      await prismaModel.deleteMany()

      // Insert backup rows
      const result = await prismaModel.createMany({ data: rows })
      totalRestored += result.count
      console.log(`  ✓ ${table}: ${result.count} rows restored`)
    } catch (err) {
      console.log(`  ✗ ${table}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log('─'.repeat(50))
  console.log(`✓ Restore complete: ${totalRestored} rows restored`)

  await db.$disconnect()
}

main().catch(async (e) => {
  console.error('❌ Restore failed:', e)
  await db.$disconnect()
  process.exit(1)
})
