import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { getOrgScope } from '@/lib/org-scope'
import { logAudit } from '@/lib/audit'
import { randomUUID } from 'node:crypto'

/**
 * POST /api/sync/nodes/register
 *
 * Phase 1 → Phase 2 contract stub.
 * Registers a LAN/Offline node so it can push/pull changes.
 *
 * Body: { nodeType: 'LAN' | 'OFFLINE', siteCode? }
 * Returns: { nodeId, status: 'ACTIVE', registeredAt }
 *
 * Phase 2 will add: node authentication, revoke, heartbeat, lastSyncAt updates.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, 'SYSTEM_CONFIG')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const orgScope = getOrgScope(auth.user)
  if (!orgScope.ok) {
    return NextResponse.json({ error: orgScope.error }, { status: orgScope.status })
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const { nodeType, siteCode } = body as { nodeType?: string; siteCode?: string }

  if (!nodeType || !['LAN', 'OFFLINE'].includes(nodeType)) {
    return NextResponse.json(
      { error: 'nodeType must be LAN or OFFLINE', code: 'INVALID_NODE_TYPE' },
      { status: 422 },
    )
  }

  // Generate a stable node id (caller may reuse on reconnect via idempotency)
  const nodeId = `node-${randomUUID().slice(0, 12)}`

  const node = await db.syncNode.create({
    data: {
      id: nodeId,
      organizationId: orgScope.organizationId!,
      siteCode: siteCode ?? null,
      nodeType,
      status: 'ACTIVE',
    },
  })

  await logAudit(
    'SYNC_NODE_REGISTER',
    'SyncNode',
    node.id,
    `Registered ${nodeType} node for org ${orgScope.organizationId}`,
    { nodeType, siteCode },
    auth.row.username ?? auth.user.email,
  )

  return NextResponse.json(
    { nodeId: node.id, status: node.status, registeredAt: node.createdAt },
    { status: 201 },
  )
}
