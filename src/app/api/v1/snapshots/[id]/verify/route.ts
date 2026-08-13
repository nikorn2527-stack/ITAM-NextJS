/**
 * POST /api/v1/snapshots/[id]/verify — verify a snapshot's integrity.
 *
 * Re-computes the SHA-256 content hash and compares against the stored hash.
 * If they match, the snapshot data is unchanged since creation (no tampering).
 *
 * Response: { data: { verified: boolean, snapshotId, storedHash, computedHash }, meta }
 */

import { NextRequest } from 'next/server'
import { ok, notFound, serverError } from '@/lib/api/response'
import { requireApiAuth } from '@/lib/api/auth'
import { verifyMeterReportSnapshot } from '@/lib/meter-snapshot'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth(req, 'ADMIN')
  if (!auth.ok) return auth.response

  const { id } = await params

  try {
    // The verify function takes a cycleMonth, but we accept snapshotId/cuid here.
    // Resolve the cycleMonth from the snapshot first.
    const { db } = await import('@/lib/db')
    let snapshot: { cycleMonth: string } | null = null
    try {
      // TODO: meterReportSnapshot table removed — feature disabled
      snapshot = await db.meterReportSnapshot.findFirst({
        where: { OR: [{ snapshotId: id }, { id }] },
        select: { cycleMonth: true },
      })
    } catch {
      // TODO: meterReportSnapshot table removed — feature disabled
      return notFound('snapshot')
    }
    if (!snapshot) return notFound('snapshot')

    const result = await verifyMeterReportSnapshot(snapshot.cycleMonth)
    return ok(result)
  } catch (err) {
    console.error('POST /api/v1/snapshots/[id]/verify', err)
    return serverError(err instanceof Error ? err.message : 'Verify failed')
  }
}
