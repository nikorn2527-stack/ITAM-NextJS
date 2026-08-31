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

  // Default: this month
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
    return { date: { gte: range.start, lte: range.end } }
  }
  if (range.start) return { date: { gte: range.start } }
  if (range.end) return { date: { lte: range.end } }
  return {}
}

interface SiteRow {
  siteCode: string
  siteName: string
  deviceCount: number
  activeCount: number
  spareCount: number
  repairCount: number
  totalSheets: number
  totalCost: number
  avgSheetsPerDevice: number
  lastReadingDate: string | null
  unreadInCycle: number
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const rawRange = (searchParams.get('range')?.trim() ?? 'month') as RangeKey
    const range: RangeInfo = ['month', '30d', 'quarter', 'all'].includes(rawRange)
      ? computeRange(rawRange)
      : computeRange('month')

    const [sites, rates, devices, activeCycle] = await Promise.all([
      db.site.findMany({ orderBy: { code: 'asc' } }),
      db.siteRate.findMany({ select: { siteCode: true, bwRate: true, colorRate: true } }),
      db.device.findMany({
        select: {
          id: true,
          assetCode: true,
          name: true,
          site: true,
          status: true,
          type: true,
        },
        orderBy: { assetCode: 'asc' },
      }),
      db.cycle.findFirst({
        where: { status: 'active' },
        orderBy: { startDate: 'desc' },
        select: { id: true },
      }),
    ])

    const rateMap = new Map(rates.map((r) => [r.siteCode, r.bwRate]))
    const defaultRate = 0.5

    // Build per-site skeletons including any sites that exist in DB even with 0 devices.
    // Also include devices whose site doesn't appear in the sites table (treat as a row).
    const siteNames = new Map(sites.map((s) => [s.code, s.name]))
    const deviceBySite = new Map<string, typeof devices>()
    for (const d of devices) {
      const list = deviceBySite.get(d.site) ?? []
      list.push(d)
      deviceBySite.set(d.site, list)
    }

    // Resolve the set of site codes (union of sites table + devices.site).
    const allSiteCodes = new Set<string>([
      ...sites.map((s) => s.code),
      ...devices.map((d) => d.site),
    ])

    // Pull readings in range, plus readings for the active cycle (to compute
    // "unread in cycle" = meterable devices lacking a reading in the active cycle).
    const rangeWhere = readingDateWhere(range)
    const [rangeReadings, cycleReadings] = await Promise.all([
      db.meterReading.findMany({
        where: rangeWhere,
        select: { deviceId: true, delta: true, date: true },
      }),
      activeCycle
        ? db.meterReading.findMany({
            where: { cycleId: activeCycle.id },
            select: { deviceId: true, date: true },
          })
        : Promise.resolve([] as Array<{ deviceId: string; date: string }>),
    ])

    const rangeSheetsByDevice = new Map<string, number>()
    const lastReadingDateByDevice = new Map<string, string>()
    for (const r of rangeReadings) {
      const cur = rangeSheetsByDevice.get(r.deviceId) ?? 0
      rangeSheetsByDevice.set(r.deviceId, cur + (r.delta > 0 ? r.delta : 0))
      const prevDate = lastReadingDateByDevice.get(r.deviceId)
      if (!prevDate || r.date > prevDate) {
        lastReadingDateByDevice.set(r.deviceId, r.date)
      }
    }

    const cycleReadingsByDevice = new Map<string, string>()
    for (const r of cycleReadings) {
      const prev = cycleReadingsByDevice.get(r.deviceId)
      if (!prev || r.date > prev) cycleReadingsByDevice.set(r.deviceId, r.date)
    }

    const METERABLE_TYPES = ['PRINTER', 'COPIER', 'MFP']
    const rows: SiteRow[] = []

    for (const code of Array.from(allSiteCodes).sort()) {
      const list = deviceBySite.get(code) ?? []
      const deviceCount = list.length
      const activeCount = list.filter((d) => d.status === 'active').length
      const spareCount = list.filter((d) => d.status === 'spare').length
      const repairCount = list.filter((d) => d.status === 'repair').length

      let totalSheets = 0
      let totalCost = 0
      let lastReadingDate: string | null = null
      const rate = rateMap.get(code) ?? defaultRate

      for (const d of list) {
        const sheets = rangeSheetsByDevice.get(d.id) ?? 0
        totalSheets += sheets
        totalCost += sheets * rate
        const ld = lastReadingDateByDevice.get(d.id)
        if (ld && (!lastReadingDate || ld > lastReadingDate)) lastReadingDate = ld
      }

      // Unread in active cycle: meterable devices lacking any reading in activeCycle
      let unreadInCycle = 0
      if (activeCycle) {
        for (const d of list) {
          if (!METERABLE_TYPES.includes(d.type)) continue
          if (!cycleReadingsByDevice.has(d.id)) unreadInCycle += 1
        }
      }

      rows.push({
        siteCode: code,
        siteName: siteNames.get(code) ?? code,
        deviceCount,
        activeCount,
        spareCount,
        repairCount,
        totalSheets,
        totalCost: Math.round(totalCost * 100) / 100,
        avgSheetsPerDevice:
          deviceCount > 0 ? Math.round(totalSheets / deviceCount) : 0,
        lastReadingDate,
        unreadInCycle,
      })
    }

    const ranked = [...rows].sort((a, b) => b.totalSheets - a.totalSheets)

    const totalDevices = rows.reduce((s, r) => s + r.deviceCount, 0)
    const totalSheets = rows.reduce((s, r) => s + r.totalSheets, 0)
    const totalCost =
      Math.round(rows.reduce((s, r) => s + r.totalCost, 0) * 100) / 100

    return NextResponse.json({
      sites: rows,
      ranked,
      totalDevices,
      totalSheets,
      totalCost,
      range,
    })
  } catch (err) {
    console.error('GET /api/sites/comparison', err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Failed to compute site comparison') : 'Internal server error' },
      { status: 500 },
    )
  }
}
