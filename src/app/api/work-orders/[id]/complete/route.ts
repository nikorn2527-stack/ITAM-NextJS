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
    const { note, picAfter, picOnsite, actor } = body as {
      note?: string | null
      picAfter?: string | null
      picOnsite?: string | null
      actor?: string
    }

    const wo = await db.workOrder.findUnique({ where: { id } })
    if (!wo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (wo.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'ใบงานนี้ปิดไปแล้ว ไม่สามารถทำเครื่องหมายเสร็จได้อีก' },
        { status: 400 },
      )
    }
    if (wo.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'ใบงานนี้ถูกยกเลิก ไม่สามารถทำเครื่องหมายเสร็จได้' },
        { status: 400 },
      )
    }

    const actorName =
      typeof actor === 'string' && actor.trim() ? actor.trim() : 'system'
    const now = new Date()

    const updated = await db.workOrder.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        workCompletedAt: now,
        closedAt: now,
        picAfter: picAfter ? String(picAfter) : wo.picAfter,
        picOnsite: picOnsite ? String(picOnsite) : wo.picOnsite,
        detailsAdmin: note
          ? (wo.detailsAdmin ? wo.detailsAdmin + '\n' : '') + String(note).trim()
          : wo.detailsAdmin,
      },
    })

    await db.workOrderMessage.create({
      data: {
        workOrderId: id,
        message: `ปิดงานเรียบร้อย${note ? ` — ${String(note).trim()}` : ''}`,
        author: actorName,
        authorRole: 'admin',
      },
    })

    await logAudit(
      'WO_COMPLETE',
      id,
      `ปิดงาน ${updated.woNumber ?? id}`,
      { note: note ?? null },
      actorName,
    )

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('POST /api/work-orders/[id]/complete', err)
    const message =
      err instanceof Error ? err.message : 'Failed to complete work order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
