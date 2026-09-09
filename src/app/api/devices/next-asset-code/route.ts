import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { moduleUnavailableResponse } from '@/lib/module-gate'

/**
 * GET /api/devices/next-asset-code
 *
 * Returns the next sequential assetCode continuing from the latest one in the
 * Device table. The legacy Apps Script assigned integer-only asset codes
 * (1, 2, 3 … 999, 2378 …) — so the next code is `MAX(integerAssetCode) + 1`.
 *
 * Non-integer codes (e.g. "IT-PRT-001") are ignored — we only look at codes
 * that are pure integers (so we can keep the legacy sequence going).
 *
 * Optional query params:
 *   - prefix: a custom prefix to prepend (e.g. "IT-" → "IT-1000"). When
 *             omitted, returns just the integer string.
 *
 * Response: { code: string, next: number, max: number }
 */
export async function GET(req: NextRequest) {
  const unavailable = await moduleUnavailableResponse('devices')
  if (unavailable) return unavailable


  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  try {
    // Fetch every assetCode in the Device table and find the max integer.
    // We avoid a raw SQL CAST because some codes are non-numeric and would
    // throw. Client-side parsing is O(N) but N is bounded (~3k devices).
    const rows = await db.device.findMany({
      select: { assetCode: true },
    })
    let max = 0
    for (const r of rows) {
      const v = parseInt(String(r.assetCode ?? '').trim(), 10)
      if (Number.isFinite(v) && v > max) max = v
    }
    const next = max + 1

    const { searchParams } = new URL(req.url)
    const prefix = (searchParams.get('prefix') ?? '').trim()
    const code = prefix
      ? `${prefix}${String(next).padStart(4, '0')}`
      : String(next)

    return NextResponse.json({
      code,
      next,
      max,
      prefix: prefix || null,
    })
  } catch (err) {
    console.error('GET /api/devices/next-asset-code', err)
    const message = process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Failed to compute next asset code') : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
