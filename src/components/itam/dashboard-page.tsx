'use client'

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
  Label,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Package,
  CheckCircle2,
  Archive,
  Wrench,
  TrendingUp,
  History,
  Sparkles,
  FileText,
  Inbox,
  AlertTriangle,
  CalendarClock,
  ArrowRight,
} from 'lucide-react'
import type {
  DashboardData,
  DashboardRangeKey,
  Cycle,
} from './types'
import { DASHBOARD_RANGE_OPTIONS } from './types'
import { useAppStore } from '@/store/app-store'

interface WarrantySummary {
  active: number
  expiring: number
  expired: number
  unknown: number
}

const STATUS_COLORS: Record<string, string> = {
  ใช้งานอยู่: '#10b981',
  สำรอง: '#f59e0b',
  ส่งซ่อม: '#f97316',
  ตัดของออก: '#f43f5e',
}

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

/**
 * Animated count-up hook — tweens from the previous value to the next
 * over 500ms using requestAnimationFrame.
 */
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
      // easeOutCubic
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
      // remember where we landed so the next tween starts smoothly
      fromRef.current = display
    }
  }, [target, duration])

  return display
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
  const display = format ? format(animated) : animated.toLocaleString()
  return (
    <Card
      className="group relative overflow-hidden shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-[#f97316] focus-within:ring-offset-1 dark:focus-within:ring-offset-slate-950"
    >
      {/* Thin top accent bar */}
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: accent }}
      />
      {/* Subtle gradient overlay on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent to-black/[0.02] opacity-0 transition-opacity group-hover:opacity-100 dark:to-white/[0.03]"
      />
      <CardContent className="relative p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105 sm:h-11 sm:w-11"
            style={{ background: `${accent}1a`, color: accent }}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
              {title}
            </div>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-20 dark:bg-slate-800" />
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold tabular-nums leading-tight text-slate-800 dark:text-slate-100 sm:text-2xl">
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
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400 dark:text-slate-500">
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

export function DashboardPage() {
  const qc = useQueryClient()
  const { theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const isDark = mounted && theme === 'dark'

  const setActivePage = useAppStore((s) => s.setActivePage)
  const setPendingWarrantyFilter = useAppStore(
    (s) => s.setPendingWarrantyFilter,
  )
  const setPendingMeterAction = useAppStore((s) => s.setPendingMeterAction)

  const [seeding, setSeeding] = React.useState(false)
  const [range, setRange] = React.useState<DashboardRangeKey>('month')

  const { data, isLoading, isError, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard', range],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?range=${range}`)
      if (!res.ok) throw new Error('Failed to load dashboard')
      return res.json()
    },
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

  // Auto-seed if empty
  React.useEffect(() => {
    if (!data) return
    if (data.totals.total === 0) {
      void runSeed()
    }
  }, [data?.totals.total])

  async function runSeed() {
    try {
      setSeeding(true)
      const res = await fetch('/api/seed', { method: 'POST' })
      if (!res.ok) throw new Error('Seed failed')
      const json = await res.json()
      toast.success(`โหลดข้อมูลตัวอย่างแล้ว (${json.counts?.devices ?? 0} อุปกรณ์)`)
      await qc.invalidateQueries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Seed failed')
    } finally {
      setSeeding(false)
    }
  }

  if (isError) {
    return (
      <div className="p-6">
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

  const total = data?.totals.total ?? 0
  const active = data?.totals.active ?? 0
  const spare = data?.totals.spare ?? 0
  const repair = data?.totals.repair ?? 0
  const paperThisMonth = data?.paperThisMonth ?? 0
  const warrantyAlerts =
    (warrantyData?.summary.expiring ?? 0) +
    (warrantyData?.summary.expired ?? 0)

  const activeTrend =
    total > 0
      ? `${Math.round((active / total) * 100)}% ของทั้งหมด ${total} เครื่อง`
      : undefined

  const paperKpiLabel =
    DASHBOARD_RANGE_OPTIONS.find((o) => o.value === range)?.kpiLabel ??
    'กระดาษเดือนนี้'
  const paperTrend =
    range === 'all'
      ? 'รวมทุกช่วงเวลา'
      : data?.range?.start
        ? `${data.range.start}${data.range.end ? ` → ${data.range.end}` : ''}`
        : new Date().toLocaleDateString('th-TH', {
            month: 'long',
            year: 'numeric',
          })

  const rangeInfoLabel =
    DASHBOARD_RANGE_OPTIONS.find((o) => o.value === range)?.label ?? 'เดือนนี้'

  // Chart palette — works in both themes
  const axisTickColor = '#64748b'
  const gridStroke = isDark ? '#334155' : '#e2e8f0'
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0'
  const tooltipBg = isDark ? '#0f172a' : '#ffffff'
  const tooltipFg = isDark ? '#e2e8f0' : '#1e293b'
  const donutCenterText = isDark ? '#e2e8f0' : '#1e293b'
  const donutCenterSub = isDark ? '#64748b' : '#94a3b8'

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Page header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ภาพรวมระบบจัดการอุปกรณ์ IT
            {data?.range && (
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                · ช่วง: <span className="font-medium">{rangeInfoLabel}</span>
                {data.range.start && (
                  <>
                    {' '}({data.range.start}
                    {data.range.end ? ` → ${data.range.end}` : ''})
                  </>
                )}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as DashboardRangeKey)}>
            <SelectTrigger className="w-[160px]">
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
          {data && total === 0 && (
            <Button
              onClick={runSeed}
              disabled={seeding}
              variant="outline"
              className="border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10 focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              {seeding ? 'กำลังโหลด...' : 'โหลดข้อมูลตัวอย่าง'}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
            className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
          >
            🔄 รีเฟรช
          </Button>
        </div>
      </div>

      {seeding && (
        <Card className="border-[#f97316]/40 bg-[#f97316]/5 dark:border-[#f97316]/30 dark:bg-[#f97316]/10">
          <CardContent className="p-4 text-sm text-[#f97316]">
            กำลังโหลดข้อมูลตัวอย่าง... กรุณารอสักครู่
          </CardContent>
        </Card>
      )}

      {/* KPI row — 5 cards on lg + warranty alert bar */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <KpiCard
          title="อุปกรณ์ทั้งหมด"
          value={total}
          icon={<Package className="h-5 w-5" />}
          accent="#0f172a"
          loading={isLoading}
          trend={total > 0 ? `${(data?.byType ?? []).length} ประเภท` : undefined}
        />
        <KpiCard
          title="ใช้งานอยู่"
          value={active}
          icon={<CheckCircle2 className="h-5 w-5" />}
          accent="#10b981"
          loading={isLoading}
          trend={activeTrend}
        />
        <KpiCard
          title="สำรอง"
          value={spare}
          icon={<Archive className="h-5 w-5" />}
          accent="#f59e0b"
          loading={isLoading}
          trend={total > 0 ? `${Math.round((spare / total) * 100)}% ของทั้งหมด` : undefined}
        />
        <KpiCard
          title="ส่งซ่อม"
          value={repair}
          icon={<Wrench className="h-5 w-5" />}
          accent="#f97316"
          loading={isLoading}
          trend={repair > 0 ? 'รอดำเนินการ' : 'ปกติ'}
        />
        <KpiCard
          title={paperKpiLabel}
          value={paperThisMonth}
          icon={<FileText className="h-5 w-5" />}
          accent="#0d9488"
          loading={isLoading}
          unit="แผ่น"
          trend={paperTrend}
        />
      </div>

      {/* Cycle progress widget — animated, full-width */}
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

      {/* Warranty alert bar — full-width amber card linking to devices */}
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
            style={{
              background: 'linear-gradient(90deg, #f59e0b, #f97316)',
            }}
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

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base text-slate-800 dark:text-slate-100">
              สัดส่วนสถานะอุปกรณ์
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full dark:bg-slate-800" />
            ) : (data?.byStatus ?? []).length === 0 ? (
              <EmptyState message="ยังไม่มีข้อมูลอุปกรณ์" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data?.byStatus ?? []}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {(data?.byStatus ?? []).map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={STATUS_COLORS[entry.name] ?? '#94a3b8'}
                      />
                    ))}
                    <Label
                      content={({ viewBox }) => {
                        if (!viewBox || !('cx' in viewBox)) return null
                        const { cx, cy } = viewBox as {
                          cx: number
                          cy: number
                        }
                        return (
                          <>
                            <text
                              x={cx}
                              y={cy - 6}
                              textAnchor="middle"
                              dominantBaseline="central"
                              style={{
                                fontSize: 26,
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums',
                                fill: donutCenterText,
                              }}
                            >
                              {total}
                            </text>
                            <text
                              x={cx}
                              y={cy + 16}
                              textAnchor="middle"
                              dominantBaseline="central"
                              style={{ fontSize: 12, fill: donutCenterSub }}
                            >
                              เครื่อง
                            </text>
                          </>
                        )
                      }}
                    />
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [value, name]}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: `1px solid ${tooltipBorder}`,
                      background: tooltipBg,
                      color: tooltipFg,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base text-slate-800 dark:text-slate-100">
              จำนวนอุปกรณ์ตามประเภท
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full dark:bg-slate-800" />
            ) : (data?.byType ?? []).length === 0 ? (
              <EmptyState message="ยังไม่มีข้อมูลอุปกรณ์" />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data?.byType ?? []}>
                  <defs>
                    <linearGradient
                      id="barTypeFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#0d9488" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={gridStroke}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: axisTickColor }}
                    tickLine={false}
                    axisLine={{ stroke: gridStroke }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: axisTickColor }}
                    tickLine={false}
                    axisLine={{ stroke: gridStroke }}
                  />
                  <Tooltip
                    cursor={{ fill: '#0d948810' }}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: `1px solid ${tooltipBorder}`,
                      background: tooltipBg,
                      color: tooltipFg,
                    }}
                  />
                  <Bar
                    dataKey="value"
                    fill="url(#barTypeFill)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
              <TrendingUp className="h-4 w-4 text-[#f97316]" />
              Top อุปกรณ์ตามการใช้งานกระดาษ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="itam-scroll max-h-72 overflow-y-auto">
              {(data?.topUsage ?? []).length === 0 ||
              (data?.topUsage ?? []).every((d) => d.value === 0) ? (
                <EmptyState message="ยังไม่มีข้อมูลการใช้งาน" />
              ) : (
                <ul className="space-y-2">
                  {(data?.topUsage ?? [])
                    .filter((d) => d.value > 0)
                    .map((d, i) => (
                      <li
                        key={d.id}
                        className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f97316] text-xs font-bold text-white">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                              {d.name}
                            </div>
                            <div className="truncate font-mono text-xs text-slate-400 dark:text-slate-500">
                              {d.assetCode}
                            </div>
                          </div>
                        </div>
                        <Badge className="border-[#f97316]/30 bg-[#f97316]/10 text-[#f97316] tabular-nums">
                          {d.value.toLocaleString()} แผ่น
                        </Badge>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
              <History className="h-4 w-4 text-[#f97316]" />
              กิจกรรมล่าสุด (จดมิเตอร์)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="itam-scroll max-h-72 overflow-y-auto">
              {(data?.recentActivity ?? []).length === 0 ? (
                <EmptyState message="ยังไม่มีกิจกรรม" />
              ) : (
                <ul className="space-y-2">
                  {(data?.recentActivity ?? []).map((a) => (
                    <li
                      key={a.id}
                      className="rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                          {a.deviceName}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">
                          {a.date}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono text-slate-400 dark:text-slate-500">
                          {a.assetCode}
                        </span>
                        <span>·</span>
                        <span className="tabular-nums">
                          อ่าน {a.reading.toLocaleString()}
                        </span>
                        {a.delta > 0 && (
                          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 tabular-nums dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            +{a.delta.toLocaleString()}
                          </Badge>
                        )}
                        {a.remark && (
                          <span className="truncate text-amber-600 dark:text-amber-400">
                            ⚠ {a.remark}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Cycle Progress Widget — shows active cycle status at a glance
// ----------------------------------------------------------------------------
interface CycleProgressWidgetProps {
  activeCycle: Cycle | null
  cycleLoading: boolean
  remindersSummary: {
    hasActiveCycle: boolean
    totalRead: number
    totalUnread: number
  } | null
  onManageCycle: () => void
  onCreateCycle: () => void
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24),
  )
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function CycleProgressWidget({
  activeCycle,
  cycleLoading,
  remindersSummary,
  onManageCycle,
  onCreateCycle,
}: CycleProgressWidgetProps) {
  // Start progress bars at 0 then animate to their real value after mount
  // — Radix Progress needs a value change to trigger the CSS transition.
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

  // No active cycle — amber alert prompting the user to create one
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

  // Active cycle — show progress bars
  const totalDays = Math.max(1, daysBetween(activeCycle.startDate, activeCycle.endDate))
  const elapsed = Math.max(0, daysBetween(activeCycle.startDate, todayISO()))
  const daysRemaining = Math.max(0, daysBetween(todayISO(), activeCycle.endDate))
  const elapsedPct = Math.min(100, Math.round((elapsed / totalDays) * 100))

  const totalRead = remindersSummary?.totalRead ?? 0
  const totalMeterable =
    (remindersSummary?.totalRead ?? 0) + (remindersSummary?.totalUnread ?? 0)
  const readPct =
    totalMeterable > 0 ? Math.round((totalRead / totalMeterable) * 100) : 0

  // Animate from 0 → target on mount
  const animElapsedPct = mounted ? elapsedPct : 0
  const animReadPct = mounted ? readPct : 0

  return (
    <Card className="group relative overflow-hidden border-[#f97316]/20 bg-gradient-to-br from-orange-50 to-white shadow-sm transition-shadow hover:shadow-md dark:border-[#f97316]/30 dark:from-slate-900 dark:to-slate-800/50">
      {/* Top accent bar */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#fb923c] to-[#f97316]" />
      {/* Watermark icon */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-2 -top-2 select-none text-[100px] leading-none text-[#f97316]/5 dark:text-[#fb923c]/10"
      >
        <CalendarClock className="h-24 w-24" />
      </span>

      <CardContent className="relative p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: cycle name + dates */}
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
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:scale-105 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                กำลังดำเนินการ
              </Badge>
            </div>
          </div>

          {/* Middle: days remaining big number */}
          <div className="flex shrink-0 items-center gap-4">
            <div className="flex flex-col items-center justify-center rounded-lg bg-white/70 px-4 py-2 text-center shadow-sm dark:bg-slate-800/60">
              <div className="text-3xl font-bold tabular-nums leading-tight text-[#f97316] dark:text-[#fb923c]">
                {daysRemaining}
              </div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                วันที่เหลือ
              </div>
            </div>

            {/* Right: progress bars + manage button */}
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
