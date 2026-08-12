import { db } from '@/lib/db'

/**
 * Records an audit log entry. Non-fatal — any DB error is swallowed so
 * the calling mutation still succeeds. All summaries should be in Thai.
 *
 * The active AuditLog model stores actor, detail, entity and summary as
 * first-class fields. The detail JSON keeps any additional metadata.
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
        action,
        entity,
        entityId,
        summary,
        actor: user ?? 'system',
        detail: JSON.stringify(combined),
      },
    })
  } catch (err) {
    // Audit logging must never break the user's mutation.
    console.error('logAudit failed:', err)
  }
}
