import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/cron/keepalive
 *
 * Cron job — pings the database every Monday 9:00 AM to prevent
 * Supabase Free from auto-pausing after 7 days of inactivity.
 *
 * Setup in vercel.json:
 *   "crons": [{ "path": "/api/cron/keepalive", "schedule": "0 9 * * 1" }]
 *
 * Security: requires CRON_SECRET header (set in Vercel env vars).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, ts: Date.now() })
  } catch (err) {
    console.error('Keepalive failed:', err)
    return NextResponse.json(
      { error: 'Database unreachable' },
      { status: 500 },
    )
  }
}
