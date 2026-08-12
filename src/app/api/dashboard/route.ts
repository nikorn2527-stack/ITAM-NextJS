import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { bucketizeStatusGroups } from '@/lib/status-utils'

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
  if (range.start && range.end) {
    return { readingDate: { gte: range.start, lte: range.end } }
  }
  if (range.start) return { readingDate: { gte: range.start } }
  if (range.end) return { readingDate: { lte: range.end } }
  return {}
}

// GET /api/dashboard — legacy dashboard (optimized)
//
// Performance optimizations:
//   1. groupBy for status counts (was findMany all devices + JS filter)
//   2. groupBy for type counts (was findMany + JS loop)
//   3. groupBy for top-usage per asset (was findMany all readings + JS reduce)
//   4. aggregate for total paper usage (was findMany + reduce)
//   5. All independent queries parallelized with Promise.all
//   6. Status classification uses shared status-utils.ts (consistent with ITAM dashboard)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const rawRange = (searchParams.get('range')?.trim() ?? 'month') as RangeKey
    const range: RangeInfo = ['month', '30d', 'quarter', 'all'].includes(rawRange)
      ? computeRange(rawRange)
      : computeRange('month')

    const readingWhere = readingDateWhere(range)

    // ── readingType filter for usage totals (aligned with Apps Script) ──────
    // INCLUDE: MONTHLY, CHECKOUT, RETURN (actual usage)
    // EXCLUDE: INITIAL, RESET, FINAL, SEND_REPAIR (baselines / non-usage)
    const USAGE_TYPES = ['MONTHLY', 'CHECKOUT', 'RETURN']
    const usageWhere = { ...readingWhere, readingType: { in: USAGE_TYPES } }

    // ── PARALLEL: all independent queries ──────────────────────────────────
    const [statusGroups, typeGroups, usageByAsset, paperAgg, recent] = await Promise.all([
      // 1) All device counts by status — single groupBy
      db.device.groupBy({
        by: ['status'],
        _count: { status: true },
      }),

      // 2) Device counts by type — single groupBy
      db.device.groupBy({
        by: ['deviceType'],
        _count: { deviceType: true },
      }),

      // 3) Top usage per asset in range — groupBy, USAGE_TYPES only
      db.meterReading.groupBy({
        by: ['assetNo'],
        where: usageWhere,
        _sum: { pagesBw: true, pagesColor: true },
      }),

      // 4) Total paper usage in range — single aggregate, USAGE_TYPES only
      db.meterReading.aggregate({
        _sum: { pagesBw: true, pagesColor: true },
        where: usageWhere,
      }),

      // 5) Recent activity (8 readings with device info, ALL types for timeline)
      db.meterReading.findMany({
        where: readingWhere,
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          device: {
            select: { id: true, brand: true, model: true, assetNo: true },
          },
        },
      }),
    ])

    // ── Process status groups into canonical KPI buckets ───────────────────
    const { total, active, spare, repair, byStatus } = bucketizeStatusGroups(
      statusGroups as { status: string; _count: { status: number } }[],
    )

    // ── Process type groups ─────────────────────────────────────────────────
    const byType = (typeGroups as { deviceType: string | null; _count: { deviceType: number } }[])
      .map((g) => ({ name: g.deviceType || 'Unknown', value: g._count.deviceType }))
      .sort((a, b) => b.value - a.value)

    // ── Top usage (need device names — fetch top 5 assetNos only) ──────────
    const usageMap = new Map<string, number>()
    for (const r of usageByAsset as { assetNo: string; _sum: { pagesBw: number | null; pagesColor: number | null } }[]) {
      usageMap.set(r.assetNo, (r._sum.pagesBw ?? 0) + (r._sum.pagesColor ?? 0))
    }
    const topAssetNos = Array.from(usageMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([assetNo]) => assetNo)
    const topDevices = topAssetNos.length > 0
      ? await db.device.findMany({
          where: { assetNo: { in: topAssetNos } },
          select: { id: true, assetNo: true, brand: true, model: true },
        })
      : []
    const deviceMap = new Map(topDevices.map((d) => [d.assetNo, d]))
    const topUsage = topAssetNos.map((assetNo) => {
      const d = deviceMap.get(assetNo)
      return {
        id: d?.id ?? assetNo,
        name: d?.brand && d?.model ? `${d.brand} ${d.model}`.trim() : assetNo,
        assetCode: assetNo,
        value: usageMap.get(assetNo) ?? 0,
      }
    })

    // ── Recent activity ─────────────────────────────────────────────────────
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

    // ── Paper usage total ───────────────────────────────────────────────────
    const paperUsage = (paperAgg._sum.pagesBw ?? 0) + (paperAgg._sum.pagesColor ?? 0)

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
