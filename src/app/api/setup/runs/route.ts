import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/setup/runs
 *   List all SetupRun records (for admin to resume past runs).
 *
 * POST /api/setup/runs
 *   Create a new SetupRun (start the wizard).
 *   Body: { organizationId, startedBy }
 *   Idempotent: if there's an active (IN_PROGRESS) run for this org, return it
 *   instead of creating a new one.
 *
 * GET /api/setup/runs/[id]
 *   Get one SetupRun + its steps.
 *
 * PATCH /api/setup/runs/[id]
 *   Update a step status: { stepKey, status, inputHash?, resultJson?, errorMessage? }
 *   Idempotent: if inputHash matches existing, skip (return current state).
 */

export async function GET(req: NextRequest) {
  const { requireAuth } = await import('@/lib/auth-middleware')
  const auth = await requireAuth(req, 'SYSTEM_CONFIG')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const runs = await db.setupRun.findMany({
    include: { steps: { orderBy: { stepKey: 'asc' } } },
    orderBy: { startedAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ runs })
}

export async function POST(req: NextRequest) {
  const { requireAuth } = await import('@/lib/auth-middleware')
  const auth = await requireAuth(req, 'SYSTEM_CONFIG')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const body = await req.json().catch(() => ({} as any))
  const { organizationId } = body || {}

  if (!organizationId) {
    return NextResponse.json({ error: 'ต้องระบุ organizationId' }, { status: 400 })
  }

  // Idempotency: return active run if exists
  const activeRun = await db.setupRun.findFirst({
    where: { organizationId, status: 'IN_PROGRESS' },
    include: { steps: true },
  })
  if (activeRun) {
    return NextResponse.json({ run: activeRun, message: 'มี SetupRun ที่กำลังดำเนินการอยู่ ส่งกลับเพื่อ resume' })
  }

  const run = await db.setupRun.create({
    data: {
      organizationId,
      status: 'IN_PROGRESS',
      currentStep: 'preflight',
      startedBy: auth.row.username ?? auth.user.email,
    },
    include: { steps: true },
  })

  await logAudit(
    'SETUP_RUN_START',
    'SetupRun',
    run.id,
    `เริ่ม Setup Wizard สำหรับองค์กร ${organizationId}`,
    { organizationId },
    auth.row.username ?? auth.user.email,
  )

  return NextResponse.json({ run }, { status: 201 })
}
