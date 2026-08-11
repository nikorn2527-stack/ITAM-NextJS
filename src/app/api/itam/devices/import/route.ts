import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { canAccessSite } from '@/lib/auth'
import { parseCsv } from '@/lib/csv'

/**
 * POST /api/itam/devices/import
 *
 * Imports devices from CSV text. Reconciliation:
 *   - Match by assetNo (case-insensitive)
 *   - If exists → update (only the fields provided in the CSV row)
 *   - If new    → create
 *
 * Body:
 *   { csv: string, mode?: 'upsert' | 'create_only' | 'update_only' }
 *
 * Returns:
 *   { inserted, updated, errors, total, byRow: [{ assetNo, action, ok, error? }] }
 *
 * CSV header must contain at least an "assetNo" column (case-insensitive).
 * Recognized columns (all optional except assetNo):
 *   assetNo, deviceType, brand, model, serial, status, site,
 *   building, floor, department, departmentCode, location,
 *   deviceGroup, costCenter, contractNo, vendor, ip, mac, remoteId,
 *   installDate, warrantyEnd, meterRequired, meterMode, assetSiteCode, remark
 *
 * Permission: DEVICE_EDIT
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'DEVICE_EDIT')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const user = auth.row

    const body = await req.json()
    const csvText: string = typeof body.csv === 'string' ? body.csv : ''
    if (!csvText.trim()) {
      return NextResponse.json({ error: 'csv text required' }, { status: 400 })
    }
    const mode: 'upsert' | 'create_only' | 'update_only' = body.mode ?? 'upsert'

    // Parse CSV
    const rows = parseCsv(csvText)
    if (rows.length === 0) {
      return NextResponse.json({ error: 'empty CSV' }, { status: 400 })
    }

    // Detect header
    const headerRow = rows[0].map((h) => h.trim().toLowerCase())
    const colIdx: Record<string, number> = {}
    headerRow.forEach((h, i) => { colIdx[h] = i })

    // Support both camelCase (assetNo) and Thai header labels
    const HEADER_ALIASES: Record<string, string[]> = {
      assetNo: ['assetno', 'asset_no', 'รหัสสินทรัพย์', 'รหัส', 'assetcode'],
      deviceType: ['devicetype', 'device_type', 'ประเภท', 'type'],
      brand: ['brand', 'แบรนด์'],
      model: ['model', 'รุ่น'],
      serial: ['serial', 'serialnumber', 'sn', 'serial_no'],
      status: ['status', 'สถานะ'],
      site: ['site', 'สาขา'],
      building: ['building', 'อาคาร'],
      floor: ['floor', 'ชั้น'],
      department: ['department', 'แผนก'],
      departmentCode: ['departmentcode', 'department_code', 'รหัสแผนก'],
      location: ['location', 'ที่ตั้ง'],
      deviceGroup: ['devicegroup', 'device_group', 'กลุ่ม', 'กลุ่มอุปกรณ์'],
      costCenter: ['costcenter', 'cost_center'],
      contractNo: ['contractno', 'contract_no', 'เลขสัญญา'],
      vendor: ['vendor', 'ผู้ขาย'],
      ip: ['ip', 'ipaddress'],
      mac: ['mac', 'macaddress'],
      remoteId: ['remoteid', 'remote_id'],
      installDate: ['installdate', 'install_date', 'วันติดตั้ง'],
      warrantyEnd: ['warrantyend', 'warranty_end', 'วันหมดประกัน'],
      meterRequired: ['meterrequired', 'meter_required', 'ต้องจดมิเตอร์'],
      meterMode: ['metermode', 'meter_mode', 'โหมดมิเตอร์'],
      assetSiteCode: ['assetsitecode', 'asset_site_code'],
      remark: ['remark', 'หมายเหตุ'],
    }
    function resolveCol(field: string): number {
      const direct = colIdx[field.toLowerCase()]
      if (direct !== undefined) return direct
      for (const alias of HEADER_ALIASES[field] ?? []) {
        const idx = colIdx[alias]
        if (idx !== undefined) return idx
      }
      return -1
    }

    const ASSETNO_COL = resolveCol('assetNo')
    if (ASSETNO_COL === -1) {
      return NextResponse.json(
        { error: 'CSV header must contain an assetNo column (รหัสสินทรัพย์)' },
        { status: 400 },
      )
    }

    const FIELDS = [
      'deviceType', 'brand', 'model', 'serial', 'status', 'site',
      'building', 'floor', 'department', 'departmentCode', 'location',
      'deviceGroup', 'costCenter', 'contractNo', 'vendor', 'ip', 'mac',
      'remoteId', 'installDate', 'warrantyEnd', 'meterRequired', 'meterMode',
      'assetSiteCode', 'remark',
    ] as const
    const fieldCols: Record<string, number> = {}
    for (const f of FIELDS) fieldCols[f] = resolveCol(f)

    function cell(row: string[], field: string): string | null {
      const idx = fieldCols[field]
      if (idx === -1 || idx >= row.length) return null
      const v = (row[idx] ?? '').trim()
      return v === '' ? null : v
    }
    function boolCell(row: string[], field: string): boolean | null {
      const v = cell(row, field)
      if (v === null) return null
      const lv = v.toLowerCase()
      return ['true', 'yes', '1', 'y', 'ใช่', 'x'].includes(lv)
    }

    let inserted = 0
    let updated = 0
    const errors: Array<{ row: number; assetNo: string; error: string }> = []
    const byRow: Array<{ row: number; assetNo: string; action: string; ok: boolean; error?: string }> = []

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.every((c) => !c.trim())) continue // skip empty rows

      const assetNo = (row[ASSETNO_COL] ?? '').trim()
      if (!assetNo) {
        errors.push({ row: i + 1, assetNo: '', error: 'assetNo is required' })
        byRow.push({ row: i + 1, assetNo: '', action: 'skip', ok: false, error: 'assetNo is required' })
        continue
      }

      try {
        const existing = await db.device.findUnique({ where: { assetNo } })

        // Site access check on the CSV row's site
        const csvSite = cell(row, 'site')
        if (csvSite && !canAccessSite(user, csvSite)) {
          errors.push({
            row: i + 1,
            assetNo,
            error: `ไม่มีสิทธิ์สาขา: ${csvSite}`,
          })
          byRow.push({
            row: i + 1,
            assetNo,
            action: 'skip',
            ok: false,
            error: `ไม่มีสิทธิ์สาขา: ${csvSite}`,
          })
          continue
        }
        if (existing && !canAccessSite(user, existing.site)) {
          errors.push({
            row: i + 1,
            assetNo,
            error: 'ไม่มีสิทธิ์แก้ไขอุปกรณ์ในสาขานี้',
          })
          byRow.push({
            row: i + 1,
            assetNo,
            action: 'skip',
            ok: false,
            error: 'ไม่มีสิทธิ์แก้ไขอุปกรณ์ในสาขานี้',
          })
          continue
        }

        const mr = boolCell(row, 'meterRequired')

        if (existing) {
          if (mode === 'create_only') {
            byRow.push({ row: i + 1, assetNo, action: 'skip-existing', ok: true })
            continue
          }
          // Build update payload — only fields that have a non-null value
          const updateData: Record<string, unknown> = { updatedBy: user.username || user.email }
          for (const f of FIELDS) {
            if (f === 'meterRequired') {
              if (mr !== null) updateData.meterRequired = mr
            } else {
              const v = cell(row, f)
              if (v !== null) updateData[f] = v
            }
          }
          await db.device.update({ where: { assetNo }, data: updateData })
          updated++
          byRow.push({ row: i + 1, assetNo, action: 'update', ok: true })
        } else {
          if (mode === 'update_only') {
            byRow.push({ row: i + 1, assetNo, action: 'skip-missing', ok: true })
            continue
          }
          await db.device.create({
            data: {
              assetNo,
              deviceType: cell(row, 'deviceType'),
              brand: cell(row, 'brand'),
              model: cell(row, 'model'),
              serial: cell(row, 'serial'),
              building: cell(row, 'building'),
              floor: cell(row, 'floor'),
              department: cell(row, 'department'),
              location: cell(row, 'location'),
              departmentCode: cell(row, 'departmentCode'),
              status: cell(row, 'status') ?? 'Active',
              site: csvSite,
              contractNo: cell(row, 'contractNo'),
              ip: cell(row, 'ip'),
              mac: cell(row, 'mac'),
              remoteId: cell(row, 'remoteId'),
              remark: cell(row, 'remark'),
              vendor: cell(row, 'vendor'),
              installDate: cell(row, 'installDate'),
              warrantyEnd: cell(row, 'warrantyEnd'),
              deviceGroup: cell(row, 'deviceGroup'),
              costCenter: cell(row, 'costCenter'),
              meterRequired: mr ?? false,
              meterMode: cell(row, 'meterMode'),
              assetSiteCode: cell(row, 'assetSiteCode'),
              updatedBy: user.username || user.email,
            },
          })
          inserted++
          byRow.push({ row: i + 1, assetNo, action: 'create', ok: true })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed'
        errors.push({ row: i + 1, assetNo, error: message })
        byRow.push({ row: i + 1, assetNo, action: 'error', ok: false, error: message })
      }
    }

    // Audit log (single summary entry, not per-row)
    try {
      await db.auditLog.create({
        data: {
          timestamp: new Date().toISOString(),
          action: 'IMPORT_DEVICES',
          user: user.email,
          details: JSON.stringify({
            mode,
            inserted,
            updated,
            errors: errors.length,
            total: rows.length - 1,
          }),
        },
      })
    } catch { /* ignore */ }

    return NextResponse.json({
      inserted,
      updated,
      errors,
      byRow,
      total: rows.length - 1,
    })
  } catch (err) {
    console.error('POST /api/itam/devices/import', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
