import { NextRequest, NextResponse } from 'next/server'
import { moduleUnavailableResponse } from '@/lib/module-gate'
import { requireAuth } from '@/lib/auth-middleware'
import { reportsService } from '@/modules/reports'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const unavailable = moduleUnavailableResponse('reports')
  if (unavailable) return unavailable

  // Milestone 1 — Security baseline: require VIEW_REPORTS
  const auth = await requireAuth(req, 'VIEW_REPORTS')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { id } = await params
    const report = await reportsService.getDetail(id)
    if (!report) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ report })
  } catch (err) {
    console.error('GET /api/reports/[id]', err)
    return NextResponse.json(
      { error: 'Failed to fetch report' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const unavailable = moduleUnavailableResponse('reports')
  if (unavailable) return unavailable

  // Milestone 1 — Security baseline: require MANAGE_REPORTS for delete
  const auth = await requireAuth(req, 'MANAGE_REPORTS')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { id } = await params
    const deleted = await reportsService.deleteRecord(id)
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/reports/[id]', err)
    const message = err instanceof Error ? err.message : 'Failed to delete report'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
