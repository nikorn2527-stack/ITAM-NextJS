import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { canAccessSite } from '@/lib/auth'
import { getNextAssetSiteCode, normalizeAssetSiteCodeForCompare } from '@/lib/asset-site-code'
import { notifyTransfer } from '@/lib/notifications'
import { publishRealtimeEvent } from '@/lib/realtime'

/**
 * POST /api/itam/devices/[id]/transfer
 *
 * Body:
 *   {
 *     toSite, toBuilding?, toFloor?, toDepartment?, toDepartmentCode?,
 *     toLocation?, toAssetSiteCode?,
 *     meterReadingId?,     // id of a freshly-created MeterReading (when meter-required)
 *     skipMeterReason?     // free-text reason for NOT reading the meter
 *   }
 *
 * Permission: DEVICE_TRANSFER
 *
 * Logic:
 *   1. Capture current device state as "from".
 *   2. If device.meterRequired and no meterReadingId and no skipMeterReason → 400.
 *   3. Auto-generate toAssetSiteCode if not provided (and reuse from history
 *      if the device has lived at this site before).
 *   4. Update the device row.
 *   5. Create LocationHistory with all from/to fields + meterReadingId.
 *   6. Audit log: TRANSFER.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(req, 'DEVICE_TRANSFER')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { id } = await params
    const body = await req.json()

    const device = await db.device.findUnique({ where: { assetNo: id } })
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }

    // Site access — must be allowed to act on the source site AND the target site.
    if (!canAccessSite(user, device.site)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ย้ายอุปกรณ์ในสาขานี้' }, { status: 403 })
    }
    const toSite = String(body.toSite ?? '').trim()
    if (!toSite) {
      return NextResponse.json({ error: 'กรุณาระบุสาขาปลายทาง' }, { status: 400 })
    }
    if (!canAccessSite(user, toSite)) {
      return NextResponse.json({ error: `ไม่มีสิทธิ์ย้ายอุปกรณ์ไปสาขา: ${toSite}` }, { status: 403 })
    }

    // Meter-required enforcement — exactly the Apps Script behavior.
    const meterReadingId = body.meterReadingId ? String(body.meterReadingId) : null
    const skipMeterReason = body.skipMeterReason ? String(body.skipMeterReason).trim() : null
    if (device.meterRequired && !meterReadingId && !skipMeterReason) {
      return NextResponse.json(
        { error: 'ต้องจดมิเตอร์ก่อนย้าย — กรุณาจดมิเตอร์หรือระบุเหตุผลที่จดไม่ได้' },
        { status: 400 },
      )
    }

    // If a meterReadingId was passed, verify it belongs to this device.
    if (meterReadingId) {
      const reading = await db.meterReading.findUnique({ where: { id: meterReadingId } })
      if (!reading || reading.assetNo !== device.assetNo) {
        return NextResponse.json(
          { error: 'meterReadingId ไม่ตรงกับอุปกรณ์นี้' },
          { status: 400 },
        )
      }
    }

    // Resolve the target AssetSiteCode.
    //   • Explicit body value wins.
    //   • Cross-site move with no explicit value → auto-generate (with reuse
    //     from history if the device has lived at this site before).
    //   • Same-site move with no explicit value → KEEP the existing code
    //     (the device didn't actually leave this site, so its per-site
    //     registry number shouldn't change — matches Apps Script behavior).
    const isCrossSite = !device.site || device.site !== toSite
    let toAssetSiteCode = String(body.toAssetSiteCode ?? '').trim()
    if (!toAssetSiteCode) {
      if (isCrossSite) {
        const generated = await getNextAssetSiteCode(toSite, { assetNo: device.assetNo })
        toAssetSiteCode = generated ?? device.assetSiteCode ?? ''
      } else {
        toAssetSiteCode = device.assetSiteCode ?? ''
      }
    }

    const toBuilding = body.toBuilding != null ? String(body.toBuilding).trim() || null : device.building
    const toFloor = body.toFloor != null ? String(body.toFloor).trim() || null : device.floor
    const toDepartment = body.toDepartment != null ? String(body.toDepartment).trim() || null : device.department
    const toDepartmentCode = body.toDepartmentCode != null ? String(body.toDepartmentCode).trim() || null : device.departmentCode
    const toLocation = body.toLocation != null ? String(body.toLocation).trim() || null : device.location

    // Capture "from" state BEFORE the update.
    const fromSnapshot = {
      site: device.site,
      assetSiteCode: device.assetSiteCode,
      building: device.building,
      floor: device.floor,
      department: device.department,
      location: device.location,
      status: device.status,
    }

    const nowIso = new Date().toISOString()
    const moveDate = nowIso
    const movedBy = user.username || user.email

    // Action label mirrors Apps Script:
    //   - TRANSFER (same site, location changed)
    //   - TRANSFER_SITE (cross-site)
    const action = isCrossSite ? 'TRANSFER_SITE' : 'TRANSFER'

    // Build the LocationHistory row first so we can wire the meterReading's
    // eventId/eventType back to it (best-effort — wrapped in try/catch).
    const logId = `MV-${nowIso.replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.floor(Math.random() * 90000) + 10000}`

    // Single transaction: update device + create history.
    const [updatedDevice, historyRow] = await db.$transaction([
      db.device.update({
        where: { assetNo: device.assetNo },
        data: {
          site: toSite,
          building: toBuilding,
          floor: toFloor,
          department: toDepartment,
          departmentCode: toDepartmentCode,
          location: toLocation,
          assetSiteCode: toAssetSiteCode || null,
          updatedBy: movedBy,
        },
      }),
      db.locationHistory.create({
        data: {
          logId,
          assetNo: device.assetNo,
          moveDate,
          action,
          fromStatus: fromSnapshot.status,
          toStatus: fromSnapshot.status, // transfer doesn't change status
          fromSite: fromSnapshot.site,
          fromAssetSiteCode: fromSnapshot.assetSiteCode,
          fromBuilding: fromSnapshot.building,
          fromFloor: fromSnapshot.floor,
          fromDepartment: fromSnapshot.department,
          fromLocation: fromSnapshot.location,
          toSite,
          toAssetSiteCode: toAssetSiteCode || null,
          toBuilding,
          toFloor,
          toDepartment,
          toLocation,
          meterReadingId,
          movedBy,
          remark: skipMeterReason || null,
        },
      }),
    ])

    // Best-effort: link the meter reading back to this history row.
    if (meterReadingId) {
      try {
        await db.meterReading.update({
          where: { id: meterReadingId },
          data: {
            eventType: action,
            eventId: historyRow.id,
            readingType: 'CHECKOUT',
          },
        })
      } catch {
        /* non-fatal */
      }
    }

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          timestamp: nowIso,
          action: 'TRANSFER',
          user: user.email,
          details: JSON.stringify({
            assetNo: device.assetNo,
            from: fromSnapshot,
            to: {
              site: toSite,
              assetSiteCode: toAssetSiteCode || null,
              building: toBuilding,
              floor: toFloor,
              department: toDepartment,
              location: toLocation,
            },
            crossSite: isCrossSite,
            meterReadingId,
            skipMeterReason: skipMeterReason ? true : false,
            historyId: historyRow.id,
          }),
        },
      })
    } catch { /* ignore */ }

    // Best-effort notification
    void notifyTransfer({
      assetNo: device.assetNo,
      fromSite: fromSnapshot.site,
      toSite,
      by: movedBy,
    })

    // Push SSE event — both source-site and destination-site subscribers see it
    publishRealtimeEvent({
      type: 'device-transferred',
      assetNo: device.assetNo,
      site: toSite,
      payload: {
        fromSite: fromSnapshot.site,
        toSite,
        crossSite: isCrossSite,
      },
    })

    return NextResponse.json({
      device: updatedDevice,
      locationHistory: historyRow,
      reusedAssetSiteCode:
        !!fromSnapshot.assetSiteCode &&
        normalizeAssetSiteCodeForCompare(fromSnapshot.assetSiteCode) ===
          normalizeAssetSiteCodeForCompare(toAssetSiteCode) &&
        isCrossSite === false,
    })
  } catch (err) {
    console.error('POST /api/itam/devices/[id]/transfer', err)
    const message = err instanceof Error ? err.message : 'Transfer failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
