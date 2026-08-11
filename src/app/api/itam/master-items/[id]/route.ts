import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const updated = await db.masterItem.update({
      where: { id },
      data: {
        value: body.value,
        groupName: body.groupName,
        displayLabel: body.displayLabel,
        active: body.active,
        departmentCode: body.departmentCode,
      },
    })
    return NextResponse.json({ item: updated })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.masterItem.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
