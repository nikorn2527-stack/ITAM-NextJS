import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/itam/maintenance?assetNo=&status=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const assetNo = searchParams.get('assetNo')?.trim() ?? ''
    const status = searchParams.get('status')?.trim() ?? ''
    const where: Record<string, unknown> = {}
    if (assetNo) where.assetNo = assetNo
    if (status) where.status = status
    const logs = await db.maintenanceLog.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: { device: { select: { assetNo: true, brand: true, model: true } } },
    })
    return NextResponse.json({ logs })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST — create maintenance log
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.assetNo || !body.type || !body.startDate) {
      return NextResponse.json({ error: 'assetNo, type, startDate required' }, { status: 400 })
    }
    const created = await db.maintenanceLog.create({
      data: {
        assetNo: body.assetNo,
        type: body.type,
        status: body.status || 'open',
        startDate: body.startDate,
        endDate: body.endDate || null,
        cost: body.cost ? Number(body.cost) : null,
        vendor: body.vendor || null,
        description: body.description || null,
      },
    })
    return NextResponse.json({ log: created }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
