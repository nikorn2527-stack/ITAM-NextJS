import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  verifyPassword,
  createToken,
  toAuthUser,
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginRateLimit,
  RATE_LIMIT_MAX_ATTEMPTS,
} from '@/lib/auth'

interface LoginBody {
  username?: string
  email?: string
  password?: string
}

function clientKey(req: NextRequest, login: string): string {
  // Combine login + IP so a single IP can't lock out every account, and a
  // single account can't be attacked from many IPs without each IP hitting
  // its own bucket.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  return `${login}@${ip}`
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as LoginBody
    const loginRaw = (body.username || body.email || '').trim().toLowerCase()
    const password = body.password || ''

    if (!loginRaw || !password) {
      return NextResponse.json(
        { error: 'กรุณาระบุชื่อผู้ใช้และรหัสผ่าน' },
        { status: 400 },
      )
    }

    // ── Rate limit check ───────────────────────────────────────────
    const key = clientKey(req, loginRaw)
    const rl = checkLoginRateLimit(key)
    if (!rl.allowed) {
      const minutes = Math.ceil(rl.retryAfterMs / 60_000)
      return NextResponse.json(
        {
          error: `พยายามเข้าระบบผิดเกิน ${RATE_LIMIT_MAX_ATTEMPTS} ครั้ง กรุณารอ ${minutes} นาทีแล้วลองใหม่`,
          locked: true,
          retryAfterMs: rl.retryAfterMs,
        },
        { status: 429 },
      )
    }

    // ── Find user by username OR email ─────────────────────────────
    const row = await db.userPermission.findFirst({
      where: {
        OR: [{ username: loginRaw }, { email: loginRaw }],
      },
    })
    console.log("[DEBUG LOGIN] user found:", row?.username, "active:", row?.active, "hash:", row?.passwordHash?.substring(0,8), "salt:", row?.passwordSalt?.substring(0,8)); console.log("[DEBUG LOGIN] verify:", verifyPassword(password, row?.passwordHash, row?.passwordSalt)); if (!row || !row.active || !row.passwordHash || !row.passwordSalt) {
      recordLoginFailure(key)
      return NextResponse.json(
        { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
        { status: 401 },
      )
    }

    // ── Verify password (PBKDF2-like SHA-256, GAS-compatible) ─────
    const ok = verifyPassword(password, row.passwordHash, row.passwordSalt)
    if (!ok) {
      const r = recordLoginFailure(key)
      if (r.locked) {
        return NextResponse.json(
          {
            error: `พยายามเข้าระบบผิดเกิน ${RATE_LIMIT_MAX_ATTEMPTS} ครั้ง กรุณารอ 5 นาทีแล้วลองใหม่`,
            locked: true,
            retryAfterMs: r.retryAfterMs,
          },
          { status: 429 },
        )
      }
      return NextResponse.json(
        { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' },
        { status: 401 },
      )
    }

    // ── Success: clear rate-limit, update LastLoginAt, issue JWT ──
    clearLoginRateLimit(key)
    await db.userPermission.update({
      where: { id: row.id },
      data: { lastLoginAt: new Date().toISOString() },
    })

    const token = await createToken({
      email: row.email,
      role: row.role,
      name: row.name,
      username: row.username,
      allowedSites: row.allowedSites,
    })
    const user = toAuthUser(row)

    // Audit log (best-effort)
    try {
      await db.auditLog.create({
        data: {
          timestamp: new Date().toISOString(),
          action: 'LOGIN',
          user: row.email,
          details: JSON.stringify({ method: 'password', username: row.username }),
        },
      })
    } catch {
      /* audit failures must not break login */
    }

    return NextResponse.json({ token, user })
  } catch (err) {
    console.error('POST /api/itam/auth/login', err)
    return NextResponse.json({ error: 'Internal server error', detail: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
