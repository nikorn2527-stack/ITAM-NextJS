import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')?.trim() ?? ''
    const where: Record<string, unknown> = {}
    if (category) where.category = category
    const items = await db.masterItem.findMany({
      where,
      orderBy: [{ category: 'asc' }, { code: 'asc' }],
    })
    return NextResponse.json({ items })
  } catch (err) {
    console.error('GET /api/master', err)
    return NextResponse.json(
      { error: 'Failed to fetch master items' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.category || !body.code || !body.label) {
      return NextResponse.json(
        { error: 'Missing required fields: category, code, label' },
        { status: 400 },
      )
    }
    const created = await db.masterItem.create({
      data: {
        category: String(body.category).trim(),
        code: String(body.code).trim(),
        label: String(body.label).trim(),
        parentRef: body.parentRef ? String(body.parentRef).trim() : null,
        displayLabel: body.displayLabel ? String(body.displayLabel).trim() : null,
        siteCode: body.siteCode ? String(body.siteCode).trim() : null,
      },
    })
    await logAudit(
      'CREATE',
      'MasterItem',
      created.id,
      `เพิ่มข้อมูลมาตรฐาน ${created.category}: ${created.code} (${created.label})`,
      { category: created.category, code: created.code, label: created.label },
    )
    return NextResponse.json({ item: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/master', err)
    const message = err instanceof Error ? err.message : 'Failed to create master item'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
