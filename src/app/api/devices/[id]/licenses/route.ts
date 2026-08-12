import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/** Trim a string field, returning null when empty/missing. */
function optStr(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  return String(v).trim()
}

/** GET /api/devices/[id]/licenses — list licenses for a device. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const device = await db.device.findUnique({
      where: { id },
      select: { assetCode: true },
    })
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }
    const licenses = await db.licenseRecord.findMany({
      where: { assetCode: device.assetCode },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ licenses })
  } catch (err) {
    console.error('GET /api/devices/[id]/licenses', err)
    return NextResponse.json(
      { error: 'Failed to fetch licenses' },
      { status: 500 },
    )
  }
}

/** POST /api/devices/[id]/licenses — add a license to this device. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const device = await db.device.findUnique({
      where: { id },
      select: { assetCode: true, name: true },
    })
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }
    const body = await req.json()
    if (!body.software || String(body.software).trim() === '') {
      return NextResponse.json(
        { error: 'Missing required field: software' },
        { status: 400 },
      )
    }
    const qtyRaw =
      typeof body.quantity === 'number'
        ? body.quantity
        : Number(body.quantity)
    const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1
    const created = await db.licenseRecord.create({
      data: {
        licenseId: optStr(body.licenseId),
        assetCode: device.assetCode,
        software: String(body.software).trim(),
        licenseType: optStr(body.licenseType),
        licenseKey: optStr(body.licenseKey),
        quantity,
        expiryDate: optStr(body.expiryDate),
        remark: optStr(body.remark),
      },
    })
    await logAudit(
      'CREATE',
      'LicenseRecord',
      created.id,
      `เพิ่ม License "${created.software}" ให้อุปกรณ์ ${device.assetCode} (${device.name})`,
      {
        deviceId: id,
        assetCode: device.assetCode,
        software: created.software,
        licenseId: created.licenseId,
      },
    )
    return NextResponse.json({ license: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/devices/[id]/licenses', err)
    const message =
      err instanceof Error ? err.message : 'Failed to create license'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** DELETE /api/devices/[id]/licenses?licenseId=xxx — remove a license. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const licenseId = searchParams.get('licenseId')
    if (!licenseId) {
      return NextResponse.json(
        { error: 'Missing query parameter: licenseId' },
        { status: 400 },
      )
    }
    const device = await db.device.findUnique({
      where: { id },
      select: { assetCode: true, name: true },
    })
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }
    const existing = await db.licenseRecord.findUnique({
      where: { id: licenseId },
    })
    if (!existing) {
      return NextResponse.json({ error: 'License not found' }, { status: 404 })
    }
    await db.licenseRecord.delete({ where: { id: licenseId } })
    await logAudit(
      'DELETE',
      'LicenseRecord',
      licenseId,
      `ลบ License "${existing.software}" จากอุปกรณ์ ${device.assetCode} (${device.name})`,
      {
        deviceId: id,
        assetCode: device.assetCode,
        software: existing.software,
      },
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/devices/[id]/licenses', err)
    const message =
      err instanceof Error ? err.message : 'Failed to delete license'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
