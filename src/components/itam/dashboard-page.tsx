'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
} from 'lucide-react'
import type { DashboardData } from './types'

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
  const display = format ? format(value) : value.toLocaleString()
  return (
    <Card
      className="group relative overflow-hidden shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      {/* Thin top accent bar */}
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: accent }}
      />
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105 sm:h-11 sm:w-11"
            style={{ background: `${accent}1a`, color: accent }}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-slate-500">
              {title}
            </div>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-20" />
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-bold tabular-nums leading-tight text-slate-800 sm:text-2xl">
                  {display}
                </span>
                {unit && (
                  <span className="shrink-0 text-xs font-medium text-slate-400">
                    {unit}
                  </span>
                )}
              </div>
            )}
            {trend && !loading && (
              <div className="mt-0.5 truncate text-xs leading-tight text-slate-400" title={trend}>
                {trend}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400">
      <Inbox className="h-8 w-8 text-slate-300" />
      <span className="text-sm">{message}</span>
    </div>
  )
}

export function DashboardPage() {
  const qc = useQueryClient()
  const [seeding, setSeeding] = React.useState(false)

  const { data, isLoading, isError, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error('Failed to load dashboard')
      return res.json()
    },
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
            <p className="text-sm text-rose-600">
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

  const activeTrend =
    total > 0
      ? `${Math.round((active / total) * 100)}% ของทั้งหมด ${total} เครื่อง`
      : undefined

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Page header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">ภาพรวมระบบจัดการอุปกรณ์ IT</p>
        </div>
        <div className="flex items-center gap-2">
          {data && total === 0 && (
            <Button
              onClick={runSeed}
              disabled={seeding}
              variant="outline"
              className="border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10"
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              {seeding ? 'กำลังโหลด...' : 'โหลดข้อมูลตัวอย่าง'}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            🔄 รีเฟรช
          </Button>
        </div>
      </div>

      {seeding && (
        <Card className="border-[#f97316]/40 bg-[#f97316]/5">
          <CardContent className="p-4 text-sm text-[#f97316]">
            กำลังโหลดข้อมูลตัวอย่าง... กรุณารอสักครู่
          </CardContent>
        </Card>
      )}

      {/* KPI row — 5 cards on lg */}
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
          title="กระดาษเดือนนี้"
          value={paperThisMonth}
          icon={<FileText className="h-5 w-5" />}
          accent="#0d9488"
          loading={isLoading}
          unit="แผ่น"
          trend={
            new Date().toLocaleDateString('th-TH', {
              month: 'long',
              year: 'numeric',
            })
          }
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-sm transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle className="text-base">สัดส่วนสถานะอุปกรณ์</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
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
                              className="fill-slate-800"
                              style={{
                                fontSize: 26,
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {total}
                            </text>
                            <text
                              x={cx}
                              y={cy + 16}
                              textAnchor="middle"
                              dominantBaseline="central"
                              className="fill-slate-400"
                              style={{ fontSize: 12 }}
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
                  />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle className="text-base">จำนวนอุปกรณ์ตามประเภท</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
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
                    stroke="#e2e8f0"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <Tooltip
                    cursor={{ fill: '#0d948810' }}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
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
        <Card className="shadow-sm transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
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
                        className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f97316] text-xs font-bold text-white">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-700">
                              {d.name}
                            </div>
                            <div className="truncate font-mono text-xs text-slate-400">
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

        <Card className="shadow-sm transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
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
                      className="rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-700">
                          {a.deviceName}
                        </span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {a.date}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono text-slate-400">
                          {a.assetCode}
                        </span>
                        <span>·</span>
                        <span className="tabular-nums">
                          อ่าน {a.reading.toLocaleString()}
                        </span>
                        {a.delta > 0 && (
                          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 tabular-nums">
                            +{a.delta.toLocaleString()}
                          </Badge>
                        )}
                        {a.remark && (
                          <span className="truncate text-amber-600">
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
