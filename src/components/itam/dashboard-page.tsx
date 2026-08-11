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
}

function KpiCard({ title, value, icon, accent, loading }: KpiCardProps) {
  return (
    <Card className="overflow-hidden">
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
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <div className="text-2xl font-bold text-slate-800">
              {value.toLocaleString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
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

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Page header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">ภาพรวมระบบจัดการอุปกรณ์ IT</p>
        </div>
        <div className="flex items-center gap-2">
          {data && data.totals.total === 0 && (
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

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          title="อุปกรณ์ทั้งหมด"
          value={data?.totals.total ?? 0}
          icon={<Package className="h-6 w-6" />}
          accent="#0f172a"
          loading={isLoading}
        />
        <KpiCard
          title="ใช้งานอยู่"
          value={data?.totals.active ?? 0}
          icon={<CheckCircle2 className="h-6 w-6" />}
          accent="#10b981"
          loading={isLoading}
        />
        <KpiCard
          title="สำรอง"
          value={data?.totals.spare ?? 0}
          icon={<Archive className="h-6 w-6" />}
          accent="#f59e0b"
          loading={isLoading}
        />
        <KpiCard
          title="ส่งซ่อม"
          value={data?.totals.repair ?? 0}
          icon={<Wrench className="h-6 w-6" />}
          accent="#f97316"
          loading={isLoading}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">สัดส่วนสถานะอุปกรณ์</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={data?.byStatus ?? []}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {(data?.byStatus ?? []).map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={STATUS_COLORS[entry.name] ?? '#94a3b8'}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [value, name]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">จำนวนอุปกรณ์ตามประเภท</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data?.byType ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#f97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-[#f97316]" />
              Top อุปกรณ์ตามการใช้งานกระดาษ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="itam-scroll max-h-72 overflow-y-auto">
              {(data?.topUsage ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  ยังไม่มีข้อมูลการใช้งาน
                </p>
              ) : (
                <ul className="space-y-2">
                  {(data?.topUsage ?? []).map((d, i) => (
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
                          <div className="truncate text-xs text-slate-400">
                            {d.assetCode}
                          </div>
                        </div>
                      </div>
                      <Badge className="border-[#f97316]/30 bg-[#f97316]/10 text-[#f97316]">
                        {d.value.toLocaleString()} แผ่น
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-[#f97316]" />
              กิจกรรมล่าสุด (จดมิเตอร์)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="itam-scroll max-h-72 overflow-y-auto">
              {(data?.recentActivity ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  ยังไม่มีกิจกรรม
                </p>
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
                        <span className="text-slate-400">{a.assetCode}</span>
                        <span>·</span>
                        <span>อ่าน {a.reading.toLocaleString()}</span>
                        {a.delta > 0 && (
                          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
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
