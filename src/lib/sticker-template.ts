/**
 * sticker-template.ts — pure helpers for the Sticker System.
 *
 * This module is server-safe (it uses `qrcode` lazily inside an async render
 * function). Pure types + constants live here so the client editor component
 * can import them without bundling server-only code.
 */

import QRCode from 'qrcode'

// ─── Types ────────────────────────────────────────────────────────────────

export type StickerElementType = 'text' | 'image' | 'qr' | 'rect'

export type OverflowMode = 'clip' | 'visible'

export interface StickerCanvas {
  width: number   // in mm
  height: number  // in mm
  unit: 'mm'
}

export interface StickerElement {
  id: string
  type: StickerElementType
  /** X position in mm (top-left origin) */
  x: number
  /** Y position in mm (top-left origin) */
  y: number
  /** Width in mm */
  width: number
  /** Height in mm */
  height: number
  /** Opacity 0–1 */
  opacity?: number
  /** Stacking order (higher = front) */
  zIndex?: number
  /** Rotation in degrees */
  rotation?: number
  // Text-only props
  fontSize?: number   // pt
  fontWeight?: number // 100..900
  color?: string      // hex / css color
  align?: 'left' | 'center' | 'right'
  /** For text: the text content with {{variables}}. For image: src url. For qr: data to encode. */
  content?: string
  /** Optional source identifier (e.g. for image — same as content but kept separate to allow future ref types) */
  source?: string
  // Rect-only props
  background?: string
  border?: string
  borderRadius?: number
}

export interface StickerTemplate {
  id: string
  name: string
  isDefault: boolean
  canvas: StickerCanvas
  overflow: OverflowMode
  elements: StickerElement[]
}

export interface StickerSettings {
  companyName: string
  hospitalName: string
  footerNote: string
  hotline: string
  lineOALink: string
}

export const DEFAULT_STICKER_SETTINGS: StickerSettings = {
  companyName: 'Your Organization',
  hospitalName: 'ชื่อองค์กร',  // generic — user sets their own name in Settings
  footerNote: 'ห้ามนำอุปกรณ์ออกจากพื้นที่ — กรุณาติดต่อ IT หากพบปัญหา',
  hotline: '000-000-0000',
  lineOALink: '@your-org',
}

// ─── 18 supported variables (mirror of Apps Script Section 6) ─────────────
export const STICKER_VARIABLES: string[] = [
  '{{companyName}}',
  '{{hospitalName}}',
  '{{AssetNo}}',
  '{{AssetSiteCode}}',
  '{{Serial}}',
  '{{Type}}',
  '{{Brand}}',
  '{{Model}}',
  '{{Building}}',
  '{{Floor}}',
  '{{Department}}',
  '{{DepartmentCode}}',
  '{{Location}}',
  '{{Site}}',
  '{{ContractNo}}',
  '{{Vendor}}',
  '{{hotline}}',
  '{{footerNote}}',
  '{{lineOA}}',
]

// ─── Sample device used by the editor Preview modal ───────────────────────
export const SAMPLE_DEVICE: StickerDeviceData = {
  assetCode: 'IT-00001',
  assetSiteCode: 'UDH-00001',
  serialNumber: 'SN12345678',
  type: 'PRINTER',
  brand: 'HP',
  model: 'LaserJet Pro M404',
  building: 'อาคาร A',
  floor: '1',
  department: 'ฝ่ายเทคโนโลยีสารสนเทศ',
  departmentCode: 'IT-001',
  location: 'ห้องประชุม 1',
  site: 'สำนักงานใหญ่',
  contractNo: 'CTR-2025-001',
  vendor: 'Your Vendor Co.,Ltd',
}

// ─── Device data shape used for variable substitution ────────────────────
export interface StickerDeviceData {
  assetCode: string
  assetSiteCode: string | null
  serialNumber: string | null
  type: string | null
  brand: string | null
  model: string | null
  building: string | null
  floor: string | null
  department: string | null
  departmentCode: string | null
  location: string | null
  site: string | null
  contractNo: string | null
  vendor: string | null
}

// ─── ID generator ────────────────────────────────────────────────────────
let _seq = 0
export function genElementId(prefix = 'el'): string {
  _seq += 1
  return `${prefix}-${Date.now().toString(36)}-${_seq.toString(36)}`
}

