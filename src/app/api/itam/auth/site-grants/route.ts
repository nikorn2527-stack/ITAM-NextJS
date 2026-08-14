/**
 * GET    /api/itam/auth/site-grants          — list grants (filtered by caller scope)
 * POST   /api/itam/auth/site-grants          — create a new grant
 *
 * Task ID: PHASE1-AUTH-FOUNDATION
 *
 * Authorization: requires USER_MANAGE permission.
 * - superadmin can manage all grants
 * - admin can manage grants within their own Site scope (Phase 2 enhancement)
 *
 * Every grant change is audited with actor, target user, previous/new values.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { requireAuth } from '@/lib/auth-middleware'
import { buildAuthorizationContext } from '@/lib/authorization-context'
import { normalizeSiteCode } from '@/lib/site-scope'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'USER_MANAGE')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  try {
    const ctx = await buildAuthorizationContext(
      auth.user,
      auth.row.id,
      auth.row.allowedSites,
    )

    const { searchParams } = new URL(req.url)
    const userIdFilter = searchParams.get('userId')?.trim()
    const siteCodeFilter = searchParams.get('siteCode')?.trim()

    const where: Record<string, unknown> = {}
    if (userIdFilter) where.userId = userIdFilter
    if (siteCodeFilter) {
      const normalized = normalizeSiteCode(siteCodeFilter)
      if (normalized) where.siteCode = normalized
    }

    // Non-superadmin can only see grants for Sites in their scope
    if (!ctx.isSuperAdmin && ctx.siteScope.kind === 'sites') {
      where.siteCode = { in: ctx.siteScope.siteCodes }
    }

    const grants = await db.userSiteGrant.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            active: true,
          },
        },
        role: {
          select: { code: true, name: true },
        },
      },
      orderBy: [{ siteCode: 'asc' }, { user: { email: 'asc' } }],
    })

    return NextResponse.json({ grants })
  } catch (err) {
    console.error('GET /api/itam/auth/site-grants', err)
    return NextResponse.json(
      { error: 'Failed to fetch site grants' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, 'USER_MANAGE')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  try {
    const ctx = await buildAuthorizationContext(
      auth.user,
      auth.row.id,
      auth.row.allowedSites,
    )
    const body = await req.json()

    const userId = String(body.userId ?? '').trim()
    const rawSiteCode = String(body.siteCode ?? '').trim()
    const roleCode = String(body.roleCode ?? 'viewer').trim()
    const validFrom = body.validFrom ? new Date(body.validFrom) : null
    const validUntil = body.validUntil ? new Date(body.validUntil) : null
    const active = body.active !== false

    if (!userId || !rawSiteCode) {
      return NextResponse.json(
        { error: 'กรุณาระบุ userId และ siteCode' },
        { status: 400 },
      )
    }

    const siteCode = normalizeSiteCode(rawSiteCode)
    if (!siteCode) {
      return NextResponse.json(
        { error: 'siteCode ไม่ถูกต้อง' },
        { status: 400 },
      )
    }

    // Validate that the target user exists
    const targetUser = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true },
    })
    if (!targetUser) {
      return NextResponse.json(
        { error: 'ไม่พบผู้ใช้ที่ระบุ' },
        { status: 404 },
      )
    }

    // Validate that the Site exists in the master
    const site = await db.site.findUnique({
      where: { code: siteCode },
      select: { code: true, name: true },
    })
    if (!site) {
      return NextResponse.json(
        { error: `ไม่พบ Site code '${siteCode}' ใน Site master` },
        { status: 400 },
      )
    }

    // Validate that the role exists
    const role = await db.role.findUnique({
      where: { code: roleCode },
      select: { code: true, name: true, active: true },
    })
    if (!role || !role.active) {
      return NextResponse.json(
        { error: `ไม่พบ Role '${roleCode}' หรือ Role ถูกปิดใช้งาน` },
        { status: 400 },
      )
    }

    // Authorization: non-superadmin can only grant access to Sites in their own scope
    if (!ctx.isSuperAdmin && !ctx.canAccessSite(siteCode)) {
      return NextResponse.json(
        { error: `คุณไม่มีสิทธิ์จัดการ grant ของ Site '${siteCode}'` },
        { status: 403 },
      )
    }

    // Check if grant already exists
    const existing = await db.userSiteGrant.findUnique({
      where: {
        userId_siteCode: { userId, siteCode },
      },
    })

    if (existing) {
      // Update existing grant
      const updated = await db.userSiteGrant.update({
        where: { userId_siteCode: { userId, siteCode } },
        data: {
          roleCode,
          active,
          validFrom,
          validUntil,
          createdBy: auth.user.email,
        },
      })
      await logAudit(
        'GRANT_UPDATE',
        'UserSiteGrant',
        `${userId}@${siteCode}`,
        `อัปเดต grant: ${targetUser.email} → ${siteCode} (${roleCode})`,
        {
          userId,
          siteCode,
          roleCode,
          active,
          validFrom: validFrom?.toISOString() ?? null,
          validUntil: validUntil?.toISOString() ?? null,
          previous: {
            roleCode: existing.roleCode,
            active: existing.active,
          },
        },
        auth.user.email,
      )
      return NextResponse.json({ grant: updated })
    }

    // Create new grant
    const created = await db.userSiteGrant.create({
      data: {
        userId,
        siteCode,
        roleCode,
        active,
        validFrom,
        validUntil,
        createdBy: auth.user.email,
      },
    })
    await logAudit(
      'GRANT_CREATE',
      'UserSiteGrant',
      `${userId}@${siteCode}`,
      `สร้าง grant: ${targetUser.email} → ${siteCode} (${roleCode})`,
      {
        userId,
        siteCode,
        roleCode,
        active,
        validFrom: validFrom?.toISOString() ?? null,
        validUntil: validUntil?.toISOString() ?? null,
      },
      auth.user.email,
    )
    return NextResponse.json({ grant: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/itam/auth/site-grants', err)
    const message =
      err instanceof Error ? err.message : 'Failed to create site grant'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
