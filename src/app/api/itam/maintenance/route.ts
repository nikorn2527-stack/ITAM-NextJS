import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { siteFilterForUser, canAccessSite } from '@/lib/auth'

// GET /api/itam/maintenance?assetNo=&status=
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'VIEW_DEVICES')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { searchParams } = new URL(req.url)
    const assetNo = searchParams.get('assetNo')?.trim() ?? ''
    const status = searchParams.get('status')?.trim() ?? ''
    const where: Record<string, unknown> = { AND: [] as unknown[] }
    if (assetNo) (where.AND as unknown[]).push({ device: { assetCode: assetNo } })
    if (status) (where.AND as unknown[]).push({ status })

    const sf = siteFilterForUser(user)
    if (Object.keys(sf).length) (where.AND as unknown[]).push({ device: sf })
    if (Array.isArray(where.AND) && where.AND.length === 0) delete where.AND

    const logs = await db.maintenanceLog.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: { device: { select: { assetCode: true, brand: true, model: true, site: true } } },
    })
    return NextResponse.json({ logs })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST — create maintenance log (requires DEVICE_EDIT)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'DEVICE_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const body = await req.json()
    if (!body.assetNo || !body.type || !body.startDate) {
      return NextResponse.json({ error: 'assetNo, type, startDate required' }, { status: 400 })
    }
    const device = await db.device.findUnique({ where: { assetCode: body.assetNo } })
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    if (!canAccessSite(user, device.site)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์สร้างประวัติซ่อมบำรุงสำหรับอุปกรณ์ในสาขานี้' }, { status: 403 })
    }

    const created = await db.maintenanceLog.create({
      data: {
        deviceId: device.id,
        type: body.type,
        status: body.status || 'open',
        startDate: body.startDate,
        endDate: body.endDate || null,
        cost: body.cost ? Number(body.cost) : null,
        vendor: body.vendor || null,
        description: body.description || '',
      },
    })

    try {
      await db.auditLog.create({
        data: {
          action: 'MAINTENANCE',
          entity: 'MaintenanceLog',
          entityId: created.id,
          summary: `บันทึกงานบำรุงรักษา ${body.assetNo}`,
          actor: user.email,
          detail: JSON.stringify({ assetNo: body.assetNo, type: body.type }),
        },
      })
    } catch { /* ignore */ }

    return NextResponse.json({ log: created }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
