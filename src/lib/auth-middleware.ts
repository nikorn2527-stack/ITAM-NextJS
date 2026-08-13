/**
 * auth-middleware.ts — request-side helper used by every ITAM API route.
 *
 * Usage:
 *   import { requireAuth } from '@/lib/auth-middleware'
 *   export async function GET(req: Request) {
 *     const auth = await requireAuth(req, 'VIEW_DEVICES')
 *     if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
 *     const user = auth.user
 *     ...
 *   }
 *
 * The helper:
 *   1. Extracts the `Authorization: Bearer <jwt>` header.
 *   2. Verifies the JWT (signature + exp + blacklist).
 *   3. Loads the current user row from the DB (so role/allowedSites changes
 *      made by an admin are reflected without re-issuing the token).
 *   4. If `permission` is given, checks `hasPermission(role, permission)`.
 *   5. Returns `{ ok, user }` on success or `{ ok: false, status, error }`.
 */

import { db } from '@/lib/db'
import {
  verifyToken,
  toAuthUser,
  hasPermission,
  type AuthUser,
  type Permission,
  type UserPermissionRow,
} from '@/lib/auth'

export type RequireAuthOk = { ok: true; user: AuthUser; row: UserPermissionRow }
export type RequireAuthErr = { ok: false; status: number; error: string }
export type RequireAuthResult = RequireAuthOk | RequireAuthErr

function extractBearer(req: Request): string | null {
  const h = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!h) return null
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

export async function requireAuth(
  req: Request,
  permission?: Permission,
): Promise<RequireAuthResult> {
  const token = extractBearer(req)
  if (!token) {
    return { ok: false, status: 401, error: 'กรุณาเข้าสู่ระบบ (missing token)' }
  }
  const payload = await verifyToken(token)
  if (!payload) {
    return { ok: false, status: 401, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }
  }
  // Reload user from DB so revocations/role changes take effect immediately
  const row = await db.user.findUnique({ where: { email: payload.email } })
  if (!row || !row.active) {
    return { ok: false, status: 401, error: 'บัญชีถูกปิดใช้งานหรือไม่พบในระบบ' }
  }
  if (permission && !hasPermission(row.role, permission)) {
    return {
      ok: false,
      status: 403,
      error: `ไม่มีสิทธิ์ (${permission}) สำหรับบทบาทนี้`,
    }
  }
  return { ok: true, user: toAuthUser(row), row }
}
