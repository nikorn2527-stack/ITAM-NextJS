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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
    }

    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase() : existing.email
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: 'รูปแบบอีเมลไม่ถูกต้อง' },
        { status: 400 },
      )
    }
    if (email !== existing.email) {
      const dup = await db.user.findUnique({ where: { email } })
      if (dup) {
        return NextResponse.json(
          { error: 'อีเมลนี้มีอยู่ในระบบแล้ว' },
          { status: 409 },
        )
      }
    }

    const role = parseRole(body.role) ?? (existing.role as Role)
    const name =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : existing.name
    const active =
      typeof body.active === 'boolean' ? body.active : existing.active

    // Prevent demoting the last active admin to a non-admin role
    if (
      existing.role === 'admin' &&
      role !== 'admin' &&
      existing.active === true
    ) {
      const adminCount = await db.user.count({
        where: { role: 'admin', active: true },
      })
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'ไม่สามารถเปลี่ยนบทบาทของผู้ดูแลคนสุดท้ายได้' },
          { status: 400 },
        )
      }
    }

    // Prevent deactivating the last active admin
    if (existing.role === 'admin' && existing.active === true && active === false) {
      const adminCount = await db.user.count({
        where: { role: 'admin', active: true },
      })
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'ไม่สามารถปิดการใช้งานผู้ดูแลคนสุดท้ายได้' },
          { status: 400 },
        )
      }
    }

    const updated = await db.user.update({
      where: { id },
      data: { email, name, role, active },
    })
    await logAudit(
      'UPDATE',
      'User',
      updated.id,
      `แก้ไขผู้ใช้ ${updated.email} (${updated.role})`,
      {
        before: {
          email: existing.email,
          name: existing.name,
          role: existing.role,
          active: existing.active,
        },
        after: {
          email: updated.email,
          name: updated.name,
          role: updated.role,
          active: updated.active,
        },
      },
    )
    return NextResponse.json({ user: updated })
  } catch (err) {
    console.error('PUT /api/users/[id]', err)
    const message = err instanceof Error ? err.message : 'Failed to update user'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'ไม่พบผู้ใช้' }, { status: 404 })
    }

    // Prevent deleting the last admin
    if (existing.role === 'admin' && existing.active === true) {
      const adminCount = await db.user.count({
        where: { role: 'admin', active: true },
      })
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'ไม่สามารถลบผู้ดูแลคนสุดท้ายได้' },
          { status: 400 },
        )
      }
    }

    await db.user.delete({ where: { id } })
    await logAudit(
      'DELETE',
      'User',
      existing.id,
      `ลบผู้ใช้ ${existing.email} (${existing.role})`,
      {
        email: existing.email,
        name: existing.name,
        role: existing.role,
        active: existing.active,
      },
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/users/[id]', err)
    const message = err instanceof Error ? err.message : 'Failed to delete user'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
