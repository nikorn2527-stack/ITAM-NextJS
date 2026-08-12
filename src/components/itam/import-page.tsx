'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Upload,
  Download,
  File,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  Loader2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Database,
} from 'lucide-react'
import { downloadCsv } from '@/lib/csv'
import { cn } from '@/lib/utils'
import { LegacyImportSection } from './legacy-import-section'

// ============================================================
// ข้อ 3: นำเข้าข้อมูล — อัปโหลด Excel/CSV แยกตามประเภท
// ============================================================

type JobType = 'device' | 'work-order' | 'stock' | 'meter-reading'

interface ImportTypeDef {
  id: JobType
  icon: string
  title: string
  desc: string
  headers: { key: string; label: string }[]
  sample: Record<string, string>
}

const IMPORT_TYPES: ImportTypeDef[] = [
  {
    id: 'device',
    icon: '💻',
    title: 'อุปกรณ์',
    desc: 'นำเข้ารายการอุปกรณ์ IT',
    headers: [
      { key: 'assetCode', label: 'assetCode' },
      { key: 'name', label: 'name' },
      { key: 'brand', label: 'brand' },
      { key: 'model', label: 'model' },
      { key: 'type', label: 'type' },
      { key: 'serialNumber', label: 'serialNumber' },
      { key: 'status', label: 'status' },
      { key: 'site', label: 'site' },
      { key: 'department', label: 'department' },
      { key: 'location', label: 'location' },
      { key: 'purchaseDate', label: 'purchaseDate' },
      { key: 'warrantyMonths', label: 'warrantyMonths' },
    ],
    sample: {
      assetCode: 'IT-PRT-001',
      name: 'เครื่องพิมพ์ HP LaserJet',
      brand: 'HP',
      model: 'LaserJet Pro M404',
      type: 'PRINTER',
      serialNumber: 'SN12345',
      status: 'active',
      site: 'HQ',
      department: 'ไอที',
      location: 'ห้องเซิร์ฟเวอร์',
      purchaseDate: '2025-01-01',
      warrantyMonths: '12',
    },
  },
  {
    id: 'work-order',
    icon: '🔧',
    title: 'แจ้งซ่อม',
    desc: 'นำเข้าใบงานแจ้งซ่อม',
    headers: [
      { key: 'subject', label: 'subject' },
      { key: 'building', label: 'building' },
      { key: 'location', label: 'location' },
      { key: 'details', label: 'details' },
      { key: 'priority', label: 'priority' },
      { key: 'reporterName', label: 'reporterName' },
      { key: 'tel', label: 'tel' },
    ],
    sample: {
      subject: 'เครื่องพิมพ์ไม่ทำงาน',
      building: 'อาคาร A',
      location: 'ชั้น 3 ห้อง 301',
      details: 'เครื่องพิมพ์ไม่ติดเครื่อง',
      priority: 'ปกติ',
      reporterName: 'คุณสมชาย',
      tel: '0812345678',
    },
  },
  {
    id: 'stock',
    icon: '📦',
    title: 'สต๊อก',
    desc: 'นำเข้าสินค้าคงคลัง',
    headers: [
      { key: 'productCode', label: 'productCode' },
      { key: 'productName', label: 'productName' },
      { key: 'category', label: 'category' },
      { key: 'brand', label: 'brand' },
      { key: 'unit', label: 'unit' },
      { key: 'quantity', label: 'quantity' },
      { key: 'minQuantity', label: 'minQuantity' },
      { key: 'unitCost', label: 'unitCost' },
      { key: 'location', label: 'location' },
    ],
    sample: {
      productCode: 'STK-0001',
      productName: 'หมึกพิมพ์ HP สีดำ',
      category: 'หมึกพิมพ์',
      brand: 'HP',
      unit: 'ชิ้น',
      quantity: '10',
      minQuantity: '5',
      unitCost: '1200',
      location: 'ชั้น 2 ตู้ A',
    },
  },
  {
    id: 'meter-reading',
    icon: '📊',
    title: 'มิเตอร์',
    desc: 'นำเข้าการจดมิเตอร์',
    headers: [
      { key: 'assetCode', label: 'assetCode' },
      { key: 'readingDate', label: 'readingDate' },
      { key: 'meterBw', label: 'meterBw' },
      { key: 'meterColor', label: 'meterColor' },
      { key: 'readBy', label: 'readBy' },
      { key: 'remark', label: 'remark' },
    ],
    sample: {
      assetCode: 'IT-PRT-001',
      readingDate: '2025-01-31',
      meterBw: '15000',
      meterColor: '3200',
      readBy: 'คุณสมศักดิ์',
      remark: '',
    },
  },
]

