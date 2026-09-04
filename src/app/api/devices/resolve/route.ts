import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const shortId = new URL(req.url).searchParams.get('shortId')?.trim()
  if (!shortId) return NextResponse.json({ error: 'shortId required' }, { status: 400 })

  const device = await db.device.findFirst({
    where: { id: { endsWith: shortId, mode: 'insensitive' } },
    select: { id: true, assetCode: true, name: true, brand: true, model: true, status: true },
  })

  if (!device) return NextResponse.json({ notFound: true }, { status: 404 })

  return NextResponse.json({
    deviceId: device.id,
    assetCode: device.assetCode,
    name: device.name,
    brand: device.brand,
    model: device.model,
    status: device.status,
  })
}
