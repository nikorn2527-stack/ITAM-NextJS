import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/setup/runs/[id]
 *   Get one SetupRun + its steps.
 *
 * PATCH /api/setup/runs/[id]
 *   Update status of the whole run (e.g. mark COMPLETED or CANCELLED).
 *   Body: { status?, currentStep?, errorMessage?, completedBy? }
 *
 * POST /api/setup/runs/[id]/steps
 *   Upsert a SetupStep (idempotent — if inputHash matches, skip).
 *   Body: { stepKey, status, inputHash?, resultJson?, errorMessage?, completedBy? }
 */

interface Params {
  params: { id: string }
}

export async function GET(req: NextRequest, { params }: Params) {
  const { requireAuth } = await import('@/lib/auth-middleware')
  const auth = await requireAuth(req, 'SYSTEM_CONFIG')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const run = await db.setupRun.findUnique({
    where: { id: params.id },
    include: { steps: { orderBy: { stepKey: 'asc' } } },
  })
  if (!run) {
    return NextResponse.json({ error: 'ไม่พบ SetupRun' }, { status: 404 })
  }
  return NextResponse.json({ run })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { requireAuth } = await import('@/lib/auth-middleware')
  const auth = await requireAuth(req, 'SYSTEM_CONFIG')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const body = await req.json().catch(() => ({} as any))
  const { status, currentStep, errorMessage, completedBy } = body || {}

  const existing = await db.setupRun.findUnique({ where: { id: params.id } })
  if (!existing) {
    return NextResponse.json({ error: 'ไม่พบ SetupRun' }, { status: 404 })
  }

  const data: any = {}
  if (status) data.status = status
  if (currentStep !== undefined) data.currentStep = currentStep
  if (errorMessage !== undefined) data.errorMessage = errorMessage
  if (completedBy) data.completedBy = completedBy
  if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'FAILED') {
    data.completedAt = new Date()
  }

  const run = await db.setupRun.update({ where: { id: params.id }, data })

  await logAudit(
    'SETUP_RUN_UPDATE',
    'SetupRun',
    run.id,
    `อัปเดต SetupRun: status=${run.status}${currentStep ? ' step=' + currentStep : ''}`,
    { status: run.status, currentStep: run.currentStep },
    auth.row.username ?? auth.user.email,
  )

  return NextResponse.json({ run })
}
