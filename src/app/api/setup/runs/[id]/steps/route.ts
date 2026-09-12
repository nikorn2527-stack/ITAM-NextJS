import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/setup/runs/[id]/steps
 *   Upsert a SetupStep (idempotent).
 *   Body: {
 *     stepKey: string, // 'preflight' | 'organization' | 'modules' | ... | 'activate'
 *     status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED',
 *     inputHash?: string, // hash of user input — if matches existing, skip
 *     resultJson?: string, // JSON string with step result
 *     errorMessage?: string,
 *     completedBy?: string,
 *   }
 *
 * Returns { step, skipped: boolean } — skipped=true if inputHash matched
 * (idempotent re-run).
 */
interface Params { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const { requireAuth } = await import('@/lib/auth-middleware')
  const auth = await requireAuth(req, 'SYSTEM_CONFIG')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const run = await db.setupRun.findUnique({ where: { id: params.id } })
  if (!run) {
    return NextResponse.json({ error: 'ไม่พบ SetupRun' }, { status: 404 })
  }
  if (run.status !== 'IN_PROGRESS') {
    return NextResponse.json(
      { error: `SetupRun ไม่ได้กำลังดำเนินการ (status=${run.status})` },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => ({} as any))
  const { stepKey, status, inputHash, resultJson, errorMessage, completedBy } = body || {}

  if (!stepKey || !status) {
    return NextResponse.json(
      { error: 'ต้องระบุ stepKey และ status' },
      { status: 400 },
    )
  }

  // Idempotency check
  const existing = await db.setupStep.findUnique({
    where: { setupRunId_stepKey: { setupRunId: params.id, stepKey } },
  })

  if (existing && inputHash && existing.inputHash === inputHash && existing.status === 'COMPLETED') {
    // Input unchanged — skip re-apply
    return NextResponse.json({ step: existing, skipped: true })
  }

  const now = new Date()
  const data: any = {
    status,
    startedAt: existing?.startedAt ?? now,
    completedAt: (status === 'COMPLETED' || status === 'FAILED' || status === 'SKIPPED') ? now : null,
  }
  if (inputHash !== undefined) data.inputHash = inputHash
  if (resultJson !== undefined) data.resultJson = resultJson
  if (errorMessage !== undefined) data.errorMessage = errorMessage
  if (completedBy) data.completedBy = completedBy
  else if (status === 'COMPLETED') data.completedBy = auth.row.username ?? auth.user.email

  const step = await db.setupStep.upsert({
    where: { setupRunId_stepKey: { setupRunId: params.id, stepKey } },
    create: { setupRunId: params.id, stepKey, ...data },
    update: data,
  })

  // Update the run's currentStep pointer
  if (status === 'COMPLETED') {
    await db.setupRun.update({
      where: { id: params.id },
      data: { currentStep: stepKey },
    })
  }

  await logAudit(
    'SETUP_STEP_UPDATE',
    'SetupStep',
    step.id,
    `อัปเดต step ${stepKey} → ${status}`,
    { stepKey, status, runId: params.id },
    auth.row.username ?? auth.user.email,
  )

  return NextResponse.json({ step, skipped: false })
}
