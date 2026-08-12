import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'MASTER_DATA_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

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

    try {
      await db.auditLog.create({
        data: {
          timestamp: new Date().toISOString(),
          action: 'MASTER_DATA_EDIT',
          user: user.email,
          details: JSON.stringify({ itemId: id, value: body.value }),
        },
      })
    } catch { /* ignore */ }

    return NextResponse.json({ item: updated })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req, 'MASTER_DATA_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { id } = await params
    await db.masterItem.delete({ where: { id } })

    try {
      await db.auditLog.create({
        data: {
          timestamp: new Date().toISOString(),
          action: 'MASTER_DATA_EDIT',
          user: user.email,
          details: JSON.stringify({ itemId: id, action: 'delete' }),
        },
      })
    } catch { /* ignore */ }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
