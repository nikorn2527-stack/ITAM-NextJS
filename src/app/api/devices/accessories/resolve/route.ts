import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const shortId = new URL(req.url).searchParams.get('shortId')?.trim()
  if (!shortId) return NextResponse.json({ error: 'shortId required' }, { status: 400 })

  const accessory = await db.deviceAccessory.findFirst({
    where: { id: { endsWith: shortId, mode: 'insensitive' } },
    select: {
      id: true,
      parentDeviceId: true,
      accessoryType: true,
      brand: true,
      model: true,
      serialNumber: true,
      status: true,
    },
  })

  if (!accessory) return NextResponse.json({ notFound: true }, { status: 404 })

  return NextResponse.json({
    accessoryId: accessory.id,
    parentDeviceId: accessory.parentDeviceId,
    accessoryType: accessory.accessoryType,
    brand: accessory.brand,
    model: accessory.model,
    serialNumber: accessory.serialNumber,
    status: accessory.status,
  })
}
