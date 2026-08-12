'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { parseCsv, downloadCsv } from '@/lib/csv'
import type { Device } from './types'

/**
 * Column header → device field mapping.
 * Recognises Thai and English headers (case-insensitive).
 */
const HEADER_ALIASES: Array<{ aliases: string[]; field: keyof ImportRow }> = [
  { aliases: ['รหัส', 'รหัสอุปกรณ์', 'assetcode', 'asset code', 'code'], field: 'assetCode' },
  { aliases: ['ชื่อ', 'ชื่ออุปกรณ์', 'name'], field: 'name' },
  { aliases: ['แบรนด์', 'brand'], field: 'brand' },
  { aliases: ['รุ่น', 'model'], field: 'model' },
  { aliases: ['ประเภท', 'type'], field: 'type' },
  { aliases: ['sn', 'serialnumber', 'serial number', 'หมายเลขsn', 'หมายเลข sn', 'serial'], field: 'serialNumber' },
  { aliases: ['สถานะ', 'status'], field: 'status' },
  { aliases: ['สาขา', 'site'], field: 'site' },
  { aliases: ['แผนก', 'department'], field: 'department' },
  { aliases: ['รหัสแผนก', 'departmentcode', 'department code'], field: 'departmentCode' },
  { aliases: ['parentref', 'parent ref'], field: 'parentRef' },
  { aliases: ['displaylabel', 'display label'], field: 'displayLabel' },
  { aliases: ['ที่ตั้ง', 'location'], field: 'location' },
  { aliases: ['วันที่ซื้อ', 'purchasedate', 'purchase date'], field: 'purchaseDate' },
  { aliases: ['มิเตอร์ล่าสุด', 'lastmeterreading', 'last meter reading'], field: 'lastMeterReading' },
]

const STATUS_THAI_TO_EN: Record<string, string> = {
  'ใช้งานอยู่': 'active',
  'สำรอง': 'spare',
  'ส่งซ่อม': 'repair',
  'ตัดของออก': 'disposed',
}

const TEMPLATE_HEADERS = [
  { key: 'assetCode', label: 'รหัสอุปกรณ์' },
  { key: 'name', label: 'ชื่อ' },
  { key: 'brand', label: 'แบรนด์' },
  { key: 'model', label: 'รุ่น' },
  { key: 'type', label: 'ประเภท' },
  { key: 'serialNumber', label: 'หมายเลข SN' },
  { key: 'status', label: 'สถานะ' },
  { key: 'site', label: 'สาขา' },
  { key: 'department', label: 'แผนก' },
  { key: 'departmentCode', label: 'รหัสแผนก' },
  { key: 'parentRef', label: 'ParentRef' },
  { key: 'displayLabel', label: 'DisplayLabel' },
  { key: 'location', label: 'ที่ตั้ง' },
  { key: 'purchaseDate', label: 'วันที่ซื้อ' },
  { key: 'lastMeterReading', label: 'มิเตอร์ล่าสุด' },
]

interface ImportRow {
  assetCode: string
  name: string
  brand: string
  model: string
  type: string
  serialNumber: string
  status: string
  site: string
  department: string
  departmentCode: string
  parentRef: string
  displayLabel: string
  location: string
  purchaseDate: string
  lastMeterReading: string
  _rowIndex: number
  _error?: string
}

const EMPTY_ROW: Omit<ImportRow, '_rowIndex'> = {
  assetCode: '',
  name: '',
  brand: '',
  model: '',
  type: '',
  serialNumber: '',
  status: '',
  site: '',
  department: '',
  departmentCode: '',
  parentRef: '',
  displayLabel: '',
  location: '',
  purchaseDate: '',
  lastMeterReading: '',
}

interface ParsedData {
  headers: string[]
  rows: ImportRow[]
  fieldMap: Record<string, keyof ImportRow>
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  existingAssetCodes?: Set<string>
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ')
}

function detectFieldMap(headers: string[]): Record<string, keyof ImportRow> {
  const map: Record<string, keyof ImportRow> = {}
  headers.forEach((h, idx) => {
    const nh = normalizeHeader(h)
    const match = HEADER_ALIASES.find((a) =>
      a.aliases.some((alias) => normalizeHeader(alias) === nh),
    )
    if (match) {
      map[idx] = match.field
    }
  })
  return map
}

function mapRow(
  raw: string[],
  fieldMap: Record<string, keyof ImportRow>,
  rowIndex: number,
): ImportRow {
  const row: ImportRow = { ...EMPTY_ROW, _rowIndex: rowIndex }
  Object.entries(fieldMap).forEach(([idx, field]) => {
    const value = raw[Number(idx)]?.trim() ?? ''
    ;(row as unknown as Record<string, unknown>)[field] = value
  })
  // Normalize Thai status labels to English keys
  if (row.status && STATUS_THAI_TO_EN[row.status]) {
    row.status = STATUS_THAI_TO_EN[row.status]
  }
  return row
}

