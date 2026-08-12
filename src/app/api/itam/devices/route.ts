import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { siteFilterForUser, canAccessSite, isAdminRole } from '@/lib/auth'
import { notifyDeviceAdded } from '@/lib/notifications'
import { publishRealtimeEvent } from '@/lib/realtime'

// GET /api/itam/devices?search=&status=&site=&type=&page=1&limit=20
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'VIEW_DEVICES')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() ?? ''
    const status = searchParams.get('status')?.trim() ?? ''
    const site = searchParams.get('site')?.trim() ?? ''
    const deviceType = searchParams.get('type')?.trim() ?? ''
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    // Allow up to 2000 rows per page — virtual scroll mode fetches a large
    // batch in one shot so it can render 2,378+ rows without lag.
    const limit = Math.min(2000, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

    const where: Record<string, unknown> = { AND: [] as unknown[] }
    // ── Site-level filter: non-admin users only see their allowedSites ──
    const siteFilter = siteFilterForUser(user)
    if (Object.keys(siteFilter).length) (where.AND as unknown[]).push(siteFilter)
    // If the caller explicitly asks for a site they can't access → 403
    if (site && !canAccessSite(user, site)) {
      return NextResponse.json({ error: `ไม่มีสิทธิ์เข้าถึงข้อมูลของสาขา: ${site}` }, { status: 403 })
    }
    if (site) (where.AND as unknown[]).push({ site: { contains: site } })

    if (search) {
      (where.AND as unknown[]).push({
        OR: [
          { assetNo: { contains: search } },
          { deviceType: { contains: search } },
          { brand: { contains: search } },
          { model: { contains: search } },
          { serial: { contains: search } },
          { department: { contains: search } },
        ],
      })
    }
    if (status) (where.AND as unknown[]).push({ status })
    if (deviceType) (where.AND as unknown[]).push({ deviceType: { contains: deviceType } })
    // Collapse empty AND
    if (Array.isArray(where.AND) && where.AND.length === 0) delete where.AND

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

// POST /api/itam/devices — create new device (requires DEVICE_EDIT)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'DEVICE_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const body = await req.json()
    if (!body.assetNo) {
      return NextResponse.json({ error: 'assetNo is required' }, { status: 400 })
    }
    // Site access check on the new device's site
    if (body.site && !canAccessSite(user, body.site)) {
      return NextResponse.json({ error: `ไม่มีสิทธิ์สร้างอุปกรณ์ในสาขา: ${body.site}` }, { status: 403 })
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
        updatedBy: user.username || user.email,
      },
    })

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          timestamp: new Date().toISOString(),
          action: 'CREATE_DEVICE',
          user: user.email,
          details: JSON.stringify({ assetNo: created.assetNo, site: created.site }),
        },
      })
    } catch { /* ignore */ }

    // Best-effort notification
    void notifyDeviceAdded(created, user.username || user.email)

    // Push SSE event — other tabs/clients refetch their device list instantly
    publishRealtimeEvent({
      type: 'device-added',
      assetNo: created.assetNo,
      site: created.site ?? null,
      payload: { deviceType: created.deviceType, status: created.status },
    })

    return NextResponse.json({ device: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/itam/devices', err)
    const message = err instanceof Error ? err.message : 'Failed to create device'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
