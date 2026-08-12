import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { siteFilterForUser } from '@/lib/auth'

/**
 * GET /api/itam/paper-analytics
 *
 * Returns paper-usage analytics with 4 view modes:
 *
 *   ?view=overview  — KPI cards + 6-month bar chart + smart insights
 *   ?view=ranking   — top 10 by department / by building-floor / by device
 *   ?view=compare3  — 3-month side-by-side comparison table
 *   ?view=detail    — full per-device table with pagination + drill-down
 *
 * Filters:
 *   ?monthStart=YYYY-MM (default: 6 months ago)
 *   ?monthEnd=YYYY-MM   (default: current month)
 *   ?site=              (filter by site; subject to user's allowed sites)
 *   ?building=, ?department=
 *   ?page=1&limit=20    (for detail view)
 *
 * Permission: VIEW_ANALYTICS
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'VIEW_ANALYTICS')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { searchParams } = new URL(req.url)
    const view = (searchParams.get('view') ?? 'overview').trim()
    const siteFilter = siteFilterForUser(user)
    const now = new Date()

    // Compute month range
    const defaultStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const monthStart = searchParams.get('monthStart')?.trim() ||
      `${defaultStart.getFullYear()}-${String(defaultStart.getMonth() + 1).padStart(2, '0')}`
    const monthEnd = searchParams.get('monthEnd')?.trim() ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const site = searchParams.get('site')?.trim() ?? ''
    const building = searchParams.get('building')?.trim() ?? ''
    const department = searchParams.get('department')?.trim() ?? ''

    // Build month list (inclusive)
    const months: string[] = []
    {
      const [sy, sm] = monthStart.split('-').map(Number)
      const [ey, em] = monthEnd.split('-').map(Number)
      let y = sy, m = sm
      while (y < ey || (y === ey && m <= em)) {
        months.push(`${y}-${String(m).padStart(2, '0')}`)
        m++
        if (m > 12) { m = 1; y++ }
      }
    }

    // Build the where filter for meter readings
    const deviceFilter: Record<string, unknown> = { ...siteFilter }
    if (site) deviceFilter.site = site
    if (building) deviceFilter.building = building
    if (department) deviceFilter.department = department
    const readingWhere: Record<string, unknown> = {
      readingMonth: { in: months.length > 0 ? months : [monthEnd] },
      device: deviceFilter,
    }

    // Pull all matching readings (with device info for grouping)
    const readings = await db.meterReading.findMany({
      where: readingWhere,
      select: {
        assetCode: true,
        readingMonth: true,
        pagesBw: true,
        pagesColor: true,
        device: {
          select: {
            assetCode: true,
            brand: true,
            model: true,
            site: true,
            building: true,
            floor: true,
            department: true,
            departmentCode: true,
            type: true,
          },
        },
      },
    })
    const getAssetNo = (reading: (typeof readings)[number]) =>
      reading.assetCode ?? reading.device?.assetCode ?? ''

    // ───────────────────────────────────────────────────────────────────────
    // OVERVIEW
    // ───────────────────────────────────────────────────────────────────────
    if (view === 'overview') {
      let totalSheets = 0
      let totalBw = 0
      let totalColor = 0
      const byMonth: Record<string, { bw: number; color: number }> = {}
      for (const m of months) byMonth[m] = { bw: 0, color: 0 }
      for (const r of readings) {
        const m = r.readingMonth || ''
        if (!byMonth[m]) byMonth[m] = { bw: 0, color: 0 }
        byMonth[m].bw += r.pagesBw
        byMonth[m].color += r.pagesColor
        totalBw += r.pagesBw
        totalColor += r.pagesColor
      }
      totalSheets = totalBw + totalColor

      const monthly = months.map((m) => ({
        month: m,
        bw: byMonth[m]?.bw ?? 0,
        color: byMonth[m]?.color ?? 0,
        total: (byMonth[m]?.bw ?? 0) + (byMonth[m]?.color ?? 0),
      }))

      // Last month vs this month MoM
      const lastMonth = monthly.length >= 2 ? monthly[monthly.length - 2].total : 0
      const curMonth = monthly.length >= 1 ? monthly[monthly.length - 1].total : 0
      const momPct = lastMonth > 0 ? Math.round(((curMonth - lastMonth) / lastMonth) * 100) : 0

      // Top department + top device
      const byDept = new Map<string, number>()
      const byDevice = new Map<string, { sheets: number; brand: string | null; model: string | null }>()
      for (const r of readings) {
        const dept = r.device?.department || 'ไม่ระบุ'
        const sheets = r.pagesBw + r.pagesColor
        byDept.set(dept, (byDept.get(dept) ?? 0) + sheets)
        const cur = byDevice.get(getAssetNo(r)) ?? { sheets: 0, brand: r.device?.brand ?? null, model: r.device?.model ?? null }
        cur.sheets += sheets
        byDevice.set(getAssetNo(r), cur)
      }
      const topDept = Array.from(byDept.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, sheets]) => ({ name, sheets }))
      const topDevice = Array.from(byDevice.entries())
        .sort((a, b) => b[1].sheets - a[1].sheets)
        .slice(0, 5)
        .map(([assetNo, v]) => ({ assetNo, ...v }))

      const avgPerMonth = monthly.length > 0 ? Math.round(totalSheets / monthly.length) : 0

      return NextResponse.json({
        view: 'overview',
        months,
        kpi: {
          totalSheets,
          totalBw,
          totalColor,
          curMonth,
          lastMonth,
          momPct,
          avgPerMonth,
          topDept: topDept[0] ?? null,
          topDevice: topDevice[0] ?? null,
        },
        monthly,
        topDept,
        topDevice,
      })
    }

    // ───────────────────────────────────────────────────────────────────────
    // RANKING
    // ───────────────────────────────────────────────────────────────────────
    if (view === 'ranking') {
      const byDept = new Map<string, { bw: number; color: number; devices: Set<string> }>()
      const byBuildingFloor = new Map<string, { bw: number; color: number; devices: Set<string> }>()
      const byDevice = new Map<string, {
        bw: number; color: number; brand: string | null; model: string | null
        site: string | null; department: string | null
      }>()

      for (const r of readings) {
        const dept = r.device?.department || 'ไม่ระบุ'
        const bld = r.device?.building || 'ไม่ระบุ'
        const flr = r.device?.floor || 'ไม่ระบุ'
        const bfKey = `${bld} | ${flr}`
        const dKey = getAssetNo(r)

        if (!byDept.has(dept)) byDept.set(dept, { bw: 0, color: 0, devices: new Set() })
        const d = byDept.get(dept)!
        d.bw += r.pagesBw; d.color += r.pagesColor; d.devices.add(getAssetNo(r))

        if (!byBuildingFloor.has(bfKey)) byBuildingFloor.set(bfKey, { bw: 0, color: 0, devices: new Set() })
        const bf = byBuildingFloor.get(bfKey)!
        bf.bw += r.pagesBw; bf.color += r.pagesColor; bf.devices.add(getAssetNo(r))

        if (!byDevice.has(dKey)) byDevice.set(dKey, {
          bw: 0, color: 0,
          brand: r.device?.brand ?? null,
          model: r.device?.model ?? null,
          site: r.device?.site ?? null,
          department: r.device?.department ?? null,
        })
        const dv = byDevice.get(dKey)!
        dv.bw += r.pagesBw; dv.color += r.pagesColor
      }

      const departments = Array.from(byDept.entries())
        .map(([name, v]) => ({
          name,
          bw: v.bw,
          color: v.color,
          total: v.bw + v.color,
          deviceCount: v.devices.size,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)

      const buildingFloors = Array.from(byBuildingFloor.entries())
        .map(([name, v]) => ({
          name,
          bw: v.bw,
          color: v.color,
          total: v.bw + v.color,
          deviceCount: v.devices.size,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)

      const devices = Array.from(byDevice.entries())
        .map(([assetNo, v]) => ({
          assetNo,
          brand: v.brand,
          model: v.model,
          site: v.site,
          department: v.department,
          bw: v.bw,
          color: v.color,
          total: v.bw + v.color,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)

      return NextResponse.json({
        view: 'ranking',
        months,
        departments,
        buildingFloors,
        devices,
      })
    }

    // ───────────────────────────────────────────────────────────────────────
    // COMPARE 3 MONTHS
    // ───────────────────────────────────────────────────────────────────────
    if (view === 'compare3') {
      // Use the last 3 months of the range (or 3 months ending at monthEnd if range < 3)
      const last3 = months.slice(-3)
      const byDevice = new Map<string, {
        assetNo: string
        brand: string | null
        model: string | null
        site: string | null
        department: string | null
        months: Record<string, { bw: number; color: number }>
      }>()

      for (const r of readings) {
        if (!last3.includes(r.readingMonth || '')) continue
        if (!byDevice.has(getAssetNo(r))) {
          byDevice.set(getAssetNo(r), {
            assetNo: getAssetNo(r),
            brand: r.device?.brand ?? null,
            model: r.device?.model ?? null,
            site: r.device?.site ?? null,
            department: r.device?.department ?? null,
            months: {},
          })
        }
        const m = r.readingMonth || ''
        const d = byDevice.get(getAssetNo(r))!
        if (!d.months[m]) d.months[m] = { bw: 0, color: 0 }
        d.months[m].bw += r.pagesBw
        d.months[m].color += r.pagesColor
      }

      const rows = Array.from(byDevice.values())
        .map((d) => {
          const totals = last3.map((m) => (d.months[m]?.bw ?? 0) + (d.months[m]?.color ?? 0))
          const total = totals.reduce((a, b) => a + b, 0)
          return { ...d, totals, total }
        })
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 100)

      return NextResponse.json({
        view: 'compare3',
        months: last3,
        rows,
      })
    }

    // ───────────────────────────────────────────────────────────────────────
    // DETAIL
    // ───────────────────────────────────────────────────────────────────────
    if (view === 'detail') {
      const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
      const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

      // Aggregate by device
      const byDevice = new Map<string, {
        assetNo: string
        brand: string | null
        model: string | null
        site: string | null
        building: string | null
        floor: string | null
        department: string | null
        departmentCode: string | null
        deviceType: string | null
        bw: number
        color: number
        months: Set<string>
      }>()

      for (const r of readings) {
        if (!byDevice.has(getAssetNo(r))) {
          byDevice.set(getAssetNo(r), {
            assetNo: getAssetNo(r),
            brand: r.device?.brand ?? null,
            model: r.device?.model ?? null,
            site: r.device?.site ?? null,
            building: r.device?.building ?? null,
            floor: r.device?.floor ?? null,
            department: r.device?.department ?? null,
            departmentCode: r.device?.departmentCode ?? null,
            deviceType: r.device?.type ?? null,
            bw: 0,
            color: 0,
            months: new Set(),
          })
        }
        const d = byDevice.get(getAssetNo(r))!
        d.bw += r.pagesBw
        d.color += r.pagesColor
        d.months.add(r.readingMonth || '')
      }

      const allRows = Array.from(byDevice.values())
        .map((d) => ({
          ...d,
          total: d.bw + d.color,
          monthCount: d.months.size,
        }))
        .sort((a, b) => b.total - a.total)
      const total = allRows.length
      const pagedRows = allRows.slice((page - 1) * limit, page * limit)

      return NextResponse.json({
        view: 'detail',
        months,
        rows: pagedRows,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      })
    }

    return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
  } catch (err) {
    console.error('GET /api/itam/paper-analytics', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
