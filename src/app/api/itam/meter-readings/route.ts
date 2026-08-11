import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/itam/meter-readings?assetNo=&month=&page=1&limit=20
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const assetNo = searchParams.get('assetNo')?.trim() ?? ''
    const month = searchParams.get('month')?.trim() ?? ''
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

    const where: Record<string, unknown> = {}
    if (assetNo) where.assetNo = assetNo
    if (month) where.readingMonth = month

    const [readings, total] = await Promise.all([
      db.meterReading.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { readingDate: 'desc' },
        include: {
          device: { select: { assetNo: true, brand: true, model: true, site: true } },
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