function validateRows(rows: ImportRow[], existingCodes: Set<string>): ImportRow[] {
  const seen = new Set<string>()
  const validStatuses = new Set(['active', 'spare', 'repair', 'disposed', ''])
  rows.forEach((r) => {
    if (!r.assetCode) {
      r._error = 'ไม่มีรหัสอุปกรณ์'
      return
    }
    if (!r.name) {
      r._error = 'ไม่มีชื่ออุปกรณ์'
      return
    }
    if (!r.brand) {
      r._error = 'ไม่มีแบรนด์'
      return
    }
    if (!r.model) {
      r._error = 'ไม่มีรุ่น'
      return
    }
    if (!r.type) {
      r._error = 'ไม่มีประเภท'
      return
    }
    if (r.status && !validStatuses.has(r.status)) {
      r._error = `สถานะไม่ถูกต้อง: ${r.status}`
      return
    }
    if (seen.has(r.assetCode)) {
      r._error = `รหัสซ้ำในไฟล์: ${r.assetCode}`
      return
    }
    if (existingCodes.has(r.assetCode)) {
      r._error = `มีอยู่แล้วในระบบ: ${r.assetCode}`
      return
    }
    seen.add(r.assetCode)
  })
  return rows
}

function downloadTemplate() {
  const sample: Record<string, unknown> = {}
  TEMPLATE_HEADERS.forEach((h) => {
    sample[h.key] =
      h.key === 'status'
        ? 'ใช้งานอยู่'
        : h.key === 'lastMeterReading'
          ? '0'
          : h.key === 'purchaseDate'
            ? '2025-01-01'
            : h.key === 'assetCode'
              ? 'IT-PRT-001'
              : ''
  })
  downloadCsv('devices-template.csv', [sample], TEMPLATE_HEADERS)
}

