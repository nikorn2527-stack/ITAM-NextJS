import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

// ============================================================
// Excel / CSV Import — ข้อ 3: ดาต้าเบสขึ้นได้ง่าย แค่เอาไฟล์ Excel ขึ้น
// POST  /api/import          → upload + parse + insert
// GET   /api/import          → list recent ImportJob rows (history)
// GET   /api/import/[id]     → fetch a single ImportJob (errors detail)
// ============================================================

type JobType =
  | 'device'
  | 'work-order'
  | 'stock'
  | 'meter-reading'
  | 'master-data'

const VALID_JOB_TYPES: Set<JobType> = new Set([
  'device',
  'work-order',
  'stock',
  'meter-reading',
  'master-data',
])

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

interface ImportError {
  row: number
  message: string
}

// ------------------------------------------------------------
// Server-side RFC-4180-ish CSV parser (handles quoted fields,
// escaped "" → ", commas/newlines inside quotes). No deps.
// ------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
      continue
    }
    if (c === ',') {
      cur.push(field)
      field = ''
      continue
    }
    if (c === '\r') {
      if (src[i + 1] === '\n') i++
      cur.push(field)
      rows.push(cur)
      cur = []
      field = ''
      continue
    }
    if (c === '\n') {
      cur.push(field)
      rows.push(cur)
      cur = []
      field = ''
      continue
    }
    field += c
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field)
    rows.push(cur)
  }
  // Drop a trailing empty row that often comes from a final newline.
  if (
    rows.length > 0 &&
    rows[rows.length - 1].length === 1 &&
    rows[rows.length - 1][0] === ''
  ) {
    rows.pop()
  }
  return rows
}

function toStr(v: string | undefined): string | null {
  if (v === undefined) return null
  const s = v.trim()
  return s === '' ? null : s
}

function toInt(v: string | undefined, fallback = 0): number {
  if (v === undefined) return fallback
  const t = v.trim()
  if (t === '') return fallback
  const n = Number(t)
  return Number.isFinite(n) ? Math.floor(n) : fallback
}

function toFloat(v: string | undefined): number | null {
  if (v === undefined) return null
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// ------------------------------------------------------------
// Per-type importers. Each returns { processed, errors }.
// ------------------------------------------------------------
async function importDevices(
  rows: string[][],
  headers: string[],
): Promise<{ processed: number; errors: ImportError[] }> {
  const idx = (name: string) =>
    headers.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
  const iAsset = idx('assetCode')
  const iName = idx('name')
  const iBrand = idx('brand')
  const iModel = idx('model')
  const iType = idx('type')
  const iSerial = idx('serialNumber')
  const iStatus = idx('status')
  const iSite = idx('site')
  const iDept = idx('department')
  const iLoc = idx('location')
  const iPurchase = idx('purchaseDate')
  const iWarranty = idx('warrantyMonths')

  const VALID_STATUSES = new Set([
    'active',
    'spare',
    'repair',
    'disposed',
    'in_stock',
  ])

  const errors: ImportError[] = []
  const seen = new Set<string>()
  const toInsert: Array<Record<string, unknown>> = []

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const rowNum = r + 2 // data starts at row 2 (after header)
    const assetCode = toStr(row[iAsset]) ?? ''
    const name = toStr(row[iName])
    const brand = toStr(row[iBrand])
    const model = toStr(row[iModel])
    const type = toStr(row[iType])
    const status = toStr(row[iStatus]) ?? 'active'
    const site = toStr(row[iSite]) ?? 'HQ'

    if (!assetCode) {
      errors.push({ row: rowNum, message: 'ไม่มีรหัสอุปกรณ์ (assetCode)' })
      continue
    }
    if (!name) {
      errors.push({ row: rowNum, message: `ไม่มีชื่อ (assetCode=${assetCode})` })
      continue
    }
    if (!brand) {
      errors.push({ row: rowNum, message: `ไม่มีแบรนด์ (assetCode=${assetCode})` })
      continue
    }
    if (!model) {
      errors.push({ row: rowNum, message: `ไม่มีรุ่น (assetCode=${assetCode})` })
      continue
    }
    if (!type) {
      errors.push({ row: rowNum, message: `ไม่มีประเภท (assetCode=${assetCode})` })
      continue
    }
    if (status && !VALID_STATUSES.has(status)) {
      errors.push({
        row: rowNum,
        message: `สถานะไม่ถูกต้อง: "${status}" (assetCode=${assetCode})`,
      })
      continue
    }
    if (seen.has(assetCode)) {
      errors.push({ row: rowNum, message: `รหัสซ้ำในไฟล์: ${assetCode}` })
      continue
    }
    seen.add(assetCode)
    toInsert.push({
      assetCode,
      name,
      brand,
      model,
      type,
      serialNumber: toStr(row[iSerial]),
      status,
      site,
      department: toStr(row[iDept]),
      location: toStr(row[iLoc]),
      purchaseDate: toStr(row[iPurchase]),
      warrantyMonths: toInt(row[iWarranty], 12),
    })
  }

  if (toInsert.length === 0) return { processed: 0, errors }

  // Pre-filter assetCodes that already exist in DB.
  const existing = await db.device.findMany({
    where: { assetCode: { in: toInsert.map((r) => r.assetCode as string) } },
    select: { assetCode: true },
  })
  const existingSet = new Set(existing.map((d) => d.assetCode))
  const filtered = toInsert.filter((r) => {
    if (existingSet.has(r.assetCode as string)) {
      errors.push({
        row: 0,
        message: `มีอยู่แล้วในระบบ: ${r.assetCode}`,
      })
      return false
    }
    return true
  })

  if (filtered.length === 0) return { processed: 0, errors }

  try {
    const result = await db.device.createMany({
      data: filtered.map((r) => ({
        assetCode: r.assetCode as string,
        name: r.name as string,
        brand: r.brand as string,
        model: r.model as string,
        type: r.type as string,
        serialNumber: r.serialNumber as string | null,
        status: r.status as string,
        site: r.site as string,
        department: r.department as string | null,
        location: r.location as string | null,
        purchaseDate: r.purchaseDate as string | null,
        warrantyMonths: r.warrantyMonths as number,
      })),
    })
    return { processed: result.count, errors }
  } catch (e) {
    console.error('importDevices createMany error', e)
    errors.push({
      row: 0,
      message: e instanceof Error ? e.message : 'DB error (device)',
    })
    return { processed: 0, errors }
  }
}

