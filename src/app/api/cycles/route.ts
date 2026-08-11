import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')?.trim() ?? ''
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    const cycles = await db.cycle.findMany({
      where,
      orderBy: { startDate: 'desc' },
    })
    return NextResponse.json({ cycles })
  } catch (err) {
    console.error('GET /api/cycles', err)
    return NextResponse.json(
      { error: 'Failed to fetch cycles' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, startDate, endDate, status } = body as {
      name?: string
      startDate?: string
      endDate?: string
      status?: string
    }
    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required fields: name, startDate, endDate' },
        { status: 400 },
      )
    }
    const finalStatus = (status ?? 'active').trim()

    // If creating an active cycle, mark other active cycles as ended
    if (finalStatus === 'active') {
      await db.cycle.updateMany({
        where: { status: 'active' },
        data: { status: 'ended' },
      })
    }

    const created = await db.cycle.create({
      data: {
        name: String(name).trim(),
        startDate: String(startDate),
        endDate: String(endDate),
        status: finalStatus,
      },
    })
    await logAudit(
      'CYCLE_START',
      'Cycle',
      created.id,
      `สร้างรอบจดมิเตอร์ ${created.name} (${created.startDate} → ${created.endDate})`,
      { name: created.name, startDate: created.startDate, endDate: created.endDate },
    )
    return NextResponse.json({ cycle: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/cycles', err)
    const message = err instanceof Error ? err.message : 'Failed to create cycle'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
