import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/itam/assignments?assetNo=&status=
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const assetNo = searchParams.get('assetNo')?.trim() ?? ''
    const status = searchParams.get('status')?.trim() ?? ''
    const where: Record<string, unknown> = {}
    if (assetNo) where.assetNo = assetNo
    if (status) where.status = status
    const assignments = await db.assignment.findMany({
      where,
      orderBy: { checkoutDate: 'desc' },
      include: { device: { select: { assetNo: true, brand: true, model: true } } },
    })
    return NextResponse.json({ assignments })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST — checkout device
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.assetNo || !body.assignee || !body.checkoutDate) {
      return NextResponse.json({ error: 'assetNo, assignee, checkoutDate required' }, { status: 400 })
    }
    // Check conflict
    const existing = await db.assignment.findFirst({
      where: { assetNo: body.assetNo, status: 'active' },
    })
    if (existing) {
      return NextResponse.json({ error: 'อุปกรณ์นี้ถูกมอบหมายแล้ว' }, { status: 409 })
    }
    const created = await db.assignment.create({
      data: {
        assetNo: body.assetNo,
        assignee: body.assignee,
        assigneeRole: body.assigneeRole || null,
        department: body.department || null,
        checkoutDate: body.checkoutDate,
        expectedReturnDate: body.expectedReturnDate || null,
        status: 'active',
        notes: body.notes || null,
      },
    })
    return NextResponse.json({ assignment: created }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
