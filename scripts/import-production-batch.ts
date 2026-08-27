/**
 * scripts/import-production-batch.ts
 *
 * Batch import 3 ชุดข้อมูลจาก Google Sheets เข้า ITAM-DB (production):
 *   1. Meter_Readings.csv     → 14,275 rows → MeterReading
 *   2. Location_History.csv   →     129 rows → DeviceTransfer
 *   3. Stock_Transactions.csv →   2,547 rows → StockTransaction
 *
 * วิธีใช้:
 *   ITAM_DB_URL="postgresql://postgres.qbyuzygktsidpsmnwrrw:companyofheroes2025@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require" \
 *     bun run scripts/import-production-batch.ts
 *
 * หรือระบุเฉพาะชุด:
 *   ITAM_DB_URL="..." bun run scripts/import-production-batch.ts --only=meter
 *   ITAM_DB_URL="..." bun run scripts/import-production-batch.ts --only=transfer
 *   ITAM_DB_URL="..." bun run scripts/import-production-batch.ts --only=stock
 *
 * WHY BATCH:
 *   Before: `for (row of rows) await db.create({ data: row })` → 14,275 queries
 *           → pool exhaustion (Supabase Free "15 connection limit" errors).
 *   After:  `batchCreate(db.meterReading, rows, { chunkSize: 500 })` → 29 chunks
 *           × 1 connection each → 50× fewer connection acquisitions.
 */

import { PrismaClient } from '@prisma/client'
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'

// Force-load .env so the SQLite shell env var doesn't override our Postgres URL.
// `override: true` makes .env take precedence over any pre-set process.env value.
config({ override: true })

// ---------- Config ----------
const CSV_DIR = process.env.CSV_DIR ?? '/tmp/itam-csv'
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE ?? 500)

const onlyFlag = (process.argv.find((a) => a.startsWith('--only=')) ?? '').split('=')[1] ?? ''
const RUN_METER = !onlyFlag || onlyFlag === 'meter'
const RUN_TRANSFER = !onlyFlag || onlyFlag === 'transfer'
const RUN_STOCK = !onlyFlag || onlyFlag === 'stock'

