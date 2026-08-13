import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateGuestContact } from '@/lib/guest-validation'

// ============================================================
// PUT /api/work-orders/[id]/reporter-edit
// Lets the original reporter (guest or session user) edit a work
// order BEFORE staff accepts it (status === 'PENDING').
//
// Required body:
//   - verifyName: string  (reporter name for identity check)
//   - verifyPhone: string (reporter phone for identity check)
//   - optional employeeCode for stricter match
//
// Editable fields (all optional):
//   - subject, building, location, details, tel
//
// For guest-submitted WOs we re-validate name + phone against the
// contactDirectory AND require it to match the stored reporter.
// For session-submitted WOs the same verification still applies for
// safety (so the user must know the original reporter's contact).
// ============================================================

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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const {
      verifyName,
      verifyPhone,
      employeeCode,
      subject,
      building,
      location,
      details,
      tel,
    } = body as Record<string, unknown>

    const wo = await db.workOrder.findUnique({ where: { id } })
    if (!wo) {
      return NextResponse.json({ error: 'ไม่พบใบงาน' }, { status: 404 })
    }

    // Only allow editing while PENDING (before staff accepts)
    if (wo.status !== 'PENDING') {
      return NextResponse.json(
        {
          error: `แก้ไขเองได้เฉพาะใบงานที่ยังไม่ถูกรับ (สถานะปัจจุบัน: ${wo.status})`,
        },
        { status: 400 },
      )
    }

    // ── Verify identity ──
    const nameStr = typeof verifyName === 'string' ? verifyName.trim() : ''
    const phoneStr = typeof verifyPhone === 'string' ? verifyPhone.trim() : ''
    const codeStr =
      typeof employeeCode === 'string' ? employeeCode.trim() : ''

    if (!nameStr || !phoneStr) {
      return NextResponse.json(
        { error: 'ต้องระบุชื่อและเบอร์โทรของผู้แจ้งเพื่อยืนยันตัวตนก่อนแก้ไข' },
        { status: 400 },
      )
    }

    // Re-validate against contactDirectory
    const validation = await validateGuestContact({
      name: nameStr,
      phone: phoneStr,
      employeeCode: codeStr || null,
    })
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error ?? 'ยืนยันตัวตนไม่สำเร็จ' },
        { status: 403 },
      )
    }

    // Cross-check: the verified identity must match the WO's stored reporter
    const canonicalName = (validation.canonicalName ?? '').trim()
    const canonicalPhone = (validation.canonicalPhone ?? '').trim()
    if (
      (wo.reporterName ?? '').trim() !== canonicalName ||
      (wo.tel ?? '').trim() !== canonicalPhone
    ) {
      return NextResponse.json(
        {
          error:
            'ชื่อ/เบอร์ที่ยืนยันไม่ตรงกับผู้แจ้งในใบงานนี้ ไม่สามารถแก้ไขได้',
        },
        { status: 403 },
      )
    }

    // ── Apply edits ──
    const data: Record<string, unknown> = {}
    if (typeof subject === 'string' && subject.trim()) {
      data.subject = subject.trim()
    }
    if (building !== undefined) {
      data.building = building ? String(building).trim() : null
    }
    if (location !== undefined) {
      data.location = location ? String(location).trim() : null
    }
    if (details !== undefined) {
      data.details = details ? String(details).trim() : null
    }
    if (tel !== undefined) {
      data.tel = tel ? String(tel).trim() : null
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'ไม่มีฟิลด์ที่ต้องการแก้ไข' },
        { status: 400 },
      )
    }

    const before = {
      subject: wo.subject,
      building: wo.building,
      location: wo.location,
      details: wo.details,
      tel: wo.tel,
    }
    const updated = await db.workOrder.update({ where: { id }, data })

    await db.workOrderMessage.create({
      data: {
        workOrderId: id,
        message: 'ผู้แจ้งแก้ไขรายละเอียดใบงานเอง',
        author: canonicalName,
        authorRole: 'reporter',
      },
    })

    await logAudit(
      'WO_REPORTER_EDIT',
      id,
      `ผู้แจ้ง (${canonicalName}) แก้ไขใบงาน ${updated.woNumber ?? id}`,
      { before, after: data },
      canonicalName,
    )

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('PUT /api/work-orders/[id]/reporter-edit', err)
    const message =
      err instanceof Error ? err.message : 'Failed to edit work order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
