/**
 * POST /api/v1/work-orders/[id]/assign — assign a work order to a technician.
 *
 * Auth: ADMIN — or DEVICE_EDIT (a technician can self-assign too).
 * Body: { assignedTo, assignmentNote? }
 *   - Set assignedTo, assignedBy = current user, assignedAt = now
 *   - If status was PENDING, change to IN_PROGRESS
 *   - Audit log: WO_ASSIGN
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
import { findWorkOrder, TERMINAL_STATUSES } from '../../_shared'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Allow ADMIN or DEVICE_EDIT (technician self-assignment).
  let auth = await requireApiAuth(req, 'ADMIN')
  if (!auth.ok) {
    // Try DEVICE_EDIT instead — keep the original error if this also fails.
    const fallback = await requireApiAuth(req, 'DEVICE_EDIT')
    if (!fallback.ok) return auth.response
    auth = fallback
  }
  const { user } = auth.ctx
  const userEmail = user.email

  const { id } = await params

  try {
    const existing = await findWorkOrder(id)
    if (!existing) return notFound('work order')

    if (TERMINAL_STATUSES.has(existing.status)) {
      return conflict(
        `ใบแจ้งซ่อมนี้อยู่ในสถานะ ${existing.status} ไม่สามารถมอบหมายได้`,
        { code: 'WO_LOCKED', field: 'status' },
      )
    }

    const body = await req.json().catch(() => ({}))
    const assignedTo = String(body.assignedTo ?? '').trim()
    if (!assignedTo) {
      return badRequest('assignedTo เป็นฟิลด์ที่ต้องการ', {
        field: 'assignedTo',
      })
    }
    const assignmentNote =
      body.assignmentNote !== undefined && body.assignmentNote !== null
        ? String(body.assignmentNote)
        : null

    const now = new Date()
    const wasPending = existing.status === 'PENDING'

    const updated = await db.workOrder.update({
      where: { id: existing.id },
      data: {
        assignedTo,
        assignedBy: userEmail,
        assignedAt: now,
        assignmentNote,
        // Auto-promote PENDING → IN_PROGRESS on assignment.
        ...(wasPending ? { status: 'IN_PROGRESS', acceptStatus: 'accepted' } : {}),
      },
    })

    await logAudit(
      'WO_ASSIGN',
      'WorkOrder',
      updated.id,
      `มอบหมายใบแจ้งซ่อม ${updated.woNumber} ให้ ${assignedTo} โดย ${userEmail}${
        wasPending ? ' (เปลี่ยนสถานะ PENDING → IN_PROGRESS)' : ''
      }`,
      {
        woNumber: updated.woNumber,
        oldStatus: existing.status,
        newStatus: updated.status,
        assignedTo,
        assignedBy: userEmail,
      },
      userEmail,
    )

    return ok(updated)
  } catch (err) {
    console.error('POST /api/v1/work-orders/[id]/assign', err)
    return serverError()
  }
}
