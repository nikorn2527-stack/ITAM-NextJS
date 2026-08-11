import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const updated = await db.device.update({
      where: { id },
      data: {
        assetCode: body.assetCode !== undefined ? String(body.assetCode).trim() : undefined,
        name: body.name !== undefined ? String(body.name).trim() : undefined,
        brand: body.brand !== undefined ? String(body.brand).trim() : undefined,
        model: body.model !== undefined ? String(body.model).trim() : undefined,
        type: body.type !== undefined ? String(body.type).trim() : undefined,
        serialNumber:
          body.serialNumber !== undefined
            ? body.serialNumber
              ? String(body.serialNumber).trim()
              : null
            : undefined,
        status: body.status !== undefined ? String(body.status).trim() : undefined,
        site: body.site !== undefined ? String(body.site).trim() : undefined,
        department:
          body.department !== undefined
            ? body.department
              ? String(body.department).trim()
              : null
            : undefined,
        departmentCode:
          body.departmentCode !== undefined
            ? body.departmentCode
              ? String(body.departmentCode).trim()
              : null
            : undefined,
        parentRef:
          body.parentRef !== undefined
            ? body.parentRef
              ? String(body.parentRef).trim()
              : null
            : undefined,
        displayLabel:
          body.displayLabel !== undefined
            ? body.displayLabel
              ? String(body.displayLabel).trim()
              : null
            : undefined,
        location:
          body.location !== undefined
            ? body.location
              ? String(body.location).trim()
              : null
            : undefined,
        purchaseDate:
          body.purchaseDate !== undefined
            ? body.purchaseDate
              ? String(body.purchaseDate).trim()
              : null
            : undefined,
        lastMeterReading:
          typeof body.lastMeterReading === 'number'
            ? body.lastMeterReading
            : undefined,
      },
    })
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
    await db.device.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/devices/[id]', err)
    const message = err instanceof Error ? err.message : 'Failed to delete device'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
