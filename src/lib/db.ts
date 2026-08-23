import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Reuse the same client across warm serverless invocations as well as dev HMR.
// Without production caching, each Vercel invocation can create another pool,
// exhausting Supabase session-mode connection limits under modest concurrency.
if (
  globalForPrisma.prisma &&
  !(
    (globalForPrisma.prisma as unknown as { auditLog?: unknown }).auditLog &&
    (globalForPrisma.prisma as unknown as { deviceTransfer?: unknown })
      .deviceTransfer &&
    (globalForPrisma.prisma as unknown as { siteRate?: unknown }).siteRate &&
    (globalForPrisma.prisma as unknown as { user?: unknown }).user &&
    (globalForPrisma.prisma as unknown as { assignment?: unknown }).assignment &&
    (globalForPrisma.prisma as unknown as { report?: unknown }).report &&
    (globalForPrisma.prisma as unknown as { maintenanceLog?: unknown })
      .maintenanceLog &&
    (globalForPrisma.prisma as unknown as { workOrder?: unknown }).workOrder &&
    (globalForPrisma.prisma as unknown as { workOrderMessage?: unknown })
      .workOrderMessage &&
    (globalForPrisma.prisma as unknown as { workOrderReview?: unknown })
      .workOrderReview &&
    (globalForPrisma.prisma as unknown as { stockItem?: unknown }).stockItem &&
    (globalForPrisma.prisma as unknown as { stockTransaction?: unknown })
      .stockTransaction &&
    (globalForPrisma.prisma as unknown as { purchaseOrder?: unknown })
      .purchaseOrder &&
    (globalForPrisma.prisma as unknown as { purchaseOrderItem?: unknown })
      .purchaseOrderItem &&
    (globalForPrisma.prisma as unknown as { lineBinding?: unknown })
      .lineBinding
  )
) {
  void globalForPrisma.prisma.$disconnect().catch(() => {})
  globalForPrisma.prisma = undefined
}

/**
 * Build the connection URL with explicit pool params.
 *
 * IMPORTANT — Supabase Supavisor modes (the REAL cause of "EMAXCONNSESSION"):
 *   • Session mode    (port 5432): pool_size = 15 (Free), 200 (Pro)
 *     → Each client holds a connection for the whole session → EMAXCONNSESSION
 *       errors when 15+ clients connect simultaneously.
 *   • Transaction mode (port 6543): pool_size = 200 (Free), 1000 (Pro)
 *     → Connection released after each transaction → 13× more capacity.
 *
 * We AUTO-SWITCH pooler URLs from port 5432 → 6543 to avoid the 15-connection
 * limit on Free Plan. This is transparent to the app — both ports accept the
 * same credentials.
 */
function buildPoolUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl
  let url = rawUrl

  // Auto-switch Supabase pooler from session mode (5432) → transaction mode (6543).
  // This multiplies pool capacity 13× on Free Plan (15 → 200).
  if (/\.pooler\.supabase\.com:5432(\/|\?|$)/.test(url)) {
    url = url.replace('.pooler.supabase.com:5432', '.pooler.supabase.com:6543')
  }

  const has = (k: string) => url.includes(`${k}=`)
  const extras: string[] = []
  if (!has('connection_limit')) extras.push('connection_limit=5')
  if (!has('pool_timeout')) extras.push('pool_timeout=30')
  // Enable pgbouncer=true for Supabase pooler URLs (required for transaction mode).
  const isPooler = /\.pooler\.supabase\.com/.test(url)
  if (isPooler && !has('pgbouncer')) extras.push('pgbouncer=true')
  if (extras.length === 0) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}${extras.join('&')}`
}

const datasourceUrl = buildPoolUrl(process.env.DATABASE_URL ?? '')

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Pass the pool-tuned URL so Prisma's internal pool respects the limits.
    ...(datasourceUrl !== process.env.DATABASE_URL
      ? { datasources: { db: { url: datasourceUrl } } }
      : {}),
    // In production, only log errors. In development, default to ['error']
    // (was ['query'] which produced excessive I/O on every request).
    // Set PRISMA_LOG_QUERIES=1 to re-enable query logging for debugging.
    log:
      process.env.NODE_ENV === 'production'
        ? ['error']
        : process.env.PRISMA_LOG_QUERIES === '1'
          ? ['query', 'error', 'warn']
          : ['error', 'warn'],
  })

// Persist in every runtime. The global is process-local, so each serverless
// instance still owns only one Prisma client/pool and can be reclaimed normally.
globalForPrisma.prisma = db