export function CsvImportDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient()
  const [fileName, setFileName] = React.useState<string | null>(null)
  const [parsed, setParsed] = React.useState<ParsedData | null>(null)
  const [importing, setImporting] = React.useState(false)
  const [lastImportResult, setLastImportResult] = React.useState<{
    inserted: number
    skipped: number
  } | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const { data: existingDevices } = useQuery<Device[]>({
    queryKey: ['devices', '', 'all', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/devices')
      if (!res.ok) return []
      const json = await res.json()
      return (json.devices ?? []) as Device[]
    },
    staleTime: 30_000,
  })
  const existingCodes = React.useMemo(
    () => new Set((existingDevices ?? []).map((d) => d.assetCode)),
    [existingDevices],
  )

  function reset() {
    setFileName(null)
    setParsed(null)
    setLastImportResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleClose(o: boolean) {
    if (!o) {
      reset()
    }
    onOpenChange(o)
  }

  function handleFile(file: File) {
    setFileName(file.name)
    setLastImportResult(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target?.result ?? '')
      const grid = parseCsv(text)
      if (grid.length === 0) {
        toast.error('ไฟล์ CSV ว่างเปล่า')
        setParsed(null)
        return
      }
      const headers = grid[0]
      const fieldMap = detectFieldMap(headers)
      if (Object.keys(fieldMap).length === 0) {
        toast.error('ไม่พบคอลัมน์ที่รู้จัก (ต้องมีอย่างน้อย: รหัส, ชื่อ, แบรนด์, รุ่น, ประเภท)')
        setParsed(null)
        return
      }
      const rows = grid.slice(1).map((raw, i) => mapRow(raw, fieldMap, i + 2))
      const validated = validateRows(rows, existingCodes)
      setParsed({ headers, rows: validated, fieldMap })
    }
    reader.onerror = () => toast.error('อ่านไฟล์ไม่สำเร็จ')
    reader.readAsText(file, 'utf-8')
  }

  const validRows = (parsed?.rows ?? []).filter((r) => !r._error)
  const errorRows = (parsed?.rows ?? []).filter((r) => r._error)
  const previewRows = (parsed?.rows ?? []).slice(0, 8)

  async function doImport() {
    if (!parsed || validRows.length === 0) return
    try {
      setImporting(true)
      const payload = validRows.map((r) => ({
        assetCode: r.assetCode,
        name: r.name,
        brand: r.brand,
        model: r.model,
        type: r.type,
        serialNumber: r.serialNumber || null,
        status: r.status || 'active',
        site: r.site || 'HQ',
        department: r.department || null,
        departmentCode: r.departmentCode || null,
        parentRef: r.parentRef || null,
        displayLabel: r.displayLabel || null,
        location: r.location || null,
        purchaseDate: r.purchaseDate || null,
        lastMeterReading: r.lastMeterReading ? Number(r.lastMeterReading) || 0 : 0,
      }))
      const res = await fetch('/api/devices/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devices: payload }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error ?? 'นำเข้าไม่สำเร็จ')
      }
      setLastImportResult({
        inserted: json.inserted ?? 0,
        skipped: json.skipped ?? 0,
      })
      toast.success(`นำเข้า ${json.inserted ?? 0} อุปกรณ์แล้ว`)
      await qc.invalidateQueries({ queryKey: ['devices'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      // Close after a brief delay so the user sees the result
      setTimeout(() => {
        handleClose(false)
      }, 600)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'นำเข้าไม่สำเร็จ')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <UploadCloud className="h-5 w-5 text-[#f97316]" />
            นำเข้าอุปกรณ์จาก CSV
          </DialogTitle>
          <DialogDescription>
            เลือกไฟล์ CSV ที่มีคอลัมน์รหัส/ชื่อ/แบรนด์/รุ่น/ประเภท ระบบจะตรวจสอบและแสดงตัวอย่างก่อนนำเข้า
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone / file input */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition-colors hover:border-[#f97316] hover:bg-[#f97316]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-[#fb923c] dark:hover:bg-[#f97316]/10"
          >
            <UploadCloud className="h-10 w-10 text-slate-400 dark:text-slate-500" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {fileName ? (
                <span className="inline-flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  {fileName}
                </span>
              ) : (
                'คลิกเพื่อเลือกไฟล์ CSV'
              )}
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              รองรับ .csv · รหัสอุปกรณ์ต้องไม่ซ้ำ
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#f97316] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950 rounded"
            >
              <Download className="h-3.5 w-3.5" />
              ดาวน์โหลดเทมเพลต CSV
            </button>
            {parsed && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  ถูกต้อง {validRows.length}
                </Badge>
                {errorRows.length > 0 && (
                  <Badge className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    มีปัญหา {errorRows.length}
                  </Badge>
                )}
                <span className="text-slate-400 dark:text-slate-500">
                  รวม {parsed.rows.length} แถว
                </span>
              </div>
            )}
          </div>

          {/* Validation errors list */}
          {errorRows.length > 0 && (
            <div className="itam-scroll max-h-32 overflow-y-auto rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              <div className="mb-1 font-semibold">รายการที่มีปัญหา (จะไม่ถูกนำเข้า):</div>
              <ul className="space-y-0.5">
                {errorRows.slice(0, 50).map((r) => (
                  <li key={r._rowIndex}>
                    บรรทัด {r._rowIndex}: {r._error}
                  </li>
                ))}
                {errorRows.length > 50 && (
                  <li className="italic">...และอีก {errorRows.length - 50} รายการ</li>
                )}
              </ul>
            </div>
          )}

          {/* Preview table */}
          {parsed && (
            <div className="rounded-md border border-slate-200 dark:border-slate-800">
              <div className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 dark:border-slate-800 dark:text-slate-300">
                ตัวอย่าง {Math.min(8, parsed.rows.length)} จาก {parsed.rows.length} แถว
              </div>
              <div className="itam-scroll max-h-72 overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>รหัส</TableHead>
                      <TableHead>ชื่อ</TableHead>
                      <TableHead>แบรนด์</TableHead>
                      <TableHead>ประเภท</TableHead>
                      <TableHead>สถานะ</TableHead>
                      <TableHead>สาขา</TableHead>
                      <TableHead className="w-24">สถานะตรวจสอบ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                          ไม่มีข้อมูลให้แสดง
                        </TableCell>
                      </TableRow>
                    ) : (
                      previewRows.map((r) => (
                        <TableRow key={r._rowIndex}>
                          <TableCell className="text-xs text-slate-400 dark:text-slate-500">
                            {r._rowIndex}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.assetCode || '—'}</TableCell>
                          <TableCell className="max-w-[180px] truncate">{r.name || '—'}</TableCell>
                          <TableCell>{r.brand || '—'}</TableCell>
                          <TableCell>{r.type || '—'}</TableCell>
                          <TableCell>{r.status || '—'}</TableCell>
                          <TableCell>{r.site || '—'}</TableCell>
                          <TableCell>
                            {r._error ? (
                              <Badge className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                ข้าม
                              </Badge>
                            ) : (
                              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                พร้อม
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Result banner */}
          {lastImportResult && (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              นำเข้าสำเร็จ {lastImportResult.inserted} รายการ
              {lastImportResult.skipped > 0 && (
                <span className="text-amber-700 dark:text-amber-300">
                  (ข้าม {lastImportResult.skipped} รายการ)
                </span>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={importing}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={doImport}
            disabled={importing || validRows.length === 0}
            className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
          >
            {importing ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                กำลังนำเข้า...
              </>
            ) : (
              <>
                <UploadCloud className="h-4 w-4" />
                นำเข้า {validRows.length > 0 ? `(${validRows.length})` : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

