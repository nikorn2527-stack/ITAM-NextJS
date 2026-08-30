import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { buildAuthorizationContext } from '@/lib/authorization-context'
import { notifyDeviceUpdated } from '@/lib/notifications'
import { publishRealtimeEvent } from '@/lib/realtime'
import { demoTag } from '@/lib/demo-mode'

// GET /api/itam/devices/[id] — single device with full details
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'VIEW_DEVICES')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row
    // FIX-027: build authorization context for site-scoped permission checks.
    const ctx = await buildAuthorizationContext(auth.user, auth.row.id, auth.row.allowedSites)

    const { id } = await params
    const device = await db.device.findUnique({
      where: { assetCode: id },
      include: {
        meterReadings: { take: 10, orderBy: { readingDate: 'desc' } },
        transfers: { take: 10, orderBy: { moveDate: 'desc' } },
        assignments: { take: 10, orderBy: { checkoutDate: 'desc' } },
        maintenanceLogs: { take: 10, orderBy: { startDate: 'desc' } },
        _count: true,
      },
    })
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    // Site-level access control — use canAtSite so a viewer at this site
    // can VIEW but a viewer at a different site cannot.
    if (!ctx.canAtSite(device.site, 'VIEW_DEVICES')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงอุปกรณ์ในสาขานี้' }, { status: 403 })
    }
    return NextResponse.json({ device })
  } catch (err) {
    console.error('GET /api/itam/devices/[id]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// PUT /api/itam/devices/[id] — update device
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'DEVICE_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row
    // FIX-027: build authorization context for site-scoped permission checks.
    const ctx = await buildAuthorizationContext(auth.user, auth.row.id, auth.row.allowedSites)

    const { id } = await params
    const body = await req.json()
    const existing = await db.device.findUnique({ where: { assetCode: id } })
    if (!existing) return NextResponse.json({ error: 'Device not found' }, { status: 404 })

    // Site access — both for the existing device and any new site being set.
    // Use canAtSite so a viewer at this site (no DEVICE_EDIT) is denied.
    if (!ctx.canAtSite(existing.site, 'DEVICE_EDIT')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขอุปกรณ์ในสาขานี้' }, { status: 403 })
    }
    if (body.site && !ctx.canAtSite(body.site, 'DEVICE_EDIT')) {
      return NextResponse.json({ error: `ไม่มีสิทธิ์ย้ายอุปกรณ์ไปสาขา: ${body.site}` }, { status: 403 })
    }

    const updated = await db.device.update({
      where: { assetCode: id },
      data: {
        name: body.name ?? existing.name,
        type: body.deviceType ?? existing.type,
        brand: body.brand ?? existing.brand,
        model: body.model ?? existing.model,
        serialNumber: body.serial ?? existing.serialNumber,
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
        purchaseDate: body.installDate ?? existing.purchaseDate,
        uninstallDate: body.uninstallDate ?? existing.uninstallDate,
        warrantyEnd: body.warrantyEnd ?? existing.warrantyEnd,
        deviceGroup: body.deviceGroup ?? existing.deviceGroup,
        costCenter: body.costCenter ?? existing.costCenter,
        meterRequired: body.meterRequired ?? existing.meterRequired,
        meterMode: body.meterMode ?? existing.meterMode,
        assetSiteCode: body.assetSiteCode ?? existing.assetSiteCode,
        updatedBy: user.username || user.email,
        ...demoTag(auth.user), // FIX-025: tag demo data for safe cleanup
      },
    })

    try {
      await db.auditLog.create({
        data: {
          action: 'UPDATE_DEVICE',
          entity: 'Device',
          entityId: updated.id,
          summary: `แก้ไขอุปกรณ์ ${updated.assetCode}`,
          actor: user.email, // FIX-026: actor (already present)
          detail: JSON.stringify({ assetCode: id, changes: Object.keys(body) }),
        },
      })
    } catch { /* ignore */ }

    // Best-effort notification
    void notifyDeviceUpdated(
      { assetNo: updated.assetCode, brand: updated.brand, model: updated.model },
      user.username || user.email,
      Object.keys(body),
    )

    // Push SSE event — other tabs refetch this device + the list
    publishRealtimeEvent({
      type: 'device-updated',
      assetNo: updated.assetCode,
      site: updated.site ?? null,
      payload: { changedFields: Object.keys(body) },
    })

    return NextResponse.json({ device: updated })
  } catch (err) {
    console.error('PUT /api/itam/devices/[id]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// DELETE /api/itam/devices/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'DEVICE_DELETE')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row
    // FIX-027: build authorization context for site-scoped permission checks.
    const ctx = await buildAuthorizationContext(auth.user, auth.row.id, auth.row.allowedSites)

    const { id } = await params
    const existing = await db.device.findUnique({ where: { assetCode: id } })
    if (!existing) return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    if (!ctx.canAtSite(existing.site, 'DEVICE_DELETE')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ลบอุปกรณ์ในสาขานี้' }, { status: 403 })
    }

    await db.device.delete({ where: { assetCode: id } })
    try {
      await db.auditLog.create({
        data: {
          action: 'DELETE_DEVICE',
          entity: 'Device',
          entityId: existing.id,
          summary: `ลบอุปกรณ์ ${existing.assetCode}`,
          actor: user.email,
          detail: JSON.stringify({ assetCode: id, site: existing.site }),
        },
      })
    } catch { /* ignore */ }

    // Push SSE event — other tabs remove the row from their list
    publishRealtimeEvent({
      type: 'device-deleted',
      assetNo: existing.assetCode,
      site: existing.site ?? null,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/itam/devices/[id]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
