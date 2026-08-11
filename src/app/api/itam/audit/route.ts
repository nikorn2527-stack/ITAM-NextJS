import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/itam/audit?action=&user=&q=&limit=50
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')?.trim() ?? ''
    const user = searchParams.get('user')?.trim() ?? ''
    const q = searchParams.get('q')?.trim() ?? ''
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))

    const where: Record<string, unknown> = {}
    if (action) where.action = action
    if (user) where.user = user
    if (q) where.details = { contains: q }

    const logs = await db.auditLog.findMany({
      where,
      take: limit,
      orderBy: { timestamp: 'desc' },
    })
    return NextResponse.json({ logs, count: logs.length })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
