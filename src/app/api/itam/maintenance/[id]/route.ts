import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PUT /api/itam/maintenance/[id] — update (e.g., complete)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const updated = await db.maintenanceLog.update({
      where: { id },
      data: {
        status: body.status || undefined,
        endDate: body.endDate || undefined,
        resolvedNote: body.resolvedNote || undefined,
        cost: body.cost != null ? Number(body.cost) : undefined,
        vendor: body.vendor || undefined,
      },
    })
    return NextResponse.json({ log: updated })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.maintenanceLog.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