async function importWorkOrders(
  rows: string[][],
  headers: string[],
): Promise<{ processed: number; errors: ImportError[] }> {
  const idx = (name: string) =>
    headers.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
  const iSubject = idx('subject')
  const iBuilding = idx('building')
  const iLocation = idx('location')
  const iDetails = idx('details')
  const iPriority = idx('priority')
  const iReporter = idx('reporterName')
  const iTel = idx('tel')

  const VALID_PRIORITIES = new Set(['ปกติ', 'ปานกลาง', 'สูง', 'ด่วน'])
  const errors: ImportError[] = []
  let processed = 0

  // Generate WO numbers in bulk: find today's max seq, then increment.
  const now = new Date()
  const ymd =
    `${now.getFullYear()}` +
    `${String(now.getMonth() + 1).padStart(2, '0')}` +
    `${String(now.getDate()).padStart(2, '0')}`
  const prefix = `WO-${ymd}-`
  const lastWo = await db.workOrder.findFirst({
    where: { woNumber: { startsWith: prefix } },
    orderBy: { woNumber: 'desc' },
    select: { woNumber: true },
  })
  let seq = lastWo?.woNumber
    ? parseInt(lastWo.woNumber.match(/(\d+)$/)?.[1] ?? '0', 10)
    : 0

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const rowNum = r + 2
    const subject = toStr(row[iSubject])
    if (!subject) {
      errors.push({ row: rowNum, message: 'ไม่มีประเภทปัญหา (subject)' })
      continue
    }
    const priority = toStr(row[iPriority])
    const prPriority =
      priority && VALID_PRIORITIES.has(priority) ? priority : 'ปกติ'

    seq++
    const woNumber = `${prefix}${String(seq).padStart(3, '0')}`

    try {
      // Ensure woNumber uniqueness — fall back to null if collision.
      const collision = await db.workOrder.findUnique({
        where: { woNumber },
        select: { id: true },
      })
      const data = {
        subject,
        building: toStr(row[iBuilding]),
        location: toStr(row[iLocation]),
        details: toStr(row[iDetails]),
        priority: prPriority,
        reporterName: toStr(row[iReporter]),
        tel: toStr(row[iTel]),
        submissionSource: 'guest' as const,
        status: 'PENDING' as const,
      }
      if (collision) {
        await db.workOrder.create({ data })
      } else {
        await db.workOrder.create({ data: { ...data, woNumber } })
      }
      processed++
    } catch (e) {
      console.error('importWorkOrders create error', e)
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : 'DB error (work-order)',
      })
    }
  }
  return { processed, errors }
}

