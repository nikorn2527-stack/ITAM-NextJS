import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'

/**
 * POST /api/work-orders/[id]/edit-unlock
 *
 * Toggles the "edit unlock" flag on a terminal work order (COMPLETED/CANCELLED).
 * Aligned with Apps Script `setWorkOrderEditUnlock`.
 *
 * Body:
 *   { active: boolean, note?: string }
 *
 * Rules:
 *   - Requires ADMIN permission.
 *   - Can only toggle on records with status COMPLETED or CANCELLED.
 *   - active=true  → set editUnlockActive=true, editUnlockBy=user,
 *                    editUnlockAt=now, editUnlockNote=note
 *   - active=false → set editUnlockActive=false (keep other fields for audit)
 *
 * Response: { workOrder: updated }
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

const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED'])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(req, 'ADMIN')
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status },
      )
    }
    const user = auth.user
    const actor = user.username || user.email

    const { id } = await params

    let body: { active?: unknown; note?: unknown } = {}
    try {
      body = (await req.json()) as { active?: unknown; note?: unknown }
    } catch {
      body = {}
    }

    const active =
      body.active === true ||
      body.active === 'true' ||
      body.active === 1 ||
      body.active === 'TRUE' ||
      body.active === 'True'

    const note =
      typeof body.note === 'string' && body.note.trim()
        ? body.note.trim()
        : null

    const before = await db.workOrder.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Rule: only allow toggle on COMPLETED or CANCELLED records.
    if (!TERMINAL_STATUSES.has(before.status)) {
      return NextResponse.json(
        {
          error:
            'สามารถปลดล็อกแก้ไขได้เฉพาะใบงานที่สถานะ COMPLETED หรือ CANCELLED เท่านั้น',
        },
        { status: 400 },
      )
    }

    const previous = {
      editUnlockActive: before.editUnlockActive,
      editUnlockBy: before.editUnlockBy,
      editUnlockAt: before.editUnlockAt,
      editUnlockNote: before.editUnlockNote,
    }

    if (active) {
      // Unlock for editing.
      const updated = await db.workOrder.update({
        where: { id },
        data: {
          editUnlockActive: true,
          editUnlockBy: actor,
          editUnlockAt: new Date(),
          editUnlockNote: note,
        },
      })

      await logAudit(
        'UPDATE',
        id,
        `ปลดล็อกแก้ไขใบแจ้งซ่อม ${updated.woNumber ?? id}`,
        {
          editUnlock: {
            active: true,
            by: actor,
            note,
            previous,
          },
        },
        actor,
      )

      return NextResponse.json({ workOrder: updated })
    }

    // Re-lock (keep other fields for audit per Apps Script setWorkOrderEditUnlock).
    const updated = await db.workOrder.update({
      where: { id },
      data: {
        editUnlockActive: false,
      },
    })

    await logAudit(
      'UPDATE',
      id,
      `ล็อกการแก้ไขใบแจ้งซ่อม ${updated.woNumber ?? id} อีกครั้ง`,
      {
        editUnlock: {
          active: false,
          by: actor,
          previous,
        },
      },
      actor,
    )

    return NextResponse.json({ workOrder: updated })
  } catch (err) {
    console.error('POST /api/work-orders/[id]/edit-unlock', err)
    const message =
      err instanceof Error ? err.message : 'Failed to set edit unlock'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