export function genTemplateId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ─── Build the 17-element default template (matches Apps Script) ──────────
export function buildDefaultTemplate(): StickerTemplate {
  const elements: StickerElement[] = [
    // 1 — header bar
    {
      id: genElementId(),
      type: 'rect',
      x: 0, y: 0, width: 75.2, height: 5,
      background: '#f97316',
      zIndex: 0,
    },
    // 2 — companyName (left of header)
    {
      id: genElementId(),
      type: 'text',
      x: 1.5, y: 0.6, width: 40, height: 3.8,
      content: '{{companyName}}',
      fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'left',
      zIndex: 1,
    },
    // 3 — hospitalName (right of header)
    {
      id: genElementId(),
      type: 'text',
      x: 42, y: 0.6, width: 32, height: 3.8,
      content: '{{hospitalName}}',
      fontSize: 6.5, fontWeight: 600, color: '#ffffff', align: 'right',
      zIndex: 1,
    },
    // 4 — AssetNo label
    {
      id: genElementId(),
      type: 'text',
      x: 1.5, y: 6, width: 30, height: 2,
      content: 'Asset No.',
      fontSize: 5, fontWeight: 500, color: '#64748b', align: 'left',
      zIndex: 1,
    },
    // 5 — AssetNo value (large)
    {
      id: genElementId(),
      type: 'text',
      x: 1.5, y: 8, width: 45, height: 4,
      content: '{{AssetNo}}',
      fontSize: 11, fontWeight: 800, color: '#f97316', align: 'left',
      zIndex: 1,
    },
    // 6 — AssetSiteCode label
    {
      id: genElementId(),
      type: 'text',
      x: 47, y: 6, width: 27, height: 2,
      content: 'Site Code',
      fontSize: 5, fontWeight: 500, color: '#64748b', align: 'right',
      zIndex: 1,
    },
    // 7 — AssetSiteCode value
    {
      id: genElementId(),
      type: 'text',
      x: 47, y: 8, width: 27, height: 4,
      content: '{{AssetSiteCode}}',
      fontSize: 10, fontWeight: 800, color: '#0d9488', align: 'right',
      zIndex: 1,
    },
    // 8 — Brand + Model
    {
      id: genElementId(),
      type: 'text',
      x: 1.5, y: 12.5, width: 50, height: 2.5,
      content: '{{Brand}} {{Model}}',
      fontSize: 6.5, fontWeight: 700, color: '#1e293b', align: 'left',
      zIndex: 1,
    },
    // 9 — Type + Serial
    {
      id: genElementId(),
      type: 'text',
      x: 1.5, y: 15, width: 50, height: 2.5,
      content: '{{Type}} · SN: {{Serial}}',
      fontSize: 5.5, fontWeight: 500, color: '#475569', align: 'left',
      zIndex: 1,
    },
    // 10 — Site / Building / Floor
    {
      id: genElementId(),
      type: 'text',
      x: 1.5, y: 17.5, width: 50, height: 2.5,
      content: '{{Site}} / อาคาร {{Building}} / ชั้น {{Floor}}',
      fontSize: 5.5, fontWeight: 500, color: '#475569', align: 'left',
      zIndex: 1,
    },
    // 11 — Department
    {
      id: genElementId(),
      type: 'text',
      x: 1.5, y: 20, width: 50, height: 2.5,
      content: '{{Department}} ({{DepartmentCode}})',
      fontSize: 5.5, fontWeight: 500, color: '#475569', align: 'left',
      zIndex: 1,
    },
    // 12 — Location
    {
      id: genElementId(),
      type: 'text',
      x: 1.5, y: 22.5, width: 50, height: 2.5,
      content: 'ที่ตั้ง: {{Location}}',
      fontSize: 5.5, fontWeight: 500, color: '#475569', align: 'left',
      zIndex: 1,
    },
    // 13 — Contract / Vendor
    {
      id: genElementId(),
      type: 'text',
      x: 1.5, y: 25, width: 50, height: 2.5,
      content: 'สัญญา: {{ContractNo}} · ผู้ขาย: {{Vendor}}',
      fontSize: 5, fontWeight: 500, color: '#64748b', align: 'left',
      zIndex: 1,
    },
    // 14 — hotline + LINE OA — "สแกนเพื่อแจ้งซ่อม"
    // เดิม: "โทร: {{hotline}} · LINE: {{lineOA}}"
    // ใหม่: สั้นลง ให้พื้นที่สำหรับ QR และ assetSiteCode
    // (ผู้ใช้สแกน QR แล้วเข้า LINE Login อัตโนมัติ — ไม่ต้องพิมพ์ @lineOA บนสติกเกอร์แล้ว)
    {
      id: genElementId(),
      type: 'text',
      x: 1.5, y: 27.5, width: 50, height: 2.5,
      content: 'สแกน QR เพื่อแจ้งซ่อม · โทร {{hotline}}',
      fontSize: 5.5, fontWeight: 700, color: '#f97316', align: 'left',
      zIndex: 1,
    },
    // 15 — QR code (right side, below header)
    {
      id: genElementId(),
      type: 'qr',
      x: 53, y: 13, width: 21, height: 21,
      content: '{{AssetNo}}',
      zIndex: 1,
    },
    // 16 — footer divider
    {
      id: genElementId(),
      type: 'rect',
      x: 1.5, y: 30.5, width: 72, height: 0.2,
      background: '#cbd5e1',
      zIndex: 0,
    },
    // 17 — footerNote
    {
      id: genElementId(),
      type: 'text',
      x: 1.5, y: 31, width: 72, height: 4,
      content: '{{footerNote}}',
      fontSize: 4.5, fontWeight: 500, color: '#94a3b8', align: 'center',
      zIndex: 1,
    },
  ]

  return {
    id: 'tpl-default',
    name: 'เทมเพลตเริ่มต้น (Default)',
    isDefault: true,
    canvas: { width: 75.2, height: 36, unit: 'mm' },
    overflow: 'clip',
    elements,
  }
}

