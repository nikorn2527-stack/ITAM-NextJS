import { NextRequest, NextResponse } from 'next/server'
import { setActiveWoPattern } from '@/lib/wo-number-pattern'

// POST /api/settings/wo-patterns/[id]/activate — ตั้งเป็นรูปแบบที่ใช้งาน
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await setActiveWoPattern(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST activate wo-pattern', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
