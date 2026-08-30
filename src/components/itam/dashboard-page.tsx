'use client'

// ============================================================
// Integrated Dashboard (Task ID: RBAC-DASHBOARD)
// ============================================================
// ดึงข้อมูลจริงจาก /api/dashboard ที่รวมทั้ง 3 ระบบ
// (Devices + WorkOrders + Stock) บวก alert lists
//
// Layout:
//  ┌─────────────────────────────────────────────────────────┐
//  │ Header (title + รีเฟรช + range badge)                  │
//  ├─────────────────────────────────────────────────────────┤
//  │ 4 KPI cards: อุปกรณ์ทั้งหมด · ใบงานรอดำเนินการ ·        │
//  │              สต็อกต่ำ · คะแนนเฉลี่ย                      │
//  ├──────────────────────┬──────────────────────────────────┤
//  │ สถานะใบงาน (pie)     │ ประเภทอุปกรณ์ (bar)             │
//  ├──────────────────────┴──────────────────────────────────┤
//  │ ใบงานล่าสุด (table latest 5)                            │
//  ├──────────────────────────┬──────────────────────────────┤
//  │ สต็อกต่ำ (list)          │ การแจ้งเตือน (alerts)         │
//  └──────────────────────────┴──────────────────────────────┘
// ============================================================

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { motion } from 'framer-motion'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Package,
  Wrench,
  AlertTriangle,
  Star,
  RefreshCw,
  Activity,
  ClipboardList,
  TrendingDown,
  Clock,
  ShieldAlert,
  Inbox,
  Cpu,
  Printer,
  Settings2,
} from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { exportDashboardPdf } from './dashboard-pdf-export'
import { LifecycleDashboard } from './lifecycle-dashboard'
import { QuickActionsBar } from './quick-actions-bar'
import {
  DashboardWidgetLayout,
  type WidgetId,
} from './dashboard-widget-layout'
import { DepreciationSection } from './depreciation-section'
import { ReportsSection } from './reports-section'

// ---- API response types ----
interface DashboardApiData {
  devices: {
    total: number
    active: number
    byType: Array<{ name: string; count: number }>
    bySite: Array<{ site: string; count: number }>
  }
  workOrders: {
    total: number
    pending: number
    inProgress: number
    waitingParts: number
    completed: number
    cancelled: number
    byPriority: Array<{ priority: string; count: number }>
    recent: Array<{
      id: string
      woNumber: string | null
      subject: string
      status: string
      priority: string
      reporterName: string | null
      reporterEmail: string | null
      building: string | null
      location: string | null
      assignedTo: string | null
      createdAt: string
      updatedAt: string
    }>
    avgRating: number
  }
  stock: {
    totalItems: number
    lowStock: number
    totalValue: number
    pendingApprovals: number
    recentTransactions: Array<{
      id: string
      txnNumber: string | null
      productName: string | null
      type: string
      quantity: number
      unit: string | null
      requester: string | null
      performedBy: string | null
      approvalStatus: string | null
      createdAt: string
      txnDate: string
    }>
  }
  alerts: {
    lowStockItems: Array<{
      id: string
      productCode: string
      productName: string
      category: string | null
      brand: string | null
      quantity: number
      minQuantity: number
      unit: string
      site: string | null
      shortfall: number
    }>
    pendingWOs: Array<{
      id: string
      woNumber: string | null
      subject: string
      status: string
      priority: string
      reporterName: string | null
      building: string | null
      createdAt: string
      updatedAt: string
      waitingHours: number
    }>
    expiringWarranties: Array<{
      id: string
      assetCode: string
      name: string
      site: string
      warrantyEnd: string | null
    }>
  }
  meta?: { generatedAt: string }
}

