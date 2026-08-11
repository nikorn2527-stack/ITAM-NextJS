import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

const VALID_ROLES = ['admin', 'editor', 'viewer'] as const
type Role = (typeof VALID_ROLES)[number]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseRole(v: unknown): Role | null {
  if (typeof v !== 'string') return null
  return VALID_ROLES.includes(v as Role) ? (v as Role) : null
}

/** Lazily seed demo users when none exist (idempotent). */
async function ensureSeedUsers() {
  const count = await db.user.count()
  if (count > 0) return
  await db.user.createMany({
    data: [
      { email: 'admin@example.com', name: 'ผู้ดูแลระบบ', role: 'admin', active: true },
      { email: 'editor@example.com', name: 'ผู้แก้ไข', role: 'editor', active: true },
      { email: 'viewer@example.com', name: 'ผู้ดู', role: 'viewer', active: true },
    ],
  })
  await logAudit(
    'SEED',
    'User',
    null,
    'เพิ่มผู้ใช้ตัวอย่าง 3 รายการ (admin / editor / viewer)',
    { count: 3 },
  )
}

export async function GET() {
  try {
    await ensureSeedUsers()
    const users = await db.user.findMany({
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ users })
  } catch (err) {
    console.error('GET /api/users', err)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeedUsers()
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: 'รูปแบบอีเมลไม่ถูกต้อง' },
        { status: 400 },
      )
    }
    const role = parseRole(body.role)
    if (!role) {
      return NextResponse.json(
        { error: 'บทบาทต้องเป็น admin / editor / viewer' },
        { status: 400 },
      )
    }
    const name =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : null
    const active = body.active === false ? false : true

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json(
        { error: 'อีเมลนี้มีอยู่ในระบบแล้ว' },
        { status: 409 },
      )
    }

    const created = await db.user.create({
      data: { email, name, role, active },
    })
    await logAudit(
      'CREATE',
      'User',
      created.id,
      `เพิ่มผู้ใช้ ${created.email} (${created.role})`,
      { email: created.email, name: created.name, role: created.role, active: created.active },
    )
    return NextResponse.json({ user: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/users', err)
    const message = err instanceof Error ? err.message : 'Failed to create user'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
