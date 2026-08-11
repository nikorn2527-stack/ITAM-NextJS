import { db } from '@/lib/db'

/**
 * Records an audit log entry. Non-fatal — any DB error is swallowed so
 * the calling mutation still succeeds. All summaries should be in Thai.
 */
export async function logAudit(
  action: string,
  entity: string,
  entityId: string | null,
  summary: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        summary,
        detail: detail ? JSON.stringify(detail) : null,
      },
    })
  } catch (err) {
    // Audit logging must never break the user's mutation.
    console.error('logAudit failed:', err)
  }
}
