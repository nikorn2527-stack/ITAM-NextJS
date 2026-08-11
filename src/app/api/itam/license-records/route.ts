import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/itam/license-records?assetNo=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const assetNo = searchParams.get('assetNo')?.trim() ?? ''
    const where: Record<string, unknown> = {}
    if (assetNo) where.assetNo = assetNo
    const records = await db.licenseRecord.findMany({ where, orderBy: { software: 'asc' } })
    return NextResponse.json({ records })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.software) return NextResponse.json({ error: 'software required' }, { status: 400 })
    const created = await db.licenseRecord.create({
      data: {
        licenseId: body.licenseId || null,
        assetNo: body.assetNo || null,
        software: body.software,
        licenseType: body.licenseType || null,
        licenseKey: body.licenseKey || null,
        quantity: body.quantity || 1,
        expiryDate: body.expiryDate || null,
        remark: body.remark || null,
      },
    })
    return NextResponse.json({ record: created }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
