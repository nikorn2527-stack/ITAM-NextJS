import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { logAudit } from '@/lib/audit'

/**
 * Generic audit-log endpoint for client-side actions that don't mutate DB
 * records (e.g. printing stickers). Server-side mutations should call
 * `logAudit()` directly from their route handlers instead.
 *
 * SECURITY: requires authentication to prevent attackers from spamming /
 * forging audit log entries via anonymous POST.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DASHBOARD')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  try {
    const body = await req.json()
    const { action, entity, entityId, summary, detail } = body as {
      action?: string
      entity?: string
      entityId?: string | null
      summary?: string
      detail?: Record<string, unknown> | null
    }

    if (!action || !entity || !summary) {
      return NextResponse.json(
        { error: 'Missing required fields: action, entity, summary' },
        { status: 400 },
      )
    }

    await logAudit(
      String(action),
      String(entity),
      entityId ? String(entityId) : null,
      String(summary),
      detail ?? undefined,
      auth.user.email, // FIX-026: actor
    )

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('POST /api/audit/log', err)
    return NextResponse.json(
      { error: 'Failed to log audit' },
      { status: 500 },
    )
  }
}
