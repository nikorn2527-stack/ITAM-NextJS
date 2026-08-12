import { db } from '@/lib/db'

/**
 * Records an audit log entry. Non-fatal — any DB error is swallowed so
 * the calling mutation still succeeds. All summaries should be in Thai.
 *
 * NOTE: The AuditLog table only has columns {action, user, details, timestamp}.
 * The legacy `entity`/`entityId`/`summary` parameters are preserved for
 * backwards-compatibility with the existing call sites but are merged into
 * the `details` JSON column (so the information is not lost).
 */
export async function logAudit(
  action: string,
  entity: string,
  entityId: string | null,
  summary: string,
  detail?: Record<string, unknown>,
  user?: string | null,
): Promise<void> {
  try {
    const combined: Record<string, unknown> = {
      ...(detail ?? {}),
      entity,
      entityId,
      summary,
    }
    await db.auditLog.create({
      data: {
        timestamp: new Date().toISOString(),
        action,
        user: user ?? null,
        details: JSON.stringify(combined),
      },
    })
  } catch (err) {
    // Audit logging must never break the user's mutation.
    console.error('logAudit failed:', err)
  }
}
