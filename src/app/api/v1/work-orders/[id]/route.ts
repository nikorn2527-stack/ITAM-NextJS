/**
 * GET /api/v1/work-orders/[id] — fetch a single work order with messages + review.
 *
 * Auth: VIEW_DEVICES — OR guest access if ?reporterTel= matches the stored tel.
 * The [id] param accepts either the work-order cuid or the woNumber.
 * Response: { data: { order, messages, review }, meta }
 *
 * PUT /api/v1/work-orders/[id] — update a work order.
 *   Auth: DEVICE_EDIT
 *   Body: any subset of fields (status, priority, details, detailsAdmin,
 *         picOnsite, picAfter, acceptStatus, assignedTo, assignmentNote,
 *         editUnlockActive, editUnlockBy, editUnlockNote, building,
 *         location, subject, assetNo, etc.)
 *   - If status → COMPLETED: set workCompletedAt + closedAt = now
 *   - If status → CANCELLED: set canceledAt = now
 *   - If status → IN_PROGRESS: set acceptStatus = 'accepted'
 *   - Locked if status is COMPLETED or CANCELLED (unless editUnlockActive
 *     or the caller is an admin).
 *   Response: { data: WorkOrder, meta }
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireApiAuth } from '@/lib/api/auth'
import {
  ok,
  badRequest,
  notFound,
  forbidden,
  conflict,
  serverError,
} from '@/lib/api/response'
import {
  VALID_STATUSES,
  VALID_PRIORITIES,
  TERMINAL_STATUSES,
  findWorkOrder,
} from '../_shared'

// ── GET ─────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const url = new URL(req.url)
  const reporterTel = url.searchParams.get('reporterTel')?.trim() ?? ''

  // Try authed access first.
  const auth = await requireApiAuth(req, 'VIEW_DEVICES')
  const isAuthed = auth.ok

  if (!isAuthed) {
    // If not authed (401) — fall through to guest check only when reporterTel
    // is supplied. A 403 (logged-in user without permission) is returned.
    if (auth.response.status !== 401) return auth.response
    if (!reporterTel) return auth.response
  }

  const order = await findWorkOrder(id)
  if (!order) return notFound('work order')

  // Guest access: reporterTel must match the stored tel.
  if (!isAuthed) {
    if (!order.tel || order.tel.trim() !== reporterTel) {
      return forbidden('เบอร์โทรศัพท์ไม่ตรงกับใบแจ้งซ่อมนี้')
    }
  }

  const [messages, review] = await Promise.all([
    db.workOrderMessage.findMany({
      where: { workOrderId: order.id },
      orderBy: { createdAt: 'asc' },
    }),
    db.workOrderReview.findUnique({
      where: { workOrderId: order.id },
    }),
  ])

  return ok({ order, messages, review })
}

// ── PUT ─────────────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth(req, 'DEVICE_EDIT')
  if (!auth.ok) return auth.response
  const { user } = auth.ctx
  const userEmail = user.email
  const isAdmin = user.role === 'admin' || user.role === 'superadmin'

  const { id } = await params

  try {
    const existing = await findWorkOrder(id)
    if (!existing) return notFound('work order')

    const body = await req.json()

    // ── Lock check ────────────────────────────────────────────────────
    const isTerminal = TERMINAL_STATUSES.has(existing.status)
    const unlockActive =
      existing.editUnlockActive ||
      (typeof body.editUnlockActive === 'boolean' && body.editUnlockActive)
    if (isTerminal && !unlockActive && !isAdmin) {
      return conflict(
        `ใบแจ้งซ่อมนี้อยู่ในสถานะ ${existing.status} และถูกล็อก ไม่สามารถแก้ไขได้`,
        { code: 'WO_LOCKED', field: 'status' },
      )
    }

    // ── Validate status transition (if status provided) ───────────────
    const newStatus = body.status ? String(body.status).trim() : null
    if (newStatus && !VALID_STATUSES.has(newStatus)) {
      return badRequest(
        `status ต้องเป็นหนึ่งใน: ${[...VALID_STATUSES].join(', ')}`,
        { field: 'status' },
      )
    }

    // ── Validate priority (if provided) ───────────────────────────────
    const newPriority = body.priority ? String(body.priority).trim() : null
    if (newPriority && !VALID_PRIORITIES.has(newPriority)) {
      return badRequest(
        `priority ต้องเป็นหนึ่งใน: ${[...VALID_PRIORITIES].join(', ')}`,
        { field: 'priority' },
      )
    }

    // ── Build the update payload ──────────────────────────────────────
    const now = new Date()
    const data: Record<string, unknown> = {}

    // Scalar text fields (only set when explicitly provided)
    const scalarFields = [
      'subject',
      'building',
      'location',
      'details',
      'detailsAdmin',
      'priority',
      'reporterName',
      'reporterEmail',
      'tel',
      'employeeCode',
      'assetNo',
      'picBefore',
      'picOnsite',
      'picAfter',
      'acceptStatus',
      'assignedTo',
      'assignedBy',
      'assignmentNote',
      'cancelReason',
      'editUnlockBy',
      'editUnlockNote',
    ]
    for (const f of scalarFields) {
      if (body[f] !== undefined) {
        const v = body[f]
        data[f] = v === null ? null : String(v)
      }
    }

    if (newStatus) data.status = newStatus

    // Boolean fields
    if (typeof body.editUnlockActive === 'boolean') {
      data.editUnlockActive = body.editUnlockActive
    }
    if (typeof body.trackable === 'boolean') {
      data.trackable = body.trackable
    }

    // Date-typed fields
    if (body.assignedAt !== undefined) {
      data.assignedAt = body.assignedAt === null ? null : new Date(body.assignedAt)
    }
    if (body.editUnlockAt !== undefined) {
      data.editUnlockAt = body.editUnlockAt === null ? null : new Date(body.editUnlockAt)
    }
    if (body.editUnlockUpdatedAt !== undefined) {
      data.editUnlockUpdatedAt =
        body.editUnlockUpdatedAt === null ? null : new Date(body.editUnlockUpdatedAt)
    }
    if (body.editUnlockClosedAt !== undefined) {
      data.editUnlockClosedAt =
        body.editUnlockClosedAt === null ? null : new Date(body.editUnlockClosedAt)
    }

    // detailsAdmin → also stamp dateAdmin with today's ISO date
    if (body.detailsAdmin !== undefined) {
      data.dateAdmin = now.toISOString().slice(0, 10)
    }

    // externalMeta — accept object or string, store as JSON string
    if (body.externalMeta !== undefined) {
      if (body.externalMeta === null) {
        data.externalMeta = null
      } else if (typeof body.externalMeta === 'object') {
        data.externalMeta = JSON.stringify(body.externalMeta)
      } else {
        data.externalMeta = String(body.externalMeta)
      }
    }

    // ── Status-derived side-effects ───────────────────────────────────
    if (newStatus === 'COMPLETED') {
      data.workCompletedAt = now
      data.closedAt = now
    } else if (newStatus === 'CANCELLED') {
      data.canceledAt = now
      if (body.cancelReason) {
        data.cancelReason = String(body.cancelReason)
      }
    } else if (newStatus === 'IN_PROGRESS') {
      data.acceptStatus = 'accepted'
    }

    // If admin toggles editUnlockActive → stamp unlock metadata
    if (typeof body.editUnlockActive === 'boolean' && body.editUnlockActive) {
      if (!existing.editUnlockActive) {
        data.editUnlockBy = data.editUnlockBy ?? userEmail
        data.editUnlockAt = data.editUnlockAt ?? now
        data.editUnlockUpdatedAt = now
      }
    } else if (typeof body.editUnlockActive === 'boolean' && !body.editUnlockActive) {
      if (existing.editUnlockActive) {
        data.editUnlockClosedAt = now
      }
    }

    const updated = await db.workOrder.update({
      where: { id: existing.id },
      data,
    })

    // Audit log
    const changedFields = Object.keys(data)
    await logAudit(
      'WO_UPDATE',
      'WorkOrder',
      updated.id,
      `แก้ไขใบแจ้งซ่อม ${updated.woNumber} (${changedFields.join(', ') || 'no fields'})`,
      {
        woNumber: updated.woNumber,
        oldStatus: existing.status,
        newStatus: updated.status,
        changedFields,
      },
      userEmail,
    )

    return ok(updated)
  } catch (err) {
    console.error('PUT /api/v1/work-orders/[id]', err)
    return serverError()
  }
}
