import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
//        body: { stage, image_data, fileName?, uploadedBy? }
//   DELETE /api/work-orders/:id/images?imageId=… → delete one image
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
    const images = await db.workOrderImage.findMany({
      where: { workOrderId: id },
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
  try {
    const { id } = await params
    const wo = await db.workOrder.findUnique({
      where: { id },
      select: { id: true, woNumber: true },
    })
    if (!wo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await req.json()
    const stage = typeof body.stage === 'string' ? body.stage.trim() : ''
    const imageData = typeof body.image_data === 'string' ? body.image_data : ''
    const fileName =
      typeof body.fileName === 'string' && body.fileName.trim()
        ? body.fileName.trim().slice(0, 255)
        : null
    const uploadedBy =
      typeof body.uploadedBy === 'string' && body.uploadedBy.trim()
        ? body.uploadedBy.trim().slice(0, 120)
        : null

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
      where: { workOrderId: id, stage },
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
        workOrderId: id,
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
      `เพิ่มรูป (${stage}) ในใบงาน ${wo.woNumber ?? id}`,
      { workOrderId: id, stage, fileName, sizeBytes: imageData.length },
      actor,
    )

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/work-orders/[id]/images', err)
    const message =
      err instanceof Error ? err.message : 'Failed to add work order image'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
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
    if (!img || img.workOrderId !== id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: { woNumber: true },
    })

    await db.workOrderImage.delete({ where: { id: imageId } })

    const actorHeader = req.headers.get('x-actor')
    const actor =
      typeof actorHeader === 'string' && actorHeader.trim()
        ? actorHeader.trim()
        : 'system'

    await logAudit(
      'WO_IMAGE_DELETE',
      imageId,
      `ลบรูป (${img.stage}) ในใบงาน ${wo?.woNumber ?? id}`,
      { workOrderId: id, stage: img.stage, fileName: img.fileName },
      actor,
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/work-orders/[id]/images', err)
    const message =
      err instanceof Error ? err.message : 'Failed to delete work order image'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
