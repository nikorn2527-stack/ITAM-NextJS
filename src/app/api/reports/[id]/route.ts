import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const report = await db.report.findUnique({ where: { id } })
    if (!report) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    let parsedData: unknown = null
    try {
      parsedData = report.data ? JSON.parse(report.data) : null
    } catch {
      parsedData = report.data
    }
    let parsedFilters: unknown = null
    try {
      parsedFilters = report.filters ? JSON.parse(report.filters) : null
    } catch {
      parsedFilters = report.filters
    }
    return NextResponse.json({
      report: {
        ...report,
        data: parsedData,
        filters: parsedFilters,
      },
    })
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
  try {
    const { id } = await params
    const existing = await db.report.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await db.report.delete({ where: { id } })
    await logAudit(
      'DELETE',
      'Report',
      id,
      `ลบรายงาน ${existing.title}`,
      { type: existing.type, rangeKey: existing.rangeKey },
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/reports/[id]', err)
    const message = err instanceof Error ? err.message : 'Failed to delete report'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
