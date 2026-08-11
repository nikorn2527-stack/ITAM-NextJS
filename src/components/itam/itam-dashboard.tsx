'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Package, CheckCircle2, Wrench, FileText, TrendingUp, Building2 } from 'lucide-react'

interface DashboardData {
  totals: { total: number; active: number; inactive: number; spare: number; repair: number }
  byType: Array<{ name: string; value: number }>
  bySite: Array<{ siteCode: string; siteName: string; deviceCount: number }>
  paperThisMonth: number
  meterRequiredCount: number
  recentActivity: Array<{
    id: string; assetNo: string; deviceName: string
    readingDate: string; pagesBw: number; pagesColor: number; remark: string | null
  }>
  queryTimeMs: number
}

function KpiCard({ title, value, icon, accent, loading }: {
  title: string; value: number; icon: React.ReactNode; accent: string; loading?: boolean
}) {
  return (
    <Card className="relative overflow-hidden shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11" style={{ background: `${accent}1a`, color: accent }}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{title}</div>
            {loading ? (
              <Skeleton className="mt-1 h-7 w-20" />
            ) : (
              <div className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100 sm:text-2xl">
                {value.toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function ItamDashboard() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['itam-dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/itam/dashboard')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">ITAM Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          ข้อมูลจริงจาก Database
          {data && <span className="ml-2 text-xs text-emerald-600">⚡ {data.queryTimeMs}ms</span>}
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <KpiCard title="อุปกรณ์ทั้งหมด" value={data?.totals.total ?? 0} icon={<Package className="h-5 w-5" />} accent="#0f172a" loading={isLoading} />
        <KpiCard title="ใช้งานอยู่" value={data?.totals.active ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} accent="#10b981" loading={isLoading} />
        <KpiCard title="สำรอง" value={data?.totals.spare ?? 0} icon={<Package className="h-5 w-5" />} accent="#f59e0b" loading={isLoading} />
        <KpiCard title="ส่งซ่อม" value={data?.totals.repair ?? 0} icon={<Wrench className="h-5 w-5" />} accent="#f97316" loading={isLoading} />
        <KpiCard title="ต้องจดมิเตอร์" value={data?.meterRequiredCount ?? 0} icon={<FileText className="h-5 w-5" />} accent="#0d9488" loading={isLoading} />
      </div>

      {/* By Type + By Site */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CardHeader><CardTitle className="text-base">จำนวนอุปกรณ์ตามประเภท</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-2">
                {(data?.byType ?? []).map((t) => {
                  const max = Math.max(...(data?.byType ?? []).map(x => x.value), 1)
                  const pct = (t.value / max) * 100
                  return (
                    <div key={t.name} className="flex items-center gap-3">
                      <span className="w-40 truncate text-sm text-slate-600 dark:text-slate-300">{t.name}</span>
                      <div className="h-6 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                        <div className="flex h-full items-center justify-end rounded bg-gradient-to-r from-teal-400 to-teal-600 px-2 text-xs font-bold text-white" style={{ width: `${pct}%` }}>
                          {t.value}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-[#f97316]" /> อุปกรณ์ตามสาขา</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <div className="space-y-2">
                {(data?.bySite ?? []).map((s) => (
                  <div key={s.siteCode} className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 dark:border-slate-800">
                    <div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.siteCode}</span>
                      <span className="ml-2 text-xs text-slate-400">{s.siteName}</span>
                    </div>
                    <Badge className="border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300">
                      {s.deviceCount} เครื่อง
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-[#f97316]" /> มิเตอร์ล่าสุด</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="space-y-2">
              {(data?.recentActivity ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{a.deviceName}</div>
                    <div className="text-xs text-slate-400">{a.assetNo} · {a.readingDate}</div>
                  </div>
                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {(a.pagesBw + a.pagesColor).toLocaleString()} แผ่น
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
