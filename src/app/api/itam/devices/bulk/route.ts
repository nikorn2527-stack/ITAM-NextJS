import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { canAccessSite } from '@/lib/auth'

/**
 * POST /api/itam/devices/bulk
 *
 * Bulk-edit multiple devices in a single transaction. The body contains:
 *   {
 *     assetNos: string[],          // devices to update
 *     patch: {
 *       status?, site?, building?, floor?, department?,
 *       departmentCode?, location?, deviceGroup?, costCenter?,
 *       meterRequired?, meterMode?, vendor?, contractNo?, remark?
 *     }
 *   }
 *
 * - Site access checked on each device before update
 * - Empty/null values in patch are skipped (only set fields are applied)
 * - Returns { updated: number, skipped: number, errors: [...] }
 *
 * Permission: DEVICE_EDIT
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'DEVICE_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const body = await req.json()
    const assetNos: string[] = Array.isArray(body.assetNos) ? body.assetNos : []
    const patch: Record<string, unknown> = body.patch ?? {}
    if (assetNos.length === 0) {
      return NextResponse.json({ error: 'assetNos[] required' }, { status: 400 })
    }
    if (assetNos.length > 500) {
      return NextResponse.json({ error: 'Too many devices (max 500)' }, { status: 400 })
    }
    // Whitelisted patch fields
    const ALLOWED = new Set([
      'status', 'site', 'building', 'floor', 'department', 'departmentCode',
      'location', 'deviceGroup', 'costCenter', 'meterRequired', 'meterMode',
      'vendor', 'contractNo', 'remark',
    ])
    const cleanPatch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (!ALLOWED.has(k)) continue
      if (v === null || v === undefined || v === '') continue
      cleanPatch[k] = v
    }
    if (Object.keys(cleanPatch).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Site-access check on the patch's target site (if site is being changed)
    if (cleanPatch.site && !canAccessSite(user, String(cleanPatch.site))) {
      return NextResponse.json(
        { error: `ไม่มีสิทธิ์ย้ายอุปกรณ์ไปสาขา: ${cleanPatch.site}` },
        { status: 403 },
      )
    }

    let updated = 0
    let skipped = 0
    const errors: Array<{ assetNo: string; error: string }> = []
    const updatedBy = user.username || user.email

    // Fetch all target devices first (for site-access checks)
    const targets = await db.device.findMany({
      where: { assetNo: { in: assetNos } },
      select: { assetNo: true, site: true },
    })
    const targetMap = new Map(targets.map((t) => [t.assetNo, t.site]))

    for (const assetNo of assetNos) {
      const site = targetMap.get(assetNo)
      if (site === undefined) {
        errors.push({ assetNo, error: 'not found' })
        skipped++
        continue
      }
      if (!canAccessSite(user, site)) {
        errors.push({ assetNo, error: 'no site access' })
        skipped++
        continue
      }
      try {
        await db.device.update({
          where: { assetNo },
          data: { ...cleanPatch, updatedBy },
        })
        updated++
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'failed'
        errors.push({ assetNo, error: msg })
        skipped++
      }
    }

    // Single audit entry summarizing the bulk action
    try {
      await db.auditLog.create({
        data: {
          timestamp: new Date().toISOString(),
          action: 'BULK_UPDATE_DEVICES',
          user: user.email,
          details: JSON.stringify({
            count: assetNos.length,
            updated,
            skipped,
            patch: cleanPatch,
          }),
        },
      })
    } catch { /* ignore */ }

    return NextResponse.json({ updated, skipped, errors, total: assetNos.length })
  } catch (err) {
    console.error('POST /api/itam/devices/bulk', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
