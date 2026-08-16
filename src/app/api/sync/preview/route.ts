// ============================================================
// POST /api/sync/preview — Preview changes (read-only)
// ============================================================
// Server-side pull from Apps Script → compute diff → store in SyncRun/SyncRunItem
// Does NOT write to WorkOrder/Device/StockItem tables.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { buildAuthorizationContext } from '@/lib/authorization-context'
import { fetchFromAppsScript, computePreviewItems, redacted } from '@/lib/sync-adapter'
import { logAudit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  // 1. Auth — use ADMIN (not SYNC_RUN, B4 frozen rule)
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const user = auth.user

  // 2. Build authorization context
  const ctx = await buildAuthorizationContext(user, auth.row.id, auth.row.allowedSites)

  // 3. Parse request
  let body: { source?: string; target?: string; options?: { since?: string; siteFilter?: string; limit?: number } }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const source = body.source || 'services'
  const target = body.target || 'work-order'
  const options = body.options || {}

  // 4. Site scope for non-superadmin
  let siteScope: string[] | undefined
  if (user.role !== 'superadmin' && ctx.siteScope?.siteCodes) {
    siteScope = ctx.siteScope.siteCodes
  }

  // 5. Check siteFilter authorization
  if (options.siteFilter) {
    if (!ctx.canAtSite(options.siteFilter, 'ADMIN')) {
      return NextResponse.json(
        { error: `No permission to sync site: ${options.siteFilter}` },
        { status: 403 },
      )
    }
  }

  // 6. Create SyncRun (mode=preview, status=running)
  const syncRun = await db.syncRun.create({
    data: {
      source,
      target,
      mode: 'preview',
      status: 'running',
      triggeredBy: user.email,
      siteScope: options.siteFilter || (siteScope ? siteScope.join(',') : null),
    },
  })

  try {
    // 7. Fetch from source (server-side)
    const result = await fetchFromAppsScript({
      source,
      since: options.since,
      siteFilter: options.siteFilter,
      limit: options.limit || 500,
    })

    // 8. Compute preview items (read-only — no business table writes)
    const previewItems = await computePreviewItems(
      result.records,
      db as unknown as Parameters<typeof computePreviewItems>[1],
      siteScope,
    )

    // 9. Count stats
    let createRows = 0
    let updateRows = 0
    let skipRows = 0
    let errorRows = 0

    for (const item of previewItems) {
      if (item.action === 'create') createRows++
      else if (item.action === 'update') updateRows++
      else if (item.action === 'skip') skipRows++
      else if (item.action === 'error') errorRows++
    }

    // 10. Create SyncRunItems
    await db.syncRunItem.createMany({
      data: previewItems.map((item) => ({
        syncRunId: syncRun.id,
        externalKey: item.externalKey,
        action: item.action,
        before: item.before ? JSON.parse(JSON.stringify(item.before)) : null,
        after: item.after ? JSON.parse(JSON.stringify(item.after)) : null,
        expectedVersion: item.expectedVersion,
        expectedExists: item.expectedExists,
        status: item.action === 'error' ? 'error' : 'pending',
        errorMessage: item.errorMessage || null,
      })),
    })

    // 11. Update SyncRun with stats
    const completedAt = new Date()
    await db.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: 'completed',
        totalRows: previewItems.length,
        createRows,
        updateRows,
        skipRows,
        errorRows,
        completedAt,
        durationMs: completedAt.getTime() - syncRun.startedAt.getTime(),
        sourceCursor: result.metadata.cursor,
      },
    })

    // 12. Audit log
    await logAudit({
      action: 'SYNC_PREVIEW',
      entity: 'SyncRun',
      entityId: syncRun.id,
      summary: `Preview sync from ${source} — ${previewItems.length} rows (${createRows} create, ${updateRows} update, ${skipRows} skip, ${errorRows} error)`,
      actor: user.email,
      siteCode: options.siteFilter || null,
    })

    // 13. Return result
    const items = await db.syncRunItem.findMany({
      where: { syncRunId: syncRun.id },
      orderBy: { id: 'asc' },
    })

    return NextResponse.json({
      syncRun: {
        id: syncRun.id,
        mode: 'preview',
        status: 'completed',
        totalRows: previewItems.length,
        createRows,
        updateRows,
        skipRows,
        errorRows,
        durationMs: completedAt.getTime() - syncRun.startedAt.getTime(),
      },
      items: items.map((item) => ({
        id: item.id,
        externalKey: item.externalKey,
        action: item.action,
        status: item.status,
        before: item.before,
        after: item.after,
        errorMessage: item.errorMessage,
      })),
      sourceMetadata: {
        totalFetched: result.metadata.totalFetched,
        unmappedColumns: result.metadata.unmappedColumns,
      },
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    await db.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
      },
    })

    return NextResponse.json(
      { error: errorMessage, syncRunId: syncRun.id },
      { status: 500 },
    )
  }
}
