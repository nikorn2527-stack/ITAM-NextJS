'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Printer, Search, Loader2, QrCode, Tag } from 'lucide-react'
import type { Device } from './types'

type StickerSize = 'small' | 'medium' | 'large'

interface SizeOption {
  value: StickerSize
  label: string
  cols: number
  widthMM: number
  heightMM: number
}

const SIZE_OPTIONS: SizeOption[] = [
  { value: 'small', label: 'เล็ก 50×30mm', cols: 4, widthMM: 50, heightMM: 30 },
  { value: 'medium', label: 'กลาง 70×40mm', cols: 3, widthMM: 70, heightMM: 40 },
  { value: 'large', label: 'ใหญ่ 100×50mm', cols: 2, widthMM: 100, heightMM: 50 },
]

type FieldKey =
  | 'assetCode'
  | 'name'
  | 'brandModel'
  | 'site'
  | 'department'
  | 'serialNumber'
  | 'purchaseDate'

interface FieldOption {
  key: FieldKey
  label: string
}

const FIELD_OPTIONS: FieldOption[] = [
  { key: 'assetCode', label: 'รหัสอุปกรณ์' },
  { key: 'name', label: 'ชื่อ' },
  { key: 'brandModel', label: 'แบรนด์/รุ่น' },
  { key: 'site', label: 'สาขา' },
  { key: 'department', label: 'แผนก' },
  { key: 'serialNumber', label: 'SN' },
  { key: 'purchaseDate', label: 'วันที่ซื้อ' },
]

const DEFAULT_FIELDS: FieldKey[] = ['assetCode', 'name', 'site']

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  devices: Device[]
  orgName?: string | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderFieldValue(d: Device, key: FieldKey): string {
  switch (key) {
    case 'assetCode':
      return d.assetCode
    case 'name':
      return d.name
    case 'brandModel':
      return `${d.brand} ${d.model}`.trim()
    case 'site':
      return d.site
    case 'department':
      return d.department ?? ''
    case 'serialNumber':
      return d.serialNumber ?? ''
    case 'purchaseDate':
      return d.purchaseDate ?? ''
    default:
      return ''
  }
}

function fieldLabel(key: FieldKey): string {
  return FIELD_OPTIONS.find((f) => f.key === key)?.label ?? key
}

