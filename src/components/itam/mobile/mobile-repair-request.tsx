'use client'

/**
 * MobileRepairRequest — mobile-first "แจ้งซ่อม" (Repair Request) screen.
 *
 * Flow:
 *   1. Quick search device by asset code or serial number.
 *   2. Pick a device from the dropdown results.
 *   3. Fill the repair form:
 *        - Subject      (required)
 *        - Description  (required)
 *        - Priority     (low / medium / high / urgent → mapped to Thai)
 *        - Photo(s)     (camera capture, up to 4 images)
 *   4. Submit → POST /api/work-orders (Bearer token attached by the global
 *      fetch interceptor in app/page.tsx).
 *   5. Success screen with the returned WorkOrder number.
 *
 * Touch targets: every button/select is ≥44px (size lg, h-12, etc).
 *
 * Responsive: full-width on phones (max-w-md wrapper from the shell);
 * `max-h-72 overflow-y-auto` on the search results list so it never pushes
 * the form below the fold.
 *
 * Accessibility:
 *   - All inputs have <Label> (with htmlFor) + aria-required.
 *   - Touch-friendly hit areas.
 *   - Error messages announced via role="alert".
 *   - Loading state has aria-busy + a spinner.
 *
 * API contract (POST /api/work-orders, see src/app/api/work-orders/route.ts):
 *   Request body:
 *     {
 *       subject: string,                 // required (validated server-side)
 *       details: string | null,          // optional but enforced on the client
 *       priority: 'ปกติ' | 'ปานกลาง' | 'สูง' | 'ด่วน',
 *       deviceId: string | null,
 *       building: string | null,
 *       location: string | null,
 *       picBeforeImages: string[],      // base64 data URLs (max 9 server-side)
 *       submissionSource: 'session',    // logged-in staff flow → skip guest validation
 *       reporterName?: string | null,
 *       actor?: string,
 *     }
 *   Response 201: { data: WorkOrder }  // data.woNumber is what we display
 *
 * Device search (GET /api/devices?search=Q) returns:
 *   { devices: Device[], total, page, limit, totalPages }
 * — already authorized via the Bearer interceptor; non-superadmin users
 *   only see their Site-scoped devices (server-side).
 */

import * as React from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Search,
  X,
  Loader2,
  Camera,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  RotateCcw,
  FileText,
  Image as ImageIcon,
  Trash2,
  ScanLine,
  Building2,
  Printer,
  QrCode,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth-store'

// ── Types ─────────────────────────────────────────────────────────────

interface DeviceLite {
  id: string
  assetCode: string
  name: string
  brand: string | null
  model: string | null
  type: string | null
  site: string | null
  building: string | null
  location: string | null
  serialNumber: string | null
  status?: string | null
}

type PriorityKey = 'low' | 'medium' | 'high' | 'urgent'

interface PriorityOption {
  key: PriorityKey
  label: string
  /** Value sent to the API (existing schema uses Thai labels). */
  value: string
  /** Tailwind classes for the button (idle / active). */
  activeClass: string
}

const PRIORITIES: PriorityOption[] = [
  { key: 'low',    label: 'ปกติ',     value: 'ปกติ',     activeClass: 'bg-emerald-500 text-white border-emerald-500' },
  { key: 'medium', label: 'ปานกลาง',  value: 'ปานกลาง',  activeClass: 'bg-amber-500 text-white border-amber-500' },
  { key: 'high',   label: 'สูง',      value: 'สูง',      activeClass: 'bg-orange-500 text-white border-orange-500' },
  { key: 'urgent', label: 'ด่วน',     value: 'ด่วน',     activeClass: 'bg-rose-500 text-white border-rose-500' },
]

const MAX_IMAGES = 4

// ── Component ─────────────────────────────────────────────────────────

