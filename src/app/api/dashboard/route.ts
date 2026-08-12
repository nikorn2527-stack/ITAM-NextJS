import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
    const month = now.getMonth() // 0-11
    const qStartMonth = Math.floor(month / 3) * 3 // 0,3,6,9
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

  // Default: this month
  const startY = now.getFullYear()
  const startMonth = now.getMonth()
  const start = `${startY}-${String(startMonth + 1).padStart(2, '0')}-01`
  const daysInMonth = new Date(startY, startMonth + 1, 0).getDate()
  const end = `${startY}-${String(startMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
  return { key, label: 'เดือนนี้', start, end }
}

/** Build a Prisma `where` clause on MeterReading.readingDate for the given range. */
function readingDateWhere(range: RangeInfo): Record<string, unknown> {
  if (range.start === null && range.end === null) return {} // all
  // Inclusive on both ends (readingDate is stored as YYYY-MM-DD string)
  if (range.start && range.end) {
    return { readingDate: { gte: range.start, lte: range.end } }
  }
  if (range.start) return { readingDate: { gte: range.start } }
  if (range.end) return { readingDate: { lte: range.end } }
  return {}
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const rawRange = (searchParams.get('range')?.trim() ?? 'month') as RangeKey
    const range: RangeInfo = ['month', '30d', 'quarter', 'all'].includes(rawRange)
      ? computeRange(rawRange)
      : computeRange('month')

    const devices = await db.device.findMany({
      orderBy: { createdAt: 'desc' },
    })

    const total = devices.length
    const active = devices.filter((d) => d.status?.toLowerCase() === 'active').length
    const spare = devices.filter((d) => d.status?.toLowerCase() === 'spare').length
    const repair = devices.filter((d) => d.status?.toLowerCase() === 'repair').length

    // By status
    const statusMap = new Map<string, number>()
    for (const d of devices) {
      const s = (d.status ?? 'Unknown').toLowerCase()
      statusMap.set(s, (statusMap.get(s) ?? 0) + 1)
    }
    const statusLabelMap: Record<string, string> = {
      active: 'ใช้งานอยู่',
      inactive: 'ไม่ใช้งาน',
      spare: 'สำรอง',
      repair: 'ส่งซ่อม',
      disposed: 'ตัดของออก',
    }
    const byStatus = Array.from(statusMap.entries()).map(([name, value]) => ({
      name: statusLabelMap[name] ?? name,
      raw: name,
      value,
    }))

    // By type
    const typeMap = new Map<string, number>()
    for (const d of devices) {
      const t = d.deviceType ?? 'Unknown'
      typeMap.set(t, (typeMap.get(t) ?? 0) + 1)
    }
    const byType = Array.from(typeMap.entries()).map(([name, value]) => ({
      name,
      value,
    }))

    // Top usage — filtered by selected range (sum of pagesBw + pagesColor)
    const rangeReadings = await db.meterReading.findMany({
      where: readingDateWhere(range),
      select: { assetNo: true, pagesBw: true, pagesColor: true },
    })
    const usageMap = new Map<string, number>()
    for (const r of rangeReadings) {
      const usage = (r.pagesBw ?? 0) + (r.pagesColor ?? 0)
      usageMap.set(r.assetNo, (usageMap.get(r.assetNo) ?? 0) + usage)
    }
    const topUsage = devices
      .map((d) => ({
        id: d.id,
        name: d.brand && d.model ? `${d.brand} ${d.model}`.trim() : (d.assetNo ?? '-'),
        assetCode: d.assetNo,
        value: usageMap.get(d.assetNo) ?? 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)

    // Recent activity — latest meter readings within range
    const recentWhere = readingDateWhere(range)
    const recent = await db.meterReading.findMany({
      where: recentWhere,
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        device: {
          select: { id: true, brand: true, model: true, assetNo: true },
        },
      },
    })
    const recentActivity = recent.map((r) => ({
      id: r.id,
      deviceName: r.device?.brand && r.device?.model
        ? `${r.device.brand} ${r.device.model}`.trim()
        : (r.device?.assetNo ?? '-'),
      assetCode: r.device?.assetNo ?? '-',
      reading: r.meterBw,
      delta: (r.pagesBw ?? 0) + (r.pagesColor ?? 0),
      date: r.readingDate,
      remark: r.remark,
    }))

    // Paper usage for the selected range (sum of positive deltas)
    const paperUsage = rangeReadings.reduce(
      (sum, r) => sum + (((r.pagesBw ?? 0) + (r.pagesColor ?? 0)) > 0 ? ((r.pagesBw ?? 0) + (r.pagesColor ?? 0)) : 0),
      0,
    )

    return NextResponse.json({
      totals: { total, active, spare, repair },
      byStatus,
      byType,
      topUsage,
      recentActivity,
      paperThisMonth: paperUsage,
      range,
    })
  } catch (err) {
    console.error('GET /api/dashboard', err)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard' },
      { status: 500 },
    )
  }
}
