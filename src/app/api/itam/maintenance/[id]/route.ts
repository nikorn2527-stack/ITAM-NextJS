import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { canAccessSite } from '@/lib/auth'

// PUT /api/itam/maintenance/[id] — update (e.g., complete)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'DEVICE_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { id } = await params
    const existing = await db.maintenanceLog.findUnique({
      where: { id },
      include: { device: { select: { site: true } } },
    })
    if (!existing) return NextResponse.json({ error: 'ไม่พบประวัติ' }, { status: 404 })
    if (!canAccessSite(user, existing.device?.site)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขประวัติในสาขานี้' }, { status: 403 })
    }

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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'DEVICE_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { id } = await params
    const existing = await db.maintenanceLog.findUnique({
      where: { id },
      include: { device: { select: { site: true } } },
    })
    if (!existing) return NextResponse.json({ error: 'ไม่พบประวัติ' }, { status: 404 })
    if (!canAccessSite(user, existing.device?.site)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ลบประวัติในสาขานี้' }, { status: 403 })
    }
    await db.maintenanceLog.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
