import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { buildAuthorizationContext } from '@/lib/authorization-context'
import { normalizeSiteCode } from '@/lib/site-scope'
import { moduleUnavailableResponse } from '@/lib/module-gate'

/**
 * Derive the effective Site code for a PM execution (via its schedule).
 * Returns null when the schedule is not tied to a specific Site.
 */
function derivePMExecutionSite(
  schedule: { site: string | null; device?: { site: string | null } | null } | null,
): string | null {
  if (!schedule) return null
  return normalizeSiteCode(schedule.site ?? schedule.device?.site ?? null)
}

/**
 * POST /api/pm/executions/[id]/complete
 *
 * Marks a PM execution as COMPLETED.
 * Body: {
 *   checklistResult?: Array<{ id, label, done, note? }>,
 *   remark?: string,
 *   performedBy?: string,
 *   images?: string[],  // base64 data URLs
 * }
 */
export async function POST(
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
    const before = await db.pMExecution.findUnique({
      where: { id },
      include: { schedule: { include: { device: { select: { site: true } } } } },
    })
    if (!before) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    // P1 FIX (AUDIT-FINDINGS-FIX-018): Site-level access control — caller
    // must have WO_CREATE at the execution's schedule Site.
    const executionSite = derivePMExecutionSite(before.schedule)
    if (executionSite && !ctx.canAtSite(executionSite, 'WO_CREATE')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await req.json()
    const today = new Date().toISOString().slice(0, 10)

    // Validate checklist if schedule has one
    if (before.schedule?.checklist) {
      try {
        const requiredItems = JSON.parse(before.schedule.checklist) as Array<{
          id: string
          label: string
          required: boolean
        }>
        const requiredMissing = requiredItems.filter(
          (item) => item.required && !(body.checklistResult as Array<{ id: string; done: boolean }>[])?.find(
            (r) => r.id === item.id && r.done,
          ),
        )
        if (requiredMissing.length > 0) {
          return NextResponse.json(
            {
              error: `ยังทำรายการบังคับไม่ครบ: ${requiredMissing.map((i) => i.label).join(', ')}`,
              missingItems: requiredMissing,
            },
            { status: 400 },
          )
        }
      } catch (parseErr) {
        console.error('Failed to parse checklist:', parseErr)
      }
    }

    const updated = await db.pMExecution.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        executedDate: today,
        checklistResult: body.checklistResult
          ? (typeof body.checklistResult === 'string'
              ? body.checklistResult
              : JSON.stringify(body.checklistResult))
          : null,
        remark: body.remark ? String(body.remark).trim() : null,
        performedBy: body.performedBy
          ? String(body.performedBy).trim()
          : auth.user.email,
        images: body.images
          ? (typeof body.images === 'string'
              ? body.images
              : JSON.stringify(body.images))
          : null,
      },
    })

    await logAudit(
      'UPDATE',
      'PMExecution',
      id,
      `ทำ PM เสร็จ: ${before.schedule?.scheduleNo ?? ''} (${before.schedule?.title ?? ''}) — ${before.scheduledDate}`,
      {
        scheduleId: before.scheduleId,
        scheduledDate: before.scheduledDate,
        executedDate: today,
        statusBefore: before.status,
        statusAfter: 'COMPLETED',
      },
      auth.user.email,
    )

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('POST /api/pm/executions/[id]/complete', err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Failed to complete execution') : 'Internal server error' },
      { status: 500 },
    )
  }
}
