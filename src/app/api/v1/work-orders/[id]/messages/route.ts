/**
 * GET /api/v1/work-orders/[id]/messages — list messages for a work order.
 *
 * Auth: VIEW_DEVICES
 * Response: { data: WorkOrderMessage[], pagination, meta }
 *
 * POST /api/v1/work-orders/[id]/messages — add a message.
 *   Auth: DEVICE_EDIT — OR guest if ?reporterTel= matches the stored tel.
 *   Body: { message }
 *   - author = current user (or 'ผู้แจ้ง' for guest)
 *   - authorRole = role (admin | staff | reporter)
 *   - Audit log: WO_MESSAGE
 *   Response: 201 { data: WorkOrderMessage, meta }
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireApiAuth } from '@/lib/api/auth'
import {
  parseQuery,
  buildOrderBy,
  list,
  created,
  badRequest,
  notFound,
  forbidden,
  serverError,
} from '@/lib/api/response'
import { findWorkOrder, roleToAuthorRole } from '../../_shared'

const FIELD_MAP: Record<string, string> = {
  author: 'author',
  authorRole: 'authorRole',
}

// ── GET ─────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) return auth.response

  const { id } = await params
  const url = new URL(req.url)
  const query = parseQuery(url)

  const order = await findWorkOrder(id)
  if (!order) return notFound('work order')

  const where = { workOrderId: order.id }
  const orderBy = buildOrderBy(query, FIELD_MAP, { createdAt: 'asc' })

  const [total, messages] = await Promise.all([
    db.workOrderMessage.count({ where }),
    db.workOrderMessage.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ])

  return list(messages, { page: query.page, limit: query.limit, total })
}

// ── POST ────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const url = new URL(req.url)
  const reporterTel = url.searchParams.get('reporterTel')?.trim() ?? ''

  // Authed access — try DEVICE_EDIT.
  const auth = await requireApiAuth(req, 'DEVICE_EDIT')
  const isAuthed = auth.ok

  if (!isAuthed) {
    // 401 → fall through to guest check (if reporterTel provided).
    // 403 → forbidden (logged-in user without permission).
    if (auth.response.status !== 401) return auth.response
    if (!reporterTel) return auth.response
  }

  try {
    const order = await findWorkOrder(id)
    if (!order) return notFound('work order')

    // Guest access — tel must match.
    if (!isAuthed) {
      if (!order.tel || order.tel.trim() !== reporterTel) {
        return forbidden('เบอร์โทรศัพท์ไม่ตรงกับใบแจ้งซ่อมนี้')
      }
    }

    const body = await req.json()
    const message = String(body.message ?? '').trim()
    if (!message) {
      return badRequest('message เป็นฟิลด์ที่ต้องการ', { field: 'message' })
    }

    // Determine author + role
    let author: string
    let authorRole: string
    if (isAuthed) {
      const user = auth.ctx.user
      author = user.name || user.username || user.email
      authorRole = roleToAuthorRole(user.role)
    } else {
      author = order.reporterName || 'ผู้แจ้ง'
      authorRole = 'reporter'
    }

    const msg = await db.workOrderMessage.create({
      data: {
        workOrderId: order.id,
        message,
        author,
        authorRole,
      },
    })

    await logAudit(
      'WO_MESSAGE',
      'WorkOrder',
      order.id,
      `เพิ่มข้อความในใบแจ้งซ่อม ${order.woNumber} โดย ${author} (${authorRole})`,
      {
        woNumber: order.woNumber,
        messageId: msg.id,
        author,
        authorRole,
        messagePreview: message.slice(0, 120),
      },
      isAuthed ? auth.ctx.user.email : null,
    )

    return created(msg)
  } catch (err) {
    console.error('POST /api/v1/work-orders/[id]/messages', err)
    return serverError()
  }
}
