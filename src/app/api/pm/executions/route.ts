import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { buildAuthorizationContext } from '@/lib/authorization-context'
import { normalizeSiteCode } from '@/lib/site-scope'

/**
 * Derive the effective Site code for a PM schedule.
 * Returns null when the schedule is not tied to a specific Site.
 */
function derivePMScheduleSite(
  schedule: { site: string | null; device?: { site: string | null } | null },
): string | null {
  return normalizeSiteCode(schedule.site ?? schedule.device?.site ?? null)
}

/**
 * GET /api/pm/executions?scheduleId=&status=&from=&to=
 *
 * Returns executions, optionally filtered.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DASHBOARD')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  // P1 FIX (AUDIT-FINDINGS-FIX-018): build authorization context so we can
  // scope the executions list to the caller's Sites. Without this, a staff
  // member at Site A could list PM executions for Site B.
  const ctx = await buildAuthorizationContext(auth.user, auth.row.id, auth.row.allowedSites)
  try {
    const { searchParams } = new URL(req.url)
    const scheduleId = searchParams.get('scheduleId')?.trim() ?? ''
    const status = searchParams.get('status')?.trim() ?? ''
    const from = searchParams.get('from')?.trim() ?? ''
    const to = searchParams.get('to')?.trim() ?? ''
    const limit = Math.min(100, Number(searchParams.get('limit') ?? 50))

    const where: Record<string, unknown> = {}
    if (scheduleId) where.scheduleId = scheduleId
    if (status) where.status = status
    if (from || to) {
      where.scheduledDate = {}
      if (from) (where.scheduledDate as Record<string, unknown>).gte = from
      if (to) (where.scheduledDate as Record<string, unknown>).lte = to
    }
    // Site-scope filter: restrict to executions whose schedule is at one of
    // the caller's Sites. Schedules with no Site ("all sites") are always
    // visible. Super-admins/admins bypass via siteScope.kind === 'all'.
    if (ctx.siteScope.kind === 'sites') {
      const siteCodes = ctx.siteScope.siteCodes
      where.schedule = {
        OR: [
          { site: { in: siteCodes } },
          { site: null },
        ],
      }
    } else if (ctx.siteScope.kind === 'none') {
      // No Site access at all — return nothing.
      where.schedule = { site: { in: [] } }
    }

    const executions = await db.pMExecution.findMany({
      where,
      orderBy: { scheduledDate: 'desc' },
      take: limit,
      include: {
        schedule: {
          select: {
            id: true,
            scheduleNo: true,
            title: true,
            frequency: true,
            deviceType: true,
            site: true,
            assignedTo: true,
            checklist: true,
            device: { select: { id: true, assetCode: true, name: true, type: true, site: true } },
          },
        },
      },
    })

    return NextResponse.json({ data: executions })
  } catch (err) {
    console.error('GET /api/pm/executions', err)
    return NextResponse.json({ error: 'Failed to fetch executions' }, { status: 500 })
  }
}

/**
 * POST /api/pm/executions
 * Creates a new PMExecution (typically called when starting a PM).
 * Body: { scheduleId, scheduledDate, workOrderId? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, 'WO_CREATE')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  // P1 FIX (AUDIT-FINDINGS-FIX-018): Site-scoped authorization for writes.
  const ctx = await buildAuthorizationContext(auth.user, auth.row.id, auth.row.allowedSites)
  try {
    const body = await req.json()
    if (!body.scheduleId || !body.scheduledDate) {
      return NextResponse.json(
        { error: 'Missing required fields: scheduleId, scheduledDate' },
        { status: 400 },
      )
    }

    // Verify schedule exists (include device.site to derive Site)
    const schedule = await db.pMSchedule.findUnique({
      where: { id: body.scheduleId },
      include: { device: { select: { site: true } } },
    })
    if (!schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }
    // P1 FIX (AUDIT-FINDINGS-FIX-018): Site-level access control — caller
    // must have WO_CREATE at the schedule's Site. Schedules with no Site
    // ("all sites") bypass this check.
    const scheduleSite = derivePMScheduleSite(schedule)
    if (scheduleSite && !ctx.canAtSite(scheduleSite, 'WO_CREATE')) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    // Check if execution already exists for this schedule+date
    const existing = await db.pMExecution.findFirst({
      where: {
        scheduleId: body.scheduleId,
        scheduledDate: body.scheduledDate,
      },
    })
    if (existing) {
      return NextResponse.json({ data: existing })
    }

    const created = await db.pMExecution.create({
      data: {
        scheduleId: body.scheduleId,
        scheduledDate: body.scheduledDate,
        workOrderId: body.workOrderId ? String(body.workOrderId) : null,
        status: 'PENDING',
      },
    })

    // Update schedule's lastRunDate
    await db.pMSchedule.update({
      where: { id: body.scheduleId },
      data: { lastRunDate: body.scheduledDate },
    })

    await logAudit(
      'CREATE',
      'PMExecution',
      created.id,
      `สร้าง PM execution สำหรับ ${schedule.scheduleNo} (${schedule.title}) — ${body.scheduledDate}`,
      { scheduleId: body.scheduleId, scheduledDate: body.scheduledDate },
      auth.user.email,
    )

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/pm/executions', err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Failed to create execution') : 'Internal server error' },
      { status: 500 },
    )
  }
}
