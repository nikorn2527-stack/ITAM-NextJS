import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { getOrgScope } from '@/lib/org-scope'
import { pullChanges } from '@/lib/sync-pull-engine'

/**
 * GET /api/sync/pull?cursor=<updatedAt|id>&nodeId=<nodeId>
 *
 * Phase 2: Pull Change Feed implementation.
 * L-21: Uses (updatedAt, id) composite cursor — no data skipped.
 * L-22: Includes tombstones (soft-deleted records) as DELETE ops.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const orgScope = getOrgScope(auth.user)
  if (!orgScope.ok) {
    return NextResponse.json({ error: orgScope.error }, { status: orgScope.status })
  }

  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor') // "updatedAt|id" composite
  const nodeId = url.searchParams.get('nodeId')

  if (!nodeId) {
    return NextResponse.json(
      { error: 'nodeId is required', code: 'MISSING_NODE_ID' },
      { status: 422 },
    )
  }

  // Verify the node belongs to the caller's org
  const node = await db.syncNode.findFirst({
    where: { id: nodeId, organizationId: orgScope.organizationId },
  })
  if (!node) {
    return NextResponse.json(
      { error: 'Node not found in your organization', code: 'NODE_NOT_FOUND' },
      { status: 404 },
    )
  }

  // L-21 + L-22: pull changes using composite cursor + tombstones
  const result = await pullChanges(
    orgScope.organizationId!,
    node.siteCode,
    cursor,
  )

  // Update lastSyncAt on the node
  await db.syncNode.update({
    where: { id: node.id },
    data: { lastSyncAt: new Date().toISOString() },
  })

  return NextResponse.json({
    nodeId: node.id,
    cursor,
    nextCursor: result.nextCursor,
    changes: result.changes,
    hasMore: result.hasMore,
  })
}
