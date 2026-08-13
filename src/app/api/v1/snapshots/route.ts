/**
 * GET /api/v1/snapshots — list meter report snapshots.
 *
 * Query params:
 *   ?page=1&limit=20
 *   ?filter[cycleMonth]=2026-08
 *   ?filter[status]=ACTIVE
 *   ?sort=-createdAt
 *
 * Response: { data: Snapshot[], pagination, meta }
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { parseQuery, buildWhere, buildOrderBy, list } from '@/lib/api/response'
import { requireApiAuth } from '@/lib/api/auth'

const FIELD_MAP: Record<string, string> = {
  cycleMonth: 'cycleMonth',
  status: 'status',
  revision: 'revision',
}

export async function GET(req: NextRequest) {
  const auth = await requireApiAuth(req, 'VIEW_ANALYTICS')
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const query = parseQuery(url)
  const where = buildWhere(query, FIELD_MAP)
  const orderBy = buildOrderBy(query, FIELD_MAP, { createdAt: 'desc' })

  let total = 0
  let snapshots: unknown[] = []
  try {
    // TODO: meterReportSnapshot table removed — feature disabled
    const [t, s] = await Promise.all([
      db.meterReportSnapshot.count({ where }),
      db.meterReportSnapshot.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        // Include row count summary (already stored on snapshot.rowCount)
        select: {
          id: true,
          snapshotId: true,
          cycleMonth: true,
          revision: true,
          status: true,
          ruleVersion: true,
          rowCount: true,
          totalPagesBw: true,
          totalPagesColor: true,
          totalCost: true,
          contentHash: true,
          createdBy: true,
          createdAt: true,
        },
      }),
    ])
    total = t
    snapshots = s
  } catch {
    // TODO: meterReportSnapshot table removed — feature disabled
    return list([], { page: query.page, limit: query.limit, total: 0 })
  }

  return list(snapshots, { page: query.page, limit: query.limit, total })
}
