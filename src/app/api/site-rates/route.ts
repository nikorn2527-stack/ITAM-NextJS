import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

// Cache site rates for 5 minutes — changes infrequently
export const revalidate = 300

export async function GET() {
  try {
    // Parallel queries with select to reduce payload
    const [rates, sites] = await Promise.all([
      db.siteRate.findMany({
        orderBy: { siteCode: 'asc' },
        select: { id: true, siteCode: true, bwRate: true, colorRate: true, effectiveFrom: true, effectiveTo: true, isActive: true },
      }),
      db.site.findMany({
        select: { id: true, code: true, name: true },
      }),
    ])
    const siteNameMap = new Map(sites.map((s) => [s.code, s.name]))

    // Auto-seed default rates for sites that don't yet have one
    const sitesWithoutRate = sites.filter(
      (s) => !rates.some((r) => r.siteCode === s.code),
    )
    if (sitesWithoutRate.length > 0) {
      await db.siteRate.createMany({
        data: sitesWithoutRate.map((s) => ({
          siteCode: s.code,
          bwRate: 0.5,
          colorRate: 2.0,
        })),
      })
      const refreshed = await db.siteRate.findMany({
        orderBy: { siteCode: 'asc' },
      })
      const merged = refreshed.map((r) => ({
        id: r.id,
        siteCode: r.siteCode,
        siteName: siteNameMap.get(r.siteCode) ?? r.siteCode,
        bwRate: r.bwRate,
        colorRate: r.colorRate,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
      return NextResponse.json({ rates: merged })
    }

    const merged = rates.map((r) => ({
      id: r.id,
      siteCode: r.siteCode,
      siteName: siteNameMap.get(r.siteCode) ?? r.siteCode,
      bwRate: r.bwRate,
      colorRate: r.colorRate,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }))
    return NextResponse.json({ rates: merged })
  } catch (err) {
    console.error('GET /api/site-rates', err)
    return NextResponse.json(
      { error: 'Failed to fetch site rates' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { siteCode, bwRate, colorRate } = body as {
      siteCode?: string
      bwRate?: number
      colorRate?: number
    }
    if (!siteCode || !siteCode.trim()) {
      return NextResponse.json(
        { error: 'Missing required field: siteCode' },
        { status: 400 },
      )
    }
    const code = String(siteCode).trim()
    const site = await db.site.findUnique({ where: { code } })
    if (!site) {
      return NextResponse.json(
        { error: `Site not found: ${code}` },
        { status: 404 },
      )
    }
    const bw = typeof bwRate === 'number' ? bwRate : 0.5
    const color = typeof colorRate === 'number' ? colorRate : 2.0

    const existing = await db.siteRate.findFirst({ where: { siteCode: code } })
    let rate
    if (existing) {
      rate = await db.siteRate.update({
        where: { id: existing.id },
        data: { bwRate: bw, colorRate: color },
      })
      await logAudit(
        'UPDATE',
        'Setting',
        rate.id,
        `แก้ไขอัตราค่ากระดาษสาขา ${code}: ขาวดำ ${bw}฿ / สี ${color}฿`,
        { siteCode: code, bwRate: bw, colorRate: color },
      )
    } else {
      rate = await db.siteRate.create({
        data: { siteCode: code, bwRate: bw, colorRate: color },
      })
      await logAudit(
        'CREATE',
        'Setting',
        rate.id,
        `ตั้งค่าอัตราค่ากระดาษสาขา ${code}: ขาวดำ ${bw}฿ / สี ${color}฿`,
        { siteCode: code, bwRate: bw, colorRate: color },
      )
    }
    return NextResponse.json(
      {
        rate: {
          id: rate.id,
          siteCode: rate.siteCode,
          siteName: site.name,
          bwRate: rate.bwRate,
          colorRate: rate.colorRate,
          createdAt: rate.createdAt,
          updatedAt: rate.updatedAt,
        },
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('POST /api/site-rates', err)
    const message = process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : 'Failed to save rate') : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
