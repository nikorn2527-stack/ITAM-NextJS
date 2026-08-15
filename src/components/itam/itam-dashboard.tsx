'use client'

/**
 * ItamDashboard — the UNIFIED single dashboard for the ITAM app.
 *
 * Merges the best of both legacy dashboards:
 *  • Optimized /api/itam/dashboard API (faster, has bySite, paperTrend, heatmap, insights)
 *  • Count-up animation + glow KPI cards (from ITAM Dashboard)
 *  • Smart Insights (auto-generated alerts)
 *  • byType donut, bySite comparison, paperTrend area chart, heatmap modal
 *  • Quick Actions bar (from DashboardPage — Task 37)
 *  • Range selector + auto-refresh indicator (from DashboardPage)
 *  • Widget customization (drag-to-reorder) via DashboardWidgetLayout
 *  • Lifecycle section + warranty alerts (separate APIs)
 *  • Cycle Progress widget (real cycle data, no longer a placeholder)
 *  • PDF export
 *
 * The "seed" button was removed — we now have real data.
 */

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, LabelList,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  Package, CheckCircle2, Wrench, FileText, TrendingUp, Building2,
  FileDown, Flame, BarChart3, Trophy, RefreshCw, Loader2,
  AlertTriangle, Palette, ArrowUpRight, ArrowDownRight, CircleAlert,
  CalendarClock, ArrowRight, History, Settings2, Inbox,
} from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import type { Cycle, DashboardRangeKey } from './types'
import { DASHBOARD_RANGE_OPTIONS } from './types'
import { QuickActionsBar } from './quick-actions-bar'
import { LifecycleDashboard } from './lifecycle-dashboard'
import { DepreciationSection } from './depreciation-section'
import { ReportsSection } from './reports-section'
import {
  DashboardWidgetLayout,
  type WidgetId,
} from './dashboard-widget-layout'

interface SiteRow { siteCode: string; siteName: string | null; deviceCount: number; activeCount: number; paperSheets: number }
interface DashboardData {
  totals: { total: number; active: number; inactive: number; spare: number; repair: number }
  byType: Array<{ name: string; value: number }>
  bySite: SiteRow[]
  paperThisMonth: number
  paperTrend: Array<{ month: string; sheets: number }>
  meterRequiredCount: number
  recentActivity: Array<{
    id: string; assetCode: string; deviceName: string
    readingDate: string; pagesBw: number; pagesColor: number; remark: string | null
  }>
  heatmap: Array<{ assetCode: string; deviceName: string; months: Array<{ month: string; pages: number }> }>
  heatmapMonths: string[]
  queryTimeMs: number
}

interface WarrantySummary {
  active: number
  expiring: number
  expired: number
  unknown: number
}

interface RemindersSummary {
  hasActiveCycle: boolean
  totalRead: number
  totalUnread: number
}

