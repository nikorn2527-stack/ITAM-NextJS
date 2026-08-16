// ============================================================
// GET /api/sync/runs/[id] — Run detail + items
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params

  const run = await db.syncRun.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { id: 'asc' },
      },
    },
  })

  if (!run) {
    return NextResponse.json({ error: 'SyncRun not found' }, { status: 404 })
  }

  return NextResponse.json({ run })
}
