// ============================================================
// Auth session helpers (Task ID: RBAC-DASHBOARD)
// ============================================================
// Shared between /api/auth/login, /api/auth/me, /api/auth/logout
// - encode/decode base64 session token
// - read HttpOnly cookie
// - resolve AuthUser from DB by token
// - lazily seed default users
// ============================================================

import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { toAuthUser, type AuthUser } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'

export const AUTH_COOKIE = 'itam-session'
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

interface SessionPayload {
  userId: string
  email: string
  exp: number
}

export function encodeSession(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}

export function decodeSession(token: string): SessionPayload | null {
  try {
    const json = Buffer.from(token, 'base64').toString('utf8')
    const parsed = JSON.parse(json) as SessionPayload
    if (
      typeof parsed.userId !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null
    }
    if (parsed.exp < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

export function parseCookie(header: string, name: string): string | null {
  const parts = header.split(';')
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=')
    if (k === name) {
      return decodeURIComponent(rest.join('='))
    }
  }
  return null
}

/** อ่าน user จาก token ใน cookie — คืน null ถ้าไม่มี/หมดอายุ/ไม่ active */
export async function getCurrentUser(
  req: NextRequest,
): Promise<AuthUser | null> {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const token = parseCookie(cookieHeader, AUTH_COOKIE)
  if (!token) return null
  const session = decodeSession(token)
  if (!session) return null
  const user = await db.user.findUnique({ where: { id: session.userId } })
  if (!user || !user.active) return null
  return toAuthUser(user)
}

/** Lazily seed a default admin if no users exist (idempotent). */
export async function ensureSeedUsers() {
  const count = await db.user.count()
  if (count > 0) return
  await db.user.createMany({
    data: [
      {
        email: 'admin@example.com',
        name: 'ผู้ดูแลระบบ',
        role: 'admin',
        active: true,
        allowedSites: 'ALL',
        permissions: JSON.stringify(['*']),
      },
      {
        email: 'manager@example.com',
        name: 'ผู้จัดการ',
        role: 'manager',
        active: true,
        allowedSites: 'ALL',
      },
      {
        email: 'staff@example.com',
        name: 'ช่างเทคนิค',
        role: 'staff',
        active: true,
        allowedSites: 'ALL',
      },
      {
        email: 'coordinator@example.com',
        name: 'ผู้ประสานงาน',
        role: 'coordinator',
        active: true,
        allowedSites: 'ALL',
      },
      {
        email: 'viewer@example.com',
        name: 'ผู้ดู',
        role: 'viewer',
        active: true,
        allowedSites: 'ALL',
      },
    ],
  })
  await logAudit(
    'SEED',
    'User',
    null,
    'เพิ่มผู้ใช้ตัวอย่าง 5 รายการ (admin/manager/staff/coordinator/viewer)',
    { count: 5 },
  )
}

export type { SessionPayload }