// ─── Variable substitution ────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/`/g, '&#96;')
}

export function substituteVariables(
  text: string,
  device: StickerDeviceData | null,
  settings: StickerSettings,
): string {
  const v: Record<string, string> = {
    '{{companyName}}': settings.companyName || '',
    '{{hospitalName}}': settings.hospitalName || '',
    '{{AssetNo}}': device?.assetCode || '',
    '{{AssetSiteCode}}': device?.assetSiteCode || '',
    '{{Serial}}': device?.serialNumber || '',
    '{{Type}}': device?.type || '',
    '{{Brand}}': device?.brand || '',
    '{{Model}}': device?.model || '',
    '{{Building}}': device?.building || '',
    '{{Floor}}': device?.floor || '',
    '{{Department}}': device?.department || '',
    '{{DepartmentCode}}': device?.departmentCode || '',
    '{{Location}}': device?.location || '',
    '{{Site}}': device?.site || '',
    '{{ContractNo}}': device?.contractNo || '',
    '{{Vendor}}': device?.vendor || '',
    '{{hotline}}': settings.hotline || '',
    '{{footerNote}}': settings.footerNote || '',
    '{{lineOA}}': settings.lineOALink || '',
  }
  let out = text
  for (const [k, val] of Object.entries(v)) {
    out = out.split(k).join(val)
  }
  return out
}

// ─── Render a single element to HTML ─────────────────────────────────────
function renderElement(
  el: StickerElement,
  device: StickerDeviceData | null,
  settings: StickerSettings,
  qrCache: Map<string, string>,
): string {
  const opacity = el.opacity ?? 1
  const zIndex = el.zIndex ?? 0
  const rotation = el.rotation ?? 0
  const baseStyle = [
    `left:${el.x}mm`,
    `top:${el.y}mm`,
    `width:${el.width}mm`,
    `height:${el.height}mm`,
    `opacity:${opacity}`,
    `z-index:${zIndex}`,
    rotation ? `transform:rotate(${rotation}deg)` : '',
  ].filter(Boolean).join(';')

  if (el.type === 'text') {
    const raw = el.content ?? ''
    const substituted = substituteVariables(raw, device, settings)
    const fontSize = el.fontSize ?? 6
    const fontWeight = el.fontWeight ?? 500
    const color = el.color ?? '#1e293b'
    const align = el.align ?? 'left'
    // white-space: pre-wrap so multi-line content (\n) is preserved.
    return `<div class="stk-el stk-text" style="${baseStyle};font-size:${fontSize}pt;font-weight:${fontWeight};color:${color};text-align:${align};overflow:hidden;line-height:1.15;white-space:pre-wrap;word-break:break-word">${escapeHtml(substituted)}</div>`
  }

  if (el.type === 'rect') {
    const bg = el.background ?? 'transparent'
    const border = el.border ?? 'none'
    const radius = el.borderRadius ?? 0
    return `<div class="stk-el stk-rect" style="${baseStyle};background:${bg};border:${border};border-radius:${radius}mm"></div>`
  }

  if (el.type === 'image') {
    const src = el.source || el.content || ''
    if (!src) {
      return `<div class="stk-el stk-image" style="${baseStyle};background:#f1f5f9;border:1px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:6pt">(image)</div>`
    }
    return `<img class="stk-el stk-image" src="${escapeAttr(src)}" alt="" style="${baseStyle};object-fit:contain" />`
  }

  if (el.type === 'qr') {
    // QR data: substitute variables into the content (e.g. '{{AssetNo}}')
    const data = substituteVariables(el.content ?? '', device, settings) || device?.assetCode || ''
    const cached = qrCache.get(data)
    if (cached) {
      return `<img class="stk-el stk-qr" src="${cached}" alt="QR" style="${baseStyle};object-fit:contain" />`
    }
    // No cached QR — render a placeholder (the caller should pre-generate QRs)
    return `<div class="stk-el stk-qr" style="${baseStyle};background:#f8fafc;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:5pt">QR</div>`
  }

  return ''
}

