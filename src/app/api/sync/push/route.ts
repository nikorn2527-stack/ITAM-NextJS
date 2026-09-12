import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { getOrgScope } from '@/lib/org-scope'
import { logAudit } from '@/lib/audit'
import { detectConflict, type SyncableEntity, type ApplyResult } from '@/lib/sync-conflict-policy'

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

      // P1-03: use Central Conflict Policy service to detect conflicts.
      // For now we still don't apply entity changes (Phase 2 will wire the
      // actual entity update), but we DO call detectConflict() so the
      // conflict policy is exercised and SyncConflict records are created
      // when appropriate. This lets us test the conflict flow end-to-end
      // before the full entity-apply logic lands.

      // Load current cloud state of the entity (if it exists).
      // Phase 2: replace with a generic loadScopedEntity() helper.
      let cloudPayload: Record<string, unknown> = {}
      let cloudVersion = 0
      let entityExists = false
      try {
        // Try to load from the entity table (best-effort — Phase 2 will
        // make this a proper generic lookup).
        if (change.entityType === 'Device') {
          const d = await db.device.findFirst({
            where: { id: change.entityId, organizationId: orgScope.organizationId },
          })
          if (d) {
            cloudPayload = d as unknown as Record<string, unknown>
            cloudVersion = (d as { version?: number }).version ?? 1
            entityExists = true
          }
        }
        // Phase 2: add WorkOrder, StockTransaction, MasterItem, etc.
      } catch {
        // Entity lookup failed — treat as not-found (CREATE scenario)
      }

      const applyResult: ApplyResult = detectConflict(
        change.entityType as SyncableEntity,
        change.operation,
        change.baseVersion,
        cloudVersion,
        cloudPayload,
        change.payload,
      )

      if (applyResult.status === 'REJECTED') {
        // Entity policy rejected the push (e.g. append-only UPDATE)
        await db.syncOutbox.update({
          where: { idempotencyKey: change.idempotencyKey },
          data: { status: 'FAILED', lastError: applyResult.reason },
        })
        result.failed.push({
          idempotencyKey: change.idempotencyKey,
          error: applyResult.reason,
        })
        continue
      }

      if (applyResult.status === 'CONFLICT') {
        // Create SyncConflict record for manual resolution
        const conflict = await db.syncConflict.create({
          data: {
            organizationId: orgScope.organizationId!,
            nodeId: node.id,
            entityType: change.entityType,
            entityId: change.entityId,
            baseVersion: change.baseVersion ?? null,
            cloudVersion,
            offlineVersion: change.entityVersion ?? cloudVersion + 1,
            cloudPayload: JSON.stringify(applyResult.cloudPayload),
            offlinePayload: JSON.stringify(applyResult.offlinePayload),
            conflictFields: JSON.stringify(applyResult.conflictFields),
            status: 'OPEN',
          },
        })
        await db.syncOutbox.update({
          where: { idempotencyKey: change.idempotencyKey },
          data: { status: 'CONFLICT', lastError: `Conflict ${conflict.id}` },
        })
        result.conflicts.push({
          idempotencyKey: change.idempotencyKey,
          conflictId: conflict.id,
          cloudVersion,
          status: 'CONFLICT',
        })
        continue
      }

      // ACKED — either no-op (cloud already has the change) or applied.
      // Phase 2 will actually apply the entity update here for non-noOp cases.
      await db.syncOutbox.update({
        where: { idempotencyKey: change.idempotencyKey },
        data: {
          status: 'ACKED',
          ackedAt: new Date(),
        },
      })

      result.accepted.push({
        idempotencyKey: change.idempotencyKey,
        newVersion: applyResult.newVersion,
        status: 'ACKED',
        noOp: applyResult.noOp,
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
