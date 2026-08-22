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

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
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
