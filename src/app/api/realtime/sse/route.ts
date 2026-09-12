import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/realtime/sse
 *
 * Server-Sent Events stream for live KPI updates.
 * Sends a `kpi` event every 30 seconds + an immediate `kpi` event on connect.
 *
 * This replaces socket.io — works through the Caddy gateway normally
 * (no need for XTransformPort since it's a standard HTTP response stream).
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes — client reconnects automatically

export async function GET(_req: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false

      async function sendKpi() {
        if (closed) return
        try {
          const kpi = await getKpi()
          const data = `event: kpi\ndata: ${JSON.stringify(kpi)}\n\n`
          controller.enqueue(encoder.encode(data))
        } catch (err) {
          console.error('[sse] sendKpi error:', err)
        }
      }

      // Send initial KPI immediately
      await sendKpi()

      // Then every 30 seconds
      const interval = setInterval(() => { void sendKpi() }, 30_000)

      // Heartbeat every 15s to keep connection alive
      const heartbeat = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          // connection closed
        }
      }, 15_000)

      // Clean up when client disconnects
      _req.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(interval)
        clearInterval(heartbeat)
        try { controller.close() } catch {}
        console.log('[sse] client disconnected')
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

async function getKpi() {
  const today = new Date()
  const future = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const todayStr = today.toISOString().slice(0, 10)
  const futureStr = future.toISOString().slice(0, 10)

  const [devices, workOrders, pendingWO, lowStockRows, warrantyExpiring, recentActivities] = await Promise.all([
    db.device.count(),
    db.workOrder.count(),
    db.workOrder.count({ where: { status: { in: ['PENDING', 'ASSIGNED', 'IN_PROGRESS'] } } }).catch(() => 0),
    db.stockItem.findMany({ where: {}, select: { quantity: true, minQuantity: true } }).catch(() => []),
    db.device.count({
      where: {
        warrantyEnd: { not: null, gte: todayStr, lte: futureStr },
      },
    }).catch(() => 0),
    db.auditLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { action: true, entity: true, summary: true, actor: true, createdAt: true },
    }).catch(() => []),
  ])

  // Compute low stock client-side (avoid complex Prisma comparison)
  const lowStock = lowStockRows.filter(s => s.quantity <= (s.minQuantity ?? 0)).length

  return {
    devices,
    workOrders,
    pendingWO,
    lowStock,
    warrantyExpiring,
    recentActivities: recentActivities.map(a => ({
      action: a.action,
      entity: a.entity,
      summary: String(a.summary || '').slice(0, 100),
      actor: a.actor,
      createdAt: a.createdAt instanceof Date ? a.createdAt.getTime() : Number(a.createdAt),
    })),
  }
}