// ============== Count-up hook ==============
function useCountUp(value: number, durationMs = 600): number {
  const [display, setDisplay] = React.useState(value)
  const fromRef = React.useRef(value)
  const rafRef = React.useRef<number | null>(null)
  React.useEffect(() => {
    const from = fromRef.current
    const to = value
    if (from === to) return
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (to - from) * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [value, durationMs])
  return display
}

// ============== KPI Card with count-up + glow ==============
function KpiCard({
  title, value, icon, accent, loading, glow, trend, unit,
}: {
  title: string; value: number; icon: React.ReactNode
  accent: string; loading?: boolean; glow?: boolean
  trend?: string; unit?: string
}) {
  const animated = useCountUp(value)
  return (
    <Card
      className={[
        'relative overflow-hidden shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
        'dark:border-slate-800 dark:bg-slate-900',
        glow ? 'itam-glow' : '',
      ].join(' ')}
    >
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11"
            style={{ background: `${accent}1a`, color: accent }}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{title}</div>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-20" />
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100 sm:text-2xl">
                  {animated.toLocaleString()}
                </span>
                {unit && (
                  <span className="shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">{unit}</span>
                )}
              </div>
            )}
            {trend && !loading && (
              <div className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500" title={trend}>
                {trend}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

function heatColor(intensity: number): string {
  const i = Math.max(0, Math.min(1, intensity))
  const alpha = 0.08 + i * 0.85
  return `rgba(13, 148, 136, ${alpha.toFixed(2)})`
}

// Status palette for donut — orange, teal, amber, rose, slate
const STATUS_COLORS = ['#f97316', '#0d9488', '#f59e0b', '#ef4444', '#94a3b8']

// ============== EmptyState helper ==============
function EmptyState({
  message, subtitle, icon,
}: {
  message: string; subtitle?: string; icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400 dark:text-slate-500">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        {icon ?? <Inbox className="h-6 w-6 text-slate-300 dark:text-slate-600" />}
      </div>
      <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">{message}</div>
      {subtitle && <div className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</div>}
    </div>
  )
}

// ============== Cycle Progress Widget (ported from dashboard-page.tsx) ==============
function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24),
  )
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

interface CycleProgressWidgetProps {
  activeCycle: Cycle | null
  cycleLoading: boolean
  remindersSummary: RemindersSummary | null
  onManageCycle: () => void
  onCreateCycle: () => void
}

function CycleProgressWidget({
  activeCycle, cycleLoading, remindersSummary, onManageCycle, onCreateCycle,
}: CycleProgressWidgetProps) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 60)
    return () => window.clearTimeout(t)
  }, [])

  if (cycleLoading) {
    return (
      <Card className="overflow-hidden border-[#f97316]/20 bg-gradient-to-br from-orange-50 to-white dark:border-[#f97316]/30 dark:from-slate-900 dark:to-slate-800/50">
        <CardContent className="p-4">
          <Skeleton className="h-24 w-full dark:bg-slate-800" />
        </CardContent>
      </Card>
    )
  }

  if (!activeCycle) {
    return (
      <Card className="relative overflow-hidden border-amber-200 bg-gradient-to-br from-amber-50 to-white dark:border-amber-800/60 dark:from-amber-950/30 dark:to-slate-900">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-400 to-[#f97316]" />
        <CardContent className="relative flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 transition-transform group-hover:scale-105 dark:bg-amber-900/40 dark:text-amber-300">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                ⚠️ ยังไม่มีรอบจดมิเตอร์ที่กำลังดำเนินการ
              </div>
              <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-300/80">
                สร้างรอบใหม่เพื่อเริ่มจดมิเตอร์ได้ทันที
              </div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={onCreateCycle}
            className="shrink-0 bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
          >
            <CalendarClock className="h-4 w-4" />
            สร้างรอบใหม่
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>
    )
  }

  const totalDays = Math.max(1, daysBetween(activeCycle.startDate, activeCycle.endDate))
  const elapsed = Math.max(0, daysBetween(activeCycle.startDate, todayISO()))
  const daysRemaining = Math.max(0, daysBetween(todayISO(), activeCycle.endDate))
  const elapsedPct = Math.min(100, Math.round((elapsed / totalDays) * 100))

  const totalRead = remindersSummary?.totalRead ?? 0
  const totalMeterable =
    (remindersSummary?.totalRead ?? 0) + (remindersSummary?.totalUnread ?? 0)
  const readPct =
    totalMeterable > 0 ? Math.round((totalRead / totalMeterable) * 100) : 0

  const animElapsedPct = mounted ? elapsedPct : 0
  const animReadPct = mounted ? readPct : 0

  return (
    <Card className="group relative overflow-hidden border-[#f97316]/20 bg-gradient-to-br from-orange-50 to-white shadow-sm transition-shadow hover:shadow-md dark:border-[#f97316]/30 dark:from-slate-900 dark:to-slate-800/50">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#fb923c] to-[#f97316]" />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-2 -top-2 select-none text-[100px] leading-none text-[#f97316]/5 dark:text-[#fb923c]/10"
      >
        <CalendarClock className="h-24 w-24" />
      </span>

      <CardContent className="relative p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#f97316] dark:text-[#fb923c]">
              <CalendarClock className="h-3.5 w-3.5" />
              รอบจดมิเตอร์ปัจจุบัน
            </div>
            <div className="truncate text-base font-bold text-slate-800 dark:text-slate-100 sm:text-lg">
              {activeCycle.name}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">
                📅 {activeCycle.startDate} → {activeCycle.endDate}
              </span>
              <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800 transition-colors hover:scale-105 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                กำลังดำเนินการ
              </Badge>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <div className="flex flex-col items-center justify-center rounded-lg bg-white/70 px-4 py-2 text-center shadow-sm dark:bg-slate-800/60">
              <div className="text-3xl font-bold tabular-nums leading-tight text-[#f97316] dark:text-[#fb923c]">
                {daysRemaining}
              </div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                วันที่เหลือ
              </div>
            </div>

            <div className="flex min-w-[180px] flex-1 flex-col gap-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>ความคืบหน้ารอบ</span>
                  <span className="font-mono tabular-nums">{elapsedPct}%</span>
                </div>
                <Progress
                  value={animElapsedPct}
                  className="h-1.5 [&>div]:bg-gradient-to-r [&>div]:from-[#fb923c] [&>div]:to-[#f97316]"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>การจดมิเตอร์</span>
                  <span className="font-mono tabular-nums">
                    {totalRead}/{totalMeterable} ({readPct}%)
                  </span>
                </div>
                <Progress
                  value={animReadPct}
                  className="h-1.5 [&>div]:bg-[#0d9488]"
                />
              </div>
              <Button
                size="sm"
                onClick={onManageCycle}
                className="mt-1 self-end bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                จัดการรอบ
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ItamDashboard() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const setActivePage = useAppStore((s) => s.setActivePage)
  const setPendingDeviceType = useAppStore((s) => s.setPendingDeviceType)
  const setPendingDeviceStatus = useAppStore((s) => s.setPendingDeviceStatus)
  const setPendingWarrantyFilter = useAppStore((s) => s.setPendingWarrantyFilter)
  const setPendingMeterAction = useAppStore((s) => s.setPendingMeterAction)

  const [sitesOpen, setSitesOpen] = React.useState(false)
  const [heatOpen, setHeatOpen] = React.useState(false)
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null)
  const [glowKey, setGlowKey] = React.useState<string | null>(null)
  const [range, setRange] = React.useState<DashboardRangeKey>('month')

  // Track previous totals to know which KPI changed
  const prevTotalsRef = React.useRef<{ total: number; active: number; spare: number; repair: number; meter: number } | null>(null)

  // Primary dashboard data (optimized /api/itam/dashboard API).
  // NOTE: The ITAM dashboard API doesn't support range — we send it for
  // forward-compat and display purposes; the API ignores unknown params.
  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = useQuery<DashboardData>({
    queryKey: ['itam-dashboard', range],
    queryFn: async () => {
      const res = await fetch(`/api/itam/dashboard?range=${range}`)
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    // Polling: 60s instead of 30s to reduce DB/network load.
    // The dashboard is also invalidated by SSE events on device/wo/stock
    // changes, so users still see updates quickly.
    refetchInterval: 60_000,
    // Only refetch on window focus if data is older than 2 minutes
    refetchOnWindowFocus: 'always',
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })

  // Update "last updated" + glow flash when data changes
  const firstLoadRef = React.useRef(true)
  React.useEffect(() => {
    if (!data) return
    setLastUpdated(new Date(dataUpdatedAt))
    if (firstLoadRef.current) {
      firstLoadRef.current = false
      prevTotalsRef.current = {
        total: data.totals.total,
        active: data.totals.active,
        spare: data.totals.spare,
        repair: data.totals.repair,
        meter: data.meterRequiredCount,
      }
      return
    }
    const prev = prevTotalsRef.current
    if (prev) {
      const changes: { key: string; val: number }[] = [
        { key: 'total', val: data.totals.total },
        { key: 'active', val: data.totals.active },
        { key: 'spare', val: data.totals.spare },
        { key: 'repair', val: data.totals.repair },
        { key: 'meter', val: data.meterRequiredCount },
      ]
      const changed = changes.find(c => c.val !== prev[c.key as keyof typeof prev])
      if (changed) {
        setGlowKey(changed.key)
        const tid = setTimeout(() => setGlowKey(null), 1000)
        prevTotalsRef.current = {
          total: data.totals.total,
          active: data.totals.active,
          spare: data.totals.spare,
          repair: data.totals.repair,
          meter: data.meterRequiredCount,
        }
        return () => clearTimeout(tid)
      }
    }
  }, [data, dataUpdatedAt])

  // Heatmap (only fetched when its modal opens — heavy query)
  const { data: heatData, isLoading: heatLoading } = useQuery<DashboardData>({
    queryKey: ['itam-dashboard-extra', range],
    queryFn: async () => {
      const res = await fetch(`/api/itam/dashboard?extra=1&range=${range}`)
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    enabled: heatOpen,
  })

  // Smart insights
  interface InsightItem {
    type: string
    message: string
    [k: string]: unknown
  }
  const { data: insightsData, isLoading: insightsLoading } = useQuery<{ insights: InsightItem[] }>({
    queryKey: ['itam-dashboard-insights'],
    queryFn: async () => {
      const res = await fetch('/api/itam/dashboard/insights')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    // Insights: 3 min instead of 1 min — they don't change quickly
    refetchInterval: 180_000,
    staleTime: 120_000,
  })
  const insights = insightsData?.insights ?? []

  // Active cycle (for the Cycle Progress widget)
  const { data: activeCycle, isLoading: cycleLoading } = useQuery<Cycle | null>({
    queryKey: ['active-cycle'],
    queryFn: async () => {
      const res = await fetch('/api/cycles?status=active')
      if (!res.ok) return null
      const json = await res.json()
      return (json.cycles?.[0] as Cycle | undefined) ?? null
    },
    staleTime: 120_000,
    // Cycle info: 5 min instead of 2 min — cycles change daily, not minute-by-minute
    refetchInterval: 300_000,
  })

  // Reading progress for the active cycle
  const { data: remindersSummary } = useQuery<RemindersSummary>({
    queryKey: ['meter-reminders-summary'],
    queryFn: async () => {
      const res = await fetch('/api/meter/reminders')
      if (!res.ok) return { hasActiveCycle: false, totalRead: 0, totalUnread: 0 }
      const json = await res.json()
      return {
        hasActiveCycle: Boolean(json.hasActiveCycle),
        totalRead: Number(json.totalRead ?? 0),
        totalUnread: Number(json.totalUnread ?? 0),
      }
    },
    staleTime: 60_000,
    // Reminders: 2 min instead of 1 min
    refetchInterval: 120_000,
  })

  // Warranty summary
  const { data: warrantyData } = useQuery<{ summary: WarrantySummary }>({
    queryKey: ['warranty-summary'],
    queryFn: async () => {
      const res = await fetch('/api/devices/warranty')
      if (!res.ok) throw new Error('Failed to load warranty')
      const json = await res.json()
      return { summary: json.summary as WarrantySummary }
    },
    staleTime: 60_000,
  })

  function exportPdf() {
    const win = window.open('', '_blank', 'width=900,height=1200')
    if (!win) {
      toast.warning('เบราว์เซอร์บล็อกป๊อปอัป — กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง')
      return
    }
    const totals = data?.totals
    const total = totals?.total ?? 0
    const active = totals?.active ?? 0
    const spare = totals?.spare ?? 0
    const repair = totals?.repair ?? 0
    const paper = data?.paperThisMonth ?? 0
    const meterReq = data?.meterRequiredCount ?? 0
    const byType = data?.byType ?? []
    const bySite = data?.bySite ?? []
    const warrantyExpiring = warrantyData?.summary.expiring ?? 0
    const warrantyExpired = warrantyData?.summary.expired ?? 0
    const generatedAt = new Date().toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })

    const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))

    const kpiHtml = `
      <div class="kpi-grid">
        <div class="kpi"><div class="label">อุปกรณ์ทั้งหมด</div><div class="value">${total.toLocaleString()}<span class="unit">เครื่อง</span></div></div>
        <div class="kpi t-active"><div class="label">ใช้งานอยู่</div><div class="value">${active.toLocaleString()}<span class="unit">เครื่อง</span></div></div>
        <div class="kpi t-spare"><div class="label">สำรอง</div><div class="value">${spare.toLocaleString()}<span class="unit">เครื่อง</span></div></div>
        <div class="kpi t-repair"><div class="label">ส่งซ่อม</div><div class="value">${repair.toLocaleString()}<span class="unit">เครื่อง</span></div></div>
        <div class="kpi t-paper"><div class="label">กระดาษเดือนนี้</div><div class="value">${paper.toLocaleString()}<span class="unit">แผ่น</span></div></div>
      </div>
      <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);margin-top:8px">
        <div class="kpi"><div class="label">ต้องจดมิเตอร์</div><div class="value">${meterReq.toLocaleString()}<span class="unit">เครื่อง</span></div></div>
        <div class="kpi"><div class="label">รับประกันใกล้หมด/หมดแล้ว</div><div class="value">${(warrantyExpiring + warrantyExpired).toLocaleString()}<span class="unit">เครื่อง</span></div></div>
      </div>`

    const typeRows = byType.map(t => `<tr><td>${esc(t.name)}</td><td class="num">${t.value.toLocaleString()}</td><td class="num">${total > 0 ? Math.round((t.value / total) * 100) : 0}%</td></tr>`).join('')
    const siteRows = bySite.map(s => `<tr><td>${esc(s.siteCode)}</td><td>${esc(s.siteName || '')}</td><td class="num">${(s.deviceCount ?? 0).toLocaleString()}</td><td class="num">${(s.activeCount ?? 0).toLocaleString()}</td><td class="num">${(s.paperSheets ?? 0).toLocaleString()}</td></tr>`).join('')

    const html = `<!doctype html><html lang="th"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ITAM Dashboard Report</title>
<style>
@page { size: A4; margin: 15mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; font-family: 'Sukhumvit Set', 'Thonburi', 'Tahoma', sans-serif; color: #1e293b; font-size: 12px; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.header { border-bottom: 3px solid #f97316; padding-bottom: 10px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start; }
.header .org { font-size: 18px; font-weight: 700; color: #0f172a; }
.header .subtitle { font-size: 13px; color: #475569; margin-top: 2px; }
.header .meta { text-align: right; font-size: 11px; color: #64748b; }
h2.section { font-size: 13px; font-weight: 700; color: #0f172a; margin: 22px 0 8px; padding: 6px 10px; background: linear-gradient(90deg, #fff7ed 0%, #ffffff 100%); border-left: 4px solid #f97316; border-radius: 3px; }
table { width: 100%; border-collapse: collapse; margin-top: 4px; }
th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; font-size: 11px; vertical-align: top; }
th { background: #f8fafc; color: #475569; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tr:nth-child(even) td { background: #fafbfc; }
.kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 6px 0 4px; }
.kpi { border: 1px solid #e2e8f0; border-top: 3px solid #f97316; border-radius: 4px; padding: 10px; background: #ffffff; }
.kpi .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
.kpi .value { font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.1; margin-top: 4px; font-variant-numeric: tabular-nums; }
.kpi .unit { font-size: 11px; color: #94a3b8; margin-left: 3px; font-weight: 500; }
.kpi.t-active { border-top-color: #10b981; } .kpi.t-active .value { color: #10b981; }
.kpi.t-spare { border-top-color: #f59e0b; } .kpi.t-spare .value { color: #d97706; }
.kpi.t-repair { border-top-color: #f97316; } .kpi.t-repair .value { color: #ea580c; }
.kpi.t-paper { border-top-color: #0d9488; } .kpi.t-paper .value { color: #0d9488; }
.footer { margin-top: 28px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
.footer .brand { color: #f97316; font-weight: 700; letter-spacing: 0.04em; }
.print-btn { position: fixed; top: 12px; right: 12px; background: #f97316; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }
.print-btn:hover { background: #ea580c; }
@media print { .no-print { display: none; } .header { page-break-after: avoid; } h2.section { page-break-after: avoid; } table { page-break-inside: avoid; } }
</style></head><body>
<button class="print-btn no-print" onclick="window.print()">🖨 พิมพ์ / บันทึก PDF</button>
<div class="header">
  <div><div class="org">PNG TEAM</div><div class="subtitle">ITAM Dashboard Report <span style="color:#f97316;font-weight:600">⚡ ${data?.queryTimeMs ?? 0}ms</span></div></div>
  <div class="meta"><div>วันที่ออกรายงาน: ${esc(generatedAt)}</div><div>ออกโดย: admin@example.com</div></div>
</div>
<h2 class="section">📊 สรุปตัวชี้วัดหลัก (KPI)</h2>
${kpiHtml}
<h2 class="section">💻 จำนวนอุปกรณ์ตามประเภท</h2>
<table><thead><tr><th>ประเภท</th><th class="num">จำนวน</th><th class="num">สัดส่วน</th></tr></thead><tbody>${typeRows || '<tr><td colspan="3" class="num">—</td></tr>'}</tbody></table>
<h2 class="section">🏢 อุปกรณ์ตามสาขา</h2>
<table><thead><tr><th>รหัสสาขา</th><th>ชื่อสาขา</th><th class="num">ทั้งหมด</th><th class="num">ใช้งาน</th><th class="num">กระดาษ (แผ่น)</th></tr></thead><tbody>${siteRows || '<tr><td colspan="5" class="num">—</td></tr>'}</tbody></table>
<div class="footer"><div><span class="brand">PNG TEAM</span> — IT Asset Management</div><div>หน้า 1 · ${esc(generatedAt)}</div></div>
<script>window.addEventListener('load', function () { setTimeout(function () { try { window.print(); } catch (e) {} }, 250); });</script>
</body></html>`
    win.document.open()
    win.document.write(html)
    win.document.close()
    toast.success('กำลังเปิดหน้าพิมพ์รายงาน PDF...')
  }

  // Site comparison sorted by devices
  const sortedSites = React.useMemo(() => {
    return [...(data?.bySite ?? [])].sort((a, b) => b.deviceCount - a.deviceCount)
  }, [data?.bySite])
  const maxDevices = sortedSites[0]?.deviceCount ?? 1

  // Heatmap
  const heat = heatData?.heatmap ?? []
  const heatMonths = heatData?.heatmapMonths ?? []
  const maxPages = React.useMemo(() => {
    let m = 0
    for (const r of heat) for (const c of r.months) if (c.pages > m) m = c.pages
    return m || 1
  }, [heat])

  // Donut chart data: status distribution
  const donutData = React.useMemo(() => {
    if (!data) return []
    const t = data.totals
    return [
      { name: 'ใช้งานอยู่', value: t.active, color: STATUS_COLORS[0], statusKey: 'Active' },
      { name: 'สำรอง', value: t.spare, color: STATUS_COLORS[1], statusKey: 'In Stock' },
      { name: 'ส่งซ่อม', value: t.repair, color: STATUS_COLORS[2], statusKey: 'Pending Repair' },
      { name: 'ไม่ใช้งาน', value: t.inactive, color: STATUS_COLORS[3], statusKey: 'Inactive' },
    ].filter(d => d.value > 0)
  }, [data])

  const donutTotal = donutData.reduce((sum, d) => sum + d.value, 0)

  // Bar chart: by type (top 8)
  const barData = React.useMemo(() => (data?.byType ?? []).slice(0, 8), [data])

  // Area chart: paper trend
  const areaData = React.useMemo(() => data?.paperTrend ?? [], [data])

  // Drill-down handlers
  function drillDownStatus(statusKey: string) {
    setPendingDeviceStatus(statusKey)
    setPendingDeviceType(null)
    setActivePage('itam-devices')
    toast.info(`กรองอุปกรณ์สถานะ "${statusKey}"`)
  }
  function drillDownType(typeName: string) {
    setPendingDeviceType(typeName)
    setPendingDeviceStatus(null)
    setActivePage('itam-devices')
    toast.info(`กรองอุปกรณ์ประเภท "${typeName}"`)
  }

  // Recharts tooltip styles
  const tooltipStyle: React.CSSProperties = {
    background: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.98)',
    border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
    borderRadius: '8px',
    fontSize: '12px',
    color: isDark ? '#f1f5f9' : '#1e293b',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    padding: '8px 12px',
  }

  const gridColor = isDark ? '#1e293b' : '#e2e8f0'
  const axisColor = isDark ? '#64748b' : '#64748b'

  function formatLastUpdated(): string {
    if (!lastUpdated) return '—'
    return lastUpdated.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  // Derived values for KPI widget
  const total = data?.totals.total ?? 0
  const active = data?.totals.active ?? 0
  const spare = data?.totals.spare ?? 0
  const repair = data?.totals.repair ?? 0
  const paperThisMonth = data?.paperThisMonth ?? 0
  const warrantyAlerts =
    (warrantyData?.summary.expiring ?? 0) +
    (warrantyData?.summary.expired ?? 0)
  const rangeInfoLabel =
    DASHBOARD_RANGE_OPTIONS.find((o) => o.value === range)?.label ?? 'เดือนนี้'
  const paperKpiLabel =
    DASHBOARD_RANGE_OPTIONS.find((o) => o.value === range)?.kpiLabel ?? 'กระดาษเดือนนี้'

  // ============== Widget content blocks ==============
  const kpiWidget = (
    <>
      {/* KPI row — 5 cards on lg */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <KpiCard
          title="อุปกรณ์ทั้งหมด"
          value={total}
          icon={<Package className="h-5 w-5" />}
          accent="#0f172a"
          loading={isLoading}
          glow={glowKey === 'total'}
          trend={total > 0 ? `${(data?.byType ?? []).length} ประเภท` : undefined}
        />
        <KpiCard
          title="ใช้งานอยู่"
          value={active}
          icon={<CheckCircle2 className="h-5 w-5" />}
          accent="#10b981"
          loading={isLoading}
          glow={glowKey === 'active'}
          trend={total > 0 ? `${Math.round((active / total) * 100)}% ของทั้งหมด` : undefined}
        />
        <KpiCard
          title="สำรอง"
          value={spare}
          icon={<Package className="h-5 w-5" />}
          accent="#f59e0b"
          loading={isLoading}
          glow={glowKey === 'spare'}
          trend={total > 0 ? `${Math.round((spare / total) * 100)}% ของทั้งหมด` : undefined}
        />
        <KpiCard
          title="ส่งซ่อม"
          value={repair}
          icon={<Wrench className="h-5 w-5" />}
          accent="#f97316"
          loading={isLoading}
          glow={glowKey === 'repair'}
          trend={repair > 0 ? 'รอดำเนินการ' : 'ปกติ'}
        />
        <KpiCard
          title="ต้องจดมิเตอร์"
          value={data?.meterRequiredCount ?? 0}
          icon={<FileText className="h-5 w-5" />}
          accent="#0d9488"
          loading={isLoading}
          glow={glowKey === 'meter'}
          unit="เครื่อง"
        />
      </div>

      {/* Warranty alert bar — amber card linking to devices */}
      <button
        type="button"
        onClick={() => {
          setActivePage('devices')
          setPendingWarrantyFilter('expiring')
        }}
        disabled={warrantyAlerts === 0}
        className={cn(
          'group relative w-full overflow-hidden rounded-lg border text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950',
          warrantyAlerts > 0
            ? 'cursor-pointer border-amber-200 bg-amber-50 hover:-translate-y-0.5 hover:shadow-md dark:border-amber-800/60 dark:bg-amber-950/30'
            : 'cursor-default border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
        )}
      >
        {warrantyAlerts > 0 && (
          <div
            className="absolute inset-x-0 top-0 h-[3px]"
            style={{ background: 'linear-gradient(90deg, #f59e0b, #f97316)' }}
          />
        )}
        <div className="flex items-center gap-3 p-3 sm:p-4">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105 sm:h-11 sm:w-11',
              warrantyAlerts > 0 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
            )}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
              รับประกันใกล้หมด
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold tabular-nums leading-tight text-slate-800 dark:text-slate-100 sm:text-2xl">
                {warrantyAlerts}
              </span>
              <span className="shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">
                เครื่อง
              </span>
            </div>
            <div className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
              {warrantyAlerts > 0
                ? `ใกล้หมด ${warrantyData?.summary.expiring ?? 0} · หมดแล้ว ${warrantyData?.summary.expired ?? 0} — กดเพื่อดูรายการ`
                : 'ทุกเครื่องยังอยู่ในรับประกัน'}
            </div>
          </div>
          {warrantyAlerts > 0 && (
            <span className="shrink-0 rounded-md border border-amber-200 bg-white px-2 py-1 text-xs font-medium text-amber-600 opacity-0 transition-opacity group-hover:opacity-100 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-400">
              ดูรายการ →
            </span>
          )}
        </div>
      </button>

      {/* Paper-this-month mini card under the warranty bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="flex items-center justify-between p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-teal-600 dark:text-teal-400">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{paperKpiLabel}</div>
                {isLoading ? (
                  <Skeleton className="mt-1 h-7 w-24" />
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100 sm:text-2xl">
                      {paperThisMonth.toLocaleString()}
                    </span>
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">แผ่น</span>
                  </div>
                )}
                <div className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                  ช่วง: {rangeInfoLabel}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="flex items-center justify-between p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">จำนวนสาขา</div>
                {isLoading ? (
                  <Skeleton className="mt-1 h-7 w-16" />
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100 sm:text-2xl">
                      {(data?.bySite ?? []).length}
                    </span>
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">สาขา</span>
                  </div>
                )}
                <div className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                  ⚡ {data?.queryTimeMs ?? 0}ms
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )

  const cycleWidget = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <CycleProgressWidget
        activeCycle={activeCycle ?? null}
        cycleLoading={cycleLoading}
        remindersSummary={remindersSummary ?? null}
        onManageCycle={() => {
          setPendingMeterAction('open-cycle')
          setActivePage('meter')
        }}
        onCreateCycle={() => {
          setPendingMeterAction('open-cycle')
          setActivePage('meter')
        }}
      />
    </motion.div>
  )

  const insightsWidget = (
    <Card className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CircleAlert className="h-4 w-4 text-[#f97316]" /> Smart Insights
          {insightsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </CardTitle>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          ระบบตรวจพบสิ่งผิดปกติอัตโนมัติ — ใช้กระดาษสูง / สีเยอะ / ยังไม่จดมิเตอร์ / เปลี่ยนแปลงรายเดือน
        </p>
      </CardHeader>
      <CardContent>
        {insightsLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
        ) : insights.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-slate-400">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            <div>ไม่พบสิ่งผิดปกติในเดือนนี้</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {insights.slice(0, 6).map((ins, idx) => {
              const palette = (() => {
                switch (ins.type) {
                  case 'high_usage':
                    return { bg: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-200 dark:border-rose-800', text: 'text-rose-700 dark:text-rose-300', icon: <AlertTriangle className="h-4 w-4" /> }
                  case 'color_heavy':
                    return { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', icon: <Palette className="h-4 w-4" /> }
                  case 'not_read':
                    return { bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-300', icon: <FileText className="h-4 w-4" /> }
                  case 'mom_change':
                    return ins.percent && Number(ins.percent) > 0
                      ? { bg: 'bg-rose-50 dark:bg-rose-950/30', border: 'border-rose-200 dark:border-rose-800', text: 'text-rose-700 dark:text-rose-300', icon: <ArrowUpRight className="h-4 w-4" /> }
                      : { bg: 'bg-teal-50 dark:bg-teal-950/30', border: 'border-teal-200 dark:border-teal-800', text: 'text-teal-700 dark:text-teal-300', icon: <ArrowDownRight className="h-4 w-4" /> }
                  default:
                    return { bg: 'bg-slate-50 dark:bg-slate-800/40', border: 'border-slate-200 dark:border-slate-700', text: 'text-slate-700 dark:text-slate-300', icon: <CircleAlert className="h-4 w-4" /> }
                }
              })()
              return (
                <motion.div
                  key={`${ins.type}-${idx}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.04 }}
                  className={`rounded-md border ${palette.border} ${palette.bg} p-3`}
                >
                  <div className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${palette.text}`}>
                    {palette.icon}
                    <span className="uppercase tracking-wide">
                      {ins.type === 'high_usage' && 'ใช้กระดาษสูง'}
                      {ins.type === 'color_heavy' && 'ใช้สีเยอะ'}
                      {ins.type === 'not_read' && 'ยังไม่ได้จดมิเตอร์'}
                      {ins.type === 'mom_change' && 'เปรียบเทียบรายเดือน'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-700 dark:text-slate-200">{ins.message}</div>
                </motion.div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )

  const chartsWidget = (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Donut chart — status distribution */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <Card className="h-full shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base">สัดส่วนสถานะอุปกรณ์</CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">คลิกเซกเตอร์เพื่อดูรายการ</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-56 w-full rounded-md" />
            ) : donutData.length === 0 ? (
              <EmptyState message="ยังไม่มีข้อมูล" />
            ) : (
              <div className="relative h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={56}
                      outerRadius={84}
                      paddingAngle={2}
                      isAnimationActive
                      animationDuration={700}
                      stroke={isDark ? '#0f172a' : '#ffffff'}
                      strokeWidth={2}
                      onClick={(payload: { statusKey?: string }) => {
                        if (payload?.statusKey) drillDownStatus(payload.statusKey)
                      }}
                      cursor="pointer"
                    >
                      {donutData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <ReTooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number, n: string) => {
                        const pct = donutTotal > 0 ? ((v / donutTotal) * 100).toFixed(1) : '0'
                        return [`${v.toLocaleString()} เครื่อง (${pct}%)`, n]
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
                    {donutTotal.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">เครื่องทั้งหมด</div>
                </div>
              </div>
            )}
            {donutData.length > 0 && !isLoading && (
              <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {donutData.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => drillDownStatus(d.statusKey)}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:underline dark:text-slate-300"
                  >
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                    {d.name} <span className="font-semibold tabular-nums">{d.value.toLocaleString()}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Bar chart — by type top 8 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 }}
      >
        <Card className="h-full shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base">จำนวนอุปกรณ์ตามประเภท (Top 8)</CardTitle>
            <p className="text-xs text-slate-500 dark:text-slate-400">คลิกแท่งเพื่อกรองหน้าอุปกรณ์</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-56 w-full rounded-md" />
            ) : barData.length === 0 ? (
              <EmptyState message="ยังไม่มีข้อมูล" />
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 12, right: 8, left: -10, bottom: 4 }}>
                    <defs>
                      <linearGradient id="barTealGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#0d9488" stopOpacity={0.85} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: axisColor, fontSize: 10 }}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis tick={{ fill: axisColor, fontSize: 11 }} allowDecimals={false} />
                    <ReTooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                      formatter={(v: number) => [`${v.toLocaleString()} เครื่อง`, 'จำนวน']}
                    />
                    <Bar
                      dataKey="value"
                      radius={[6, 6, 0, 0]}
                      fill="url(#barTealGrad)"
                      isAnimationActive
                      animationDuration={700}
                      onClick={(payload: { name?: string }) => {
                        if (payload?.name) drillDownType(payload.name)
                      }}
                      cursor="pointer"
                    >
                      <LabelList
                        dataKey="value"
                        position="top"
                        style={{ fill: isDark ? '#cbd5e1' : '#475569', fontSize: 10, fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )

  const paperTrendWidget = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay: 0.1 }}
    >
      <Card className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
        <CardHeader>
          <CardTitle className="text-base">แนวโน้มการใช้กระดาษ (6 เดือนล่าสุด)</CardTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400">รวมขาวดำ + สี · หน่วย: แผ่น</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-56 w-full rounded-md" />
          ) : areaData.length === 0 ? (
            <EmptyState message="ยังไม่มีข้อมูล" />
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={areaData} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaTealGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0d9488" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#0d9488" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: axisColor, fontSize: 11 }} />
                  <YAxis tick={{ fill: axisColor, fontSize: 11 }} tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`} />
                  <ReTooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number, _n: string, p: { payload?: { month?: string } }) => [
                      `${v.toLocaleString()} แผ่น`,
                      `${p?.payload?.month ?? ''}`,
                    ]}
                    labelFormatter={() => ''}
                  />
                  <Area
                    type="monotone"
                    dataKey="sheets"
                    stroke="#0d9488"
                    strokeWidth={2.5}
                    fill="url(#areaTealGrad)"
                    isAnimationActive
                    animationDuration={800}
                    dot={{ r: 3, fill: '#0d9488', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#0d9488', stroke: isDark ? '#0f172a' : '#fff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )

  const bySiteWidget = (
    <Card className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-[#f97316]" /> อุปกรณ์ตามสาขา
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : (data?.bySite ?? []).length === 0 ? (
          <EmptyState message="ยังไม่มีข้อมูลสาขา" />
        ) : (
          <div className="itam-scroll max-h-72 space-y-2 overflow-y-auto pr-1">
            {(data?.bySite ?? []).map((s) => (
              <div
                key={s.siteCode}
                className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 dark:border-slate-800"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.siteCode}</span>
                  <span className="ml-2 text-xs text-slate-400">{s.siteName}</span>
                </div>
                <Badge className="border-teal-300 bg-teal-100 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300">
                  {s.deviceCount} เครื่อง
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )

  const recentActivityWidget = (
    <Card className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-[#f97316]" /> มิเตอร์ล่าสุด
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : (data?.recentActivity ?? []).length === 0 ? (
          <EmptyState message="ยังไม่มีกิจกรรม" />
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {(data?.recentActivity ?? []).map((a) => (
                <motion.div
                  key={a.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{a.deviceName}</div>
                    <div className="text-xs text-slate-400">{a.assetCode} · {a.readingDate}</div>
                  </div>
                  <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {(a.pagesBw + a.pagesColor).toLocaleString()} แผ่น
                  </Badge>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  )

  const lifecycleWidget = <LifecycleDashboard />
  const depreciationWidget = <DepreciationSection />
  const reportsWidget = <ReportsSection />

  function renderWidget(id: WidgetId): React.ReactNode {
    switch (id) {
      case 'kpi': return kpiWidget
      case 'cycle': return cycleWidget
      case 'insights': return insightsWidget
      case 'charts': return chartsWidget
      case 'paperTrend': return paperTrendWidget
      case 'bySite': return bySiteWidget
      case 'recentActivity': return recentActivityWidget
      case 'lifecycle': return lifecycleWidget
      case 'depreciation': return depreciationWidget
      case 'reports': return reportsWidget
      // 'topDevices' is not available with the ITAM dashboard API (no topUsage field).
      case 'topDevices': return null
      default: return null
    }
  }

  return (
    <div className="flex h-full flex-col p-3 md:p-4">
      {/* Page header — FIXED, never scrolls away */}
      <div className="flex-shrink-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ภาพรวมระบบจัดการอุปกรณ์ IT
            {data && <span className="ml-2 text-xs text-emerald-600">⚡ {data.queryTimeMs}ms</span>}
            <span className="ml-2 text-xs text-slate-400">· ช่วง: <span className="font-medium">{rangeInfoLabel}</span></span>
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>อัปเดตอัตโนมัติ • ครั้งล่าสุด: <span className="font-mono tabular-nums">{formatLastUpdated()}</span></span>
            <span className="text-slate-300">· auto 30s</span>
            {isFetching && (
              <span className="ml-1 inline-flex items-center gap-1 text-orange-500">
                <Loader2 className="h-3 w-3 animate-spin" /> กำลังซิงค์…
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as DashboardRangeKey)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="ช่วงเวลา" />
            </SelectTrigger>
            <SelectContent>
              {DASHBOARD_RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="dark:bg-slate-800 dark:border-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> รีเฟรช
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportPdf}
            disabled={isLoading || total === 0}
            className="border-[#0d9488] text-[#0d9488] hover:bg-[#0d9488]/10 dark:border-[#14b8a6] dark:text-[#14b8a6]"
          >
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSitesOpen(true)}
            className="dark:bg-slate-800 dark:border-slate-700"
          >
            <Building2 className="h-4 w-4" /> สาขา
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHeatOpen(true)}
            className="dark:bg-slate-800 dark:border-slate-700"
          >
            <Flame className="h-4 w-4" /> Heatmap
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('dashboard:open-customize'))
              }
            }}
            className="border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10 dark:border-[#fb923c] dark:text-[#fb923c]"
            title="ปรับแต่งวิดเจ็ต"
          >
            <Settings2 className="h-4 w-4" /> ปรับแต่ง
          </Button>
        </div>
      </div>
      </div>

      {/* Content — scrolls internally, header stays visible */}
      <div className="min-h-0 flex-1 overflow-y-auto">

      {/* Quick Actions bar — 1-click access to the 4 most common tasks */}
      <QuickActionsBar
        unreadCount={remindersSummary?.totalUnread ?? 0}
        hasActiveCycle={remindersSummary?.hasActiveCycle ?? false}
        onGoMeter={() => setActivePage('itam-meter-keyboard')}
        onGoDevices={() => setActivePage('itam-devices')}
        onGoPaper={() => setActivePage('itam-paper-analytics')}
        onScan={() => useAppStore.getState().setQrScannerOpen(true)}
      />

      {/* Widget layout — drag-to-reorder + show/hide via "ปรับแต่ง" popover */}
      <DashboardWidgetLayout renderWidget={renderWidget} />

      </div>

      {/* Site comparison modal */}
      <Dialog open={sitesOpen} onOpenChange={setSitesOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Trophy className="h-5 w-5 text-[#f97316]" /> เปรียบเทียบสาขา
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-md" />
                ))}
              </div>
            ) : sortedSites.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">ยังไม่มีข้อมูล</div>
            ) : (
              sortedSites.map((s, i) => {
                const pct = Math.max(2, (s.deviceCount / maxDevices) * 100)
                return (
                  <div key={s.siteCode} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {i < 3 ? <span className="text-lg">{MEDALS[i]}</span> : <span className="inline-block w-4 text-center text-xs font-bold text-slate-400">{i + 1}</span>}
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{s.siteCode}</span>
                        <span className="text-xs text-slate-400">{s.siteName}</span>
                      </div>
                      <Badge className="border-teal-300 bg-teal-100 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300">
                        {s.deviceCount} เครื่อง
                      </Badge>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                      <motion.div
                        className="h-full rounded bg-gradient-to-r from-orange-400 to-orange-600"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                    <div className="mt-1.5 flex justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>✅ ใช้งาน {s.activeCount ?? 0}</span>
                      <span>📄 กระดาษเดือนนี้ {(s.paperSheets ?? 0).toLocaleString()} แผ่น</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Heatmap modal */}
      <Dialog open={heatOpen} onOpenChange={setHeatOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Flame className="h-5 w-5 text-[#0d9488]" /> Heatmap การใช้งานกระดาษ
            </DialogTitle>
          </DialogHeader>
          {heatLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded" />
              ))}
            </div>
          ) : heat.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">ยังไม่มีข้อมูล</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-100/95 px-2 py-1.5 text-left text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">อุปกรณ์</th>
                    {heatMonths.map(m => (
                      <th key={m} className="px-2 py-1.5 text-center font-mono text-slate-500">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heat.map(row => (
                    <tr key={row.assetCode}>
                      <td className="sticky left-0 z-10 max-w-[180px] truncate bg-slate-100/95 px-2 py-1 text-slate-700 dark:bg-slate-900/80 dark:text-slate-200" title={row.deviceName}>
                        <span className="font-mono text-[10px] text-slate-400">{row.assetCode}</span>
                        <div className="truncate">{row.deviceName}</div>
                      </td>
                      {row.months.map(c => {
                        const intensity = c.pages / maxPages
                        const txtColor = intensity > 0.55 ? 'text-white' : 'text-slate-700 dark:text-slate-200'
                        return (
                          <td
                            key={c.month}
                            className={`px-2 py-1.5 text-center font-mono tabular-nums ${txtColor}`}
                            style={{ background: heatColor(intensity) }}
                            title={`${row.assetCode} · ${c.month}: ${c.pages.toLocaleString()} แผ่น`}
                          >
                            {c.pages > 0 ? c.pages.toLocaleString() : '·'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <span>น้อย</span>
                {[0.1, 0.3, 0.5, 0.7, 0.9].map(i => (
                  <span key={i} className="h-3 w-8 rounded-sm" style={{ background: heatColor(i) }} />
                ))}
                <span>มาก</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
