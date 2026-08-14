import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  getActiveWoPattern,
  ensureDefaultWoPatterns,
} from '@/lib/wo-number-pattern'

// GET /api/settings/wo-patterns — ดึงรูปแบบเลขใบงานทั้งหมด
export async function GET() {
  try {
    await ensureDefaultWoPatterns()
    const patterns = await db.woNumberPattern.findMany({
      orderBy: { createdAt: 'asc' },
    })
    const active = await getActiveWoPattern()
    return NextResponse.json({ patterns, active })
  } catch (err) {
    console.error('GET wo-patterns', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// POST /api/settings/wo-patterns — สร้างรูปแบบเลขใบงานใหม่
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, pattern, description, defaultPrefix, seqPadding, seqStart } = body
    if (!name || !pattern) {
      return NextResponse.json(
        { error: 'name, pattern required' },
        { status: 400 },
      )
    }
    const created = await db.woNumberPattern.create({
      data: {
        name,
        pattern,
        description: description || null,
        defaultPrefix: defaultPrefix || null,
        seqPadding: seqPadding || 4,
        seqStart: seqStart || 1,
        isActive: false,
      },
    })
    return NextResponse.json({ pattern: created }, { status: 201 })
  } catch (err) {
    console.error('POST wo-patterns', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
