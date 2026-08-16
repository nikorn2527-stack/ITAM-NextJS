// ============================================================
// POST /api/sync/run — Apply previewed changes
// ============================================================
// Loads preview SyncRun + items, applies each in serializable transaction.
// Conditional versioned create/update (NOT Prisma upsert).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { buildAuthorizationContext } from '@/lib/authorization-context'
import { withSerializableRetryTracked } from '@/lib/retry-transaction'
import { redacted } from '@/lib/sync-adapter'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  // 1. Auth
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const user = auth.user

  // 2. Parse request
  let body: { previewRunId?: string; itemIds?: string[] | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.previewRunId) {
    return NextResponse.json({ error: 'previewRunId required' }, { status: 400 })
  }

  // 3. Load preview run
  const previewRun = await db.syncRun.findUnique({
    where: { id: body.previewRunId },
    include: { items: true },
  })

  if (!previewRun) {
    return NextResponse.json({ error: 'Preview run not found' }, { status: 404 })
  }

  if (previewRun.mode !== 'preview') {
    return NextResponse.json({ error: 'Not a preview run' }, { status: 400 })
  }

  if (previewRun.status !== 'completed') {
    return NextResponse.json({ error: 'Preview run not completed' }, { status: 400 })
  }

  // 4. Filter items to apply
  const itemsToApply = body.itemIds
    ? previewRun.items.filter((item) => body.itemIds!.includes(item.id))
    : previewRun.items.filter((item) => item.status === 'pending')

  if (itemsToApply.length === 0) {
    return NextResponse.json({ error: 'No pending items to apply' }, { status: 400 })
  }

  // 5. Create apply SyncRun
  const applyRun = await db.syncRun.create({
    data: {
      source: previewRun.source,
      target: previewRun.target,
      mode: 'apply',
      status: 'running',
      triggeredBy: user.email,
      siteScope: previewRun.siteScope,
      retryOf: null,
    },
  })

  let totalAttempts = 0
  let totalP2034 = 0
  let createRows = 0
  let updateRows = 0
  let errorRows = 0
  let appliedCount = 0

  // 6. Apply each item in separate transaction
  for (const item of itemsToApply) {
    try {
      const { result, attempts, p2034Count } = await withSerializableRetryTracked(
        async (tx) => {
          // Re-check externalKey in transaction (race protection)
          const existing = await tx.workOrder.findUnique({
            where: { requestId: item.externalKey },
            select: { id: true, version: true },
          })

          // Conflict detection with preview baseline
          if (item.expectedExists && !existing) {
            throw new Error('CONFLICT: record deleted after preview — re-run preview')
          }
          if (!item.expectedExists && existing) {
            throw new Error('CONFLICT: record created by another source after preview — re-run preview')
          }

          // Parse after data
          const afterData = item.after as Record<string, unknown> | null
          if (!afterData) {
            throw new Error('No after data to apply')
          }

          // Remove metadata fields from apply data
          const { id: _id, createdAt: _ca, updatedAt: _ua, version: _v, ...patch } = afterData as Record<string, unknown>

          let targetWorkOrderId: string

          if (existing) {
            // Conditional update with version check
            if (item.expectedVersion != null && existing.version !== item.expectedVersion) {
              throw new Error(
                `CONFLICT: version ${existing.version} ≠ preview baseline ${item.expectedVersion}`,
              )
            }

            const updated = await tx.workOrder.update({
              where: { id: existing.id, version: existing.version },
              data: { ...patch, version: { increment: 1 } },
            })
            targetWorkOrderId = updated.id
          } else {
            // Create
            const created = await tx.workOrder.create({
              data: { ...patch, requestId: item.externalKey },
            })
            targetWorkOrderId = created.id
          }

          // Audit log (in same transaction — atomic)
          // AuditLog.detail is String? — must JSON.stringify()
          const auditDetail = {
            before: redacted(item.before as Record<string, unknown>),
            after: redacted(afterData),
            syncRunId: applyRun.id,
            externalKey: item.externalKey,
          }

          await tx.auditLog.create({
            data: {
              action: 'SYNC_APPLY',
              entity: 'WorkOrder',
              entityId: targetWorkOrderId,
              summary: `Sync ${item.action} from ${previewRun.source} (key=${item.externalKey})`,
              detail: JSON.stringify(auditDetail),
              actor: user.email,
              siteCode: (afterData.siteCode as string) || (afterData.site as string) || null,
            },
          })

          // Update SyncRunItem in same transaction
          await tx.syncRunItem.update({
            where: { id: item.id },
            data: {
              status: 'applied',
              entityId: targetWorkOrderId,
              entityType: 'WorkOrder',
              processedAt: new Date(),
            },
          })

          return { targetWorkOrderId }
        },
      )

      totalAttempts += attempts
      totalP2034 += p2034Count

      if (item.action === 'create') createRows++
      else updateRows++

      appliedCount++
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)

      // Update item as error
      await db.syncRunItem.update({
        where: { id: item.id },
        data: {
          status: 'error',
          errorMessage,
          processedAt: new Date(),
        },
      })

      errorRows++
    }
  }

  // 7. Update SyncRun with final stats
  const completedAt = new Date()
  await db.syncRun.update({
    where: { id: applyRun.id },
    data: {
      status: 'completed',
      totalRows: itemsToApply.length,
      createRows,
      updateRows,
      errorRows,
      completedAt,
      durationMs: completedAt.getTime() - applyRun.startedAt.getTime(),
      attempts: totalAttempts,
      p2034Count: totalP2034,
    },
  })

  // 8. Audit log for the run
  await logAudit({
    action: 'SYNC_APPLY',
    entity: 'SyncRun',
    entityId: applyRun.id,
    summary: `Applied sync from ${previewRun.source} — ${appliedCount} applied, ${errorRows} errors`,
    actor: user.email,
    siteCode: previewRun.siteScope,
  })

  return NextResponse.json({
    syncRun: {
      id: applyRun.id,
      mode: 'apply',
      status: 'completed',
      totalRows: itemsToApply.length,
      createRows,
      updateRows,
      errorRows,
      durationMs: completedAt.getTime() - applyRun.startedAt.getTime(),
    },
  })
}
