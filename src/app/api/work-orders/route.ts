import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateGuestContact } from '@/lib/guest-validation'
import { notifyWorkOrderCreated } from '@/lib/notifications'
import { requireAuth } from '@/lib/auth-middleware'
import { demoTag } from '@/lib/demo-mode'

// Allowed status values
const VALID_STATUSES = new Set([
  'PENDING',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'COMPLETED',
  'CANCELLED',
])

const VALID_PRIORITIES = new Set(['ปกติ', 'ปานกลาง', 'สูง', 'ด่วน'])

const VALID_SOURCES = new Set(['session', 'guest'])

function pad3(n: number): string {
  return String(n).padStart(3, '0')
}

/**
 * Writes an AuditLog row with an explicit actor. Non-fatal.
 */
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

/**
 * Generates the next WO number using PPIT-NNNN format (aligned with Apps Script).
 * Finds MAX existing PPIT number and returns MAX+1.
 * Falls back to WO-YYYYMMDD-NNN if no PPIT numbers exist (new system).
 */
async function generateWoNumber(): Promise<string | null> {
  // ── Try PPIT-NNNN format first (original Apps Script format) ──
  const ppitPrefix = 'PPIT-'
  const lastPpit = await db.workOrder.findFirst({
    where: { woNumber: { startsWith: ppitPrefix } },
    orderBy: { woNumber: 'desc' },
    select: { woNumber: true },
  })
  let nextSeq = 1
  if (lastPpit?.woNumber) {
    const m = lastPpit.woNumber.match(/(\d+)$/)
    if (m) nextSeq = parseInt(m[1], 10) + 1
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${ppitPrefix}${String(nextSeq + attempt).padStart(4, '0')}`
    const exists = await db.workOrder.findUnique({
      where: { woNumber: candidate },
      select: { id: true },
    })
    if (!exists) return candidate
  }
  // ── Fallback: WO-YYYYMMDD-NNN ──
  const now = new Date()
  const ymd =
    `${now.getFullYear()}` +
    `${String(now.getMonth() + 1).padStart(2, '0')}` +
    `${String(now.getDate()).padStart(2, '0')}`
  const fallbackPrefix = `WO-${ymd}-`
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await db.workOrder.findFirst({
      where: { woNumber: { startsWith: fallbackPrefix } },
      orderBy: { woNumber: 'desc' },
      select: { woNumber: true },
    })
    let fbSeq = 1
    if (last?.woNumber) {
      const m = last.woNumber.match(/(\d+)$/)
      if (m) fbSeq = parseInt(m[1], 10) + 1
    }
    fbSeq += attempt
    const candidate = `${fallbackPrefix}${pad3(fbSeq)}`
    const exists = await db.workOrder.findUnique({
      where: { woNumber: candidate },
      select: { id: true },
    })
    if (!exists) return candidate
  }
  return null
}

/**
 * Validates the externalMeta payload (for external / off-site work orders).
 * Returns a normalized object or null if invalid.
 */
function normalizeExternalMeta(input: unknown): {
  clientName: string
  place?: string
  contactPhone?: string
  serials?: string[]
} | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  const clientName = String(obj.clientName ?? '').trim()
  if (!clientName) return null
  const out: {
    clientName: string
    place?: string
    contactPhone?: string
    serials?: string[]
  } = { clientName }
  if (typeof obj.place === 'string' && obj.place.trim()) {
    out.place = obj.place.trim()
  }
  if (typeof obj.contactPhone === 'string' && obj.contactPhone.trim()) {
    out.contactPhone = obj.contactPhone.trim()
  }
  if (Array.isArray(obj.serials)) {
    const serials = obj.serials
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean)
    if (serials.length > 0) out.serials = serials
  }
  return out
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() ?? ''
    const status = searchParams.get('status')?.trim() ?? ''
    const priority = searchParams.get('priority')?.trim() ?? ''
    const assignedTo = searchParams.get('assignedTo')?.trim() ?? ''
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(
      100,
      Math.max(1, Number(searchParams.get('pageSize') ?? '20') || 20),
    )

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { woNumber: { contains: search } },
        { subject: { contains: search } },
        { building: { contains: search } },
        { location: { contains: search } },
        { reporterName: { contains: search } },
        { tel: { contains: search } },
        { details: { contains: search } },
        { employeeCode: { contains: search } },
        { assignedTo: { contains: search } },
        { detailsAdmin: { contains: search } },
        { resolution: { contains: search } },
      ]
    }
    if (status && VALID_STATUSES.has(status)) where.status = status
    if (priority && VALID_PRIORITIES.has(priority)) where.priority = priority
    if (assignedTo) where.assignedTo = assignedTo

    const [items, total] = await Promise.all([
      db.workOrder.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.workOrder.count({ where }),
    ])

    // Stats for KPI bar (computed for the filtered set ignoring pagination)
    const statusGroups = await db.workOrder.groupBy({
      by: ['status'],
      where,
      _count: true,
    })
    const stats: Record<string, number> = {
      PENDING: 0,
      IN_PROGRESS: 0,
      WAITING_PARTS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    }
    for (const g of statusGroups) stats[g.status] = g._count

    return NextResponse.json({
      data: items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      stats,
    })
  } catch (err) {
    console.error('GET /api/work-orders', err)
    return NextResponse.json(
      { error: 'Failed to fetch work orders' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    // ── Demo mode: detect demo caller (optional auth — guest flow still works) ──
    const auth = await requireAuth(req).catch(() => null)
    const demo = auth?.ok ? auth : null

    const body = await req.json()
    const {
      subject,
      building,
      location,
      details,
      priority,
      reporterName,
      reporterEmail,
      tel,
      employeeCode,
      submissionSource,
      deviceId,
      picBefore,
      picBeforeImages,
      actor,
      externalMeta,
      isExternal,
      skipGuestValidation,
    } = body as Record<string, unknown>

    if (!subject || !String(subject).trim()) {
      return NextResponse.json(
        { error: 'กรุณาระบุประเภทปัญหา (subject)' },
        { status: 400 },
      )
    }

    const source =
      typeof submissionSource === 'string' &&
      VALID_SOURCES.has(submissionSource.trim())
        ? submissionSource.trim()
        : 'guest'

    // ── External work order (ลูกค้าภายนอก / นอกสถานที่) ──
    // External WOs do NOT require guest contact validation — they are
    // for clients/locations not in the system.
    const externalFlag =
      isExternal === true ||
      (externalMeta && typeof externalMeta === 'object')
    let externalMetaString: string | null = null
    if (externalFlag) {
      const norm = normalizeExternalMeta(externalMeta)
      if (!norm) {
        return NextResponse.json(
          { error: 'กรุณาระบุชื่อลูกค้า (clientName) สำหรับงานนอก' },
          { status: 400 },
        )
      }
      externalMetaString = JSON.stringify(norm)
    }

    // ── Normalize reporter info ──
    let finalReporterName =
      typeof reporterName === 'string' ? reporterName.trim() : ''
    let finalTel = typeof tel === 'string' ? tel.trim() : ''
    let finalEmployeeCode =
      typeof employeeCode === 'string' ? employeeCode.trim() : ''
    let department: string | null = null

    // ── Guest contact validation (skip for external WOs and session users) ──
    if (
      source === 'guest' &&
      !externalFlag &&
      skipGuestValidation !== true
    ) {
      if (!finalReporterName || !finalTel) {
        return NextResponse.json(
          {
            error:
              'ผู้แจ้งซ่อม (Guest) ต้องระบุชื่อและเบอร์โทร เพื่อยืนยันตัวตนกับสมุดผู้ติดต่อ',
          },
          { status: 400 },
        )
      }
      const validation = await validateGuestContact({
        name: finalReporterName,
        phone: finalTel,
        employeeCode: finalEmployeeCode || null,
      })
      if (!validation.ok) {
        return NextResponse.json(
          { error: validation.error ?? 'ยืนยันตัวตนไม่สำเร็จ' },
          { status: 403 },
        )
      }
      // Use canonical (directory) data for the stored WO
      finalReporterName = validation.canonicalName ?? finalReporterName
      finalTel = validation.canonicalPhone ?? finalTel
      finalEmployeeCode = validation.canonicalEmployeeCode ?? finalEmployeeCode
      department = validation.department ?? null
    }

    const woNumber = await generateWoNumber()
    if (!woNumber) {
      return NextResponse.json(
        { error: 'สร้างเลขใบงานไม่สำเร็จ กรุณาลองอีกครั้ง' },
        { status: 500 },
      )
    }

    const actorName =
      typeof actor === 'string' && actor.trim()
        ? actor.trim()
        : (finalReporterName || 'system')
    // NOTE (PART 3 — Single User System): when the request comes from an
    // authenticated staff/admin, use the session user's email as `actor`.
    // For guest/line submissions, the reporterName (or 'system') is fine.

    const prPriority =
      typeof priority === 'string' && VALID_PRIORITIES.has(priority)
        ? priority
        : 'ปกติ'

    const created = await db.workOrder.create({
      data: {
        woNumber,
        subject: String(subject).trim(),
        building: building ? String(building).trim() : null,
        location: location ? String(location).trim() : null,
        details: details ? String(details).trim() : null,
        priority: prPriority,
        reporterName: finalReporterName || null,
        reporterEmail: reporterEmail ? String(reporterEmail).trim() : null,
        tel: finalTel || null,
        employeeCode: finalEmployeeCode || null,
        submissionSource: source,
        deviceId:
          typeof deviceId === 'string' && deviceId.trim() ? deviceId.trim() : null,
        picBefore: picBefore ? String(picBefore) : null,
        externalMeta: externalMetaString,
        status: 'PENDING',
        ...demoTag(demo?.user ?? null),
      },
    })

    // ── Multi-image (WorkOrderImage, stage='before') ──
    // Accept either an array of base64 data URLs (preferred) or a single
    // picBefore string (legacy). Each becomes its own WorkOrderImage row so
    // the detail page can show all of them.
    const beforeImages: string[] = []
    if (Array.isArray(picBeforeImages)) {
      for (const img of picBeforeImages) {
        if (typeof img === 'string' && img.trim()) {
          beforeImages.push(img)
        }
      }
    }
    if (beforeImages.length === 0 && picBefore) {
      // Legacy single-image path: still mirror it into WorkOrderImage so the
      // detail view (which reads WorkOrderImage) shows it.
      beforeImages.push(String(picBefore))
    }
    if (beforeImages.length > 0) {
      // Cap at 9 (matches the UI limit) to keep the create payload sane.
      await db.workOrderImage.createMany({
        data: beforeImages.slice(0, 9).map((dataUrl) => ({
          workOrderId: created.id,
          stage: 'before',
          image_data: dataUrl,
          fileName: null,
          uploadedBy: actorName,
        })),
      })
    }

    // Auto system message: created
    await db.workOrderMessage.create({
      data: {
        workOrderId: created.id,
        message: externalFlag
          ? `แจ้งซ่อมใหม่ (งานนอก): ${created.subject}`
          : `แจ้งซ่อมใหม่: ${created.subject}`,
        author: actorName,
        authorRole: 'system',
      },
    })

    await logAudit(
      'WO_CREATE',
      created.id,
      `สร้างใบแจ้งซ่อม ${created.woNumber} — ${created.subject}`,
      {
        woNumber: created.woNumber,
        subject: created.subject,
        priority: created.priority,
        building: created.building,
        location: created.location,
        reporterName: created.reporterName,
        submissionSource: created.submissionSource,
        external: externalFlag,
        department,
      },
      actorName,
    )

    // ── Notification trigger (Task ID: NOTIFY-LINE) ──
    // Send 'wo_created' to LINE admin group + Telegram admin chat.
    // NOTE (PART 3): pass actor from auth context once NextAuth lands.
    try {
      await notifyWorkOrderCreated(
        {
          id: created.id,
          woNumber: created.woNumber,
          subject: created.subject,
          building: created.building,
          location: created.location,
          reporterName: created.reporterName,
          tel: created.tel,
          priority: created.priority,
          lineUserId: created.lineUserId,
        },
        { channels: ['line-oa', 'telegram'], actor: actorName },
      )
    } catch (e) {
      console.error('[notifications] wo_created trigger failed:', e)
    }

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/work-orders', err)
    const message =
      err instanceof Error ? err.message : 'Failed to create work order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
