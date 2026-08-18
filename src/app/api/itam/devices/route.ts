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
    // Exact-match assetNo filter (used by QR scanner smart-routing and quick-lookup)
    const assetNoExact = searchParams.get('assetNo')?.trim() ?? ''
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
          { assetCode: { contains: search } },
          { type: { contains: search } },
          { brand: { contains: search } },
          { model: { contains: search } },
          { serialNumber: { contains: search } },
          { department: { contains: search } },
        ],
      })
    }
    if (status) (where.AND as unknown[]).push({ status })
    if (deviceType) (where.AND as unknown[]).push({ type: { contains: deviceType } })
    // Exact-match assetNo (takes precedence over search if both are given)
    if (assetNoExact) (where.AND as unknown[]).push({ assetCode: assetNoExact })
    // Collapse empty AND
    if (Array.isArray(where.AND) && where.AND.length === 0) delete where.AND

    const [devices, total] = await Promise.all([
      db.device.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { assetCode: 'asc' },
        include: {
          _count: { select: { meterReadings: true, transfers: true, assignments: true, maintenanceLogs: true } },
          meterReadings: {
            orderBy: { readingDate: 'desc' },
            take: 1,
            select: { readingMonth: true, readingDate: true },
          },
        },
      }),
      db.device.count({ where }),
    ])

    // Annotate each device with `lastReadingMonth` derived from its latest
    // MeterReading record (matches Apps Script's `lastReadingMonth` column).
    const devicesWithMeter = devices.map((d) => {
      const latest = d.meterReadings?.[0]
      const { meterReadings, ...rest } = d
      return {
        ...rest,
        lastReadingMonth: latest?.readingMonth ?? latest?.readingDate?.slice(0, 7) ?? null,
      }
    })

    return NextResponse.json({
      devices: devicesWithMeter,
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
        assetCode: String(body.assetNo).trim(),
        name: body.name || String(body.assetNo).trim(),
        type: body.deviceType || null,
        brand: body.brand || null,
        model: body.model || null,
        serialNumber: body.serial || null,
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
        purchaseDate: body.installDate || null,
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
          action: 'CREATE_DEVICE',
          entity: 'Device',
          entityId: created.id,
          summary: `เพิ่มอุปกรณ์ ${created.assetCode}`,
          actor: user.email,
          detail: JSON.stringify({ assetCode: created.assetCode, site: created.site }),
        },
      })
    } catch { /* ignore */ }

    // Best-effort notification
    void notifyDeviceAdded(
      { assetNo: created.assetCode, brand: created.brand, model: created.model, site: created.site },
      user.username || user.email,
    )

    // Push SSE event — other tabs/clients refetch their device list instantly
    publishRealtimeEvent({
      type: 'device-added',
      assetNo: created.assetCode,
      site: created.site ?? null,
      payload: { deviceType: created.type, status: created.status },
    })

    return NextResponse.json({ device: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/itam/devices', err)
    const message = err instanceof Error ? err.message : 'Failed to create device'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