export function MobileRepairRequest() {
  // ── Device search state ──
  const [searchTerm, setSearchTerm] = React.useState('')
  const [searching, setSearching] = React.useState(false)
  const [results, setResults] = React.useState<DeviceLite[]>([])
  const [searchError, setSearchError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<DeviceLite | null>(null)
  const [showResults, setShowResults] = React.useState(false)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const resultsRef = React.useRef<HTMLDivElement>(null)

  // ── Form state ──
  const [subject, setSubject] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [priority, setPriority] = React.useState<PriorityKey>('medium')
  const [images, setImages] = React.useState<string[]>([]) // base64 data URLs
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [successWoNumber, setSuccessWoNumber] = React.useState<string | null>(null)

  // ── Camera capture (re-uses the project's CameraCapture pattern inline
  //    so we can keep the full-screen overlay consistent with the rest of
  //    the app and avoid pulling another dep into the mobile bundle). ──
  const [cameraOpen, setCameraOpen] = React.useState(false)
  const [qrScanOpen, setQrScanOpen] = React.useState(false)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // ── Auth-aware reporter info (for submissionSource='session') ──
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)

  // Helper: get auth headers for fetch
  function getAuthHeaders(): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  // ── Search effect (debounced 200ms — faster response) ──
  React.useEffect(() => {
    if (selected) return // do not re-search while a device is selected
    const q = searchTerm.trim()
    if (q.length < 1) {
      setResults([])
      setSearchError(null)
      setShowResults(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchError(null)
      setShowResults(true)
      try {
        // Use search API with suffix-aware matching (short numeric → suffix first)
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          headers: getAuthHeaders(),
        })
        if (!res.ok) {
          // Fallback to devices endpoint
          const params = new URLSearchParams({ search: q, limit: '10' })
          const fallbackRes = await fetch(`/api/devices?${params.toString()}`, {
            headers: getAuthHeaders(),
          })
          if (!fallbackRes.ok) {
            const j = await fallbackRes.json().catch(() => ({}))
            throw new Error(j.error ?? 'ค้นหาไม่สำเร็จ')
          }
          const json = (await fallbackRes.json()) as { devices?: DeviceLite[] }
          setResults((json.devices ?? []).slice(0, 8))
          return
        }
        const data = await res.json()
        const searchResults = data.results?.devices ?? []
        // Map search results to DeviceLite format
        // subtitle format: "S/N: XXX | Brand Model · Site"
        const mapped: DeviceLite[] = searchResults.map((d: { id: string; title: string; subtitle: string }) => {
          const titleParts = d.title.split(' · ')
          const assetCode = titleParts[0] ?? ''
          const name = titleParts.slice(1).join(' · ') ?? ''

          // Parse subtitle: "S/N: XXX | Brand Model · Site"
          const subtitle = d.subtitle || ''
          let serialNumber = ''
          let site = ''
          if (subtitle.includes('S/N:')) {
            const snPart = subtitle.split('S/N:')[1]?.split('|')[0]?.trim() ?? ''
            serialNumber = snPart
            const afterPipe = subtitle.split('|')[1]?.trim() ?? ''
            const sitePart = afterPipe.split('·').pop()?.trim() ?? ''
            site = sitePart
          }

          return {
            id: d.id,
            assetCode,
            name,
            serialNumber,
            site,
          }
        })
        setResults(mapped.slice(0, 8))
      } catch (e) {
        setResults([])
        setSearchError(e instanceof Error ? e.message : 'ค้นหาไม่สำเร็จ')
      } finally {
        setSearching(false)
      }
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchTerm, selected])

  // ── Click-outside to close results dropdown ──
  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (resultsRef.current && !resultsRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // ── Camera control ──
  async function openCamera() {
    if (cameraOpen) return
    if (images.length >= MAX_IMAGES) {
      toast.error(`เพิ่มรูปได้สูงสุด ${MAX_IMAGES} รูป`)
      return
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error('เบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      setCameraOpen(true)
      // Wait a tick for the video element to mount, then attach the stream
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      }, 50)
    } catch {
      toast.error('ไม่สามารถเปิดกล้องได้ ตรวจสอบสิทธิ์การใช้งาน')
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setCameraOpen(false)
  }

  function capturePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const w = video.videoWidth || 1280
    const h = video.videoHeight || 720
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)
    // Downscale to max 1024 wide, JPEG @ 0.7 (matches CameraCapture.tsx)
    const maxW = 1024
    let dataUrl: string
    if (w > maxW) {
      const scale = maxW / w
      const tmp = document.createElement('canvas')
      tmp.width = maxW
      tmp.height = Math.max(1, Math.round(h * scale))
      const tmpCtx = tmp.getContext('2d')
      if (!tmpCtx) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.7)
      } else {
        tmpCtx.drawImage(canvas, 0, 0, tmp.width, tmp.height)
        dataUrl = tmp.toDataURL('image/jpeg', 0.7)
      }
    } else {
      dataUrl = canvas.toDataURL('image/jpeg', 0.7)
    }
    setImages((prev) => [...prev, dataUrl].slice(0, MAX_IMAGES))
    stopCamera()
  }

  // ── File input fallback (pick from gallery) ──
  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const remaining = MAX_IMAGES - images.length
    if (remaining <= 0) {
      toast.error(`เพิ่มรูปได้สูงสุด ${MAX_IMAGES} รูป`)
      e.target.value = ''
      return
    }
    try {
      const list = Array.from(files).slice(0, remaining)
      const loaded: string[] = []
      for (const file of list) {
        const dataUrl = await readFileAsDataUrl(file)
        loaded.push(dataUrl)
      }
      setImages((prev) => [...prev, ...loaded].slice(0, MAX_IMAGES))
    } catch {
      toast.error('ไม่สามารถอ่านไฟล์รูปได้')
    } finally {
      e.target.value = ''
    }
  }

  // ── Cleanup camera on unmount ──
  React.useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [])

  // ── Submit ──
  async function handleSubmit() {
    setSubmitError(null)
    if (!subject.trim()) {
      setSubmitError('กรุณาระบุประเภทปัญหา')
      return
    }
    if (!description.trim()) {
      setSubmitError('กรุณาระบุรายละเอียดอาการ')
      return
    }
    if (!selected) {
      setSubmitError('กรุณาเลือกอุปกรณ์ที่จะแจ้งซ่อม')
      return
    }
    const prOpt = PRIORITIES.find((p) => p.key === priority)
    if (!prOpt) {
      setSubmitError('ระดับความเร่งด่วนไม่ถูกต้อง')
      return
    }

    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        subject: subject.trim(),
        details: description.trim(),
        priority: prOpt.value,
        deviceId: selected.id,
        building: selected.building ?? null,
        location: selected.location ?? null,
        submissionSource: 'session', // bypass guest contact validation
        reporterName: user?.name ?? user?.username ?? user?.email ?? null,
        actor: user?.email ?? user?.name ?? null,
        picBeforeImages: images,
      }
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'บันทึกไม่สำเร็จ')
      }
      const json = (await res.json()) as { data?: { woNumber?: string | null } }
      const woNumber = json.data?.woNumber ?? null
      setSuccessWoNumber(woNumber)
      toast.success(`สร้างใบแจ้งซ่อม ${woNumber ?? ''} แล้ว`)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSubmitting(false)
    }
  }

  function resetForm() {
    setSubject('')
    setDescription('')
    setPriority('medium')
    setImages([])
    setSelected(null)
    setSearchTerm('')
    setResults([])
    setSubmitError(null)
    setSuccessWoNumber(null)
  }

  // ── Success screen ──
  if (successWoNumber) {
    return (
      <SuccessScreen
        woNumber={successWoNumber}
        subject={subject}
        deviceLabel={
          selected ? `${selected.assetCode} · ${selected.name}` : ''
        }
        onNew={resetForm}
      />
    )
  }

  // ── Main form ──
  return (
    <div className="flex flex-col gap-3">
      {/* Inline QR Scanner overlay — at top level so it always renders */}
      {qrScanOpen && (
        <InlineQRScanner
          onScan={(value) => {
            setSearchTerm(value)
            setQrScanOpen(false)
            toast.success(`สแกนได้: ${value}`)
          }}
          onClose={() => setQrScanOpen(false)}
        />
      )}
      {/* Step 1: Device search */}
      <Card className="gap-0 py-0">
        <CardContent className="px-0 py-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <StepBadge n={1} />
              <span className="text-sm font-semibold">ค้นหาอุปกรณ์</span>
            </div>
            {selected && (
              <button
                type="button"
                onClick={() => {
                  setSelected(null)
                  setSearchTerm('')
                  setResults([])
                }}
                className="text-xs font-medium text-orange-600 hover:underline"
              >
                เปลี่ยนอุปกรณ์
              </button>
            )}
          </div>

          {!selected ? (
            <div className="p-4">
              {/* Search input with icon + QR scan button */}
              <div ref={resultsRef} className="relative">
                <div className="relative flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      inputMode="search"
                      autoComplete="off"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onFocus={() => results.length > 0 && setShowResults(true)}
                      placeholder="รหัสอุปกรณ์ / Serial"
                      aria-label="ค้นหาอุปกรณ์"
                      className="h-12 rounded-lg pl-9 pr-9 text-base"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('')
                          setResults([])
                        }}
                        aria-label="ล้าง"
                        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {/* QR Scan button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      console.log('[QR] button clicked, opening scanner')
                      setQrScanOpen(true)
                    }}
                    aria-label="สแกน QR Code"
                    title="สแกน QR"
                    className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border border-orange-300 bg-orange-50 text-orange-600 transition-colors hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-400 dark:hover:bg-orange-950/60 z-10"
                  >
                    <QrCode className="h-5 w-5" />
                  </button>
                </div>

                {/* Dropdown results */}
                {showResults && (searchTerm.trim().length > 0) && (
                  <div className="mt-2 overflow-hidden rounded-lg border bg-background shadow-sm">
                    {searching ? (
                      <div className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        กำลังค้นหา…
                      </div>
                    ) : searchError ? (
                      <div
                        role="alert"
                        className="flex items-center gap-2 px-3 py-4 text-sm text-rose-600"
                      >
                        <AlertCircle className="h-4 w-4 flex-shrink-0" />
                        {searchError}
                      </div>
                    ) : results.length === 0 ? (
                      <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                        ไม่พบอุปกรณ์ที่ตรงกับ “{searchTerm}”
                      </div>
                    ) : (
                      <ul
                        className="max-h-72 overflow-y-auto"
                        style={{ scrollbarWidth: 'thin' }}
                      >
                        {results.map((d) => (
                          <li key={d.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelected(d)
                                setShowResults(false)
                              }}
                              className="flex w-full items-center justify-between gap-2 border-b px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/60 active:bg-muted"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate font-mono text-xs font-semibold text-orange-600">
                                    {d.assetCode}
                                  </span>
                                  <span className="truncate text-sm font-medium">
                                    {d.name}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                                  {d.serialNumber && (
                                    <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono font-medium text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                                      S/N: {d.serialNumber}
                                    </span>
                                  )}
                                  <span className="text-muted-foreground">
                                    {[d.brand, d.model].filter(Boolean).join(' ') || '—'}
                                  </span>
                                  {d.site && (
                                    <span className="text-muted-foreground">· {d.site}</span>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Hint */}
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                <ScanLine className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                พิมพ์รหัสอุปกรณ์ หรือ Serial Number อย่างน้อย 1 ตัวอักษรเพื่อค้นหา
              </p>
            </div>
          ) : (
            <SelectedDeviceCard device={selected} />
          )}
        </CardContent>
      </Card>

      {/* Step 2: Repair request form (only shown once a device is selected) */}
      {selected && (
        <Card className="gap-0 py-0">
          <CardContent className="px-0 py-0">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <StepBadge n={2} />
              <span className="text-sm font-semibold">รายละเอียดการแจ้งซ่อม</span>
            </div>

            <div className="space-y-4 p-4">
              {/* Subject */}
              <div className="space-y-1.5">
                <Label htmlFor="mrr-subject" className="text-sm font-medium">
                  ประเภทปัญหา <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="mrr-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="เช่น เครื่องพิมพ์ไม่ทำงาน"
                  maxLength={200}
                  className="h-12 text-base"
                  aria-required="true"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="mrr-description"
                  className="text-sm font-medium"
                >
                  รายละเอียดอาการ <span className="text-rose-500">*</span>
                </Label>
                <Textarea
                  id="mrr-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="อธิบายอาการ / สิ่งที่เกิดขึ้น / เมื่อไหร่ที่พบปัญหา"
                  rows={4}
                  maxLength={1000}
                  className="min-h-24 text-base"
                  aria-required="true"
                />
                <p className="text-right text-xs text-muted-foreground">
                  {description.length}/1000
                </p>
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  ความเร่งด่วน <span className="text-rose-500">*</span>
                </Label>
                <div className="grid grid-cols-4 gap-2">
                  {PRIORITIES.map((p) => {
                    const active = priority === p.key
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setPriority(p.key)}
                        aria-pressed={active}
                        className={cn(
                          'flex h-11 items-center justify-center rounded-lg border text-sm font-medium transition-colors',
                          active
                            ? p.activeClass
                            : 'border-border bg-background text-foreground hover:bg-muted',
                        )}
                      >
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Photo capture */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  รูปภาพประกอบ{' '}
                  <span className="text-muted-foreground">
                    (ถ่ายหรือเลือกจากคลัง — สูงสุด {MAX_IMAGES} รูป)
                  </span>
                </Label>

                {/* Thumbnails */}
                {images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {images.map((img, i) => (
                      <div
                        key={i}
                        className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                      >
                        <img
                          src={img}
                          alt={`รูปภาพประกอบ ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setImages((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          aria-label={`ลบรูปที่ ${i + 1}`}
                          className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shadow-sm hover:bg-rose-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Capture / pick buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openCamera}
                    disabled={images.length >= MAX_IMAGES}
                    className="h-12"
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    ถ่ายภาพ
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={images.length >= MAX_IMAGES}
                    className="h-12"
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    เลือกจากคลัง
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  onChange={onFileChange}
                  className="hidden"
                  aria-hidden="true"
                />
              </div>

              {/* Submit error */}
              {submitError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Submit */}
              <Button
                type="button"
                size="lg"
                onClick={handleSubmit}
                disabled={submitting}
                aria-busy={submitting}
                className="h-12 w-full bg-orange-500 text-base font-semibold hover:bg-orange-600"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    กำลังส่งเรื่อง…
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    ส่งเรื่องแจ้งซ่อม
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Camera overlay (full-screen) */}
      {cameraOpen && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
          <div className="flex items-center justify-between p-4">
            <span className="text-sm text-white">ถ่ายภาพอาการ</span>
            <button
              type="button"
              onClick={stopCamera}
              aria-label="ปิดกล้อง"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="flex-1 object-contain"
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="p-6">
            <Button
              type="button"
              onClick={capturePhoto}
              className="h-12 w-full bg-white text-black hover:bg-white/90"
            >
              <Camera className="mr-2 h-5 w-5" />
              ถ่ายภาพ
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
      {n}
    </span>
  )
}

function SelectedDeviceCard({ device }: { device: DeviceLite }) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-orange-600">
              {device.assetCode}
            </span>
            <span className="truncate text-sm font-medium">{device.name}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[device.brand, device.model].filter(Boolean).join(' ') || '—'}
            {device.serialNumber ? ` · S/N ${device.serialNumber}` : ''}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {device.site && (
              <Badge variant="secondary" className="text-[10px]">
                {device.site}
              </Badge>
            )}
            {device.building && (
              <Badge variant="outline" className="text-[10px]">
                {device.building}
              </Badge>
            )}
            {device.location && (
              <Badge variant="outline" className="text-[10px]">
                {device.location}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SuccessScreen({
  woNumber,
  subject,
  deviceLabel,
  onNew,
}: {
  woNumber: string
  subject: string
  deviceLabel: string
  onNew: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center px-2 pt-6"
    >
      <Card className="w-full gap-0 py-0">
        <CardContent className="flex flex-col items-center px-4 py-8 text-center">
          {/* Big check icon */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.05, type: 'spring', stiffness: 220, damping: 18 }}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
          >
            <CheckCircle2 className="h-12 w-12" />
          </motion.div>

          <h2 className="mt-4 text-lg font-semibold">ส่งเรื่องสำเร็จ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ทางทีมงานได้รับแจ้งซ่อมของคุณแล้ว
          </p>

          {/* WorkOrder number */}
          <div className="mt-5 w-full rounded-xl border bg-muted/30 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              เลขใบแจ้งซ่อม
            </p>
            <p className="mt-1 break-all font-mono text-2xl font-bold text-orange-600">
              {woNumber}
            </p>
          </div>

          {/* Summary */}
          <div className="mt-4 w-full space-y-2 text-left text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">ประเภทปัญหา</span>
              <span className="max-w-[60%] truncate font-medium">
                {subject}
              </span>
            </div>
            {deviceLabel && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">อุปกรณ์</span>
                <span className="max-w-[60%] truncate font-medium">
                  {deviceLabel}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 grid w-full grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.open(
                    `/api/public/work-orders/${encodeURIComponent(woNumber)}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              }}
            >
              <FileText className="mr-2 h-4 w-4" />
              ดูสถานะ
            </Button>
            <Button
              type="button"
              className="h-12 bg-orange-500 hover:bg-orange-600"
              onClick={onNew}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              แจ้งซ่อมใหม่
            </Button>
          </div>

          {/* Print ticket (thermal printer) */}
          <div className="mt-3 grid w-full grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 text-xs"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.open(
                    `/api/work-orders/${encodeURIComponent(woNumber)}/print?paper=ticket-80`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              }}
            >
              <Printer className="mr-2 h-4 w-4" />
              พิมพ์ 80mm
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 text-xs"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.open(
                    `/api/work-orders/${encodeURIComponent(woNumber)}/print?paper=ticket-58`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              }}
            >
              <Printer className="mr-2 h-4 w-4" />
              พิมพ์ 58mm
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// ── Inline QR Scanner ─────────────────────────────────────────────────
// Self-contained QR scanner overlay — uses camera + jsQR (dynamic import)
// No dependency on QrScannerDialog (which uses global store + CommonJS).

function InlineQRScanner({
  onScan,
  onClose,
}: {
  onScan: (value: string) => void
  onClose: () => void
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const stoppedRef = React.useRef(false)
  const [status, setStatus] = React.useState<'starting' | 'scanning' | 'error' | 'manual'>('starting')
  const [errorMsg, setErrorMsg] = React.useState('')
  const [manualValue, setManualValue] = React.useState('')

  React.useEffect(() => {
    startCamera()
    return () => stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function startCamera() {
    setStatus('starting')
    setErrorMsg('')
    stoppedRef.current = false

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('browser-not-supported')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) return

      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      await video.play()
      setStatus('scanning')
      tick()
    } catch (e) {
      const err = e as Error
      if (err.name === 'NotAllowedError') {
        setErrorMsg('ไม่ได้อนุญาตกล้อง — กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์ หรือพิมพ์รหัสเครื่องด้านล่าง')
      } else if (err.name === 'NotFoundError') {
        setErrorMsg('ไม่พบกล้องในอุปกรณ์นี้ — พิมพ์รหัสเครื่องด้านล่างแทน')
      } else {
        setErrorMsg('เปิดกล้องไม่ได้ — พิมพ์รหัสเครื่องด้านล่างแทน')
      }
      setStatus('manual')
    }
  }

  function stopCamera() {
    stoppedRef.current = true
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const stream = streamRef.current
    if (stream) {
      for (const track of stream.getTracks()) {
        try { track.stop() } catch { /* ignore */ }
      }
      streamRef.current = null
    }
  }

  async function tick() {
    if (stoppedRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    const w = video.videoWidth
    const h = video.videoHeight
    if (w === 0 || h === 0) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    ctx.drawImage(video, 0, 0, w, h)
    const imageData = ctx.getImageData(0, 0, w, h)

    try {
      // Dynamic import jsQR (CommonJS — lazy load to avoid SSR crash)
      const { default: jsQR } = await import('jsqr')
      const code = jsQR(imageData.data, w, h, {
        inversionAttempts: 'dontInvert',
      })

      if (code && code.data) {
        stopCamera()
        onScan(code.data.trim())
        return
      }
    } catch {
      // jsQR failed to load — fall back to manual mode
      setStatus('manual')
      setErrorMsg('ไม่สามารถสแกน QR ได้ — พิมพ์รหัสเครื่องด้านล่างแทน')
      return
    }

    rafRef.current = requestAnimationFrame(tick)
  }

  function handleManualSubmit() {
    const v = manualValue.trim()
    if (!v) return
    onScan(v)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between bg-black/80 px-4 py-3 pt-[env(safe-area-inset-top)]">
        <span className="text-sm font-medium text-white">สแกน QR Code</span>
        <button
          type="button"
          onClick={() => { stopCamera(); onClose() }}
          aria-label="ปิด"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Camera / Manual */}
      {status === 'starting' || status === 'scanning' ? (
        <div className="relative flex-1">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scan overlay frame */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-48 w-48 rounded-xl border-2 border-orange-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
          </div>

          {/* Hint text */}
          <div className="absolute inset-x-0 bottom-20 px-6 text-center">
            <p className="text-sm text-white/80">
              {status === 'starting' ? 'กำลังเปิดกล้อง...' : 'นำกล้องไปที่ QR Code บนสติกเกอร์อุปกรณ์'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          {errorMsg && (
            <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              {errorMsg}
            </div>
          )}

          {/* Retry camera button */}
          <button
            type="button"
            onClick={startCamera}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-orange-300 bg-orange-50 py-3 text-sm font-medium text-orange-600 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-400"
          >
            <Camera className="h-5 w-5" />
            ลองเปิดกล้องอีกครั้ง
          </button>

          {/* Manual entry */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
              พิมพ์รหัสเครื่อง
            </label>
            <input
              type="text"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
              placeholder="เช่น IT-00001 หรือ SN12345"
              className="h-12 w-full rounded-lg border border-slate-300 px-4 text-base dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              autoFocus
            />
            <button
              type="button"
              onClick={handleManualSubmit}
              disabled={!manualValue.trim()}
              className="h-12 w-full rounded-lg bg-orange-500 text-white font-medium disabled:opacity-50"
            >
              ยืนยัน
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