async function importStock(
  rows: string[][],
  headers: string[],
): Promise<{ processed: number; errors: ImportError[] }> {
  const idx = (name: string) =>
    headers.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
  const iCode = idx('productCode')
  const iName = idx('productName')
  const iCategory = idx('category')
  const iBrand = idx('brand')
  const iUnit = idx('unit')
  const iQty = idx('quantity')
  const iMin = idx('minQuantity')
  const iCost = idx('unitCost')
  const iLoc = idx('location')

  const errors: ImportError[] = []
  const seen = new Set<string>()
  const toInsert: Array<Record<string, unknown>> = []

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const rowNum = r + 2
    const productCode = toStr(row[iCode]) ?? ''
    const productName = toStr(row[iName])

    if (!productCode) {
      errors.push({ row: rowNum, message: 'ไม่มีรหัสสินค้า (productCode)' })
      continue
    }
    if (!productName) {
      errors.push({
        row: rowNum,
        message: `ไม่มีชื่อสินค้า (productCode=${productCode})`,
      })
      continue
    }
    if (seen.has(productCode)) {
      errors.push({ row: rowNum, message: `รหัสซ้ำในไฟล์: ${productCode}` })
      continue
    }
    seen.add(productCode)
    toInsert.push({
      productCode,
      productName,
      category: toStr(row[iCategory]),
      brand: toStr(row[iBrand]),
      unit: toStr(row[iUnit]) ?? 'ชิ้น',
      quantity: toInt(row[iQty], 0),
      minQuantity: toInt(row[iMin], 0),
      unitCost: toFloat(row[iCost]),
      location: toStr(row[iLoc]),
    })
  }

  if (toInsert.length === 0) return { processed: 0, errors }

  const existing = await db.stockItem.findMany({
    where: { productCode: { in: toInsert.map((r) => r.productCode as string) } },
    select: { productCode: true },
  })
  const existingSet = new Set(existing.map((s) => s.productCode))
  const filtered = toInsert.filter((r) => {
    if (existingSet.has(r.productCode as string)) {
      errors.push({
        row: 0,
        message: `มีอยู่แล้วในระบบ: ${r.productCode}`,
      })
      return false
    }
    return true
  })

  if (filtered.length === 0) return { processed: 0, errors }

  try {
    const result = await db.stockItem.createMany({
      data: filtered.map((r) => ({
        productCode: r.productCode as string,
        productName: r.productName as string,
        category: r.category as string | null,
        brand: r.brand as string | null,
        unit: r.unit as string,
        quantity: r.quantity as number,
        minQuantity: r.minQuantity as number,
        unitCost: r.unitCost as number | null,
        location: r.location as string | null,
      })),
    })
    return { processed: result.count, errors }
  } catch (e) {
    console.error('importStock createMany error', e)
    errors.push({
      row: 0,
      message: e instanceof Error ? e.message : 'DB error (stock)',
    })
    return { processed: 0, errors }
  }
}

