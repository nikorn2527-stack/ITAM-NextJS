import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'

// Heavy operation — needs longer timeout (Vercel Hobby: max 60s)
export const maxDuration = 60

/**
 * Depreciation endpoint — graceful "not configured" response.
 *
 * The Device model has NO financial fields (`purchasePrice`, `salvageValue`,
 * `usefulLife`). Straight-line depreciation cannot be computed without them.
 * Rather than 500'ing on a Prisma "unknown field" error, this route returns
 * a 200 with `configured: false` and an explanatory message. The frontend
 * (DepreciationSection) already handles `data.devices === undefined` /
 * empty by showing the "ยังไม่มีข้อมูลราคา" empty state — so this just works.
 *
 * When the schema is later extended with the financial fields, replace this
 * stub with the real straight-line calculation.
 */

const NOT_CONFIGURED_MESSAGE =
  'Depreciation tracking requires purchasePrice/salvageValue fields which are not yet in the schema'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  return NextResponse.json(
    {
      configured: false,
      items: [],
      message: NOT_CONFIGURED_MESSAGE,
      // Backward-compat fields for the existing frontend (DepreciationSection
      // reads `data.devices` and `data.summary`). With `devices: []` the
      // component renders its empty-state UI instead of crashing.
      devices: [],
      summary: {
        totalValue: 0,
        totalOriginal: 0,
        totalDepreciated: 0,
        avgDepreciationPercent: 0,
        fullyDepreciatedCount: 0,
        deviceCount: 0,
      },
    },
    { status: 200 },
  )
}
