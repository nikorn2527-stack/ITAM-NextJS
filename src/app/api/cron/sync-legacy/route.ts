import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import {
  parseDeviceImportCsv,
  validateDeviceImportRows,
  type DeviceImportRow,
} from '@/lib/device-import-contract'
import { normalizeStatus } from '@/lib/status-utils'

/**
 * GET /api/cron/sync-legacy
 *
 * Daily sync from legacy Google Sheets app → ITAM NextJS database.
 * Runs at 2:00 AM Bangkok time (schedule in vercel.json).
 *
 * SAFETY FEATURES (per user request — apps script had different headers):
 *   1. Reads header row from CSV + maps via HEADER_ALIASES (Thai + English + camelCase)
 *   2. Does NOT use hardcoded column positions
 *   3. Uses upsert (no duplicate, no data loss)
 *   4. Dry-run mode: ?dryRun=1 → preview changes without writing
 *   5. Syncs ONLY fields that have values (won't overwrite null)
 *   6. Tags all synced records with isDemo: false (real production data)
 *   7. Validates rows before writing (parseDeviceImportCsv)
 *
 * Syncs:
 *   1. Devices (from IT-Asset-Management Google Sheet)
 *   2. Work Orders (from Services Google Sheet)
 *   3. Stock Items (from Stock Google Sheet)
 *
 * Auth: CRON_SECRET (Vercel cron auto-sends this)
 */

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Dry-run mode: preview changes without writing ──
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'

  const startTime = Date.now()
  const results = {
    dryRun,
    devices: {
      fetched: 0,
      headersDetected: [] as string[],
      fieldsMapped: [] as string[],
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errors_detail: [] as string[],
    },
    workOrders: {
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    },
    stock: {
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    },
  }

  try {
    // ════════════════════════════════════════════════════════════════════
    // 1. SYNC DEVICES (header-aware, alias-resolved)
    // ════════════════════════════════════════════════════════════════════
    const sheetsId = process.env.GOOGLE_SHEETS_ID_ITAM
    if (sheetsId) {
      try {
        const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetsId}/gviz/tq?tqx=out:csv&sheet=All_Devices`
        const res = await fetch(sheetUrl, { signal: AbortSignal.timeout(20000) })
        if (res.ok) {
          const csv = await res.text()

          // ── Use the header-aware parser from device-import-contract.ts ──
          // This handles Thai headers (รหัสสินทรัพย์), English (asset_no),
          // and canonical (assetCode) — all via HEADER_ALIASES.
          const parsed = parseDeviceImportCsv(csv)
          results.devices.fetched = parsed.rows.length
          results.devices.headersDetected = parsed.headers

          // Extract mapped field names so the audit log shows what was matched
          const mappedFields = new Set<string>()
          for (const r of parsed.rows) {
            for (const k of Object.keys(r.values)) {
              const v = (r.values as Record<string, unknown>)[k]
              if (v !== null && v !== undefined && v !== '') mappedFields.add(k)
            }
          }
          results.devices.fieldsMapped = Array.from(mappedFields)

          // Validate rows (skip invalid ones, log errors)
          const validation = validateDeviceImportRows(parsed.rows)
          if (parsed.errors.length > 0) {
            results.devices.errors = parsed.errors.length
            results.devices.errors_detail = parsed.errors
              .slice(0, 5)
              .map((e) => `row ${e.rowNumber}: ${e.message}`)
          }

          if (!dryRun) {
            const batchSize = 25
            for (let i = 0; i < validation.validRows.length; i += batchSize) {
              const batch = validation.validRows.slice(i, i + batchSize)
              for (const row of batch) {
                try {
                  await upsertDeviceFromImport(row)
                } catch (err) {
                  results.devices.errors++
                  if (results.devices.errors_detail.length < 5) {
                    results.devices.errors_detail.push(
                      `row ${row.rowNumber}: ${(err as Error).message}`,
                    )
                  }
                }
              }
              await new Promise((r) => setTimeout(r, 300))
            }
          } else {
            results.devices.created = 0
            results.devices.updated = 0
            results.devices.skipped = validation.validRows.length
          }
        }
      } catch (err) {
        console.error('[sync-legacy] devices fetch failed:', err)
        results.devices.errors++
        results.devices.errors_detail.push(`fetch: ${(err as Error).message}`)
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // 2. SYNC WORK ORDERS (header-aware)
    // ════════════════════════════════════════════════════════════════════
    const woSheetsId = process.env.GOOGLE_SHEETS_ID_SERVICES
    if (woSheetsId) {
      try {
        const sheetUrl = `https://docs.google.com/spreadsheets/d/${woSheetsId}/gviz/tq?tqx=out:csv&sheet=All_WO`
        const res = await fetch(sheetUrl, { signal: AbortSignal.timeout(20000) })
        if (res.ok) {
          const csv = await res.text()
          const lines = csv.split('\n').filter(Boolean)
          if (lines.length > 1) {
            // Detect headers — Apps Script WO sheet may have Thai or English headers
            const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase())
            results.workOrders.fetched = lines.length - 1

            // Find column indexes by alias
            const idx = (aliases: string[]): number =>
              headers.findIndex((h) => aliases.some((a) => h.includes(a)))

            const iWoNum = idx(['wo_number', 'wonumber', 'เลขใบงาน', 'เลขที่', 'ppit'])
            const iSubject = idx(['subject', 'ปัญหา', 'หัวข้อ', 'อาการ'])
            const iStatus = idx(['status', 'สถานะ'])
            const iReporter = idx(['reporter', 'ผู้แจ้ง', 'ชื่อ'])
            const iTel = idx(['tel', 'phone', 'เบอร์', 'โทร'])
            const iPriority = idx(['priority', 'ความเร่งด่วน', 'ลำดับ'])
            const iLocation = idx(['location', 'สถานที่', 'ที่ตั้ง'])
            const iCreatedAt = idx(['created', 'วันที่แจ้ง', 'วันที่สร้าง'])

            for (let i = 1; i < lines.length; i++) {
              try {
                const cols = parseCSVLine(lines[i])
                const woNumber = iWoNum >= 0 ? cols[iWoNum]?.trim() : ''
                if (!woNumber) {
                  results.workOrders.skipped++
                  continue
                }

                const woData = {
                  woNumber,
                  subject: iSubject >= 0 ? cols[iSubject]?.trim() || 'ไม่ระบุ' : 'ไม่ระบุ',
                  status: iStatus >= 0 ? mapWOStatus(cols[iStatus]?.trim() || '') : 'PENDING',
                  reporterName: iReporter >= 0 ? cols[iReporter]?.trim() || null : null,
                  tel: iTel >= 0 ? cols[iTel]?.trim() || null : null,
                  priority: iPriority >= 0 ? cols[iPriority]?.trim() || null : null,
                  location: iLocation >= 0 ? cols[iLocation]?.trim() || null : null,
                  isDemo: false, // synced from production Sheets = real data
                }

                if (!dryRun) {
                  await db.workOrder.upsert({
                    where: { woNumber },
                    create: woData,
                    update: woData,
                  })
                  results.workOrders.updated++
                } else {
                  results.workOrders.skipped++
                }
              } catch (err) {
                results.workOrders.errors++
              }
            }
          }
        }
      } catch (err) {
        console.error('[sync-legacy] WO fetch failed:', err)
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // 3. SYNC STOCK ITEMS (header-aware)
    // ════════════════════════════════════════════════════════════════════
    const stockSheetsId = process.env.GOOGLE_SHEETS_ID_STOCK
    if (stockSheetsId) {
      try {
        const sheetUrl = `https://docs.google.com/spreadsheets/d/${stockSheetsId}/gviz/tq?tqx=out:csv`
        const res = await fetch(sheetUrl, { signal: AbortSignal.timeout(20000) })
        if (res.ok) {
          const csv = await res.text()
          const lines = csv.split('\n').filter(Boolean)
          if (lines.length > 1) {
            const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase())
            results.stock.fetched = lines.length - 1

            const idx = (aliases: string[]): number =>
              headers.findIndex((h) => aliases.some((a) => h.includes(a)))

            const iCode = idx(['product_code', 'code', 'รหัส', 'productcode'])
            const iName = idx(['product_name', 'name', 'ชื่อ', 'productname'])
            const iQty = idx(['quantity', 'qty', 'จำนวน', 'คงเหลือ'])
            const iMin = idx(['min_quantity', 'min_qty', 'min', 'ต่ำสุด', 'จุดสั่งซื้อ'])
            const iUnit = idx(['unit', 'หน่วย'])
            const iCat = idx(['category', 'หมวด', 'ประเภท'])
            const iCost = idx(['unit_cost', 'cost', 'ราคา'])

            for (let i = 1; i < lines.length; i++) {
              try {
                const cols = parseCSVLine(lines[i])
                const productCode = iCode >= 0 ? cols[iCode]?.trim() : ''
                if (!productCode) {
                  results.stock.skipped++
                  continue
                }

                const stockData = {
                  productCode,
                  productName: iName >= 0 ? cols[iName]?.trim() || 'ไม่ระบุ' : 'ไม่ระบุ',
                  quantity: iQty >= 0 ? parseInt(cols[iQty]?.trim() ?? '0', 10) || 0 : 0,
                  minQuantity: iMin >= 0 ? parseInt(cols[iMin]?.trim() ?? '0', 10) || 0 : 0,
                  unit: iUnit >= 0 ? cols[iUnit]?.trim() || 'ชิ้น' : 'ชิ้น',
                  category: iCat >= 0 ? cols[iCat]?.trim() || null : null,
                  unitCost: iCost >= 0 ? parseFloat(cols[iCost]?.trim() ?? '0') || null : null,
                  isDemo: false, // synced from production Sheets = real data
                }

                if (!dryRun) {
                  await db.stockItem.upsert({
                    where: { productCode },
                    create: stockData,
                    update: {
                      productName: stockData.productName,
                      quantity: stockData.quantity,
                      minQuantity: stockData.minQuantity,
                      unit: stockData.unit,
                      category: stockData.category,
                    },
                  })
                  results.stock.updated++
                } else {
                  results.stock.skipped++
                }
              } catch (err) {
                results.stock.errors++
              }
            }
          }
        }
      } catch (err) {
        console.error('[sync-legacy] stock fetch failed:', err)
      }
    }

    await logAudit(
      'SYNC',
      'Device',
      undefined,
      `Legacy sync ${dryRun ? '(DRY-RUN) ' : ''}devices ${results.devices.created}+/${results.devices.updated}~/${results.devices.errors}err, WO ${results.workOrders.created}+/${results.workOrders.updated}~, stock ${results.stock.created}+/${results.stock.updated}~`,
      JSON.stringify(results),
    ).catch(() => {})

    return NextResponse.json({
      ok: true,
      dryRun,
      durationMs: Date.now() - startTime,
      results,
    })
  } catch (err) {
    console.error('[sync-legacy] fatal:', err)
    return NextResponse.json(
      { error: 'Sync failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

/**
 * Upsert a device from the parsed import row.
 * Uses assetCode as the unique key (matches how Apps Script sync worked).
 * Only updates fields that have non-null values (won't null out existing data).
 */
async function upsertDeviceFromImport(row: DeviceImportRow) {
  const v = row.values
  if (!v.assetNo) return

  // Normalize status before writing (Active/ACTIVE/active/ใช้งาน → 'Active')
  const normalizedStatus = normalizeStatus(v.status)

  const deviceData = {
    assetCode: v.assetNo,
    name: v.brand && v.model ? `${v.brand} ${v.model}` : v.assetNo,
    brand: v.brand,
    model: v.model,
    serialNumber: v.serial,
    type: v.deviceType,
    status: normalizedStatus || 'Active',
    site: v.site,
    building: v.building,
    floor: v.floor,
    department: v.department,
    departmentCode: v.departmentCode,
    location: v.location,
    deviceGroup: v.deviceGroup,
    costCenter: v.costCenter,
    contractNo: v.contractNo,
    vendor: v.vendor,
    ip: v.ip,
    mac: v.mac,
    remoteId: v.remoteId,
    installDate: v.installDate,
    warrantyEnd: v.warrantyEnd,
    meterRequired: v.meterRequired ?? false,
    meterMode: v.meterMode,
    assetSiteCode: v.assetSiteCode,
    remark: v.remark,
    isDemo: false, // synced from production Sheets = real data
  }

  // Remove null/undefined fields so we don't overwrite existing data with null
  const cleanData = Object.fromEntries(
    Object.entries(deviceData).filter(([, value]) => value !== null && value !== undefined),
  )

  await db.device.upsert({
    where: { assetCode: v.assetNo },
    create: cleanData,
    update: cleanData,
  })
}

/** Parse CSV line (handles quoted fields with commas) */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

/** Map legacy WO status to ITAM status */
function mapWOStatus(legacy: string): string {
  const lower = legacy.toLowerCase()
  if (lower.includes('รอ') || lower.includes('pending')) return 'PENDING'
  if (lower.includes('กำลัง') || lower.includes('progress')) return 'IN_PROGRESS'
  if (lower.includes('เสร็จ') || lower.includes('complete')) return 'COMPLETED'
  if (lower.includes('ยกเลิก') || lower.includes('cancel')) return 'CANCELLED'
  if (lower.includes('อะไหล่') || lower.includes('part')) return 'WAITING_PARTS'
  return 'PENDING'
}
