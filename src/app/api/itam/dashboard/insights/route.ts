import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { siteFilterForUser, getAllowedSites } from '@/lib/auth'

/**
 * GET /api/itam/dashboard/insights
 *
 * Returns an array of "smart insight" alerts for the dashboard.
 *
 * Insight types:
 *   - { type: 'high_usage', device, value, avg, message }
 *       Devices whose latest-month paper usage is >2x their personal 6-month avg
 *   - { type: 'color_heavy', device, colorPercent, message }
 *       Devices with >50% color pages in the last month
 *   - { type: 'not_read', count, message }
 *       meterRequired + Active devices with no reading in the current month
 *   - { type: 'mom_change', month, prevMonth, current, prev, percent, message }
 *       Month-over-month total paper usage change (only when |%| >= 15)
 *
 * Permission: VIEW_DASHBOARD
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'VIEW_DASHBOARD')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const siteFilter = siteFilterForUser(user)
    const userSites = getAllowedSites(user)

    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

    // Build the list of last 6 months for averages
    const lastSixMonths: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      lastSixMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    const insights: Array<Record<string, unknown>> = []

    // ─── 1) Not-read this month ────────────────────────────────────────────
    const meterRequiredActive = await db.device.count({
      where: { ...siteFilter, meterRequired: true, status: 'Active' },
    })
    const readThisMonth = await db.meterReading.findMany({
      where: { readingMonth: currentMonth, device: siteFilter },
      select: { assetCode: true },
      distinct: ['assetCode'],
    })
    const readCount = readThisMonth.length
    const notReadCount = Math.max(0, meterRequiredActive - readCount)
    if (notReadCount > 0) {
      insights.push({
        type: 'not_read',
        count: notReadCount,
        total: meterRequiredActive,
        month: currentMonth,
        message: `${notReadCount} เครื่องยังไม่ได้จดมิเตอร์เดือนนี้ (${currentMonth})`,
      })
    }

    // ─── 2) MoM change ─────────────────────────────────────────────────────
    const [curAgg, prevAgg] = await Promise.all([
      db.meterReading.aggregate({
        _sum: { pagesBw: true, pagesColor: true },
        where: { readingMonth: currentMonth, device: siteFilter },
      }),
      db.meterReading.aggregate({
        _sum: { pagesBw: true, pagesColor: true },
        where: { readingMonth: prevMonth, device: siteFilter },
      }),
    ])
    const curTotal = (curAgg._sum.pagesBw ?? 0) + (curAgg._sum.pagesColor ?? 0)
    const prevTotal = (prevAgg._sum.pagesBw ?? 0) + (prevAgg._sum.pagesColor ?? 0)
    if (prevTotal > 0) {
      const pct = Math.round(((curTotal - prevTotal) / prevTotal) * 100)
      if (Math.abs(pct) >= 15) {
        const dir = pct > 0 ? 'เพิ่มขึ้น' : 'ลดลง'
        insights.push({
          type: 'mom_change',
          month: currentMonth,
          prevMonth,
          current: curTotal,
          prev: prevTotal,
          percent: pct,
          message: `การใช้กระดาษ${dir} ${Math.abs(pct)}% เทียบเดือนก่อน (${prevTotal.toLocaleString()} → ${curTotal.toLocaleString()} แผ่น)`,
        })
      }
    }

    // ─── 3) High usage + color heavy ───────────────────────────────────────
    // Pull per-device aggregate for last 6 months + current month breakdown.
    const recentReadings = await db.meterReading.findMany({
      where: {
        readingMonth: { in: [...lastSixMonths] },
        device: siteFilter,
      },
      select: {
        assetCode: true,
        readingMonth: true,
        pagesBw: true,
        pagesColor: true,
        device: { select: { assetCode: true, brand: true, model: true, site: true, department: true } },
      },
    })

    // Per-device aggregation
    interface DevAgg {
      assetNo: string
      brand: string | null
      model: string | null
      site: string | null
      department: string | null
      byMonth: Record<string, { bw: number; color: number }>
    }
    const perDevice = new Map<string, DevAgg>()
    for (const r of recentReadings) {
      const assetNo = r.assetCode ?? r.device?.assetCode ?? ''
      let d = perDevice.get(assetNo)
      if (!d) {
        d = {
          assetNo,
          brand: r.device?.brand ?? null,
          model: r.device?.model ?? null,
          site: r.device?.site ?? null,
          department: r.device?.department ?? null,
          byMonth: {},
        }
        perDevice.set(assetNo, d)
      }
      const m = r.readingMonth || ''
      if (!d.byMonth[m]) d.byMonth[m] = { bw: 0, color: 0 }
      d.byMonth[m].bw += r.pagesBw
      d.byMonth[m].color += r.pagesColor
    }

    const highUsageList: Array<Record<string, unknown>> = []
    const colorHeavyList: Array<Record<string, unknown>> = []

    for (const d of perDevice.values()) {
      const cur = d.byMonth[currentMonth]
      if (!cur) continue
      const curTotal = cur.bw + cur.color
      if (curTotal === 0) continue

      // 6-month average (excluding current month)
      let sum = 0
      let n = 0
      for (const m of lastSixMonths) {
        if (m === currentMonth) continue
        const r = d.byMonth[m]
        if (r) {
          sum += r.bw + r.color
          n++
        }
      }
      const avg = n > 0 ? sum / n : 0

      // High-usage: current > 2x average AND at least 500 sheets
      if (avg > 0 && curTotal > 2 * avg && curTotal >= 500) {
        highUsageList.push({
          type: 'high_usage',
          assetNo: d.assetNo,
          device: {
            assetNo: d.assetNo,
            brand: d.brand,
            model: d.model,
            site: d.site,
            department: d.department,
          },
          value: curTotal,
          avg: Math.round(avg),
          month: currentMonth,
          message: `${d.assetNo} ใช้กระดาษ ${curTotal.toLocaleString()} แผ่น (เฉลี่ย ${Math.round(avg).toLocaleString()} แผ่น) — สูงผิดปกติ`,
        })
      }

      // Color-heavy: >50% color pages in current month AND >= 200 color sheets
      if (cur.color > 0 && curTotal > 0) {
        const colorPct = (cur.color / curTotal) * 100
        if (colorPct >= 50 && cur.color >= 200) {
          colorHeavyList.push({
            type: 'color_heavy',
            assetNo: d.assetNo,
            device: {
              assetNo: d.assetNo,
              brand: d.brand,
              model: d.model,
              site: d.site,
              department: d.department,
            },
            colorPercent: Math.round(colorPct),
            colorSheets: cur.color,
            totalSheets: curTotal,
            month: currentMonth,
            message: `${d.assetNo} ใช้สี ${Math.round(colorPct)}% (${cur.color.toLocaleString()}/${curTotal.toLocaleString()} แผ่น)`,
          })
        }
      }
    }

    // Sort + limit
    highUsageList.sort((a, b) => Number(b.value) - Number(a.value))
    colorHeavyList.sort((a, b) => Number(b.colorPercent) - Number(a.colorPercent))
    insights.push(...highUsageList.slice(0, 5))
    insights.push(...colorHeavyList.slice(0, 5))

    return NextResponse.json({
      insights,
      meta: {
        currentMonth,
        prevMonth,
        userSites,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    console.error('GET /api/itam/dashboard/insights', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
