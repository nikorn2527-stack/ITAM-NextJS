import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { canAccessSite } from '@/lib/auth'
import { getNextAssetSiteCode, normalizeAssetSiteCodeForCompare } from '@/lib/asset-site-code'
import { notifyTransfer } from '@/lib/notifications'
import { publishRealtimeEvent } from '@/lib/realtime'
import { getLifecycleReadingType } from '@/lib/lifecycle-reading-type'

/**
 * POST /api/itam/devices/[id]/transfer
 *
 * Body (aligned with Apps Script commit 6e57904 — transfer acknowledge flow):
 *   {
 *     toSite, toBuilding?, toFloor?, toDepartment?, toDepartmentCode?,
 *     toLocation?, toAssetSiteCode?,
 *     toStatus?,                          // optional status change during transfer
 *     meterReadingId?,                    // id of a freshly-created MeterReading
 *     meterSkipAcknowledged?,             // boolean — user ack "มิเตอร์นับต่อเนื่อง"
 *     skipMeterReason?                    // optional free-text note (was required, now optional)
 *   }
 *
 * Permission: DEVICE_TRANSFER
 *
 * Logic:
 *   1. Capture current device state as "from".
 *   2. If device.meterRequired and no meterReadingId and no meterSkipAcknowledged → 400.
 *   3. Derive readingType server-side using getLifecycleReadingType(fromStatus, toStatus).
 *   4. Auto-generate toAssetSiteCode if not provided.
 *   5. Update device + create LocationHistory (with meterSkipAcknowledged) in transaction.
 *   6. If meterReadingId, link it back with derived readingType + eventId.
 *   7. Audit log: TRANSFER.
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

    // ── Meter-required enforcement (Apps Script commit 6e57904) ────────────
    // NEW: meterSkipAcknowledged (boolean checkbox) replaces skipMeterReason
    //      as the required field. skipMeterReason is now an OPTIONAL note.
    // The user must EITHER provide a meterReadingId OR check the acknowledge
    // checkbox (confirming "มิเตอร์นับต่อเนื่อง" — meter continues).
    const meterReadingId = body.meterReadingId ? String(body.meterReadingId) : null
    const meterSkipAcknowledged = Boolean(body.meterSkipAcknowledged)
    const skipMeterReason = body.skipMeterReason ? String(body.skipMeterReason).trim() : null
    if (device.meterRequired && !meterReadingId && !meterSkipAcknowledged) {
      return NextResponse.json(
        {
          error: 'ต้องจดมิเตอร์ก่อนย้าย หรือยืนยันว่า "มิเตอร์นับต่อเนื่อง" (ติ๊ก checkbox)',
          code: 'METER_REQUIRED',
        },
        { status: 400 },
      )
    }

    // ── Optional status change during transfer ─────────────────────────────
    // If toStatus is provided, derive the readingType server-side (defense
    // against client tampering — Apps Script commit 6e57904).
    const toStatus = body.toStatus ? String(body.toStatus).trim() : device.status
    const derivedReadingType = getLifecycleReadingType(device.status, toStatus)

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
    // Order matters (Apps Script commit 6e57904): status update FIRST, then
    // meter/history, so a partial failure doesn't leave 3 sheets inconsistent.
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
          status: toStatus, // may equal existing status (pure location move)
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
          toStatus, // may differ from fromStatus if lifecycle transfer
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
          // Transfer acknowledge flow fields (Apps Script commit 6e57904):
          meterSkipAcknowledged: meterSkipAcknowledged || null,
          meterSkipReason: skipMeterReason,
          // Server-side derived readingType (defense against client tampering):
          readingType: derivedReadingType,
        },
      }),
    ])

    // Best-effort: link the meter reading back to this history row.
    // Uses the SERVER-DERIVED readingType (not hardcoded 'CHECKOUT') so that
    // RETURN / SEND_REPAIR / FINAL flows get the correct type.
    if (meterReadingId) {
      try {
        await db.meterReading.update({
          where: { id: meterReadingId },
          data: {
            eventType: action,
            eventId: historyRow.id,
            readingType: derivedReadingType,
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
              status: toStatus,
            },
            crossSite: isCrossSite,
            meterReadingId,
            meterSkipAcknowledged,
            skipMeterReason: skipMeterReason ? true : false,
            derivedReadingType,
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