// ---- Constants ----
const WO_STATUS_META: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  PENDING: { label: 'รอรับงาน', color: '#f59e0b', bg: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' },
  IN_PROGRESS: { label: 'กำลังซ่อม', color: '#3b82f6', bg: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800' },
  WAITING_PARTS: { label: 'รออะไหล่', color: '#a855f7', bg: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800' },
  COMPLETED: { label: 'เสร็จสิ้น', color: '#10b981', bg: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800' },
  CANCELLED: { label: 'ยกเลิก', color: '#94a3b8', bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
}

const PRIORITY_META: Record<string, { label: string; bg: string }> = {
  'ด่วน': { label: 'ด่วน', bg: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800' },
  'สูง': { label: 'สูง', bg: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800' },
  'ปานกลาง': { label: 'ปานกลาง', bg: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' },
  'ปกติ': { label: 'ปกติ', bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
}

function statusLabel(s: string): string {
  return WO_STATUS_META[s]?.label ?? s
}
function statusBadgeClass(s: string): string {
  return WO_STATUS_META[s]?.bg ?? 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
}
function priorityBadgeClass(p: string): string {
  return PRIORITY_META[p]?.bg ?? PRIORITY_META['ปกติ'].bg
}

function formatBaht(v: number): string {
  return `฿${v.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`
}

function formatThaiDateTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function relativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return iso
    const diff = Math.max(0, Date.now() - then)
    const sec = Math.floor(diff / 1000)
    if (sec < 60) return 'เมื่อสักครู่'
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min} นาทีที่แล้ว`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr} ชม. ที่แล้ว`
    const day = Math.floor(hr / 24)
    if (day < 30) return `${day} วันที่แล้ว`
    const mo = Math.floor(day / 30)
    if (mo < 12) return `${mo} เดือนที่แล้ว`
    return `${Math.floor(mo / 12)} ปีที่แล้ว`
  } catch {
    return iso
  }
}

// ---- Animated count-up hook ----
function useCountUp(target: number, duration = 500) {
  const [display, setDisplay] = React.useState(target)
  const fromRef = React.useRef(target)
  const rafRef = React.useRef<number | null>(null)
  const startRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const from = fromRef.current
    if (from === target) {
      setDisplay(target)
      return
    }
    startRef.current = null
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      const elapsed = ts - startRef.current
      const t = Math.min(1, elapsed / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = Math.round(from + (target - from) * eased)
      setDisplay(next)
      if (t < 1) {
        rafRef.current = window.requestAnimationFrame(step)
      } else {
        fromRef.current = target
        setDisplay(target)
      }
    }
    rafRef.current = window.requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
      }
      fromRef.current = display
    }
  }, [target, duration])

  return display
}

// ---- KPI Card ----
interface KpiCardProps {
  title: string
  value: number
  icon: React.ReactNode
  accent: string
  loading?: boolean
  trend?: string
  format?: (v: number) => string
  unit?: string
}

function KpiCard({
  title,
  value,
  icon,
  accent,
  loading,
  trend,
  format,
  unit,
}: KpiCardProps) {
  const animated = useCountUp(value, 500)
  const display = format ? format(animated) : animated.toLocaleString('th-TH')
  return (
    <Card
      className="group relative overflow-hidden shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-[#f97316] focus-within:ring-offset-1 dark:focus-within:ring-offset-slate-950"
    >
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: accent }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent to-black/[0.02] opacity-0 transition-opacity group-hover:opacity-100 dark:to-white/[0.03]"
      />
      <CardContent className="relative p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105 sm:h-12 sm:w-12"
            style={{ background: `${accent}1a`, color: accent }}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
              {title}
            </div>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-24 dark:bg-slate-800" />
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold tabular-nums leading-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
                  {display}
                </span>
                {unit && (
                  <span className="shrink-0 text-xs font-medium text-slate-400 dark:text-slate-500">
                    {unit}
                  </span>
                )}
              </div>
            )}
            {trend && !loading && (
              <div
                className="mt-0.5 truncate text-xs leading-tight text-slate-400 dark:text-slate-500"
                title={trend}
              >
                {trend}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState({
  message,
  subtitle,
  icon,
}: {
  message: string
  subtitle?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400 dark:text-slate-500">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        {icon ?? <Inbox className="h-6 w-6 text-slate-300 dark:text-slate-600" />}
      </div>
      <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">{message}</div>
      {subtitle && (
        <div className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</div>
      )}
    </div>
  )
}

// ---- Main dashboard component ----
export function DashboardPage() {
  const qc = useQueryClient()
  const { theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const isDark = mounted && theme === 'dark'

  const setActivePage = useAppStore((s) => s.setActivePage)
  const authUser = useAuthStore((s) => s.user)
  const authInitialized = useAuthStore((s) => s.initialized)
  const fetchMe = useAuthStore((s) => s.fetchMe)

  const [seeding, setSeeding] = React.useState(false)
  const [range, setRange] = React.useState<DashboardRangeKey>('month')
  const [exporting, setExporting] = React.useState(false)

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<DashboardData>({
    queryKey: ['dashboard', range],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?range=${range}`)
      if (!res.ok) throw new Error('Failed to load dashboard')
      return res.json()
    },
    // Dashboard data doesn't change frequently — keep it fresh for 30s,
    // then auto-refetch every 60s so the user sees updates without manual refresh.
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    // Smooth range-switching: keep previous data while new range loads
    placeholderData: (prev) => prev,
  })

  // Active cycle (for the dashboard cycle progress widget)
  const { data: activeCycle, isLoading: cycleLoading } = useQuery<Cycle | null>({
    queryKey: ['active-cycle'],
    queryFn: async () => {
      const res = await fetch('/api/cycles?status=active')
      if (!res.ok) return null
      const json = await res.json()
      return (json.cycles?.[0] as Cycle | undefined) ?? null
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  // Reading progress for the active cycle (totalRead / totalMeterable)
  interface RemindersSummary {
    hasActiveCycle: boolean
    totalRead: number
    totalUnread: number
  }
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
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  // Warranty summary (always fetched once)
  const { data: warrantyData } = useQuery<{
    summary: WarrantySummary
  }>({
    queryKey: ['warranty-summary'],
    queryFn: async () => {
      const res = await fetch('/api/devices/warranty')
      if (!res.ok) throw new Error('Failed to load warranty')
      const json = await res.json()
      return { summary: json.summary as WarrantySummary }
    },
    staleTime: 60_000,
  })

  // App settings (for org name used in PDF export)
  const { data: settingsMap } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings')
      if (!res.ok) return {}
      const json = await res.json()
      return (json.settings as Record<string, string>) ?? {}
    },
    staleTime: 60_000,
  })

  // Auto-seed if empty
  React.useEffect(() => {
    if (!authInitialized) void fetchMe()
  }, [authInitialized, fetchMe])

  // Fetch dashboard data — no range filter, this is the integrated summary
  const { data, isLoading, isError, refetch, isFetching } =
    useQuery<DashboardApiData>({
      queryKey: ['dashboard-integrated'],
      queryFn: async () => {
        const res = await fetch('/api/dashboard', { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load dashboard')
        return res.json()
      },
      staleTime: 30_000,
    })

  // Auto-seed if database is empty (devices total === 0)
  const hasAutoSeeded = React.useRef(false)
  const runSeed = React.useCallback(async () => {
    try {
      const res = await fetch('/api/seed', { method: 'POST' })
      if (!res.ok) return
      const json = await res.json()
      if (!json.skipped) {
        toast.success(`โหลดข้อมูลตัวอย่างแล้ว (${json.counts?.devices ?? 0} อุปกรณ์)`)
        await qc.invalidateQueries()
      }
    } catch {
      // silent — preview mode
    }
  }, [qc])

  React.useEffect(() => {
    if (!data || hasAutoSeeded.current) return
    if (data.devices.total === 0 && data.workOrders.total === 0 && data.stock.totalItems === 0) {
      hasAutoSeeded.current = true
      void runSeed()
    }
  }, [data, runSeed])

  // Derived values
  const totalDevices = data?.devices.total ?? 0
  const activeDevices = data?.devices.active ?? 0
  const pendingWOs =
    (data?.workOrders.pending ?? 0) +
    (data?.workOrders.inProgress ?? 0) +
    (data?.workOrders.waitingParts ?? 0)
  const lowStockCount = data?.stock.lowStock ?? 0
  const avgRating = data?.workOrders.avgRating ?? 0
  const pendingApprovals = data?.stock.pendingApprovals ?? 0
  const totalValue = data?.stock.totalValue ?? 0

  // Chart palette
  const axisTickColor = '#64748b'
  const gridStroke = isDark ? '#334155' : '#e2e8f0'
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0'
  const tooltipBg = isDark ? '#0f172a' : '#ffffff'
  const tooltipFg = isDark ? '#e2e8f0' : '#1e293b'

  // Pie chart data for WO status
  const woStatusPie = React.useMemo(() => {
    if (!data) return []
    const w = data.workOrders
    return [
      { name: 'รอรับงาน', value: w.pending, color: WO_STATUS_META.PENDING.color, raw: 'PENDING' },
      { name: 'กำลังซ่อม', value: w.inProgress, color: WO_STATUS_META.IN_PROGRESS.color, raw: 'IN_PROGRESS' },
      { name: 'รออะไหล่', value: w.waitingParts, color: WO_STATUS_META.WAITING_PARTS.color, raw: 'WAITING_PARTS' },
      { name: 'เสร็จสิ้น', value: w.completed, color: WO_STATUS_META.COMPLETED.color, raw: 'COMPLETED' },
      { name: 'ยกเลิก', value: w.cancelled, color: WO_STATUS_META.CANCELLED.color, raw: 'CANCELLED' },
    ].filter((d) => d.value > 0)
  }, [data])

  // Total for percentage calculation
  const woTotal = woStatusPie.reduce((s, d) => s + d.value, 0)

  // Bar chart data for device types (top 8)
  const deviceTypeBar = React.useMemo(() => {
    if (!data) return []
    return data.devices.byType.slice(0, 8).map((d) => ({
      name: d.name.length > 18 ? d.name.slice(0, 16) + '…' : d.name,
      fullName: d.name,
      count: d.count,
    }))
  }, [data])

  if (isError) {
    return (
      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-rose-600 dark:text-rose-400">
              โหลดข้อมูล Dashboard ไม่สำเร็จ กรุณาลองอีกครั้ง
            </p>
            <Button className="mt-3" onClick={() => refetch()}>
              ลองอีกครั้ง
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="mb-5 flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 sm:text-2xl">
            แดชบอร์ดภาพรวม
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            สรุปข้อมูลรวมจากทั้ง 3 ระบบ: อุปกรณ์ · ใบงานแจ้งซ่อม · สต็อก
            {authUser?.name && (
              <span className="ml-2 hidden text-slate-400 sm:inline">
                · ผู้ใช้: {authUser.name}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingApprovals > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActivePage('stock')}
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
            >
              <ClipboardList className="h-4 w-4" />
              รออนุมัติ {pendingApprovals}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5"
          >
            🔄 รีเฟรช
          </Button>
          {/* Last-updated indicator — shows when data was last refreshed (Next.js-exclusive: auto-refresh every 60s) */}
          {dataUpdatedAt > 0 && (
            <span className="hidden items-center gap-1 text-xs text-slate-400 sm:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              อัปเดต {new Date(dataUpdatedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              <span className="text-slate-300">· auto 60s</span>
            </span>
          )}
          <Button
            variant="outline"
            onClick={handleExportPdf}
            disabled={exporting || isLoading || total === 0}
            className="border-[#0d9488] text-[#0d9488] hover:bg-[#0d9488]/10 focus-visible:ring-2 focus-visible:ring-[#0d9488] focus-visible:ring-offset-1 dark:border-[#14b8a6] dark:text-[#14b8a6] dark:hover:bg-[#14b8a6]/10 dark:focus-visible:ring-offset-slate-950"
            title="ส่งออก PDF รายงานภาพรวม"
          >
            <Printer className="mr-1.5 h-4 w-4" />
            {exporting ? 'กำลังเตรียม...' : 'ส่งออก PDF'}
          </Button>
          {/* Customize widget layout — opens the popover managed by DashboardWidgetLayout */}
          <Button
            variant="outline"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('dashboard:open-customize'),
                )
              }
            }}
            className="border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10 focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:border-[#fb923c] dark:text-[#fb923c] dark:hover:bg-[#fb923c]/10 dark:focus-visible:ring-offset-slate-950"
            title="ปรับแต่งวิดเจ็ต"
          >
            <Settings2 className="h-4 w-4" />
            ปรับแต่ง
          </Button>
        </div>
      </motion.div>

      {/* KPI Row — 4 cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          title="อุปกรณ์ทั้งหมด"
          value={totalDevices}
          icon={<Package className="h-5 w-5" />}
          accent="#0f172a"
          loading={isLoading}
          trend={
            totalDevices > 0
              ? `${activeDevices} เครื่องใช้งานอยู่ · ${(data?.devices.byType.length ?? 0)} ประเภท`
              : undefined
          }
        />
        <KpiCard
          title="ใบงานรอดำเนินการ"
          value={pendingWOs}
          icon={<Wrench className="h-5 w-5" />}
          accent="#f97316"
          loading={isLoading}
          trend={
            data
              ? `รอรับ ${data.workOrders.pending} · กำลังซ่อม ${data.workOrders.inProgress} · รออะไหล่ ${data.workOrders.waitingParts}`
              : undefined
          }
        />
        <KpiCard
          title="สต็อกต่ำ"
          value={lowStockCount}
          icon={<AlertTriangle className="h-5 w-5" />}
          accent="#ef4444"
          loading={isLoading}
          trend={
            data
              ? `จากทั้งหมด ${data.stock.totalItems} รายการ · มูลค่ารวม ${formatBaht(totalValue)}`
              : undefined
          }
        />
        <KpiCard
          title="คะแนนเฉลี่ย"
          value={avgRating}
          icon={<Star className="h-5 w-5" />}
          accent="#eab308"
          loading={isLoading}
          format={(v) => v.toFixed(2)}
          unit="/ 5"
          trend={
            data && data.workOrders.total > 0
              ? `จาก ${data.workOrders.completed} ใบงานที่เสร็จสิ้น`
              : 'ยังไม่มีคะแนนรีวิว'
          }
        />
      </div>

      {/* Charts row — pie (WO status) + bar (device types) */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* WO Status Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-[#f97316]" />
              สถานะใบงานแจ้งซ่อม
            </CardTitle>
            <CardDescription className="text-xs">
              แจกแจงตามสถานะปัจจุบัน
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full dark:bg-slate-800" />
            ) : woStatusPie.length === 0 ? (
              <EmptyState message="ยังไม่มีใบงานในระบบ" />
            ) : (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={woStatusPie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      label={({ value, name }) => {
                        const pct = woTotal > 0 ? ((value / woTotal) * 100) : 0
                        // ซ่อน label ถ้าค่าน้อยกว่า 2% (กันซ้อนกัน)
                        if (pct < 2) return ''
                        return `${name} ${pct.toFixed(0)}%`
                      }}
                      labelLine={{ stroke: axisTickColor, strokeWidth: 1 }}
                      isAnimationActive={false}
                    >
                      {woStatusPie.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: tooltipBg,
                        border: `1px solid ${tooltipBorder}`,
                        borderRadius: 8,
                        color: tooltipFg,
                        fontSize: 12,
                      }}
                      formatter={(value: number, _name, props) => {
                        const total = woStatusPie.reduce((s, d) => s + d.value, 0)
                        const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0'
                        const raw = (props?.payload as { raw?: string })?.raw ?? ''
                        return [`${value} ใบ (${pct}%)`, statusLabel(raw)]
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Device Types Bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4 text-[#0d9488]" />
              ประเภทอุปกรณ์
            </CardTitle>
            <CardDescription className="text-xs">
              จำนวนอุปกรณ์แยกตามประเภท
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full dark:bg-slate-800" />
            ) : deviceTypeBar.length === 0 ? (
              <EmptyState message="ยังไม่มีอุปกรณ์ในระบบ" />
            ) : (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deviceTypeBar} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={axisTickColor} />
                    <XAxis dataKey="name" tick={{ fill: axisTickColor, fontSize: 11 }} />
                    <YAxis tick={{ fill: axisTickColor, fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: tooltipBg,
                        border: `1px solid ${tooltipBorder}`,
                        borderRadius: 8,
                        color: tooltipFg,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="value" name="จำนวน" radius={[6, 6, 0, 0]} fill="#0d9488" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Quick Actions bar — 1-click access to the 4 most common tasks ──
          Designed from the USER's perspective: open the app, see what to do,
          click once, you're in the task. No sidebar hunting needed. */}
      <QuickActionsBar
        unreadCount={remindersSummary?.totalUnread ?? 0}
        hasActiveCycle={remindersSummary?.hasActiveCycle ?? false}
        onGoMeter={() => setActivePage('itam-meter-keyboard')}
        onGoDevices={() => setActivePage('itam-devices')}
        onGoPaper={() => setActivePage('itam-paper-analytics')}
        onScan={() => useAppStore.getState().setQrScannerOpen(true)}
      />


      <DashboardWidgetLayout renderWidget={renderWidget} />
    </div>
  )
}
