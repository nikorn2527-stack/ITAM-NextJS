import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { GoogleSheetsSync, type SheetApp } from '@/lib/google-sheets-sync'

// Heavy operation — needs longer timeout (Vercel Hobby: max 60s)
export const maxDuration = 60

/**
 * GET /api/sync/google-sheets?app=itam&gid=0
 *
 * Fetches data from a Google Sheet (public — "Anyone with link").
 * Returns the raw rows for preview before applying sync.
 *
 * Auth: ADMIN (only admin/superadmin can sync)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(req.url)
  const app = (searchParams.get('app') ?? '').toLowerCase() as SheetApp
  const gid = parseInt(searchParams.get('gid') ?? '0', 10)

  if (!['itam', 'services', 'stock'].includes(app)) {
    return NextResponse.json(
      { error: 'app ต้องเป็น itam, services, หรือ stock' },
      { status: 400 },
    )
  }

  try {
    const sync = new GoogleSheetsSync()
    const rows = await sync.fetchSheet(app, gid)

    return NextResponse.json({
      app,
      gid,
      rowCount: rows.length,
      columns: rows.length > 0 ? Object.keys(rows[0]) : [],
      rows: rows.slice(0, 100), // limit preview to 100 rows
      totalRows: rows.length,
    })
  } catch (err) {
    const message = process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Unknown error') : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500 },
    )
  }
}
