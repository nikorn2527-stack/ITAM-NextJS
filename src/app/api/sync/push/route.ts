import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { getOrgScope } from '@/lib/org-scope'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/sync/push
 *
 * Phase 1 → Phase 2 contract stub.
 * Receives changes from an offline/lan node and applies them with
 * Optimistic Concurrency Control (baseVersion check).
 *
 * Request:
 *   { nodeId, changes: [{ idempotencyKey, entityType, entityId, operation,
 *                          baseVersion, entityVersion, payload }] }
 *
 * Response:
 *   { accepted: [{ idempotencyKey, newVersion, status }], conflicts: [...], failed: [...] }
 *
 * Phase 2 will add: per-entity conflict policy (Device field-merge,
 * WorkOrder status-cloud-wins, StockTransaction append-only, etc.)
 */
interface PushChange {
  idempotencyKey: string
  entityType: string
  entityId: string
  operation: 'CREATE' | 'UPDATE' | 'DELETE'
  baseVersion?: number
  entityVersion?: number
  payload: Record<string, unknown>
}

interface PushResult {
  accepted: Array<{ idempotencyKey: string; newVersion?: number; status: string; noOp?: boolean }>
  conflicts: Array<{ idempotencyKey: string; conflictId: string; cloudVersion: number; status: string }>
  failed: Array<{ idempotencyKey: string; error: string }>
}

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
  const { nodeId, changes } = body as { nodeId?: string; changes?: PushChange[] }

  if (!nodeId) {
    return NextResponse.json({ error: 'nodeId is required' }, { status: 422 })
  }
  if (!Array.isArray(changes)) {
    return NextResponse.json({ error: 'changes must be an array' }, { status: 422 })
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

  const result: PushResult = { accepted: [], conflicts: [], failed: [] }

  for (const change of changes) {
    try {
      // Idempotency: if we've seen this idempotencyKey and it was ACKED,
      // return the cached result without re-applying.
      const existing = await db.syncOutbox.findUnique({
        where: { idempotencyKey: change.idempotencyKey },
      })
      if (existing?.status === 'ACKED') {
        result.accepted.push({
          idempotencyKey: change.idempotencyKey,
          status: 'ACKED',
          noOp: true,
        })
        continue
      }

      // Record the outbox entry (pending)
      await db.syncOutbox.upsert({
        where: { idempotencyKey: change.idempotencyKey },
        update: {
          status: 'SENT',
          sentAt: new Date(),
          attempts: { increment: 1 },
        },
        create: {
          nodeId: node.id,
          organizationId: orgScope.organizationId!,
          entityType: change.entityType,
          entityId: change.entityId,
          operation: change.operation,
          baseVersion: change.baseVersion ?? null,
          entityVersion: change.entityVersion ?? null,
          idempotencyKey: change.idempotencyKey,
          payloadJson: JSON.stringify(change.payload),
          status: 'SENT',
          sentAt: new Date(),
        },
      })

      // Phase 2: actual entity apply + conflict detection.
      // For now: mark as ACKED (no-op apply) so the contract is stable
      // for client development. Phase 2 will replace this with:
      //   - loadScopedEntity(entityType, entityId, orgId)
      //   - if baseVersion == current.version → apply + increment version
      //   - else → create SyncConflict record

      await db.syncOutbox.update({
        where: { idempotencyKey: change.idempotencyKey },
        data: { status: 'ACKED', ackedAt: new Date() },
      })

      result.accepted.push({
        idempotencyKey: change.idempotencyKey,
        status: 'ACKED',
      })
    } catch (err) {
      result.failed.push({
        idempotencyKey: change.idempotencyKey,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  await logAudit(
    'SYNC_PUSH',
    'SyncOutbox',
    node.id,
    `Pushed ${changes.length} changes from node ${node.id}: ${result.accepted.length} accepted, ${result.conflicts.length} conflicts, ${result.failed.length} failed`,
    { accepted: result.accepted.length, conflicts: result.conflicts.length, failed: result.failed.length },
    auth.row.username ?? auth.user.email,
  )

  return NextResponse.json(result)
}