interface ImportJob {
  id: string
  jobType: string
  fileName: string
  fileType: string
  status: string
  totalRows: number
  processedRows: number
  errorRows: number
  errors: string | null
  uploadedBy: string | null
  createdAt: string
  completedAt: string | null
}

interface ImportError {
  row: number
  message: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('th-TH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function jobTypeLabel(t: string): string {
  switch (t) {
    case 'device':
      return 'อุปกรณ์'
    case 'work-order':
      return 'แจ้งซ่อม'
    case 'stock':
      return 'สต๊อก'
    case 'meter-reading':
      return 'มิเตอร์'
    case 'master-data':
      return 'ข้อมูลมาตรฐาน'
    default:
      // Legacy import types are stored as "legacy:{sheetId}"
      if (t.startsWith('legacy:')) {
        const sheetId = t.slice(7)
        const labels: Record<string, string> = {
          'itam-device': 'Legacy: อุปกรณ์',
          'itam-meter': 'Legacy: มิเตอร์',
          'itam-transfer': 'Legacy: ย้ายอุปกรณ์',
          'itam-users': 'Legacy: ผู้ใช้',
          'itam-settings': 'Legacy: ตั้งค่า',
          'itam-master': 'Legacy: Master',
          'itam-sites': 'Legacy: สาขา',
          'stock-products': 'Legacy: สินค้า',
          'stock-in': 'Legacy: รับเข้า',
          'stock-out': 'Legacy: เบิกออก',
          'stock-po': 'Legacy: ใบสั่งซื้อ',
          'services-workorders': 'Legacy: ใบงาน',
        }
        return labels[sheetId] ?? t
      }
      return t
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; cls: string; icon: React.ReactNode }
  > = {
    completed: {
      label: 'สำเร็จ',
      cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
      icon: <CheckCircle className="mr-1 h-3 w-3" />,
    },
    failed: {
      label: 'ล้มเหลว',
      cls: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
      icon: <AlertCircle className="mr-1 h-3 w-3" />,
    },
    processing: {
      label: 'กำลังประมวลผล',
      cls: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
      icon: <Loader2 className="mr-1 h-3 w-3 animate-spin" />,
    },
    pending: {
      label: 'รอดำเนินการ',
      cls: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
      icon: <Loader2 className="mr-1 h-3 w-3" />,
    },
  }
  const cfg = map[status] ?? {
    label: status,
    cls: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    icon: null,
  }
  return (
    <Badge className={cn('inline-flex items-center text-xs', cfg.cls)}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  )
}

export function ImportPage() {
  const qc = useQueryClient()
  const [selectedType, setSelectedType] = React.useState<JobType | null>(null)
  const [file, setFile] = React.useState<File | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const [errorDialog, setErrorDialog] = React.useState<ImportJob | null>(null)
  const [instructionsOpen, setInstructionsOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // ---- History list ----
  const {
    data: jobs,
    isLoading: jobsLoading,
    refetch: refetchJobs,
    isFetching: jobsFetching,
  } = useQuery<ImportJob[]>({
    queryKey: ['import-jobs'],
    queryFn: async () => {
      const res = await fetch('/api/import?limit=50')
      if (!res.ok) throw new Error('โหลดประวัติไม่สำเร็จ')
      const j = await res.json()
      return (j.jobs ?? []) as ImportJob[]
    },
    staleTime: 15_000,
  })

  // ---- Upload mutation ----
  const uploadMutation = useMutation({
    mutationFn: async (vars: { file: File; jobType: JobType }) => {
      const fd = new FormData()
      fd.append('file', vars.file)
      fd.append('jobType', vars.jobType)
      const res = await fetch('/api/import', {
        method: 'POST',
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error ?? 'อัปโหลดไม่สำเร็จ')
      }
      return json.job as ImportJob
    },
    onSuccess: (job) => {
      toast.success(
        `นำเข้า${jobTypeLabel(job.jobType)} ${job.processedRows}/${job.totalRows} แถว`,
      )
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      qc.invalidateQueries({ queryKey: ['import-jobs'] })
      // Also invalidate the per-type data so other pages refresh.
      if (job.jobType === 'device') {
        qc.invalidateQueries({ queryKey: ['devices'] })
      } else if (job.jobType === 'work-order') {
        qc.invalidateQueries({ queryKey: ['work-orders'] })
      } else if (job.jobType === 'stock') {
        qc.invalidateQueries({ queryKey: ['stock-items'] })
      } else if (job.jobType === 'meter-reading') {
        qc.invalidateQueries({ queryKey: ['meter'] })
      }
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
    onError: (e: Error) => {
      toast.error(e.message)
      qc.invalidateQueries({ queryKey: ['import-jobs'] })
    },
  })

  const selectedTypeDef = React.useMemo(
    () => IMPORT_TYPES.find((t) => t.id === selectedType) ?? null,
    [selectedType],
  )

  function handleFile(f: File) {
    const lower = f.name.toLowerCase()
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      toast.error('กรุณาใช้ไฟล์ CSV (ยังไม่รองรับ .xlsx ในขณะนี้)')
      return
    }
    if (!lower.endsWith('.csv') && !lower.endsWith('.txt')) {
      toast.error('รองรับเฉพาะไฟล์ .csv')
      return
    }
    setFile(f)
  }

  function onPickFile() {
    inputRef.current?.click()
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
  }

  function onUpload() {
    if (!file || !selectedType) return
    uploadMutation.mutate({ file, jobType: selectedType })
  }

  function onDownloadTemplate() {
    if (!selectedTypeDef) return
    const fname = `${selectedTypeDef.id}-template.csv`
    downloadCsv(fname, [selectedTypeDef.sample], selectedTypeDef.headers)
    toast.success(`ดาวน์โหลดเทมเพลต ${fname}`)
  }

  function parseErrors(job: ImportJob): ImportError[] {
    if (!job.errors) return []
    try {
      const arr = JSON.parse(job.errors)
      return Array.isArray(arr) ? (arr as ImportError[]) : []
    } catch {
      return []
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
            <span aria-hidden>📥</span>
            นำเข้าข้อมูล
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            อัปโหลดไฟล์ Excel/CSV — แยกตามประเภทข้อมูล
          </p>
        </div>

        {/* Tab switcher: manual import vs legacy Apps Script import */}
        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="bg-slate-100 dark:bg-slate-800">
            <TabsTrigger value="manual" className="gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              นำเข้าใหม่ (Manual)
            </TabsTrigger>
            <TabsTrigger value="legacy" className="gap-1.5">
              <Database className="h-3.5 w-3.5" />
              นำเข้าจากระบบเก่า (Apps Script)
            </TabsTrigger>
          </TabsList>

          {/* ─── Manual import tab ─── */}
          <TabsContent value="manual" className="space-y-6">
        {/* Import type selector */}
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            1. เลือกประเภทข้อมูลที่จะนำเข้า
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {IMPORT_TYPES.map((t) => {
              const active = selectedType === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedType(t.id)
                    setFile(null)
                    if (inputRef.current) inputRef.current.value = ''
                  }}
                  className={cn(
                    'group relative flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950',
                    active
                      ? 'border-[#f97316] bg-[#f97316]/5 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-[#f97316]/40 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-[#fb923c]/40 dark:hover:bg-slate-800',
                  )}
                >
                  <span className="text-3xl" aria-hidden>
                    {t.icon}
                  </span>
                  <span className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {t.title}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t.desc}
                  </span>
                  <span className="mt-1 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                    ({t.id})
                  </span>
                  {active && (
                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#f97316] text-white">
                      <CheckCircle className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Upload area + template */}
        {selectedTypeDef && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-slate-200 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <span aria-hidden>{selectedTypeDef.icon}</span>
                  2. อัปโหลดไฟล์ — {selectedTypeDef.title}
                </CardTitle>
                <CardDescription>
                  เลือกไฟล์ CSV (UTF-8) ที่มีคอลัมน์ตรงกับเทมเพลต ระบบจะบันทึกและประมวลผลทันที
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Drop zone */}
                <div
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  role="button"
                  tabIndex={0}
                  onClick={onPickFile}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onPickFile()
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950',
                    dragOver
                      ? 'border-[#f97316] bg-[#f97316]/5'
                      : 'border-slate-300 bg-slate-50 hover:border-[#f97316] hover:bg-[#f97316]/5 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-[#fb923c]',
                  )}
                >
                  <Upload className="h-10 w-10 text-slate-400 dark:text-slate-500" />
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {file ? (
                        <span className="inline-flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          {file.name}
                          <Badge className="ml-1 border-slate-200 bg-slate-100 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {formatBytes(file.size)}
                          </Badge>
                        </span>
                      ) : (
                        'ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์'
                      )}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">
                      รองรับ .csv (UTF-8) — ยังไม่รองรับ .xlsx
                    </div>
                  </div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".csv,text/csv,.txt"
                    className="hidden"
                    onChange={onInputChange}
                  />
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onPickFile}
                    className="border-slate-300 dark:border-slate-700"
                  >
                    <File className="mr-1.5 h-4 w-4" />
                    เลือกไฟล์
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onDownloadTemplate}
                    className="border-slate-300 dark:border-slate-700"
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    ดาวน์โหลดเทมเพลต
                  </Button>
                  <Button
                    type="button"
                    onClick={onUpload}
                    disabled={!file || uploadMutation.isPending}
                    className="ml-auto bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
                  >
                    {uploadMutation.isPending ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        กำลังอัปโหลด...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-1.5 h-4 w-4" />
                        อัปโหลด
                      </>
                    )}
                  </Button>
                </div>

