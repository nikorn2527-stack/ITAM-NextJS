/**
 * restore-from-supabase.ts — Restore ข้อมูลทั้งหมดจาก Supabase → local SQLite
 * ใช้เมื่อ sandbox restart ทำให้ local DB ว่าง
 *
 * ⚠️ SECURITY: This script DELETES local data before restoring.
 *   - Only allowed in Development or Staging (NOT Production)
 *   - Requires RESTORE_CONFIRM=YES env var to proceed
 *   - Requires SUPABASE_DATABASE_URL env var (NEVER hardcoded)
 *
 * Usage:
 *   SUPABASE_DATABASE_URL="postgresql://..." RESTORE_CONFIRM=YES bun scripts/restore-from-supabase.ts
 */
import pg from 'pg'
import { DatabaseSync } from 'node:sqlite'

// ── Environment Guards ──
const SUPA = process.env.SUPABASE_DATABASE_URL
if (!SUPA) {
  console.error('❌ SUPABASE_DATABASE_URL env var is required.')
  console.error('   Set it via: export SUPABASE_DATABASE_URL="postgresql://..."')
  process.exit(1)
}

const RESTORE_CONFIRM = process.env.RESTORE_CONFIRM
if (RESTORE_CONFIRM !== 'YES') {
  console.error('❌ This script will DELETE local data before restoring.')
  console.error('   Set RESTORE_CONFIRM=YES to proceed:')
  console.error('   RESTORE_CONFIRM=YES bun scripts/restore-from-supabase.ts')
  process.exit(1)
}

// ⚠️ Fail-closed if NODE_ENV is production
if (process.env.NODE_ENV === 'production') {
  console.error('❌ RESTORE IS NOT ALLOWED IN PRODUCTION.')
  console.error('   This script deletes local data — use Supabase dashboard or pg_restore instead.')
  process.exit(1)
}

const SQLITE = '/home/z/my-project/db/custom.db'

const TABLES = [
  'AppSetting', 'AssetCategory', 'AssetNumberPattern', 'WoNumberPattern',
  'OrganizationProfile', 'Cycle', 'User', 'Role', 'Permission', 'RolePermission',
  'UserSiteGrant', 'SiteAttribute', 'Site', 'SiteRate', 'MasterItem',
  'Device', 'DeviceAccessory', 'DeviceTransfer', 'Assignment',
  'StockItem', 'StockItemRateHistory', 'StockTransaction', 'PurchaseOrder', 'PurchaseOrderItem',
  'WorkOrder', 'WorkOrderMessage', 'WorkOrderReview', 'WorkOrderImage', 'WorkOrderPart',
  'MaintenanceLog', 'MeterReading', 'MeterReportAmendment', 'AuditLog',
  'DocumentTemplate', 'ImportJob', 'LineBinding', 'Report', 'PasswordResetToken',
  'SyncRun', 'SyncRunItem', 'PMSchedule', 'PMExecution', 'WebAuthnCredential',
  'PublicReporter', 'LicenseRecord', 'ModuleFlag', 'Contact',
  'NotificationLog', 'NotificationTemplate',
]

async function main() {
  const sqlite = new DatabaseSync(SQLITE)
  sqlite.exec('PRAGMA foreign_keys = OFF')
  
  const supa = new pg.Client({ connectionString: SUPA, connectionTimeoutMillis: 30000 })
  await supa.connect()
  
  console.log('══════════════════════════════════════════')
  console.log('  Restore from Supabase → local SQLite')
  console.log('══════════════════════════════════════════')
  
  let total = 0
  for (const table of TABLES) {
    try {
      const res = await supa.query('SELECT * FROM "' + table + '"')
      if (res.rows.length === 0) continue
      
      const cols = Object.keys(res.rows[0])
      let inserted = 0, errors = 0
      
      // Clear existing rows
      sqlite.exec('DELETE FROM "' + table + '"')
      
      const stmt = sqlite.prepare(
        'INSERT OR REPLACE INTO "' + table + '" (' + cols.map(c => '"' + c + '"').join(', ') + ') VALUES (' + cols.map(() => '?').join(', ') + ')'
      )
      
      for (const row of res.rows) {
        try {
          const values = cols.map(c => {
            const v = row[c]
            if (v === undefined || v === null) return null
            if (v instanceof Date) return v.getTime()
            if (typeof v === 'boolean') return v ? 1 : 0
            return v
          })
          stmt.run(...values)
          inserted++
        } catch (e: any) {
          errors++
        }
      }
      total += inserted
      if (inserted > 0) console.log('  ✓ ' + table.padEnd(25) + ': ' + inserted + '/' + res.rows.length + ' restored')
    } catch (e: any) {
      // Table doesn't exist in Supabase or schema mismatch — skip
    }
  }
  
  await supa.end()
  sqlite.close()
  console.log('══════════════════════════════════════════')
  console.log('  Total restored: ' + total + ' rows')
  console.log('══════════════════════════════════════════')
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
