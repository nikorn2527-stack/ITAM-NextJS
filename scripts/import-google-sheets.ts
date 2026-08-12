/**
 * import-google-sheets.ts — นำข้อมูลจาก Google Sheets เข้า Prisma/PostgreSQL
 *
 * ตัวอย่างการใช้งาน:
 *   bun run scripts/import-google-sheets.ts --dry-run
 *   bun run scripts/import-google-sheets.ts --only=All_Devices,Meter_Readings
 *   bun run scripts/import-google-sheets.ts --limit=100 --only=All_Devices
 *
 * หลักการสำคัญ:
 * - ใช้ bounded range เพื่อหลีกเลี่ยง gviz CSV ที่รวม header กับค่าข้อมูลใน sheet ใหญ่
 * - ตรวจสอบและ normalize header ก่อน mapping
 * - ไม่กลืน error: แสดงเหตุผลที่ skip และตัวอย่างแถวที่มีปัญหา
 * - ใช้ upsert/deterministic import IDs เพื่อให้รันซ้ำได้อย่างปลอดภัย
 * - dry-run ใช้ตรวจจำนวนแถวและ headers โดยไม่เขียนฐานข้อมูล
 */

import { PrismaClient } from '@prisma/client'
import { parse } from 'csv-parse/sync'

const db = new PrismaClient()

const SPREADSHEET_ID = '1Zi2sDW1xeAUdHb6MSt0AdpZttRY8C3-WB5agHLaeUpc'
const BASE_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`

type SheetName = keyof typeof SHEETS

type Row = Record<string, string>

type ImportStats = {
  sheet: string
  sourceRows: number
  inserted: number
  updated: number
  skipped: number
  errors: Record<string, number>
  samples: Array<{ row: number; reason: string }>
}

const SHEETS = {
  All_Devices: 'All_Devices',
  Meter_Readings: 'Meter_Readings',
  Master_Items: 'Master_Items',
  Master_Category: 'Master_Category',
  Location_History: 'Location_History',
  Audit_Log: 'Audit_Log',
  User_Permissions: 'User_Permissions',
  Site_Attributes: 'Site_Attributes',
  App_Settings: 'App_Settings',
  License_Records: 'License_Records',
} as const

const SHEET_RANGES: Record<SheetName, string> = {
  All_Devices: 'A1:AB',
  Meter_Readings: 'A1:U',
  Master_Items: 'A1:J',
  Master_Category: 'A1:D',
  Location_History: 'A1:V',
  Audit_Log: 'A1:D',
  User_Permissions: 'A1:K',
  Site_Attributes: 'A1:F',
  App_Settings: 'A1:D',
  License_Records: 'A1:I',
}

const FALLBACK_HEADERS: Partial<Record<SheetName, string[]>> = {
  Audit_Log: ['Timestamp', 'Action', 'User', 'Details'],
  Site_Attributes: ['SiteCode', 'SiteName', 'LineOA', 'Hotline', 'PaperRateBW', 'PaperRateColor'],
  App_Settings: ['Key', 'Value', 'Description', 'UpdatedAt'],
}

const args = new Set(process.argv.slice(2))
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length)
const onlySheets = onlyArg
  ? new Set(onlyArg.split(',').map((value) => value.trim()).filter(Boolean))
  : null
const dryRun = args.has('--dry-run')
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length)
const rowLimit = limitArg && Number.isFinite(Number(limitArg)) ? Math.max(0, Number(limitArg)) : null

function shouldRun(sheet: SheetName): boolean {
  return !onlySheets || onlySheets.has(sheet)
}

function clean(value: unknown): string | null {
  if (value == null) return null
  const trimmed = String(value).replace(/^\uFEFF/, '').trim()
  if (!trimmed || /^(undefined|null)$/i.test(trimmed)) return null
  return trimmed
}

function parseBool(value: unknown, defaultValue = false): boolean {
  const cleaned = clean(value)
  if (cleaned == null) return defaultValue
  return ['TRUE', '1', 'YES', 'Y', 'ON', 'ACTIVE'].includes(cleaned.toUpperCase())
}

function parseInt0(value: unknown): number {
  const cleaned = clean(value)?.replace(/,/g, '')
  if (!cleaned) return 0
  const number = Number.parseInt(cleaned, 10)
  return Number.isFinite(number) ? number : 0
}

function parseFloat0(value: unknown): number {
  const cleaned = clean(value)?.replace(/,/g, '')
  if (!cleaned) return 0
  const number = Number.parseFloat(cleaned)
  return Number.isFinite(number) ? number : 0
}

function parseDateOrNull(value: unknown): Date | null {
  const cleaned = clean(value)
  if (!cleaned) return null
  const parsed = new Date(cleaned)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').replace(/^\uFEFF/, '').trim()
}

function splitHeaderAndValue(value: string, header: string): string {
  const prefix = `${header} `
  if (value === header) return ''
  if (value.startsWith(prefix)) return value.slice(prefix.length).trim()
  return value.trim()
}

function parseRows(csvText: string, fallbackHeaders?: string[]): Row[] {
  const matrix = parse(csvText, {
    columns: false,
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: false,
  }) as unknown as string[][]
  if (!matrix.length) return []

  const first = matrix[0].map(normalizeHeader)
  const fallback = fallbackHeaders?.map(normalizeHeader)
  const headerLooksConcatenated = Boolean(
    fallback &&
      first.length === fallback.length &&
      first.some((value, index) => value.startsWith(`${fallback[index]} `)),
  )

  const headers = headerLooksConcatenated ? fallback! : first
  const start = 1
  const rows: Row[] = []

  if (headerLooksConcatenated) {
    const firstData: Row = {}
    headers.forEach((header, index) => {
      firstData[header] = splitHeaderAndValue(first[index] ?? '', header)
    })
    if (Object.values(firstData).some((value) => clean(value) != null)) rows.push(firstData)
  }

  for (let rowIndex = start; rowIndex < matrix.length; rowIndex += 1) {
    const values = matrix[rowIndex] ?? []
    const row: Row = {}
    headers.forEach((header, columnIndex) => {
      row[header] = values[columnIndex] ?? ''
    })
    if (Object.values(row).some((value) => clean(value) != null)) rows.push(row)
  }

  return rows
}

async function fetchSheet(sheet: SheetName): Promise<{ csv: string; range: string }> {
  const range = SHEET_RANGES[sheet]
  const url = `${BASE_URL}&sheet=${encodeURIComponent(SHEETS[sheet])}&range=${encodeURIComponent(range)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`fetch ${sheet} failed with HTTP ${response.status}`)
  return { csv: await response.text(), range }
}

