import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { getOrgScope } from '@/lib/org-scope'

/**
 * POST /api/sync/ack
 *   Acknowledge that a node has received and applied a set of changes.
 *
 * Phase 1 → Phase 2 contract stub.
 *
 * Body: { nodeId, idempotencyKeys: string[] }
 * Returns: { acked: number }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const orgScope = getOrgScope(auth.user)
  if (!orgScope.ok) {
    return NextResponse.json({ error: orgScope.error }, { status: orgScope.status })
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const { nodeId, idempotencyKeys } = body as {
    nodeId?: string
    idempotencyKeys?: string[]
  }

  if (!nodeId) {
    return NextResponse.json({ error: 'nodeId is required' }, { status: 422 })
  }
  if (!Array.isArray(idempotencyKeys)) {
    return NextResponse.json({ error: 'idempotencyKeys must be an array' }, { status: 422 })
  }

  // Verify node belongs to caller's org
  const node = await db.syncNode.findFirst({
    where: { id: nodeId, organizationId: orgScope.organizationId },
  })
  if (!node) {
    return NextResponse.json(
      { error: 'Node not found in your organization' },
      { status: 404 },
    )
  }

  // Mark each outbox entry as ACKED
  let acked = 0
  for (const key of idempotencyKeys) {
    const updated = await db.syncOutbox.updateMany({
      where: { idempotencyKey: key, nodeId: node.id },
      data: { status: 'ACKED', ackedAt: new Date() },
    })
    acked += updated.count
  }

  return NextResponse.json({ acked })
}
