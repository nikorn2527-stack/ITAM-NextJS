import { NextRequest, NextResponse } from 'next/server'
import { moduleUnavailableResponse } from '@/lib/module-gate'
import {
  buildReport,
  computeRange,
  REPORT_TYPE_LABELS,
  reportsService,
  type RangeKey,
  type ReportType,
} from '@/modules/reports'

export async function GET(req: NextRequest) {
  const unavailable = moduleUnavailableResponse('reports')
  if (unavailable) return unavailable
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(
      Number(searchParams.get('limit') ?? '20') || 20,
      100,
    )
    const reports = await reportsService.listRecent(limit)
    return NextResponse.json({ reports })
  } catch (err) {
    console.error('GET /api/reports', err)
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  const unavailable = moduleUnavailableResponse('reports')
  if (unavailable) return unavailable
  try {
    const body = await req.json()
    const type = String(body.type ?? '') as ReportType
    const rangeKey = (String(body.rangeKey ?? 'month') as RangeKey) || 'month'
    const filters = body.filters
    if (!['dashboard_summary', 'cycle', 'audit', 'utilization'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid report type' },
        { status: 400 },
      )
    }
    if (!['month', '30d', 'quarter', 'all'].includes(rangeKey)) {
      return NextResponse.json(
        { error: 'Invalid rangeKey' },
        { status: 400 },
      )
    }

    const data = await buildReport(type, rangeKey)
    const range = computeRange(rangeKey)
    const title =
      String(body.title ?? '').trim() ||
      `${REPORT_TYPE_LABELS[type]} — ${range.label} (${new Date().toLocaleString('th-TH')})`

    const created = await reportsService.createRecord({
      type,
      title,
      rangeKey,
      filters: filters ? JSON.stringify(filters) : null,
      data: JSON.stringify(data),
      format: 'json',
    })

    return NextResponse.json({ report: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/reports', err)
    const message = err instanceof Error ? err.message : 'Failed to create report'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
