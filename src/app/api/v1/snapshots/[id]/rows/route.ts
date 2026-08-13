/**
 * GET /api/v1/snapshots/[id]/rows — list frozen rows in a snapshot.
 *
 * Query params (standard): ?page=1&limit=50&sort=assetNo&filter[assetNo]=...
 *
 * Response: { data: SnapshotRow[], pagination, meta }
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { parseQuery, buildWhere, buildOrderBy, list, notFound } from '@/lib/api/response'
import { requireApiAuth } from '@/lib/api/auth'

const FIELD_MAP: Record<string, string> = {
  assetNo: 'assetNo',
  readingType: 'readingType',
  readingMonth: 'readingMonth',
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth(req, 'VIEW_ANALYTICS')
  if (!auth.ok) return auth.response

  const { id } = await params
  const url = new URL(req.url)
  const query = parseQuery(url)

  // Resolve snapshotId from snapshotId or cuid
  let snapshot: { snapshotId: string } | null = null
  try {
    // TODO: meterReportSnapshot table removed — feature disabled
    snapshot = await db.meterReportSnapshot.findFirst({
      where: { OR: [{ snapshotId: id }, { id }] },
      select: { snapshotId: true },
    })
  } catch {
    // TODO: meterReportSnapshot table removed — feature disabled
    return list([], { page: query.page, limit: query.limit, total: 0 })
  }
  if (!snapshot) return notFound('snapshot')

  const where = { ...buildWhere(query, FIELD_MAP), snapshotId: snapshot.snapshotId }
  const orderBy = buildOrderBy(query, FIELD_MAP, { assetNo: 'asc' })

  let total = 0
  let rows: unknown[] = []
  try {
    // TODO: meterReportSnapshot table removed — feature disabled
    const [t, r] = await Promise.all([
      db.meterReportSnapshotRow.count({ where }),
      db.meterReportSnapshotRow.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ])
    total = t
    rows = r
  } catch {
    // TODO: meterReportSnapshot table removed — feature disabled
    return list([], { page: query.page, limit: query.limit, total: 0 })
  }

  return list(rows, { page: query.page, limit: query.limit, total })
}
