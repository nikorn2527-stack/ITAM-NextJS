// Quick production DB sanity check
import { PrismaClient } from '@prisma/client'

function buildPoolUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl
  let url = rawUrl
  // Auto-switch Supabase pooler from session mode (5432) → transaction mode (6543)
  // to avoid EMAXCONNSESSION "max clients reached in session mode - pool_size: 15".
  if (/\.pooler\.supabase\.com:5432(\/|\?|$)/.test(url)) {
    url = url.replace('.pooler.supabase.com:5432', '.pooler.supabase.com:6543')
  }
  const has = (k: string) => url.includes(`${k}=`)
  const extras: string[] = []
  if (!has('connection_limit')) extras.push('connection_limit=3')
  if (!has('pool_timeout')) extras.push('pool_timeout=30')
  if (/\.pooler\.supabase\.com/.test(url) && !has('pgbouncer')) extras.push('pgbouncer=true')
  if (extras.length === 0) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}${extras.join('&')}`
}

const url =
  process.env.ITAM_DB_URL ??
  'postgresql://postgres.qbyuzygktsidpsmnwrrw:companyofheroes2025@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require'

const poolUrl = buildPoolUrl(url)
console.log('🔌 Connecting to ITAM-DB production (transaction mode)...')
console.log(`   URL: ${poolUrl.replace(/:[^:@]+@/, ':****@')}`)

const db = new PrismaClient({
  datasources: { db: { url: poolUrl } },
  log: ['error', 'warn'],
})

async function main() {
  const start = Date.now()
  await db.$queryRaw`SELECT 1 as ok`
  console.log(`✅ Connected in ${Date.now() - start}ms`)

  const counts = {
    devices: await db.device.count(),
    workOrders: await db.workOrder.count(),
    meterReadings: await db.meterReading.count(),
    stockItems: await db.stockItem.count(),
    stockTransactions: await db.stockTransaction.count(),
    deviceTransfers: await db.deviceTransfer.count(),
  }
  console.log('📊 Production counts:', counts)
}

main()
  .catch((err) => {
    console.error('❌ ERROR:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())

