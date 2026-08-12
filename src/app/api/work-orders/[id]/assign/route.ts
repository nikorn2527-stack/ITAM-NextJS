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
    const { assignedTo, assignmentNote, actor } = body as {
      assignedTo?: string
      assignmentNote?: string | null
      actor?: string
    }

    if (!assignedTo || !String(assignedTo).trim()) {
      return NextResponse.json(
        { error: 'ต้องระบุชื่อช่าง (assignedTo)' },
        { status: 400 },
      )
    }

    const wo = await db.workOrder.findUnique({ where: { id } })
    if (!wo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const actorName =
      typeof actor === 'string' && actor.trim() ? actor.trim() : 'system'
    const tech = String(assignedTo).trim()
    const note = assignmentNote ? String(assignmentNote).trim() : null
    const now = new Date()

    const updated = await db.workOrder.update({
      where: { id },
      data: {
        assignedTo: tech,
        assignedBy: actorName,
        assignedAt: now,
        assignmentNote: note,
        // Auto-advance PENDING → IN_PROGRESS when first assigned
        status: wo.status === 'PENDING' ? 'IN_PROGRESS' : wo.status,
      },
    })

    await db.workOrderMessage.create({
      data: {
        workOrderId: id,
        message: `มอบหมายช่าง: ${tech}${note ? ` — ${note}` : ''}`,
        author: actorName,
        authorRole: 'admin',
      },
    })

    await logAudit(
      'WO_ASSIGN',
      id,
      `มอบหมาย ${updated.woNumber ?? id} ให้ ${tech}`,
      { assignedTo: tech, assignedBy: actorName, note },
      actorName,
    )

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('POST /api/work-orders/[id]/assign', err)
    const message =
      err instanceof Error ? err.message : 'Failed to assign work order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