// ─── Pre-generate QR codes for all QR elements in a template ─────────────
export async function preGenerateQrCodes(
  template: StickerTemplate,
  device: StickerDeviceData | null,
  settings: StickerSettings,
): Promise<Map<string, string>> {
  const cache = new Map<string, string>()
  const dataKeys = new Set<string>()
  for (const el of template.elements) {
    if (el.type !== 'qr') continue
    const data = substituteVariables(el.content ?? '', device, settings) || device?.assetCode || ''
    if (!data) continue
    dataKeys.add(data)
  }
  for (const data of dataKeys) {
    try {
      const url = await QRCode.toDataURL(data, {
        margin: 1,
        width: 240,
        errorCorrectionLevel: 'M',
      })
      cache.set(data, url)
    } catch {
      // skip on error
    }
  }
  return cache
}

// ─── Render full sticker HTML (inside container) ─────────────────────────
export async function renderStickerFromTemplate(
  device: StickerDeviceData | null,
  template: StickerTemplate,
  settings: StickerSettings,
  options: { qrCache?: Map<string, string> } = {},
): Promise<{ html: string; qrDataUrls: Record<string, string> }> {
  // 1) Pre-generate QR codes (or use provided cache)
  const qrCache = options.qrCache ?? await preGenerateQrCodes(template, device, settings)

  // 2) Sort elements by zIndex then by id for stable order
  const sorted = [...template.elements].sort((a, b) => {
    const za = a.zIndex ?? 0
    const zb = b.zIndex ?? 0
    if (za !== zb) return za - zb
    return a.id.localeCompare(b.id)
  })

  // 3) Render
  const body = sorted
    .map((el) => renderElement(el, device, settings, qrCache))
    .filter(Boolean)
    .join('\n')

  const overflowCss = template.overflow === 'visible' ? 'visible' : 'hidden'

  const html = `<div class="stk-sticker" style="position:relative;width:${template.canvas.width}mm;height:${template.canvas.height}mm;background:#ffffff;overflow:${overflowCss};box-sizing:border-box;font-family:'Sukhumvit Set','Noto Sans Thai','Tahoma','Segoe UI',sans-serif">${body}</div>`

  // Convert Map → plain object for JSON serialization
  const qrDataUrls: Record<string, string> = {}
  for (const [k, v] of qrCache.entries()) qrDataUrls[k] = v

  return { html, qrDataUrls }
}

// ─── Auto-calculate columns for bulk print ───────────────────────────────
// A4 portrait = 210mm × 297mm. A4 landscape = 297mm × 210mm.
// We pick orientation based on which dimension of the page best fits.
export function calculateGridColumns(
  templateWidth: number,
  pageWidth: number,
  gap: number = 4,
  margin: number = 8,
): number {
  if (templateWidth <= 0) return 1
  const usable = pageWidth - 2 * margin + gap
  const cols = Math.floor(usable / (templateWidth + gap))
  return Math.max(1, cols)
}

