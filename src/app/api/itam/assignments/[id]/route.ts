import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PUT /api/itam/assignments/[id] — return device (set status=returned)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const updated = await db.assignment.update({
      where: { id },
      data: {
        status: 'returned',
        actualReturnDate: body.actualReturnDate || new Date().toISOString().slice(0, 10),
        notes: body.notes ? `${body.notes}` : undefined,
      },
    })
    return NextResponse.json({ assignment: updated })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.assignment.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
