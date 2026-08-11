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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search')?.trim() ?? ''
    const status = searchParams.get('status')?.trim() ?? ''
    const site = searchParams.get('site')?.trim() ?? ''

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { assetCode: { contains: search } },
        { name: { contains: search } },
        { serialNumber: { contains: search } },
        { brand: { contains: search } },
        { model: { contains: search } },
      ]
    }
    if (status) where.status = status
    if (site) where.site = site

    const devices = await db.device.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ devices })
  } catch (err) {
    console.error('GET /api/devices', err)
    return NextResponse.json(
      { error: 'Failed to fetch devices' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const required = ['assetCode', 'name', 'brand', 'model', 'type', 'status', 'site']
    for (const k of required) {
      if (body[k] === undefined || body[k] === null || body[k] === '') {
        return NextResponse.json(
          { error: `Missing required field: ${k}` },
          { status: 400 },
        )
      }
    }
    const created = await db.device.create({
      data: {
        assetCode: String(body.assetCode).trim(),
        name: String(body.name).trim(),
        brand: String(body.brand).trim(),
        model: String(body.model).trim(),
        type: String(body.type).trim(),
        serialNumber: body.serialNumber ? String(body.serialNumber).trim() : null,
        status: String(body.status).trim(),
        site: String(body.site).trim(),
        department: body.department ? String(body.department).trim() : null,
        departmentCode: body.departmentCode
          ? String(body.departmentCode).trim()
          : null,
        parentRef: body.parentRef ? String(body.parentRef).trim() : null,
        displayLabel: body.displayLabel ? String(body.displayLabel).trim() : null,
        location: body.location ? String(body.location).trim() : null,
        purchaseDate: body.purchaseDate ? String(body.purchaseDate).trim() : null,
        warrantyMonths: clampWarrantyMonths(body.warrantyMonths),
        lastMeterReading:
          typeof body.lastMeterReading === 'number'
            ? body.lastMeterReading
            : 0,
        purchasePrice: optFloat(body.purchasePrice),
        salvageValue: optFloat(body.salvageValue) ?? 0,
        usefulLife: optInt(body.usefulLife),
      },
    })
    await logAudit(
      'CREATE',
      'Device',
      created.id,
      `เพิ่มอุปกรณ์ ${created.assetCode} (${created.name})`,
      {
        assetCode: created.assetCode,
        name: created.name,
        brand: created.brand,
        type: created.type,
        site: created.site,
      },
    )
    return NextResponse.json({ device: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/devices', err)
    const message = err instanceof Error ? err.message : 'Failed to create device'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
