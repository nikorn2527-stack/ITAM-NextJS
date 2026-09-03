import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isNumericShortQuery } from '@/lib/suffix-search'

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
 * Auth: Bearer token required.
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
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
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

    // ── Run ALL queries in PARALLEL ──
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
      db.masterItem.findMany({
        where: masterWhere,
        take: 5,
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          label: true,
          category: true,
        },
      }),
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
