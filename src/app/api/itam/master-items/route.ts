import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'

// GET /api/itam/master-items?category=
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'VIEW_DEVICES')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')?.trim() ?? ''
    const where: Record<string, unknown> = {}
    if (category) where.categoryKey = category
    const items = await db.masterItem.findMany({ where, orderBy: { value: 'asc' } })
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST — create master item (requires MASTER_DATA_EDIT)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'MASTER_DATA_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const body = await req.json()
    if (!body.categoryKey || !body.value) {
      return NextResponse.json({ error: 'categoryKey and value required' }, { status: 400 })
    }
    const created = await db.masterItem.create({
      data: {
        categoryKey: body.categoryKey,
        value: body.value,
        itemId: body.itemId || null,
        groupName: body.groupName || null,
        parentRef: body.parentRef || null,
        displayLabel: body.displayLabel || null,
        siteCode: body.siteCode || null,
        allowedSites: body.allowedSites || null,
        active: body.active ?? true,
        departmentCode: body.departmentCode || null,
      },
    })

    try {
      await db.auditLog.create({
        data: {
          timestamp: new Date().toISOString(),
          action: 'MASTER_DATA_EDIT',
          user: user.email,
          details: JSON.stringify({ categoryKey: body.categoryKey, value: body.value }),
        },
      })
    } catch { /* ignore */ }

    return NextResponse.json({ item: created }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
