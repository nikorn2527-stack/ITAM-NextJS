import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/itam/sites — list all sites with device count
export async function GET() {
  try {
    const sites = await db.siteAttribute.findMany({
      orderBy: { siteCode: 'asc' },
    })

    const sitesWithCounts = await Promise.all(
      sites.map(async (s) => {
        const deviceCount = await db.device.count({ where: { site: s.siteName || '' } })
        const activeCount = await db.device.count({
          where: { site: s.siteName || '', status: 'Active' },
        })
        return { ...s, deviceCount, activeCount }
      })
    )

    return NextResponse.json({ sites: sitesWithCounts })
  } catch (err) {
    console.error('GET /api/itam/sites', err)
    return NextResponse.json({ error: 'Failed to fetch sites' }, { status: 500 })
  }
}
