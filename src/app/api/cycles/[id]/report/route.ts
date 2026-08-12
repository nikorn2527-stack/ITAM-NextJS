import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const METERABLE_TYPES = new Set(['PRINTER', 'COPIER', 'MFP'])

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24),
  )
}

interface CycleReportReading {
  id: string
  date: string
  reading: number
  prevReading: number
  delta: number
  remark: string | null
}

interface CycleReportDevice {
  deviceId: string
  assetCode: string
  name: string
  brand: string
  model: string
  site: string
  type: string
  readings: CycleReportReading[]
  firstReading: number | null
  lastReading: number | null
  totalDelta: number
  readingCount: number
}

interface CycleReportAnomaly {
  readingId: string
  deviceId: string
  assetCode: string
  deviceName: string
  date: string
  reading: number
  prevReading: number
  delta: number
  remark: string | null
  type: 'RESET' | 'HIGH_DELTA'
}

/**
 * GET /api/cycles/[id]/report
 *
 * Returns a full report for a single meter-reading cycle:
 * - cycle info (name, dates, status, daysRemaining)
 * - summary (totalReadings, totalSheets, avgDelta, deviceCount, unreadCount)
 * - per-device readings list (with first/last/totalDelta aggregates)
 * - anomalies (RESET = delta < 0, HIGH_DELTA = delta > 20000)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const cycle = await db.cycle.findUnique({ where: { id } })
    if (!cycle) {
      return NextResponse.json({ error: 'Cycle not found' }, { status: 404 })
    }

    // Fetch all readings for this cycle, ordered chronologically per device
    const readings = await db.meterReading.findMany({
      where: {
        readingDate: {
          gte: cycle.startDate,
          lte: cycle.endDate,
        },
      },
      orderBy: [{ readingDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        device: {
          select: {
            id: true,
            assetCode: true,
            name: true,
            brand: true,
            model: true,
            site: true,
            type: true,
          },
        },
      },
    })

    // Group by device
    const deviceMap = new Map<string, CycleReportDevice>()
    const anomalies: CycleReportAnomaly[] = []

    for (const r of readings) {
      const dev = r.device
      if (!dev) continue
      const reading = r.meterBw + r.meterColor
      const prevReading = r.prevMeterBw + r.prevMeterColor
      const delta = r.pagesBw + r.pagesColor

      if (!deviceMap.has(dev.id)) {
        deviceMap.set(dev.id, {
          deviceId: dev.id,
          assetCode: dev.assetCode,
          name: dev.name,
          brand: dev.brand,
          model: dev.model,
          site: dev.site,
          type: dev.type,
          readings: [],
          firstReading: null,
          lastReading: null,
          totalDelta: 0,
          readingCount: 0,
        })
      }
      const entry = deviceMap.get(dev.id)!

      const cycleReading: CycleReportReading = {
        id: r.id,
        date: r.readingDate,
        reading,
        prevReading,
        delta,
        remark: r.remark,
      }
      entry.readings.push(cycleReading)
      entry.readingCount += 1
      if (entry.firstReading === null) entry.firstReading = reading
      entry.lastReading = reading
      entry.totalDelta += delta

      // Anomaly detection
      if (delta < 0) {
        anomalies.push({
          readingId: r.id,
          deviceId: dev.id,
          assetCode: dev.assetCode,
          deviceName: dev.name,
          date: r.readingDate,
          reading,
          prevReading,
          delta,
          remark: r.remark,
          type: 'RESET',
        })
      } else if (delta > 20000) {
        anomalies.push({
          readingId: r.id,
          deviceId: dev.id,
          assetCode: dev.assetCode,
          deviceName: dev.name,
          date: r.readingDate,
          reading,
          prevReading,
          delta,
          remark: r.remark,
          type: 'HIGH_DELTA',
        })
      }
    }

    // Devices sorted by assetCode for a stable, predictable order
    const devices = Array.from(deviceMap.values()).sort((a, b) =>
      a.assetCode.localeCompare(b.assetCode, 'th'),
    )

    // Summary
    const totalReadings = readings.length
    const totalSheets = readings.reduce(
      (sum, r) =>       sum + (r.pagesBw + r.pagesColor > 0 ? r.pagesBw + r.pagesColor : 0),

      0,
    )
    const avgDelta =
      devices.length > 0
        ? Math.round(devices.reduce((s, d) => s + d.totalDelta, 0) / devices.length)
        : 0
    const deviceCount = devices.length

    // unreadCount: meterable devices NOT read in this cycle
    // (only count if cycle is currently active — for past cycles this is informational)
    const readDeviceIds = new Set(devices.map((d) => d.deviceId))
    const meterableDevices = await db.device.findMany({
      where: { type: { in: Array.from(METERABLE_TYPES) } },
      select: { id: true },
    })
    const unreadCount = meterableDevices.filter(
      (d) => !readDeviceIds.has(d.id),
    ).length

    const daysRemaining =
      cycle.status === 'active'
        ? Math.max(0, daysBetween(todayISO(), cycle.endDate))
        : 0

    return NextResponse.json({
      cycle: {
        id: cycle.id,
        name: cycle.name,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        status: cycle.status,
        daysRemaining,
      },
      summary: {
        totalReadings,
        totalSheets,
        avgDelta,
        deviceCount,
        unreadCount,
      },
      devices,
      anomalies,
    })
  } catch (err) {
    console.error('GET /api/cycles/[id]/report', err)
    return NextResponse.json(
      { error: 'Failed to build cycle report' },
      { status: 500 },
    )
  }
}
