import { NextRequest, NextResponse } from 'next/server'
import { moduleUnavailableResponse } from '@/lib/module-gate'
import { db } from '@/lib/db'
import { reportsService } from '@/modules/reports'

type ReportType = 'dashboard_summary' | 'cycle' | 'audit' | 'utilization'
type RangeKey = 'month' | '30d' | 'quarter' | 'all'

interface RangeInfo {
  key: RangeKey
  label: string
  start: string | null
  end: string | null
}

function computeRange(key: RangeKey): RangeInfo {
  const now = new Date()
  const todayISO = now.toISOString().slice(0, 10)

  if (key === '30d') {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    return { key, label: '30 วันล่าสุด', start, end: todayISO }
  }

  if (key === 'quarter') {
    const month = now.getMonth()
    const qStartMonth = Math.floor(month / 3) * 3
    const startY = now.getFullYear()
    const start = `${startY}-${String(qStartMonth + 1).padStart(2, '0')}-01`
    const endMonth = qStartMonth + 2
    const endY = endMonth > 11 ? startY + 1 : startY
    const endMonthIdx = endMonth > 11 ? endMonth - 12 : endMonth
    const daysInEnd = new Date(endY, endMonthIdx + 1, 0).getDate()
    const end = `${endY}-${String(endMonthIdx + 1).padStart(2, '0')}-${String(daysInEnd).padStart(2, '0')}`
    return { key, label: 'ไตรมาสนี้', start, end }
  }

  if (key === 'all') {
    return { key, label: 'ทั้งหมด', start: null, end: null }
  }

  // month
  const startY = now.getFullYear()
  const startMonth = now.getMonth()
  const start = `${startY}-${String(startMonth + 1).padStart(2, '0')}-01`
  const daysInMonth = new Date(startY, startMonth + 1, 0).getDate()
  const end = `${startY}-${String(startMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
  return { key, label: 'เดือนนี้', start, end }
}

function readingDateWhere(range: RangeInfo): Record<string, unknown> {
  if (range.start === null && range.end === null) return {}
  if (range.start && range.end) {
    return { date: { gte: range.start, lte: range.end } }
  }
  if (range.start) return { date: { gte: range.start } }
  if (range.end) return { date: { lte: range.end } }
  return {}
}

const STATUS_LABEL_MAP: Record<string, string> = {
  active: 'ใช้งานอยู่',
  spare: 'สำรอง',
  repair: 'ส่งซ่อม',
  disposed: 'ตัดของออก',
}

async function buildDashboardSummary(rangeKey: RangeKey) {
  const range = computeRange(rangeKey)
  const devices = await db.device.findMany({
    orderBy: { createdAt: 'desc' },
  })

  const total = devices.length
  // Device statuses are legacy mixed-case values in existing databases.
  // Normalize at the report boundary so dashboard counts stay correct across
  // both legacy and newly seeded records.
  const active = devices.filter((d) => d.status.toLowerCase() === 'active').length
  const spare = devices.filter((d) => d.status.toLowerCase() === 'spare').length
  const repair = devices.filter((d) => d.status.toLowerCase() === 'repair').length

  const statusMap = new Map<string, number>()
  for (const d of devices) {
    statusMap.set(d.status, (statusMap.get(d.status) ?? 0) + 1)
  }
  const byStatus = Array.from(statusMap.entries()).map(([name, value]) => ({
    name: STATUS_LABEL_MAP[name.toLowerCase()] ?? name,
    raw: name,
    value,
  }))

  const typeMap = new Map<string, number>()
  for (const d of devices) {
    typeMap.set(d.type, (typeMap.get(d.type) ?? 0) + 1)
  }
  const byType = Array.from(typeMap.entries()).map(([name, value]) => ({
    name,
    value,
  }))

  const rangeReadings = await db.meterReading.findMany({
    where: readingDateWhere(range),
    select: { deviceId: true, delta: true },
  })
  const usageMap = new Map<string, number>()
  for (const r of rangeReadings) {
    usageMap.set(r.deviceId, (usageMap.get(r.deviceId) ?? 0) + r.delta)
  }
  const topUsage = devices
    .map((d) => ({
      id: d.id,
      name: d.name,
      assetCode: d.assetCode,
      value: usageMap.get(d.id) ?? 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  const recent = await db.meterReading.findMany({
    where: readingDateWhere(range),
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { device: { select: { id: true, name: true, assetCode: true } } },
  })
  const recentActivity = recent.map((r) => ({
    id: r.id,
    deviceName: r.device?.name ?? '-',
    assetCode: r.device?.assetCode ?? '-',
    reading: r.reading,
    delta: r.delta,
    date: r.date,
    remark: r.remark,
  }))

  const paperUsage = rangeReadings.reduce(
    (sum, r) => sum + (r.delta > 0 ? r.delta : 0),
    0,
  )

  return {
    type: 'dashboard_summary',
    generatedAt: new Date().toISOString(),
    range,
    summary: {
      totals: { total, active, spare, repair },
      paperThisMonth: paperUsage,
    },
    byStatus,
    byType,
    topUsage,
    recentActivity,
  }
}

async function buildCycleReport(rangeKey: RangeKey) {
  const range = computeRange(rangeKey)
  const cycles = await db.cycle.findMany({
    orderBy: { startDate: 'desc' },
    take: 20,
  })
  const readings = await db.meterReading.findMany({
    where: readingDateWhere(range),
    include: {
      device: {
        select: { id: true, name: true, assetCode: true, site: true },
      },
    },
    orderBy: { date: 'desc' },
    take: 200,
  })

  const totalDelta = readings.reduce(
    (sum, r) => sum + (r.delta > 0 ? r.delta : 0),
    0,
  )
  const byDeviceMap = new Map<string, { name: string; assetCode: string; site: string; delta: number; count: number }>()
  for (const r of readings) {
    const key = r.deviceId
    const entry = byDeviceMap.get(key) ?? {
      name: r.device?.name ?? '-',
      assetCode: r.device?.assetCode ?? '-',
      site: r.device?.site ?? '-',
      delta: 0,
      count: 0,
    }
    entry.delta += r.delta
    entry.count += 1
    byDeviceMap.set(key, entry)
  }
  const byDevice = Array.from(byDeviceMap.entries())
    .map(([deviceId, v]) => ({ deviceId, ...v }))
    .sort((a, b) => b.delta - a.delta)

  return {
    type: 'cycle',
    generatedAt: new Date().toISOString(),
    range,
    cycles: cycles.map((c) => ({
      id: c.id,
      name: c.name,
      startDate: c.startDate,
      endDate: c.endDate,
      status: c.status,
    })),
    readingCount: readings.length,
    totalSheets: totalDelta,
    byDevice,
    recentReadings: readings.slice(0, 20).map((r) => ({
      id: r.id,
      date: r.date,
      reading: r.reading,
      delta: r.delta,
      remark: r.remark,
      deviceName: r.device?.name ?? '-',
      assetCode: r.device?.assetCode ?? '-',
    })),
  }
}

async function buildAuditReport(rangeKey: RangeKey) {
  const range = computeRange(rangeKey)
  const where: Record<string, unknown> = readingDateWhere(range)
  // AuditLog stores createdAt as DateTime — apply range as date-gte/lte on
  // ISO date strings (works for SQLite when Prisma converts).
  if (range.start && range.end) {
    where.createdAt = {
      gte: new Date(range.start + 'T00:00:00'),
      lte: new Date(range.end + 'T23:59:59'),
    }
  } else if (range.start) {
    where.createdAt = { gte: new Date(range.start + 'T00:00:00') }
  } else if (range.end) {
    where.createdAt = { lte: new Date(range.end + 'T23:59:59') }
  }

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  const actionMap = new Map<string, number>()
  for (const l of logs) {
    actionMap.set(l.action, (actionMap.get(l.action) ?? 0) + 1)
  }
  const byAction = Array.from(actionMap.entries()).map(([action, count]) => ({
    action,
    count,
  }))
  const entityMap = new Map<string, number>()
  for (const l of logs) {
    entityMap.set(l.entity, (entityMap.get(l.entity) ?? 0) + 1)
  }
  const byEntity = Array.from(entityMap.entries()).map(([entity, count]) => ({
    entity,
    count,
  }))

  return {
    type: 'audit',
    generatedAt: new Date().toISOString(),
    range,
    totalCount: logs.length,
    byAction,
    byEntity,
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      summary: l.summary,
      actor: l.actor,
      createdAt: l.createdAt.toISOString(),
    })),
  }
}

async function buildUtilizationReport(rangeKey: RangeKey) {
  const range = computeRange(rangeKey)
  const devices = await db.device.findMany({
    select: {
      id: true,
      assetCode: true,
      name: true,
      brand: true,
      model: true,
      site: true,
      type: true,
      status: true,
      lastMeterReading: true,
    },
    orderBy: { assetCode: 'asc' },
  })
  const readings = await db.meterReading.findMany({
    where: readingDateWhere(range),
    select: { deviceId: true, delta: true },
  })
  const usageMap = new Map<string, number>()
  for (const r of readings) {
    usageMap.set(r.deviceId, (usageMap.get(r.deviceId) ?? 0) + r.delta)
  }
  const rows = devices.map((d) => ({
    id: d.id,
    assetCode: d.assetCode,
    name: d.name,
    brand: d.brand,
    model: d.model,
    site: d.site,
    type: d.type,
    status: d.status,
    lastMeterReading: d.lastMeterReading,
    sheets: usageMap.get(d.id) ?? 0,
  }))
  rows.sort((a, b) => b.sheets - a.sheets)
  const totalSheets = rows.reduce((s, r) => s + r.sheets, 0)
  const usedCount = rows.filter((r) => r.sheets > 0).length
  return {
    type: 'utilization',
    generatedAt: new Date().toISOString(),
    range,
    deviceCount: rows.length,
    usedDeviceCount: usedCount,
    totalSheets,
    devices: rows,
  }
}

async function buildReport(
  type: ReportType,
  rangeKey: RangeKey,
): Promise<Record<string, unknown>> {
  switch (type) {
    case 'dashboard_summary':
      return (await buildDashboardSummary(rangeKey)) as unknown as Record<
        string,
        unknown
      >
    case 'cycle':
      return (await buildCycleReport(rangeKey)) as unknown as Record<
        string,
        unknown
      >
    case 'audit':
      return (await buildAuditReport(rangeKey)) as unknown as Record<
        string,
        unknown
      >
    case 'utilization':
      return (await buildUtilizationReport(rangeKey)) as unknown as Record<
        string,
        unknown
      >
    default:
      throw new Error(`Unknown report type: ${type}`)
  }
}

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  dashboard_summary: 'สรุป Dashboard',
  cycle: 'รอบจดมิเตอร์',
  audit: 'ประวัติการใช้งาน',
  utilization: 'การใช้งานอุปกรณ์',
}

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
