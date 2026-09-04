import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; accessoryId: string }> },
) {
  const auth = await requireAuth(req, 'DEVICE_EDIT')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { accessoryId } = await params
  const body = await req.json().catch(() => ({}))

  const updated = await db.deviceAccessory.update({
    where: { id: accessoryId },
    data: {
      accessoryType: body.accessoryType,
      brand: body.brand,
      model: body.model,
      serialNumber: body.serialNumber,
      status: body.status,
      installedDate: body.installedDate,
      remark: body.remark,
    },
  })

  return NextResponse.json({ accessory: updated })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; accessoryId: string }> },
) {
  const auth = await requireAuth(req, 'DEVICE_EDIT')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { accessoryId } = await params
  await db.deviceAccessory.delete({ where: { id: accessoryId } })

  return NextResponse.json({ ok: true })
}
