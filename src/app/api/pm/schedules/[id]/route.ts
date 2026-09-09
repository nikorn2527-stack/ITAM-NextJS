import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { computeNextRunDate } from '@/lib/pm-schedule'
import { buildAuthorizationContext } from '@/lib/authorization-context'
import { normalizeSiteCode } from '@/lib/site-scope'
import { moduleUnavailableResponse } from '@/lib/module-gate'

/**
 * Derive the effective Site code for a PM schedule.
 * Returns null when the schedule is not tied to a specific Site (treated as
 * "all sites" — no Site-scoped authorization check applies).
 */
function derivePMScheduleSite(
  schedule: { site: string | null; device?: { site: string | null } | null },
): string | null {
  return normalizeSiteCode(schedule.site ?? schedule.device?.site ?? null)
}

/** GET /api/pm/schedules/[id] — single schedule with recent executions */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const unavailable = await moduleUnavailableResponse('pm')
  if (unavailable) return unavailable


  const auth = await requireAuth(req, 'VIEW_DASHBOARD')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  // P1 FIX (AUDIT-FINDINGS-FIX-018): build authorization context so we can
  // enforce Site-level access on the requested schedule. Without this, a
  // staff member at Site A could fetch PM schedules at Site B.
  const ctx = await buildAuthorizationContext(auth.user, auth.row.id, auth.row.allowedSites)
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
    // Site-level access control — deny (404 to avoid leaking existence) if
    // the user has no grant at the schedule's Site. Schedules with no Site
    // ("all sites") bypass this check.
    const scheduleSite = derivePMScheduleSite(schedule)
    if (scheduleSite && !ctx.canAccessSite(scheduleSite)) {
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
  const unavailable = await moduleUnavailableResponse('pm')
  if (unavailable) return unavailable


  const auth = await requireAuth(req, 'WO_CREATE')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  // P1 FIX (AUDIT-FINDINGS-FIX-018): Site-scoped authorization for writes.
  const ctx = await buildAuthorizationContext(auth.user, auth.row.id, auth.row.allowedSites)
  try {
    const { id } = await params
    const before = await db.pMSchedule.findUnique({
      where: { id },
      include: { device: { select: { site: true } } },
    })
    if (!before) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    // Site-level access control — caller must have WO_CREATE at the
    // schedule's current Site. If the body changes `site` to a different
    // Site, the caller must also have WO_CREATE at the NEW Site.
    const currentSite = derivePMScheduleSite(before)
    if (currentSite && !ctx.canAtSite(currentSite, 'WO_CREATE')) {
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
    // P1 FIX (AUDIT-FINDINGS-FIX-018): if the schedule is being moved to a
    // different Site, the caller must have WO_CREATE at the NEW Site too.
    if (updateData.site !== undefined) {
      const newSite = normalizeSiteCode(updateData.site as string | null)
      if (newSite && newSite !== currentSite && !ctx.canAtSite(newSite, 'WO_CREATE')) {
        return NextResponse.json(
          { error: 'ไม่มีสิทธิ์ย้ายตาราง PM ไปยังสาขาที่ระบุ' },
          { status: 403 },
        )
      }
    }
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
  const unavailable = await moduleUnavailableResponse('pm')
  if (unavailable) return unavailable


  const auth = await requireAuth(req, 'WO_CREATE')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  // P1 FIX (AUDIT-FINDINGS-FIX-018): Site-scoped authorization for writes.
  const ctx = await buildAuthorizationContext(auth.user, auth.row.id, auth.row.allowedSites)
  try {
    const { id } = await params
    const before = await db.pMSchedule.findUnique({
      where: { id },
      include: { device: { select: { site: true } } },
    })
    if (!before) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    // Site-level access control — caller must have WO_CREATE at the
    // schedule's Site.
    const scheduleSite = derivePMScheduleSite(before)
    if (scheduleSite && !ctx.canAtSite(scheduleSite, 'WO_CREATE')) {
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
