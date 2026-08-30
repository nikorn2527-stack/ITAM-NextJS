import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const dbUrl = process.env.DATABASE_URL ?? ''
    const masked = dbUrl.replace(/:[^:@]+@/, ':****@')
    const isPooler = /\.pooler\.supabase\.com/.test(dbUrl)
    const isVercelPg = dbUrl.includes('vercel')
    await db.$queryRaw`SELECT 1`
    const mc = await db.masterItem.count()
    const dc = await db.masterItem.count({ where: { category: 'DeviceClassification' } })
    let rt = 0
    try { const r = await db.$queryRawUnsafe('SELECT COUNT(*)::int as c FROM "RepairTaxonomy"'); rt = r[0].c } catch (err) { console.error('[route]', err) }
    return NextResponse.json({ ok: true, dbUrl: masked.slice(0, 80), isPooler, isVercelPg, masterItem: mc, deviceClassification: dc, repairTaxonomy: rt })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
