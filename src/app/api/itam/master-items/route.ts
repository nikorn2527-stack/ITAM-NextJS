import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/itam/master-items?category=
export async function GET(req: NextRequest) {
  try {
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

// POST
export async function POST(req: NextRequest) {
  try {
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
    return NextResponse.json({ item: created }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
