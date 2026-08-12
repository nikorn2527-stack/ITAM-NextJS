import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const VALID_STATUSES = new Set([
  'PENDING',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'COMPLETED',
  'CANCELLED',
])

const VALID_PRIORITIES = new Set(['ปกติ', 'ปานกลาง', 'สูง', 'ด่วน'])

async function logAudit(
  action: string,
  entityId: string | null,
  summary: string,
  detail: Record<string, unknown> | null,
  actor: string,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action,
        entity: 'WorkOrder',
        entityId,
        summary,
        detail: detail ? JSON.stringify(detail) : null,
        actor,
      },
    })
  } catch (err) {
    console.error('logAudit failed:', err)
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const wo = await db.workOrder.findUnique({
      where: { id },
      include: {
        device: {
          select: {
            id: true,
            assetCode: true,
            name: true,
            brand: true,
            model: true,
            site: true,
          },
        },
        messages: { orderBy: { createdAt: 'asc' } },
        review: true,
      },
    })
    if (!wo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ data: wo })
  } catch (err) {
    console.error('GET /api/work-orders/[id]', err)
    return NextResponse.json(
      { error: 'Failed to fetch work order' },
      { status: 500 },
    )
  }
}

const EDITABLE_FIELDS = [
  'subject',
  'building',
  'location',
  'details',
  'priority',
  'reporterName',
  'reporterEmail',
  'tel',
  'employeeCode',
  'status',
  'assignedTo',
  'assignmentNote',
  'detailsAdmin',
  'dateAdmin',
  'picBefore',
  'picOnsite',
  'picAfter',
  'deviceId',
] as const

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const before = await db.workOrder.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (body.subject !== undefined)
      data.subject = String(body.subject).trim()
    if (body.building !== undefined)
      data.building = body.building ? String(body.building).trim() : null
    if (body.location !== undefined)
      data.location = body.location ? String(body.location).trim() : null
    if (body.details !== undefined)
      data.details = body.details ? String(body.details).trim() : null
    if (body.priority !== undefined) {
      const p = String(body.priority).trim()
      if (VALID_PRIORITIES.has(p)) data.priority = p
    }
    if (body.reporterName !== undefined)
      data.reporterName = body.reporterName
        ? String(body.reporterName).trim()
        : null
    if (body.reporterEmail !== undefined)
      data.reporterEmail = body.reporterEmail
        ? String(body.reporterEmail).trim()
        : null
    if (body.tel !== undefined)
      data.tel = body.tel ? String(body.tel).trim() : null
    if (body.employeeCode !== undefined)
      data.employeeCode = body.employeeCode
        ? String(body.employeeCode).trim()
        : null
    if (body.status !== undefined) {
      const s = String(body.status).trim()
      if (VALID_STATUSES.has(s)) data.status = s
    }
    if (body.assignedTo !== undefined)
      data.assignedTo = body.assignedTo ? String(body.assignedTo).trim() : null
    if (body.assignmentNote !== undefined)
      data.assignmentNote = body.assignmentNote
        ? String(body.assignmentNote).trim()
        : null
    if (body.detailsAdmin !== undefined)
      data.detailsAdmin = body.detailsAdmin
        ? String(body.detailsAdmin).trim()
        : null
    if (body.dateAdmin !== undefined)
      data.dateAdmin = body.dateAdmin ? String(body.dateAdmin).trim() : null
    if (body.picBefore !== undefined)
      data.picBefore = body.picBefore ? String(body.picBefore) : null
    if (body.picOnsite !== undefined)
      data.picOnsite = body.picOnsite ? String(body.picOnsite) : null
    if (body.picAfter !== undefined)
      data.picAfter = body.picAfter ? String(body.picAfter) : null
    if (body.deviceId !== undefined)
      data.deviceId =
        typeof body.deviceId === 'string' && body.deviceId.trim()
          ? body.deviceId.trim()
          : null

    const updated = await db.workOrder.update({ where: { id }, data })

    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const k of EDITABLE_FIELDS) {
      if (body[k] !== undefined) {
        const from = before[k as keyof typeof before]
        const to = updated[k as keyof typeof updated]
        if (String(from ?? '') !== String(to ?? '')) {
          changes[k] = { from, to }
        }
      }
    }

    const actorName =
      typeof body.actor === 'string' && body.actor.trim()
        ? body.actor.trim()
        : 'system'

    await logAudit(
      'UPDATE',
      id,
      `แก้ไขใบแจ้งซ่อม ${updated.woNumber ?? id}`,
      { changes },
      actorName,
    )

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('PUT /api/work-orders/[id]', err)
    const message =
      err instanceof Error ? err.message : 'Failed to update work order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
