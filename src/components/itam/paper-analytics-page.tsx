'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FileText, TrendingUp, Gauge, CalendarDays, Inbox, Coins, Building2 } from 'lucide-react'
import type { CostAnalyticsData, DashboardRangeKey } from './types'
import { DASHBOARD_RANGE_OPTIONS, formatBaht } from './types'

interface KpiProps {
  title: string
  value: string
  icon: React.ReactNode
  accent: string
  loading?: boolean
  hint?: string
}

function KpiCard({ title, value, icon, accent, loading, hint }: KpiProps) {
  return (
    <Card className="group relative overflow-hidden shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent to-black/[0.02] opacity-0 transition-opacity group-hover:opacity-100 dark:to-white/[0.03]"
      />
      <CardContent className="relative flex items-center gap-4 p-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105"
          style={{ background: `${accent}1a`, color: accent }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
            {title}
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-20 dark:bg-slate-800" />
          ) : (
            <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}</div>
          )}
          {hint && <div className="truncate text-xs text-slate-400 dark:text-slate-500">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

function formatMonthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-')
  const idx = Number(m) - 1
  if (idx < 0 || idx > 11) return yyyymm
  return `${THAI_MONTHS_SHORT[idx]} ${y}`
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400 dark:text-slate-500">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
        <Inbox className="h-6 w-6 text-slate-300 dark:text-slate-600" />
      </div>
      <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">{message}</div>
    </div>
  )
}

