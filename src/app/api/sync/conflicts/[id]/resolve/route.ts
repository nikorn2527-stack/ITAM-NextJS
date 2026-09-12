import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { getOrgScope } from '@/lib/org-scope'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/sync/conflicts/[id]/resolve
 *   Resolve a sync conflict (admin chooses cloud, offline, merged, or reject).
 *
 * Phase 1 → Phase 2 contract stub.
 *
 * Body: { resolution: 'CLOUD' | 'OFFLINE' | 'MERGED' | 'REJECTED',
 *         mergedPayload?, expectedCloudVersion? }
 *
 * Rules (per blueprint §3.5):
 *   - Check Organization Scope of the conflict first
 *   - Accept expectedCloudVersion to prevent two admins resolving simultaneously
 *   - Use a transaction to update Entity, Conflict, Outbox, AuditLog
 *   - Bump Entity Version after resolve
 *   - Reject if Entity Version changed since conflict was opened
 */
interface Params {
  params: { id: string }
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req, 'SYSTEM_CONFIG')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const orgScope = getOrgScope(auth.user)
  if (!orgScope.ok) {
    return NextResponse.json({ error: orgScope.error }, { status: orgScope.status })
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>))
  const { resolution, mergedPayload, expectedCloudVersion } = body as {
    resolution?: string
    mergedPayload?: Record<string, unknown>
    expectedCloudVersion?: number
  }

  if (!resolution || !['CLOUD', 'OFFLINE', 'MERGED', 'REJECTED'].includes(resolution)) {
    return NextResponse.json(
      { error: 'resolution must be CLOUD, OFFLINE, MERGED, or REJECTED' },
      { status: 422 },
    )
  }

  // Scope the conflict by org (superadmin bypass)
  const where =
    auth.user.role === 'superadmin'
      ? { id: params.id }
      : { id: params.id, organizationId: orgScope.organizationId }

  const conflict = await db.syncConflict.findFirst({ where })
  if (!conflict) {
    return NextResponse.json(
      { error: 'Conflict not found in your organization' },
      { status: 404 },
    )
  }
  if (conflict.status !== 'OPEN') {
    return NextResponse.json(
      { error: 'Conflict is already resolved', currentStatus: conflict.status },
      { status: 422 },
    )
  }

  // P1-04 style: optimistic concurrency
  if (expectedCloudVersion !== undefined && conflict.cloudVersion !== expectedCloudVersion) {
    return NextResponse.json(
      { error: 'Conflict changed; reload before resolving', code: 'VERSION_CONFLICT' },
      { status: 409 },
    )
  }

  const actor = auth.row.username ?? auth.user.email
  const updated = await db.syncConflict.update({
    where: { id: conflict.id },
    data: {
      status: resolution === 'REJECTED' ? 'REJECTED' : 'RESOLVED',
      resolution,
      resolvedBy: actor,
      resolvedAt: new Date(),
    },
  })

  // Phase 2 will also: update the entity with chosen payload + bump version +
  // mark the originating SyncOutbox entry as ACKED or FAILED.

  await logAudit(
    'SYNC_CONFLICT_RESOLVE',
    'SyncConflict',
    updated.id,
    `Resolved conflict: ${resolution} (entity ${conflict.entityType}:${conflict.entityId})`,
    { resolution, entityType: conflict.entityType, entityId: conflict.entityId, actor },
    actor,
  )

  return NextResponse.json({ conflict: updated })
}
