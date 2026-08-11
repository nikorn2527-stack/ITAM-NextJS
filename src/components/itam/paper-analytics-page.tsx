'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
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
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, TrendingUp, Gauge, CalendarDays } from 'lucide-react'

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
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${accent}1a`, color: accent }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-slate-500">
            {title}
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-20" />
          ) : (
            <div className="text-xl font-bold text-slate-800">{value}</div>
          )}
          {hint && <div className="truncate text-xs text-slate-400">{hint}</div>}
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

export function PaperAnalyticsPage() {
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

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">การใช้กระดาษ</h1>
        <p className="text-sm text-slate-500">
          วิเคราะห์การใช้งานกระดาษจากการจดมิเตอร์รายเดือน
        </p>
      </div>

      {/* KPIs */}
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
          accent="#0ea5e9"
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">แนวโน้มการใช้กระดาษรายเดือน</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : lineData.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">
              ยังไม่มีข้อมูลการจดมิเตอร์
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={lineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(v: number) => [`${v.toLocaleString()} แผ่น`, 'ใช้กระดาษ']}
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

      {/* Bar chart - top devices */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">อุปกรณ์ที่ใช้กระดาษมากที่สุด</CardTitle>
        </CardHeader>
        <CardContent>
          {deviceLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : barData.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">
              ยังไม่มีข้อมูลการใช้งาน
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(v: number) => [`${v.toLocaleString()} แผ่น`, 'ใช้กระดาษ']}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as { full?: string } | undefined
                    return p?.full ?? ''
                  }}
                />
                <Bar dataKey="value" fill="#14b8a6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
