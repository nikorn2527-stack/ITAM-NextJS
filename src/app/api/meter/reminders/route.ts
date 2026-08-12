import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const METERABLE_TYPES = new Set(['PRINTER', 'COPIER', 'MFP'])

export async function GET() {
  try {
    // 1. Active cycle
    const activeCycle = await db.cycle.findFirst({
      where: { status: 'active' },
      orderBy: { startDate: 'desc' },
    })

    if (!activeCycle) {
      return NextResponse.json({
        hasActiveCycle: false,
        cycle: null,
        reminders: [],
        totalRead: 0,
        totalUnread: 0,
      })
    }

    // 2. Meterable devices
    const devices = await db.device.findMany({
      where: { type: { in: Array.from(METERABLE_TYPES) } },
      orderBy: { assetCode: 'asc' },
      select: {
        id: true,
        assetCode: true,
        name: true,
        brand: true,
        model: true,
        site: true,
        lastMeterBw: true,
        createdAt: true,
      },
    })

    // 3. Readings in this cycle, grouped by deviceId (latest date per device)
    const readings = await db.meterReading.findMany({
      where: {
        readingDate: {
          gte: activeCycle.startDate,
          lte: activeCycle.endDate,
        },
      },
      select: { deviceId: true, readingDate: true },
      orderBy: { readingDate: 'desc' },
    })
    const readDeviceMap = new Map<string, string>()
    for (const r of readings) {
      if (!readDeviceMap.has(r.deviceId)) {
        readDeviceMap.set(r.deviceId, r.readingDate)
      }
    }

    // 4. Compute reminders
    const todayISO = new Date().toISOString().slice(0, 10)
    const reminders = devices
      .filter((d) => !readDeviceMap.has(d.id))
      .map((d) => {
        const lastReadingDate = d.lastMeterBw > 0 ? null : null
        // Use the device's createdAt as fallback "since we haven't read"
        const referenceDate = d.lastMeterBw > 0 ? todayISO : d.createdAt.toISOString().slice(0, 10)
        const daysOverdue = Math.max(
          0,
          Math.round(
            (new Date(todayISO).getTime() - new Date(referenceDate).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
        return {
          device: {
            id: d.id,
            assetCode: d.assetCode,
            name: d.name,
            brand: d.brand,
            model: d.model,
            site: d.site,
            lastMeterReading: d.lastMeterBw,
          },
          lastReadingDate: lastReadingDate,
          daysOverdue,
        }
      })

    const totalRead = devices.length - reminders.length
    const totalUnread = reminders.length

    return NextResponse.json({
      hasActiveCycle: true,
      cycle: {
        id: activeCycle.id,
        name: activeCycle.name,
        startDate: activeCycle.startDate,
        endDate: activeCycle.endDate,
        status: activeCycle.status,
      },
      reminders,
      totalRead,
      totalUnread,
    })
  } catch (err) {
    console.error('GET /api/meter/reminders', err)
    return NextResponse.json(
      { error: 'Failed to fetch meter reminders' },
      { status: 500 },
    )
  }
}
