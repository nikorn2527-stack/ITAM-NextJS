'use client'

// ============================================================
// MonthlyReport — รีพอร์ตรายเดือน (Task ID: PRINT-REPORT, PART 2)
// ============================================================
// Fetches GET /api/reports/monthly?month=YYYY-MM&site=&type=...
// and renders:
//   • Month selector + optional site filter + report-type tabs
//   • Summary cards (total WO / completed / avg rating / stock moves)
//   • Charts (status pie, priority bar, subject bar, staff bar)
//   • Tables (top items, low stock, staff performance)
//   • Print button + CSV export
// ============================================================

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { motion } from 'framer-motion'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  Wrench,
  CheckCircle2,
  Star,
  Package,
  TrendingUp,
  TrendingDown,
  Printer,
  Download,
  RefreshCw,
  CalendarDays,
  Building2,
  AlertTriangle,
  Users,
  Cpu,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────
type ReportType = 'work-order' | 'stock' | 'devices' | 'all'

interface WorkOrderSummary {
  total: number
  byStatus: Record<string, number>
  byPriority: Record<string, number>
  bySubject: Array<{ subject: string; count: number }>
  avgResponseTimeMin: number | null
  avgRating: number | null
  byStaff: Array<{ name: string; count: number; completed: number }>
}

interface StockSummary {
  totalIn: number
  totalOut: number
  topItems: Array<{
    productName: string
    productCode: string | null
    quantity: number
    type: string
  }>
  lowStockItems: Array<{
    productCode: string
    productName: string
    quantity: number
    minQuantity: number
    unit: string
  }>
  totalValue: number
}

interface DeviceSummary {
  total: number
  newDevices: number
  byStatus: Record<string, number>
}

interface MonthlyReportData {
  month: string
  range: { start: string; end: string }
  generatedAt: string
  filters: { site: string | null; type: ReportType }
  workOrders: WorkOrderSummary | null
  stock: StockSummary | null
  devices: DeviceSummary | null
  meta: { avgResponseTimeLabel: string }
}

interface Site {
  id: string
  code: string
  name: string
}

// ── Constants ──────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  IN_PROGRESS: 'กำลังซ่อม',
  WAITING_PARTS: 'รออะไหล่',
  COMPLETED: 'เสร็จแล้ว',
  CANCELLED: 'ยกเลิก',
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b',
  IN_PROGRESS: '#3b82f6',
  WAITING_PARTS: '#a855f7',
  COMPLETED: '#10b981',
  CANCELLED: '#f43f5e',
}

const PRIORITY_COLORS: Record<string, string> = {
  ปกติ: '#94a3b8',
  ปานกลาง: '#f59e0b',
  สูง: '#f97316',
  ด่วน: '#ef4444',
}

const STATUS_LABELS_DEV: Record<string, string> = {
  Active: 'ใช้งานอยู่',
  'In Repair': 'ส่งซ่อม',
  Retired: 'ปลดระวาง',
  Spare: 'สำรอง',
  Inactive: 'ไม่ใช้งาน',
}

const DEVICE_STATUS_COLORS: Record<string, string> = {
  Active: '#10b981',
  'In Repair': '#f97316',
  Retired: '#6b7280',
  Spare: '#f59e0b',
  Inactive: '#ef4444',
}

function currentMonthValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(month: string): string {
  try {
    const [y, m] = month.split('-')
    const d = new Date(Number(y), Number(m) - 1, 1)
    return d.toLocaleDateString('th-TH', {
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return month
  }
}

function formatBaht(value: number): string {
  return `฿${value.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// ── Component ──────────────────────────────────────────
export function MonthlyReport() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const chartTextColor = isDark ? '#cbd5e1' : '#475569'
  const chartGridColor = isDark ? '#334155' : '#e2e8f0'

  const [month, setMonth] = React.useState(currentMonthValue())
  const [site, setSite] = React.useState<string>('all')
  const [reportType, setReportType] = React.useState<ReportType>('all')

  // ── Fetch sites for the filter ──
  const { data: sitesData } = useQuery<Site[]>({
    queryKey: ['sites-list'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/sites')
        if (!res.ok) return []
        const json = await res.json()
        return (json.sites as Site[]) ?? []
      } catch {
        return []
      }
    },
    staleTime: 60_000,
  })
  const sites: Site[] = sitesData ?? []

  // ── Fetch the report ──
  const params = new URLSearchParams({
    month,
    type: reportType,
  })
  if (site !== 'all') params.set('site', site)

  const { data, isLoading, isFetching, refetch, error } =
    useQuery<MonthlyReportData>({
      queryKey: ['monthly-report', month, site, reportType],
      queryFn: async () => {
        const res = await fetch(`/api/reports/monthly?${params.toString()}`)
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? 'โหลดรายงานไม่สำเร็จ')
        }
        const json = await res.json()
        return json as MonthlyReportData
      },
      staleTime: 30_000,
    })

  React.useEffect(() => {
    if (error) {
      toast.error(
        error instanceof Error ? error.message : 'โหลดรายงานไม่สำเร็จ',
      )
    }
  }, [error])

  // ── Print ──
  function handlePrint() {
    window.print()
  }

  // ── CSV export ──
  function handleExportCSV() {
    if (!data) return
    const rows: string[][] = []
    rows.push(['รายงานรายเดือน', formatMonthLabel(data.month)])
    rows.push(['สาขา', site === 'all' ? 'ทั้งหมด' : site])
    rows.push(['ประเภท', reportType])
    rows.push(['สร้างเมื่อ', new Date(data.generatedAt).toLocaleString('th-TH')])
    rows.push([])

    if (data.workOrders) {
      rows.push(['==== ใบงาน ===='])
      rows.push(['ทั้งหมด', String(data.workOrders.total)])
      rows.push(['สถานะ', 'จำนวน'])
      for (const [k, v] of Object.entries(data.workOrders.byStatus)) {
        rows.push([STATUS_LABELS[k] ?? k, String(v)])
      }
      rows.push(['ความเร่งด่วน', 'จำนวน'])
      for (const [k, v] of Object.entries(data.workOrders.byPriority)) {
        rows.push([k, String(v)])
      }
      rows.push(['คะแนนเฉลี่ย', String(data.workOrders.avgRating ?? '-')])
      rows.push(['เวลาตอบเฉลี่ย', data.meta.avgResponseTimeLabel])
      rows.push([])
      rows.push(['หัวข้อยอดนิยม', 'จำนวน'])
      for (const s of data.workOrders.bySubject) {
        rows.push([s.subject, String(s.count)])
      }
      rows.push([])
      rows.push(['ช่าง', 'รับ', 'เสร็จ'])
      for (const s of data.workOrders.byStaff) {
        rows.push([s.name, String(s.count), String(s.completed)])
      }
      rows.push([])
    }

    if (data.stock) {
      rows.push(['==== สต็อก ===='])
      rows.push(['รับเข้า', String(data.stock.totalIn)])
      rows.push(['เบิกออก', String(data.stock.totalOut)])
      rows.push(['มูลค่ารวม', formatBaht(data.stock.totalValue)])
      rows.push([])
      rows.push(['รายการยอดนิยม', 'รหัส', 'จำนวน', 'ประเภท'])
      for (const t of data.stock.topItems) {
        rows.push([
          t.productName,
          t.productCode ?? '',
          String(t.quantity),
          t.type,
        ])
      }
      rows.push([])
      rows.push(['รายการของเหลือน้อย', 'รหัส', 'คงเหลือ', 'ขั้นต่ำ', 'หน่วย'])
      for (const l of data.stock.lowStockItems) {
        rows.push([
          l.productName,
          l.productCode,
          String(l.quantity),
          String(l.minQuantity),
          l.unit,
        ])
      }
      rows.push([])
    }

    if (data.devices) {
      rows.push(['==== อุปกรณ์ ===='])
      rows.push(['ทั้งหมด', String(data.devices.total)])
      rows.push(['เพิ่มใหม่ในเดือนนี้', String(data.devices.newDevices)])
      rows.push(['สถานะ', 'จำนวน'])
      for (const [k, v] of Object.entries(data.devices.byStatus)) {
        rows.push([STATUS_LABELS_DEV[k] ?? k, String(v)])
      }
      rows.push([])
    }

    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell ?? '')
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
              return `"${s.replace(/"/g, '""')}"`
            }
            return s
          })
          .join(','),
      )
      .join('\n')
    // Prepend BOM so Excel reads Thai correctly
    const blob = new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `monthly-report-${data.month}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('ส่งออก CSV เรียบร้อย')
  }

  const wo = data?.workOrders ?? null
  const stock = data?.stock ?? null
  const devices = data?.devices ?? null

  return (
    <div className="print-area space-y-4 p-4 md:p-6">
      {/* === Header / Controls === */}
      <Card className="print-hide shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <CalendarDays className="h-5 w-5 text-orange-500" />
                รายงานรายเดือน
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                สรุปผลการทำงานรายเดือน — ใบงาน, สต็อก, และอุปกรณ์
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
                className="h-8"
              >
                <RefreshCw
                  className={`mr-1 h-3.5 w-3.5 ${
                    isFetching ? 'animate-spin' : ''
                  }`}
                />
                รีเฟรช
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handlePrint}
                disabled={!data}
                className="h-8"
              >
                <Printer className="mr-1 h-3.5 w-3.5" />
                พิมพ์
              </Button>
              <Button
                size="sm"
                onClick={handleExportCSV}
                disabled={!data}
                className="h-8 bg-orange-500 hover:bg-orange-600"
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="mr-month" className="text-xs">
                เดือน
              </Label>
              <Input
                id="mr-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value || currentMonthValue())}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mr-site" className="text-xs">
                สาขา (ไม่บังคับ)
              </Label>
              <Select value={site} onValueChange={setSite}>
                <SelectTrigger id="mr-site" className="h-9">
                  <SelectValue placeholder="ทุกสาขา" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกสาขา</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.code}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ประเภทรายงาน</Label>
              <Tabs
                value={reportType}
                onValueChange={(v) => setReportType(v as ReportType)}
              >
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
                  <TabsTrigger value="work-order">ใบงาน</TabsTrigger>
                  <TabsTrigger value="stock">สต็อก</TabsTrigger>
                  <TabsTrigger value="devices">อุปกรณ์</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
          {data && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="gap-1">
                <CalendarDays className="h-3 w-3" />
                {formatMonthLabel(data.month)}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Building2 className="h-3 w-3" />
                {site === 'all' ? 'ทุกสาขา' : `สาขา ${site}`}
              </Badge>
              <span className="text-[11px]">
                สร้างเมื่อ {new Date(data.generatedAt).toLocaleString('th-TH')}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <ReportSkeleton />
      ) : !data ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            ไม่สามารถโหลดรายงานได้
          </CardContent>
        </Card>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="space-y-4"
        >
          {/* === Summary cards === */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {wo && (
              <>
                <SummaryCard
                  title="ใบงานทั้งหมด"
                  value={String(wo.total)}
                  icon={<Wrench className="h-5 w-5" />}
                  accent="#f97316"
                  hint={`เดือน ${formatMonthLabel(data.month)}`}
                />
                <SummaryCard
                  title="เสร็จแล้ว"
                  value={String(wo.byStatus.COMPLETED ?? 0)}
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  accent="#10b981"
                  hint={`${
                    wo.total > 0
                      ? Math.round(
                          ((wo.byStatus.COMPLETED ?? 0) / wo.total) * 100,
                        )
                      : 0
                  }% ของทั้งหมด`}
                />
                <SummaryCard
                  title="คะแนนเฉลี่ย"
                  value={wo.avgRating !== null ? wo.avgRating.toFixed(2) : '—'}
                  icon={<Star className="h-5 w-5" />}
                  accent="#f59e0b"
                  hint="จากการรีวิว"
                />
                <SummaryCard
                  title="เวลาตอบเฉลี่ย"
                  value={data.meta.avgResponseTimeLabel}
                  icon={<RefreshCw className="h-5 w-5" />}
                  accent="#3b82f6"
                  hint="แจ้ง → มอบหมาย"
                />
              </>
            )}
            {stock && (
              <>
                <SummaryCard
                  title="รับเข้า"
                  value={String(stock.totalIn)}
                  icon={<TrendingUp className="h-5 w-5" />}
                  accent="#10b981"
                  hint="หน่วยรวม"
                />
                <SummaryCard
                  title="เบิกออก"
                  value={String(stock.totalOut)}
                  icon={<TrendingDown className="h-5 w-5" />}
                  accent="#ef4444"
                  hint="หน่วยรวม"
                />
                <SummaryCard
                  title="มูลค่าสต็อก"
                  value={formatBaht(stock.totalValue)}
                  icon={<Package className="h-5 w-5" />}
                  accent="#0d9488"
                  hint="รวมทุกสาขาที่เลือก"
                />
                <SummaryCard
                  title="ของเหลือน้อย"
                  value={String(stock.lowStockItems.length)}
                  icon={<AlertTriangle className="h-5 w-5" />}
                  accent="#f59e0b"
                  hint="ต่ำกว่าขั้นต่ำ"
                />
              </>
            )}
            {devices && (
              <>
                <SummaryCard
                  title="อุปกรณ์ทั้งหมด"
                  value={String(devices.total)}
                  icon={<Cpu className="h-5 w-5" />}
                  accent="#6366f1"
                  hint="ในระบบ"
                />
                <SummaryCard
                  title="เพิ่มใหม่"
                  value={String(devices.newDevices)}
                  icon={<TrendingUp className="h-5 w-5" />}
                  accent="#10b981"
                  hint={`เดือน ${formatMonthLabel(data.month)}`}
                />
              </>
            )}
          </div>

          {/* === Work Order charts === */}
          {wo && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Card className="print-break-avoid shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    ใบงานตามสถานะ
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(wo.byStatus)
                            .filter(([, v]) => v > 0)
                            .map(([k, v]) => ({
                              name: STATUS_LABELS[k] ?? k,
                              value: v,
                              key: k,
                            }))}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={(entry: { name?: string; value?: number }) =>
                            `${entry.name ?? ''}: ${entry.value ?? 0}`
                          }
                          labelLine={false}
                        >
                          {Object.entries(wo.byStatus)
                            .filter(([, v]) => v > 0)
                            .map(([k]) => (
                              <Cell
                                key={k}
                                fill={STATUS_COLORS[k] ?? '#94a3b8'}
                              />
                            ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? '#1e293b' : '#fff',
                            border: `1px solid ${chartGridColor}`,
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="print-break-avoid shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    ใบงานตามความเร่งด่วน
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={Object.entries(wo.byPriority).map(
                          ([k, v]) => ({ name: k, value: v, key: k }),
                        )}
                        margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={chartGridColor}
                        />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: chartTextColor, fontSize: 12 }}
                        />
                        <YAxis
                          tick={{ fill: chartTextColor, fontSize: 12 }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          cursor={{ fill: isDark ? '#1e293b66' : '#f1f5f9' }}
                          contentStyle={{
                            backgroundColor: isDark ? '#1e293b' : '#fff',
                            border: `1px solid ${chartGridColor}`,
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {Object.entries(wo.byPriority).map(([k]) => (
                            <Cell
                              key={k}
                              fill={PRIORITY_COLORS[k] ?? '#94a3b8'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="print-break-avoid shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    หัวข้อยอดนิยม (Top 10)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {wo.bySubject.length === 0 ? (
                    <EmptyHint label="ยังไม่มีข้อมูลหัวข้อในเดือนนี้" />
                  ) : (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          layout="vertical"
                          data={wo.bySubject}
                          margin={{
                            top: 8,
                            right: 16,
                            left: 0,
                            bottom: 8,
                          }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={chartGridColor}
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            tick={{ fill: chartTextColor, fontSize: 12 }}
                            allowDecimals={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="subject"
                            tick={{ fill: chartTextColor, fontSize: 11 }}
                            width={120}
                            tickFormatter={(s: string) =>
                              s.length > 16 ? s.slice(0, 16) + '…' : s
                            }
                          />
                          <Tooltip
                            cursor={{ fill: isDark ? '#1e293b66' : '#f1f5f9' }}
                            contentStyle={{
                              backgroundColor: isDark ? '#1e293b' : '#fff',
                              border: `1px solid ${chartGridColor}`,
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                          <Bar
                            dataKey="count"
                            fill="#f97316"
                            radius={[0, 6, 6, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="print-break-avoid shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    ผลงานช่าง (รับ / เสร็จ)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {wo.byStaff.length === 0 ? (
                    <EmptyHint label="ยังไม่มีข้อมูลการมอบหมายในเดือนนี้" />
                  ) : (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={wo.byStaff.slice(0, 10)}
                          margin={{
                            top: 8,
                            right: 16,
                            left: 0,
                            bottom: 8,
                          }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={chartGridColor}
                          />
                          <XAxis
                            dataKey="name"
                            tick={{ fill: chartTextColor, fontSize: 10 }}
                            tickFormatter={(s: string) =>
                              s.length > 10 ? s.slice(0, 10) + '…' : s
                            }
                          />
                          <YAxis
                            tick={{ fill: chartTextColor, fontSize: 12 }}
                            allowDecimals={false}
                          />
                          <Tooltip
                            cursor={{ fill: isDark ? '#1e293b66' : '#f1f5f9' }}
                            contentStyle={{
                              backgroundColor: isDark ? '#1e293b' : '#fff',
                              border: `1px solid ${chartGridColor}`,
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar
                            dataKey="count"
                            name="รับ"
                            fill="#3b82f6"
                            radius={[6, 6, 0, 0]}
                          />
                          <Bar
                            dataKey="completed"
                            name="เสร็จ"
                            fill="#10b981"
                            radius={[6, 6, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* === Staff performance table === */}
          {wo && wo.byStaff.length > 0 && (
            <Card className="print-break-avoid shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-orange-500" />
                  ตารางผลงานช่าง
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted">
                      <TableRow>
                        <TableHead>ช่าง</TableHead>
                        <TableHead className="text-right">รับ</TableHead>
                        <TableHead className="text-right">เสร็จ</TableHead>
                        <TableHead className="text-right">
                          %เสร็จ
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wo.byStaff.map((s) => (
                        <TableRow key={s.name}>
                          <TableCell className="font-medium">
                            {s.name}
                          </TableCell>
                          <TableCell className="text-right">
                            {s.count}
                          </TableCell>
                          <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                            {s.completed}
                          </TableCell>
                          <TableCell className="text-right">
                            {s.count > 0
                              ? Math.round((s.completed / s.count) * 100)
                              : 0}
                            %
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* === Stock tables === */}
          {stock && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Card className="print-break-avoid shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    รายการสต็อกยอดนิยม (เดือนนี้)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stock.topItems.length === 0 ? (
                    <EmptyHint label="ยังไม่มีรายการเคลื่อนไหวในเดือนนี้" />
                  ) : (
                    <div className="max-h-80 overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader className="sticky top-0 bg-muted">
                          <TableRow>
                            <TableHead>สินค้า</TableHead>
                            <TableHead>รหัส</TableHead>
                            <TableHead>ประเภท</TableHead>
                            <TableHead className="text-right">จำนวน</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stock.topItems.map((t, idx) => (
                            <TableRow key={`${t.productCode ?? ''}-${idx}`}>
                              <TableCell className="font-medium">
                                {t.productName}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {t.productCode ?? '—'}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    t.type === 'IN'
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                      : t.type === 'OUT'
                                        ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                        : ''
                                  }
                                >
                                  {t.type === 'IN'
                                    ? 'รับเข้า'
                                    : t.type === 'OUT'
                                      ? 'เบิกออก'
                                      : t.type === 'ADJUST'
                                        ? 'ปรับปรุง'
                                        : t.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {t.quantity}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="print-break-avoid shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    รายการของเหลือน้อย
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stock.lowStockItems.length === 0 ? (
                    <EmptyHint label="ไม่มีรายการที่ต่ำกว่าขั้นต่ำ — เยี่ยม!" />
                  ) : (
                    <div className="max-h-80 overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader className="sticky top-0 bg-muted">
                          <TableRow>
                            <TableHead>สินค้า</TableHead>
                            <TableHead>รหัส</TableHead>
                            <TableHead className="text-right">คงเหลือ</TableHead>
                            <TableHead className="text-right">ขั้นต่ำ</TableHead>
                            <TableHead>หน่วย</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {stock.lowStockItems.map((l) => (
                            <TableRow key={l.productCode}>
                              <TableCell className="font-medium">
                                {l.productName}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {l.productCode}
                              </TableCell>
                              <TableCell className="text-right font-semibold text-rose-600 dark:text-rose-400">
                                {l.quantity}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {l.minQuantity}
                              </TableCell>
                              <TableCell className="text-xs">
                                {l.unit}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* === Devices status table === */}
          {devices && Object.keys(devices.byStatus).length > 0 && (
            <Card className="print-break-avoid shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cpu className="h-4 w-4 text-indigo-500" />
                  สรุปอุปกรณ์ตามสถานะ
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(devices.byStatus).map(
                            ([k, v]) => ({
                              name: STATUS_LABELS_DEV[k] ?? k,
                              value: v,
                              key: k,
                            }),
                          )}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={70}
                          label={(entry: { name?: string; value?: number }) =>
                            `${entry.name ?? ''}: ${entry.value ?? 0}`
                          }
                          labelLine={false}
                        >
                          {Object.entries(devices.byStatus).map(([k]) => (
                            <Cell
                              key={k}
                              fill={DEVICE_STATUS_COLORS[k] ?? '#94a3b8'}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: isDark ? '#1e293b' : '#fff',
                            border: `1px solid ${chartGridColor}`,
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>สถานะ</TableHead>
                          <TableHead className="text-right">จำนวน</TableHead>
                          <TableHead className="text-right">
                            % ของทั้งหมด
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(devices.byStatus).map(([k, v]) => (
                          <TableRow key={k}>
                            <TableCell>
                              <span className="flex items-center gap-2">
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor:
                                      DEVICE_STATUS_COLORS[k] ?? '#94a3b8',
                                  }}
                                />
                                {STATUS_LABELS_DEV[k] ?? k}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {v}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {devices.total > 0
                                ? Math.round((v / devices.total) * 100)
                                : 0}
                              %
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Footer note (print) */}
          <div className="print-only px-1 py-2 text-center text-[11px] text-muted-foreground">
            รายงานสร้างโดยระบบจัดการสินทรัพย์ •{' '}
            {new Date().toLocaleString('th-TH')}
          </div>
        </motion.div>
      )}

      {/* === Print CSS (scoped) === */}
      <style jsx global>{`
        @media print {
          /* Hide everything outside the report */
          body * {
            visibility: hidden;
          }
          /* Show only the report area */
          .print-area,
          .print-area * {
            visibility: visible;
          }
          /* Hide controls that shouldn't print */
          .print-hide {
            display: none !important;
          }
          /* Show print-only elements */
          .print-only {
            display: block !important;
          }
          /* Reset positioning for print */
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          /* Avoid breaking sections across pages */
          .print-break-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          /* Card shadow off, lighter borders */
          .print-break-avoid,
          [data-slot='card'] {
            box-shadow: none !important;
            border: 1px solid #e2e8f0 !important;
          }
        }
        /* Print-only is hidden on screen */
        .print-only {
          display: none;
        }
      `}</style>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────

function SummaryCard({
  title,
  value,
  icon,
  accent,
  hint,
}: {
  title: string
  value: string
  icon: React.ReactNode
  accent: string
  hint?: string
}) {
  return (
    <Card className="print-break-avoid overflow-hidden shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}1a`, color: accent }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-muted-foreground">
            {title}
          </div>
          <div className="truncate text-lg font-bold">{value}</div>
          {hint && (
            <div className="truncate text-[10px] text-muted-foreground">
              {hint}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyHint({ label }: { label: string }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
      {label}
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 w-full" />
        ))}
      </div>
    </div>
  )
}
