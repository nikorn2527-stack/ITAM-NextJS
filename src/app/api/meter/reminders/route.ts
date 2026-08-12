import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Meter reminders endpoint.
 *
 * Finds meter-required devices (`Device.meterRequired = true`) that have NOT
 * been read in the currently active cycle.
 *
 * NOTE: The legacy route referenced several fields that don't exist on the
 * Prisma schema:
 *   - `Device.type`             → `Device.deviceType`
 *   - `Device.assetCode`        → `Device.assetNo`
 *   - `Device.name`             → `Device.brand` + `Device.model`
 *   - `Device.lastMeterReading` → not a stored field (computed from readings)
 *   - `MeterReading.deviceId`   → `MeterReading.assetNo`
 *   - `MeterReading.date`       → `MeterReading.readingDate`
 *   - `MeterReading.cycleId`    → not a stored field; associate via the
 *                                 cycle's [startDate, endDate] window.
 *
 * The response preserves the legacy shape used by both `meter-page.tsx` and
 * `dashboard-page.tsx` (`hasActiveCycle`, `cycle`, `reminders`,
 * `totalRead`, `totalUnread`) AND adds the spec's `count` field for
 * convenience.
 */

interface ReminderDevice {
  id: string
  assetCode: string
  name: string
  type: string | null
  brand: string | null
  model: string | null
  site: string | null
  lastMeterReading: number
}

interface ReminderEntry {
  device: ReminderDevice
  lastReadingDate: string | null
  daysOverdue: number
}

/** Build a display name from brand + model (falls back to assetNo). */
function deviceName(d: {
  brand: string | null
  model: string | null
  assetNo: string
}): string {
  if (d.brand && d.model) return `${d.brand} ${d.model}`.trim()
  if (d.brand) return d.brand
  if (d.model) return d.model
  return d.assetNo
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/

function daysBetween(a: string, b: string): number {
  const aD = new Date(a.slice(0, 10) + 'T00:00:00')
  const bD = new Date(b.slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(aD.getTime()) || Number.isNaN(bD.getTime())) return 0
  return Math.round((bD.getTime() - aD.getTime()) / (1000 * 60 * 60 * 24))
}

export async function GET() {
  try {
    // 1. Find the active cycle (legacy cycles use status 'active'; new V5
    //    cycles may use 'OPEN'). Match both so we work regardless of which
    //    UI created the cycle. Order by startDate desc so the most recent
    //    wins if there are somehow two.
    const activeCycle = await db.cycle.findFirst({
      where: { status: { in: ['active', 'OPEN'] } },
      orderBy: { startDate: 'desc' },
    })

    if (!activeCycle) {
      return NextResponse.json({
        hasActiveCycle: false,
        cycle: null,
        reminders: [],
        totalRead: 0,
        totalUnread: 0,
        count: 0,
      })
    }

    // 2. Find all meter-required devices. The Device schema has
    //    `meterRequired Boolean` (indexed) — that's the source of truth for
    //    "this device needs monthly meter readings". We no longer rely on
    //    a hard-coded set of device types.
    // 3. In parallel, find every meter reading whose `readingDate` falls
    //    within the active cycle's [startDate, endDate] window. This is the
    //    correct cycle association (replaces the old `cycleId` lookup).
    //    We only need `assetNo` + `readingDate` to deduplicate "has been
    //    read this cycle" + "last reading date" — using groupBy would lose
    //    the date, so we keep findMany with a tight select and dedupe in JS
    //    (this matches the working pattern in /api/notifications/route.ts).
    const [devices, readings] = await Promise.all([
      db.device.findMany({
        where: { meterRequired: true },
        orderBy: { assetNo: 'asc' },
        select: {
          id: true,
          assetNo: true,
          deviceType: true,
          brand: true,
          model: true,
          site: true,
          installDate: true,
          updatedAt: true,
        },
      }),
      db.meterReading.findMany({
        where: {
          readingDate: {
            gte: activeCycle.startDate,
            lte: activeCycle.endDate,
          },
        },
        select: { assetNo: true, readingDate: true },
        orderBy: { readingDate: 'desc' },
      }),
    ])

    // Map assetNo → most-recent readingDate seen in this cycle (readings are
    // already ordered desc, so the first occurrence per assetNo is the latest).
    const readAssetMap = new Map<string, string>()
    for (const r of readings) {
      if (!readAssetMap.has(r.assetNo)) {
        readAssetMap.set(r.assetNo, r.readingDate ?? '')
      }
    }

    // 4. Build reminders: every meter-required device that does NOT appear
    //    in `readAssetMap` is "unread this cycle".
    const todayISO = new Date().toISOString().slice(0, 10)
    const reminders: ReminderEntry[] = devices
      .filter((d) => !readAssetMap.has(d.assetNo))
      .map((d) => {
        // Reference date for "days overdue": use the cycle's start date if
        // known (the cycle has been open since then) — fall back to the
        // device's installDate / updatedAt. This matches the spirit of the
        // original route (which used createdAt) while being cycle-aware.
        const referenceDate =
          (activeCycle.startDate && DATE_RE.test(activeCycle.startDate)
            ? activeCycle.startDate.slice(0, 10)
            : null) ??
          (d.installDate && DATE_RE.test(d.installDate)
            ? d.installDate!.slice(0, 10)
            : null) ??
          d.updatedAt.toISOString().slice(0, 10)

        const daysOverdue = Math.max(0, daysBetween(referenceDate, todayISO))
        return {
          device: {
            id: d.id,
            assetCode: d.assetNo, // legacy field name for frontend compat
            name: deviceName(d),
            type: d.deviceType, // legacy field name for frontend compat
            brand: d.brand,
            model: d.model,
            site: d.site,
            // `lastMeterReading` is not a stored field; we expose the latest
            // reading's meter value here if we had it, but the frontend only
            // uses this for display in the meter table (which already has
            // its own device list with `lastMeterReading` from /api/devices).
            // 0 is safe.
            lastMeterReading: 0,
          },
          lastReadingDate: null,
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
      // Spec-shape convenience field.
      count: totalUnread,
    })
  } catch (err) {
    console.error('GET /api/meter/reminders', err)
    return NextResponse.json(
      { error: 'Failed to fetch meter reminders' },
      { status: 500 },
    )
  }
}