export function StickerPrintDialog({
  open,
  onOpenChange,
  devices,
  orgName,
}: Props) {
  const qc = useQueryClient()
  const [size, setSize] = React.useState<StickerSize>('medium')
  const [fields, setFields] = React.useState<FieldKey[]>(DEFAULT_FIELDS)
  const [withQr, setWithQr] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [printing, setPrinting] = React.useState(false)

  // Active (non-disposed) devices only
  const activeDevices = React.useMemo(
    () => (devices ?? []).filter((d) => d.status !== 'disposed'),
    [devices],
  )

  const filteredDevices = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return activeDevices
    return activeDevices.filter(
      (d) =>
        d.assetCode.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        d.brand.toLowerCase().includes(q) ||
        d.model.toLowerCase().includes(q) ||
        (d.serialNumber ?? '').toLowerCase().includes(q),
    )
  }, [activeDevices, search])

  // Default-select all filtered active devices when dialog opens / device list changes
  React.useEffect(() => {
    if (open) {
      setSelectedIds(new Set(activeDevices.map((d) => d.id)))
    }
  }, [open, activeDevices])

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(filteredDevices.map((d) => d.id)))
  }

  function clearAll() {
    setSelectedIds(new Set())
  }

  function toggleField(key: FieldKey) {
    setFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  const selectedDevices = React.useMemo(
    () => activeDevices.filter((d) => selectedIds.has(d.id)),
    [activeDevices, selectedIds],
  )

  const sizeOption = SIZE_OPTIONS.find((s) => s.value === size)!
  const orgLabel = orgName?.trim() || 'PNG TEAM IT'

  // Build a sample preview sticker (using the first selected device or a placeholder)
  const sampleDevice: Device | null = selectedDevices[0] ?? null

  async function handlePrint() {
    if (selectedDevices.length === 0) {
      toast.error('กรุณาเลือกอุปกรณ์อย่างน้อย 1 เครื่อง')
      return
    }
    if (fields.length === 0) {
      toast.error('กรุณาเลือกฟิลด์ที่จะแสดงอย่างน้อย 1 ฟิลด์')
      return
    }
    setPrinting(true)
    try {
      // Pre-generate QR data URLs (assetCode) for each device if withQr is on.
      const qrMap = new Map<string, string>()
      if (withQr) {
        for (const d of selectedDevices) {
          try {
            const url = await QRCode.toDataURL(d.assetCode, {
              margin: 1,
              width: 200,
              errorCorrectionLevel: 'M',
            })
            qrMap.set(d.id, url)
          } catch {
            // skip QR for this device on error
          }
        }
      }

      const stickersHtml = selectedDevices
        .map((d) => buildStickerHtml(d, fields, withQr ? (qrMap.get(d.id) ?? null) : null, orgLabel))
        .join('\n')

      const html = buildPrintDocument(
        stickersHtml,
        sizeOption,
        fields.length,
        withQr,
      )

      const win = window.open('', '_blank')
      if (!win) {
        toast.error('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ — กรุณาอนุญาตป๊อปอัป')
        setPrinting(false)
        return
      }
      win.document.open()
      win.document.write(html)
      win.document.close()
      // Give the browser a tick to layout before printing
      setTimeout(() => {
        try {
          win.focus()
          win.print()
        } catch (err) { console.error('[sticker-print-dialog]', err) }
      }, 350)

      // Log audit (fire-and-forget, but await to keep tidy)
      try {
        await fetch('/api/audit/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'PRINT',
            entity: 'Device',
            entityId: null,
            summary: `พิมพ์สติกเกอร์อุปกรณ์ ${selectedDevices.length} ใบ`,
            detail: {
              count: selectedDevices.length,
              deviceIds: selectedDevices.map((d) => d.id),
              size,
              fields,
              withQr,
            },
          }),
        })
        await qc.invalidateQueries({ queryKey: ['audit'] })
      } catch (err) { console.error('[sticker-print-dialog]', err) }

      toast.success(`เตรียมสติกเกอร์ ${selectedDevices.length} ใบสำหรับพิมพ์แล้ว`)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Print failed')
    } finally {
      setPrinting(false)
    }
  }

  // ----- Sample preview sticker (live, in-dialog) -----
  const previewHtml = sampleDevice
    ? buildStickerHtml(
        sampleDevice,
        fields,
        null, // preview shows QR placeholder block, no real image needed
        orgLabel,
      )
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-2xl dark:border-slate-800 dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <Tag className="h-5 w-5 text-[#f97316]" />
            🏷️ พิมพ์สติกเกอร์อุปกรณ์
          </DialogTitle>
          <DialogDescription>
            สร้างสติกเกอร์ฉลากอุปกรณ์สำหรับติดเครื่อง
          </DialogDescription>
        </DialogHeader>

        <div className="itam-scroll max-h-[68vh] space-y-4 overflow-y-auto pr-1">
          {/* Format options */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                ขนาดสติกเกอร์
              </Label>
              <Select value={size} onValueChange={(v) => setSize(v as StickerSize)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                จัดวาง {sizeOption.cols} คอลัมน์ต่อแถวเมื่อพิมพ์
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                ฟิลด์ที่แสดง
              </Label>
              <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 p-2 dark:border-slate-800">
                {FIELD_OPTIONS.map((f) => (
                  <label
                    key={f.key}
                    className="flex cursor-pointer items-center gap-1.5 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Checkbox
                      checked={fields.includes(f.key)}
                      onCheckedChange={() => toggleField(f.key)}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* QR toggle */}
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-[#f97316]" />
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  พิมพ์ QR Code
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  สร้าง QR จากรหัสอุปกรณ์ (assetCode)
                </div>
              </div>
            </div>
            <Switch checked={withQr} onCheckedChange={setWithQr} />
          </div>

          {/* Live preview */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              ตัวอย่างสติกเกอร์ (พรีวิว)
            </Label>
            <div
              className="overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40"
              style={{ minHeight: 80 }}
            >
              {previewHtml ? (
                <div
                  className="sticker-preview"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-6 text-slate-400 dark:text-slate-500">
                  <Tag className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                  <span className="text-xs">เลือกอุปกรณ์ด้านล่างเพื่อดูตัวอย่าง</span>
                </div>
              )}
            </div>
          </div>

          {/* Device selection */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                เลือกอุปกรณ์ ({selectedIds.size}/{activeDevices.length})
              </Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={selectAll}
                  className="h-7 text-xs text-[#f97316]"
                >
                  เลือกทั้งหมด
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearAll}
                  className="h-7 text-xs text-slate-500"
                >
                  ยกเลิกการเลือก
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="ค้นหารหัส / ชื่อ / SN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="itam-scroll max-h-52 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredDevices.length === 0 ? (
                  <li className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                    ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข
                  </li>
                ) : (
                  filteredDevices.map((d) => {
                    const checked = selectedIds.has(d.id)
                    return (
                      <li key={d.id}>
                        <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleId(d.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-slate-700 dark:text-slate-200">
                              {d.name}
                            </div>
                            <div className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
                              {d.assetCode} · {d.brand} {d.model} · {d.site}
                            </div>
                          </div>
                          <Badge className="ml-auto border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {d.type}
                          </Badge>
                        </label>
                      </li>
                    )
                  })
                )}
              </ul>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={printing}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={handlePrint}
            disabled={printing || selectedDevices.length === 0}
            className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
          >
            {printing ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                กำลังเตรียม...
              </>
            ) : (
              <>
                <Printer className="mr-1.5 h-4 w-4" />
                พิมพ์สติกเกอร์ ({selectedDevices.length} ใบ)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- HTML builders for the print window ---------- */

function buildStickerHtml(
  d: Device,
  fields: FieldKey[],
  qrDataUrl: string | null,
  orgLabel: string,
): string {
  const lines = fields
    .map((k) => {
      const value = renderFieldValue(d, k)
      if (!value) return ''
      const isAssetCode = k === 'assetCode'
      const lbl = fieldLabel(k)
      return `
        <div class="row ${isAssetCode ? 'row-code' : ''}">
          <span class="lbl">${escapeHtml(lbl)}</span>
          <span class="val">${escapeHtml(value)}</span>
        </div>
      `
    })
    .filter(Boolean)
    .join('')

  const qrBlock = qrDataUrl
    ? `<div class="qr"><img src="${qrDataUrl}" alt="QR" /></div>`
    : ''

  return `
    <div class="sticker">
      <div class="sticker-top">
        <span class="org">${escapeHtml(orgLabel)}</span>
        <span class="accent"></span>
      </div>
      <div class="sticker-body">
        <div class="fields">${lines}</div>
        ${qrBlock}
      </div>
      <div class="sticker-bottom">IT Asset Management</div>
    </div>
  `
}

function buildPrintDocument(
  stickersHtml: string,
  sizeOption: SizeOption,
  fieldCount: number,
  withQr: boolean,
): string {
  const { cols, widthMM, heightMM } = sizeOption
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<title>สติกเกอร์อุปกรณ์ IT</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Sukhumvit Set","Noto Sans Thai","Tahoma","Segoe UI",sans-serif;
    color: #1e293b;
    background: #ffffff;
  }
  .page { padding: 8mm; }
  .grid {
    display: grid;
    grid-template-columns: repeat(${cols}, 1fr);
    gap: 4mm;
  }
  .sticker {
    border: 1px dashed #94a3b8;
    border-radius: 4px;
    padding: 2mm 2.5mm;
    width: ${widthMM}mm;
    height: ${heightMM}mm;
    min-height: ${heightMM}mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    background: #ffffff;
    overflow: hidden;
    page-break-inside: avoid;
  }
  .sticker-top {
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid #f1f5f9;
    padding-bottom: 1mm;
    margin-bottom: 1mm;
  }
  .sticker-top .org {
    font-size: 8pt;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.04em;
  }
  .sticker-top .accent {
    flex: 1;
    height: 2px;
    background: linear-gradient(90deg, #f97316 0%, #fb923c 100%);
    border-radius: 2px;
  }
  .sticker-body {
    display: flex;
    gap: 2mm;
    flex: 1;
    align-items: center;
  }
  .fields {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4mm;
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 3px;
    font-size: 7.5pt;
    line-height: 1.2;
  }
  .row .lbl {
    color: #64748b;
    font-size: 6.5pt;
    min-width: 28px;
  }
  .row .val {
    color: #1e293b;
    word-break: break-all;
  }
  .row-code .val {
    font-size: 10pt;
    font-weight: 800;
    letter-spacing: 0.02em;
    color: #f97316;
  }
  .qr {
    flex-shrink: 0;
  }
  .qr img {
    width: 22mm;
    height: 22mm;
    display: block;
  }
  .sticker-bottom {
    border-top: 1px solid #f1f5f9;
    padding-top: 1mm;
    margin-top: 1mm;
    font-size: 6pt;
    color: #94a3b8;
    text-align: center;
    letter-spacing: 0.05em;
  }
  @media print {
    @page { size: A4; margin: 10mm; }
    body { background: #ffffff; }
    .sticker { border-color: #94a3b8; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="grid">
      ${stickersHtml}
    </div>
  </div>
</body>
</html>`
}

/* ---------- Inline preview styles ----------
   The preview sticker uses the same class names as the print document so the
   look is consistent; we re-declare a minimal CSS block scoped to
   .sticker-preview so it renders cleanly inside the dialog.
*/
const previewStyles = `
.sticker-preview .sticker {
  width: 100%;
  min-height: 60px;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #ffffff;
}
.sticker-preview .sticker-top {
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 4px;
  margin-bottom: 4px;
}
.sticker-preview .sticker-top .org {
  font-size: 9px;
  font-weight: 700;
  color: #0f172a;
}
.sticker-preview .sticker-top .accent {
  flex: 1;
  height: 2px;
  background: linear-gradient(90deg, #f97316 0%, #fb923c 100%);
  border-radius: 2px;
}
.sticker-preview .sticker-body {
  display: flex;
  gap: 8px;
  align-items: center;
}
.sticker-preview .fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sticker-preview .row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 11px;
}
.sticker-preview .row .lbl { color: #64748b; font-size: 10px; min-width: 40px; }
.sticker-preview .row .val { color: #1e293b; }
.sticker-preview .row-code .val {
  font-size: 14px;
  font-weight: 800;
  color: #f97316;
}
.sticker-preview .qr {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border: 1px dashed #cbd5e1;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: #94a3b8;
}
.sticker-preview .sticker-bottom {
  border-top: 1px solid #f1f5f9;
  padding-top: 4px;
  margin-top: 4px;
  font-size: 9px;
  color: #94a3b8;
  text-align: center;
}
`

// Inject the preview styles once on the client side.
if (typeof document !== 'undefined') {
  const id = 'sticker-preview-styles'
  if (!document.getElementById(id)) {
    const el = document.createElement('style')
    el.id = id
    el.textContent = previewStyles
    document.head.appendChild(el)
  }
}