                {/* Template columns preview */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    หัวคอลัมน์ที่ต้องมี:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTypeDef.headers.map((h) => (
                      <Badge
                        key={h.key}
                        variant="outline"
                        className="font-mono text-[11px] text-slate-600 dark:text-slate-300"
                      >
                        {h.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
          </TabsContent>

          {/* ─── Legacy Apps Script import tab ─── */}
          <TabsContent value="legacy">
            <LegacyImportSection />
          </TabsContent>
        </Tabs>

        {/* Import history (shared between both tabs) */}
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-slate-800 dark:text-slate-100">
              <span className="flex items-center gap-2">
                <span aria-hidden>📋</span>
                3. ประวัติการนำเข้า
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetchJobs()}
                disabled={jobsFetching}
                className="border-slate-300 dark:border-slate-700"
              >
                <RefreshCw
                  className={cn(
                    'mr-1.5 h-3.5 w-3.5',
                    jobsFetching && 'animate-spin',
                  )}
                />
                รีเฟรช
              </Button>
            </CardTitle>
            <CardDescription>
              รายการ ImportJob ล่าสุด — คลิกที่แถวเพื่อดูรายละเอียดข้อผิดพลาด
            </CardDescription>
          </CardHeader>
          <CardContent>
            {jobsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !jobs || jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <FileSpreadsheet className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  ยังไม่มีประวัติการนำเข้า
                </p>
              </div>
            ) : (
              <div className="itam-scroll max-h-[28rem] overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                    <TableRow>
                      <TableHead className="w-32">ประเภท</TableHead>
                      <TableHead>ชื่อไฟล์</TableHead>
                      <TableHead className="w-28">สถานะ</TableHead>
                      <TableHead className="w-20 text-right">ทั้งหมด</TableHead>
                      <TableHead className="w-20 text-right">สำเร็จ</TableHead>
                      <TableHead className="w-20 text-right">ผิดพลาด</TableHead>
                      <TableHead className="w-40">วันที่</TableHead>
                      <TableHead className="w-16 text-center">รายละเอียด</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => {
                      const errs = parseErrors(job)
                      const hasErrs = errs.length > 0
                      return (
                        <TableRow
                          key={job.id}
                          className={cn(
                            'cursor-pointer',
                            hasErrs
                              ? 'hover:bg-amber-50 dark:hover:bg-amber-950/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                          )}
                          onClick={() => hasErrs && setErrorDialog(job)}
                        >
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-xs text-slate-600 dark:text-slate-300"
                            >
                              {jobTypeLabel(job.jobType)}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[240px] truncate font-mono text-xs">
                            {job.fileName}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={job.status} />
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {job.totalRows}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                            {job.processedRows}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-red-600 dark:text-red-400">
                            {job.errorRows}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDateTime(job.createdAt)}
                          </TableCell>
                          <TableCell className="text-center">
                            {hasErrs ? (
                              <button
                                type="button"
                                aria-label="ดูรายละเอียดข้อผิดพลาด"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-950/50"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setErrorDialog(job)
                                }}
                              >
                                <AlertCircle className="h-4 w-4" />
                              </button>
                            ) : job.status === 'completed' ? (
                              <CheckCircle className="mx-auto h-4 w-4 text-emerald-500" />
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">
                                —
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Instructions (collapsible) */}
        <Collapsible
          open={instructionsOpen}
          onOpenChange={setInstructionsOpen}
        >
          <Card className="border-slate-200 dark:border-slate-800">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-6 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
              >
                <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                  <span aria-hidden>❓</span>
                  4. วิธีใช้งาน
                </CardTitle>
                {instructionsOpen ? (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    ขั้นตอนการใช้งาน
                  </h3>
                  <ol className="ml-4 list-decimal space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                    <li>เลือกประเภทข้อมูลที่จะนำเข้า (อุปกรณ์ / แจ้งซ่อม / สต๊อก / มิเตอร์)</li>
                    <li>คลิก &quot;ดาวน์โหลดเทมเพลต&quot; เพื่อดาวน์โหลดไฟล์ CSV ตัวอย่างพร้อมหัวคอลัมน์ที่ถูกต้อง</li>
                    <li>เปิดไฟล์เทมเพลตใน Excel หรือโปรแกรมตกแต่ง CSV แล้วกรอกข้อมูลในแต่ละแถว</li>
                    <li>บันทึกไฟล์เป็น CSV (UTF-8) — หากใช้ Excel เลือก &quot;CSV UTF-8 (Comma delimited)&quot;</li>
                    <li>ลากไฟล์มาวางในพื้นที่อัปโหลด หรือคลิก &quot;เลือกไฟล์&quot;</li>
                    <li>คลิก &quot;อัปโหลด&quot; — ระบบจะตรวจสอบและนำเข้าข้อมูลทันที</li>
                    <li>ดูผลลัพธ์ในตาราง &quot;ประวัติการนำเข้า&quot; — คลิกแถวที่มีข้อผิดพลาดเพื่อดูรายละเอียด</li>
                  </ol>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    รูปแบบไฟล์
                  </h3>
                  <ul className="ml-4 list-disc space-y-1 text-sm text-slate-600 dark:text-slate-300">
                    <li>
                      <strong>CSV (UTF-8)</strong> — แนะนำ รองรับภาษาไทย
                    </li>
                    <li>
                      <strong>Excel (.xlsx)</strong> — ยังไม่รองรับในขณะนี้ กรุณาบันทึกเป็น CSV ก่อนอัปโหลด
                    </li>
                    <li>ตัวคั่นคอลัมน์: จุลภาค (,) หรือเซมิโคลอน (;)</li>
                    <li>แถวแรกต้องเป็นหัวคอลัมน์ ตรงกับเทมเพลต</li>
                  </ul>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                    หัวคอลัมน์ (ต้องตรงกับเทมเพลต)
                  </h3>
                  <div className="space-y-2">
                    {IMPORT_TYPES.map((t) => (
                      <div
                        key={t.id}
                        className="rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-800/50"
                      >
                        <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {t.icon} {t.title} ({t.id})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {t.headers.map((h) => (
                            <Badge
                              key={h.key}
                              variant="outline"
                              className="font-mono text-[10px] text-slate-600 dark:text-slate-300"
                            >
                              {h.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                  <strong>ข้อควรระวัง:</strong> ระบบจะข้ามแถวที่มีรหัสซ้ำในไฟล์หรือมีอยู่แล้วในระบบ
                  — แนะนำให้ดาวน์โหลดเทมเพลตและตรวจสอบหัวคอลัมน์ก่อนทุกครั้ง
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>

      {/* Error detail dialog */}
      <Dialog
        open={!!errorDialog}
        onOpenChange={(o) => !o && setErrorDialog(null)}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              รายละเอียดข้อผิดพลาด
            </DialogTitle>
            <DialogDescription>
              {errorDialog && (
                <>
                  ไฟล์: <span className="font-mono">{errorDialog.fileName}</span>
                  {' — '}
                  {jobTypeLabel(errorDialog.jobType)}
                  {' — '}
                  {errorDialog.errorRows} จาก {errorDialog.totalRows} แถว
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {errorDialog && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-center dark:border-slate-800 dark:bg-slate-800/50">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    ทั้งหมด
                  </div>
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    {errorDialog.totalRows}
                  </div>
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-center dark:border-emerald-800 dark:bg-emerald-950/30">
                  <div className="text-xs text-emerald-700 dark:text-emerald-400">
                    สำเร็จ
                  </div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                    {errorDialog.processedRows}
                  </div>
                </div>
                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-center dark:border-red-800 dark:bg-red-950/30">
                  <div className="text-xs text-red-700 dark:text-red-400">
                    ผิดพลาด
                  </div>
                  <div className="text-lg font-bold text-red-700 dark:text-red-400">
                    {errorDialog.errorRows}
                  </div>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                    <TableRow>
                      <TableHead className="w-20">บรรทัด</TableHead>
                      <TableHead>ข้อความ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parseErrors(errorDialog).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={2}
                          className="py-6 text-center text-sm text-slate-400 dark:text-slate-500"
                        >
                          ไม่มีรายละเอียดข้อผิดพลาด
                        </TableCell>
                      </TableRow>
                    ) : (
                      parseErrors(errorDialog).map((err, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400">
                            {err.row === 0 ? '—' : err.row}
                          </TableCell>
                          <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                            {err.message}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