function newStats(sheet: SheetName, sourceRows = 0): ImportStats {
  return { sheet, sourceRows, inserted: 0, updated: 0, skipped: 0, errors: {}, samples: [] }
}

function skip(stats: ImportStats, row: number, reason: string): void {
  stats.skipped += 1
  stats.errors[reason] = (stats.errors[reason] ?? 0) + 1
  if (stats.samples.length < 5) stats.samples.push({ row, reason })
}

function writeStats(stats: ImportStats): void {
  const reasonText = Object.entries(stats.errors)
    .map(([reason, count]) => `${reason}=${count}`)
    .join(', ')
  console.log(
    `   ${stats.sheet}: source=${stats.sourceRows}, inserted=${stats.inserted}, ` +
      `updated=${stats.updated}, skipped=${stats.skipped}${reasonText ? ` (${reasonText})` : ''}`,
  )
  if (stats.samples.length) console.log(`   ตัวอย่างปัญหา: ${JSON.stringify(stats.samples)}`)
}

async function loadRows(sheet: SheetName): Promise<{ rows: Row[]; range: string }> {
  const { csv, range } = await fetchSheet(sheet)
  const rows = parseRows(csv, FALLBACK_HEADERS[sheet])
  return { rows: rowLimit == null ? rows : rows.slice(0, rowLimit), range }
}

