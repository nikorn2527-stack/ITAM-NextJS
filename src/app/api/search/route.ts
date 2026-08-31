import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isNumericShortQuery } from '@/lib/suffix-search'

interface SearchDevice {
  type: 'device'
  id: string
  title: string
  subtitle: string
  url: null
}
interface SearchMaster {
  type: 'master'
  id: string
  title: string
  subtitle: string
}
interface SearchMeter {
  type: 'meter'
  id: string
  title: string
  subtitle: string
  deviceId: string
}
interface SearchAudit {
  type: 'audit'
  id: string
  title: string
  subtitle: string
}
interface SearchSite {
  type: 'site'
  id: string
  title: string
  subtitle: string
}

interface SearchResults {
  devices: SearchDevice[]
  master: SearchMaster[]
  meter: SearchMeter[]
  audit: SearchAudit[]
  sites: SearchSite[]
}

const EMPTY: SearchResults = {
  devices: [],
  master: [],
  meter: [],
  audit: [],
  sites: [],
}

export async function GET(req: NextRequest) {
  try {
    // Require authentication — previously this endpoint was public.
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
    if (q.length < 2) {
      return NextResponse.json({ results: EMPTY, total: 0 })
    }

    // SUFFIX-AWARE (SEARCH-FIX): for short numeric queries, match the SUFFIX
    // of identifier fields. Non-numeric/longer queries use contains.
    const isShort = isNumericShortQuery(q)
    const assetFragment = isShort ? { assetCode: { endsWith: q } } : { assetCode: { contains: q } }
    const serialFragment = isShort ? { serialNumber: { endsWith: q } } : { serialNumber: { contains: q } }
    const codeFragment = isShort ? { code: { endsWith: q } } : { code: { contains: q } }

    // Devices — assetCode, name, serialNumber, brand, model
    const devices = await db.device.findMany({
      where: {
        OR: [
          assetFragment,
          { name: { contains: q } },
          serialFragment,
          { brand: { contains: q } },
          { model: { contains: q } },
        ],
      },
      take: 8,
      orderBy: { assetCode: 'asc' },
    })
    const deviceResults: SearchDevice[] = devices.map((d) => ({
      type: 'device',
      id: d.id,
      title: `${d.assetCode} · ${d.name}`,
      subtitle: `${d.brand} ${d.model} · ${d.site}`,
      url: null,
    }))

    // Master items — code, label
    const masters = await db.masterItem.findMany({
      where: {
        OR: [
          codeFragment,
          { label: { contains: q } },
        ],
      },
      take: 5,
      orderBy: { code: 'asc' },
    })
    const masterResults: SearchMaster[] = masters.map((m) => ({
      type: 'master',
      id: m.id,
      title: m.code,
      subtitle: `${m.label} · ${m.category}`,
    }))

    // Meter readings — remark contains (only non-null)
    const readings = await db.meterReading.findMany({
      where: {
        remark: { contains: q },
      },
      take: 3,
      orderBy: { createdAt: 'desc' },
      include: {
        device: {
          select: { id: true, assetCode: true },
        },
      },
    })
    const meterResults: SearchMeter[] = readings
      .filter((r) => r.device)
      .map((r) => ({
        type: 'meter',
        id: r.id,
        title: `${r.device!.assetCode} ${r.reading.toLocaleString('th-TH')}`,
        subtitle: `${r.date}${r.remark ? ' · ' + r.remark : ''}`,
        deviceId: r.device!.id,
      }))

    // Audit logs — summary contains
    const audits = await db.auditLog.findMany({
      where: {
        summary: { contains: q },
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    })
    const auditResults: SearchAudit[] = audits.map((a) => ({
      type: 'audit',
      id: a.id,
      title: a.summary,
      subtitle: `${a.action} · ${new Date(a.createdAt).toLocaleDateString('th-TH')}`,
    }))

    // Sites — code, name
    const sites = await db.site.findMany({
      where: {
        OR: [
          { code: { contains: q } },
          { name: { contains: q } },
        ],
      },
      take: 3,
      orderBy: { code: 'asc' },
    })
    const siteResults: SearchSite[] = sites.map((s) => ({
      type: 'site',
      id: s.id,
      title: s.code,
      subtitle: s.name,
    }))

    const results: SearchResults = {
      devices: deviceResults,
      master: masterResults,
      meter: meterResults,
      audit: auditResults,
      sites: siteResults,
    }
    const total =
      results.devices.length +
      results.master.length +
      results.meter.length +
      results.audit.length +
      results.sites.length

    return NextResponse.json({ results, total })
  } catch (err) {
    console.error('GET /api/search', err)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Search failed') : 'Internal server error' },
      { status: 500 },
    )
  }
}