// Pool-tuned PrismaClient — respects Supabase connection limits.
function buildPoolUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl
  let url = rawUrl

  // Auto-switch Supabase pooler from session mode (5432) → transaction mode (6543).
  // Session mode has pool_size = 15 on Free Plan (EMAXCONNSESSION errors).
  // Transaction mode has pool_size = 200 — 13× more capacity.
  if (/\.pooler\.supabase\.com:5432(\/|\?|$)/.test(url)) {
    url = url.replace('.pooler.supabase.com:5432', '.pooler.supabase.com:6543')
  }

  const has = (k: string) => url.includes(`${k}=`)
  const extras: string[] = []
  if (!has('connection_limit')) extras.push('connection_limit=3') // small pool for scripts
  if (!has('pool_timeout')) extras.push('pool_timeout=30')
  if (/\.pooler\.supabase\.com/.test(url) && !has('pgbouncer')) extras.push('pgbouncer=true')
  if (extras.length === 0) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}${extras.join('&')}`
}

const rawUrl = process.env.ITAM_DB_URL ?? process.env.DATABASE_URL ?? ''
if (!rawUrl) {
  console.error('❌ Missing ITAM_DB_URL or DATABASE_URL env var')
  process.exit(1)
}
const poolUrl = buildPoolUrl(rawUrl)
console.log(`🔌 Connecting to: ${poolUrl.replace(/:[^:@]+@/, ':****@')}`)

const db = new PrismaClient({
  datasources: { db: { url: poolUrl } },
  log: ['error', 'warn'],
})

// ---------- Helpers ----------
function parseCsvFile(filePath: string): Record<string, string>[] {
  const text = readFileSync(filePath, 'utf-8')
  // Strip BOM if present.
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const records = parse(cleaned, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  })
  return records as Record<string, string>[]
}

function clean(val: string | undefined | null): string | null {
  if (val == null) return null
  const trimmed = String(val).trim()
  if (trimmed === '' || trimmed === 'undefined' || trimmed === 'null') return null
  return trimmed
}

function parseInt0(val: string | undefined | null): number {
  if (val == null) return 0
  const n = parseInt(String(val).trim(), 10)
  return isNaN(n) ? 0 : n
}

function parseFloat0(val: string | undefined | null): number {
  if (val == null) return 0
  const n = parseFloat(String(val).trim())
  return isNaN(n) ? 0 : n
}

function logProgress(label: string) {
  return (done: number, total: number) => {
    const pct = Math.round((done / total) * 100)
    process.stdout.write(`\r   ${label}: ${done.toLocaleString()}/${total.toLocaleString()} (${pct}%)`)
    if (done >= total) process.stdout.write('\n')
  }
}

/**
 * Batch insert using createMany in chunks.
 * Borrows 1 connection per chunk instead of 1 per row.
 */
async function batchCreateMany<T>(
  model: { createMany: (args: { data: any[]; skipDuplicates: boolean }) => Promise<{ count: number }> },
  rows: T[],
  label: string,
): Promise<{ inserted: number; skipped: number; totalChunks: number }> {
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + CHUNK_SIZE))
  }
  let inserted = 0
  let skipped = 0
  const onProgress = logProgress(label)
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    try {
      const result = await model.createMany({ data: chunk as any[], skipDuplicates: true })
      inserted += result.count
      skipped += Math.max(0, chunk.length - result.count)
    } catch (err) {
      console.warn(`\n   ⚠️  chunk ${i + 1}/${chunks.length} failed:`, err instanceof Error ? err.message : err)
      skipped += chunk.length
    }
    onProgress(Math.min((i + 1) * CHUNK_SIZE, rows.length), rows.length)
    // Tiny delay between chunks so the pool can recover (avoid burst).
    if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, 30))
  }
  return { inserted, skipped, totalChunks: chunks.length }
}

// ---------- 1. Meter Readings ----------
async function importMeterReadings() {
  console.log('\n📈 [1/3] Importing Meter_Readings...')
  const rows = parseCsvFile(join(CSV_DIR, 'Meter_Readings.csv'))
  console.log(`   พบ ${rows.length.toLocaleString()} แถวใน CSV`)

  // Build asset_no → deviceId lookup map (single query, no N+1).
  const allDevices = await db.device.findMany({ select: { id: true, assetCode: true } })
  const assetToId = new Map<string, string>()
  for (const d of allDevices) {
    if (d.assetCode) assetToId.set(d.assetCode, d.id)
  }
  console.log(`   พบ ${allDevices.length.toLocaleString()} devices ใน DB (lookup map built)`)

  // Map CSV rows → DB rows, skipping rows without matching device.
  const mapped: any[] = []
  let noDevice = 0
  for (const row of rows) {
    const assetNo = clean(row['asset_no'])
    if (!assetNo) {
      noDevice++
      continue
    }
    const deviceId = assetToId.get(assetNo)
    if (!deviceId) {
      noDevice++
      continue
    }
    mapped.push({
      readingId: clean(row['reading_id']),
      deviceId,
      assetCode: assetNo,
      readingDate: clean(row['reading_date']) ?? new Date().toISOString(),
      readingMonth: clean(row['reading_month']),
      meterBw: parseInt0(row['meter_bw']),
      meterColor: parseInt0(row['meter_color']),
      pagesBw: parseInt0(row['pages_bw']),
      pagesColor: parseInt0(row['pages_color']),
      prevMeterBw: parseInt0(row['prev_meter_bw']),
      prevMeterColor: parseInt0(row['prev_meter_color']),
      readingType: clean(row['reading_type']),
      readBy: clean(row['read_by']),
      remark: clean(row['remark']),
      locationAtReading: clean(row['location_at_reading']),
      siteAtReading: clean(row['site_at_reading']),
      buildingAtReading: clean(row['building_at_reading']),
      floorAtReading: clean(row['floor_at_reading']),
      departmentAtReading: clean(row['department_at_reading']),
      departmentCodeAtReading: clean(row['department_code_at_reading']),
      eventType: clean(row['event_type']),
      eventId: clean(row['event_id']),
    })
  }
  console.log(`   mapped: ${mapped.length.toLocaleString()}, no device: ${noDevice.toLocaleString()}`)

  const result = await batchCreateMany(db.meterReading, mapped, 'MeterReading')
  console.log(`   ✅ inserted: ${result.inserted.toLocaleString()}, skipped: ${result.skipped.toLocaleString()}, chunks: ${result.totalChunks}`)
  return result
}

// ---------- 2. DeviceTransfer (Location History) ----------
async function importDeviceTransfers() {
  console.log('\n📍 [2/3] Importing Location_History → DeviceTransfer...')
  const rows = parseCsvFile(join(CSV_DIR, 'Location_History.csv'))
  console.log(`   พบ ${rows.length.toLocaleString()} แถวใน CSV`)

  // Build asset_no → deviceId lookup map.
  const allDevices = await db.device.findMany({ select: { id: true, assetCode: true } })
  const assetToId = new Map<string, string>()
  for (const d of allDevices) {
    if (d.assetCode) assetToId.set(d.assetCode, d.id)
  }

  const mapped: any[] = []
  let noDevice = 0
  for (const row of rows) {
    const assetNo = clean(row['Asset_No'])
    if (!assetNo) {
      noDevice++
      continue
    }
    const deviceId = assetToId.get(assetNo)
    if (!deviceId) {
      noDevice++
      continue
    }
    const toSite = clean(row['To_Site']) ?? clean(row['To_AssetSiteCode']) ?? 'UNKNOWN'
    const moveDate = clean(row['Move_Date']) ?? new Date().toISOString()
    mapped.push({
      logId: clean(row['Log_ID']),
      deviceId,
      assetCode: assetNo,
      moveDate,
      transferDate: moveDate, // required by schema — equals moveDate for imported rows
      action: clean(row['Action']),
      fromStatus: clean(row['From_Status']),
      toStatus: clean(row['To_Status']),
      fromSite: clean(row['From_Site']),
      fromAssetSiteCode: clean(row['From_AssetSiteCode']),
      fromBuilding: clean(row['From_Building']),
      fromFloor: clean(row['From_Floor']),
      fromDepartment: clean(row['From_Department']),
      fromLocation: clean(row['From_Location']),
      toSite,
      toAssetSiteCode: clean(row['To_AssetSiteCode']),
      toBuilding: clean(row['To_Building']),
      toFloor: clean(row['To_Floor']),
      toDepartment: clean(row['To_Department']),
      toLocation: clean(row['To_Location']),
      meterReadingId: clean(row['Meter_Reading_ID']),
      movedBy: clean(row['Moved_By']),
      remark: clean(row['Remark']),
    })
  }
  console.log(`   mapped: ${mapped.length.toLocaleString()}, no device: ${noDevice.toLocaleString()}`)

  const result = await batchCreateMany(db.deviceTransfer, mapped, 'DeviceTransfer')
  console.log(`   ✅ inserted: ${result.inserted.toLocaleString()}, skipped: ${result.skipped.toLocaleString()}, chunks: ${result.totalChunks}`)
  return result
}

// ---------- 3. Stock Transactions ----------
async function importStockTransactions() {
  console.log('\n📦 [3/3] Importing Stock_Transactions...')
  const rows = parseCsvFile(join(CSV_DIR, 'Stock_Transactions.csv'))
  console.log(`   พบ ${rows.length.toLocaleString()} แถวใน CSV`)

  // Build productCode → stockItemId lookup map.
  const allItems = await db.stockItem.findMany({ select: { id: true, productCode: true } })
  const codeToId = new Map<string, string>()
  for (const it of allItems) {
    if (it.productCode) codeToId.set(it.productCode, it.id)
  }
  console.log(`   พบ ${allItems.length.toLocaleString()} stock items ใน DB (lookup map built)`)

  // Type mapping: รับเข้า → IN, เบิกออก → OUT, ปรับปรุง → ADJUST
  const typeMap: Record<string, string> = {
    รับเข้า: 'IN',
    เบิกออก: 'OUT',
    ปรับปรุง: 'ADJUST',
    IN: 'IN',
    OUT: 'OUT',
    ADJUST: 'ADJUST',
  }

  const mapped: any[] = []
  let noItem = 0
  for (const row of rows) {
    const productCode = clean(row['ProductCode'])
    if (!productCode) {
      noItem++
      continue
    }
    const stockItemId = codeToId.get(productCode)
    if (!stockItemId) {
      noItem++
      continue
    }
    const rawType = clean(row['TransactionType']) ?? 'IN'
    const type = typeMap[rawType] ?? rawType
    const txnDate = clean(row['Date']) ?? new Date().toISOString()
    mapped.push({
      txnNumber: clean(row['DocumentNo']),
      stockItemId,
      productCode,
      productName: clean(row['ProductName']),
      type,
      quantity: parseInt0(row['Quantity']),
      unit: clean(row['Unit']),
      txnDate,
      performedBy: clean(row['PerformedBy']),
      remark: clean(row['Remark']),
      approvalStatus: 'APPROVED', // imported rows are pre-approved
      approvalMode: 'AUTO',
    })
  }
  console.log(`   mapped: ${mapped.length.toLocaleString()}, no stock item: ${noItem.toLocaleString()}`)

  const result = await batchCreateMany(db.stockTransaction, mapped, 'StockTransaction')
  console.log(`   ✅ inserted: ${result.inserted.toLocaleString()}, skipped: ${result.skipped.toLocaleString()}, chunks: ${result.totalChunks}`)
  return result
}

// ---------- Main ----------
async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  ITAM-DB Production Batch Import')
  console.log('  chunk size:', CHUNK_SIZE, '| only:', onlyFlag || 'ALL')
  console.log('═══════════════════════════════════════════════════════════════')

  const startTime = Date.now()
  const summary: Record<string, { inserted: number; skipped: number; totalChunks: number }> = {}

  try {
    // Quick DB health check.
    console.log('🏥 Health check: SELECT 1 ...')
    await db.$queryRaw`SELECT 1`
    console.log('   ✅ DB reachable')

    if (RUN_METER) summary.meter = await importMeterReadings()
    if (RUN_TRANSFER) summary.transfer = await importDeviceTransfers()
    if (RUN_STOCK) summary.stock = await importStockTransactions()

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log('\n═══════════════════════════════════════════════════════════════')
    console.log('  📊 SUMMARY')
    console.log('═══════════════════════════════════════════════════════════════')
    let totalInserted = 0
    let totalSkipped = 0
    for (const [key, val] of Object.entries(summary)) {
      console.log(`  ${key.padEnd(12)}: inserted=${val.inserted.toLocaleString().padStart(8)}  skipped=${val.skipped.toLocaleString().padStart(6)}  chunks=${val.totalChunks}`)
      totalInserted += val.inserted
      totalSkipped += val.skipped
    }
    console.log(`  ${'─'.repeat(60)}`)
    console.log(`  ${'TOTAL'.padEnd(12)}: inserted=${totalInserted.toLocaleString().padStart(8)}  skipped=${totalSkipped.toLocaleString().padStart(6)}`)
    console.log(`  ⏱  elapsed: ${elapsed}s`)
    console.log('═══════════════════════════════════════════════════════════════')
  } catch (err) {
    console.error('\n❌ FATAL:', err)
    process.exitCode = 1
  } finally {
    await db.$disconnect()
    console.log('🔌 Disconnected.')
  }
}

main().catch((err) => {
  console.error('❌ Uncaught:', err)
  process.exit(1)
})
