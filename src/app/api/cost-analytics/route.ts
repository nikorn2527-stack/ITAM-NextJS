import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type RangeKey = 'month' | '30d' | 'quarter' | 'all'

interface RangeInfo {
  key: RangeKey
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
    return { key, start, end: todayISO }
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
    return { key, start, end }
  }

  if (key === 'all') {
    return { key, start: null, end: null }
  }

  const startY = now.getFullYear()
  const startMonth = now.getMonth()
  const start = `${startY}-${String(startMonth + 1).padStart(2, '0')}-01`
  const daysInMonth = new Date(startY, startMonth + 1, 0).getDate()
  const end = `${startY}-${String(startMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
  return { key, start, end }
}

function readingDateWhere(range: RangeInfo): Record<string, unknown> {
  if (range.start === null && range.end === null) return {}
  if (range.start && range.end) {
    return { readingDate: { gte: range.start, lte: range.end } }
  }
  if (range.start) return { readingDate: { gte: range.start } }
  if (range.end) return { readingDate: { lte: range.end } }
  return {}
}

const METERABLE_TYPES = ['PRINTER', 'COPIER', 'MFP']

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const rawRange = (searchParams.get('range')?.trim() ?? 'month') as RangeKey
    const range: RangeInfo = ['month', '30d', 'quarter', 'all'].includes(
      rawRange,
    )
      ? computeRange(rawRange)
      : computeRange('month')

    const [devices, rates] = await Promise.all([
      db.device.findMany({
        select: {
          id: true,
          assetCode: true,
          name: true,
          site: true,
          type: true,
        },
        orderBy: { assetCode: 'asc' },
      }),
      db.siteRate.findMany(),
    ])
    const rateMap = new Map(rates.map((r) => [r.siteCode, r.bwRate]))
    const defaultRate = 0.5

    const meterableDevices = devices.filter((d) =>
      METERABLE_TYPES.includes(d.type),
    )

    const where = readingDateWhere(range)
    const readings = await db.meterReading.findMany({
      where,
      select: { deviceId: true, pagesBw: true, pagesColor: true },
    })

    const usageByDevice = new Map<string, number>()
    for (const r of readings) {
      const cur = usageByDevice.get(r.deviceId) ?? 0
      // Sum of positive delta = sheets printed (RESET / negative deltas are corrections)
      const pages = r.pagesBw + r.pagesColor
      usageByDevice.set(r.deviceId, cur + (pages > 0 ? pages : 0))
    }

    const deviceRows = meterableDevices.map((d) => {
      const sheets = usageByDevice.get(d.id) ?? 0
      const rate = rateMap.get(d.site) ?? defaultRate
      const cost = Math.round(sheets * rate * 100) / 100
      return {
        id: d.id,
        assetCode: d.assetCode,
        name: d.name,
        site: d.site,
        sheets,
        rate,
        cost,
      }
    })
    deviceRows.sort((a, b) => b.cost - a.cost)

    const totalCost =
      Math.round(deviceRows.reduce((s, r) => s + r.cost, 0) * 100) / 100
    const totalSheets = deviceRows.reduce((s, r) => s + r.sheets, 0)

    // Aggregate by site
    const siteMap = new Map<
      string,
      { site: string; cost: number; sheets: number }
    >()
    for (const r of deviceRows) {
      const cur = siteMap.get(r.site) ?? { site: r.site, cost: 0, sheets: 0 }
      cur.cost += r.cost
      cur.sheets += r.sheets
      siteMap.set(r.site, cur)
    }
    const bySite = Array.from(siteMap.values())
      .map((s) => ({
        site: s.site,
        cost: Math.round(s.cost * 100) / 100,
        sheets: s.sheets,
      }))
      .sort((a, b) => b.cost - a.cost)

    return NextResponse.json({
      devices: deviceRows,
      totalCost,
      totalSheets,
      bySite,
      range,
    })
  } catch (err) {
    console.error('GET /api/cost-analytics', err)
    return NextResponse.json(
      { error: 'Failed to compute cost analytics' },
      { status: 500 },
    )
  }
}
