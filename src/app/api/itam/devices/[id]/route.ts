import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/itam/devices/[id] — single device with full details
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const device = await db.device.findUnique({
      where: { assetNo: id },
      include: {
        meterReadings: { take: 10, orderBy: { readingDate: 'desc' } },
        locationHistories: { take: 10, orderBy: { moveDate: 'desc' } },
        assignments: { take: 10, orderBy: { checkoutDate: 'desc' } },
        maintenanceLogs: { take: 10, orderBy: { startDate: 'desc' } },
        _count: true,
      },
    })
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    return NextResponse.json({ device })
  } catch (err) {
    console.error('GET /api/itam/devices/[id]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// PUT /api/itam/devices/[id] — update device
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const existing = await db.device.findUnique({ where: { assetNo: id } })
    if (!existing) return NextResponse.json({ error: 'Device not found' }, { status: 404 })

    const updated = await db.device.update({
      where: { assetNo: id },
      data: {
        deviceType: body.deviceType ?? existing.deviceType,
        brand: body.brand ?? existing.brand,
        model: body.model ?? existing.model,
        serial: body.serial ?? existing.serial,
        building: body.building ?? existing.building,
        floor: body.floor ?? existing.floor,
        department: body.department ?? existing.department,
        location: body.location ?? existing.location,
        departmentCode: body.departmentCode ?? existing.departmentCode,
        status: body.status ?? existing.status,
        site: body.site ?? existing.site,
        contractNo: body.contractNo ?? existing.contractNo,
        ip: body.ip ?? existing.ip,
        mac: body.mac ?? existing.mac,
        remoteId: body.remoteId ?? existing.remoteId,
        remark: body.remark ?? existing.remark,
        vendor: body.vendor ?? existing.vendor,
        installDate: body.installDate ?? existing.installDate,
        uninstallDate: body.uninstallDate ?? existing.uninstallDate,
        warrantyEnd: body.warrantyEnd ?? existing.warrantyEnd,
        deviceGroup: body.deviceGroup ?? existing.deviceGroup,
        costCenter: body.costCenter ?? existing.costCenter,
        meterRequired: body.meterRequired ?? existing.meterRequired,
        meterMode: body.meterMode ?? existing.meterMode,
        assetSiteCode: body.assetSiteCode ?? existing.assetSiteCode,
        updatedBy: body.updatedBy || 'System',
      },
    })
    return NextResponse.json({ device: updated })
  } catch (err) {
    console.error('PUT /api/itam/devices/[id]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// DELETE /api/itam/devices/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.device.delete({ where: { assetNo: id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/itam/devices/[id]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
