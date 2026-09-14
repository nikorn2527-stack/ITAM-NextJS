import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isNumericShortQuery } from '@/lib/suffix-search'
import { verifyToken } from '@/lib/auth'

/**
 * GET /api/search?q=<query>
 *
 * Performance optimized:
 *   - All queries run in PARALLEL (Promise.all)
 *   - Uses select to reduce payload
 *   - Short numeric: suffix match first (1 query, not 3)
 *   - Only searches devices + masters (skips meter/audit/site for speed)
 *   - Results limited to 8 per type
 *
 * Auth (FIX API-BUG-044): Bearer token required AND must be a valid signed JWT.
 *   Previously this route only checked that the header STARTED with "Bearer "
 *   — any garbage string after that prefix would pass, allowing unauthenticated
 *   search across ALL sites (bypassing row-level security).
 *   Now we call verifyToken() to check signature + expiry before running queries.
 *   We do NOT call requireAuth() (which also loads the user row from DB) because
 *   search is on the hot path and we only need to verify identity, not refresh
 *   permissions on every keystroke.
 */

// Cache for 30 seconds — search results don't change frequently
export const revalidate = 30
export const dynamic = 'force-dynamic'

interface SearchDevice {
  type: 'device'
  id: string
  title: string
  subtitle: string
  url: null
}
interface SearchMaster {
  type: 'master'
  id: string
  title: string
  subtitle: string
}

interface SearchResults {
  devices: SearchDevice[]
  master: SearchMaster[]
  meter: unknown[]
  audit: unknown[]
  sites: unknown[]
}

const EMPTY: SearchResults = {
  devices: [],
  master: [],
  meter: [],
  audit: [],
  sites: [],
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // FIX API-BUG-044: verify the JWT signature + expiry, don't just trust
    // that the header starts with "Bearer ". A garbage token like
    // "Bearer foobar" used to pass and let anyone search across all sites.
    const token = authHeader.slice(7).trim()
    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
    const searchType = (new URL(req.url).searchParams.get('type') ?? 'all').trim()
    if (q.length < 2) {
      return NextResponse.json({ results: EMPTY, total: 0 })
    }

    const isShort = isNumericShortQuery(q)

    // ── Build device where clause (1 query, not 3) ──
    // For short numeric: try suffix + contains in one query
    // For text: contains on all fields
    const deviceWhere = isShort
      ? {
          OR: [
            { assetCode: { endsWith: q } },
            { serialNumber: { endsWith: q } },
            { assetSiteCode: { endsWith: q } },
            { assetCode: { contains: q } },
            { serialNumber: { contains: q } },
          ],
        }
      : {
          OR: [
            { assetCode: { contains: q } },
            { serialNumber: { contains: q } },
            { name: { contains: q } },
            { brand: { contains: q } },
            { model: { contains: q } },
          ],
        }

    // ── Build master where clause ──
    const masterWhere = isShort
      ? {
          OR: [
            { code: { endsWith: q } },
            { code: { contains: q } },
            { label: { contains: q } },
          ],
        }
      : {
          OR: [
            { code: { contains: q } },
            { label: { contains: q } },
          ],
        }

    // ── Run queries in PARALLEL (skip masters if type=devices) ──
    const shouldSearchMasters = searchType === 'all' || searchType === 'masters'

    const [devices, masters] = await Promise.all([
      db.device.findMany({
        where: deviceWhere,
        take: 8,
        orderBy: { assetCode: 'asc' },
        select: {
          id: true,
          assetCode: true,
          name: true,
          brand: true,
          model: true,
          serialNumber: true,
          site: true,
        },
      }),
      shouldSearchMasters
        ? db.masterItem.findMany({
            where: masterWhere,
            take: 5,
            orderBy: { code: 'asc' },
            select: {
              id: true,
              code: true,
              label: true,
              category: true,
            },
          })
        : Promise.resolve([]),
    ])

    const deviceResults: SearchDevice[] = devices.map((d) => ({
      type: 'device' as const,
      id: d.id,
      title: `${d.assetCode} · ${d.name}`,
      subtitle: `S/N: ${d.serialNumber ?? '-'} | ${d.brand ?? ''} ${d.model ?? ''} · ${d.site ?? ''}`,
      url: null,
    }))

    const masterResults: SearchMaster[] = masters.map((m) => ({
      type: 'master' as const,
      id: m.id,
      title: m.code,
      subtitle: `${m.label} · ${m.category}`,
    }))

    const results: SearchResults = {
      devices: deviceResults,
      master: masterResults,
      meter: [],
      audit: [],
      sites: [],
    }

    const total = results.devices.length + results.master.length

    return NextResponse.json({ results, total })
  } catch (err) {
    console.error('GET /api/search', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
