import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/itam/meter-readings — create meter reading
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.assetNo || body.meterBw === undefined) {
      return NextResponse.json({ error: 'assetNo and meterBw required' }, { status: 400 })
    }

    const device = await db.device.findUnique({ where: { assetNo: body.assetNo } })
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })

    const prevBw = device.lastMeterBw ?? 0
    // Note: lastMeterBw doesn't exist in new schema — use prev from body or 0
    const meterBw = Math.floor(Number(body.meterBw))
    const meterColor = Math.floor(Number(body.meterColor || 0))
    const pagesBw = Math.max(0, meterBw - Number(body.prevMeterBw || prevBw))
    const pagesColor = Math.max(0, meterColor - Number(body.prevMeterColor || 0))

    const created = await db.meterReading.create({
      data: {
        assetNo: body.assetNo,
        readingDate: body.readingDate || new Date().toISOString().slice(0, 10),
        readingMonth: body.readingMonth || new Date().toISOString().slice(0, 7),
        meterBw,
        meterColor,
        pagesBw,
        pagesColor,
        prevMeterBw: Number(body.prevMeterBw || prevBw),
        prevMeterColor: Number(body.prevMeterColor || 0),
        readBy: body.readBy || 'System',
        remark: body.remark || null,
        readingType: body.readingType || 'MONTHLY',
        locationAtReading: body.locationAtReading || null,
        siteAtReading: body.siteAtReading || null,
        buildingAtReading: body.buildingAtReading || null,
        floorAtReading: body.floorAtReading || null,
        departmentAtReading: body.departmentAtReading || null,
        departmentCodeAtReading: body.departmentCodeAtReading || null,
      },
    })

    return NextResponse.json({ reading: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/itam/meter-readings', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
