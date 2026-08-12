import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { siteFilterForUser } from '@/lib/auth'

// GET /api/itam/audit?action=&user=&q=&page=1&limit=50
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'VIEW_DEVICES')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    // Non-admin users can only see their own audit log entries
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      const where: Record<string, unknown> = { actor: user.email }
      const { searchParams } = new URL(req.url)
      const action = searchParams.get('action')?.trim() ?? ''
      const q = searchParams.get('q')?.trim() ?? ''
      if (action) where.action = action
      if (q) where.detail = { contains: q }
      const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
      const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
      const [logs, total] = await Promise.all([
        db.auditLog.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        db.auditLog.count({ where }),
      ])
      return NextResponse.json({
        logs,
        count: logs.length,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      })
    }

    // Admin: full audit log + optional device-site filtering when q mentions a site
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')?.trim() ?? ''
    const qUser = searchParams.get('user')?.trim() ?? ''
    const q = searchParams.get('q')?.trim() ?? ''
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))

    const where: Record<string, unknown> = { AND: [] as unknown[] }
    if (action) (where.AND as unknown[]).push({ action })
    if (qUser) (where.AND as unknown[]).push({ actor: { contains: qUser } })
    if (q) (where.AND as unknown[]).push({ detail: { contains: q } })
    if (Array.isArray(where.AND) && where.AND.length === 0) delete where.AND
    // Note: site filter is informational here — admin sees all audit logs
    void siteFilterForUser

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
