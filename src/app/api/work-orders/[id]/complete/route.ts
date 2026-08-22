import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notifyWorkOrderCompleted } from '@/lib/notifications'
import { loadAuthorizedWorkOrder } from '@/lib/wo-authz'
import { getRepairJobReferences } from '@/lib/repair-job-references'
import { validateRepairCompletionInput } from '@/lib/repair-completion-contract'

async function logAudit(
  action: string,
  entityId: string | null,
  summary: string,
  detail: Record<string, unknown> | null,
  actor: string,
  siteCode?: string | null,
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
        siteCode: siteCode ?? null,
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
      note?: unknown
      picAfter?: unknown
      picOnsite?: unknown
      resolution?: unknown
      resolutionGroup?: unknown
    }

    const completionInput = validateRepairCompletionInput({
      note,
      picAfter,
      picOnsite,
      resolution,
      resolutionGroup,
    })
    if (!completionInput.ok) {
      return NextResponse.json(
        {
          error: `ข้อมูลปิดงานไม่ถูกต้อง: ${completionInput.field}`,
          code: completionInput.code,
          field: completionInput.field,
        },
        { status: 400 },
      )
    }
    const {
      note: normalizedNote,
      picAfter: normalizedPicAfter,
      picOnsite: normalizedPicOnsite,
      resolution: normalizedResolution,
      resolutionGroup: normalizedResolutionGroup,
    } = completionInput.value

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
    // Legacy imports may retain only a raw job reference, so match all stable
    // identifiers while keeping the direct WorkOrder relation authoritative.
    const jobReferences = getRepairJobReferences(wo)
    const pendingPartsWhere = {
      approvalStatus: 'PENDING',
      OR: [
        { workOrderId: wo.id },
        ...(jobReferences.length > 0
          ? [{ workOrderNo: { in: jobReferences } }]
          : []),
      ],
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

    const resolutionTrim = normalizedResolution ?? ''
    const resolutionGroupTrim = normalizedResolutionGroup ?? ''

    const updated = await db.workOrder.update({
      where: { id: wo.id },
      data: {
        status: 'COMPLETED',
        workCompletedAt: now,
        closedAt: now,
        picAfter: normalizedPicAfter ?? wo.picAfter,
        picOnsite: normalizedPicOnsite ?? wo.picOnsite,
        resolution: resolutionTrim || null,
        resolutionGroup: resolutionTrim ? (resolutionGroupTrim || null) : null,
        detailsAdmin: normalizedNote
          ? (wo.detailsAdmin ? wo.detailsAdmin + '\n' : '') + normalizedNote
          : wo.detailsAdmin,
      },
    })

    const completionMsg = resolutionTrim
      ? `ปิดงานเรียบร้อย — ผลการแก้ไข: ${resolutionTrim}${normalizedNote ? ` (${normalizedNote})` : ''}`
      : `ปิดงานเรียบร้อย${normalizedNote ? ` — ${normalizedNote}` : ''}`

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
        note: normalizedNote,
        resolution: resolutionTrim || null,
        resolutionGroup: resolutionGroupTrim || null,
      },
      actorName,
      result.woSite,
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
