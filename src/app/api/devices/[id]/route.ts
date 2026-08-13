import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/** Clamp warrantyMonths to 1..120, default 12. */
function clampWarrantyMonths(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 12
  return Math.max(1, Math.min(120, Math.round(n)))
}

/** Parse a Float; returns null when missing/invalid. */
function optFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, n)
}

/** Parse an Int; returns null when missing/invalid. */
function optInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(1, Math.round(n))
}

/** Trim a string field, returning null when empty/missing. */
function optStr(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  return String(v).trim()
}

/** Parse a boolean field; returns false when missing/invalid. */
function optBool(v: unknown): boolean {
  if (v === true || v === 'true' || v === 1 || v === 'TRUE' || v === 'True') return true
  return false
}

/** Helper: write a string field only when present in body. */
function setStr(field: string, body: Record<string, unknown>) {
  if (body[field] === undefined) return undefined
  return optStr(body[field])
}

/** Helper: write a boolean field only when present in body. */
function setBool(field: string, body: Record<string, unknown>) {
  if (body[field] === undefined) return undefined
  return optBool(body[field])
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const device = await db.device.findUnique({ where: { id } })
    if (!device) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ device })
  } catch (err) {
    console.error('GET /api/devices/[id]', err)
    return NextResponse.json({ error: 'Failed to fetch device' }, { status: 500 })
  }
}

const EDITABLE_FIELDS = [
  'assetCode',
  'name',
  'brand',
  'model',
  'type',
  'serialNumber',
  'status',
  'site',
  'assetSiteCode',
  'department',
  'departmentCode',
  'parentRef',
  'displayLabel',
  'location',
  'building',
  'floor',
  'room',
  'ip',
  'mac',
  'remoteId',
  'purchaseDate',
  'warrantyMonths',
  'warrantyEnd',
  'vendor',
  'contractNo',
  'uninstallDate',
  'meterRequired',
  'meterMode',
  'costCenter',
  'deviceGroup',
  'remark',
  'lastMeterReading',
  'purchasePrice',
  'salvageValue',
  'usefulLife',
] as const

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>
    const before = await db.device.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const updateData: Record<string, unknown> = {
      assetCode: body.assetCode !== undefined ? String(body.assetCode).trim() : undefined,
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      brand: body.brand !== undefined ? String(body.brand).trim() : undefined,
      model: body.model !== undefined ? String(body.model).trim() : undefined,
      type: body.type !== undefined ? String(body.type).trim() : undefined,
      serialNumber: setStr('serialNumber', body),
      status: body.status !== undefined ? String(body.status).trim() : undefined,
      site: body.site !== undefined ? String(body.site).trim() : undefined,
      assetSiteCode: setStr('assetSiteCode', body),
      department: setStr('department', body),
      departmentCode: setStr('departmentCode', body),
      parentRef: setStr('parentRef', body),
      displayLabel: setStr('displayLabel', body),
      location: setStr('location', body),
      building: setStr('building', body),
      floor: setStr('floor', body),
      room: setStr('room', body),
      ip: setStr('ip', body),
      mac: setStr('mac', body),
      remoteId: setStr('remoteId', body),
      purchaseDate: setStr('purchaseDate', body),
      warrantyMonths:
        body.warrantyMonths !== undefined
          ? clampWarrantyMonths(body.warrantyMonths)
          : undefined,
      warrantyEnd: setStr('warrantyEnd', body),
      vendor: setStr('vendor', body),
      contractNo: setStr('contractNo', body),
      uninstallDate: setStr('uninstallDate', body),
      meterRequired: setBool('meterRequired', body),
      meterMode: setStr('meterMode', body),
      costCenter: setStr('costCenter', body),
      deviceGroup: setStr('deviceGroup', body),
      remark: setStr('remark', body),
      purchasePrice:
        body.purchasePrice !== undefined
          ? optFloat(body.purchasePrice)
          : undefined,
      salvageValue:
        body.salvageValue !== undefined
          ? optFloat(body.salvageValue) ?? 0
          : undefined,
      usefulLife:
        body.usefulLife !== undefined ? optInt(body.usefulLife) : undefined,
    }

    // Status transition side effects (aligned with Apps Script DeviceService.gs)
    // - Retired/Returned/Inactive/Disposed  → set uninstallDate = today (if not already set)
    // - Active && purchaseDate is null       → set purchaseDate = today (install/reactivation date)
    // assetCode remains read-only (no changes here).
    let statusSideEffects: Record<string, unknown> = {}
    if (body.status !== undefined && body.status !== before.status) {
      const newStatus = String(body.status).trim()
      const today = new Date().toISOString().slice(0, 10)
      if (
        ['Retired', 'Returned', 'Inactive', 'Disposed', 'retired', 'returned', 'inactive', 'disposed'].includes(
          newStatus,
        )
      ) {
        if (!before.uninstallDate) statusSideEffects.uninstallDate = today
      } else if (newStatus === 'Active' || newStatus === 'active') {
        if (!before.purchaseDate) statusSideEffects.purchaseDate = today
      }
    }

    const updated = await db.device.update({
      where: { id },
      data: { ...updateData, ...statusSideEffects },
    })
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const k of EDITABLE_FIELDS) {
      const inBody = body[k] !== undefined
      const isSideEffect = Object.prototype.hasOwnProperty.call(statusSideEffects, k)
      if (inBody || isSideEffect) {
        const from = before[k as keyof typeof before]
        const to = updated[k as keyof typeof updated]
        if (String(from ?? '') !== String(to ?? '')) {
          changes[k] = { from, to }
        }
      }
    }
    await logAudit(
      'UPDATE',
      'Device',
      id,
      `แก้ไขอุปกรณ์ ${updated.assetCode}`,
      { changes },
    )
    return NextResponse.json({ device: updated })
  } catch (err) {
    console.error('PUT /api/devices/[id]', err)
    const message = err instanceof Error ? err.message : 'Failed to update device'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const device = await db.device.findUnique({ where: { id } })
    if (!device) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await db.device.delete({ where: { id } })
    await logAudit(
      'DELETE',
      'Device',
      id,
      `ลบอุปกรณ์ ${device.assetCode} (${device.name})`,
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/devices/[id]', err)
    const message = err instanceof Error ? err.message : 'Failed to delete device'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
