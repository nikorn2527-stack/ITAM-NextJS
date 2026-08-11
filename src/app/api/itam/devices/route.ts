import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/itam/devices?search=&status=&site=&type=&page=1&limit=20
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() ?? ''
    const status = searchParams.get('status')?.trim() ?? ''
    const site = searchParams.get('site')?.trim() ?? ''
    const deviceType = searchParams.get('type')?.trim() ?? ''
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { assetNo: { contains: search } },
        { deviceType: { contains: search } },
        { brand: { contains: search } },
        { model: { contains: search } },
        { serial: { contains: search } },
        { department: { contains: search } },
      ]
    }
    if (status) where.status = status
    if (site) where.site = { contains: site }
    if (deviceType) where.deviceType = { contains: deviceType }

    const [devices, total] = await Promise.all([
      db.device.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { assetNo: 'asc' },
        include: {
          _count: { select: { meterReadings: true, locationHistories: true, assignments: true, maintenanceLogs: true } },
        },
      }),
      db.device.count({ where }),
    ])

    return NextResponse.json({
      devices,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error('GET /api/itam/devices', err)
    return NextResponse.json({ error: 'Failed to fetch devices' }, { status: 500 })
  }
}

// POST /api/itam/devices — create new device
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.assetNo) {
      return NextResponse.json({ error: 'assetNo is required' }, { status: 400 })
    }

    const created = await db.device.create({
      data: {
        assetNo: String(body.assetNo).trim(),
        deviceType: body.deviceType || null,
        brand: body.brand || null,
        model: body.model || null,
        serial: body.serial || null,
        building: body.building || null,
        floor: body.floor || null,
        department: body.department || null,
        location: body.location || null,
        departmentCode: body.departmentCode || null,
        status: body.status || 'Active',
        site: body.site || null,
        contractNo: body.contractNo || null,
        ip: body.ip || null,
        mac: body.mac || null,
        remoteId: body.remoteId || null,
        remark: body.remark || null,
        vendor: body.vendor || null,
        installDate: body.installDate || null,
        uninstallDate: body.uninstallDate || null,
        warrantyEnd: body.warrantyEnd || null,
        deviceGroup: body.deviceGroup || null,
        costCenter: body.costCenter || null,
        meterRequired: body.meterRequired ?? false,
        meterMode: body.meterMode || null,
        assetSiteCode: body.assetSiteCode || null,
        updatedBy: body.updatedBy || 'System',
      },
    })

    return NextResponse.json({ device: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/itam/devices', err)
    const message = err instanceof Error ? err.message : 'Failed to create device'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
