import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const devices = await db.device.findMany({
      orderBy: { createdAt: 'desc' },
    })

    const total = devices.length
    const active = devices.filter((d) => d.status === 'active').length
    const spare = devices.filter((d) => d.status === 'spare').length
    const repair = devices.filter((d) => d.status === 'repair').length

    // By status
    const statusMap = new Map<string, number>()
    for (const d of devices) {
      statusMap.set(d.status, (statusMap.get(d.status) ?? 0) + 1)
    }
    const statusLabelMap: Record<string, string> = {
      active: 'ใช้งานอยู่',
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
      typeMap.set(d.type, (typeMap.get(d.type) ?? 0) + 1)
    }
    const byType = Array.from(typeMap.entries()).map(([name, value]) => ({
      name,
      value,
    }))

    // Top usage (by sum of delta per device)
    const readings = await db.meterReading.findMany({
      select: { deviceId: true, delta: true },
    })
    const usageMap = new Map<string, number>()
    for (const r of readings) {
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
      .slice(0, 5)

    // Recent activity: latest meter readings
    const recent = await db.meterReading.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        device: {
          select: { id: true, name: true, assetCode: true },
        },
      },
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

    return NextResponse.json({
      totals: { total, active, spare, repair },
      byStatus,
      byType,
      topUsage,
      recentActivity,
    })
  } catch (err) {
    console.error('GET /api/dashboard', err)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard' },
      { status: 500 },
    )
  }
}
