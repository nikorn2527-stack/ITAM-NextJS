import { NextRequest, NextResponse } from 'next/server'
import { moduleUnavailableResponse } from '@/lib/module-gate'
import { reportsService } from '@/modules/reports'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const unavailable = moduleUnavailableResponse('reports')
  if (unavailable) return unavailable
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
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const unavailable = moduleUnavailableResponse('reports')
  if (unavailable) return unavailable
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
