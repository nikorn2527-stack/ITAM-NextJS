import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

interface ImportDeviceInput {
  assetCode?: unknown
  name?: unknown
  brand?: unknown
  model?: unknown
  type?: unknown
  serialNumber?: unknown
  status?: unknown
  site?: unknown
  department?: unknown
  departmentCode?: unknown
  parentRef?: unknown
  displayLabel?: unknown
  location?: unknown
  purchaseDate?: unknown
  lastMeterReading?: unknown
}

const VALID_STATUSES = new Set(['active', 'spare', 'repair', 'disposed'])

function toStr(v: unknown): string | null {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function toInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v)
  if (typeof v === 'string') {
    const n = Number(v.trim())
    if (Number.isFinite(n)) return Math.floor(n)
  }
  return 0
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const devices = Array.isArray(body?.devices) ? (body.devices as ImportDeviceInput[]) : []

    if (devices.length === 0) {
      return NextResponse.json(
        { error: 'ไม่พบข้อมูลอุปกรณ์ที่จะนำเข้า' },
        { status: 400 },
      )
    }
    if (devices.length > 5000) {
      return NextResponse.json(
        { error: 'นำเข้าได้ไม่เกิน 5,000 รายการต่อครั้ง' },
        { status: 400 },
      )
    }

    // Normalize + validate each row.
    const errors: Array<{ row: number; message: string }> = []
    const seenAssetCodes = new Set<string>()
    const validRows: Array<Record<string, unknown>> = []

    devices.forEach((raw, idx) => {
      const rowNum = idx + 1
      const assetCode = toStr(raw.assetCode)
      const name = toStr(raw.name)
      const brand = toStr(raw.brand)
      const model = toStr(raw.model)
      const type = toStr(raw.type)
      const status = toStr(raw.status) ?? 'active'
      const site = toStr(raw.site) ?? 'HQ'

      if (!assetCode) {
        errors.push({ row: rowNum, message: 'ไม่มีรหัสอุปกรณ์ (assetCode)' })
        return
      }
      if (!name) {
        errors.push({ row: rowNum, message: `ไม่มีชื่ออุปกรณ์ (assetCode=${assetCode})` })
        return
      }
      if (!brand) {
        errors.push({ row: rowNum, message: `ไม่มีแบรนด์ (assetCode=${assetCode})` })
        return
      }
      if (!model) {
        errors.push({ row: rowNum, message: `ไม่มีรุ่น (assetCode=${assetCode})` })
        return
      }
      if (!type) {
        errors.push({ row: rowNum, message: `ไม่มีประเภท (assetCode=${assetCode})` })
        return
      }
      if (!VALID_STATUSES.has(status)) {
        errors.push({
          row: rowNum,
          message: `สถานะไม่ถูกต้อง: "${status}" (assetCode=${assetCode})`,
        })
        return
      }
      if (seenAssetCodes.has(assetCode)) {
        errors.push({
          row: rowNum,
          message: `รหัสอุปกรณ์ซ้ำในไฟล์: ${assetCode}`,
        })
        return
      }
      seenAssetCodes.add(assetCode)
      validRows.push({
        assetCode,
        name,
        brand,
        model,
        type,
        serialNumber: toStr(raw.serialNumber),
        status,
        site,
        department: toStr(raw.department),
        departmentCode: toStr(raw.departmentCode),
        parentRef: toStr(raw.parentRef),
        displayLabel: toStr(raw.displayLabel),
        location: toStr(raw.location),
        purchaseDate: toStr(raw.purchaseDate),
        lastMeterReading: toInt(raw.lastMeterReading),
      })
    })

    // Pre-filter rows whose assetCode already exists in DB.
    const codes = validRows.map((r) => r.assetCode as string)
    const existing = await db.device.findMany({
      where: { assetCode: { in: codes } },
      select: { assetCode: true },
    })
    const existingSet = new Set(existing.map((d) => d.assetCode))

    const toInsert = validRows.filter((r) => {
      if (existingSet.has(r.assetCode as string)) {
        errors.push({
          row: 0,
          message: `รหัสอุปกรณ์มีอยู่แล้วในระบบ: ${r.assetCode}`,
        })
        return false
      }
      return true
    })

    let inserted = 0
    if (toInsert.length > 0) {
      const result = await db.device.createMany({
        data: toInsert.map((r) => ({
          assetCode: r.assetCode as string,
          name: r.name as string,
          brand: r.brand as string,
          model: r.model as string,
          type: r.type as string,
          serialNumber: r.serialNumber as string | null,
          status: r.status as string,
          site: r.site as string,
          department: r.department as string | null,
          departmentCode: r.departmentCode as string | null,
          parentRef: r.parentRef as string | null,
          displayLabel: r.displayLabel as string | null,
          location: r.location as string | null,
          purchaseDate: r.purchaseDate as string | null,
          lastMeterReading: r.lastMeterReading as number,
        })),
      })
      inserted = result.count
    }

    const skipped = devices.length - inserted

    await logAudit(
      'IMPORT',
      'Device',
      null,
      `นำเข้าอุปกรณ์ CSV: ${inserted} รายการ`,
      {
        inserted,
        skipped,
        errorCount: errors.length,
        errors: errors.slice(0, 50),
      },
    )

    return NextResponse.json(
      {
        inserted,
        skipped,
        errors,
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('POST /api/devices/import', err)
    const message = err instanceof Error ? err.message : 'Failed to import devices'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
