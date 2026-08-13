import { db } from '@/lib/db'

/**
 * Records an audit log entry. Non-fatal — any DB error is swallowed so
 * the calling mutation still succeeds. All summaries should be in Thai.
 *
 * AuditLog table columns (PostgreSQL camelCase):
 *   id, action, entity, entityId, summary, detail, actor, createdAt
 *
 * `createdAt` has a DB default (`now()`) so we don't set it manually.
 * `actor` defaults to 'system' when no user is supplied.
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
    await db.auditLog.create({
      data: {
        action,
        entity,
        entityId: entityId ?? null,
        summary,
        detail: detail ? JSON.stringify(detail) : null,
        actor: user ?? 'system',
      },
    })
  } catch (err) {
    // Audit logging must never break the user's mutation.
    console.error('logAudit failed:', err)
  }
}
