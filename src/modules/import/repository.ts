/** Prisma-backed persistence for ImportJob. Not exported by barrel. */
import { db } from '@/lib/db'
import type { ImportJobRecord, ImportJobRepository } from './contracts'

export const importJobRepository: ImportJobRepository = {
  async listRecent(limit) {
    return db.importJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    }) as Promise<ImportJobRecord[]>
  },
  async findById(id) {
    return db.importJob.findUnique({ where: { id } }) as Promise<ImportJobRecord | null>
  },
  async create(input) {
    return db.importJob.create({ data: input }) as Promise<ImportJobRecord>
  },
  async update(id, data) {
    return db.importJob.update({ where: { id }, data }) as Promise<ImportJobRecord>
  },
}
