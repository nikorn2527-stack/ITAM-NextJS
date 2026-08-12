import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { siteFilterForUser, getAllowedSites, canAccessSite } from '@/lib/auth'

// GET /api/itam/dashboard — dashboard stats from real data
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'VIEW_DASHBOARD')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { searchParams } = new URL(req.url)
    const includeExtra = searchParams.get('extra') === '1'
    const t0 = Date.now()

    // ── Site-level filter: restrict all queries to the user's allowed sites
    const siteFilter = siteFilterForUser(user)
    const userSites = getAllowedSites(user)

    // 1) Device counts by status (parallel)
    const [total, active, inactive, spare, repair] = await Promise.all([
      db.device.count({ where: siteFilter }),
      db.device.count({ where: { ...siteFilter, status: 'Active' } }),
      db.device.count({ where: { ...siteFilter, status: 'Inactive' } }),
      db.device.count({ where: { ...siteFilter, status: 'In Stock' } }),
      db.device.count({ where: { ...siteFilter, status: 'Pending Repair' } }),
    ])

    // 2) Devices by type (top 8)
    const allDevices = await db.device.findMany({
      where: siteFilter,
      select: { type: true },
    })
    const typeMap: Record<string, number> = {}
    allDevices.forEach((d) => {
      const t = d.type || 'ไม่ระบุ'
      typeMap[t] = (typeMap[t] || 0) + 1
    })
    const byType = Object.entries(typeMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }))

    // 3) Devices by site (only show sites the user can access)
    const sites = await db.site.findMany({ orderBy: { code: 'asc' } })
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const visibleSites = userSites === 'ALL' ? sites : sites.filter((s) => userSites.includes(s.name))
    const bySite = await Promise.all(
      visibleSites.map(async (s) => {
        const siteName = s.name
        const [deviceCount, activeCount, monthReadings] = await Promise.all([
          db.device.count({ where: { site: siteName } }),
          db.device.count({ where: { site: siteName, status: 'Active' } }),
          db.meterReading.aggregate({
            _sum: { pagesBw: true, pagesColor: true },
            where: { readingMonth: currentMonth, device: { site: siteName } },
          }),
        ])
        const paperSheets = (monthReadings._sum.pagesBw ?? 0) + (monthReadings._sum.pagesColor ?? 0)
        return {
          siteCode: s.code,
          siteName,
          deviceCount,
          activeCount,
          paperSheets,
        }
      }),
    )

    // 4) Paper usage this month
    const monthReadings = await db.meterReading.findMany({
      where: { readingMonth: currentMonth, device: siteFilter },
      select: { pagesBw: true, pagesColor: true },
    })
    const paperThisMonth = monthReadings.reduce((sum, r) => sum + r.pagesBw + r.pagesColor, 0)

    // 4b) Paper usage trend (last 6 months)
    const trendMonths: { key: string; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`
      trendMonths.push({ key, label })
    }
    const trendReadings = await db.meterReading.findMany({
      where: { readingMonth: { in: trendMonths.map((m) => m.key) }, device: siteFilter },
      select: { readingMonth: true, pagesBw: true, pagesColor: true },
    })
    const trendMap: Record<string, number> = {}
    trendReadings.forEach((r) => {
      const k = r.readingMonth || ''
      trendMap[k] = (trendMap[k] || 0) + r.pagesBw + r.pagesColor
    })
    const paperTrend = trendMonths.map((m) => ({
      month: m.label,
      sheets: trendMap[m.key] || 0,
    }))

    // 5) Recent meter readings (5)
    const recentReadings = await db.meterReading.findMany({
      take: 5,
      orderBy: { readingDate: 'desc' },
      where: { device: siteFilter },
      include: {
        device: { select: { assetCode: true, brand: true, model: true } },
      },
    })
    const recentActivity = recentReadings.map((r) => ({
      id: r.id,
      assetNo: r.assetCode ?? r.device?.assetCode ?? '',
      deviceName: r.device ? `${r.device.brand || ''} ${r.device.model || ''}`.trim() : r.assetCode ?? '',
      readingDate: r.readingDate,
      pagesBw: r.pagesBw,
      pagesColor: r.pagesColor,
      remark: r.remark,
    }))

    // 6) Meter-required devices count
    const meterRequiredCount = await db.device.count({
      where: { ...siteFilter, meterRequired: true, status: 'Active' },
    })

    let heatmap: Array<{ assetNo: string; deviceName: string; months: Array<{ month: string; pages: number }> }> = []
    let heatmapMonths: string[] = []
    if (includeExtra) {
      const months: string[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
      heatmapMonths = months

      const topDevices = await db.device.findMany({
        where: { ...siteFilter, meterRequired: true },
        take: 12,
        orderBy: { assetCode: 'asc' },
        select: { assetCode: true, brand: true, model: true },
      })

      const readings = await db.meterReading.findMany({
        where: {
          readingMonth: { in: months },
          device: { assetCode: { in: topDevices.map((d) => d.assetCode) } },
        },
        select: { assetCode: true, readingMonth: true, pagesBw: true, pagesColor: true },
      })

      const byDeviceMonth: Record<string, Record<string, number>> = {}
      readings.forEach((r) => {
        const assetNo = r.assetCode ?? ''
        if (!byDeviceMonth[assetNo]) byDeviceMonth[assetNo] = {}
        const key = r.readingMonth || ''
        byDeviceMonth[assetNo][key] = (byDeviceMonth[assetNo][key] || 0) + r.pagesBw + r.pagesColor
      })

      heatmap = topDevices.map((d) => ({
        assetNo: d.assetCode,
        deviceName: `${d.brand || ''} ${d.model || ''}`.trim() || d.assetCode,
        months: months.map((m) => ({ month: m, pages: byDeviceMonth[d.assetCode]?.[m] || 0 })),
      }))
    }

    const t1 = Date.now()

    return NextResponse.json({
      totals: { total, active, inactive, spare, repair },
      byType,
      bySite,
      paperThisMonth,
      paperTrend,
      meterRequiredCount,
      recentActivity,
      heatmap,
      heatmapMonths,
      queryTimeMs: t1 - t0,
      // Echo back the user's effective site scope so the UI can show a banner
      scope: { allowedSites: userSites, role: user.role, email: user.email },
    })
  } catch (err) {
    console.error('GET /api/itam/dashboard', err)
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 })
  }
}
