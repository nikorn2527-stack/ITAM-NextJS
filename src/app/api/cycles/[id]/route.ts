import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

// GET a single cycle with stats (reading count, total sheets)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const cycle = await db.cycle.findUnique({ where: { id } })
    if (!cycle) {
      return NextResponse.json({ error: 'Cycle not found' }, { status: 404 })
    }
    const readings = await db.meterReading.findMany({
      where: {
        readingDate: {
          gte: cycle.startDate,
          lte: cycle.endDate,
        },
      },
      select: { pagesBw: true, pagesColor: true },
    })
    const readingCount = readings.length
    const totalSheets = readings.reduce((s, r) => {
      const delta = r.pagesBw + r.pagesColor
      return s + (delta > 0 ? delta : 0)
    }, 0)
    return NextResponse.json({ cycle, readingCount, totalSheets })
  } catch (err) {
    console.error('GET /api/cycles/[id]', err)
    return NextResponse.json({ error: 'Failed to fetch cycle' }, { status: 500 })
  }
}

// PUT — update cycle status (end / cancel / reopen) or edit dates
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { status, name, startDate, endDate } = body as {
      status?: string
      name?: string
      startDate?: string
      endDate?: string
    }

    const existing = await db.cycle.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Cycle not found' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (status !== undefined) {
      const s = String(status).trim()
      if (!['active', 'ended', 'cancelled'].includes(s)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      data.status = s
    }
    if (name !== undefined) data.name = String(name).trim()
    if (startDate !== undefined) data.startDate = String(startDate)
    if (endDate !== undefined) data.endDate = String(endDate)

    const updated = await db.cycle.update({ where: { id }, data })

    // Audit log with Thai summary
    let action = 'UPDATE'
    let summary = `แก้ไขรอบจดมิเตอร์ ${updated.name}`
    if (status === 'ended') {
      action = 'CYCLE_END'
      summary = `จบรอบจดมิเตอร์ ${updated.name}`
    } else if (status === 'cancelled') {
      action = 'CYCLE_CANCEL'
      summary = `ยกเลิกรอบจดมิเตอร์ ${updated.name}`
    } else if (status === 'active') {
      action = 'CYCLE_REOPEN'
      summary = `เปิดใช้งานรอบจดมิเตอร์ ${updated.name} อีกครั้ง`
    }
    await logAudit(action, 'Cycle', id, summary, {
      name: updated.name,
      oldStatus: existing.status,
      newStatus: updated.status,
    })

    return NextResponse.json({ cycle: updated })
  } catch (err) {
    console.error('PUT /api/cycles/[id]', err)
    return NextResponse.json({ error: 'Failed to update cycle' }, { status: 500 })
  }
}

// DELETE — remove a cycle (only if not active and has no readings)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const cycle = await db.cycle.findUnique({ where: { id } })
    if (!cycle) {
      return NextResponse.json({ error: 'Cycle not found' }, { status: 404 })
    }
    if (cycle.status === 'active') {
      return NextResponse.json(
        { error: 'ไม่สามารถลบรอบที่กำลังดำเนินการได้ — กรุณาจบรอบก่อน' },
        { status: 400 },
      )
    }
    const readingCount = await db.meterReading.count({
      where: {
        readingDate: {
          gte: cycle.startDate,
          lte: cycle.endDate,
        },
      },
    })
    if (readingCount > 0) {
      return NextResponse.json(
        {
          error: `ไม่สามารถลบรอบที่มีการจดมิเตอร์แล้ว (${readingCount} รายการ) — กรุณายกเลิกรอบแทน`,
          code: 'CYCLE_HAS_READINGS',
          readingCount,
        },
        { status: 400 },
      )
    }
    await db.cycle.delete({ where: { id } })
    await logAudit('DELETE', 'Cycle', id, `ลบรอบจดมิเตอร์ ${cycle.name}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/cycles/[id]', err)
    return NextResponse.json({ error: 'Failed to delete cycle' }, { status: 500 })
  }
}
