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

    // For short numeric queries, search identifier fields FIRST (suffix match)
    // Only search text fields (name, brand, model) if no identifier matches.
    let devices
    if (isShort) {
      // Step 1: Try suffix match on assetCode, serialNumber, assetSiteCode
      devices = await db.device.findMany({
        where: {
          OR: [
            { assetCode: { endsWith: q } },
            { serialNumber: { endsWith: q } },
            { assetSiteCode: { endsWith: q } },
          ],
        },
        take: 8,
        orderBy: { assetCode: 'asc' },
      })

      // Step 2: If no suffix matches, try contains on identifier fields
      if (devices.length === 0) {
        devices = await db.device.findMany({
          where: {
            OR: [
              { assetCode: { contains: q } },
              { serialNumber: { contains: q } },
              { assetSiteCode: { contains: q } },
            ],
          },
          take: 8,
          orderBy: { assetCode: 'asc' },
        })
      }

      // Step 3: If still no matches, try text fields (brand, model, name)
      if (devices.length === 0) {
        devices = await db.device.findMany({
          where: {
            OR: [
              { name: { contains: q } },
              { brand: { contains: q } },
              { model: { contains: q } },
            ],
          },
          take: 8,
          orderBy: { assetCode: 'asc' },
        })
      }
    } else {
      // Non-numeric query — search all fields with contains
      devices = await db.device.findMany({
        where: {
          OR: [
            { assetCode: { contains: q } },
            { name: { contains: q } },
            { serialNumber: { contains: q } },
            { brand: { contains: q } },
            { model: { contains: q } },
          ],
        },
        take: 8,
        orderBy: { assetCode: 'asc' },
      })
    }
    const deviceResults: SearchDevice[] = devices.map((d) => ({
      type: 'device',
      id: d.id,
      title: `${d.assetCode} · ${d.name}`,
      subtitle: `S/N: ${d.serialNumber ?? '-'} | ${d.brand ?? ''} ${d.model ?? ''} · ${d.site ?? ''}`,
      url: null,
    }))

    // Master items — code, label (suffix-aware for short numeric)
    const masters = await db.masterItem.findMany({
      where: isShort
        ? {
            OR: [
              { code: { endsWith: q } },
              { code: { contains: q } },
              { label: { contains: q } },
            ],
          }
        : {
            OR: [
              { code: { contains: q } },
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
        title: `${r.device!.assetCode} ${r.meterBw.toLocaleString('th-TH')}`,
        subtitle: `${r.readingDate}${r.remark ? ' · ' + r.remark : ''}`,
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
