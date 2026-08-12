import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

const EXCLUDED_FROM_PREVIOUS = new Set(['FINAL', 'SEND_REPAIR'])
const USAGE_TYPES = new Set(['MONTHLY', 'CHECKOUT', 'FINAL', 'RETURN', 'SEND_REPAIR'])
const LIFECYCLE_TYPES = new Set([
  'MONTHLY',
  'INITIAL',
  'FINAL',
  'RESET',
  'CHECKOUT',
  'SEND_REPAIR',
  'RETURN',
])

class MeterValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'MeterValidationError'
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function numberValue(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? Math.floor(n) : Number.NaN
}

function normaliseMonth(value: unknown): string {
  const raw = String(value ?? '').trim()
  const match = raw.match(/^(\d{4})[-/]?(\d{1,2})/)
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}`
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 7)
}

function compareReadingOrder(
  left: { readingMonth: string | null; readingDate: string; createdAt: Date },
  right: { readingMonth: string | null; readingDate: string; createdAt: Date },
): number {
  const leftMonth = normaliseMonth(left.readingMonth || left.readingDate)
  const rightMonth = normaliseMonth(right.readingMonth || right.readingDate)
  if (leftMonth !== rightMonth) return leftMonth.localeCompare(rightMonth)
  if (left.readingDate !== right.readingDate) {
    return left.readingDate.localeCompare(right.readingDate)
  }
  return left.createdAt.getTime() - right.createdAt.getTime()
}

function extractReadingInputs(body: unknown): Record<string, unknown>[] {
  const record = asRecord(body)
  if (!record) return []
  const raw = Array.isArray(record.readings) ? record.readings : [record]
  return raw.map(asRecord).filter((value): value is Record<string, unknown> => value !== null)
}

function getReadingNumber(input: Record<string, unknown>): number {
  return numberValue(input.meterBw ?? input.meterBW ?? input.reading, Number.NaN)
}

function getColorNumber(input: Record<string, unknown>): number {
  return numberValue(input.meterColor ?? input.meterCOLOR, 0)
}

function isConfirmedReset(input: Record<string, unknown>, body: Record<string, unknown>): boolean {
  return input.confirmReset === true || body.confirmReset === true
}

async function processOneReading(
  input: Record<string, unknown>,
  body: Record<string, unknown>,
) {
  const deviceId = String(input.deviceId ?? body.deviceId ?? '').trim()
  const rawDate = String(input.date ?? input.readingDate ?? body.date ?? '').trim()
  const requestedType = String(
    input.readingType ?? input.eventType ?? body.readingType ?? '',
  )
    .trim()
    .toUpperCase()
  const remark = String(input.remark ?? body.remark ?? '').trim()

  if (!deviceId || !rawDate) {
    throw new MeterValidationError(
      'Missing required fields: deviceId, reading, date',
      'METER_FIELDS_REQUIRED',
    )
  }

  const meterBw = getReadingNumber(input)
  const meterColorInput = getColorNumber(input)
  if (!Number.isInteger(meterBw) || meterBw < 0) {
    throw new MeterValidationError(
      'meterBw/reading must be a non-negative number',
      'METER_VALUE_INVALID',
    )
  }
  if (!Number.isInteger(meterColorInput) || meterColorInput < 0) {
    throw new MeterValidationError(
      'meterColor must be a non-negative number',
      'METER_COLOR_INVALID',
    )
  }
  if (requestedType && !LIFECYCLE_TYPES.has(requestedType)) {
    throw new MeterValidationError(
      `ไม่รู้จัก readingType: ${requestedType}`,
      'METER_READING_TYPE_INVALID',
    )
  }

  const readingMonth = normaliseMonth(input.readingMonth ?? body.readingMonth ?? rawDate)
  if (!readingMonth) {
    throw new MeterValidationError(
      'date/readingMonth ต้องเป็นวันที่หรือเดือนที่ถูกต้อง',
      'METER_DATE_INVALID',
    )
  }

  return db.$transaction(async (tx) => {
    const device = await tx.device.findUnique({ where: { id: deviceId } })
    if (!device) {
      throw new MeterValidationError('Device not found', 'DEVICE_NOT_FOUND', 404)
    }

    let meterBwValue = meterBw
    let meterColor = meterColorInput
    const meterMode = String(device.meterMode ?? '').trim().toUpperCase()
    if (meterMode === 'TOTAL' || meterMode.includes('รวม')) {
      meterBwValue = meterBwValue || meterColor
      meterColor = 0
    }

    const history = await tx.meterReading.findMany({
      where: { deviceId },
      select: {
        id: true,
        readingId: true,
        readingDate: true,
        readingMonth: true,
        meterBw: true,
        meterColor: true,
        pagesBw: true,
        pagesColor: true,
        readingType: true,
        createdAt: true,
      },
      orderBy: [{ readingDate: 'asc' }, { createdAt: 'asc' }],
    })

    const previousCandidates = history.filter((reading) => {
      const month = normaliseMonth(reading.readingMonth || reading.readingDate)
      const type = String(reading.readingType ?? '').trim().toUpperCase()
      return month < readingMonth && !EXCLUDED_FROM_PREVIOUS.has(type)
    })
    let previous = previousCandidates.sort(compareReadingOrder).at(-1) ?? null

    // Same-month INITIAL/RESET is a valid baseline for a follow-up MONTHLY entry.
    const isMonthly = requestedType === '' || requestedType === 'MONTHLY'
    if (!previous && isMonthly) {
      previous =
        history
          .filter((reading) => {
            const month = normaliseMonth(reading.readingMonth || reading.readingDate)
            const type = String(reading.readingType ?? '').trim().toUpperCase()
            return month === readingMonth && new Set(['INITIAL', 'RESET']).has(type)
          })
          .sort(compareReadingOrder)
          .at(-1) ?? null
    }

    const isBrandNew = !previous
    const isInitial = input.isInitialReading === true || isBrandNew
    let previousBw = isInitial ? meterBwValue : previous?.meterBw ?? 0
    let previousColor = isInitial ? meterColor : previous?.meterColor ?? 0
    let modeSwitched = false

    if (!isInitial && previous) {
      const previousHadColor =
        previous.meterColor > 0 || previous.pagesColor > 0
      const previousWasBwOnly = previous.meterColor === 0 && previous.pagesColor === 0
      if (previousWasBwOnly && meterColor > 0) {
        previousColor = meterColor
        modeSwitched = true
      } else if (previousHadColor && meterColor === 0 && meterBwValue > 0) {
        modeSwitched = true
      }
    }

    const decreased =
      !isInitial && (meterBwValue < previousBw || meterColor < previousColor)
    const readingType = isInitial
      ? 'INITIAL'
      : decreased
        ? 'RESET'
        : requestedType || 'MONTHLY'

    if (decreased && !isConfirmedReset(input, body)) {
      throw new MeterValidationError(
        `มิเตอร์ลดลง (BW: ${meterBwValue} < ${previousBw}, Color: ${meterColor} < ${previousColor}) — กรุณายืนยันการตั้งฐานใหม่`,
        'RESET_REQUIRES_CONFIRMATION',
        409,
        {
          deviceId,
          assetCode: device.assetCode,
          meterBw: meterBwValue,
          meterColor,
          prevMeterBw: previousBw,
          prevMeterColor: previousColor,
        },
      )
    }

    const pagesBw =
      !isInitial && USAGE_TYPES.has(readingType)
        ? Math.max(0, meterBwValue - previousBw)
        : 0
    const pagesColor =
      !isInitial && USAGE_TYPES.has(readingType)
        ? Math.max(0, meterColor - previousColor)
        : 0

    const remarkParts = remark ? [remark] : []
    if (readingType === 'INITIAL') remarkParts.push('มิเตอร์ตั้งต้นตอนติดตั้ง/เริ่มใช้งาน')
    if (readingType === 'RESET') remarkParts.push('ตั้งฐานมิเตอร์ใหม่')
    if (readingType === 'CHECKOUT' || readingType === 'SEND_REPAIR') {
      remarkParts.push('มิเตอร์ก่อนนำเครื่องออก/ส่งซ่อม')
    }
    if (readingType === 'FINAL') remarkParts.push('มิเตอร์ปิดงานก่อนถอน/เลิกใช้งาน')
    if (readingType === 'RETURN') remarkParts.push('มิเตอร์เมื่อกลับมาติดตั้ง')
    if (modeSwitched) remarkParts.push('เปลี่ยนโหมดมิเตอร์ (รวม/แยกสี)')

    const existingMonthly = isMonthly
      ? history.find(
          (reading) =>
            normaliseMonth(reading.readingMonth || reading.readingDate) === readingMonth &&
            String(reading.readingType ?? '').trim().toUpperCase() === 'MONTHLY',
        )
      : null

    const inputEventType = String(input.eventType ?? body.eventType ?? '').trim() || null
    const inputEventId = String(input.eventId ?? body.eventId ?? '').trim() || null
    const locationAtReading = String(input.locationAtReading ?? '').trim() || null
    const siteAtReading = String(input.siteAtReading ?? '').trim() || device.site || null
    const buildingAtReading = String(input.buildingAtReading ?? '').trim() || device.building || null
    const floorAtReading = String(input.floorAtReading ?? '').trim() || device.floor || null
    const departmentAtReading =
      String(input.departmentAtReading ?? '').trim() || device.department || null
    const departmentCodeAtReading = String(input.departmentCodeAtReading ?? '').trim() || device.departmentCode || null
    const readBy = String(input.readBy ?? body.readBy ?? '').trim() || 'system'
    const readingId =
      existingMonthly?.readingId ??
      `MR-${Date.now()}-${device.assetCode.replace(/[^A-Za-z0-9_-]/g, '')}-${randomUUID().slice(0, 8)}`

    const data = {
      readingId,
      deviceId,
      assetCode: device.assetCode,
      meterBw: meterBwValue,
      meterColor,
      prevMeterBw: previousBw,
      prevMeterColor: previousColor,
      pagesBw,
      pagesColor,
      readingDate: rawDate,
      readingMonth,
      readingType,
      readBy,
      remark: remarkParts.length ? remarkParts.join(' | ') : null,
      locationAtReading,
      siteAtReading,
      buildingAtReading,
      floorAtReading,
      departmentAtReading,
      departmentCodeAtReading,
      eventType: inputEventType || readingType,
      eventId: inputEventId,
    }

    const saved = existingMonthly
      ? await tx.meterReading.update({ where: { id: existingMonthly.id }, data })
      : await tx.meterReading.create({ data })

    await tx.device.update({
      where: { id: deviceId },
      data: { lastMeterBw: meterBwValue, lastMeterColor: meterColor },
    })

    return {
      saved,
      device,
      previousBw,
      previousColor,
      pagesBw,
      pagesColor,
      readingType,
      delta: meterBwValue - previousBw + (meterColor - previousColor),
      wasUpdated: Boolean(existingMonthly),
    }
  })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const deviceId = searchParams.get('deviceId')?.trim() ?? ''
    const cycleId = searchParams.get('cycleId')?.trim() ?? ''
    const aggregate = searchParams.get('aggregate')?.trim() ?? ''

    if (aggregate === 'monthly') {
      const readings = await db.meterReading.findMany({
        select: { readingDate: true, pagesBw: true, pagesColor: true },
        orderBy: { readingDate: 'asc' },
      })
      const map = new Map<string, number>()
      for (const reading of readings) {
        const month = reading.readingDate.slice(0, 7)
        map.set(month, (map.get(month) ?? 0) + reading.pagesBw + reading.pagesColor)
      }
      return NextResponse.json({
        monthly: Array.from(map.entries()).map(([month, value]) => ({ month, value })),
      })
    }

    if (aggregate === 'byDevice') {
      const readings = await db.meterReading.findMany({
        select: { deviceId: true, pagesBw: true, pagesColor: true },
      })
      const map = new Map<string, number>()
      for (const reading of readings) {
        map.set(
          reading.deviceId,
          (map.get(reading.deviceId) ?? 0) + reading.pagesBw + reading.pagesColor,
        )
      }
      const devices = await db.device.findMany({
        select: { id: true, name: true, assetCode: true },
      })
      const byDevice = devices
        .map((device) => ({
          id: device.id,
          name: device.name,
          assetCode: device.assetCode,
          value: map.get(device.id) ?? 0,
        }))
        .sort((a, b) => b.value - a.value)
      return NextResponse.json({ byDevice })
    }

    const where: Record<string, unknown> = {}
    if (deviceId) where.deviceId = deviceId
    if (cycleId) {
      const cycle = await db.cycle.findUnique({ where: { id: cycleId } })
      if (cycle) where.readingDate = { gte: cycle.startDate, lte: cycle.endDate }
    }

    const readings = await db.meterReading.findMany({
      where,
      orderBy: [{ readingDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        device: { select: { id: true, name: true, assetCode: true, brand: true, model: true } },
      },
      take: 500,
    })
    return NextResponse.json({ readings })
  } catch (err) {
    console.error('GET /api/meter', err)
    return NextResponse.json({ error: 'Failed to fetch meter readings' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = asRecord(await req.json())
    if (!body) {
      return NextResponse.json({ error: 'Request body must be an object' }, { status: 400 })
    }

    const inputs = extractReadingInputs(body)
    if (inputs.length === 0) {
      return NextResponse.json({ error: 'Missing meter reading payload' }, { status: 400 })
    }

    const results: Array<Record<string, unknown>> = []
    const errors: Array<Record<string, unknown>> = []

    // Process each device separately so one invalid row does not roll back valid rows.
    for (const input of inputs) {
      try {
        const result = await processOneReading(input, body)
        await logAudit(
          'METER_READING',
          'MeterReading',
          result.saved.id,
          `จดมิเตอร์ ${result.device.assetCode}: ${result.previousBw.toLocaleString()}→${result.saved.meterBw.toLocaleString()} (${result.delta >= 0 ? '+' : ''}${result.delta.toLocaleString()})`,
          {
            deviceId: result.saved.deviceId,
            assetCode: result.device.assetCode,
            reading: result.saved.meterBw,
            prevReading: result.previousBw,
            prevColor: result.previousColor,
            pagesBw: result.pagesBw,
            pagesColor: result.pagesColor,
            readingType: result.readingType,
            date: result.saved.readingDate,
            remark: result.saved.remark,
          },
        )
        results.push({
          ...result.saved,
          wasUpdated: result.wasUpdated,
          warning:
            result.pagesBw + result.pagesColor > 20000
              ? `ค่าเพิ่มขึ้น ${(result.pagesBw + result.pagesColor).toLocaleString()} แผ่น (เกิน 20,000 แผ่น) กรุณาตรวจสอบ`
              : null,
        })
      } catch (error) {
        const inputDeviceId = String(input.deviceId ?? body.deviceId ?? '').trim()
        if (error instanceof MeterValidationError) {
          errors.push({
            deviceId: inputDeviceId || null,
            code: error.code,
            error: error.message,
            details: error.details ?? null,
          })
        } else {
          console.error('POST /api/meter row failed', error)
          errors.push({
            deviceId: inputDeviceId || null,
            code: 'METER_SAVE_FAILED',
            error: error instanceof Error ? error.message : 'Failed to save reading',
          })
        }
      }
    }

    if (inputs.length === 1 && errors.length > 0 && results.length === 0) {
      const error = errors[0]
      return NextResponse.json(error, {
        status: error.code === 'RESET_REQUIRES_CONFIRMATION' ? 409 : 400,
      })
    }

    if (results.length === 0) {
      return NextResponse.json({ readings: [], errors }, { status: 400 })
    }

    if (inputs.length === 1) {
      return NextResponse.json({ reading: results[0], warning: results[0].warning }, { status: 201 })
    }

    return NextResponse.json(
      { readings: results, errors, summary: { requested: inputs.length, saved: results.length, failed: errors.length } },
      { status: errors.length ? 207 : 201 },
    )
  } catch (err) {
    console.error('POST /api/meter', err)
    const message = err instanceof Error ? err.message : 'Failed to save reading'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
