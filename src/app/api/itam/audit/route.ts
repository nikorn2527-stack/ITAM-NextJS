import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/itam/audit?action=&user=&q=&page=1&limit=50
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')?.trim() ?? ''
    const user = searchParams.get('user')?.trim() ?? ''
    const q = searchParams.get('q')?.trim() ?? ''
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))

    const where: Record<string, unknown> = {}
    if (action) where.action = action
    if (user) where.user = { contains: user }
    if (q) where.details = { contains: q }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { timestamp: 'desc' },
      }),
      db.auditLog.count({ where }),
    ])
    return NextResponse.json({
      logs,
      count: logs.length,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error('GET /api/itam/audit', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
