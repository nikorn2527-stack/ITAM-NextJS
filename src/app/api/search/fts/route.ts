import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { searchAll, searchDevices, searchWorkOrders, searchStockItems } from '@/lib/full-text-search'

/**
 * GET /api/search/fts?q=<query>&type=<type>&limit=<n>&site=<code>
 *
 * Full-Text Search endpoint using PostgreSQL tsvector + GIN indexes.
 * 100x faster than ILIKE for large datasets.
 *
 * Query params:
 *   q     — search query (required, min 2 chars)
 *   type  — 'all' | 'devices' | 'work-orders' | 'stock' (default: 'all')
 *   limit — max results (default: 10, max: 50)
 *   site  — filter by site code (optional)
 *
 * Response:
 *   { results: SearchResult[], total: number, query: string, type: string }
 *
 * SearchResult shape:
 *   { id, type, title, subtitle, score? }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  const type = (searchParams.get('type') ?? 'all').trim()
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 50)
  const siteCode = searchParams.get('site')?.trim() || undefined

  if (q.length < 2) {
    return NextResponse.json({
      results: [],
      total: 0,
      query: q,
      type,
    })
  }

  try {
    let results
    switch (type) {
      case 'devices':
        results = await searchDevices(q, { limit, siteCode })
        break
      case 'work-orders':
        results = await searchWorkOrders(q, { limit, siteCode })
        break
      case 'stock':
        results = await searchStockItems(q, { limit })
        break
      case 'all':
      default:
        results = await searchAll(q, { limit, siteCode })
        break
    }

    return NextResponse.json({
      results,
      total: results.length,
      query: q,
      type,
    })
  } catch (err) {
    console.error('GET /api/search/fts', err)
    return NextResponse.json(
      { error: 'Search failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
