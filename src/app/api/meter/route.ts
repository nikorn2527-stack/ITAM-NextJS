import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const deviceId = searchParams.get('deviceId')?.trim() ?? ''
    const cycleId = searchParams.get('cycleId')?.trim() ?? ''
    const aggregate = searchParams.get('aggregate')?.trim() ?? ''

    if (aggregate === 'monthly') {
      // Aggregate delta per month across all readings
      const readings = await db.meterReading.findMany({
        select: { date: true, delta: true },
        orderBy: { date: 'asc' },
      })
      const map = new Map<string, number>()
      for (const r of readings) {
        const month = r.date.slice(0, 7) // YYYY-MM
        map.set(month, (map.get(month) ?? 0) + r.delta)
      }
      const monthly = Array.from(map.entries()).map(([month, value]) => ({
        month,
        value,
      }))
      return NextResponse.json({ monthly })
    }

    if (aggregate === 'byDevice') {
      const readings = await db.meterReading.findMany({
        select: { deviceId: true, delta: true },
      })
      const map = new Map<string, number>()
      for (const r of readings) {
        map.set(r.deviceId, (map.get(r.deviceId) ?? 0) + r.delta)
      }
      const devices = await db.device.findMany({ select: { id: true, name: true, assetCode: true } })
      const byDevice = devices
        .map((d) => ({
          id: d.id,
          name: d.name,
          assetCode: d.assetCode,
          value: map.get(d.id) ?? 0,
        }))
        .sort((a, b) => b.value - a.value)
      return NextResponse.json({ byDevice })
    }

    const where: Record<string, unknown> = {}
    if (deviceId) where.deviceId = deviceId
    if (cycleId) where.cycleId = cycleId

    const readings = await db.meterReading.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      include: { device: { select: { id: true, name: true, assetCode: true, brand: true, model: true } } },
      take: 500,
    })
    return NextResponse.json({ readings })
  } catch (err) {
    console.error('GET /api/meter', err)
    return NextResponse.json(
      { error: 'Failed to fetch meter readings' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { deviceId, reading, date, remark, cycleId } = body as {
      deviceId?: string
      reading?: number
      date?: string
      remark?: string
      cycleId?: string
    }

    if (!deviceId || reading === undefined || reading === null || !date) {
      return NextResponse.json(
        { error: 'Missing required fields: deviceId, reading, date' },
        { status: 400 },
      )
    }

    const newReading = Math.floor(Number(reading))
    if (Number.isNaN(newReading)) {
      return NextResponse.json({ error: 'reading must be a number' }, { status: 400 })
    }

    const device = await db.device.findUnique({ where: { id: deviceId } })
    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    }

    const prevReading = device.lastMeterReading ?? 0
    const delta = newReading - prevReading

    // Validation: new < prev requires a remark (RESET behavior)
    if (newReading < prevReading && (!remark || !remark.trim())) {
      return NextResponse.json(
        {
          error:
            'การจดมิเตอร์ใหม่น้อยกว่าค่าก่อนหน้า กรุณาระบุหมายเหตุ (RESET)',
          code: 'RESET_REQUIRES_REMARK',
        },
        { status: 400 },
      )
    }

    const created = await db.meterReading.create({
      data: {
        deviceId,
        reading: newReading,
        prevReading,
        date: String(date),
        remark: remark ? String(remark).trim() : null,
        delta,
        cycleId: cycleId || null,
      },
    })

    await db.device.update({
      where: { id: deviceId },
      data: { lastMeterReading: newReading },
    })

    await logAudit(
      'METER_READING',
      'MeterReading',
      created.id,
      `จดมิเตอร์ ${device.assetCode}: ${prevReading.toLocaleString()}→${newReading.toLocaleString()} (${delta >= 0 ? '+' : ''}${delta.toLocaleString()})`,
      {
        deviceId,
        assetCode: device.assetCode,
        reading: newReading,
        prevReading,
        delta,
        date,
        remark: remark || null,
      },
    )

    // Warn if delta > 20000
    const warning =
      delta > 20000
        ? `⚠️ ค่าเพิ่มขึ้น ${delta.toLocaleString()} แผ่น (เกิน 20,000 แผ่น) กรุณาตรวจสอบ`
        : null

    return NextResponse.json({ reading: created, warning }, { status: 201 })
  } catch (err) {
    console.error('POST /api/meter', err)
    const message = err instanceof Error ? err.message : 'Failed to save reading'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
