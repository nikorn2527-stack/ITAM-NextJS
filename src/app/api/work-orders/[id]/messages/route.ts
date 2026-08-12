import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
      select: { id: true },
    })
    if (!wo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const messages = await db.workOrderMessage.findMany({
      where: { workOrderId: id },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ data: messages })
  } catch (err) {
    console.error('GET /api/work-orders/[id]/messages', err)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 },
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { message, author, authorRole, actor } = body as {
      message?: string
      author?: string | null
      authorRole?: string | null
      actor?: string
    }

    if (!message || !String(message).trim()) {
      return NextResponse.json(
        { error: 'ต้องระบุข้อความ' },
        { status: 400 },
      )
    }

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: { id: true, woNumber: true, status: true },
    })
    if (!wo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (wo.status === 'CANCELLED' || wo.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'ใบงานนี้ปิด/ยกเลิกแล้ว ไม่สามารถส่งข้อความได้' },
        { status: 400 },
      )
    }

    const authorName =
      typeof author === 'string' && author.trim()
        ? author.trim()
        : (typeof actor === 'string' && actor.trim() ? actor.trim() : 'system')
    const role =
      typeof authorRole === 'string' && authorRole.trim()
        ? authorRole.trim()
        : 'staff'

    const created = await db.workOrderMessage.create({
      data: {
        workOrderId: id,
        message: String(message).trim(),
        author: authorName,
        authorRole: role,
      },
    })

    await logAudit(
      'WO_MESSAGE',
      id,
      `เพิ่มข้อความใน ${wo.woNumber ?? id}`,
      { message: String(message).trim(), author: authorName },
      authorName,
    )

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/work-orders/[id]/messages', err)
    const message =
      err instanceof Error ? err.message : 'Failed to post message'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