async function importMeterReadings(
  rows: string[][],
  headers: string[],
): Promise<{ processed: number; errors: ImportError[] }> {
  const idx = (name: string) =>
    headers.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
  const iAsset = idx('assetCode')
  const iDate = idx('readingDate')
  const iBw = idx('meterBw')
  const iColor = idx('meterColor')
  const iReadBy = idx('readBy')
  const iRemark = idx('remark')

  const errors: ImportError[] = []
  let processed = 0

  // Cache devices by assetCode to avoid N+1 queries.
  const assetCodes = new Set<string>()
  for (const row of rows) {
    const ac = toStr(row[iAsset])
    if (ac) assetCodes.add(ac)
  }
  const devices = await db.device.findMany({
    where: { assetCode: { in: Array.from(assetCodes) } },
    select: {
      id: true,
      assetCode: true,
      lastMeterBw: true,
      lastMeterColor: true,
    },
  })
  const deviceByCode = new Map(devices.map((d) => [d.assetCode, d]))

  // Track which devices need their last-meter values persisted.
  const updatesByDeviceId = new Map<string, { bw: number; color: number }>()

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const rowNum = r + 2
    const assetCode = toStr(row[iAsset])
    const readingDate = toStr(row[iDate])

    if (!assetCode) {
      errors.push({ row: rowNum, message: 'ไม่มีรหัสอุปกรณ์ (assetCode)' })
      continue
    }
    if (!readingDate) {
      errors.push({
        row: rowNum,
        message: `ไม่มีวันที่จด (readingDate) — assetCode=${assetCode}`,
      })
      continue
    }
    const device = deviceByCode.get(assetCode)
    if (!device) {
      errors.push({
        row: rowNum,
        message: `ไม่พบอุปกรณ์ในระบบ: ${assetCode}`,
      })
      continue
    }

    const meterBw = toInt(row[iBw], 0)
    const meterColor = toInt(row[iColor], 0)
    // Use the latest known prev value (either the original device value or
    // the value set by a previous row in this same file).
    const latest = updatesByDeviceId.get(device.id)
    const prevMeterBw = latest ? latest.bw : (device.lastMeterBw ?? 0)
    const prevMeterColor = latest ? latest.color : (device.lastMeterColor ?? 0)
    const pagesBw = Math.max(0, meterBw - prevMeterBw)
    const pagesColor = Math.max(0, meterColor - prevMeterColor)
    const readingMonth = readingDate.slice(0, 7) // YYYY-MM

    try {
      await db.meterReading.create({
        data: {
          deviceId: device.id,
          readingDate,
          readingMonth,
          meterBw,
          meterColor,
          pagesBw,
          pagesColor,
          prevMeterBw,
          prevMeterColor,
          readingType: 'MONTHLY',
          readBy: toStr(row[iReadBy]),
          remark: toStr(row[iRemark]),
        },
      })
      // Remember the new last-meter so the next row for this device sees it.
      updatesByDeviceId.set(device.id, { bw: meterBw, color: meterColor })
      processed++
    } catch (e) {
      console.error('importMeterReadings create error', e)
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : 'DB error (meter-reading)',
      })
    }
  }

  // Persist the updated last-meter values back to the device rows.
  for (const [deviceId, val] of updatesByDeviceId) {
    try {
      await db.device.update({
        where: { id: deviceId },
        data: { lastMeterBw: val.bw, lastMeterColor: val.color },
      })
    } catch (e) {
      console.error('importMeterReadings device update error', e)
    }
  }

  return { processed, errors }
}

async function importMasterData(
  rows: string[][],
  headers: string[],
): Promise<{ processed: number; errors: ImportError[] }> {
  const idx = (name: string) =>
    headers.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase())
  const iCategory = idx('category')
  const iCode = idx('code')
  const iLabel = idx('label')
  const iParent = idx('parentRef')
  const iSite = idx('siteCode')

  const errors: ImportError[] = []
  let processed = 0

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const rowNum = r + 2
    const category = toStr(row[iCategory])
    const code = toStr(row[iCode])
    const label = toStr(row[iLabel])

    if (!category) {
      errors.push({ row: rowNum, message: 'ไม่มีหมวดหมู่ (category)' })
      continue
    }
    if (!code) {
      errors.push({ row: rowNum, message: 'ไม่มีรหัส (code)' })
      continue
    }
    if (!label) {
      errors.push({
        row: rowNum,
        message: `ไม่มีชื่อแสดง (label) — code=${code}`,
      })
      continue
    }

    try {
      await db.masterItem.create({
        data: {
          category,
          code,
          label,
          parentRef: toStr(row[iParent]),
          siteCode: toStr(row[iSite]),
        },
      })
      processed++
    } catch (e) {
      console.error('importMasterData create error', e)
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : 'DB error (master-data)',
      })
    }
  }
  return { processed, errors }
}

function jobTypeLabel(t: JobType): string {
  switch (t) {
    case 'device':
      return 'อุปกรณ์'
    case 'work-order':
      return 'ใบแจ้งซ่อม'
    case 'stock':
      return 'สินค้าคงคลัง'
    case 'meter-reading':
      return 'การจดมิเตอร์'
    case 'master-data':
      return 'ข้อมูลมาตรฐาน'
    default:
      return t
  }
}

