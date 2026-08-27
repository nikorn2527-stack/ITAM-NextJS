import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/pm/executions?scheduleId=&status=&from=&to=
 *
 * Returns executions, optionally filtered.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DASHBOARD')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { searchParams } = new URL(req.url)
    const scheduleId = searchParams.get('scheduleId')?.trim() ?? ''
    const status = searchParams.get('status')?.trim() ?? ''
    const from = searchParams.get('from')?.trim() ?? ''
    const to = searchParams.get('to')?.trim() ?? ''
    const limit = Math.min(200, Number(searchParams.get('limit') ?? 50))

    const where: Record<string, unknown> = {}
    if (scheduleId) where.scheduleId = scheduleId
    if (status) where.status = status
    if (from || to) {
      where.scheduledDate = {}
      if (from) (where.scheduledDate as Record<string, unknown>).gte = from
      if (to) (where.scheduledDate as Record<string, unknown>).lte = to
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
  try {
    const body = await req.json()
    if (!body.scheduleId || !body.scheduledDate) {
      return NextResponse.json(
        { error: 'Missing required fields: scheduleId, scheduledDate' },
        { status: 400 },
      )
    }

    // Verify schedule exists
    const schedule = await db.pMSchedule.findUnique({
      where: { id: body.scheduleId },
    })
    if (!schedule) {
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
      { error: err instanceof Error ? err.message : 'Failed to create execution' },
      { status: 500 },
    )
  }
}
