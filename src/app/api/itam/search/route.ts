import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { siteFilterForUser } from '@/lib/auth'

// GET /api/itam/search?q= — global search across entities
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'VIEW_DEVICES')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim().toLowerCase() ?? ''
    if (q.length < 2) {
      return NextResponse.json({ results: { devices: [], master: [], meter: [], audit: [], sites: [] }, total: 0 })
    }

    // Site-level filter — restrict devices + meter-readings to user's sites
    const sf = siteFilterForUser(user)
    const isSiteFiltered = Object.keys(sf).length > 0

    const [devices, masterItems, auditLogs, sites] = await Promise.all([
      db.device.findMany({
        where: {
          AND: [
            sf,
            {
              OR: [
                { assetNo: { contains: q } },
                { deviceType: { contains: q } },
                { brand: { contains: q } },
                { model: { contains: q } },
                { serial: { contains: q } },
              ],
            },
          ],
        },
        take: 8,
        select: { id: true, assetNo: true, deviceType: true, brand: true, model: true, site: true, status: true },
      }),
      db.masterItem.findMany({
        where: {
          OR: [
            { value: { contains: q } },
            { displayLabel: { contains: q } },
          ],
        },
        take: 5,
        select: { id: true, categoryKey: true, value: true, displayLabel: true },
      }),
      db.auditLog.findMany({
        where: {
          // Non-admin users only see their own audit entries
          ...(user.role !== 'admin' && user.role !== 'superadmin' ? { user: user.email } : {}),
          OR: [
            { action: { contains: q } },
            { details: { contains: q } },
            { user: { contains: q } },
          ],
        },
        take: 5,
        orderBy: { timestamp: 'desc' },
        select: { id: true, action: true, user: true, details: true, timestamp: true },
      }),
      db.siteAttribute.findMany({
        where: isSiteFiltered
          ? { siteName: { in: sf.site?.in ?? [] } }
          : {
              OR: [
                { siteCode: { contains: q } },
                { siteName: { contains: q } },
              ],
            },
        take: 3,
        select: { id: true, siteCode: true, siteName: true },
      }),
    ])

    const results = {
      devices: devices.map((d) => ({ type: 'device', id: d.id, title: `${d.assetNo} — ${d.brand || ''} ${d.model || ''}`, subtitle: `${d.deviceType || ''} · ${d.site || ''}`, icon: '💻' })),
      master: masterItems.map((m) => ({ type: 'master', id: m.id, title: m.value, subtitle: m.categoryKey, icon: '📊' })),
      audit: auditLogs.map((a) => ({ type: 'audit', id: a.id, title: `${a.action} — ${(a.details || '').substring(0, 60)}`, subtitle: `${a.user} · ${a.timestamp}`, icon: '📜' })),
      sites: sites.map((s) => ({ type: 'site', id: s.id, title: `${s.siteCode} — ${s.siteName || ''}`, subtitle: 'สาขา', icon: '🏢' })),
    }
    const total = results.devices.length + results.master.length + results.audit.length + results.sites.length
    return NextResponse.json({ results, total })
  } catch (err) {
    console.error('GET /api/itam/search', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
