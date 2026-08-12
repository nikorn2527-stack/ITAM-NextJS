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
    const {
      note,
      picAfter,
      picOnsite,
      actor,
      resolution,
      resolutionGroup,
    } = body as {
      note?: string | null
      picAfter?: string | null
      picOnsite?: string | null
      actor?: string
      resolution?: string | null
      resolutionGroup?: string | null
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

    // ── PART 2: Check for pending parts requests ──
    // Block completion if there are PENDING parts requests linked to this WO.
    const pendingPartsWhere = wo.woNumber
      ? {
          approvalStatus: 'PENDING',
          OR: [{ workOrderId: id }, { workOrderNo: wo.woNumber }],
        }
      : {
          approvalStatus: 'PENDING',
          workOrderId: id,
        }
    const pendingPartsCount = await db.stockTransaction.count({
      where: pendingPartsWhere,
    })
    if (pendingPartsCount > 0) {
      return NextResponse.json(
        {
          error:
            'ยังปิดงานไม่ได้ เนื่องจากมีรายการเบิกอะไหล่ที่ยังรออนุมัติ',
          pendingPartsCount,
        },
        { status: 400 },
      )
    }

    const actorName =
      typeof actor === 'string' && actor.trim() ? actor.trim() : 'system'
    const now = new Date()

    const resolutionTrim =
      typeof resolution === 'string' ? resolution.trim() : ''
    const resolutionGroupTrim =
      typeof resolutionGroup === 'string' ? resolutionGroup.trim() : ''

    const updated = await db.workOrder.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        workCompletedAt: now,
        closedAt: now,
        picAfter: picAfter ? String(picAfter) : wo.picAfter,
        picOnsite: picOnsite ? String(picOnsite) : wo.picOnsite,
        resolution: resolutionTrim || null,
        resolutionGroup: resolutionTrim ? (resolutionGroupTrim || null) : null,
        detailsAdmin: note
          ? (wo.detailsAdmin ? wo.detailsAdmin + '\n' : '') + String(note).trim()
          : wo.detailsAdmin,
      },
    })

    const completionMsg = resolutionTrim
      ? `ปิดงานเรียบร้อย — ผลการแก้ไข: ${resolutionTrim}${note ? ` (${String(note).trim()})` : ''}`
      : `ปิดงานเรียบร้อย${note ? ` — ${String(note).trim()}` : ''}`

    await db.workOrderMessage.create({
      data: {
        workOrderId: id,
        message: completionMsg,
        author: actorName,
        authorRole: 'admin',
      },
    })

    await logAudit(
      'WO_COMPLETE',
      id,
      `ปิดงาน ${updated.woNumber ?? id}`,
      {
        note: note ?? null,
        resolution: resolutionTrim || null,
        resolutionGroup: resolutionGroupTrim || null,
      },
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