export function PaperAnalyticsPage() {
  const { theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const isDark = mounted && theme === 'dark'

  const [costRange, setCostRange] = React.useState<DashboardRangeKey>('month')

  const axisTickColor = '#64748b'
  const gridStroke = isDark ? '#334155' : '#e2e8f0'
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0'
  const tooltipBg = isDark ? '#0f172a' : '#ffffff'
  const tooltipFg = isDark ? '#e2e8f0' : '#1e293b'

  const { data: monthly, isLoading: monthlyLoading } = useQuery<
    Array<{ month: string; value: number }>
  >({
    queryKey: ['meter-monthly'],
    queryFn: async () => {
      const res = await fetch('/api/meter?aggregate=monthly')
      if (!res.ok) throw new Error('Failed to load monthly')
      const json = await res.json()
      return (json.monthly ?? []) as Array<{ month: string; value: number }>
    },
  })

  const { data: byDevice, isLoading: deviceLoading } = useQuery<
    Array<{ id: string; name: string; assetCode: string; value: number }>
  >({
    queryKey: ['meter-byDevice'],
    queryFn: async () => {
      const res = await fetch('/api/meter?aggregate=byDevice')
      if (!res.ok) throw new Error('Failed to load byDevice')
      const json = await res.json()
      return (json.byDevice ?? []) as Array<{
        id: string
        name: string
        assetCode: string
        value: number
      }>
    },
  })

  const { data: costData, isLoading: costLoading } = useQuery<CostAnalyticsData>({
    queryKey: ['cost-analytics', costRange],
    queryFn: async () => {
      const res = await fetch(`/api/cost-analytics?range=${costRange}`)
      if (!res.ok) throw new Error('Failed to load cost analytics')
      return res.json()
    },
  })

  const monthlyData = React.useMemo(
    () =>
      (monthly ?? [])
        .slice()
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((d) => ({ ...d, label: formatMonthLabel(d.month) })),
    [monthly],
  )

  const topDevices = React.useMemo(
    () => (byDevice ?? []).filter((d) => d.value > 0).slice(0, 8),
    [byDevice],
  )

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const thisMonthSheets = (monthly ?? [])
    .filter((m) => m.month === currentMonth)
    .reduce((sum, m) => sum + m.value, 0)
  const totalSheets = (monthly ?? []).reduce((sum, m) => sum + m.value, 0)
  const activeDeviceCount = (byDevice ?? []).filter((d) => d.value > 0).length
  const avgPerDevice = activeDeviceCount > 0
    ? Math.round(totalSheets / activeDeviceCount)
    : 0
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate()
  const projected =
    dayOfMonth > 0
      ? Math.round((thisMonthSheets / dayOfMonth) * daysInMonth)
      : 0

  const lineData = monthlyData.map((d) => ({ name: d.label, value: d.value }))
  const barData = topDevices.map((d) => ({ name: d.assetCode, value: d.value, full: d.name }))

  // Cost chart data — top 8 devices by cost
  const costBarData = React.useMemo(
    () =>
      (costData?.devices ?? [])
        .filter((d) => d.cost > 0)
        .slice(0, 8)
        .map((d) => ({
          name: d.assetCode,
          value: d.cost,
          full: d.name,
        })),
    [costData],
  )

  const totalCost = costData?.totalCost ?? 0
  const costActiveCount = (costData?.devices ?? []).filter((d) => d.cost > 0).length
  const avgCostPerDevice = costActiveCount > 0
    ? Math.round((totalCost / costActiveCount) * 100) / 100
    : 0

  const costRangeLabel =
    DASHBOARD_RANGE_OPTIONS.find((o) => o.value === costRange)?.label ?? 'เดือนนี้'

  const costTooltipFormatter = (v: number) => [formatBaht(v), 'ต้นทุนกระดาษ']

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">การใช้กระดาษ</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          วิเคราะห์การใช้งานกระดาษจากการจดมิเตอร์รายเดือน · คำนวณต้นทุนตามอัตราค่ากระดาษของแต่ละสาขา
        </p>
      </div>

      {/* Usage KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          title="ใช้เดือนนี้"
          value={`${thisMonthSheets.toLocaleString()} แผ่น`}
          icon={<FileText className="h-6 w-6" />}
          accent="#f97316"
          loading={monthlyLoading}
          hint={formatMonthLabel(currentMonth)}
        />
        <KpiCard
          title="เฉลี่ยต่อเครื่อง"
          value={`${avgPerDevice.toLocaleString()} แผ่น`}
          icon={<Gauge className="h-6 w-6" />}
          accent="#14b8a6"
          loading={deviceLoading}
          hint={`จาก ${activeDeviceCount} เครื่อง`}
        />
        <KpiCard
          title="คาดการณ์สิ้นเดือน"
          value={`${projected.toLocaleString()} แผ่น`}
          icon={<TrendingUp className="h-6 w-6" />}
          accent="#0d9488"
          loading={monthlyLoading}
          hint={`วันที่ ${dayOfMonth}/${daysInMonth}`}
        />
        <KpiCard
          title="รวมทั้งหมด"
          value={`${totalSheets.toLocaleString()} แผ่น`}
          icon={<CalendarDays className="h-6 w-6" />}
          accent="#0f172a"
          loading={monthlyLoading}
        />
      </div>

      {/* Line chart */}
      <Card className="dark:border-slate-800 dark:bg-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-slate-800 dark:text-slate-100">แนวโน้มการใช้กระดาษรายเดือน</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyLoading ? (
            <Skeleton className="h-72 w-full dark:bg-slate-800" />
          ) : lineData.length === 0 ? (
            <EmptyState message="ยังไม่มีข้อมูลการจดมิเตอร์" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: axisTickColor }} />
                <YAxis tick={{ fontSize: 12, fill: axisTickColor }} />
                <Tooltip
                  formatter={(v: number) => [`${v.toLocaleString()} แผ่น`, 'ใช้กระดาษ']}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: `1px solid ${tooltipBorder}`,
                    background: tooltipBg,
                    color: tooltipFg,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#f97316' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bar chart - top devices by sheets */}
      <Card className="dark:border-slate-800 dark:bg-slate-900">
        <CardHeader>
          <CardTitle className="text-base text-slate-800 dark:text-slate-100">อุปกรณ์ที่ใช้กระดาษมากที่สุด</CardTitle>
        </CardHeader>
        <CardContent>
          {deviceLoading ? (
            <Skeleton className="h-72 w-full dark:bg-slate-800" />
          ) : barData.length === 0 ? (
            <EmptyState message="ยังไม่มีข้อมูลการใช้งาน" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis type="number" tick={{ fontSize: 12, fill: axisTickColor }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fontSize: 11, fill: axisTickColor }}
                />
                <Tooltip
                  formatter={(v: number) => [`${v.toLocaleString()} แผ่น`, 'ใช้กระดาษ']}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as { full?: string } | undefined
                    return p?.full ?? ''
                  }}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: `1px solid ${tooltipBorder}`,
                    background: tooltipBg,
                    color: tooltipFg,
                  }}
                />
                <Bar dataKey="value" fill="#14b8a6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Cost analytics section */}
      <Card className="border-amber-200/60 dark:border-amber-800/40 dark:bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
            <Coins className="h-4 w-4 text-[#f97316]" />
            💰 ต้นทุนกระดาษ
            <span className="ml-2 text-xs font-normal text-slate-400 dark:text-slate-500">
              คำนวณจากอัตราค่ากระดาษรายสาขา × จำนวนแผ่นที่ใช้
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Range selector */}
          <div className="flex items-center justify-end">
            <Select value={costRange} onValueChange={(v) => setCostRange(v as DashboardRangeKey)}>
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
          </div>

          {/* Cost KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              title="ต้นทุนกระดาษ (ช่วง)"
              value={formatBaht(totalCost)}
              icon={<Coins className="h-6 w-6" />}
              accent="#f97316"
              loading={costLoading}
              hint={`ช่วง: ${costRangeLabel}`}
            />
            <KpiCard
              title="ต้นทุนเฉลี่ย/เครื่อง"
              value={formatBaht(avgCostPerDevice)}
              icon={<Gauge className="h-6 w-6" />}
              accent="#f59e0b"
              loading={costLoading}
              hint={`จาก ${costActiveCount} เครื่องที่ใช้งาน`}
            />
            <KpiCard
              title="จำนวนแผ่นรวม (ช่วง)"
              value={`${(costData?.totalSheets ?? 0).toLocaleString()} แผ่น`}
              icon={<FileText className="h-6 w-6" />}
              accent="#0d9488"
              loading={costLoading}
              hint={`ช่วง: ${costRangeLabel}`}
            />
          </div>

          {/* Cost bar chart — orange→amber gradient */}
          <div>
            <div className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              ต้นทุนตามอุปกรณ์ (8 อันดับแรก)
            </div>
            {costLoading ? (
              <Skeleton className="h-72 w-full dark:bg-slate-800" />
            ) : costBarData.length === 0 ? (
              <EmptyState message="ยังไม่มีข้อมูลต้นทุนในช่วงนี้" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={costBarData} layout="vertical">
                  <defs>
                    <linearGradient id="costBarFill" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#f97316" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.95} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: axisTickColor }}
                    tickFormatter={(v) =>
                      Number(v).toLocaleString('th-TH', {
                        notation: 'compact',
                      })
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fontSize: 11, fill: axisTickColor }}
                  />
                  <Tooltip
                    formatter={costTooltipFormatter}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload as { full?: string } | undefined
                      return p?.full ?? ''
                    }}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: `1px solid ${tooltipBorder}`,
                      background: tooltipBg,
                      color: tooltipFg,
                    }}
                  />
                  <Bar dataKey="value" fill="url(#costBarFill)" radius={[0, 6, 6, 0]}>
                    {costBarData.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill="url(#costBarFill)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Cost by site */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
              <Building2 className="h-4 w-4 text-[#0d9488]" />
              ต้นทุนตามสาขา
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {costLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={`cs-${i}`} className="h-20 dark:bg-slate-800" />
                ))
              ) : (costData?.bySite ?? []).length === 0 ? (
                <div className="col-span-full">
                  <EmptyState message="ยังไม่มีข้อมูลต้นทุนตามสาขา" />
                </div>
              ) : (
                (costData?.bySite ?? []).map((s) => (
                  <div
                    key={s.site}
                    className="rounded-md border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                        <Building2 className="h-3.5 w-3.5 text-[#0d9488]" />
                        {s.site}
                      </div>
                    </div>
                    <div className="mt-1 text-lg font-bold tabular-nums text-[#f97316]">
                      {formatBaht(s.cost)}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {s.sheets.toLocaleString()} แผ่น
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
