import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/sites — list all sites from the SiteAttribute table.
 * Returns the camelCase fields the SiteAttribute model uses:
 *   SiteCode, SiteName, LineOA, Hotline, PaperRateBW, PaperRateColor
 *
 * (Previously this read from the legacy `Site` table which has 0 rows in
 * Supabase — the real source of truth for sites lives in SiteAttribute.)
 *
 * Response shape (intentionally flat — matches what the device form +
 * sidebar filter expect):
 *   { sites: [{ id, code: SiteCode, name: SiteName, paperRateBw, paperRateColor, hotline, lineOa }] }
 */
export async function GET() {
  try {
    const rows = await db.siteAttribute.findMany({
      orderBy: { SiteCode: 'asc' },
    })
    const sites = rows.map((s) => ({
      id: s.id,
      code: s.SiteCode,
      name: s.SiteName ?? s.SiteCode,
      lineOa: s.LineOA ?? null,
      hotline: s.Hotline ?? null,
      paperRateBw: s.PaperRateBW ?? null,
      paperRateColor: s.PaperRateColor ?? null,
    }))
    return NextResponse.json({ sites })
  } catch (err) {
    console.error('GET /api/sites', err)
    return NextResponse.json({ error: 'Failed to fetch sites' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const code = String(body.code || '').trim().toUpperCase()
    const name = String(body.name || '').trim()
    if (!code || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: code, name' },
        { status: 400 },
      )
    }
    // Upsert by SiteCode — if the row already exists, just update SiteName.
    const created = await db.siteAttribute.upsert({
      where: { SiteCode: code },
      update: { SiteName: name },
      create: { SiteCode: code, SiteName: name },
    })
    await logAudit(
      'CREATE',
      'Site',
      created.id,
      `เพิ่มสาขา ${created.SiteCode} (${created.SiteName})`,
      { code: created.SiteCode, name: created.SiteName },
    )
    return NextResponse.json(
      {
        site: {
          id: created.id,
          code: created.SiteCode,
          name: created.SiteName ?? created.SiteCode,
        },
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('POST /api/sites', err)
    const message = err instanceof Error ? err.message : 'Failed to create site'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
