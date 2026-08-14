// ============================================================
// POST /api/auth/login (Task ID: RBAC-DASHBOARD)
// ============================================================
// Body: { email, password }
// Returns: { user, token }
// - password check ตอนนี้ข้ามไปก่อน (accept any password)
// - sets HttpOnly cookie `itam-session`
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { toAuthUser } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import {
  AUTH_COOKIE,
  SESSION_TTL_MS,
  encodeSession,
  ensureSeedUsers,
} from '@/lib/auth-session'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    await ensureSeedUsers()
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: 'รูปแบบอีเมลไม่ถูกต้อง' },
        { status: 400 },
      )
    }
    // password check skipped for now — accept any password (incl. empty)

    const user = await db.user.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json(
        { error: 'ไม่พบผู้ใช้งานนี้ในระบบ' },
        { status: 404 },
      )
    }
    if (!user.active) {
      return NextResponse.json(
        { error: 'บัญชีนี้ถูกปิดใช้งาน' },
        { status: 403 },
      )
    }

    const now = Date.now()
    const token = encodeSession({
      userId: user.id,
      email: user.email,
      exp: now + SESSION_TTL_MS,
    })

    // update lastLoginAt
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date().toISOString() },
    })

    const authUser = toAuthUser(user)
    await logAudit(
      'LOGIN',
      'User',
      user.id,
      `เข้าสู่ระบบ: ${user.email}`,
      { email: user.email, role: user.role },
    )

    const res = NextResponse.json({ user: authUser, token })
    res.cookies.set(AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_MS / 1000,
    })
    return res
  } catch (err) {
    console.error('POST /api/auth/login', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Login failed' },
      { status: 500 },
    )
  }
}
