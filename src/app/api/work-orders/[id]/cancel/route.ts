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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { reason, actor } = body as {
      reason?: string
      actor?: string
    }

    if (!reason || !String(reason).trim()) {
      return NextResponse.json(
        { error: 'ต้องระบุเหตุผลในการยกเลิก' },
        { status: 400 },
      )
    }

    const wo = await db.workOrder.findUnique({ where: { id } })
    if (!wo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (wo.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'ใบงานนี้ปิดไปแล้ว ไม่สามารถยกเลิกได้' },
        { status: 400 },
      )
    }
    if (wo.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'ใบงานนี้ถูกยกเลิกไปแล้ว' },
        { status: 400 },
      )
    }

    const actorName =
      typeof actor === 'string' && actor.trim() ? actor.trim() : 'system'
    const reasonStr = String(reason).trim()
    const now = new Date()

    const updated = await db.workOrder.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        canceledAt: now,
        cancelReason: reasonStr,
      },
    })

    await db.workOrderMessage.create({
      data: {
        workOrderId: id,
        message: `ยกเลิกใบงาน — ${reasonStr}`,
        author: actorName,
        authorRole: 'admin',
      },
    })

    await logAudit(
      'WO_CANCEL',
      id,
      `ยกเลิก ${updated.woNumber ?? id}`,
      { reason: reasonStr },
      actorName,
    )

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('POST /api/work-orders/[id]/cancel', err)
    const message =
      err instanceof Error ? err.message : 'Failed to cancel work order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
