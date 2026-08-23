/**
 * POST /api/v1/work-orders/[id]/cancel — cancel a work order.
 *
 * Auth: DEVICE_EDIT
 * Body: { cancelReason }
 *   - Set status = CANCELLED, canceledAt = now, cancelReason
 *   - Audit log: WO_CANCEL
 * Response: { data: WorkOrder, meta }
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireApiAuth } from '@/lib/api/auth'
import {
  ok,
  badRequest,
  notFound,
  conflict,
  serverError,
} from '@/lib/api/response'
import { findWorkOrder } from '../../_shared'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth(req, 'DEVICE_EDIT')
  if (!auth.ok) return auth.response
  const { user } = auth.ctx
  const userEmail = user.email

  const { id } = await params

  try {
    const existing = await findWorkOrder(id)
    if (!existing) return notFound('work order')

    if (existing.status === 'COMPLETED') {
      return conflict(
        `ใบแจ้งซ่อมนี้ปิดงานแล้ว ไม่สามารถยกเลิกได้`,
        { code: 'WO_COMPLETED', field: 'status' },
      )
    }
    if (existing.status === 'CANCELLED') {
      // Idempotent
      return ok(existing)
    }

    const body = await req.json().catch(() => ({}))
    const cancelReason = String(body.cancelReason ?? '').trim()
    if (!cancelReason) {
      return badRequest('cancelReason เป็นฟิลด์ที่ต้องการ', {
        field: 'cancelReason',
      })
    }

    const now = new Date()
    const updated = await db.workOrder.update({
      where: { id: existing.id },
      data: {
        status: 'CANCELLED',
        canceledAt: now,
        cancelReason,
      },
    })

    await logAudit(
      'WO_CANCEL',
      'WorkOrder',
      updated.id,
      `ยกเลิกใบแจ้งซ่อม ${updated.woNumber} โดย ${userEmail}: ${cancelReason}`,
      {
        woNumber: updated.woNumber,
        oldStatus: existing.status,
        newStatus: 'CANCELLED',
        cancelReason,
      },
      userEmail,
    )

    return ok(updated)
  } catch (err) {
    console.error('POST /api/v1/work-orders/[id]/cancel', err)
    return serverError()
  }
}
