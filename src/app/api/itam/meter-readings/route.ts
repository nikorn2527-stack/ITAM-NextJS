import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { siteFilterForUser, canAccessSite } from '@/lib/auth'
import { notifyMeter } from '@/lib/notifications'
import { publishRealtimeEvent } from '@/lib/realtime'
import {
  findValidPrevReading,
  findSameMonthBaseline,
  findExistingMonthlyReading,
  calcPagesBw,
  calcPagesColor,
  detectModeSwitch,
  isMeterDecreased,
  normalizeReadingMonth,
  type ReadingType,
} from '@/lib/meter-logic'
import { assertMeterMonthWritable } from '@/lib/meter-snapshot'

// GET /api/itam/meter-readings?assetCode=&month=&page=1&limit=20
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'VIEW_DEVICES')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const { searchParams } = new URL(req.url)
    const assetCode = (searchParams.get('assetCode')?.trim() || searchParams.get('assetNo')?.trim() || '')
    const month = searchParams.get('month')?.trim() ?? ''
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

    const where: Record<string, unknown> = { AND: [] as unknown[] }
    if (assetCode) (where.AND as unknown[]).push({ assetCode })
    if (month) (where.AND as unknown[]).push({ readingMonth: month })

    // Site-level filter via the device relation
    const siteFilter = siteFilterForUser(user)
    if (Object.keys(siteFilter).length) {
      (where.AND as unknown[]).push({ device: siteFilter })
    }
    if (Array.isArray(where.AND) && where.AND.length === 0) delete where.AND

    const [readings, total] = await Promise.all([
      db.meterReading.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { readingDate: 'desc' },
        include: {
          device: { select: { assetCode: true, brand: true, model: true, site: true } },
        },
      }),
      db.meterReading.count({ where }),
    ])

    return NextResponse.json({
      readings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error('GET /api/itam/meter-readings', err)
    return NextResponse.json({ error: 'Failed to fetch meter readings' }, { status: 500 })
  }
}

