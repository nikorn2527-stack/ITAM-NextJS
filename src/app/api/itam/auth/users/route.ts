import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { hashNewPassword, toAuthUser, isAdminRole } from '@/lib/auth'

/**
 * /api/itam/auth/users — admin user-management endpoint (requires ADMIN
 * permission). Supports GET (list), POST (create) and the [id] route supports
 * PUT/DELETE with "last admin" protection.
 */

const ROLE_CHOICES = ['superadmin', 'admin', 'editor', 'meter', 'viewer'] as const

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'USER_MANAGE')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rows = await db.user.findMany({
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
  })
  // Never leak hashes/salts to the client
  return NextResponse.json({ users: rows.map(toAuthUser), count: rows.length })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, 'USER_MANAGE')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const username = String(body.username || '').trim().toLowerCase() || null
  const name = String(body.name || '').trim() || null
  const role = String(body.role || '').trim().toLowerCase()
  const active = body.active !== false
  const allowedSites = String(body.allowedSites || '').trim() || 'ALL'
  const password = String(body.password || '')
  const remark = String(body.remark || '').trim() || null

  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })
  if (!ROLE_CHOICES.includes(role as (typeof ROLE_CHOICES)[number])) {
    return NextResponse.json({ error: `role must be one of: ${ROLE_CHOICES.join(', ')}` }, { status: 400 })
  }

  // Non-superadmin cannot create superadmin
  if (role === 'superadmin' && auth.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'เฉพาะ superadmin เท่านั้นที่สร้าง superadmin ได้' }, { status: 403 })
  }

  // Dup check
  const dup = await db.user.findFirst({
    where: { OR: [{ email }, ...(username ? [{ username }] : [])] },
  })
  if (dup) return NextResponse.json({ error: 'อีเมลหรือชื่อผู้ใช้ซ้ำกับที่มีอยู่' }, { status: 409 })

  let passwordHash: string | null = null
  let passwordSalt: string | null = null
  if (password) {
    const { hash, salt } = hashNewPassword(password)
    passwordHash = hash
    passwordSalt = salt
  }

  const created = await db.user.create({
    data: {
      email,
      role,
      active,
      name,
      username,
      passwordHash,
      passwordSalt,
      remark,
      allowedSites,
    },
  })
  return NextResponse.json({ user: toAuthUser(created) }, { status: 201 })
}

// Helper exported for the [id] route — checks "last admin" protection
export async function assertNotLastAdmin(targetId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const target = await db.user.findUnique({ where: { id: targetId } })
  if (!target) return { ok: false, status: 404, error: 'ไม่พบผู้ใช้' }
  if (!isAdminRole(target.role)) return { ok: true }
  // Count other active admins/superadmins
  const otherAdmins = await db.user.count({
    where: {
      id: { not: targetId },
      active: true,
      OR: [{ role: 'admin' }, { role: 'superadmin' }, { role: 'Admin' }, { role: 'Super Admin' }],
    },
  })
  if (otherAdmins === 0) {
    return {
      ok: false,
      status: 400,
      error: 'ไม่สามารถลบ/ปิดผู้ดูแลคนสุดท้ายได้ — ต้องมี admin หรือ superadmin อย่างน้อย 1 คนในระบบ',
    }
  }
  return { ok: true }
}
