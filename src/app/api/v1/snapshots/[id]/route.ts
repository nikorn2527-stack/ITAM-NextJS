/**
 * GET /api/v1/snapshots/[id] — get a single snapshot by snapshotId or cuid.
 *
 * Response: { data: { snapshot, rows? }, meta }
 *
 * The [id] param accepts either the snapshotId (e.g. MRS-202608-R1-...) or
 * the internal cuid. The response includes the snapshot metadata; pass
 * ?include=rows to also get the frozen reading rows.
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, notFound } from '@/lib/api/response'
import { requireApiAuth } from '@/lib/api/auth'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth(req, 'VIEW_ANALYTICS')
  if (!auth.ok) return auth.response

  const { id } = await params
  const url = new URL(req.url)
  const includeRows = url.searchParams.get('include') === 'rows'

  // Try snapshotId first, then cuid
  const snapshot = await db.meterReportSnapshot.findFirst({
    where: { OR: [{ snapshotId: id }, { id }] },
  })

  if (!snapshot) {
    return notFound('snapshot')
  }

  let rows: unknown[] | undefined
  if (includeRows) {
    rows = await db.meterReportSnapshotRow.findMany({
      where: { snapshotId: snapshot.snapshotId },
      orderBy: { assetNo: 'asc' },
    })
  }

  return ok({ snapshot, ...(rows ? { rows } : {}) })
}
