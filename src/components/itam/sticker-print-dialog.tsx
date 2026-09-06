'use client'

/**
 * sticker-print-dialog.tsx — print dialog for device stickers.
 *
 * STICKER-CUSTOM-SIZE (current revision):
 *   The dialog now uses the template-engine pipeline from `sticker-template.ts`
 *   (STICKER_SIZE_PRESETS + STICKER_TEMPLATE_PRESETS + renderStickerFromTemplate
 *   + buildPrintDocument) instead of its own bespoke sticker HTML builder.
 *
 *   User flow:
 *     1. Pick a size (preset dropdown OR custom W/H fields in mm)
 *     2. Pick a template (default / minimal / qr-only / compact / detailed)
 *     3. Live preview updates as you change settings
 *     4. Pick devices (existing multi-select list)
 *     5. Click "พิมพ์สติกเกอร์" — opens a print window with the template-rendered
 *        HTML. The @page CSS is sized to match the sticker canvas (auto mode)
 *        so it works for label printers (one sticker per page) AND for A4
 *        bulk printing (grid of stickers per A4 sheet).
 *
 *   The size + template preferences are persisted to localStorage via
 *   `sticker-print-prefs.ts` so the dialog remembers the user's last choice.
 */

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import QRCode from 'qrcode'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Checkbox } from '@/components/ui/checkbox'
import { matchesSuffixOrContains } from '@/lib/suffix-search'
import { Printer, Search, Loader2, Tag, QrCode, Ruler, LayoutTemplate } from 'lucide-react'
import type { Device } from './types'
import {
  STICKER_SIZE_PRESETS,
  STICKER_TEMPLATE_PRESETS,
  DEFAULT_STICKER_SETTINGS,
  resolveStickerCanvas,
  substituteVariables,
  renderStickerFromTemplate,
  buildPrintDocument,
  type StickerCanvas,
  type StickerDeviceData,
  type StickerElement,
  type StickerSettings,
  type StickerTemplate,
} from '@/lib/sticker-template'
import {
  loadStickerPrintPrefs,
  saveStickerPrintPrefs,
  type StickerPrintPrefs,
} from '@/lib/sticker-print-prefs'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  devices: Device[]
  orgName?: string | null
  /**
   * Optional override for the QR code content of each device.
   * Default: encode `device.assetCode` (the historical behavior).
   *
   * Pass a function that returns a string (e.g. the Smart QR URL) to encode
   * something different — used by the accessory-sticker flow where we want
   * the QR to point at `/qr/a/{shortId}?action=view` instead of the asset code.
   *
   * Return `null`/`undefined` to fall back to the asset code for that device.
   */
  qrContentFor?: (device: Device) => string | null | undefined
  /**
   * Optional title override (e.g. "พิมพ์สติกเกอร์อุปกรณ์ต่อพ่วง").
   * Defaults to "🏷️ พิมพ์สติกเกอร์อุปกรณ์".
   */
  dialogTitle?: React.ReactNode
  /**
   * Optional description override shown under the title.
   */
  dialogDescription?: React.ReactNode
}

// ─── Device → StickerDeviceData ──────────────────────────────────────────
function deviceToStickerData(d: Device): StickerDeviceData {
  return {
    assetCode: d.assetCode,
    assetSiteCode: d.assetSiteCode ?? null,
    serialNumber: d.serialNumber ?? null,
    type: d.type ?? null,
    brand: d.brand ?? null,
    model: d.model ?? null,
    building: d.building ?? null,
    floor: d.floor ?? null,
    department: d.department ?? null,
    departmentCode: d.departmentCode ?? null,
    location: d.location ?? null,
    site: d.site ?? null,
    contractNo: d.contractNo ?? null,
    vendor: d.vendor ?? null,
  }
}

// ─── Build a per-device QR cache honoring `qrContentFor` overrides ────────
// The cache key matches what `renderElement` would look up (i.e. the
// template-substituted `el.content`, falling back to `device.assetCode`).
// The cache value is the actual QR data URL — generated from `qrOverride`
// when provided, else from the default key.
//
// `device` may be null (no sample device available); in that case we still
// walk the template so the preview can render a placeholder QR.
async function buildQrCacheForDevice(
  device: StickerDeviceData | null,
  template: StickerTemplate,
  settings: StickerSettings,
  qrOverride?: string | null,
): Promise<Map<string, string>> {
  const cache = new Map<string, string>()
  for (const el of template.elements as readonly StickerElement[]) {
    if (el.type !== 'qr') continue
    const defaultData =
      substituteVariables(el.content ?? '', device, settings) ||
      device?.assetCode ||
      ''
    if (!defaultData || cache.has(defaultData)) continue
    const qrData = qrOverride ?? defaultData
    try {
      const url = await QRCode.toDataURL(qrData, {
        margin: 1,
        width: 240,
        errorCorrectionLevel: 'M',
      })
      cache.set(defaultData, url)
    } catch {
      // skip on error
    }
  }
  return cache
}

