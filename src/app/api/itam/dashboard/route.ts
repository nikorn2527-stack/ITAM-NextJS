import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { siteFilterForUser, getAllowedSites } from '@/lib/auth'
import { bucketizeStatusGroups } from '@/lib/status-utils'

// GET /api/itam/dashboard — optimized dashboard stats from real data
//
// Performance optimizations vs the original:
//   1. Single groupBy for all status counts (was 5 separate count queries)
//   2. Single groupBy for device-type counts (was findMany all devices + JS loop)
//   3. Two groupBy queries for per-site stats (was N×3 queries in a loop — N+1)
//   4. aggregate for paper-this-month (was findMany all readings + reduce)
//   5. groupBy for 6-month trend (was findMany all readings + JS loop)
//   6. All independent queries parallelized with Promise.all
//   7. Status classification centralized in status-utils.ts (consistent KPIs)
//
// Result: ~6 DB queries total (was ~20+), ~50 rows transferred (was ~thousands)

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

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentMonthKey = currentMonth // alias for clarity

    // Current calendar month date range (for "paper this month" — matches legacy dashboard)
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    // Build the 6-month trend month keys (by readingMonth = cycle month)
    const trendMonths: { key: string; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`
      trendMonths.push({ key, label })
    }
    const trendMonthKeys = trendMonths.map((m) => m.key)

    // ── readingType filter for "usage" totals ──────────────────────────────
    // Aligned with Apps Script AnalyticsService.gs (commit 67f8e54):
    //   INCLUDE: MONTHLY, CHECKOUT, RETURN (these represent actual usage)
    //   EXCLUDE: INITIAL, RESET, FINAL, SEND_REPAIR (baselines / non-usage)
    // INITIAL/RESET contribute 0 pages anyway (enforced in meter-readings route),
    // but excluding them here prevents double-counting if any legacy rows have
    // non-zero pagesBw/Color from before the fix.
    const USAGE_TYPES = ['MONTHLY', 'CHECKOUT', 'RETURN']
    const usageTypeFilter = { readingType: { in: USAGE_TYPES } }

    // ── PARALLEL BLOCK 1: all independent count/aggregate queries ──────────
    const [
      statusGroups,
      typeGroups,
      paperThisMonthAgg,
      paperTrendGroups,
      meterRequiredCount,
      recentReadings,
      sites,
    ] = await Promise.all([
      // 1) All device counts by status — single groupBy (was 5 count queries)
      db.device.groupBy({
        by: ['status'],
        where: siteFilter,
        _count: { status: true },
      }),

      // 2) Device counts by type — single groupBy (was findMany + JS loop)
      db.device.groupBy({
        by: ['type'],
        where: siteFilter,
        _count: { type: true },
      }),

      // 3) Paper usage this month — SUM of pagesBw + pagesColor for ALL readings
      //    with readingMonth = current month (e.g., "2026-08").
      //    Uses readingMonth (not readingDate) because:
      //    - readingDate = วันที่กดบันทึกจริง (อาจเป็นต้นเดือนถัดไป เช่น 1-5 ส.ค.)
      //    - readingMonth = เดือนที่เลือกบันทึก (เช่น 2026-07 = รอบกรกฎาคม)
      //    - ถ้าจดวันที่ 1-5 ส.ค. แต่เลือกเดือน ก.ค. → ข้อมูลเข้า ก.ค. ไม่ใช่ ส.ค.
      //    - pagesBw/pagesColor = delta per reading (computed at POST time)

      db.meterReading.aggregate({
        _sum: { pagesBw: true, pagesColor: true },
        where: {
          readingMonth: currentMonthKey,
          device: siteFilter,
        },
      }),

      // 4) Paper usage trend (6 months) — DELTA calculation per month.
      //    For each month, get the latest reading and the reading before it,
      //    then compute delta = latest - previous (per device), then sum.
      db.$queryRaw`
        WITH monthly_latest AS (
          SELECT DISTINCT ON (mr."deviceId", mr."readingMonth")
            mr."deviceId",
            mr."readingMonth",
            mr."pagesBw" as latest_bw,
            mr."pagesColor" as latest_color,
            mr."readingDate"
          FROM "MeterReading" mr
          WHERE mr."readingMonth" IN (${Prisma.join(trendMonthKeys)})
            AND mr."readingType" IN ('MONTHLY', 'CHECKOUT', 'RETURN')
            AND (mr."pagesBw" > 0 OR mr."pagesColor" > 0)
          ORDER BY mr."deviceId", mr."readingMonth", mr."readingDate" DESC
        ),
        monthly_previous AS (
          SELECT DISTINCT ON (ml."deviceId", ml."readingMonth")
            ml."deviceId",
            ml."readingMonth",
            mr."pagesBw" as prev_bw,
            mr."pagesColor" as prev_color
          FROM monthly_latest ml
          JOIN "MeterReading" mr ON mr."deviceId" = ml."deviceId"
            AND mr."readingDate" < ml."readingDate"
            AND mr."readingType" IN ('MONTHLY', 'CHECKOUT', 'RETURN')
            AND (mr."pagesBw" > 0 OR mr."pagesColor" > 0)
          ORDER BY ml."deviceId", ml."readingMonth", mr."readingDate" DESC
        )
        SELECT
          ml."readingMonth",
          COALESCE(SUM(
            GREATEST(0, ml.latest_bw - COALESCE(mp.prev_bw, 0))
          ), 0) as delta_bw,
          COALESCE(SUM(
            GREATEST(0, ml.latest_color - COALESCE(mp.prev_color, 0))
          ), 0) as delta_color
        FROM monthly_latest ml
        LEFT JOIN monthly_previous mp ON mp."deviceId" = ml."deviceId" AND mp."readingMonth" = ml."readingMonth"
        GROUP BY ml."readingMonth"
        ORDER BY ml."readingMonth"
      `,

      // 5) Meter-required device count
      db.device.count({
        where: { ...siteFilter, meterRequired: true, status: 'Active' },
      }),

      // 6) Recent meter readings (5)
      db.meterReading.findMany({
        take: 5,
        orderBy: { readingDate: 'desc' },
        where: { device: siteFilter },
        include: {
          device: { select: { assetCode: true, brand: true, model: true } },
        },
      }),

      // 7) All site attributes (small table, needed for per-site stats)
      db.siteAttribute.findMany({ select: { id: true, SiteCode: true, SiteName: true, PaperRateBW: true, PaperRateColor: true, Hotline: true, LineOA: true } }),
    ])

    // ── Process status groups into canonical KPI buckets ───────────────────
    const { total, active, inactive, spare, repair, byStatus } = bucketizeStatusGroups(
      statusGroups as { status: string; _count: { status: number } }[],
    )

    // ── Process type groups (top 8) ────────────────────────────────────────
    const byType = (typeGroups as { type: string | null; _count: { type: number } }[])
      .map((g) => ({ name: g.type || 'ไม่ระบุ', value: g._count.type }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)

    // ── Paper this month — SUM of pagesBw + pagesColor for all readings
    //    recorded (by readingDate) in the current calendar month, all statuses.
    //    This represents "the actual amount entered this month".
    const paperThisMonthRows = paperThisMonthAgg as { _sum: { pagesBw: number | null; pagesColor: number | null } }
    const paperThisMonth =
      (paperThisMonthRows._sum.pagesBw ?? 0) + (paperThisMonthRows._sum.pagesColor ?? 0)

    // ── Paper trend (6 months) — DELTA per month ──
    const trendMap: Record<string, number> = {}
    for (const g of paperTrendGroups as { readingMonth: string; delta_bw: bigint; delta_color: bigint }[]) {
      const k = g.readingMonth || ''
      if (k) trendMap[k] = (trendMap[k] || 0) + Number(g.delta_bw) + Number(g.delta_color)
    }
    const paperTrend = trendMonths.map((m) => ({
      month: m.label,
      sheets: trendMap[m.key] || 0,
    }))

    // ── Recent activity ────────────────────────────────────────────────────
    const recentActivity = recentReadings.map((r) => ({
      id: r.id,
      assetCode: r.assetCode,
      deviceName: r.device ? `${r.device.brand || ''} ${r.device.model || ''}`.trim() : r.assetCode,
      readingDate: r.readingDate,
      pagesBw: r.pagesBw,
      pagesColor: r.pagesColor,
      remark: r.remark,
    }))

    // ── PARALLEL BLOCK 2: per-site stats (optimized, no N+1) ───────────────
    const visibleSites =
      userSites === 'ALL'
        ? sites
        : sites.filter((s) => userSites.includes(s.SiteName || ''))
    const visibleSiteNames = visibleSites.map((s) => s.SiteName || '').filter(Boolean)

    interface SiteStat {
      siteCode: string
      siteName: string
      deviceCount: number
      activeCount: number
      paperSheets: number
    }
    let bySite: SiteStat[] = []

    if (visibleSiteNames.length > 0) {
      const [deviceBySite, activeBySite, devicesForSiteMap, paperByAsset] = await Promise.all([
        // All devices grouped by site
        db.device.groupBy({
          by: ['site'],
          where: { site: { in: visibleSiteNames } },
          _count: { status: true },
        }),
        // Active devices grouped by site
        db.device.groupBy({
          by: ['site'],
          where: { site: { in: visibleSiteNames }, status: 'Active' },
          _count: { status: true },
        }),
        // Device→site mapping (assetCode + site only, ~2,378 rows)
        db.device.findMany({
          where: { site: { in: visibleSiteNames } },
          select: { assetCode: true, site: true },
        }),
        // Paper usage per asset this month (by readingMonth — matches
        // the top-level "paper this month" definition)
        db.meterReading.groupBy({
          by: ['assetCode'],
          where: {
            readingMonth: currentMonthKey,
            device: { site: { in: visibleSiteNames } },
          },
          _sum: { pagesBw: true, pagesColor: true },
        }),
      ])

      // Build lookup maps
      const deviceCountMap: Record<string, number> = {}
      for (const g of deviceBySite) deviceCountMap[g.site || ''] = g._count.status
      const activeCountMap: Record<string, number> = {}
      for (const g of activeBySite) activeCountMap[g.site || ''] = g._count.status
      const assetToSite = new Map<string, string>()
      for (const d of devicesForSiteMap) assetToSite.set(d.assetCode, d.site || '')

      // Sum paper per site by mapping each asset's paper to its site
      const sitePaperMap: Record<string, number> = {}
      for (const r of paperByAsset) {
        const site = assetToSite.get(r.assetCode || '') || ''
        if (site) {
          sitePaperMap[site] =
            (sitePaperMap[site] || 0) + (r._sum.pagesBw ?? 0) + (r._sum.pagesColor ?? 0)
        }
      }

      bySite = visibleSites.map((s) => {
        const siteName = s.SiteName || ''
        return {
          siteCode: s.SiteCode,
          siteName,
          deviceCount: deviceCountMap[siteName] || 0,
          activeCount: activeCountMap[siteName] || 0,
          paperSheets: sitePaperMap[siteName] || 0,
        }
      })
    }

    // ── Heatmap (optional, only if extra=1) ────────────────────────────────
    let heatmap: Array<{ assetCode: string; deviceName: string; months: Array<{ month: string; pages: number }> }> = []
    let heatmapMonths: string[] = []
    if (includeExtra) {
      heatmapMonths = trendMonthKeys
      const topDevices = await db.device.findMany({
        where: { ...siteFilter, meterRequired: true },
        take: 12,
        orderBy: { assetCode: 'asc' },
        select: { assetCode: true, brand: true, model: true },
      })
      const readings = await db.meterReading.groupBy({
        by: ['assetCode', 'readingMonth'],
        where: {
          readingMonth: { in: trendMonthKeys },
          assetCode: { in: topDevices.map((d) => d.assetCode) },
          ...usageTypeFilter,
        },
        _sum: { pagesBw: true, pagesColor: true },
      })
      const byDeviceMonth: Record<string, Record<string, number>> = {}
      for (const r of readings) {
        const code = r.assetCode || ''
        if (!byDeviceMonth[code]) byDeviceMonth[code] = {}
        const key = r.readingMonth || ''
        byDeviceMonth[code][key] =
          (byDeviceMonth[code][key] || 0) + (r._sum.pagesBw ?? 0) + (r._sum.pagesColor ?? 0)
      }
      heatmap = topDevices.map((d) => ({
        assetCode: d.assetCode,
        deviceName: `${d.brand || ''} ${d.model || ''}`.trim() || d.assetCode,
        months: trendMonthKeys.map((m) => ({ month: m, pages: byDeviceMonth[d.assetCode]?.[m] || 0 })),
      }))
    }

    const t1 = Date.now()

    return NextResponse.json({
      totals: { total, active, inactive, spare, repair },
      byStatus,
      byType,
      bySite,
      paperThisMonth,
      paperTrend,
      meterRequiredCount,
      recentActivity,
      heatmap,
      heatmapMonths,
      queryTimeMs: t1 - t0,
      scope: { allowedSites: userSites, role: user.role, email: user.email },
    })
  } catch (err) {
    console.error('GET /api/itam/dashboard', err)
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 })
  }
}