// ============================================================
// POST /api/import  — multipart/form-data: { file, jobType }
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    const jobType = String(form.get('jobType') ?? '').trim() as JobType

    if (!VALID_JOB_TYPES.has(jobType)) {
      return NextResponse.json(
        { error: `jobType ไม่ถูกต้อง (ได้รับ: "${jobType}")` },
        { status: 400 },
      )
    }
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'ไม่พบไฟล์ในคำขอ (field "file")' },
        { status: 400 },
      )
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'ไฟล์ว่างเปล่า' }, { status: 400 })
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `ไฟล์ใหญ่เกินไป (สูงสุด ${MAX_FILE_BYTES / 1024 / 1024} MB)` },
        { status: 400 },
      )
    }

    const fileName = file.name
    const lower = fileName.toLowerCase()
    const isCsv = lower.endsWith('.csv') || lower.endsWith('.txt')
    const isXlsx = lower.endsWith('.xlsx') || lower.endsWith('.xls')
    const fileType = isCsv ? 'csv' : isXlsx ? 'excel' : 'csv'

    // Create the ImportJob row first with status='processing'.
    const job = await db.importJob.create({
      data: {
        jobType,
        fileName,
        fileType,
        status: 'processing',
        uploadedBy: 'system',
      },
    })

    // Excel is accepted but not yet parsed — surface a friendly message.
    if (isXlsx) {
      const errMsg = 'กรุณาใช้ไฟล์ CSV (ยังไม่รองรับ .xlsx ในขณะนี้)'
      const updated = await db.importJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errors: JSON.stringify([{ row: 0, message: errMsg }]),
          completedAt: new Date(),
        },
      })
      return NextResponse.json(
        { job: updated, error: errMsg },
        { status: 400 },
      )
    }

    // Read file as text and parse CSV.
    const text = await file.text()
    const grid = parseCsv(text)
    if (grid.length < 2) {
      const errMsg = 'ไฟล์ CSV ไม่มีข้อมูล (ต้องมีบรรทัดหัวคอลัมน์ + อย่างน้อย 1 แถว)'
      const updated = await db.importJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errors: JSON.stringify([{ row: 0, message: errMsg }]),
          completedAt: new Date(),
        },
      })
      return NextResponse.json({ job: updated, error: errMsg }, { status: 400 })
    }

    const headers = grid[0].map((h) => h.trim())
    const dataRows = grid.slice(1).filter(
      (r) => !(r.length === 1 && r[0] === ''),
    )
    const totalRows = dataRows.length

    let result: { processed: number; errors: ImportError[] }
    try {
      switch (jobType) {
        case 'device':
          result = await importDevices(dataRows, headers)
          break
        case 'work-order':
          result = await importWorkOrders(dataRows, headers)
          break
        case 'stock':
          result = await importStock(dataRows, headers)
          break
        case 'meter-reading':
          result = await importMeterReadings(dataRows, headers)
          break
        case 'master-data':
          result = await importMasterData(dataRows, headers)
          break
        default:
          result = {
            processed: 0,
            errors: [{ row: 0, message: 'jobType ไม่รองรับ' }],
          }
      }
    } catch (e) {
      console.error('POST /api/import — importer threw', e)
      const errMsg = e instanceof Error ? e.message : 'Importer error'
      const updated = await db.importJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          totalRows,
          processedRows: 0,
          errorRows: totalRows,
          errors: JSON.stringify([{ row: 0, message: errMsg }]),
          completedAt: new Date(),
        },
      })
      return NextResponse.json({ job: updated, error: errMsg }, { status: 500 })
    }

    const errorRows = totalRows - result.processed
    const status = result.processed === 0 && totalRows > 0 ? 'failed' : 'completed'

    const updated = await db.importJob.update({
      where: { id: job.id },
      data: {
        status,
        totalRows,
        processedRows: result.processed,
        errorRows,
        errors:
          result.errors.length > 0
            ? JSON.stringify(result.errors.slice(0, 200))
            : null,
        completedAt: new Date(),
      },
    })

    await logAudit(
      'IMPORT',
      jobType.toUpperCase(),
      job.id,
      `นำเข้า${jobTypeLabel(jobType)}: ${result.processed}/${totalRows} แถว (${fileName})`,
      {
        jobType,
        fileName,
        totalRows,
        processed: result.processed,
        errorCount: result.errors.length,
        errors: result.errors.slice(0, 20),
      },
    )

    return NextResponse.json({ job: updated }, { status: 201 })
  } catch (err) {
    console.error('POST /api/import', err)
    const message = err instanceof Error ? err.message : 'Import failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================================
// GET /api/import  — recent ImportJob history (default 50)
// ============================================================
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.min(
      200,
      Math.max(1, Number(searchParams.get('limit') ?? '50') || 50),
    )
    const jobs = await db.importJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return NextResponse.json({ jobs })
  } catch (err) {
    console.error('GET /api/import', err)
    return NextResponse.json(
      { error: 'Failed to fetch import jobs' },
      { status: 500 },
    )
  }
}
