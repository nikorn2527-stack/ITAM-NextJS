import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { getOrgScope } from '@/lib/org-scope'

/**
 * GET /api/sync/pull?cursor=<isoTimestamp>&nodeId=<nodeId>
 *
 * Phase 1 → Phase 2 contract stub.
 * Returns changes that happened AFTER the cursor for the caller's org.
 *
 * Phase 2 will:
 *   - Stream entity changes (Device, WorkOrder, Stock, MasterItem) with version > cursor
 *   - Filter by node's siteCode scope
 *   - Return nextCursor for pagination
 *
 * For now: returns the contract shape with empty changes so client code
 * can be built against a stable API.
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
  const cursor = url.searchParams.get('cursor') // ISO timestamp
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

  // Phase 2: actual change query. For now return empty + contract shape.
  const changes: unknown[] = []
  const nextCursor = new Date().toISOString()

  // Update lastSyncAt on the node
  await db.syncNode.update({
    where: { id: node.id },
    data: { lastSyncAt: new Date() },
  })

  return NextResponse.json({
    nodeId: node.id,
    cursor,
    nextCursor,
    changes,
    hasMore: false,
  })
}