// ─── Component ────────────────────────────────────────────────────────────
export function StickerPrintDialog({
  open,
  onOpenChange,
  devices,
  orgName,
  qrContentFor,
  dialogTitle,
  dialogDescription,
}: Props) {
  const qc = useQueryClient()

  // ── Sticker prefs (size + template) — loaded once on mount ─────────────
  const [prefs, setPrefs] = React.useState<StickerPrintPrefs>(() => ({
    sizePresetId: 'default',
    customWidth: 75.2,
    customHeight: 36,
    templatePresetId: 'default',
  }))
  const [prefsLoaded, setPrefsLoaded] = React.useState(false)

  React.useEffect(() => {
    if (!open || prefsLoaded) return
    setPrefs(loadStickerPrintPrefs())
    setPrefsLoaded(true)
  }, [open, prefsLoaded])

  function updatePrefs(patch: Partial<StickerPrintPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      saveStickerPrintPrefs(next)
      return next
    })
  }

  // ── Device selection state (unchanged from previous version) ────────────
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
        matchesSuffixOrContains(d.assetCode, q) ||
        d.name.toLowerCase().includes(q) ||
        d.brand.toLowerCase().includes(q) ||
        d.model.toLowerCase().includes(q) ||
        matchesSuffixOrContains(d.serialNumber, q),
    )
  }, [activeDevices, search])

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

  const selectedDevices = React.useMemo(
    () => activeDevices.filter((d) => selectedIds.has(d.id)),
    [activeDevices, selectedIds],
  )

  // ── Resolve canvas + template from prefs ───────────────────────────────
  const canvas: StickerCanvas = React.useMemo(
    () => resolveStickerCanvas(prefs.sizePresetId, prefs.customWidth, prefs.customHeight),
    [prefs.sizePresetId, prefs.customWidth, prefs.customHeight],
  )

  const template: StickerTemplate = React.useMemo(() => {
    const preset = STICKER_TEMPLATE_PRESETS.find((p) => p.id === prefs.templatePresetId)
    if (!preset) {
      return STICKER_TEMPLATE_PRESETS[0].build(canvas)
    }
    return preset.build(canvas)
  }, [prefs.templatePresetId, canvas])

  const settings: StickerSettings = React.useMemo(
    () => ({
      ...DEFAULT_STICKER_SETTINGS,
      companyName: orgName?.trim() || DEFAULT_STICKER_SETTINGS.companyName,
      hospitalName: orgName?.trim() || DEFAULT_STICKER_SETTINGS.hospitalName,
    }),
    [orgName],
  )

  // ── Live preview (async) ────────────────────────────────────────────────
  // Uses the first selected device (or a placeholder device) to render an
  // in-dialog preview sticker HTML. Re-renders when canvas, template, or
  // sample device changes.
  const [previewHtml, setPreviewHtml] = React.useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = React.useState(false)

  const sampleDevice: Device | null = selectedDevices[0] ?? activeDevices[0] ?? null

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setPreviewLoading(true)
    const deviceData = sampleDevice ? deviceToStickerData(sampleDevice) : null
    const qrOverride = sampleDevice ? (qrContentFor?.(sampleDevice) ?? null) : null
    Promise.resolve()
      .then(async () => {
        const cache = await buildQrCacheForDevice(deviceData, template, settings, qrOverride)
        const { html } = await renderStickerFromTemplate(deviceData, template, settings, {
          qrCache: cache,
        })
        return html
      })
      .then((html) => {
        if (!cancelled) {
          setPreviewHtml(html)
          setPreviewLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewHtml(null)
          setPreviewLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, sampleDevice, template, settings, qrContentFor])

  // ── Print ──────────────────────────────────────────────────────────────
  async function handlePrint() {
    if (selectedDevices.length === 0) {
      toast.error('กรุณาเลือกอุปกรณ์อย่างน้อย 1 เครื่อง')
      return
    }
    setPrinting(true)
    try {
      // Render each device's sticker HTML using the template engine.
      const stickersHtml: string[] = []
      for (const d of selectedDevices) {
        const deviceData = deviceToStickerData(d)
        const qrOverride = qrContentFor?.(d) ?? null
        const cache = await buildQrCacheForDevice(deviceData, template, settings, qrOverride)
        const { html } = await renderStickerFromTemplate(deviceData, template, settings, {
          qrCache: cache,
        })
        stickersHtml.push(html)
      }

      const html = buildPrintDocument(stickersHtml, template, 1)

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
        } catch (err) {
          console.error('[sticker-print-dialog]', err)
        }
      }, 350)

      // Log audit (fire-and-forget)
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
              sizePreset: prefs.sizePresetId,
              canvasWidth: canvas.width,
              canvasHeight: canvas.height,
              templatePreset: prefs.templatePresetId,
            },
          }),
        })
        await qc.invalidateQueries({ queryKey: ['audit'] })
      } catch (err) {
        console.error('[sticker-print-dialog]', err)
      }

      toast.success(`เตรียมสติกเกอร์ ${selectedDevices.length} ใบสำหรับพิมพ์แล้ว`)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Print failed')
    } finally {
      setPrinting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  // For very wide/tall canvases (e.g. A4), preview needs to scale down to fit
  // the dialog. We compute a scale factor that fits the longest side into
  // 320px (preview container width ~ 320-440px on most screens).
  const previewScale = React.useMemo(() => {
    // 1mm ≈ 3.78px @ 96dpi
    const pxW = canvas.width * 3.78
    const pxH = canvas.height * 3.78
    const maxW = 360
    const maxH = 280
    const sx = maxW / pxW
    const sy = maxH / pxH
    return Math.min(1, sx, sy)
  }, [canvas.width, canvas.height])

  const isCustomSize = prefs.sizePresetId === 'custom'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-2xl dark:border-slate-800 dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <Tag className="h-5 w-5 text-[#f97316]" />
            {dialogTitle ?? <>🏷️ พิมพ์สติกเกอร์อุปกรณ์</>}
          </DialogTitle>
          <DialogDescription>
            {dialogDescription ?? 'สร้างสติกเกอร์ฉลากอุปกรณ์สำหรับติดเครื่อง'}
          </DialogDescription>
        </DialogHeader>

        <div className="itam-scroll max-h-[68vh] space-y-4 overflow-y-auto pr-1">
          {/* ── Sticker settings: size + template ── */}
          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/20">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Ruler className="h-3.5 w-3.5" />
              ตั้งค่าสติกเกอร์
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Size preset dropdown */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  ขนาดสติกเกอร์
                </Label>
                <Select
                  value={prefs.sizePresetId}
                  onValueChange={(v) => updatePrefs({ sizePresetId: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STICKER_SIZE_PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  ขนาดปัจจุบัน: {canvas.width.toFixed(1)} × {canvas.height.toFixed(1)} มม.
                </p>
              </div>

              {/* Template preset dropdown */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  เทมเพลต / รูปแบบ
                </Label>
                <Select
                  value={prefs.templatePresetId}
                  onValueChange={(v) => updatePrefs({ templatePresetId: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STICKER_TEMPLATE_PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  <LayoutTemplate className="mr-1 inline h-3 w-3 align-text-bottom" />
                  เทมเพลต: {template.name}
                </p>
              </div>
            </div>

            {/* Custom size inputs (only when "custom" is selected) */}
            {isCustomSize && (
              <div className="grid grid-cols-2 gap-3 rounded-md border border-dashed border-slate-300 bg-white p-2 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="space-y-1">
                  <Label
                    htmlFor="stk-custom-w"
                    className="text-[11px] font-medium text-slate-600 dark:text-slate-300"
                  >
                    ความกว้าง (มม.)
                  </Label>
                  <Input
                    id="stk-custom-w"
                    type="number"
                    min={10}
                    max={500}
                    step={0.1}
                    value={prefs.customWidth || ''}
                    onChange={(e) =>
                      updatePrefs({ customWidth: Number(e.target.value) || 0 })
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="stk-custom-h"
                    className="text-[11px] font-medium text-slate-600 dark:text-slate-300"
                  >
                    ความสูง (มม.)
                  </Label>
                  <Input
                    id="stk-custom-h"
                    type="number"
                    min={10}
                    max={500}
                    step={0.1}
                    value={prefs.customHeight || ''}
                    onChange={(e) =>
                      updatePrefs({ customHeight: Number(e.target.value) || 0 })
                    }
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Live preview ── */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              ตัวอย่างสติกเกอร์ (พรีวิว)
            </Label>
            <div
              className="overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40"
              style={{ minHeight: 120, maxHeight: 320 }}
            >
              {previewLoading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400 dark:text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  กำลังเตรียมตัวอย่าง...
                </div>
              ) : previewHtml ? (
                <div className="flex justify-center">
                  <div
                    style={{
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'center top',
                      width: `${canvas.width * 3.78 * previewScale}px`,
                      height: `${canvas.height * 3.78 * previewScale}px`,
                    }}
                    // Render the template-engine HTML — uses the same
                    // .stk-sticker / .stk-el classes as the print document.
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-6 text-slate-400 dark:text-slate-500">
                  <Tag className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                  <span className="text-xs">เลือกอุปกรณ์ด้านล่างเพื่อดูตัวอย่าง</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Device selection ── */}
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
