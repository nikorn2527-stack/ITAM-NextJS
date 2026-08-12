import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// In development the cached PrismaClient may become stale after a schema
// change (e.g. `bun run db:push` adding a new model). Detect this by probing
// for known models and recreate the client if any are missing.
if (
  process.env.NODE_ENV !== 'production' &&
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
      .purchaseOrderItem
  )
) {
  void globalForPrisma.prisma.$disconnect().catch(() => {})
  globalForPrisma.prisma = undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
