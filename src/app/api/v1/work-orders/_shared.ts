/**
 * Shared constants + helpers for the Work Orders v1 API routes.
 *
 * Kept in a non-route file so it can be imported by both the collection
 * route (`/api/v1/work-orders/route.ts`) and the per-resource sub-routes
 * (`[id]`, `[id]/assign`, `[id]/complete`, …) without Next.js treating
 * the imports as route handlers.
 */

import { db } from '@/lib/db'

// ── Enums (mirror Prisma schema defaults) ───────────────────────────────
export const VALID_STATUSES = new Set([
  'PENDING',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'COMPLETED',
  'CANCELLED',
])

export const VALID_PRIORITIES = new Set(['ปกติ', 'ปานกลาง', 'สูง', 'ด่วน'])

/** Terminal statuses — once set, the work order is locked unless unlocked. */
export const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED'])

/** Roles used for WorkOrderMessage.authorRole. */
export type AuthorRole = 'admin' | 'staff' | 'reporter' | 'system'

/**
 * Map an ITAM RBAC role → work-order message authorRole.
 * admin/superadmin → 'admin', editor → 'staff', meter → 'staff',
 * viewer (read-only) → 'staff' too (they shouldn't be writing, but if
 * they have an explicit permission like DEVICE_EDIT we still record them).
 */
export function roleToAuthorRole(role: string | null | undefined): AuthorRole {
  const r = String(role ?? '').trim().toLowerCase()
  if (r === 'admin' || r === 'superadmin') return 'admin'
  return 'staff'
}

/**
 * Generate the next woNumber for today: WO-YYYYMMDD-NNN
 * Sequential per day, padded to 3 digits.
 */
export async function generateWoNumber(): Promise<string> {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const ymd = `${y}${m}${d}`
  const prefix = `WO-${ymd}-`

  // Find max sequence for today
  const todays = await db.workOrder.findMany({
    where: { woNumber: { startsWith: prefix } },
    select: { woNumber: true },
  })
  let maxSeq = 0
  for (const t of todays) {
    if (!t.woNumber) continue
    const seqStr = t.woNumber.slice(prefix.length)
    const seq = parseInt(seqStr, 10)
    if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq
  }
  const nextSeq = maxSeq + 1
  return `${prefix}${String(nextSeq).padStart(3, '0')}`
}

/**
 * Resolve a work-order by ID or woNumber.
 * Returns the row or null.
 */
export async function findWorkOrder(idOrWoNumber: string) {
  return db.workOrder.findFirst({
    where: {
      OR: [{ id: idOrWoNumber }, { woNumber: idOrWoNumber }],
    },
  })
}
