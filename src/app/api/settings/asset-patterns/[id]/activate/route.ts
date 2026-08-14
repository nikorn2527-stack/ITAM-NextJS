import { NextRequest, NextResponse } from 'next/server'
import { setActivePattern } from '@/lib/asset-number-pattern'

// POST /api/settings/asset-patterns/[id]/activate — ตั้งเป็นรูปแบบที่ใช้งาน
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await setActivePattern(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST activate pattern', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
