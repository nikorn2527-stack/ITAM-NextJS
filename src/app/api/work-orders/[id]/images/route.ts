import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { loadAuthorizedWorkOrder } from '@/lib/wo-authz'

// ============================================================
// /api/work-orders/[id]/images
//
// Multi-image support for work orders. Replaces the old single
// `picBefore` / `picOnsite` / `picAfter` fields with a proper
// relation (WorkOrderImage). Each work order can have many images
// per stage ('before' | 'onsite' | 'after').
//
//   GET    /api/work-orders/:id/images           → { data: WorkOrderImage[] }
//   POST   /api/work-orders/:id/images           → add one image
//        body: { stage, image_data, fileName? }
//   DELETE /api/work-orders/:id/images?imageId=… → delete one image
//
// Security (Task ID: RESIDUAL-BLOCKERS-ROUND-4):
//   Every handler authenticates + authorizes the PARENT Work Order
//   via `loadAuthorizedWorkOrder`, which:
//     • Verifies the JWT
//     • Builds the AuthorizationContext (grants, site scope)
//     • Loads the WO (by id / woNumber / requestId)
//     • Derives the WO's Site (siteCode ?? device.site)
//     • Checks `canAtSite(woSite, permission)` — NOT the union `can()`
//       (prevents the UDH=admin/NKP=viewer escalation via the union)
//   GET    requires WO_VIEW_ALL at the WO's Site (allowOwn so reporters
//          can fetch images of their own WOs).
//   POST   requires WO_ASSIGN at the WO's Site (no allowOwn — mutating
//          child records of someone else's WO is not permitted).
//   DELETE requires WO_ASSIGN at the WO's Site (no allowOwn).
//   Failures return 404 (not 403) to avoid leaking WO existence.
// ============================================================

const VALID_STAGES = new Set(['before', 'onsite', 'after'])

// SQLite text columns have a practical 1GB ceiling, but we cap base64
// payloads to keep request bodies sane (≈ 1.5MB base64 ≈ 1MB image).
const MAX_IMAGE_DATA_BYTES = 1_500_000

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
        entity: 'WorkOrderImage',
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req, 'WO_VIEW_ALL')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params

    // Authenticate + authorize the parent WO at its Site.
    // allowOwn lets a reporter view images of their own WO even
    // without a Site-scoped WO_VIEW_ALL permission.
    const result = await loadAuthorizedWorkOrder(req, id, 'WO_VIEW_ALL', {
      allowOwn: true,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const images = await db.workOrderImage.findMany({
      where: { workOrderId: result.wo.id },
      orderBy: [{ stage: 'asc' }, { createdAt: 'asc' }],
    })

    // Group by stage for convenience
    const grouped: {
      before: typeof images
      onsite: typeof images
      after: typeof images
    } = {
      before: [],
      onsite: [],
      after: [],
    }
    for (const img of images) {
      if (
        img.stage === 'before' ||
        img.stage === 'onsite' ||
        img.stage === 'after'
      ) {
        grouped[img.stage].push(img)
      }
    }

    return NextResponse.json({ data: images, grouped })
  } catch (err) {
    console.error('GET /api/work-orders/[id]/images', err)
    return NextResponse.json(
      { error: 'Failed to fetch work order images' },
      { status: 500 },
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth: loadAuthorizedWorkOrder does the site-scoped WO_ASSIGN check.
  // Basic auth here — wo-authz layer enforces the correct permission.
  const auth = await requireAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params

    // Mutating child records (images) requires WO_ASSIGN at the WO's Site.
    // allowOwn is NOT set — only Site-scoped assigners can upload images.
    const result = await loadAuthorizedWorkOrder(req, id, 'WO_ASSIGN')
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    const { wo, auth } = result

    const body = await req.json()
    const stage = typeof body.stage === 'string' ? body.stage.trim() : ''
    const imageData = typeof body.image_data === 'string' ? body.image_data : ''
    const fileName =
      typeof body.fileName === 'string' && body.fileName.trim()
        ? body.fileName.trim().slice(0, 255)
        : null
    // The uploader identity is ALWAYS the authenticated session —
    // never trust a body-supplied uploadedBy field (spoofing risk).
    const uploadedBy =
      auth.user.email || auth.user.name || auth.user.username || null

    if (!VALID_STAGES.has(stage)) {
      return NextResponse.json(
        { error: 'stage ต้องเป็น before | onsite | after' },
        { status: 400 },
      )
    }
    if (!imageData) {
      return NextResponse.json(
        { error: 'กรุณาแนบข้อมูลรูป (image_data)' },
        { status: 400 },
      )
    }
    if (imageData.length > MAX_IMAGE_DATA_BYTES) {
      return NextResponse.json(
        {
          error: `รูปใหญ่เกินไป (${(imageData.length / 1024).toFixed(0)} KB) — กรุณาลดขนาดก่อนอัปโหลด`,
        },
        { status: 413 },
      )
    }

    // Cap images per stage to keep storage sane (matches the 9-image UI cap
    // plus some headroom for staff uploads after creation).
    const STAGE_CAP = 12
    const count = await db.workOrderImage.count({
      where: { workOrderId: wo.id, stage },
    })
    if (count >= STAGE_CAP) {
      return NextResponse.json(
        {
          error: `รูปในขั้นตอน ${stage} เต็มแล้ว (สูงสุด ${STAGE_CAP} รูป)`,
        },
        { status: 400 },
      )
    }

    const created = await db.workOrderImage.create({
      data: {
        workOrderId: wo.id,
        stage,
        image_data: imageData,
        fileName,
        uploadedBy,
      },
    })

    const actor = uploadedBy ?? 'system'
    await logAudit(
      'WO_IMAGE_ADD',
      created.id,
      `เพิ่มรูป (${stage}) ในใบงาน ${wo.woNumber ?? wo.id}`,
      { workOrderId: wo.id, stage, fileName, sizeBytes: imageData.length },
      actor,
      result.woSite,
    )

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/work-orders/[id]/images', err)
    const message =
      process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Failed to add work order image') : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req, 'WO_CANCEL')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params

    // Deleting child records (images) requires WO_ASSIGN at the WO's Site.
    const result = await loadAuthorizedWorkOrder(req, id, 'WO_ASSIGN')
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    const { wo, auth } = result

    const { searchParams } = new URL(req.url)
    const imageId = searchParams.get('imageId')?.trim() ?? ''
    if (!imageId) {
      return NextResponse.json(
        { error: 'ต้องระบุ ?imageId=' },
        { status: 400 },
      )
    }

    const img = await db.workOrderImage.findUnique({
      where: { id: imageId },
    })
    if (!img || img.workOrderId !== wo.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await db.workOrderImage.delete({ where: { id: imageId } })

    // Audit-log actor is ALWAYS the authenticated session identity —
    // never trust a body/header-supplied actor field.
    const actor =
      auth.user.email || auth.user.name || auth.user.username || 'system'

    await logAudit(
      'WO_IMAGE_DELETE',
      imageId,
      `ลบรูป (${img.stage}) ในใบงาน ${wo.woNumber ?? wo.id}`,
      { workOrderId: wo.id, stage: img.stage, fileName: img.fileName },
      actor,
      result.woSite,
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/work-orders/[id]/images', err)
    const message =
      process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Failed to delete work order image') : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
