import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { getAllowedSites, siteFilterForUser } from '@/lib/auth'

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
    const allowedSites = getAllowedSites(user)
    const isSiteFiltered = Object.keys(sf).length > 0

    const [devices, masterItems, auditLogs, sites] = await Promise.all([
      db.device.findMany({
        where: {
          AND: [
            sf,
            {
              OR: [
                { assetCode: { contains: q } },
                { type: { contains: q } },
                { brand: { contains: q } },
                { model: { contains: q } },
                { serialNumber: { contains: q } },
              ],
            },
          ],
        },
        take: 8,
        select: { id: true, assetCode: true, type: true, brand: true, model: true, serialNumber: true, site: true, status: true },
      }),
      db.masterItem.findMany({
        where: {
          OR: [
            { label: { contains: q } },
            { code: { contains: q } },
            { displayLabel: { contains: q } },
          ],
        },
        take: 5,
        select: { id: true, category: true, code: true, label: true, displayLabel: true },
      }),
      db.auditLog.findMany({
        where: {
          // Non-admin users only see their own audit entries
          ...(user.role !== 'admin' && user.role !== 'superadmin' ? { actor: user.email } : {}),
          OR: [
            { action: { contains: q } },
            { detail: { contains: q } },
            { actor: { contains: q } },
            { summary: { contains: q } },
          ],
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, action: true, actor: true, summary: true, detail: true, createdAt: true },
      }),
      db.site.findMany({
        where: allowedSites === 'ALL'
          ? { OR: [{ code: { contains: q } }, { name: { contains: q } }] }
          : { name: { in: allowedSites, contains: q } },
        take: 3,
        select: { id: true, code: true, name: true },
      }),
    ])

    const results = {
      devices: devices.map((d) => ({ type: 'device', id: d.id, title: `${d.assetCode} — ${d.brand || ''} ${d.model || ''}`, subtitle: `${d.type || ''} · ${d.site || ''}`, icon: '💻' })),
      master: masterItems.map((m) => ({ type: 'master', id: m.id, title: m.label, subtitle: m.category, icon: '📊' })),
      audit: auditLogs.map((a) => ({ type: 'audit', id: a.id, title: `${a.action} — ${(a.detail || a.summary || '').substring(0, 60)}`, subtitle: `${a.actor} · ${a.createdAt}`, icon: '📜' })),
      sites: sites.map((s) => ({ type: 'site', id: s.id, title: `${s.code} — ${s.name || ''}`, subtitle: 'สาขา', icon: '🏢' })),
    }
    const total = results.devices.length + results.master.length + results.audit.length + results.sites.length
    return NextResponse.json({ results, total })
  } catch (err) {
    console.error('GET /api/itam/search', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
