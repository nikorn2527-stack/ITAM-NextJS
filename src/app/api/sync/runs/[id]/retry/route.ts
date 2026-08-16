// ============================================================
// POST /api/sync/runs/[id]/retry — Retry error items
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { withSerializableRetryTracked } from '@/lib/retry-transaction'
import { redacted } from '@/lib/sync-adapter'
import { logAudit } from '@/lib/audit'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const user = auth.user
  const { id } = await params

  // Load original run
  const originalRun = await db.syncRun.findUnique({
    where: { id },
    include: { items: true },
  })

  if (!originalRun) {
    return NextResponse.json({ error: 'SyncRun not found' }, { status: 404 })
  }

  // Filter error items
  const errorItems = originalRun.items.filter((item) => item.status === 'error')

  if (errorItems.length === 0) {
    return NextResponse.json({ error: 'No error items to retry' }, { status: 400 })
  }

  // Create retry run
  const retryRun = await db.syncRun.create({
    data: {
      source: originalRun.source,
      target: originalRun.target,
      mode: 'apply',
      status: 'running',
      triggeredBy: user.email,
      siteScope: originalRun.siteScope,
      retryOf: originalRun.id,
    },
  })

  let appliedCount = 0
  let errorCount = 0

  for (const item of errorItems) {
    try {
      await withSerializableRetryTracked(async (tx) => {
        const existing = await tx.workOrder.findUnique({
          where: { requestId: item.externalKey },
          select: { id: true, version: true },
        })

        const afterData = item.after as Record<string, unknown> | null
        if (!afterData) throw new Error('No after data')

        const { id: _id, createdAt: _ca, updatedAt: _ua, version: _v, ...patch } = afterData as Record<string, unknown>

        let targetWorkOrderId: string

        if (existing) {
          const updated = await tx.workOrder.update({
            where: { id: existing.id, version: existing.version },
            data: { ...patch, version: { increment: 1 } },
          })
          targetWorkOrderId = updated.id
        } else {
          const created = await tx.workOrder.create({
            data: { ...patch, requestId: item.externalKey },
          })
          targetWorkOrderId = created.id
        }

        await tx.auditLog.create({
          data: {
            action: 'SYNC_APPLY',
            entity: 'WorkOrder',
            entityId: targetWorkOrderId,
            summary: `Sync retry from ${originalRun.source} (key=${item.externalKey})`,
            detail: JSON.stringify({
              before: redacted(item.before as Record<string, unknown>),
              after: redacted(afterData),
              syncRunId: retryRun.id,
              externalKey: item.externalKey,
              retryOf: originalRun.id,
            }),
            actor: user.email,
            siteCode: (afterData.siteCode as string) || (afterData.site as string) || null,
          },
        })

        // Create new SyncRunItem for retry
        await db.syncRunItem.create({
          data: {
            syncRunId: retryRun.id,
            externalKey: item.externalKey,
            action: item.action,
            before: item.before,
            after: item.after,
            expectedVersion: item.expectedVersion,
            expectedExists: item.expectedExists,
            status: 'applied',
            entityId: targetWorkOrderId,
            entityType: 'WorkOrder',
            processedAt: new Date(),
          },
        })

        appliedCount++
      })
    } catch (err) {
      await db.syncRunItem.create({
        data: {
          syncRunId: retryRun.id,
          externalKey: item.externalKey,
          action: item.action,
          before: item.before,
          after: item.after,
          status: 'error',
          errorMessage: err instanceof Error ? err.message : String(err),
          processedAt: new Date(),
        },
      })
      errorCount++
    }
  }

  // Update retry run
  await db.syncRun.update({
    where: { id: retryRun.id },
    data: {
      status: 'completed',
      totalRows: errorItems.length,
      createRows: 0,
      updateRows: appliedCount,
      errorRows: errorCount,
      completedAt: new Date(),
    },
  })

  await logAudit({
    action: 'SYNC_APPLY',
    entity: 'SyncRun',
    entityId: retryRun.id,
    summary: `Retry sync from ${originalRun.source} — ${appliedCount} applied, ${errorCount} errors`,
    actor: user.email,
  })

  return NextResponse.json({
    syncRun: {
      id: retryRun.id,
      mode: 'apply',
      status: 'completed',
      retryOf: originalRun.id,
      totalRows: errorItems.length,
      updateRows: appliedCount,
      errorRows: errorCount,
    },
  })
}
