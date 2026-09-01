/**
 * backup-db.ts — Backup database to JSON before migration.
 *
 * Usage:
 *   bun run scripts/backup-db.ts                    → backup to ./backups/backup-<timestamp>.json
 *   bun run scripts/backup-db.ts --output=/tmp/x.json
 *
 * Backup includes all tables in the schema.
 * Each table is exported as JSON array.
 *
 * Restore (manual):
 *   bun run scripts/restore-db.ts ./backups/backup-<timestamp>.json
 */

import { db } from '../src/lib/db'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

interface BackupData {
  meta: {
    timestamp: string
    prismaVersion: string
    tableCount: number
    totalRows: number
  }
  tables: Record<string, unknown[]>
}

// All Prisma models to backup (must match schema.prisma order)
const TABLES_TO_BACKUP = [
  'device',
  'meterReading',
  'cycle',
  'deviceTransfer',
  'assignment',
  'maintenanceLog',
  'workOrder',
  'workOrderMessage',
  'workOrderReview',
  'workOrderImage',
  'workOrderPart',
  'licenseRecord',
  'siteAttribute',
  'site',
  'siteRate',
  'masterItem',
  'stockItem',
  'stockItemCompatibility',
  'stockTransaction',
  'purchaseOrder',
  'purchaseOrderItem',
  'user',
  'role',
  'permission',
  'rolePermission',
  'userSiteGrant',
  'auditLog',
  'appSetting',
  'pushSubscription',
  'stockItemRateHistory',
  'userNotificationPreference',
  'assetNumberPattern',
  'woNumberPattern',
  'organizationProfile',
  'documentTemplate',
  'importJob',
  'lineBinding',
  'report',
  'passwordResetToken',
  'syncRun',
  'syncRunItem',
  'pMSchedule',
  'pMExecution',
] as const

async function main() {
  const startTime = Date.now()
  const args = process.argv.slice(2)
  const outputArg = args.find((a) => a.startsWith('--output='))
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outputDir = resolve(process.cwd(), 'backups')
  const outputFile = outputArg
    ? outputArg.split('=')[1]
    : resolve(outputDir, `backup-${timestamp}.json`)

  console.log('📦 Database Backup')
  console.log('─'.repeat(50))
  console.log(`Timestamp: ${timestamp}`)
  console.log(`Output: ${outputFile}`)
  console.log('─'.repeat(50))

  mkdirSync(outputDir, { recursive: true })

  const backup: BackupData = {
    meta: {
      timestamp,
      prismaVersion: '6.19.2',
      tableCount: 0,
      totalRows: 0,
    },
    tables: {},
  }

  let totalRows = 0

  for (const table of TABLES_TO_BACKUP) {
    try {
      const prismaModel = (db as unknown as Record<string, { findMany: () => Promise<unknown[]> }>)[table]
      if (!prismaModel || typeof prismaModel.findMany !== 'function') {
        console.log(`  ⚠️  ${table}: model not found in Prisma client — skip`)
        continue
      }

      const rows = await prismaModel.findMany()
      backup.tables[table] = rows
      totalRows += rows.length
      console.log(`  ✓ ${table}: ${rows.length} rows`)
    } catch (err) {
      console.log(`  ✗ ${table}: ${err instanceof Error ? err.message : String(err)}`)
      // Continue with other tables
    }
  }

  backup.meta.tableCount = Object.keys(backup.tables).length
  backup.meta.totalRows = totalRows

  writeFileSync(outputFile, JSON.stringify(backup, null, 2))

  const elapsedMs = Date.now() - startTime
  const sizeMB = (JSON.stringify(backup).length / 1024 / 1024).toFixed(2)

  console.log('─'.repeat(50))
  console.log(`✓ Backup complete in ${elapsedMs}ms`)
  console.log(`  Tables: ${backup.meta.tableCount}`)
  console.log(`  Total rows: ${totalRows}`)
  console.log(`  File size: ${sizeMB} MB`)
  console.log(`  Saved to: ${outputFile}`)

  await db.$disconnect()
}

main().catch(async (e) => {
  console.error('❌ Backup failed:', e)
  await db.$disconnect()
  process.exit(1)
})
