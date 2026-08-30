import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { computeNextRunDate } from '@/lib/pm-schedule'

/** GET /api/pm/schedules/[id] — single schedule with recent executions */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req, 'VIEW_DASHBOARD')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    const schedule = await db.pMSchedule.findUnique({
      where: { id },
      include: {
        device: {
          select: {
            id: true,
            assetCode: true,
            name: true,
            type: true,
            site: true,
          },
        },
        executions: {
          orderBy: { scheduledDate: 'desc' },
          take: 10,
        },
      },
    })
    if (!schedule) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ data: schedule })
  } catch (err) {
    console.error('GET /api/pm/schedules/[id]', err)
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 })
  }
}

/** PUT /api/pm/schedules/[id] — update schedule + recompute nextRunDate */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req, 'WO_CREATE')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    const before = await db.pMSchedule.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await req.json()
    const frequency = body.frequency ? String(body.frequency) : before.frequency

    const updateData: Record<string, unknown> = {}
    if (body.title !== undefined) updateData.title = String(body.title).trim()
    if (body.description !== undefined) updateData.description = body.description ? String(body.description).trim() : null
    if (body.frequency !== undefined) updateData.frequency = frequency
    if (body.intervalDays !== undefined) updateData.intervalDays = body.intervalDays === null ? null : Number(body.intervalDays)
    if (body.dayOfMonth !== undefined) updateData.dayOfMonth = body.dayOfMonth === null ? null : Number(body.dayOfMonth)
    if (body.weekday !== undefined) updateData.weekday = body.weekday ? String(body.weekday).trim() : null
    if (body.startMonth !== undefined) updateData.startMonth = body.startMonth === null ? null : Number(body.startMonth)
    if (body.deviceType !== undefined) updateData.deviceType = body.deviceType ? String(body.deviceType).trim() : null
    if (body.site !== undefined) updateData.site = body.site ? String(body.site).trim() : null
    if (body.deviceId !== undefined) updateData.deviceId = body.deviceId ? String(body.deviceId).trim() : null
    if (body.checklist !== undefined) {
      updateData.checklist = body.checklist
        ? (typeof body.checklist === 'string' ? body.checklist : JSON.stringify(body.checklist))
        : null
    }
    if (body.active !== undefined) updateData.active = Boolean(body.active)
    if (body.startDate !== undefined) updateData.startDate = body.startDate ? String(body.startDate).trim() : null
    if (body.autoCreateWO !== undefined) updateData.autoCreateWO = Boolean(body.autoCreateWO)
    if (body.assignedTo !== undefined) updateData.assignedTo = body.assignedTo ? String(body.assignedTo).trim() : null

    // Recompute nextRunDate if frequency-related fields changed
    const frequencyChanged = ['frequency', 'intervalDays', 'dayOfMonth', 'weekday', 'startMonth', 'startDate'].some(
      (k) => body[k] !== undefined,
    )
    if (frequencyChanged) {
      const mergedSchedule = {
        frequency: (updateData.frequency as string) ?? before.frequency,
        intervalDays: (updateData.intervalDays as number | null) ?? before.intervalDays,
        dayOfMonth: (updateData.dayOfMonth as number | null) ?? before.dayOfMonth,
        weekday: (updateData.weekday as string | null) ?? before.weekday,
        startMonth: (updateData.startMonth as number | null) ?? before.startMonth,
        startDate: (updateData.startDate as string | null) ?? before.startDate,
      }
      updateData.nextRunDate = computeNextRunDate(mergedSchedule)
    }

    const updated = await db.pMSchedule.update({
      where: { id },
      data: updateData,
    })

    await logAudit(
      'UPDATE',
      'PMSchedule',
      id,
      `แก้ไขตาราง PM ${updated.scheduleNo} (${updated.title})`,
      { changes: Object.keys(updateData) },
      auth.user.email,
    )

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('PUT /api/pm/schedules/[id]', err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Failed to update PM schedule') : 'Internal server error' },
      { status: 500 },
    )
  }
}

/** DELETE /api/pm/schedules/[id] — soft delete by setting active=false */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req, 'WO_CREATE')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    const before = await db.pMSchedule.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Soft-delete: set active=false (keep the row for audit trail)
    const updated = await db.pMSchedule.update({
      where: { id },
      data: { active: false },
    })

    await logAudit(
      'DELETE',
      'PMSchedule',
      id,
      `ปิดใช้งานตาราง PM ${updated.scheduleNo} (${updated.title})`,
      { before },
      auth.user.email,
    )

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('DELETE /api/pm/schedules/[id]', err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Failed to delete PM schedule') : 'Internal server error' },
      { status: 500 },
    )
  }
}
