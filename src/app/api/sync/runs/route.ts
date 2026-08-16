// ============================================================
// GET /api/sync/runs — List sync runs (history)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(req.url)
  const source = url.searchParams.get('source')
  const mode = url.searchParams.get('mode')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100)

  const where: Record<string, unknown> = {}
  if (source) where.source = source
  if (mode) where.mode = mode

  const runs = await db.syncRun.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      source: true,
      target: true,
      mode: true,
      status: true,
      totalRows: true,
      createRows: true,
      updateRows: true,
      skipRows: true,
      errorRows: true,
      startedAt: true,
      completedAt: true,
      durationMs: true,
      triggeredBy: true,
      siteScope: true,
      errorMessage: true,
      retryOf: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ runs })
}
