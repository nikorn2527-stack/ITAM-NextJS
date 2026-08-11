'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Package, CheckCircle2, Wrench, FileText, TrendingUp, Building2, FileDown, Flame, BarChart3, Trophy } from 'lucide-react'

interface SiteRow { siteCode: string; siteName: string | null; deviceCount: number; activeCount: number; paperSheets: number }
interface DashboardData {
  totals: { total: number; active: number; inactive: number; spare: number; repair: number }
  byType: Array<{ name: string; value: number }>
  bySite: SiteRow[]
  paperThisMonth: number
  meterRequiredCount: number
  recentActivity: Array<{
    id: string; assetNo: string; deviceName: string
    readingDate: string; pagesBw: number; pagesColor: number; remark: string | null
  }>
  heatmap: Array<{ assetNo: string; deviceName: string; months: Array<{ month: string; pages: number }> }>
  heatmapMonths: string[]
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

const MEDALS = ['🥇', '🥈', '🥉']

function heatColor(intensity: number): string {
  // 0..1 → teal intensity, low→light, high→dark
  const i = Math.max(0, Math.min(1, intensity))
  // rgba teal (#0d9488) with variable alpha
  const alpha = 0.08 + i * 0.85
  return `rgba(13, 148, 136, ${alpha.toFixed(2)})`
}

export function ItamDashboard() {
  const [sitesOpen, setSitesOpen] = React.useState(false)
  const [heatOpen, setHeatOpen] = React.useState(false)
  const [cycleOpen, setCycleOpen] = React.useState(false)

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['itam-dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/itam/dashboard')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })

  const { data: heatData, isLoading: heatLoading } = useQuery<DashboardData>({
    queryKey: ['itam-dashboard-extra'],
    queryFn: async () => {
      const res = await fetch('/api/itam/dashboard?extra=1')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    enabled: heatOpen,
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
        <div class="kpi"><div class="label">จำนวนสาขา</div><div class="value">${bySite.length}<span class="unit">สาขา</span></div></div>
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

  // Heatmap data
  const heat = heatData?.heatmap ?? []
  const heatMonths = heatData?.heatmapMonths ?? []
  const maxPages = React.useMemo(() => {
    let m = 0
    for (const r of heat) for (const c of r.months) if (c.pages > m) m = c.pages
    return m || 1
  }, [heat])

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">ITAM Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ข้อมูลจริงจาก Database
            {data && <span className="ml-2 text-xs text-emerald-600">⚡ {data.queryTimeMs}ms</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportPdf} className="dark:bg-slate-800 dark:border-slate-700">
            <FileDown className="h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSitesOpen(true)} className="dark:bg-slate-800 dark:border-slate-700">
            <Building2 className="h-4 w-4" /> สาขา
          </Button>
          <Button variant="outline" size="sm" onClick={() => setHeatOpen(true)} className="dark:bg-slate-800 dark:border-slate-700">
            <Flame className="h-4 w-4" /> Heatmap
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCycleOpen(true)} className="dark:bg-slate-800 dark:border-slate-700">
            <BarChart3 className="h-4 w-4" /> รอบ
          </Button>
        </div>
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
              <Skeleton className="h-64 w-full" />
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
                      <Badge className="border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300">
                        {s.deviceCount} เครื่อง
                      </Badge>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded bg-gradient-to-r from-orange-400 to-orange-600" style={{ width: `${pct}%` }} />
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
            <Skeleton className="h-72 w-full" />
          ) : heat.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">ยังไม่มีข้อมูล</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-50/80 px-2 py-1.5 text-left text-slate-600 dark:bg-slate-900/80 dark:text-slate-300">อุปกรณ์</th>
                    {heatMonths.map(m => (
                      <th key={m} className="px-2 py-1.5 text-center font-mono text-slate-500">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heat.map(row => (
                    <tr key={row.assetNo}>
                      <td className="sticky left-0 z-10 max-w-[180px] truncate bg-slate-50/80 px-2 py-1 text-slate-700 dark:bg-slate-900/80 dark:text-slate-200" title={row.deviceName}>
                        <span className="font-mono text-[10px] text-slate-400">{row.assetNo}</span>
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
                            title={`${row.assetNo} · ${c.month}: ${c.pages.toLocaleString()} แผ่น`}
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

      {/* Cycle placeholder modal */}
      <Dialog open={cycleOpen} onOpenChange={setCycleOpen}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <BarChart3 className="h-5 w-5 text-[#f97316]" /> รายงานตามรอบ
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center dark:border-slate-700 dark:bg-slate-800/40">
            <BarChart3 className="mx-auto h-10 w-10 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">ยังไม่มีข้อมูลรอบ</p>
            <p className="mt-1 text-xs text-slate-400">ระบบยังไม่มีตาราง Cycles — เพิ่มได้ในขั้นตอนถัดไป</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
