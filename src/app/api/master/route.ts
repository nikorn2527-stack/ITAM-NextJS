/**
 * /api/master — unified master-data API.
 *
 * GET (cascading lookups via `?type=…`):
 *   ?type=device-types
 *   ?type=brands&typeId=X
 *   ?type=models&brandId=X
 *   ?type=buildings&site=UDH                       (site-scoped)
 *   ?type=floors&site=UDH&building=X              (site-scoped)
 *   ?type=departments&site=UDH&building=X&floor=Y (site-scoped)
 *   ?type=locations&site=UDH                       (site-scoped)
 *   ?type=device-groups                           (global)
 *   ?type=statuses                                (global)
 *
 * GET (legacy MasterItem lookup via `?category=…`):
 *   ?category=Brand|Type|Model|Department|Status|DeviceGroup|Site|Building|Floor
 *   → returns { items: MasterItem[] }
 *
 * GET (no params) → returns all MasterItem rows (legacy).
 *
 * POST (legacy — used by MasterDataModal): create a MasterItem row.
 *
 * Authentication: requireAuth (Bearer token).
 * Site scoping:
 *   - device-types, brands, models, device-groups, statuses → NOT scoped (global).
 *   - buildings, floors, departments, locations → scoped to user's allowedSites
 *     unless the explicit `site` query param is set (then validated against scope).
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { logAudit } from '@/lib/audit'
import { parseAllowedSites, normalizeSiteCode } from '@/lib/site-scope'

// ─────────────────────────────────────────────────────────────
// GET handler
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DEVICES')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  try {
    const { searchParams } = new URL(req.url)
    const type = (searchParams.get('type') ?? '').trim()
    const category = (searchParams.get('category') ?? '').trim()
    const site = normalizeSiteCode(searchParams.get('site'))
    const typeId = (searchParams.get('typeId') ?? '').trim() || null
    const brandId = (searchParams.get('brandId') ?? '').trim() || null
    const building = (searchParams.get('building') ?? '').trim() || null
    const floor = (searchParams.get('floor') ?? '').trim() || null

    // ── Legacy path: `?category=…` or no `type` ──
    // Returns all MasterItem rows matching the optional category filter.
    if (!type) {
      const where: Record<string, unknown> = {}
      if (category) where.category = category
      const items = await db.masterItem.findMany({
        where,
        orderBy: [{ category: 'asc' }, { code: 'asc' }],
      })
      return NextResponse.json({ items })
    }

    // ── Compute the user's site scope (for site-scoped queries) ──
    const parsed = parseAllowedSites(auth.user.allowedSites)
    const isAllSites = parsed.isAll

    /** Resolve the effective site code: explicit `?site=` wins, but must be
     *  inside the user's scope (unless superadmin/ALL). */
    function resolveSite(): string | null {
      if (site) {
        if (!isAllSites && !parsed.codes.includes(site)) {
          return '__FORBIDDEN__' // signal 403
        }
        return site
      }
      // No explicit site param → return null (caller decides what to do)
      return null
    }

    switch (type) {
      case 'device-types': {
        // Pull distinct DeviceType values from DeviceClassification MasterItem rows.
        // MasterItem.category='DeviceClassification' has parentRef="Brand|DeviceType".
        // We extract the DeviceType part (after |) and dedupe.
        const rows = await db.masterItem.findMany({
          where: { category: 'DeviceClassification', active: true },
          select: { parentRef: true },
        })
        const types = new Set<string>()
        for (const r of rows) {
          if (r.parentRef) {
            const parts = r.parentRef.split('|')
            if (parts.length >= 2 && parts[1]) types.add(parts[1])
          }
        }
        const items = Array.from(types).sort().map((name) => ({ name, active: true }))
        return NextResponse.json({ items, type })
      }

      case 'brands': {
        // Pull distinct Brand values from DeviceClassification MasterItem rows.
        // Optional typeId filter is the DeviceType name (extracted from parentRef).
        const where: Record<string, unknown> = { category: 'DeviceClassification', active: true }
        const rows = await db.masterItem.findMany({
          where: where as any,
          select: { parentRef: true, displayLabel: true },
        })
        const brandSet = new Set<string>()
        for (const r of rows) {
          if (r.parentRef) {
            const parts = r.parentRef.split('|')
            const brand = parts[0]
            const devType = parts.length >= 2 ? parts[1] : ''
            // If typeId filter provided, only include brands matching that DeviceType
            if (!typeId || devType === typeId) {
              if (brand) brandSet.add(brand)
            }
          }
        }
        const items = Array.from(brandSet).sort().map((name) => ({ name, active: true }))
        return NextResponse.json({ items, type })
      }

      case 'models': {
        // Pull Model values from DeviceClassification MasterItem rows.
        // Optional brandId filter is the Brand name.
        const where: Record<string, unknown> = { category: 'DeviceClassification', active: true }
        const rows = await db.masterItem.findMany({
          where: where as any,
          select: { label: true, parentRef: true, displayLabel: true },
        })
        const models: Array<{ name: string; brand?: string; deviceType?: string }> = []
        for (const r of rows) {
          if (r.parentRef) {
            const parts = r.parentRef.split('|')
            const brand = parts[0]
            const devType = parts.length >= 2 ? parts[1] : ''
            // If brandId filter provided, only include models matching that Brand
            if (!brandId || brand === brandId) {
              models.push({ name: r.label, brand, deviceType: devType })
            }
          }
        }
        return NextResponse.json({ items: models, type })
      }

      case 'repair-groups': {
        // Pull from RepairTaxonomy table — IT groups
        const items = await db.$queryRawUnsafe(`
          SELECT code, label, status FROM "RepairTaxonomy"
          WHERE type = 'group' AND active = true
          ORDER BY "sortOrder" ASC
        `)
        return NextResponse.json({ items, type })
      }

      case 'repair-problems': {
        // Pull from RepairTaxonomy table — Problem codes (RP-*)
        // Optional groupCode filter
        const groupCode = (searchParams.get('groupCode') ?? '').trim()
        const params: string[] = []
        let query = `SELECT code, label, "groupCode", "groupLabel" FROM "RepairTaxonomy"
                      WHERE type = 'problem' AND active = true`
        if (groupCode) {
          query += ` AND "groupCode" = $1`
          params.push(groupCode)
        }
        query += ` ORDER BY "groupCode" ASC, "sortOrder" ASC`
        const items = params.length
          ? await db.$queryRawUnsafe(query, ...params)
          : await db.$queryRawUnsafe(query)
        return NextResponse.json({ items, type })
      }

      case 'repair-resolutions': {
        // Pull from RepairTaxonomy table — Resolution codes (RX-*)
        // Optional groupCode filter
        const groupCode = (searchParams.get('groupCode') ?? '').trim()
        const params: string[] = []
        let query = `SELECT code, label, "groupCode", "groupLabel" FROM "RepairTaxonomy"
                      WHERE type = 'resolution' AND active = true`
        if (groupCode) {
          query += ` AND "groupCode" = $1`
          params.push(groupCode)
        }
        query += ` ORDER BY "groupCode" ASC, "sortOrder" ASC`
        const items = params.length
          ? await db.$queryRawUnsafe(query, ...params)
          : await db.$queryRawUnsafe(query)
        return NextResponse.json({ items, type })
      }

      case 'buildings': {
        const effectiveSite = resolveSite()
        if (effectiveSite === '__FORBIDDEN__') {
          return NextResponse.json(
            { error: 'Site out of scope' },
            { status: 403 },
          )
        }
        const whereSite: Record<string, unknown> = {}
        if (effectiveSite) {
          whereSite.site = effectiveSite
        } else if (!isAllSites) {
          whereSite.site = { in: parsed.codes }
        }
        const rows = await db.device.findMany({
          where: {
            ...whereSite,
            NOT: { OR: [{ building: null }, { building: '' }] },
          },
          distinct: ['building'],
          select: { building: true },
          orderBy: { building: 'asc' },
        })
        const items = rows
          .map((r) => r.building)
          .filter((b): b is string => Boolean(b))
        return NextResponse.json({ items, type })
      }

      case 'floors': {
        const effectiveSite = resolveSite()
        if (effectiveSite === '__FORBIDDEN__') {
          return NextResponse.json(
            { error: 'Site out of scope' },
            { status: 403 },
          )
        }
        const whereSite: Record<string, unknown> = {}
        if (effectiveSite) {
          whereSite.site = effectiveSite
        } else if (!isAllSites) {
          whereSite.site = { in: parsed.codes }
        }
        const rows = await db.device.findMany({
          where: {
            ...whereSite,
            ...(building ? { building } : {}),
            NOT: { OR: [{ floor: null }, { floor: '' }] },
          },
          distinct: ['floor'],
          select: { floor: true },
          orderBy: { floor: 'asc' },
        })
        const items = rows
          .map((r) => r.floor)
          .filter((f): f is string => Boolean(f))
        return NextResponse.json({ items, type })
      }

      case 'departments': {
        const effectiveSite = resolveSite()
        if (effectiveSite === '__FORBIDDEN__') {
          return NextResponse.json(
            { error: 'Site out of scope' },
            { status: 403 },
          )
        }
        const whereSite: Record<string, unknown> = {}
        if (effectiveSite) {
          whereSite.site = effectiveSite
        } else if (!isAllSites) {
          whereSite.site = { in: parsed.codes }
        }
        const rows = await db.device.findMany({
          where: {
            ...whereSite,
            ...(building ? { building } : {}),
            ...(floor ? { floor } : {}),
            NOT: { OR: [{ department: null }, { department: '' }] },
          },
          distinct: ['department'],
          select: { department: true },
          orderBy: { department: 'asc' },
        })
        const items = rows
          .map((r) => r.department)
          .filter((d): d is string => Boolean(d))
        return NextResponse.json({ items, type })
      }

      case 'locations': {
        const effectiveSite = resolveSite()
        if (effectiveSite === '__FORBIDDEN__') {
          return NextResponse.json(
            { error: 'Site out of scope' },
            { status: 403 },
          )
        }
        const whereSite: Record<string, unknown> = {}
        if (effectiveSite) {
          whereSite.site = effectiveSite
        } else if (!isAllSites) {
          whereSite.site = { in: parsed.codes }
        }
        const rows = await db.device.findMany({
          where: {
            ...whereSite,
            NOT: { OR: [{ location: null }, { location: '' }] },
          },
          distinct: ['location'],
          select: { location: true },
          orderBy: { location: 'asc' },
        })
        const items = rows
          .map((r) => r.location)
          .filter((l): l is string => Boolean(l))
        return NextResponse.json({ items, type })
      }

      case 'device-groups': {
        const rows = await db.device.findMany({
          where: {
            NOT: { OR: [{ deviceGroup: null }, { deviceGroup: '' }] },
          },
          distinct: ['deviceGroup'],
          select: { deviceGroup: true },
          orderBy: { deviceGroup: 'asc' },
        })
        const items = rows
          .map((r) => r.deviceGroup)
          .filter((g): g is string => Boolean(g))
        return NextResponse.json({ items, type })
      }

      case 'statuses': {
        const rows = await db.device.findMany({
          where: {
            NOT: { status: '' },
          },
          distinct: ['status'],
          select: { status: true },
          orderBy: { status: 'asc' },
        })
        const items = rows
          .map((r) => r.status)
          .filter((s): s is string => Boolean(s))
        return NextResponse.json({ items, type })
      }

      default:
        return NextResponse.json(
          { error: `Unknown type: ${type || '(empty)'}` },
          { status: 400 },
        )
    }
  } catch (err) {
    console.error('GET /api/master', err)
    const message = err instanceof Error ? err.message : 'Failed to fetch master'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────
// POST handler — legacy MasterItem create (used by MasterDataModal)
// Preserved for backward compatibility.
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, 'MASTER_DATA_EDIT')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  try {
    const body = await req.json()
    if (!body.category || !body.code || !body.label) {
      return NextResponse.json(
        { error: 'Missing required fields: category, code, label' },
        { status: 400 },
      )
    }
    const created = await db.masterItem.create({
      data: {
        category: String(body.category).trim(),
        code: String(body.code).trim(),
        label: String(body.label).trim(),
        parentRef: body.parentRef ? String(body.parentRef).trim() : null,
        displayLabel: body.displayLabel ? String(body.displayLabel).trim() : null,
        siteCode: body.siteCode ? String(body.siteCode).trim() : null,
      },
    })
    await logAudit(
      'CREATE',
      'MasterItem',
      created.id,
      `เพิ่มข้อมูลมาตรฐาน ${created.category}: ${created.code} (${created.label})`,
      { category: created.category, code: created.code, label: created.label },
    )
    return NextResponse.json({ item: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/master', err)
    const message = err instanceof Error ? err.message : 'Failed to create master item'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
