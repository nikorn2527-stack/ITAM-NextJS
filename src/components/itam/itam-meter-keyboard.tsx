'use client'

/**
 * itam-meter-keyboard.tsx — Phase 3: Keyboard-driven meter reading page.
 *
 * Layout (single viewport, no scroll):
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ Progress bar  จดแล้ว X / ทั้งหมด Y (เหลือ Z)         [⌨️ keyboard hints]│
 *   ├─────────────────────────────┬──────────────────────────────────────┤
 *   │ Search box (large)          │  Selected device card                │
 *   │   type → Enter to search    │  · assetNo / brand / model / serial  │
 *   │                             │  · last meter (BW/Color)             │
 *   │ Filtered device list        │  · meter mode badge (TOTAL/BW_COLOR)  │
 *   │   ↑↓ to navigate            │                                       │
 *   │   Enter to fill input       │  Inputs:                              │
 *   │                             │   · TOTAL  → ค่ามิเตอร์ (1 input)      │
 *   │                             │   · BW_COLOR → ขาวดำ + สี (2 inputs)  │
 *   │                             │   · RESET warning if new < old       │
 *   │                             │   · Enter to save → next device      │
 *   └─────────────────────────────┴──────────────────────────────────────┘
 *   │ Recently keyed (last 5 with timestamps)                              │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * Global keys (only active when this page is mounted):
 *   ↑ / ArrowUp    → select previous device in the list
 *   ↓ / ArrowDown  → select next device
 *   Enter (search) → execute search (the search input has focus by default)
 *   Enter (meter)  → save reading, focus next unread device, refocus input
 *   Escape         → clear search / unfocus
 *   Tab            → move between search ↔ first meter input
 */

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Search, Keyboard, ArrowUp, ArrowDown, CornerDownLeft, CheckCircle2, AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react'
import { downloadCsv, dateStamp } from '@/lib/csv'

interface UnreadDevice {
  id: string
  assetNo: string
  deviceType: string | null
  brand: string | null
  model: string | null
  serial: string | null
  site: string | null
  building: string | null
  floor: string | null
  department: string | null
  departmentCode: string | null
  location: string | null
  meterMode: string | null
  meterRequired: boolean
  assetSiteCode: string | null
  readThisMonth: boolean
  readAt: string | null
  readBy: string | null
  lastMeterBw: number
  lastMeterColor: number
  lastReadingDate: string | null
}

interface UnreadResponse {
  month: string
  total: number
  read: number
  unread: number
  devices: UnreadDevice[]
}

