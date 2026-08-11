import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/itam/dashboard — dashboard stats from real data
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const t0 = Date.now()

    // 1) Device counts by status (parallel)
    const [total, active, inactive, spare, repair] = await Promise.all([
      db.device.count(),
      db.device.count({ where: { status: 'Active' } }),
      db.device.count({ where: { status: 'Inactive' } }),
      db.device.count({ where: { status: 'In Stock' } }),
      db.device.count({ where: { status: 'Pending Repair' } }),
    ])

    // 2) Devices by type (top 8)
    const allDevices = await db.device.findMany({ select: { deviceType: true } })
    const typeMap: Record<string, number> = {}
    allDevices.forEach(d => {
      const t = d.deviceType || 'ไม่ระบุ'
      typeMap[t] = (typeMap[t] || 0) + 1
    })
    const byType = Object.entries(typeMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }))

    // 3) Devices by site
    const sites = await db.siteAttribute.findMany()
    const bySite = await Promise.all(
      sites.map(async (s) => {
        const count = await db.device.count({ where: { site: s.siteName || '' } })
        return { siteCode: s.siteCode, siteName: s.siteName, deviceCount: count }
      })
    )

    // 4) Paper usage this month
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthReadings = await db.meterReading.findMany({
      where: { readingMonth: currentMonth },
      select: { pagesBw: true, pagesColor: true },
    })
    const paperThisMonth = monthReadings.reduce((sum, r) => sum + r.pagesBw + r.pagesColor, 0)

    // 5) Recent meter readings (5)
    const recentReadings = await db.meterReading.findMany({
      take: 5,
      orderBy: { readingDate: 'desc' },
      include: {
        device: { select: { assetNo: true, brand: true, model: true } },
      },
    })
    const recentActivity = recentReadings.map(r => ({
      id: r.id,
      assetNo: r.assetNo,
      deviceName: r.device ? `${r.device.brand || ''} ${r.device.model || ''}`.trim() : r.assetNo,
      readingDate: r.readingDate,
      pagesBw: r.pagesBw,
      pagesColor: r.pagesColor,
      remark: r.remark,
    }))

    // 6) Meter-required devices count
    const meterRequiredCount = await db.device.count({
      where: { meterRequired: true, status: 'Active' },
    })

    const t1 = Date.now()

    return NextResponse.json({
      totals: { total, active, inactive, spare, repair },
      byType,
      bySite,
      paperThisMonth,
      meterRequiredCount,
      recentActivity,
      queryTimeMs: t1 - t0,
    })
  } catch (err) {
    console.error('GET /api/itam/dashboard', err)
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 })
  }
}