async function importDevices(): Promise<ImportStats> {
  const { rows, range } = await loadRows('All_Devices')
  const stats = newStats('All_Devices', rows.length)
  console.log(`📦 All_Devices: ${rows.length} rows (${range})`)
  if (dryRun) return stats

  for (const [index, row] of rows.entries()) {
    const rowNo = index + 2
    try {
      const assetCode = clean(row.asset_no)
      if (!assetCode) {
        skip(stats, rowNo, 'missing asset_no')
        continue
      }
      const brand = clean(row.brand) ?? 'Unknown'
      const model = clean(row.model) ?? 'Unknown'
      const deviceData = {
        name: clean(row.name) ?? `${brand} ${model}`,
        brand,
        model,
        type: clean(row.device_type) ?? 'OTHER',
        serialNumber: clean(row.serial),
        building: clean(row.building),
        floor: clean(row.floor),
        department: clean(row.department),
        location: clean(row.location),
        departmentCode: clean(row.department_code),
        status: clean(row.status) ?? 'Active',
        site: clean(row.site) ?? 'UNKNOWN',
        displayLabel: clean(row.asset_site_code),
        contractNo: clean(row.contract_no),
        ip: clean(row.ip),
        mac: clean(row.mac),
        remoteId: clean(row.remote_id),
        remark: clean(row.remark),
        vendor: clean(row.vendor),
        purchaseDate: clean(row.install_date),
        uninstallDate: clean(row.uninstall_date),
        warrantyEnd: clean(row.warranty_end),
        deviceGroup: clean(row.device_group),
        costCenter: clean(row.cost_center),
        meterRequired: parseBool(row.meter_required),
        meterMode: clean(row.meter_mode),
        updatedBy: clean(row.updated_by) ?? 'System',
      }
      const existing = await db.device.findUnique({ where: { assetCode }, select: { id: true } })
      await db.device.upsert({ where: { assetCode }, create: { assetCode, ...deviceData }, update: deviceData })
      existing ? (stats.updated += 1) : (stats.inserted += 1)
    } catch (error) {
      skip(stats, rowNo, `write error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return stats
}

async function importMasterItems(): Promise<ImportStats> {
  const { rows, range } = await loadRows('Master_Items')
  const stats = newStats('Master_Items', rows.length)
  console.log(`📊 Master_Items: ${rows.length} rows (${range})`)
  if (dryRun) return stats

  for (const [index, row] of rows.entries()) {
    const rowNo = index + 2
    try {
      const category = clean(row.CategoryKey)
      const label = clean(row.Value)
      if (!category || !label) {
        skip(stats, rowNo, 'missing CategoryKey/Value')
        continue
      }
      const code = clean(row.ItemID) ?? label
      const data = {
        category,
        code,
        label,
        parentRef: clean(row.ParentRef),
        displayLabel: clean(row.DisplayLabel),
        siteCode: clean(row.SiteCode),
        active: parseBool(row.Active, true),
      }
      const existing = await db.masterItem.findFirst({ where: { category, code }, select: { id: true } })
      if (existing) {
        await db.masterItem.update({ where: { id: existing.id }, data })
        stats.updated += 1
      } else {
        await db.masterItem.create({ data })
        stats.inserted += 1
      }
    } catch (error) {
      skip(stats, rowNo, `write error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return stats
}

async function importMasterCategories(): Promise<ImportStats> {
  const { rows, range } = await loadRows('Master_Category')
  const stats = newStats('Master_Category', rows.length)
  console.log(`📋 Master_Category: ${rows.length} rows (${range})`)
  if (dryRun) return stats

  for (const [index, row] of rows.entries()) {
    const rowNo = index + 2
    try {
      const code = clean(row.CategoryKey)
      if (!code) {
        skip(stats, rowNo, 'missing CategoryKey')
        continue
      }
      const data = { category: 'Category', code, label: clean(row.DisplayName) ?? code, active: parseBool(row.Active, true) }
      const existing = await db.masterItem.findFirst({ where: { category: 'Category', code }, select: { id: true } })
      if (existing) {
        await db.masterItem.update({ where: { id: existing.id }, data })
        stats.updated += 1
      } else {
        await db.masterItem.create({ data })
        stats.inserted += 1
      }
    } catch (error) {
      skip(stats, rowNo, `write error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return stats
}

async function buildDeviceMap(): Promise<Map<string, string>> {
  const devices = await db.device.findMany({ select: { id: true, assetCode: true } })
  return new Map(devices.map((device) => [device.assetCode, device.id]))
}

async function importMeterReadings(deviceMap: Map<string, string>): Promise<ImportStats> {
  const { rows, range } = await loadRows('Meter_Readings')
  const stats = newStats('Meter_Readings', rows.length)
  console.log(`📈 Meter_Readings: ${rows.length} rows (${range})`)
  if (dryRun) return stats

  for (const [index, row] of rows.entries()) {
    const rowNo = index + 2
    try {
      const assetCode = clean(row.asset_no)
      if (!assetCode) {
        skip(stats, rowNo, 'missing asset_no')
        continue
      }
      const deviceId = deviceMap.get(assetCode)
      if (!deviceId) {
        skip(stats, rowNo, `device not found: ${assetCode}`)
        continue
      }
      const readingDate = clean(row.reading_date) ?? new Date().toISOString().slice(0, 10)
      const readingId = clean(row.reading_id) ?? `IMPORT-MR-${assetCode}-${readingDate}-${index + 1}`
      const data = {
        readingId,
        deviceId,
        assetCode,
        readingDate,
        readingMonth: clean(row.reading_month),
        meterBw: parseInt0(row.meter_bw),
        meterColor: parseInt0(row.meter_color),
        pagesBw: parseInt0(row.pages_bw),
        pagesColor: parseInt0(row.pages_color),
        locationAtReading: clean(row.location_at_reading),
        readBy: clean(row.read_by),
        remark: clean(row.remark),
        prevMeterBw: parseInt0(row.prev_meter_bw),
        prevMeterColor: parseInt0(row.prev_meter_color),
        readingType: clean(row.reading_type),
        eventType: clean(row.event_type),
        eventId: clean(row.event_id),
        siteAtReading: clean(row.site_at_reading),
        buildingAtReading: clean(row.building_at_reading),
        floorAtReading: clean(row.floor_at_reading),
        departmentAtReading: clean(row.department_at_reading),
        departmentCodeAtReading: clean(row.department_code_at_reading),
      }
      const existing = await db.meterReading.findUnique({ where: { readingId }, select: { id: true } })
      await db.meterReading.upsert({ where: { readingId }, create: data, update: data })
      existing ? (stats.updated += 1) : (stats.inserted += 1)
    } catch (error) {
      skip(stats, rowNo, `write error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return stats
}

async function importLocationHistory(deviceMap: Map<string, string>): Promise<ImportStats> {
  const { rows, range } = await loadRows('Location_History')
  const stats = newStats('Location_History', rows.length)
  console.log(`📍 Location_History: ${rows.length} rows (${range})`)
  if (dryRun) return stats

  for (const [index, row] of rows.entries()) {
    const rowNo = index + 2
    try {
      const assetCode = clean(row.Asset_No)
      if (!assetCode) {
        skip(stats, rowNo, 'missing Asset_No')
        continue
      }
      const deviceId = deviceMap.get(assetCode)
      if (!deviceId) {
        skip(stats, rowNo, `device not found: ${assetCode}`)
        continue
      }
      const moveDate = clean(row.Move_Date)
      const transferDate = moveDate ?? new Date().toISOString().slice(0, 10)
      const logId = clean(row.Log_ID) ?? `IMPORT-MV-${assetCode}-${index + 1}`
      const data = {
        logId,
        deviceId,
        assetCode,
        moveDate,
        transferDate,
        action: clean(row.Action),
        fromStatus: clean(row.From_Status),
        toStatus: clean(row.To_Status),
        fromSite: clean(row.From_Site),
        fromAssetSiteCode: clean(row.From_AssetSiteCode),
        fromBuilding: clean(row.From_Building),
        fromFloor: clean(row.From_Floor),
        fromDepartment: clean(row.From_Department),
        fromLocation: clean(row.From_Location),
        toSite: clean(row.To_Site) ?? clean(row.From_Site) ?? 'UNKNOWN',
        toAssetSiteCode: clean(row.To_AssetSiteCode),
        toBuilding: clean(row.To_Building),
        toFloor: clean(row.To_Floor),
        toDepartment: clean(row.To_Department),
        toLocation: clean(row.To_Location),
        meterReadingId: clean(row.Meter_Reading_ID),
        movedBy: clean(row.Moved_By),
        remark: clean(row.Remark),
        reason: clean(row.Remark),
      }
      const existing = await db.deviceTransfer.findUnique({ where: { logId }, select: { id: true } })
      await db.deviceTransfer.upsert({ where: { logId }, create: data, update: data })
      existing ? (stats.updated += 1) : (stats.inserted += 1)
    } catch (error) {
      skip(stats, rowNo, `write error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return stats
}

async function importAuditLog(): Promise<ImportStats> {
  const { rows, range } = await loadRows('Audit_Log')
  const stats = newStats('Audit_Log', rows.length)
  console.log(`📜 Audit_Log: ${rows.length} rows (${range})`)
  if (dryRun) return stats

  for (const [index, row] of rows.entries()) {
    const rowNo = index + 2
    try {
      const action = clean(row.Action)
      if (!action) {
        skip(stats, rowNo, 'missing Action')
        continue
      }
      const actor = clean(row.User) ?? 'system'
      const detail = clean(row.Details)
      const summary = clean(row.Summary) ?? detail ?? action
      const createdAt = parseDateOrNull(row.Timestamp)
      const duplicate = await db.auditLog.findFirst({
        where: { action, actor, summary, ...(createdAt ? { createdAt } : {}) },
        select: { id: true },
      })
      if (duplicate) {
        stats.updated += 1
        continue
      }
      await db.auditLog.create({
        data: {
          action,
          entity: clean(row.Entity) ?? 'System',
          entityId: clean(row.EntityId),
          summary,
          actor,
          detail,
          ...(createdAt ? { createdAt } : {}),
        },
      })
      stats.inserted += 1
    } catch (error) {
      skip(stats, rowNo, `write error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return stats
}

async function importUserPermissions(): Promise<ImportStats> {
  const { rows, range } = await loadRows('User_Permissions')
  const stats = newStats('User_Permissions', rows.length)
  console.log(`👥 User_Permissions: ${rows.length} rows (${range})`)
  if (dryRun) return stats

  for (const [index, row] of rows.entries()) {
    const rowNo = index + 2
    try {
      const email = clean(row.Email)?.toLowerCase()
      if (!email) {
        skip(stats, rowNo, 'missing Email')
        continue
      }
      const data = {
        role: clean(row.Role) ?? 'viewer',
        active: parseBool(row.Active, true),
        name: clean(row.Name),
        username: clean(row.Username),
        passwordHash: clean(row.PasswordHash),
        passwordSalt: clean(row.PasswordSalt),
        lastLoginAt: clean(row.LastLoginAt),
        allowedSites: clean(row.Allowed_Sites),
      }
      const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
      await db.user.upsert({ where: { email }, create: { email, ...data }, update: data })
      existing ? (stats.updated += 1) : (stats.inserted += 1)
    } catch (error) {
      skip(stats, rowNo, `write error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return stats
}

async function importSiteAttributes(): Promise<ImportStats> {
  const { rows, range } = await loadRows('Site_Attributes')
  const stats = newStats('Site_Attributes', rows.length)
  console.log(`🏢 Site_Attributes: ${rows.length} rows (${range})`)
  if (dryRun) return stats

  for (const [index, row] of rows.entries()) {
    const rowNo = index + 2
    try {
      const siteCode = clean(row.SiteCode)
      if (!siteCode) {
        skip(stats, rowNo, 'missing SiteCode')
        continue
      }
      const name = clean(row.SiteName) ?? siteCode
      await db.site.upsert({
        where: { code: siteCode },
        create: { code: siteCode, name, phone: clean(row.Hotline) },
        update: { name, phone: clean(row.Hotline) },
      })
      const rateData = {
        siteCode,
        bwRate: parseFloat0(row.PaperRateBW) || 0.5,
        colorRate: parseFloat0(row.PaperRateColor) || 2.0,
      }
      const rate = await db.siteRate.findFirst({ where: { siteCode }, select: { id: true } })
      if (rate) await db.siteRate.update({ where: { id: rate.id }, data: rateData })
      else await db.siteRate.create({ data: rateData })
      stats.inserted += 1
    } catch (error) {
      skip(stats, rowNo, `write error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return stats
}

async function importAppSettings(): Promise<ImportStats> {
  const { rows, range } = await loadRows('App_Settings')
  const stats = newStats('App_Settings', rows.length)
  console.log(`⚙️ App_Settings: ${rows.length} rows (${range})`)
  if (dryRun) return stats

  for (const [index, row] of rows.entries()) {
    const rowNo = index + 2
    try {
      const key = clean(row.Key)
      if (!key) {
        skip(stats, rowNo, 'missing Key')
        continue
      }
      const value = clean(row.Value) ?? ''
      const existing = await db.appSetting.findUnique({ where: { key }, select: { id: true } })
      await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
      existing ? (stats.updated += 1) : (stats.inserted += 1)
    } catch (error) {
      skip(stats, rowNo, `write error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return stats
}

async function importLicenseRecords(): Promise<ImportStats> {
  const { rows, range } = await loadRows('License_Records')
  const stats = newStats('License_Records', rows.length)
  console.log(`🔑 License_Records: ${rows.length} rows (${range})`)
  if (dryRun) return stats

  for (const [index, row] of rows.entries()) {
    const rowNo = index + 2
    try {
      const software = clean(row.Software)
      if (!software) {
        skip(stats, rowNo, 'missing Software')
        continue
      }
      const licenseId = clean(row.License_ID)
      const assetCode = clean(row.Asset_No)
      const data = {
        licenseId,
        assetCode,
        software,
        licenseType: clean(row.LicenseType),
        licenseKey: clean(row.License_Key),
        quantity: parseInt0(row.Quantity) || 1,
        expiryDate: clean(row.Expiry_Date),
        remark: clean(row.Remark),
      }
      const existing = await db.licenseRecord.findFirst({
        where: { licenseId: licenseId ?? undefined, assetCode: assetCode ?? undefined, software },
        select: { id: true },
      })
      if (existing) {
        await db.licenseRecord.update({ where: { id: existing.id }, data })
        stats.updated += 1
      } else {
        await db.licenseRecord.create({ data })
        stats.inserted += 1
      }
    } catch (error) {
      skip(stats, rowNo, `write error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return stats
}

async function importSheet(sheet: SheetName, deviceMap?: Map<string, string>): Promise<ImportStats> {
  switch (sheet) {
    case 'All_Devices': return importDevices()
    case 'Master_Items': return importMasterItems()
    case 'Master_Category': return importMasterCategories()
    case 'Meter_Readings': return importMeterReadings(deviceMap ?? new Map())
    case 'Location_History': return importLocationHistory(deviceMap ?? new Map())
    case 'Audit_Log': return importAuditLog()
    case 'User_Permissions': return importUserPermissions()
    case 'Site_Attributes': return importSiteAttributes()
    case 'App_Settings': return importAppSettings()
    case 'License_Records': return importLicenseRecords()
  }
}

async function main(): Promise<void> {
  const selectedSheets = (Object.keys(SHEETS) as SheetName[]).filter(shouldRun)
  if (!selectedSheets.length) throw new Error(`ไม่มี sheet ที่เลือก: ${onlyArg}`)
  console.log(`🚀 เริ่ม import จาก Google Sheets${dryRun ? ' (DRY RUN — ไม่เขียนฐานข้อมูล)' : ''}`)
  console.log(`   sheets=${selectedSheets.join(', ')}${rowLimit != null ? `, limit=${rowLimit}` : ''}\n`)

  const allStats: ImportStats[] = []
  if (shouldRun('Site_Attributes')) allStats.push(await importSheet('Site_Attributes'))
  if (shouldRun('App_Settings')) allStats.push(await importSheet('App_Settings'))
  if (shouldRun('User_Permissions')) allStats.push(await importSheet('User_Permissions'))
  if (shouldRun('Master_Items')) allStats.push(await importSheet('Master_Items'))
  if (shouldRun('Master_Category')) allStats.push(await importSheet('Master_Category'))
  if (shouldRun('All_Devices')) allStats.push(await importSheet('All_Devices'))

  const deviceMap = dryRun ? new Map<string, string>() : await buildDeviceMap()
  if (shouldRun('Meter_Readings')) allStats.push(await importSheet('Meter_Readings', deviceMap))
  if (shouldRun('Location_History')) allStats.push(await importSheet('Location_History', deviceMap))
  if (shouldRun('Audit_Log')) allStats.push(await importSheet('Audit_Log'))
  if (shouldRun('License_Records')) allStats.push(await importSheet('License_Records'))

  console.log('\n📊 Import summary')
  allStats.forEach(writeStats)
  if (!dryRun) {
    console.log('\n📦 Database totals')
    console.log('   Devices:', await db.device.count())
    console.log('   MeterReadings:', await db.meterReading.count())
    console.log('   MasterItems:', await db.masterItem.count())
    console.log('   DeviceTransfers:', await db.deviceTransfer.count())
    console.log('   AuditLogs:', await db.auditLog.count())
    console.log('   Users:', await db.user.count())
    console.log('   Sites:', await db.site.count())
    console.log('   AppSettings:', await db.appSetting.count())
    console.log('   LicenseRecords:', await db.licenseRecord.count())
  }
  console.log('\n✨ Import เสร็จสิ้น')
}

main()
  .catch((error) => {
    console.error('❌ Import failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