interface RecentlyKeyed {
  assetNo: string
  name: string
  meterBw: number
  meterColor: number
  delta: number
  at: number
  reset: boolean
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function deviceLabel(d: { brand: string | null; model: string | null; assetNo: string }): string {
  const name = `${d.brand || ''} ${d.model || ''}`.trim()
  return name || d.assetNo
}

export function ItamMeterKeyboard() {
  const qc = useQueryClient()
  const [searchInput, setSearchInput] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [bwInput, setBwInput] = React.useState('')
  const [colorInput, setColorInput] = React.useState('')
  const [remark, setRemark] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [recent, setRecent] = React.useState<RecentlyKeyed[]>([])
  const [focus, setFocus] = React.useState<'search' | 'meter'>('search')

  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const bwInputRef = React.useRef<HTMLInputElement>(null)
  const colorInputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  // Debounce the search input → search state (200ms).
  React.useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim())
      setSelectedIndex(0)
    }, 200)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data, isLoading, refetch, isFetching } = useQuery<UnreadResponse>({
    queryKey: ['itam-meter-keyboard', search],
    queryFn: async () => {
      const q = search ? `&search=${encodeURIComponent(search)}` : ''
      const res = await fetch(`/api/itam/meter-readings/unread?limit=500&includeRead=1${q}`)
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })

  const devices = data?.devices ?? []
  const total = data?.total ?? 0
  const read = data?.read ?? 0
  const unread = data?.unread ?? 0
  const pct = total > 0 ? Math.round((read / total) * 100) : 0

  // The selected device (clamped to the visible list).
  const selected = devices[selectedIndex] ?? null

  // When the selected device changes, reset the inputs (and put focus on the
  // BW input when the user is in "meter" mode).
  React.useEffect(() => {
    if (!selected) {
      setBwInput('')
      setColorInput('')
      setRemark('')
      return
    }
    // Pre-fill the new input with the last meter value (Apps Script behavior —
    // user types over it or appends to it).
    setBwInput(String(selected.lastMeterBw || ''))
    setColorInput(String(selected.lastMeterColor || ''))
    setRemark('')
  }, [selected?.assetNo])

  // When focus target flips to "meter", jump into the BW input.
  React.useEffect(() => {
    if (focus === 'meter' && selected) {
      const t = setTimeout(() => {
        const el = bwInputRef.current
        if (el) {
          el.focus()
          el.select()
        }
      }, 30)
      return () => clearTimeout(t)
    }
    if (focus === 'search') {
      const t = setTimeout(() => searchInputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [focus, selected?.assetNo])

  // Scroll the selected row into view in the list.
  React.useEffect(() => {
    if (!listRef.current) return
    const row = listRef.current.querySelector<HTMLElement>(`[data-row-idx="${selectedIndex}"]`)
    if (row) row.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // ─── Global keyboard handler ─────────────────────────────────────────
  //   • ↑/↓ move selection (regardless of focus, but only when not editing text)
  //   • Enter in search → keep focus in search (already filtered by debounce)
  //   • Enter in BW input → if BW_COLOR, focus color; otherwise save
  //   • Enter in color input → save
  //   • Escape → clear search / blur meter
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      const inTextField = tag === 'input' || tag === 'textarea'

      // ArrowUp / ArrowDown — always handle (so the user can navigate the
      // list even while typing in the search box).
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(devices.length - 1, i + 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(0, i - 1))
        return
      }

      if (e.key === 'Escape') {
        if (inTextField) {
          // First Escape blurs the field; second clears the value.
          ;(e.target as HTMLElement).blur()
        } else if (searchInput) {
          setSearchInput('')
          setSearch('')
        }
        return
      }

      if (e.key === 'Enter') {
        if (focus === 'search') {
          // Enter in the search box → jump to the meter input of the first hit.
          e.preventDefault()
          if (devices.length > 0) {
            setSelectedIndex(0)
            setFocus('meter')
          }
          return
        }
        // focus === 'meter'
        const isColor = (selected?.meterMode || 'TOTAL').toUpperCase() === 'BW_COLOR'
        if (isColor && document.activeElement === bwInputRef.current) {
          // Move to color input.
          e.preventDefault()
          colorInputRef.current?.focus()
          colorInputRef.current?.select()
          return
        }
        // Otherwise Enter saves.
        e.preventDefault()
        void saveReading()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [devices.length, focus, searchInput, selected])

  async function saveReading() {
    if (!selected) return
    const bwNum = Number(bwInput)
    if (!bwInput || !Number.isFinite(bwNum)) {
      toast.error('กรุณากรอกค่ามิเตอร์')
      bwInputRef.current?.focus()
      return
    }
    const colorNum = colorInput ? Number(colorInput) : 0
    const isReset = bwNum < selected.lastMeterBw || colorNum < selected.lastMeterColor
    if (isReset && !remark.trim()) {
      toast.error('ค่าใหม่น้อยกว่าค่าก่อนหน้า (RESET) — กรุณาระบุหมายเหตุ')
      return
    }
    try {
      setSaving(true)
      const res = await fetch('/api/itam/meter-readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetNo: selected.assetNo,
          meterBw: bwNum,
          meterColor: colorNum,
          prevMeterBw: selected.lastMeterBw,
          prevMeterColor: selected.lastMeterColor,
          remark: remark.trim() || (isReset ? 'RESET' : null),
          readingType: isReset ? 'RESET' : 'MONTHLY',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Save failed')
      }
      const j = await res.json()
      const pagesBw: number = j.pagesBw ?? Math.max(0, bwNum - selected.lastMeterBw)
      const pagesColor: number = j.pagesColor ?? Math.max(0, colorNum - selected.lastMeterColor)

      // Push to "recently keyed" stack (top 5).
      setRecent((prev) =>
        [
          {
            assetNo: selected.assetNo,
            name: deviceLabel(selected),
            meterBw: bwNum,
            meterColor: colorNum,
            delta: pagesBw + pagesColor,
            at: Date.now(),
            reset: isReset,
          },
          ...prev,
        ].slice(0, 5),
      )

      toast.success(
        `บันทึกมิเตอร์ ${selected.assetNo} · +${(pagesBw + pagesColor).toLocaleString()} แผ่น`,
        { description: isReset ? '⚠️ RESET' : undefined },
      )

      // Move focus to the next unread device and refocus the BW input.
      await qc.invalidateQueries({ queryKey: ['itam-meter-keyboard'] })
      await qc.invalidateQueries({ queryKey: ['itam-readings'] })
      await qc.invalidateQueries({ queryKey: ['itam-dashboard'] })

      // Optimistically advance — after the query refetches, the new "selected"
      // may be a different assetNo; we use the current selectedIndex which
      // (because the just-read device drops out of the unread list) naturally
      // points to the next device.
      setSelectedIndex((i) => Math.min(i, Math.max(0, devices.length - 2)))
      setFocus('meter')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      // The global handler already does the right thing (jumps to meter input).
      // But because the global listener has the latest `devices` in its closure,
      // we don't need to do anything here. Still, prevent form submit.
      e.preventDefault()
    }
  }

  function exportUnread() {
    if (!devices.length) {
      toast.error('ไม่มีรายการที่จะส่งออก')
      return
    }
    const rows = devices.map((d) => ({
      assetNo: d.assetNo,
      brand: d.brand || '',
      model: d.model || '',
      serial: d.serial || '',
      site: d.site || '',
      building: d.building || '',
      floor: d.floor || '',
      department: d.department || '',
      meterMode: d.meterMode || 'TOTAL',
      lastMeterBw: d.lastMeterBw,
      lastMeterColor: d.lastMeterColor,
      readThisMonth: d.readThisMonth ? 'YES' : 'NO',
    }))
    const headers = Object.keys(rows[0]).map((k) => ({ key: k, label: k }))
    downloadCsv(`unread-meters-${dateStamp()}.csv`, rows, headers)
  }

  const isColorMode = (selected?.meterMode || 'TOTAL').toUpperCase() === 'BW_COLOR'
  const bwNum = bwInput ? Number(bwInput) : NaN
  const colorNum = colorInput ? Number(colorInput) : 0
  const bwDelta = selected && Number.isFinite(bwNum) ? bwNum - selected.lastMeterBw : 0
  const colorDelta = selected && Number.isFinite(colorNum) ? colorNum - selected.lastMeterColor : 0
  const isReset = selected && (bwDelta < 0 || colorDelta < 0)

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-slate-50 p-3 dark:bg-slate-950 md:h-[calc(100vh-0px)] md:p-4">
      {/* Top: progress bar */}
      <Card className="mb-3 border-slate-200 dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2 text-sm">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                จดแล้ว <span className="text-[#f97316]">{read.toLocaleString()}</span>
                <span className="mx-1 text-slate-400">/</span>
                ทั้งหมด {total.toLocaleString()}
              </span>
              <span className="text-xs text-slate-400">
                (เหลือ <span className="font-medium text-slate-600 dark:text-slate-300">{unread.toLocaleString()}</span>)
              </span>
              {isFetching && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
            </div>
            <Progress value={pct} className="h-2 bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="dark:bg-slate-800 dark:border-slate-700"
            >
              <RefreshCw className="h-3.5 w-3.5" /> รีเฟรช
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={exportUnread}
              className="dark:bg-slate-800 dark:border-slate-700"
            >
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Main split */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_1.05fr]">
        {/* Left: search + list */}
        <Card className="flex min-h-0 flex-col border-slate-200 dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                ref={searchInputRef}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => setFocus('search')}
                placeholder="พิมพ์ Serial / Asset No. / รุ่น / แผนก แล้วกด Enter"
                className="h-11 pl-9 text-base font-medium dark:bg-slate-800 dark:border-slate-700"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('')
                    setSearch('')
                    searchInputRef.current?.focus()
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  aria-label="ล้างคำค้นหา"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="text-[11px] text-slate-400">
              ↑↓ เลือกเครื่อง · Enter ไปที่ช่องกรอก · Esc ล้าง · {devices.length} รายการ
            </div>

            <div
              ref={listRef}
              className="itam-scroll min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800"
            >
              {isLoading ? (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : devices.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    จดครบทุกเครื่องแล้ว
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    ไม่มีเครื่องที่ต้องจดมิเตอร์ในเดือนนี้
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {devices.map((d, i) => {
                    const active = i === selectedIndex
                    return (
                      <li
                        key={d.id}
                        data-row-idx={i}
                        onClick={() => {
                          setSelectedIndex(i)
                          setFocus('meter')
                        }}
                        className={`cursor-pointer px-3 py-2 transition-colors ${
                          active
                            ? 'border-l-4 border-[#f97316] bg-orange-50/80 dark:bg-orange-950/30'
                            : 'border-l-4 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-mono text-xs font-semibold ${active ? 'text-[#f97316]' : 'text-slate-700 dark:text-slate-200'}`}>
                                {d.assetNo}
                              </span>
                              {d.readThisMonth && (
                                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px]">
                                  ✓ จดแล้ว
                                </Badge>
                              )}
                              {d.meterMode && d.meterMode.toUpperCase() === 'BW_COLOR' && (
                                <Badge variant="outline" className="text-[10px] text-teal-700 dark:text-teal-300">
                                  BW+สี
                                </Badge>
                              )}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                              {deviceLabel(d)} · {d.site || '—'} · {d.department || '—'}
                            </div>
                          </div>
                          <div className="text-right text-[10px] text-slate-400">
                            <div>ล่าสุด {d.lastMeterBw.toLocaleString()}</div>
                            {d.lastMeterColor > 0 && <div>สี {d.lastMeterColor.toLocaleString()}</div>}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right: selected device + meter input */}
        <Card className="flex min-h-0 flex-col border-slate-200 dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3">
            <AnimatePresence mode="wait">
              {!selected ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-1 flex-col items-center justify-center text-center text-slate-400"
                >
                  <Keyboard className="mb-2 h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <div className="text-sm">เลือกเครื่องจากรายการด้านซ้าย หรือพิมพ์ค้นหาแล้วกด Enter</div>
                </motion.div>
              ) : (
                <motion.div
                  key={selected.assetNo}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  className="flex min-h-0 flex-1 flex-col gap-3"
                >
                  {/* Device header */}
                  <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-[#f97316] px-2 py-0.5 font-mono text-sm font-bold text-white">
                          {selected.assetNo}
                        </span>
                        {selected.assetSiteCode && (
                          <span className="font-mono text-xs text-slate-500">{selected.assetSiteCode}</span>
                        )}
                      </div>
                      <Badge
                        className={
                          isColorMode
                            ? 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300'
                            : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                        }
                      >
                        {isColorMode ? 'BW_COLOR' : 'TOTAL'}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">
                      {deviceLabel(selected)}
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                      <div>สาขา: {selected.site || '—'}</div>
                      <div>แผนก: {selected.department || '—'}</div>
                      <div>อาคาร/ชั้น: {selected.building || '—'} / {selected.floor || '—'}</div>
                      <div>ที่ตั้ง: {selected.location || '—'}</div>
                      <div>Serial: <span className="font-mono">{selected.serial || '—'}</span></div>
                      <div>เดือน: <span className="font-mono">{data?.month || '—'}</span></div>
                    </div>
                  </div>

                  {/* Last reading context */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-slate-200 p-2 dark:border-slate-800">
                      <div className="text-[10px] uppercase text-slate-400">ค่ามิเตอร์ล่าสุด</div>
                      <div className="font-mono text-base font-semibold text-slate-700 dark:text-slate-200">
                        {selected.lastMeterBw.toLocaleString()}
                        {isColorMode && (
                          <span className="ml-1 text-xs text-teal-600 dark:text-teal-300">/ {selected.lastMeterColor.toLocaleString()}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {selected.lastReadingDate ? new Date(selected.lastReadingDate).toLocaleDateString('th-TH') : 'ยังไม่เคยจด'}
                      </div>
                    </div>
                    <div className="rounded-md border border-slate-200 p-2 dark:border-slate-800">
                      <div className="text-[10px] uppercase text-slate-400">ส่วนต่าง (เดี๋ยวนี้)</div>
                      <div className={`font-mono text-base font-semibold ${
                        bwDelta + colorDelta < 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : bwDelta + colorDelta > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-300'
                      }`}>
                        {(bwDelta + colorDelta) > 0 ? '+' : ''}{(bwDelta + colorDelta).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400">แผ่นที่จะใช้</div>
                    </div>
                  </div>

                  {/* Meter input form */}
                  <div className="flex min-h-0 flex-1 flex-col gap-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">
                          ค่ามิเตอร์{isColorMode ? ' ขาวดำ' : ''} <span className="text-rose-500">*</span>
                        </Label>
                        <Input
                          ref={bwInputRef}
                          type="number"
                          inputMode="numeric"
                          value={bwInput}
                          onChange={(e) => setBwInput(e.target.value)}
                          onFocus={(e) => { setFocus('meter'); e.target.select() }}
                          placeholder="เช่น 5000"
                          className={`h-12 text-lg font-mono tabular-nums dark:bg-slate-800 dark:border-slate-700 ${
                            bwDelta < 0 ? 'border-amber-400 focus-visible:ring-amber-200 dark:border-amber-600' : ''
                          }`}
                        />
                      </div>
                      {isColorMode && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">ค่ามิเตอร์ สี</Label>
                          <Input
                            ref={colorInputRef}
                            type="number"
                            inputMode="numeric"
                            value={colorInput}
                            onChange={(e) => setColorInput(e.target.value)}
                            onFocus={(e) => { setFocus('meter'); e.target.select() }}
                            placeholder="เช่น 1200"
                            className={`h-12 text-lg font-mono tabular-nums dark:bg-slate-800 dark:border-slate-700 ${
                              colorDelta < 0 ? 'border-amber-400 focus-visible:ring-amber-200 dark:border-amber-600' : ''
                            }`}
                          />
                        </div>
                      )}
                    </div>

                    {isReset && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>ค่าใหม่น้อยกว่าค่าก่อนหน้า (RESET) — กรุณาระบุหมายเหตุ</span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-xs">หมายเหตุ {isReset && <span className="text-rose-500">*</span>}</Label>
                      <Textarea
                        value={remark}
                        onChange={(e) => setRemark(e.target.value)}
                        rows={2}
                        placeholder={isReset ? 'เหตุผลที่ค่าลดลง (RESET)' : 'หมายเหตุ (ถ้ามี)'}
                        className="text-xs dark:bg-slate-800 dark:border-slate-700"
                      />
                    </div>

                    <div className="mt-auto flex items-center gap-2">
                      <Button
                        onClick={saveReading}
                        disabled={saving || !Number.isFinite(bwNum) || (isReset && !remark.trim())}
                        className="flex-1 bg-[#f97316] text-white hover:bg-[#ea580c]"
                      >
                        {saving ? (
                          <>
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> กำลังบันทึก...
                          </>
                        ) : (
                          <>
                            <CornerDownLeft className="mr-1.5 h-4 w-4" /> บันทึก + ถัดไป
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setFocus('search')}
                        className="dark:bg-slate-800 dark:border-slate-700"
                      >
                        <Search className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1"><ArrowUp className="h-3 w-3" />/<ArrowDown className="h-3 w-3" /> เลือกเครื่อง</span>
                        <span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> บันทึก</span>
                      </div>
                      <span>Enter ในช่องค้นหา → กระโดดไปที่ช่องกรอก</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>

      {/* Bottom: recently keyed */}
      <Card className="mt-3 border-slate-200 dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              คีย์ล่าสุด ({recent.length}/5)
            </div>
            {recent.length > 0 && (
              <button
                onClick={() => setRecent([])}
                className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                ล้าง
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <div className="py-2 text-center text-xs text-slate-400">ยังไม่มีรายการที่คีย์</div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {recent.map((r, i) => (
                <div
                  key={`${r.assetNo}-${r.at}-${i}`}
                  className="min-w-[180px] flex-shrink-0 rounded-md border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{r.assetNo}</span>
                    <span className="text-[10px] text-slate-400">{fmtTime(r.at)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400">{r.name}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                      {r.meterBw.toLocaleString()}
                      {r.meterColor > 0 && <span className="ml-1 text-teal-600 dark:text-teal-300">/ {r.meterColor.toLocaleString()}</span>}
                    </span>
                    <Badge
                      className={
                        r.reset
                          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px]'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px]'
                      }
                    >
                      {r.reset ? 'RESET' : `+${r.delta.toLocaleString()}`}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
