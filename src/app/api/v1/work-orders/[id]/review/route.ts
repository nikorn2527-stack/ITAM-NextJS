/**
 * POST /api/v1/work-orders/[id]/review — add a review (rating) to a work order.
 *
 * Auth: VIEW_DEVICES — OR guest (no auth, anyone who knows the work-order ID
 *      can submit a review; the unique constraint on WorkOrderReview.workOrderId
 *      enforces one review per work order regardless of caller identity).
 * Body: { rating (1-5), comment? }
 *   - Only allow if work order status = COMPLETED
 *   - Only allow one review per work order (Prisma unique constraint on
 *     WorkOrderReview.workOrderId guarantees this; we return 409 if it exists)
 *   - Audit log: WO_REVIEW
 *   Response: 201 { data: WorkOrderReview, meta }
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireApiAuth } from '@/lib/api/auth'
import {
  created,
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
  const { id } = await params

  // Try VIEW_DEVICES auth — but allow guest review (no auth) too.
  const auth = await requireApiAuth(req, 'VIEW_DEVICES')
  const isAuthed = auth.ok
  if (!isAuthed) {
    // 403 (logged-in but lacks permission) → return forbidden.
    // 401 (no token) → fall through to guest.
    if (auth.response.status !== 401) return auth.response
  }

  try {
    const order = await findWorkOrder(id)
    if (!order) return notFound('work order')

    // Only allow review after completion.
    if (order.status !== 'COMPLETED') {
      return badRequest(
        `สามารถรีวิวได้เฉพาะใบแจ้งซ่อมที่ปิดงานแล้ว (สถานะปัจจุบัน: ${order.status})`,
        { code: 'WO_NOT_COMPLETED', field: 'status' },
      )
    }

    // Enforce one-review-per-work-order.
    const existingReview = await db.workOrderReview.findUnique({
      where: { workOrderId: order.id },
    })
    if (existingReview) {
      return conflict(
        `ใบแจ้งซ่อมนี้ถูกรีวิวแล้ว`,
        { code: 'REVIEW_EXISTS', field: 'workOrderId' },
      )
    }

    const body = await req.json()
    const ratingRaw = body.rating
    const rating = Number(ratingRaw)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return badRequest('rating ต้องเป็นจำนวนเต็ม 1-5', { field: 'rating' })
    }
    const comment =
      body.comment !== undefined && body.comment !== null
        ? String(body.comment)
        : null

    // Reviewer identity
    let reviewedBy: string | null
    let userEmail: string | null
    if (isAuthed) {
      const user = auth.ctx.user
      reviewedBy = user.name || user.username || user.email
      userEmail = user.email
    } else {
      // Guest reviewer — use reporter name if available, otherwise 'ผู้แจ้ง'.
      reviewedBy = order.reporterName || 'ผู้แจ้ง'
      userEmail = null
    }

    const review = await db.workOrderReview.create({
      data: {
        workOrderId: order.id,
        rating,
        comment,
        reviewedBy,
      },
    })

    await logAudit(
      'WO_REVIEW',
      'WorkOrder',
      order.id,
      `รีวิวใบแจ้งซ่อม ${order.woNumber}: ${rating} ดาว โดย ${reviewedBy}`,
      {
        woNumber: order.woNumber,
        reviewId: review.id,
        rating,
        comment: comment ? comment.slice(0, 200) : null,
      },
      userEmail,
    )

    return created(review)
  } catch (err) {
    console.error('POST /api/v1/work-orders/[id]/review', err)
    if (err instanceof Error && err.message.includes('unique')) {
      return conflict(
        `ใบแจ้งซ่อมนี้ถูกรีวิวแล้ว`,
        { code: 'REVIEW_EXISTS', field: 'workOrderId' },
      )
    }
    return serverError()
  }
}
