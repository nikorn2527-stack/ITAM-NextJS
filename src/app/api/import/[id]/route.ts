import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================================
// GET /api/import/[id]  — fetch a single ImportJob (with errors)
// ============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const job = await db.importJob.findUnique({ where: { id } })
    if (!job) {
      return NextResponse.json(
        { error: 'ไม่พบ ImportJob ที่ระบุ' },
        { status: 404 },
      )
    }
    return NextResponse.json({ job })
  } catch (err) {
    console.error('GET /api/import/[id]', err)
    return NextResponse.json(
      { error: 'Failed to fetch import job' },
      { status: 500 },
    )
  }
}
