import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// In development the cached PrismaClient may become stale after a schema
// change (e.g. `bun run db:push` adding a new model). Detect this by probing
// for a known model and recreate the client if it's missing.
if (
  process.env.NODE_ENV !== 'production' &&
  globalForPrisma.prisma &&
  !(globalForPrisma.prisma as unknown as { auditLog?: unknown }).auditLog
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