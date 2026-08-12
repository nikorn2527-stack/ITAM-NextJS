import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { siteFilterForUser, canAccessSite } from '@/lib/auth'
import { notifyMeter } from '@/lib/notifications'
import { publishRealtimeEvent } from '@/lib/realtime'
import { logAudit } from '@/lib/audit'

// GET /api/itam/meter-readings?assetNo=&month=&page=1&limit=20
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'VIEW_DEVICES')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { searchParams } = new URL(req.url)
    const assetNo = searchParams.get('assetNo')?.trim() ?? ''
    const month = searchParams.get('month')?.trim() ?? ''
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

    const where: Record<string, unknown> = { AND: [] as unknown[] }
    if (assetNo) (where.AND as unknown[]).push({ assetCode: assetNo })
    if (month) (where.AND as unknown[]).push({ readingMonth: month })

    // Site-level filter via the device relation: non-admin users only see
    // readings for devices in their allowed sites.
    const siteFilter = siteFilterForUser(user)
    if (Object.keys(siteFilter).length) {
      (where.AND as unknown[]).push({ device: siteFilter })
    }
    if (Array.isArray(where.AND) && where.AND.length === 0) delete where.AND

    const [readings, total] = await Promise.all([
      db.meterReading.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { readingDate: 'desc' },
        include: {
          device: { select: { assetCode: true, brand: true, model: true, site: true } },
        },
      }),
      db.meterReading.count({ where }),
    ])

    return NextResponse.json({
      readings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error('GET /api/itam/meter-readings', err)
    return NextResponse.json({ error: 'Failed to fetch meter readings' }, { status: 500 })
  }
}

// POST /api/itam/meter-readings — create meter reading (requires METER_WRITE)
//
// Body:
//   {
//     assetNo,
//     meterBw,            // required (TOTAL mode uses this)
//     meterColor?,        // optional, used for BW_COLOR mode
//     prevMeterBw?,       // optional, defaults to device's last reading
//     prevMeterColor?,
//     readingDate?,
//     readingMonth?,
//     readingType?,       // MONTHLY | INITIAL | FINAL | RESET | CHECKOUT | SEND_REPAIR | RETURN
//     remark?,
//     locationAtReading?,
//     siteAtReading?, buildingAtReading?, floorAtReading?, departmentAtReading?, departmentCodeAtReading?,
//   }
//
// Behavior:
//   • If prevMeterBw/prevMeterColor are NOT supplied, look up the device's
//     most recent meter reading and use it (so the keyboard page can omit them).
//   • pagesBw = max(0, meterBw - prevMeterBw); pagesColor likewise.
//   • If new < prev (RESET), the API still saves but tags readingType = 'RESET'
//     when no explicit readingType was given, and surfaces a `reset` flag in
//     the response so the UI can show a warning.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'METER_WRITE')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const body = await req.json()
    if (!body.assetNo || body.meterBw === undefined) {
      return NextResponse.json({ error: 'assetNo and meterBw required' }, { status: 400 })
    }

    const device = await db.device.findUnique({ where: { assetCode: body.assetNo } })
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    if (!canAccessSite(user, device.site)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์จดมิเตอร์สำหรับอุปกรณ์ในสาขานี้' }, { status: 403 })
    }

    const meterBw = Math.floor(Number(body.meterBw))
    const meterColor = Math.floor(Number(body.meterColor || 0))

    // Resolve prev values — fall back to last reading on the device if not provided.
    let prevMeterBw: number
    let prevMeterColor: number
    if (body.prevMeterBw !== undefined && body.prevMeterBw !== null) {
      prevMeterBw = Math.floor(Number(body.prevMeterBw))
    } else {
      const last = await db.meterReading.findFirst({
        where: { deviceId: device.id },
        orderBy: { readingDate: 'desc' },
        select: { meterBw: true, meterColor: true },
      })
      prevMeterBw = last?.meterBw ?? 0
    }
    if (body.prevMeterColor !== undefined && body.prevMeterColor !== null) {
      prevMeterColor = Math.floor(Number(body.prevMeterColor))
    } else {
      // If we had to look up prev above we already have the same-row color;
      // otherwise fall back to a separate probe.
      if (body.prevMeterBw === undefined || body.prevMeterBw === null) {
        const last = await db.meterReading.findFirst({
          where: { deviceId: device.id },
          orderBy: { readingDate: 'desc' },
          select: { meterColor: true },
        })
        prevMeterColor = last?.meterColor ?? 0
      } else {
        prevMeterColor = 0
      }
    }

    const pagesBw = Math.max(0, meterBw - prevMeterBw)
    const pagesColor = Math.max(0, meterColor - prevMeterColor)

    // RESET detection — only auto-tag if the caller didn't specify a type.
    const isReset = meterBw < prevMeterBw || meterColor < prevMeterColor
    const readingType = body.readingType || (isReset ? 'RESET' : 'MONTHLY')

    const created = await db.meterReading.create({
      data: {
        deviceId: device.id,
        assetCode: device.assetCode,
        readingDate: body.readingDate || new Date().toISOString().slice(0, 10),
        readingMonth: body.readingMonth || new Date().toISOString().slice(0, 7),
        meterBw,
        meterColor,
        pagesBw,
        pagesColor,
        prevMeterBw,
        prevMeterColor,
        readBy: user.username || user.email,
        remark: body.remark || null,
        readingType,
        locationAtReading: body.locationAtReading || null,
        siteAtReading: body.siteAtReading || device.site || null,
        buildingAtReading: body.buildingAtReading || null,
        floorAtReading: body.floorAtReading || null,
        departmentAtReading: body.departmentAtReading || null,
        departmentCodeAtReading: body.departmentCodeAtReading || null,
      },
    })

    await logAudit('METER_WRITE', 'MeterReading', created.id, 'บันทึกมิเตอร์', {
      assetNo: body.assetNo,
      meterBw,
      meterColor,
      pagesBw,
      pagesColor,
      reset: isReset,
    }, user.email)

    // Best-effort notification
    void notifyMeter({
      assetNo: body.assetNo,
      pagesBw,
      pagesColor,
      by: user.username || user.email,
    })

    // Push SSE event — meter page + dashboard subscribers refresh
    publishRealtimeEvent({
      type: 'meter-written',
      assetNo: body.assetNo,
      site: device.site ?? null,
      payload: { pagesBw, pagesColor, reset: isReset },
    })

    return NextResponse.json(
      { reading: created, reset: isReset, pagesBw, pagesColor },
      { status: 201 },
    )
  } catch (err) {
    console.error('POST /api/itam/meter-readings', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
