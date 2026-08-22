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
    const value = body.value !== undefined ? body.value : body.label
    const updated = await db.masterItem.update({
      where: { id },
      data: {
        category: body.categoryKey !== undefined || body.category !== undefined
          ? String(body.categoryKey ?? body.category).trim()
          : undefined,
        code: body.code !== undefined
          ? String(body.code || value || '').trim()
          : undefined,
        label: value !== undefined ? String(value).trim() : undefined,
        parentRef: body.parentRef !== undefined
          ? body.parentRef ? String(body.parentRef).trim() : null
          : undefined,
        displayLabel: body.displayLabel !== undefined
          ? body.displayLabel ? String(body.displayLabel).trim() : null
          : undefined,
        siteCode: body.siteCode !== undefined
          ? body.siteCode ? String(body.siteCode).trim() : null
          : undefined,
        active: body.active !== undefined ? Boolean(body.active) : undefined,
      },
    })

    try {
      await db.auditLog.create({
        data: {
          action: 'MASTER_DATA_EDIT',
          entity: 'MasterItem',
          entityId: id,
          summary: `แก้ไขข้อมูลมาตรฐาน`,
          actor: user.email,
          detail: JSON.stringify({ id, category: updated.category, code: updated.code, label: updated.label, parentRef: updated.parentRef, displayLabel: updated.displayLabel, siteCode: updated.siteCode, active: updated.active }),
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
          action: 'MASTER_DATA_EDIT',
          entity: 'MasterItem',
          entityId: id,
          summary: `ลบข้อมูลมาตรฐาน`,
          actor: user.email,
          detail: JSON.stringify({ id, action: 'delete' }),
        },
      })
    } catch { /* ignore */ }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