// ─── Build a full standalone print document HTML ─────────────────────────
export function buildPrintDocument(
  stickersHtml: string[],
  template: StickerTemplate,
  cols: number,
): string {
  const { width, height } = template.canvas
  // Page orientation: if width > height, use landscape
  const orientation = width > height ? 'landscape' : 'portrait'
  // A4 size
  const pageWidth = orientation === 'landscape' ? 297 : 210
  const pageHeight = orientation === 'landscape' ? 210 : 297
  const gap = 4
  const margin = 8

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<title>สติกเกอร์อุปกรณ์ IT</title>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: "Sukhumvit Set","Noto Sans Thai","Tahoma","Segoe UI",sans-serif;
    color: #1e293b;
    background: #ffffff;
  }
  .page {
    padding: ${margin}mm;
    display: grid;
    grid-template-columns: repeat(${cols}, ${width}mm);
    grid-auto-rows: ${height}mm;
    gap: ${gap}mm;
    justify-content: start;
  }
  .stk-sticker {
    border: 1px dashed #cbd5e1;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .stk-sticker + .stk-sticker { /* keep spacing tidy */ }
  @media print {
    @page {
      size: A4 ${orientation};
      margin: ${margin}mm;
    }
    body { background: #ffffff; }
    .page { padding: 0; gap: ${gap}mm; }
    .stk-sticker { border: none; }
  }
  /* screen preview tweak */
  @media screen {
    body { background: #e2e8f0; padding: 12px; }
    .page { background: #ffffff; box-shadow: 0 4px 12px rgba(15,23,42,0.08); }
  }
</style>
</head>
<body>
  <div class="page">
    ${stickersHtml.join('\n')}
  </div>
  <script>
    // Auto-print after layout settles
    (function () {
      if (document.readyState === 'complete') doPrint();
      else window.addEventListener('load', doPrint);
      function doPrint() {
        setTimeout(function () { try { window.focus(); window.print(); } catch (e) {} }, 300);
      }
    })();
  </script>
</body>
</html>`
}

// ─── Sanitize/normalize an incoming template object ───────────────────────
export function normalizeTemplate(input: unknown): StickerTemplate {
  const obj = (input ?? {}) as Partial<StickerTemplate>
  const canvas = (obj.canvas ?? {}) as Partial<StickerCanvas>
  return {
    id: String(obj.id ?? genTemplateId()),
    name: String(obj.name ?? 'เทมเพลตใหม่').slice(0, 100),
    isDefault: !!obj.isDefault,
    canvas: {
      width: Number(canvas.width) > 0 ? Number(canvas.width) : 75.2,
      height: Number(canvas.height) > 0 ? Number(canvas.height) : 36,
      unit: 'mm',
    },
    overflow: obj.overflow === 'visible' ? 'visible' : 'clip',
    elements: Array.isArray(obj.elements)
      ? obj.elements.map((el) => normalizeElement(el))
      : [],
  }
}

export function normalizeElement(input: unknown): StickerElement {
  const el = (input ?? {}) as Partial<StickerElement>
  return {
    id: String(el.id ?? genElementId()),
    type: (['text', 'image', 'qr', 'rect'].includes(el.type as string)
      ? (el.type as StickerElementType)
      : 'text'),
    x: Number(el.x) || 0,
    y: Number(el.y) || 0,
    width: Number(el.width) || 10,
    height: Number(el.height) || 4,
    opacity: typeof el.opacity === 'number' ? Math.min(1, Math.max(0, el.opacity)) : 1,
    zIndex: typeof el.zIndex === 'number' ? el.zIndex : 0,
    rotation: typeof el.rotation === 'number' ? el.rotation : 0,
    fontSize: typeof el.fontSize === 'number' ? el.fontSize : 6,
    fontWeight: typeof el.fontWeight === 'number' ? el.fontWeight : 500,
    color: typeof el.color === 'string' ? el.color : '#1e293b',
    align: (['left', 'center', 'right'].includes(el.align as string)
      ? (el.align as 'left' | 'center' | 'right')
      : 'left'),
    content: typeof el.content === 'string' ? el.content : '',
    source: typeof el.source === 'string' ? el.source : '',
    background: typeof el.background === 'string' ? el.background : '',
    border: typeof el.border === 'string' ? el.border : '',
    borderRadius: typeof el.borderRadius === 'number' ? el.borderRadius : 0,
  }
}

// ─── Paper size presets (mirror of Apps Script dropdown) ─────────────────
export interface PaperPreset {
  label: string
  width: number
  height: number
}
export const PAPER_PRESETS: PaperPreset[] = [
  { label: '75.2 × 36 mm', width: 75.2, height: 36 },
  { label: '50 × 30 mm', width: 50, height: 30 },
  { label: '70 × 40 mm', width: 70, height: 40 },
  { label: '100 × 50 mm', width: 100, height: 50 },
]

// ─── Check whether an element exceeds the canvas bounds ──────────────────
export function elementExceedsBounds(el: StickerElement, canvas: StickerCanvas): boolean {
  return (
    el.x < 0 ||
    el.y < 0 ||
    el.x + el.width > canvas.width + 0.01 ||
    el.y + el.height > canvas.height + 0.01
  )
}
