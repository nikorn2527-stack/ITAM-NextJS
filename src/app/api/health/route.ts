import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/health — Comprehensive health check (Node.js runtime).
 *
 * Checks:
 *   1. Database connectivity (Supabase PostgreSQL)
 *   2. Vercel Blob storage (if configured)
 *   3. Vercel KV (if configured)
 *   4. Supabase Realtime (if configured)
 *   5. Edge Config (if configured)
 *
 * Returns 200 if all critical services are up, 503 if any is down.
 *
 * For uptime monitoring (UptimeRobot, etc.), use /api/health-edge instead
 * (Edge runtime, ~50ms response, no DB check).
 *
 * For detailed health check (this endpoint), expect ~200-500ms response.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 10

interface ServiceHealth {
  name: string
  status: 'up' | 'down' | 'skipped'
  latencyMs?: number
  detail?: string
}

export async function GET() {
  const startTime = Date.now()
  const services: ServiceHealth[] = []

  // ── 1. Database (critical) ──
  const dbStart = Date.now()
  try {
    await db.$queryRaw`SELECT 1`
    const mc = await db.masterItem.count()
    services.push({
      name: 'database',
      status: 'up',
      latencyMs: Date.now() - dbStart,
      detail: `${mc} master items`,
    })
  } catch (err) {
    services.push({
      name: 'database',
      status: 'down',
      latencyMs: Date.now() - dbStart,
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // ── 2. Vercel Blob (optional) ──
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blobStart = Date.now()
    try {
      // Just check env var — don't make actual API call (costs quota)
      services.push({
        name: 'vercel-blob',
        status: 'up',
        latencyMs: Date.now() - blobStart,
        detail: 'configured',
      })
    } catch (err) {
      services.push({
        name: 'vercel-blob',
        status: 'down',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  } else {
    services.push({ name: 'vercel-blob', status: 'skipped' })
  }

  // ── 3. Vercel KV (optional) ──
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const kvStart = Date.now()
    try {
      // Simple PING via REST API
      const res = await fetch(`${process.env.KV_REST_API_URL}/ping`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      })
      if (res.ok) {
        services.push({
          name: 'vercel-kv',
          status: 'up',
          latencyMs: Date.now() - kvStart,
        })
      } else {
        services.push({
          name: 'vercel-kv',
          status: 'down',
          detail: `HTTP ${res.status}`,
        })
      }
    } catch (err) {
      services.push({
        name: 'vercel-kv',
        status: 'down',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  } else {
    services.push({ name: 'vercel-kv', status: 'skipped' })
  }

  // ── 4. Supabase Realtime (optional) ──
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    services.push({
      name: 'supabase-realtime',
      status: 'up',
      detail: 'configured',
    })
  } else {
    services.push({ name: 'supabase-realtime', status: 'skipped' })
  }

  // ── 4b. Cloudflare R2 (optional) ──
  if (
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_BUCKET_NAME
  ) {
    services.push({
      name: 'cloudflare-r2',
      status: 'up',
      detail: process.env.R2_BUCKET_NAME,
    })
  } else {
    services.push({ name: 'cloudflare-r2', status: 'skipped' })
  }

  // ── 5. Edge Config (optional) ──
  if (process.env.EDGE_CONFIG) {
    services.push({
      name: 'edge-config',
      status: 'up',
      detail: 'configured',
    })
  } else {
    services.push({ name: 'edge-config', status: 'skipped' })
  }

  // ── Aggregate status ──
  const dbHealth = services.find((s) => s.name === 'database')
  const isCriticalDown = dbHealth?.status === 'down'

  const dbUrl = process.env.DATABASE_URL ?? ''
  const masked = dbUrl.replace(/:[^:@]+@/, ':****@')
  const isPooler = /\.pooler\.supabase\.com/.test(dbUrl)

  return NextResponse.json(
    {
      ok: !isCriticalDown,
      status: isCriticalDown ? 'unhealthy' : 'healthy',
      timestamp: new Date().toISOString(),
      totalLatencyMs: Date.now() - startTime,
      deployment: process.env.VERCEL_DEPLOYMENT_ID || 'dev',
      gitCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown',
      region: process.env.VERCEL_REGION || 'local',
      dbUrl: masked.slice(0, 80),
      isPooler,
      services,
    },
    { status: isCriticalDown ? 503 : 200 },
  )
}
