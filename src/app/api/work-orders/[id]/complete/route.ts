import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notifyWorkOrderCompleted } from '@/lib/notifications'
import { loadAuthorizedWorkOrder } from '@/lib/wo-authz'

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

    // Authenticate + authorize — completing a WO requires WO_COMPLETE at its Site
    const result = await loadAuthorizedWorkOrder(req, id, 'WO_COMPLETE')
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    const { wo, auth } = result

    const body = await req.json()
    const {
      note,
      picAfter,
      picOnsite,
      resolution,
      resolutionGroup,
    } = body as {
      note?: string | null
      picAfter?: string | null
      picOnsite?: string | null
      resolution?: string | null
      resolutionGroup?: string | null
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
          OR: [{ workOrderId: wo.id }, { workOrderNo: wo.woNumber }],
        }
      : {
          approvalStatus: 'PENDING',
          workOrderId: wo.id,
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

    // Use the authenticated user's email as the actor — never trust
    // a body-supplied `actor` field, which could be spoofed.
    const actorName = auth.user.email
    const now = new Date()

    const resolutionTrim =
      typeof resolution === 'string' ? resolution.trim() : ''
    const resolutionGroupTrim =
      typeof resolutionGroup === 'string' ? resolutionGroup.trim() : ''

    const updated = await db.workOrder.update({
      where: { id: wo.id },
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
        workOrderId: wo.id,
        message: completionMsg,
        author: actorName,
        authorRole: 'admin',
      },
    })

    await logAudit(
      'WO_COMPLETE',
      wo.id,
      `ปิดงาน ${updated.woNumber ?? wo.id}`,
      {
        note: note ?? null,
        resolution: resolutionTrim || null,
        resolutionGroup: resolutionGroupTrim || null,
      },
      actorName,
    )

    // ── Notification trigger (Task ID: NOTIFY-LINE) ──
    // Send 'wo_completed' to the reporter (LINE if lineUserId is known,
    // otherwise fall back to admin channels).
    try {
      await notifyWorkOrderCompleted(
        {
          id: updated.id,
          woNumber: updated.woNumber,
          subject: updated.subject,
          resolution: updated.resolution,
          detailsAdmin: updated.detailsAdmin,
          lineUserId: updated.lineUserId,
          reporterEmail: updated.reporterEmail,
        },
        { channels: ['line-oa', 'telegram'], actor: actorName },
      )
    } catch (e) {
      console.error('[notifications] wo_completed trigger failed:', e)
    }

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('POST /api/work-orders/[id]/complete', err)
    const message =
      err instanceof Error ? err.message : 'Failed to complete work order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
