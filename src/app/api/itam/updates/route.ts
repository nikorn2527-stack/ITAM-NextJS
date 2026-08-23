import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'

/**
 * GET /api/itam/updates?since=<epoch_ms>
 *
 * Returns audit log events since the given timestamp.
 * Used by the polling-based realtime hook (replaces SSE on Vercel Hobby).
 *
 * Response: { events: [{ type, entity, id, ts }] }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  try {
    const since = Number(new URL(req.url).searchParams.get('since') ?? '0')
    const sinceDate = new Date(since)

    // Query audit logs since the given timestamp
    const logs = await db.auditLog.findMany({
      where: { createdAt: { gt: sinceDate } },
      orderBy: { createdAt: 'asc' },
      take: 50, // bounded
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        createdAt: true,
      },
    })

    // Map audit logs to realtime event payloads
    const events = logs.map((log) => {
      let type: string = 'audit'
      const action = log.action.toUpperCase()
      if (action.includes('CREATE') && log.entity === 'Device') type = 'device-added'
      else if (action.includes('UPDATE') && log.entity === 'Device') type = 'device-updated'
      else if (action.includes('DELETE') && log.entity === 'Device') type = 'device-deleted'
      else if (log.entity === 'MeterReading') type = 'meter-reading'
      else if (log.entity === 'WorkOrder') type = 'work-order'
      else if (log.entity === 'StockItem' || log.entity === 'StockTransaction') type = 'stock'
      else if (log.entity === 'Cycle') type = 'cycle'
      else type = 'audit'

      return {
        type,
        entity: log.entity,
        id: log.entityId ?? log.id,
        ts: log.createdAt.getTime(),
      }
    })

    return NextResponse.json({ events })
  } catch (err) {
    console.error('GET /api/itam/updates', err)
    return NextResponse.json(
      { error: 'Failed to fetch updates' },
      { status: 500 },
    )
  }
}