/**
 * POST /api/itam/meter-readings — create/update meter reading (requires METER_WRITE)
 *
 * Implements the PROTECTED meter reading rules from Apps Script MeterService.gs:
 *   1. findValidPrevReading skips FINAL/SEND_REPAIR + same-month
 *   2. Same-month INITIAL/RESET fallback when no prev exists
 *   3. Mode-switch detection (TOTAL ↔ BW_COLOR)
 *   4. needConfirmReset 2-step flow (returns { needConfirmReset: true } first)
 *   5. Update existing MONTHLY in-place (upsert, not insert duplicate)
 *   6. Pages: INITIAL/RESET = 0; others = max(0, meter - prev)
 *
 * Body:
 *   assetCode, meterBw, meterColor?, readingDate?, readingMonth?,
 *   readingType?, remark?, confirmReset?, location fields?
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'METER_WRITE')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const body = await req.json()
    // Support both assetCode (new) and assetNo (legacy client compat)
    const assetCode = String(body.assetCode || body.assetNo || '').trim()
    if (!assetCode || body.meterBw === undefined) {
      return NextResponse.json({ error: 'assetCode and meterBw required' }, { status: 400 })
    }

    const device = await db.device.findUnique({ where: { assetCode } })
    if (!device) return NextResponse.json({ error: 'Device not found' }, { status: 404 })
    if (!canAccessSite(user, device.site)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์จดมิเตอร์สำหรับอุปกรณ์ในสาขานี้' }, { status: 403 })
    }

    const meterBw = Math.floor(Number(body.meterBw))
    const meterColor = Math.floor(Number(body.meterColor || 0))
    const finalReadingMonth = normalizeReadingMonth(body.readingMonth) ||
      new Date().toISOString().slice(0, 7)
    const readingDate = body.readingDate || new Date().toISOString().slice(0, 10)

    // ── Write-lock: reject writes to CLOSED-cycle months ──
    try {
      await assertMeterMonthWritable(finalReadingMonth, 'บันทึกมิเตอร์')
    } catch (lockErr) {
      return NextResponse.json(
        {
          error: lockErr instanceof Error ? lockErr.message : 'รอบจดมิเตอร์ถูกปิดแล้ว',
          code: 'CYCLE_CLOSED',
        },
        { status: 409 },
      )
    }

    // ── Step 1: Find valid previous reading (PROTECTED: skip FINAL/SEND_REPAIR) ──
    let prev = await findValidPrevReading(assetCode, finalReadingMonth, true)

    // ── Step 2: Same-month INITIAL/RESET fallback (Apps Script lines 619-633) ──
    let isInitial = false
    if (!prev) {
      const baseline = await findSameMonthBaseline(assetCode, finalReadingMonth)
      if (baseline) {
        prev = {
          id: baseline.id,
          meterBw: baseline.meterBw,
          meterColor: baseline.meterColor,
          readingMonth: finalReadingMonth,
          readingDate,
          readingType: baseline.readingType,
        }
        isInitial = true
      } else {
        // Brand-new device, no readings at all
        isInitial = true
      }
    }

    const prevMeterBw = prev?.meterBw ?? 0
    const prevMeterColor = prev?.meterColor ?? 0

    // ── Step 3: Mode-switch detection (TOTAL ↔ BW_COLOR) ──
    const prevHasColor = prev ? prev.meterColor > 0 : false
    const currentHasColor = meterColor > 0
    const { prevMeterColor: adjustedPrevColor, modeSwitched } = detectModeSwitch(
      device.meterMode,
      prevHasColor,
      currentHasColor,
      prevMeterColor,
      meterColor,
    )

    // ── Step 4: Determine readingType ──
    const explicitType = body.readingType as ReadingType | null
    const meterDecreased = isMeterDecreased(meterBw, prevMeterBw, meterColor, adjustedPrevColor, isInitial)

    let readingType: ReadingType
    if (explicitType) {
      readingType = explicitType
    } else if (isInitial) {
      readingType = 'INITIAL'
    } else if (meterDecreased) {
      readingType = 'RESET'
    } else {
      readingType = 'MONTHLY'
    }

    // ── Step 5: needConfirmReset 2-step flow ──
    if (readingType === 'RESET' && !body.confirmReset) {
      return NextResponse.json(
        {
          needConfirmReset: true,
          message: 'มิเตอร์ลดลง — ต้องยืนยันการ reset และกรอกหมายเหตุ',
          assetCode,
          prevMeterBw,
          prevMeterColor: adjustedPrevColor,
          newMeterBw: meterBw,
          newMeterColor: meterColor,
        },
        { status: 409 },
      )
    }

    // ── Step 6: Calculate pages ──
    const pagesBw = calcPagesBw(meterBw, prevMeterBw, readingType)
    const pagesColor = calcPagesColor(meterColor, adjustedPrevColor, readingType)

    // ── Step 7: Check for existing MONTHLY reading in same month (upsert) ──
    const existing = await findExistingMonthlyReading(assetCode, finalReadingMonth)

    const data = {
      assetCode,
      readingDate,
      readingMonth: finalReadingMonth,
      meterBw,
      meterColor,
      pagesBw,
      pagesColor,
      prevMeterBw,
      prevMeterColor: adjustedPrevColor,
      readBy: user.username || user.email,
      remark: body.remark || null,
      readingType,
      locationAtReading: body.locationAtReading || null,
      siteAtReading: body.siteAtReading || device.site || null,
      buildingAtReading: body.buildingAtReading || null,
      floorAtReading: body.floorAtReading || null,
      departmentAtReading: body.departmentAtReading || null,
      departmentCodeAtReading: body.departmentCodeAtReading || null,
    }

    let saved
    if (existing && readingType === 'MONTHLY') {
      // Update existing MONTHLY in-place (Apps Script behavior)
      saved = await db.meterReading.update({
        where: { id: existing.id },
        data,
      })
    } else {
      saved = await db.meterReading.create({ data })
    }

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          action: 'METER_WRITE',
          entity: 'MeterReading',
          entityId: saved.id,
          summary: `จดมิเตอร์ ${assetCode}: BW=${meterBw} สี=${meterColor} (${readingType})`,
          detail: JSON.stringify({
            assetCode,
            meterBw,
            meterColor,
            pagesBw,
            pagesColor,
            readingType,
            reset: readingType === 'RESET',
            modeSwitched,
            isInitial,
          }),
          actor: user.email,
        },
      })
    } catch { /* ignore */ }

    // Best-effort notification
    void notifyMeter({
      assetCode,
      pagesBw,
      pagesColor,
      by: user.username || user.email,
    })

    // Push SSE event
    publishRealtimeEvent({
      type: 'meter-written',
      assetCode,
      site: device.site ?? null,
      payload: { pagesBw, pagesColor, reset: readingType === 'RESET', readingType },
    })

    return NextResponse.json(
      {
        reading: saved,
        reset: readingType === 'RESET',
        pagesBw,
        pagesColor,
        readingType,
        modeSwitched,
        isInitial,
        updated: !!existing,
      },
      { status: existing ? 200 : 201 },
    )
  } catch (err) {
    console.error('POST /api/itam/meter-readings', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save meter reading' },
      { status: 500 },
    )
  }
}
