import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getActivePattern, setActivePattern, ensureDefaultPatterns } from '@/lib/asset-number-pattern'

// GET /api/settings/asset-patterns — ดึงรูปแบบเลขทะเบียนทั้งหมด
export async function GET() {
  try {
    await ensureDefaultPatterns()
    const patterns = await db.assetNumberPattern.findMany({
      orderBy: { createdAt: 'asc' },
    })
    const active = await getActivePattern()
    return NextResponse.json({ patterns, active })
  } catch (err) {
    console.error('GET asset-patterns', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST /api/settings/asset-patterns — สร้างรูปแบบใหม่
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, pattern, description, defaultPrefix, seqPadding, seqStart } = body
    if (!name || !pattern) {
      return NextResponse.json({ error: 'name, pattern required' }, { status: 400 })
    }
    const created = await db.assetNumberPattern.create({
      data: {
        name,
        pattern,
        description: description || null,
        defaultPrefix: defaultPrefix || null,
        seqPadding: seqPadding || 5,
        seqStart: seqStart || 1,
        isActive: false,
      },
    })
    return NextResponse.json({ pattern: created }, { status: 201 })
  } catch (err) {
    console.error('POST asset-patterns', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
