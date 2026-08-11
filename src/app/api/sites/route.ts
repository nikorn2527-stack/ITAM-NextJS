import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export async function GET() {
  try {
    const sites = await db.site.findMany({ orderBy: { code: 'asc' } })
    return NextResponse.json({ sites })
  } catch (err) {
    console.error('GET /api/sites', err)
    return NextResponse.json({ error: 'Failed to fetch sites' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.code || !body.name) {
      return NextResponse.json(
        { error: 'Missing required fields: code, name' },
        { status: 400 },
      )
    }
    const created = await db.site.create({
      data: {
        code: String(body.code).trim(),
        name: String(body.name).trim(),
      },
    })
    await logAudit(
      'CREATE',
      'Site',
      created.id,
      `เพิ่มสาขา ${created.code} (${created.name})`,
      { code: created.code, name: created.name },
    )
    return NextResponse.json({ site: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/sites', err)
    const message = err instanceof Error ? err.message : 'Failed to create site'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
