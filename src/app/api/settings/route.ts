import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const settings = await db.appSetting.findMany()
    const map: Record<string, string> = {}
    for (const s of settings) map[s.key] = s.value
    return NextResponse.json({ settings: map })
  } catch (err) {
    console.error('GET /api/settings', err)
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 },
    )
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Record<string, string>
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const ops = Object.entries(body).map(([key, value]) =>
      db.appSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      }),
    )
    await Promise.all(ops)
    const settings = await db.appSetting.findMany()
    const map: Record<string, string> = {}
    for (const s of settings) map[s.key] = s.value
    return NextResponse.json({ settings: map })
  } catch (err) {
    console.error('PUT /api/settings', err)
    const message = err instanceof Error ? err.message : 'Failed to update settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
