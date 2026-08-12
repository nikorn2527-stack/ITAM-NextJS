'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus,
  RefreshCw,
  Search,
  Wrench,
  Clock,
  CheckCircle2,
  XCircle,
  MapPin,
  User,
  Phone,
  Send,
  MessageSquare,
  AlertTriangle,
  CalendarClock,
  Image as ImageIcon,
  Building2,
  Edit3,
  Trash2,
  ShieldCheck,
  PackageOpen,
  ClipboardList,
  Hash,
  Package,
  Check,
  Box,
} from 'lucide-react'
import { formatThaiDate, relativeTime } from './types'

// ============================================================
// Types
// ============================================================
export interface WorkOrderMessage {
  id: string
  workOrderId: string
  message: string
  author: string | null
  authorRole: string | null
  createdAt: string
}

export interface WorkOrderReview {
  id: string
  workOrderId: string
  rating: number
  comment: string | null
  reviewedBy: string | null
  createdAt: string
}

export interface ExternalMeta {
  clientName?: string
  place?: string
  contactPhone?: string
  serials?: string[]
}

export interface WorkOrder {
  id: string
  woNumber: string | null
  subject: string
  building: string | null
  location: string | null
  details: string | null
  priority: string
  reporterName: string | null
  reporterEmail: string | null
  tel: string | null
  employeeCode: string | null
  submissionSource: string
  trackable: boolean
  externalMeta: string | null
  picBefore: string | null
  picOnsite: string | null
  picAfter: string | null
  status: string
  acceptStatus: string | null
  assignedTo: string | null
  assignedBy: string | null
  assignedAt: string | null
  assignmentNote: string | null
  detailsAdmin: string | null
  dateAdmin: string | null
  resolution: string | null
  resolutionGroup: string | null
  editUnlockActive: boolean
  editUnlockBy: string | null
  editUnlockAt: string | null
  editUnlockNote: string | null
  workCompletedAt: string | null
  closedAt: string | null
  canceledAt: string | null
  cancelReason: string | null
  deviceId: string | null
  createdAt: string
  updatedAt: string
  device?: {
    id: string
    assetCode: string
    name: string
    brand: string
    model: string
    site: string
  } | null
  messages?: WorkOrderMessage[]
  review?: WorkOrderReview | null
}

interface WorkOrderListResponse {
  data: WorkOrder[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  stats: Record<string, number>
}

interface WorkOrderDetail extends WorkOrder {
  messages: WorkOrderMessage[]
  review: WorkOrderReview | null
}

interface SubjectOption {
  group: string
  value: string
  default_priority: string
}

interface ResolutionOption {
  group: string
  value: string
}

interface OptionsResponse {
  subjects: SubjectOption[]
  resolutions: ResolutionOption[]
}

interface DeviceLookupItem {
  id: string
  assetCode: string
  name: string
  brand: string
  model: string
  site: string
  building: string | null
  location: string | null
  serialNumber: string | null
}

// ============================================================
// Stock parts (linked to a work order)
// ============================================================
interface PartsStockItem {
  id: string
  productCode: string
  productName: string
  unit: string
  quantity: number
  unitCost: number | null
  active: boolean
}

interface PartsTransaction {
  id: string
  txnNumber: string | null
  stockItemId: string
  productCode: string | null
  productName: string | null
  type: string
  quantity: number
  unit: string | null
  balanceAfter: number
  reason: string | null
  requester: string | null
  purpose: string | null
  workOrderId: string | null
  workOrderNo: string | null
  approver: string | null
  approvedAt: string | null
  approvalStatus: string | null
  approvalMode: string | null
  rejectReason: string | null
  txnDate: string
  remark: string | null
  createdAt: string
  stockItem?: {
    productCode: string
    productName: string
    unit: string
    quantity: number
    active: boolean
  } | null
}

interface PartsListResponse {
  data: PartsTransaction[]
  summary: {
    total: number
    pending: number
    approved: number
    rejected: number
    immediate: number
  }
}

interface PartsListApiResponse {
  data: PartsStockItem[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

// ============================================================
// Constants
// ============================================================
const STATUS_OPTIONS = [
  { value: 'all', label: 'สถานะทั้งหมด' },
  { value: 'PENDING', label: 'รอดำเนินการ' },
  { value: 'IN_PROGRESS', label: 'กำลังซ่อม' },
  { value: 'WAITING_PARTS', label: 'รออะไหล่' },
  { value: 'COMPLETED', label: 'เสร็จแล้ว' },
  { value: 'CANCELLED', label: 'ยกเลิก' },
] as const

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'ความเร่งด่วนทั้งหมด' },
  { value: 'ปกติ', label: 'ปกติ' },
  { value: 'ปานกลาง', label: 'ปานกลาง' },
  { value: 'สูง', label: 'สูง' },
  { value: 'ด่วน', label: 'ด่วน' },
] as const

const PRIORITY_FORM_OPTIONS = [
  { value: 'ปกติ', label: 'ปกติ' },
  { value: 'ปานกลาง', label: 'ปานกลาง' },
  { value: 'สูง', label: 'สูง' },
  { value: 'ด่วน', label: 'ด่วน' },
] as const

const PAGE_SIZE = 12

function statusLabel(status: string): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
    case 'IN_PROGRESS':
      return 'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300'
    case 'WAITING_PARTS':
      return 'border-purple-200 bg-purple-100 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300'
    case 'COMPLETED':
      return 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
    case 'CANCELLED':
      return 'border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300'
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
  }
}

function priorityBadgeClass(priority: string): string {
  switch (priority) {
    case 'ด่วน':
      return 'border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300'
    case 'สูง':
      return 'border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300'
    case 'ปานกลาง':
      return 'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
    case 'ปกติ':
    default:
      return 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
  }
}

function formatDateTime(iso: string | null): string {
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

function parseExternalMeta(raw: string | null): ExternalMeta | null {
  if (!raw) return null
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return null
    return obj as ExternalMeta
  } catch {
    return null
  }
}

// ============================================================
// Main component
// ============================================================
interface NewFormState {
  subject: string
  subjectGroup: string
  building: string
  location: string
  details: string
  priority: string
  reporterName: string
  tel: string
  employeeCode: string
  isExternal: boolean
  // External fields
  clientName: string
  place: string
  contactPhone: string
  serials: string[]
  serialInput: string
  // Device lookup (internal)
  deviceId: string | null
  deviceSearch: string
  // Image before
  picBefore: string | null
  picBeforeName: string
}

const EMPTY_FORM: NewFormState = {
  subject: '',
  subjectGroup: '',
  building: '',
  location: '',
  details: '',
  priority: 'ปกติ',
  reporterName: '',
  tel: '',
  employeeCode: '',
  isExternal: false,
  clientName: '',
  place: '',
  contactPhone: '',
  serials: [],
  serialInput: '',
  deviceId: null,
  deviceSearch: '',
  picBefore: null,
  picBeforeName: '',
}

// 1 MB hard cap to keep SQLite payload sane
const MAX_PIC_BYTES = 1_000_000

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function compressImage(file: File, maxBytes = MAX_PIC_BYTES): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file)
  if (dataUrl.length <= maxBytes) return dataUrl
  // Try shrinking via canvas
  return new Promise<string>((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const maxDim = 1280
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      let quality = 0.8
      let out = canvas.toDataURL('image/jpeg', quality)
      while (out.length > maxBytes && quality > 0.3) {
        quality -= 0.15
        out = canvas.toDataURL('image/jpeg', quality)
      }
      resolve(out)
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

export function WorkOrdersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<string>('all')
  const [priorityFilter, setPriorityFilter] = React.useState<string>('all')
  const [page, setPage] = React.useState(1)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [form, setForm] = React.useState<NewFormState>(EMPTY_FORM)
  const [saving, setSaving] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)

  // Load subject + resolution options once
  const optionsQuery = useQuery<OptionsResponse>({
    queryKey: ['wo-options'],
    queryFn: async () => {
      const res = await fetch('/api/settings/options')
      if (!res.ok) throw new Error('Failed to load options')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Debounce search to avoid spamming the API on every keystroke
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(t)
  }, [search])

  React.useEffect(() => {
    setPage(1)
  }, [statusFilter, priorityFilter])

  const listQuery = useQuery<WorkOrderListResponse>({
    queryKey: [
      'work-orders',
      debouncedSearch,
      statusFilter,
      priorityFilter,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (priorityFilter !== 'all') params.set('priority', priorityFilter)
      params.set('page', String(page))
      params.set('pageSize', String(PAGE_SIZE))
      const res = await fetch(`/api/work-orders?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load work orders')
      return res.json()
    },
  })

  const items = listQuery.data?.data ?? []
  const stats = listQuery.data?.stats ?? {
    PENDING: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    CANCELLED: 0,
  }
  const pagination = listQuery.data?.pagination

  function openCreate() {
    setForm({ ...EMPTY_FORM })
    setCreateOpen(true)
  }

  async function handleCreate() {
    if (!form.subject.trim()) {
      toast.error('กรุณาระบุประเภทปัญหา')
      return
    }
    if (form.isExternal) {
      if (!form.clientName.trim()) {
        toast.error('กรุณาระบุชื่อลูกค้าสำหรับงานนอก')
        return
      }
    } else {
      // Internal: guest must provide name + phone for verification
      if (!form.reporterName.trim() || !form.tel.trim()) {
        toast.error('ผู้แจ้ง (Guest) ต้องระบุชื่อและเบอร์โทร เพื่อยืนยันตัวตน')
        return
      }
    }
    try {
      setSaving(true)
      const payload: Record<string, unknown> = {
        subject: form.subject.trim(),
        details: form.details.trim() || null,
        priority: form.priority,
        picBefore: form.picBefore,
        submissionSource: 'guest',
      }
      if (form.isExternal) {
        payload.isExternal = true
        payload.externalMeta = {
          clientName: form.clientName.trim(),
          place: form.place.trim() || undefined,
          contactPhone: form.contactPhone.trim() || undefined,
          serials: form.serials.length > 0 ? form.serials : undefined,
        }
        // For external WOs the reporter is the staff filling the form
        payload.reporterName = form.reporterName.trim() || null
        payload.tel = form.tel.trim() || null
        payload.skipGuestValidation = true
      } else {
        payload.reporterName = form.reporterName.trim()
        payload.tel = form.tel.trim()
        payload.employeeCode = form.employeeCode.trim() || null
        payload.building = form.building.trim() || null
        payload.location = form.location.trim() || null
        payload.deviceId = form.deviceId || null
      }
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'บันทึกไม่สำเร็จ')
      }
      const json = await res.json()
      toast.success(`สร้างใบแจ้งซ่อม ${json.data?.woNumber ?? ''} แล้ว`)
      setCreateOpen(false)
      qc.invalidateQueries({ queryKey: ['work-orders'] })
      // Open the new detail right away
      if (json.data?.id) setDetailId(json.data.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
            <Wrench className="h-6 w-6 text-orange-500" />
            แจ้งซ่อม
          </h1>
          <p className="text-sm text-muted-foreground">
            ระบบแจ้งซ่อมครบวงจร — แจ้ง → รับงาน → ซ่อม → ปิดงาน (รองรับลูกค้าภายนอก)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => listQuery.refetch()}
            disabled={listQuery.isFetching}
            aria-label="รีเฟรช"
          >
            <RefreshCw
              className={listQuery.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
            />
            <span className="hidden sm:inline">รีเฟรช</span>
          </Button>
          <Button size="sm" onClick={openCreate} className="bg-orange-500 hover:bg-orange-600">
            <Plus className="h-4 w-4" />
            แจ้งซ่อมใหม่
          </Button>
        </div>
      </div>

      {/* KPI stats bar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="รอดำเนินการ"
          value={stats.PENDING ?? 0}
          icon={<Clock className="h-5 w-5" />}
          color="amber"
        />
        <KpiCard
          label="กำลังซ่อม"
          value={(stats.IN_PROGRESS ?? 0) + (stats.WAITING_PARTS ?? 0)}
          icon={<Wrench className="h-5 w-5" />}
          color="blue"
        />
        <KpiCard
          label="เสร็จแล้ว"
          value={stats.COMPLETED ?? 0}
          icon={<CheckCircle2 className="h-5 w-5" />}
          color="emerald"
        />
        <KpiCard
          label="ยกเลิก"
          value={stats.CANCELLED ?? 0}
          icon={<XCircle className="h-5 w-5" />}
          color="rose"
        />
      </div>

      {/* Filter bar */}
      <Card className="gap-3 py-3">
        <CardContent className="flex flex-col gap-3 px-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาเลขใบงาน / ปัญหา / สถานที่ / ผู้แจ้ง / เบอร์โทร"
              className="pl-9"
              aria-label="ค้นหาใบแจ้งซ่อม"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:w-auto">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[160px]" aria-label="กรองสถานะ">
                <SelectValue placeholder="สถานะ" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-full md:w-[160px]" aria-label="กรองความเร่งด่วน">
                <SelectValue placeholder="ความเร่งด่วน" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {listQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950">
              <Wrench className="h-7 w-7 text-orange-500" />
            </div>
            <div className="text-base font-medium">ยังไม่มีใบแจ้งซ่อม</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              กดปุ่ม &quot;แจ้งซ่อมใหม่&quot; เพื่อสร้างใบงานแรก หรือปรับตัวกรองเพื่อค้นหาใบงานเก่า
            </p>
            <Button size="sm" onClick={openCreate} className="mt-1 bg-orange-500 hover:bg-orange-600">
              <Plus className="h-4 w-4" />
              แจ้งซ่อมใหม่
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {items.map((wo) => (
              <motion.div
                key={wo.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18 }}
              >
                <WorkOrderCard wo={wo} onOpen={() => setDetailId(wo.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-sm text-muted-foreground">
            ทั้งหมด {pagination.total} รายการ • หน้า {pagination.page} / {pagination.totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ก่อนหน้า
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      )}

      {/* Create dialog */}
      <CreateWorkOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        form={form}
        setForm={setForm}
        saving={saving}
        onSubmit={handleCreate}
        subjects={optionsQuery.data?.subjects ?? []}
      />

      {/* Detail dialog */}
      <WorkOrderDetailDialog
        id={detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
        resolutions={optionsQuery.data?.resolutions ?? []}
      />
    </div>
  )
}

// ============================================================
// KPI Card
// ============================================================
const KPI_COLORS: Record<string, string> = {
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  emerald:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
}

function KpiCard({
  label,
  value,
  icon,
  color,
}: {
  label: string
  value: number
  icon: React.ReactNode
  color: keyof typeof KPI_COLORS | string
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-lg ${
            KPI_COLORS[color] ?? KPI_COLORS.amber
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-tight">{value}</div>
          <div className="truncate text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Work Order Card (mobile-friendly list item)
// ============================================================
function WorkOrderCard({
  wo,
  onOpen,
}: {
  wo: WorkOrder
  onOpen: () => void
}) {
  const external = parseExternalMeta(wo.externalMeta)
  return (
    <Card
      className="group cursor-pointer py-0 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <CardContent className="space-y-3 p-4">
        {/* Top row: WO number + status */}
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-xs font-semibold text-muted-foreground">
            {wo.woNumber ?? '—'}
          </span>
          <div className="flex items-center gap-1">
            {external && (
              <Badge
                className="border-teal-200 bg-teal-100 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300"
                variant="outline"
              >
                งานนอก
              </Badge>
            )}
            <Badge className={statusBadgeClass(wo.status)} variant="outline">
              {statusLabel(wo.status)}
            </Badge>
          </div>
        </div>

        {/* Subject */}
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-100 dark:bg-orange-950">
            <Wrench className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-sm font-semibold leading-tight">
              {wo.subject}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {relativeTime(wo.createdAt)}
            </div>
          </div>
        </div>

        {/* Meta */}
        <div className="space-y-1 text-xs text-muted-foreground">
          {external ? (
            <>
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {external.clientName ?? '—'}
                  {external.place ? ` • ${external.place}` : ''}
                </span>
              </div>
              {external.contactPhone && (
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{external.contactPhone}</span>
                </div>
              )}
            </>
          ) : (
            <>
              {wo.building && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {wo.building}
                    {wo.location ? ` • ${wo.location}` : ''}
                  </span>
                </div>
              )}
              {wo.reporterName && (
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{wo.reporterName}</span>
                  {wo.tel && (
                    <>
                      <span aria-hidden>•</span>
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{wo.tel}</span>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer: priority + assignedTo */}
        <div className="flex items-center justify-between gap-2 border-t pt-2.5">
          <Badge
            className={priorityBadgeClass(wo.priority)}
            variant="outline"
          >
            {wo.priority}
          </Badge>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {wo.assignedTo ? (
              <>
                <User className="h-3 w-3" />
                <span className="truncate">{wo.assignedTo}</span>
              </>
            ) : wo.status === 'PENDING' ? (
              <span className="text-amber-600 dark:text-amber-400">ยังไม่มอบหมาย</span>
            ) : (
              <span>—</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Create Dialog — with guest verification + external mode + subject dropdown
// ============================================================
function CreateWorkOrderDialog({
  open,
  onOpenChange,
  form,
  setForm,
  saving,
  onSubmit,
  subjects,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: NewFormState
  setForm: React.Dispatch<React.SetStateAction<NewFormState>>
  saving: boolean
  onSubmit: () => void
  subjects: SubjectOption[]
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Group subjects for the dropdown
  const subjectGroups = React.useMemo(() => {
    const map = new Map<string, SubjectOption[]>()
    for (const s of subjects) {
      if (!map.has(s.group)) map.set(s.group, [])
      map.get(s.group)!.push(s)
    }
    return Array.from(map.entries())
  }, [subjects])

  // Device lookup (internal mode only)
  const [deviceResults, setDeviceResults] = React.useState<DeviceLookupItem[]>([])
  const [deviceLoading, setDeviceLoading] = React.useState(false)
  React.useEffect(() => {
    if (!form.deviceSearch.trim() || form.isExternal) {
      setDeviceResults([])
      return
    }
    let cancelled = false
    setDeviceLoading(true)
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ search: form.deviceSearch.trim() })
        const res = await fetch(`/api/devices?${params.toString()}`)
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setDeviceResults((json.devices ?? []).slice(0, 8))
      } catch {
        if (!cancelled) setDeviceResults([])
      } finally {
        if (!cancelled) setDeviceLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [form.deviceSearch, form.isExternal])

  // When subject changes, auto-set priority from default_priority
  function handleSubjectChange(value: string) {
    if (value === '__custom__') {
      setForm((s) => ({ ...s, subject: '__custom__', subjectGroup: '' }))
      return
    }
    const opt = subjects.find((s) => s.value === value)
    setForm((s) => ({
      ...s,
      subject: value,
      subjectGroup: opt?.group ?? '',
      priority: opt?.default_priority ?? s.priority,
    }))
  }

  async function handlePicBeforeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await compressImage(file)
      setForm((s) => ({ ...s, picBefore: dataUrl, picBeforeName: file.name }))
    } catch {
      toast.error('อ่านไฟล์รูปไม่สำเร็จ')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function addSerial() {
    const v = form.serialInput.trim()
    if (!v) return
    if (form.serials.includes(v)) {
      toast.error('S/N นี้มีอยู่แล้ว')
      return
    }
    setForm((s) => ({ ...s, serials: [...s.serials, v], serialInput: '' }))
  }

  function removeSerial(s: string) {
    setForm((frm) => ({ ...frm, serials: frm.serials.filter((x) => x !== s) }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-orange-500" />
            แจ้งซ่อมใหม่
          </DialogTitle>
          <DialogDescription>
            กรอกรายละเอียดปัญหา ระบบจะสร้างเลขใบงานอัตโนมัติ (WO-YYYYMMDD-NNN)
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[68vh]">
          <div className="grid gap-3 px-1 py-1">
            {/* External mode toggle */}
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <PackageOpen className="mt-0.5 h-4 w-4 text-teal-600 dark:text-teal-400" />
                <div>
                  <div className="text-sm font-medium">ลูกค้าภายนอก / นอกสถานที่</div>
                  <div className="text-xs text-muted-foreground">
                    เปิดเมื่องานไม่ได้อยู่ในระบบ (เช่น ลูกค้าบริษัทอื่น)
                  </div>
                </div>
              </div>
              <Switch
                checked={form.isExternal}
                onCheckedChange={(v) =>
                  setForm((s) => ({ ...s, isExternal: v }))
                }
                aria-label="เปิดโหมดลูกค้าภายนอก"
              />
            </div>

            {/* Subject dropdown (grouped) */}
            <div className="grid gap-1.5">
              <Label htmlFor="wo-subject">
                ประเภทปัญหา <span className="text-rose-500">*</span>
              </Label>
              {subjects.length === 0 ? (
                <Input
                  id="wo-subject"
                  value={form.subject}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, subject: e.target.value }))
                  }
                  placeholder="เช่น เครื่องพิมพ์ไม่ทำงาน, อินเทอร์เน็ตไม่ติด"
                  autoFocus
                />
              ) : (
                <Select value={form.subject} onValueChange={handleSubjectChange}>
                  <SelectTrigger id="wo-subject">
                    <SelectValue placeholder="เลือกประเภทปัญหา" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjectGroups.map(([group, opts]) => (
                      <SelectGroup key={group}>
                        <SelectLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {group}
                        </SelectLabel>
                        {opts.map((o) => (
                          <SelectItem key={group + '|' + o.value} value={o.value}>
                            <span className="flex w-full items-center justify-between gap-2">
                              <span>{o.value}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {o.default_priority}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                    <SelectItem value="__custom__">— ระบุเอง —</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {form.subject === '__custom__' && (
                <Input
                  value={form.subject === '__custom__' ? '' : form.subject}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, subject: e.target.value }))
                  }
                  placeholder="พิมพ์หัวข้อปัญหา"
                  autoFocus
                />
              )}
              {form.subjectGroup && (
                <div className="text-[11px] text-muted-foreground">
                  หมวด: {form.subjectGroup} • ความเร่งด่วนอัตโนมัติ: {form.priority}
                </div>
              )}
            </div>

            {/* Conditional sections */}
            {form.isExternal ? (
              <div className="grid gap-3 rounded-lg border border-teal-200 bg-teal-50/50 p-3 dark:border-teal-800 dark:bg-teal-950/30">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="wo-client">
                      ชื่อลูกค้า <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="wo-client"
                      value={form.clientName}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, clientName: e.target.value }))
                      }
                      placeholder="เช่น บจก. ตัวอย่าง"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="wo-place">สถานที่</Label>
                    <Input
                      id="wo-place"
                      value={form.place}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, place: e.target.value }))
                      }
                      placeholder="เช่น อาคาร X ชั้น 2"
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wo-contact-phone">เบอร์ติดต่อลูกค้า</Label>
                  <Input
                    id="wo-contact-phone"
                    value={form.contactPhone}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, contactPhone: e.target.value }))
                    }
                    placeholder="08xxxxxxxx"
                    inputMode="tel"
                  />
                </div>
                {/* Serials list */}
                <div className="grid gap-1.5">
                  <Label htmlFor="wo-serial">S/N (Serial Number)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="wo-serial"
                      value={form.serialInput}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, serialInput: e.target.value }))
                      }
                      placeholder="กรอก S/N แล้วกด + เพื่อเพิ่ม"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addSerial()
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={addSerial}
                      disabled={!form.serialInput.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {form.serials.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {form.serials.map((s) => (
                        <Badge
                          key={s}
                          variant="outline"
                          className="gap-1 font-mono text-[11px]"
                        >
                          <Hash className="h-3 w-3" />
                          {s}
                          <button
                            type="button"
                            onClick={() => removeSerial(s)}
                            className="ml-1 rounded-full p-0.5 hover:bg-muted"
                            aria-label={`ลบ ${s}`}
                          >
                            <XCircle className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="wo-building">อาคาร / ฝ่าย</Label>
                    <Input
                      id="wo-building"
                      value={form.building}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, building: e.target.value }))
                      }
                      placeholder="เช่น อาคาร A, ฝ่ายบัญชี"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="wo-location">ตำแหน่ง / ห้อง</Label>
                    <Input
                      id="wo-location"
                      value={form.location}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, location: e.target.value }))
                      }
                      placeholder="เช่น ชั้น 3 ห้อง 305"
                    />
                  </div>
                </div>

                {/* Asset lookup */}
                <div className="grid gap-1.5">
                  <Label htmlFor="wo-device-search">เลขทะเบียนอุปกรณ์ (Optional)</Label>
                  <Input
                    id="wo-device-search"
                    value={form.deviceSearch}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, deviceSearch: e.target.value }))
                    }
                    placeholder="พิมพ์เลขทะเบียน / ชื่อ / S/N เพื่อค้นหาอุปกรณ์"
                  />
                  {deviceLoading && (
                    <div className="text-[11px] text-muted-foreground">กำลังค้นหา...</div>
                  )}
                  {!deviceLoading && deviceResults.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-md border bg-card">
                      {deviceResults.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setForm((s) => ({
                              ...s,
                              deviceId: d.id,
                              deviceSearch: `${d.assetCode} — ${d.name}`,
                              building: s.building || d.building || '',
                              location: s.location || d.location || '',
                            }))
                            setDeviceResults([])
                          }}
                          className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted"
                        >
                          <span className="font-mono font-semibold">{d.assetCode}</span>
                          <span className="text-muted-foreground">
                            {d.name} {d.brand && d.model ? `(${d.brand} ${d.model})` : ''}
                            {d.site ? ` • ${d.site}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {form.deviceId && (
                    <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> เลือกอุปกรณ์แล้ว
                      <button
                        type="button"
                        onClick={() =>
                          setForm((s) => ({
                            ...s,
                            deviceId: null,
                            deviceSearch: '',
                          }))
                        }
                        className="ml-1 underline"
                      >
                        ล้าง
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="wo-details">รายละเอียดปัญหา</Label>
              <Textarea
                id="wo-details"
                value={form.details}
                onChange={(e) => setForm((s) => ({ ...s, details: e.target.value }))}
                placeholder="อธิบายอาการ ความถี่ หรือข้อมูลที่ช่างควรทราบ"
                className="min-h-[80px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="wo-priority">ความเร่งด่วน</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm((s) => ({ ...s, priority: v }))}
                >
                  <SelectTrigger id="wo-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_FORM_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wo-pic">รูปก่อนซ่อม (Optional)</Label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    id="wo-pic"
                    type="file"
                    accept="image/*"
                    onChange={handlePicBeforeChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon className="h-4 w-4" />
                    {form.picBefore ? 'เปลี่ยนรูป' : 'เลือกรูป'}
                  </Button>
                  {form.picBefore && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <img
                        src={form.picBefore}
                        alt="pic-before"
                        className="h-8 w-8 rounded border object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((s) => ({
                            ...s,
                            picBefore: null,
                            picBeforeName: '',
                          }))
                        }
                        className="text-rose-500 underline"
                      >
                        ลบ
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Reporter block */}
            <div className="grid gap-2 rounded-lg border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                {form.isExternal
                  ? 'ผู้แจ้ง (ช่างที่รับงาน)'
                  : 'ผู้แจ้ง (ต้องยืนยันตัวตนกับสมุดผู้ติดต่อ)'}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="wo-reporter">
                    ชื่อผู้แจ้ง
                    {!form.isExternal && <span className="text-rose-500"> *</span>}
                  </Label>
                  <Input
                    id="wo-reporter"
                    value={form.reporterName}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, reporterName: e.target.value }))
                    }
                    placeholder="ชื่อ-นามสกุล"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="wo-tel">
                    เบอร์โทร
                    {!form.isExternal && <span className="text-rose-500"> *</span>}
                  </Label>
                  <Input
                    id="wo-tel"
                    value={form.tel}
                    onChange={(e) => setForm((s) => ({ ...s, tel: e.target.value }))}
                    placeholder="08xxxxxxxx"
                    inputMode="tel"
                  />
                </div>
              </div>
              {!form.isExternal && (
                <div className="grid gap-1.5">
                  <Label htmlFor="wo-emp">รหัสพนักงาน (Optional)</Label>
                  <Input
                    id="wo-emp"
                    value={form.employeeCode}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, employeeCode: e.target.value }))
                    }
                    placeholder="เช่น EMP001"
                  />
                </div>
              )}
              {!form.isExternal && (
                <div className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  ระบบจะตรวจสอบชื่อ + เบอร์โทรกับสมุดผู้ติดต่อ (ContactDirectory)
                  หากไม่ตรงจะไม่สามารถส่งใบแจ้งซ่อมได้
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={onSubmit}
            disabled={saving || !form.subject.trim() || form.subject === '__custom__'}
            className="bg-orange-500 hover:bg-orange-600"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            บันทึกใบแจ้งซ่อม
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Detail Dialog
// ============================================================
function WorkOrderDetailDialog({
  id,
  onOpenChange,
  resolutions,
}: {
  id: string | null
  onOpenChange: (open: boolean) => void
  resolutions: ResolutionOption[]
}) {
  const qc = useQueryClient()
  const open = Boolean(id)

  // Detail query (only when an id is selected)
  const detailQuery = useQuery<WorkOrderDetail>({
    queryKey: ['work-order', id],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${id}`)
      if (!res.ok) throw new Error('Failed to load work order')
      const json = await res.json()
      return json.data as WorkOrderDetail
    },
    enabled: Boolean(id),
  })

  const wo = detailQuery.data

  // Invalidate list when detail changes (action happened)
  function refreshAll() {
    qc.invalidateQueries({ queryKey: ['work-orders'] })
    qc.invalidateQueries({ queryKey: ['work-order', id] })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-[760px]">
        {detailQuery.isLoading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !wo ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            ไม่พบใบงาน
          </div>
        ) : (
          <WorkOrderDetailContent
            wo={wo}
            onMutated={refreshAll}
            onClose={() => onOpenChange(false)}
            resolutions={resolutions}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function WorkOrderDetailContent({
  wo,
  onMutated,
  onClose,
  resolutions,
}: {
  wo: WorkOrderDetail
  onMutated: () => void
  onClose: () => void
  resolutions: ResolutionOption[]
}) {
  // Assign technician
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [techName, setTechName] = React.useState(wo.assignedTo ?? '')
  const [assignNote, setAssignNote] = React.useState(wo.assignmentNote ?? '')
  const [assigning, setAssigning] = React.useState(false)

  // Complete
  const [completeOpen, setCompleteOpen] = React.useState(false)
  const [completeNote, setCompleteNote] = React.useState('')
  const [completing, setCompleting] = React.useState(false)
  const [resolutionValue, setResolutionValue] = React.useState<string>(wo.resolution ?? '')
  const [resolutionGroup, setResolutionGroup] = React.useState<string>(wo.resolutionGroup ?? '')
  const [picAfter, setPicAfter] = React.useState<string | null>(wo.picAfter ?? null)
  const picAfterInputRef = React.useRef<HTMLInputElement>(null)

  // Cancel
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [cancelReason, setCancelReason] = React.useState('')
  const [canceling, setCanceling] = React.useState(false)

  // Reporter edit
  const [reporterEditOpen, setReporterEditOpen] = React.useState(false)
  const [reporterEdit, setReporterEdit] = React.useState({
    verifyName: wo.reporterName ?? '',
    verifyPhone: wo.tel ?? '',
    employeeCode: wo.employeeCode ?? '',
    subject: wo.subject,
    building: wo.building ?? '',
    location: wo.location ?? '',
    details: wo.details ?? '',
    tel: wo.tel ?? '',
  })
  const [reporterEditSaving, setReporterEditSaving] = React.useState(false)

  // Chat
  const [chatText, setChatText] = React.useState('')
  const [sendingMsg, setSendingMsg] = React.useState(false)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const messages = wo.messages ?? []

  // ── Parts (เบิกอะไหล่) ──
  const [partsOpen, setPartsOpen] = React.useState(false)
  const [partsRequester, setPartsRequester] = React.useState('')
  const [partsSearch, setPartsSearch] = React.useState('')
  const [partsLines, setPartsLines] = React.useState<
    { productCode: string; productName: string; quantity: string; remark: string }[]
  >([])
  const [partsSaving, setPartsSaving] = React.useState(false)
  const [partsSearchResults, setPartsSearchResults] = React.useState<PartsStockItem[]>([])
  const [partsSearchLoading, setPartsSearchLoading] = React.useState(false)

  // Approve / reject parts (inline)
  const [approvingTxnId, setApprovingTxnId] = React.useState<string | null>(null)
  const [rejectingTxnId, setRejectingTxnId] = React.useState<string | null>(null)
  const [rejectReason, setRejectReason] = React.useState('')

  // Parts list query (always on for the detail view)
  const partsQuery = useQuery<PartsListResponse>({
    queryKey: ['wo-parts', wo.id],
    queryFn: async () => {
      const res = await fetch(`/api/work-orders/${wo.id}/parts`)
      if (!res.ok) throw new Error('Failed to load parts')
      return res.json()
    },
  })
  const partsList: PartsTransaction[] = partsQuery.data?.data ?? []
  const partsSummary = partsQuery.data?.summary

  React.useEffect(() => {
    if (partsOpen) {
      // Reset the parts form when the dialog opens
      setPartsRequester('')
      setPartsSearch('')
      setPartsLines([])
      setPartsSearchResults([])
    }
  }, [partsOpen])

  // Debounced parts search
  React.useEffect(() => {
    if (!partsSearch.trim()) {
      setPartsSearchResults([])
      return
    }
    let cancelled = false
    setPartsSearchLoading(true)
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ search: partsSearch.trim(), pageSize: '20' })
        const res = await fetch(`/api/stock-items?${params.toString()}`)
        if (!res.ok) return
        const json: PartsListApiResponse = await res.json()
        if (!cancelled) setPartsSearchResults(json.data ?? [])
      } catch {
        if (!cancelled) setPartsSearchResults([])
      } finally {
        if (!cancelled) setPartsSearchLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [partsSearch])

  React.useEffect(() => {
    // sync tech name when WO changes
    setTechName(wo.assignedTo ?? '')
    setAssignNote(wo.assignmentNote ?? '')
    setResolutionValue(wo.resolution ?? '')
    setResolutionGroup(wo.resolutionGroup ?? '')
    setPicAfter(wo.picAfter ?? null)
    setReporterEdit({
      verifyName: wo.reporterName ?? '',
      verifyPhone: wo.tel ?? '',
      employeeCode: wo.employeeCode ?? '',
      subject: wo.subject,
      building: wo.building ?? '',
      location: wo.location ?? '',
      details: wo.details ?? '',
      tel: wo.tel ?? '',
    })
  }, [wo.id, wo.assignedTo, wo.assignmentNote, wo.resolution, wo.resolutionGroup, wo.picAfter, wo.reporterName, wo.tel, wo.employeeCode, wo.subject, wo.building, wo.location, wo.details])

  React.useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  const external = parseExternalMeta(wo.externalMeta)

  const canAssign = wo.status === 'PENDING' || wo.status === 'IN_PROGRESS' || wo.status === 'WAITING_PARTS'
  const canComplete = wo.status === 'IN_PROGRESS' || wo.status === 'WAITING_PARTS'
  const canCancel = wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED'
  const canChat = wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED'
  const canReporterEdit = wo.status === 'PENDING'
  const canRequestParts = wo.status === 'IN_PROGRESS' || wo.status === 'WAITING_PARTS'

  // Resolution groups for the dropdown
  const resolutionGroups = React.useMemo(() => {
    const map = new Map<string, ResolutionOption[]>()
    for (const r of resolutions) {
      if (!map.has(r.group)) map.set(r.group, [])
      map.get(r.group)!.push(r)
    }
    return Array.from(map.entries())
  }, [resolutions])

  async function handleAssign() {
    if (!techName.trim()) {
      toast.error('กรุณาระบุชื่อช่าง')
      return
    }
    try {
      setAssigning(true)
      const res = await fetch(`/api/work-orders/${wo.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignedTo: techName.trim(),
          assignmentNote: assignNote.trim() || null,
          actor: 'admin',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'มอบหมายไม่สำเร็จ')
      }
      toast.success(`มอบหมายให้ ${techName.trim()} แล้ว`)
      setAssignOpen(false)
      onMutated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'มอบหมายไม่สำเร็จ')
    } finally {
      setAssigning(false)
    }
  }

  async function handlePicAfterChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await compressImage(file)
      setPicAfter(dataUrl)
    } catch {
      toast.error('อ่านไฟล์รูปไม่สำเร็จ')
    } finally {
      if (picAfterInputRef.current) picAfterInputRef.current.value = ''
    }
  }

  async function handleComplete() {
    try {
      setCompleting(true)
      // Look up group for the chosen resolution
      let group = ''
      if (resolutionValue) {
        const opt = resolutions.find((r) => r.value === resolutionValue)
        group = opt?.group ?? ''
      }
      const res = await fetch(`/api/work-orders/${wo.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: completeNote.trim() || null,
          resolution: resolutionValue || null,
          resolutionGroup: group || null,
          picAfter: picAfter,
          actor: 'admin',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'ปิดงานไม่สำเร็จ')
      }
      toast.success('ปิดงานเรียบร้อย')
      setCompleteOpen(false)
      setCompleteNote('')
      onMutated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ปิดงานไม่สำเร็จ')
    } finally {
      setCompleting(false)
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) {
      toast.error('กรุณาระบุเหตุผลในการยกเลิก')
      return
    }
    try {
      setCanceling(true)
      const res = await fetch(`/api/work-orders/${wo.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: cancelReason.trim(),
          actor: 'admin',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'ยกเลิกไม่สำเร็จ')
      }
      toast.success('ยกเลิกใบงานแล้ว')
      setCancelOpen(false)
      setCancelReason('')
      onMutated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ยกเลิกไม่สำเร็จ')
    } finally {
      setCanceling(false)
    }
  }

  async function handleReporterEdit() {
    if (!reporterEdit.verifyName.trim() || !reporterEdit.verifyPhone.trim()) {
      toast.error('ต้องระบุชื่อและเบอร์โทรของผู้แจ้งเพื่อยืนยันตัวตน')
      return
    }
    try {
      setReporterEditSaving(true)
      const res = await fetch(`/api/work-orders/${wo.id}/reporter-edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifyName: reporterEdit.verifyName.trim(),
          verifyPhone: reporterEdit.verifyPhone.trim(),
          employeeCode: reporterEdit.employeeCode.trim() || undefined,
          subject: reporterEdit.subject.trim() || undefined,
          building: reporterEdit.building.trim() || null,
          location: reporterEdit.location.trim() || null,
          details: reporterEdit.details.trim() || null,
          tel: reporterEdit.tel.trim() || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'แก้ไขไม่สำเร็จ')
      }
      toast.success('แก้ไขใบงานเรียบร้อย')
      setReporterEditOpen(false)
      onMutated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'แก้ไขไม่สำเร็จ')
    } finally {
      setReporterEditSaving(false)
    }
  }

  async function handleSendMessage() {
    const text = chatText.trim()
    if (!text) return
    try {
      setSendingMsg(true)
      const res = await fetch(`/api/work-orders/${wo.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          author: 'admin',
          authorRole: 'admin',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'ส่งข้อความไม่สำเร็จ')
      }
      setChatText('')
      onMutated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ส่งข้อความไม่สำเร็จ')
    } finally {
      setSendingMsg(false)
    }
  }

  // ── Parts request (เบิกอะไหล่) ──
  function addPartsLine(item: PartsStockItem) {
    // Skip if already in list
    if (partsLines.some((l) => l.productCode === item.productCode)) {
      toast.error(`${item.productCode} มีอยู่ในรายการแล้ว`)
      return
    }
    setPartsLines((prev) => [
      ...prev,
      {
        productCode: item.productCode,
        productName: item.productName,
        quantity: '1',
        remark: '',
      },
    ])
    setPartsSearch('')
    setPartsSearchResults([])
  }
  function removePartsLine(idx: number) {
    setPartsLines((prev) => prev.filter((_, i) => i !== idx))
  }
  function updatePartsLine(
    idx: number,
    key: 'quantity' | 'remark',
    value: string,
  ) {
    setPartsLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)),
    )
  }
  async function handleRequestParts() {
    const valid = partsLines.filter((l) => Number(l.quantity) > 0)
    if (valid.length === 0) {
      toast.error('ต้องเพิ่มอย่างน้อย 1 รายการอะไหล่ พร้อมจำนวนที่ถูกต้อง')
      return
    }
    try {
      setPartsSaving(true)
      const res = await fetch(`/api/work-orders/${wo.id}/parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester: partsRequester.trim() || undefined,
          items: valid.map((l) => ({
            productCode: l.productCode,
            quantity: Number(l.quantity),
            remark: l.remark.trim() || undefined,
          })),
          actor: 'admin',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'เบิกอะไหล่ไม่สำเร็จ')
      }
      const json = await res.json()
      toast.success(
        `สร้างคำขอเบิกอะไหล่ ${json.data?.created ?? valid.length} รายการ — สถานะใบงาน: ${
          json.data?.workOrderStatus === 'WAITING_PARTS' ? 'รออะไหล่' : json.data?.workOrderStatus
        }`,
      )
      setPartsOpen(false)
      onMutated()
      qc.invalidateQueries({ queryKey: ['wo-parts', wo.id] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'เบิกอะไหล่ไม่สำเร็จ')
    } finally {
      setPartsSaving(false)
    }
  }

  async function handleApprovePart(txnId: string) {
    try {
      setApprovingTxnId(txnId)
      const res = await fetch(`/api/work-orders/${wo.id}/parts/${txnId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approver: 'admin' }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'อนุมัติไม่สำเร็จ')
      }
      toast.success('อนุมัติเบิกอะไหล่เรียบร้อย')
      qc.invalidateQueries({ queryKey: ['wo-parts', wo.id] })
      qc.invalidateQueries({ queryKey: ['stock-items'] })
      qc.invalidateQueries({ queryKey: ['stock-pending'] })
      onMutated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'อนุมัติไม่สำเร็จ')
    } finally {
      setApprovingTxnId(null)
    }
  }

  async function handleRejectPart(txn: PartsTransaction) {
    if (!rejectReason.trim()) {
      toast.error('กรุณาระบุเหตุผลในการปฏิเสธ')
      return
    }
    try {
      setRejectingTxnId(txn.id)
      // Reject goes through the stock-items pending route (id = stockItemId)
      const res = await fetch(
        `/api/stock-items/${txn.stockItemId}/pending/${txn.id}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            approver: 'admin',
            reason: rejectReason.trim(),
          }),
        },
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'ปฏิเสธไม่สำเร็จ')
      }
      toast.success('ปฏิเสธคำขอเบิกอะไหล่เรียบร้อย')
      setRejectingTxnId(null)
      setRejectReason('')
      qc.invalidateQueries({ queryKey: ['wo-parts', wo.id] })
      qc.invalidateQueries({ queryKey: ['stock-pending'] })
      onMutated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ปฏิเสธไม่สำเร็จ')
    } finally {
      setRejectingTxnId(null)
    }
  }

  // Build timeline from key WO timestamps + messages
  const timeline: Array<{ key: string; label: string; at: string | null; tone: 'info' | 'success' | 'warning' | 'danger' | 'muted' }> = [
    { key: 'created', label: 'แจ้งซ่อมใหม่', at: wo.createdAt, tone: 'info' },
    { key: 'assigned', label: wo.assignedTo ? `มอบหมายให้ ${wo.assignedTo}` : 'มอบหมาย', at: wo.assignedAt, tone: wo.assignedAt ? 'info' : 'muted' },
    { key: 'completed', label: 'ปิดงาน', at: wo.workCompletedAt ?? wo.closedAt, tone: wo.workCompletedAt ? 'success' : 'muted' },
    { key: 'cancelled', label: wo.cancelReason ? `ยกเลิก — ${wo.cancelReason}` : 'ยกเลิก', at: wo.canceledAt, tone: wo.canceledAt ? 'danger' : 'muted' },
  ].filter((t) => t.at !== null || t.key === 'created')

  return (
    <div className="flex max-h-[92vh] flex-col">
      {/* Header */}
      <div className="space-y-2 border-b px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-semibold text-muted-foreground">
            {wo.woNumber ?? '—'}
          </span>
          <div className="flex items-center gap-1">
            {external && (
              <Badge
                className="border-teal-200 bg-teal-100 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300"
                variant="outline"
              >
                งานนอก
              </Badge>
            )}
            <Badge className={statusBadgeClass(wo.status)} variant="outline">
              {statusLabel(wo.status)}
            </Badge>
          </div>
        </div>
        <h2 className="text-lg font-bold leading-tight">{wo.subject}</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" />
            {formatDateTime(wo.createdAt)}
          </span>
          <span aria-hidden>•</span>
          <Badge className={priorityBadgeClass(wo.priority)} variant="outline">
            {wo.priority}
          </Badge>
          <span className="text-[10px] uppercase tracking-wide">
            ({wo.submissionSource === 'session' ? 'ล็อกอิน' : 'guest'})
          </span>
        </div>
      </div>

      {/* Body — scrollable */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="space-y-4 px-5 py-4">
          {/* External block */}
          {external && (
            <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-800 dark:bg-teal-950/30">
              <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-300">
                <PackageOpen className="h-3.5 w-3.5" />
                ข้อมูลลูกค้าภายนอก
              </div>
              <div className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                {external.clientName && (
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground">ลูกค้า</span>
                    <div className="font-medium">{external.clientName}</div>
                  </div>
                )}
                {external.place && (
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground">สถานที่</span>
                    <div className="font-medium">{external.place}</div>
                  </div>
                )}
                {external.contactPhone && (
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground">เบอร์ติดต่อ</span>
                    <div className="font-medium">{external.contactPhone}</div>
                  </div>
                )}
              </div>
              {external.serials && external.serials.length > 0 && (
                <div className="mt-2">
                  <div className="mb-1 text-[10px] uppercase text-muted-foreground">S/N</div>
                  <div className="flex flex-wrap gap-1.5">
                    {external.serials.map((s) => (
                      <Badge key={s} variant="outline" className="gap-1 font-mono text-[11px]">
                        <Hash className="h-3 w-3" />
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Info grid */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {!external && (
              <>
                <InfoRow
                  icon={<MapPin className="h-4 w-4" />}
                  label="อาคาร / ฝ่าย"
                  value={wo.building ?? '—'}
                />
                <InfoRow
                  icon={<MapPin className="h-4 w-4" />}
                  label="ตำแหน่ง"
                  value={wo.location ?? '—'}
                />
              </>
            )}
            <InfoRow
              icon={<User className="h-4 w-4" />}
              label="ผู้แจ้ง"
              value={wo.reporterName ?? '—'}
            />
            <InfoRow
              icon={<Phone className="h-4 w-4" />}
              label="เบอร์โทร"
              value={wo.tel ?? '—'}
            />
            {wo.employeeCode && (
              <InfoRow
                icon={<Hash className="h-4 w-4" />}
                label="รหัสพนักงาน"
                value={wo.employeeCode}
              />
            )}
            {wo.device && (
              <InfoRow
                icon={<ClipboardList className="h-4 w-4" />}
                label="เลขทะเบียนอุปกรณ์"
                value={`${wo.device.assetCode} — ${wo.device.name}`}
              />
            )}
            <InfoRow
              icon={<User className="h-4 w-4" />}
              label="ช่างผู้รับผิดชอบ"
              value={wo.assignedTo ?? '—'}
            />
            <InfoRow
              icon={<CalendarClock className="h-4 w-4" />}
              label="มอบหมายเมื่อ"
              value={wo.assignedAt ? formatDateTime(wo.assignedAt) : '—'}
            />
            {wo.assignedBy && (
              <InfoRow
                icon={<User className="h-4 w-4" />}
                label="มอบหมายโดย"
                value={wo.assignedBy}
              />
            )}
            {wo.workCompletedAt && (
              <InfoRow
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="ปิดงานเมื่อ"
                value={formatDateTime(wo.workCompletedAt)}
              />
            )}
            {wo.closedAt && wo.closedAt !== wo.workCompletedAt && (
              <InfoRow
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="ปิดเรื่องเมื่อ"
                value={formatDateTime(wo.closedAt)}
              />
            )}
          </div>

          {/* Assignment note */}
          {wo.assignmentNote && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="mb-1 text-xs font-semibold text-muted-foreground">
                หมายเหตุการมอบหมาย
              </div>
              <p className="whitespace-pre-wrap">{wo.assignmentNote}</p>
            </div>
          )}

          {/* Details */}
          {wo.details && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="mb-1 text-xs font-semibold text-muted-foreground">
                รายละเอียดปัญหา
              </div>
              <p className="whitespace-pre-wrap text-sm">{wo.details}</p>
            </div>
          )}

          {/* Admin note + Resolution */}
          {(wo.detailsAdmin || wo.resolution) && (
            <div className="space-y-2">
              {wo.resolution && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
                  <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    ผลการแก้ไข
                    {wo.resolutionGroup && (
                      <span className="ml-1 rounded bg-emerald-200/60 px-1.5 py-0.5 text-[10px] dark:bg-emerald-900/60">
                        {wo.resolutionGroup}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap">{wo.resolution}</p>
                </div>
              )}
              {wo.detailsAdmin && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm dark:border-orange-800 dark:bg-orange-950/40">
                  <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-orange-700 dark:text-orange-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    หมายเหตุช่าง
                  </div>
                  <p className="whitespace-pre-wrap">{wo.detailsAdmin}</p>
                </div>
              )}
            </div>
          )}

          {/* Cancel reason */}
          {wo.status === 'CANCELLED' && wo.cancelReason && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm dark:border-rose-800 dark:bg-rose-950/40">
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
                <XCircle className="h-3.5 w-3.5" />
                เหตุผลการยกเลิก
              </div>
              <p className="whitespace-pre-wrap">{wo.cancelReason}</p>
            </div>
          )}

          {/* Edit-unlock info */}
          {wo.editUnlockActive && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
              <div className="mb-1 flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300">
                <Edit3 className="h-3.5 w-3.5" />
                ปลดล็อกให้ผู้แจ้งแก้ไข
              </div>
              <div>
                ปลดล็อกโดย: {wo.editUnlockBy ?? '—'} • {wo.editUnlockAt ? formatDateTime(wo.editUnlockAt) : '—'}
              </div>
              {wo.editUnlockNote && <div className="mt-0.5">หมายเหตุ: {wo.editUnlockNote}</div>}
            </div>
          )}

          {/* Parts list (เบิกอะไหล่) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Box className="h-3.5 w-3.5" />
                รายการเบิกอะไหล่
                {partsSummary && partsSummary.total > 0 && (
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    รอ {partsSummary.pending} • อนุมัติ {partsSummary.approved} • ปฏิเสธ {partsSummary.rejected}
                  </Badge>
                )}
              </div>
              {canRequestParts && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPartsOpen(true)}
                  className="h-7 border-purple-300 px-2 text-[11px] text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950/40"
                >
                  <Package className="mr-1 h-3 w-3" />
                  เบิกอะไหล่
                </Button>
              )}
            </div>

            {partsQuery.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : partsList.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                ยังไม่มีรายการเบิกอะไหล่สำหรับใบงานนี้
                {canRequestParts && ' — กดปุ่ม "เบิกอะไหล่" เพื่อสร้างคำขอ'}
              </p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border bg-card p-2">
                {partsList.map((p) => {
                  const status = p.approvalStatus ?? 'APPROVED'
                  const stockItem = p.stockItem
                  return (
                    <div
                      key={p.id}
                      className="rounded-md border bg-background p-2.5 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                              {p.productCode ?? '—'}
                            </span>
                            <span className="truncate font-medium">
                              {p.productName ?? stockItem?.productName ?? '—'}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            เลขที่: {p.txnNumber ?? '—'} • จำนวน:{' '}
                            <span className="font-semibold text-foreground">
                              {p.quantity} {p.unit ?? ''}
                            </span>
                            {stockItem && (
                              <>
                                {' '}• คงเหลือในสต็อก:{' '}
                                <span
                                  className={
                                    stockItem.quantity < p.quantity
                                      ? 'font-semibold text-rose-600 dark:text-rose-400'
                                      : 'font-semibold text-foreground'
                                  }
                                >
                                  {stockItem.quantity} {stockItem.unit}
                                </span>
                              </>
                            )}
                          </div>
                          {p.remark && (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              หมายเหตุ: {p.remark}
                            </div>
                          )}
                          {p.rejectReason && (
                            <div className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400">
                              เหตุผลที่ปฏิเสธ: {p.rejectReason}
                            </div>
                          )}
                          {p.approver && (
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              โดย: {p.approver}
                              {p.approvedAt && ` • ${formatDateTime(p.approvedAt)}`}
                            </div>
                          )}
                        </div>
                        <PartsStatusBadge status={status} />
                      </div>
                      {status === 'PENDING' && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleApprovePart(p.id)}
                            disabled={approvingTxnId === p.id}
                            className="h-7 border-emerald-300 px-2 text-[11px] text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                          >
                            {approvingTxnId === p.id ? (
                              <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="mr-1 h-3 w-3" />
                            )}
                            อนุมัติ
                          </Button>
                          {rejectingTxnId === p.id ? (
                            <div className="flex flex-1 items-center gap-1">
                              <Input
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="เหตุผลที่ปฏิเสธ"
                                className="h-7 flex-1 text-[11px]"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRejectPart(p)}
                                disabled={!rejectReason.trim()}
                                className="h-7 border-rose-300 px-2 text-[11px] text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
                              >
                                ยืนยัน
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setRejectingTxnId(null)
                                  setRejectReason('')
                                }}
                                className="h-7 px-2 text-[11px]"
                              >
                                ยกเลิก
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRejectingTxnId(p.id)
                                setRejectReason('')
                              }}
                              className="h-7 border-rose-300 px-2 text-[11px] text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
                            >
                              <XCircle className="mr-1 h-3 w-3" />
                              ปฏิเสธ
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {partsSummary && partsSummary.pending > 0 && (
              <div className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                ⚠️ ยังปิดงานไม่ได้ — มีคำขอเบิกอะไหล่ {partsSummary.pending} รายการที่รออนุมัติ
              </div>
            )}
          </div>

          {/* Images */}
          {(wo.picBefore || wo.picOnsite || wo.picAfter) && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <ImageIcon className="h-3.5 w-3.5" />
                รูปภาพ
              </div>
              <div className="grid grid-cols-3 gap-2">
                <WoImage label="ก่อน" src={wo.picBefore} />
                <WoImage label="ระหว่าง" src={wo.picOnsite} />
                <WoImage label="หลัง" src={wo.picAfter} />
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">
              ไทม์ไลน์
            </div>
            <ol className="relative space-y-3 border-l-2 border-muted pl-4">
              {timeline.map((t) => (
                <li key={t.key} className="relative">
                  <span
                    className={`absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-background ${
                      t.tone === 'success'
                        ? 'bg-emerald-500'
                        : t.tone === 'danger'
                          ? 'bg-rose-500'
                          : t.tone === 'warning'
                            ? 'bg-amber-500'
                            : t.tone === 'info'
                              ? 'bg-orange-500'
                              : 'bg-slate-300'
                    }`}
                  />
                  <div className="text-sm font-medium">{t.label}</div>
                  {t.at && (
                    <div className="text-[11px] text-muted-foreground">
                      {formatDateTime(t.at)}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>

          {/* Chat */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              ข้อความ ({messages.length})
            </div>
            {messages.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                ยังไม่มีข้อความในใบงานนี้
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-3">
                {messages.map((m) => {
                  const isSystem = m.authorRole === 'system'
                  return (
                    <div
                      key={m.id}
                      className={`flex ${isSystem ? 'justify-center' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          isSystem
                            ? 'bg-muted text-muted-foreground'
                            : m.authorRole === 'admin'
                              ? 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100'
                              : m.authorRole === 'reporter'
                                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100'
                                : 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100'
                        }`}
                      >
                        {!isSystem && (
                          <div className="mb-0.5 text-[10px] font-semibold opacity-70">
                            {m.author ?? '—'} · {m.authorRole ?? 'staff'}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.message}</p>
                        <div className="mt-0.5 text-right text-[10px] opacity-60">
                          {relativeTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
            {canChat && (
              <div className="flex items-center gap-2">
                <Input
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="พิมพ์ข้อความ..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  disabled={sendingMsg}
                />
                <Button
                  size="sm"
                  onClick={handleSendMessage}
                  disabled={sendingMsg || !chatText.trim()}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  {sendingMsg ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Footer actions */}
      <div className="flex flex-wrap items-center gap-2 border-t px-5 py-3">
        {canReporterEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReporterEditOpen(true)}
            className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950"
          >
            <Edit3 className="h-4 w-4" />
            ผู้แจ้งแก้ไข
          </Button>
        )}
        {canAssign && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAssignOpen(true)}
            className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950"
          >
            <User className="h-4 w-4" />
            {wo.assignedTo ? 'เปลี่ยนช่าง' : 'มอบหมายช่าง'}
          </Button>
        )}
        {canRequestParts && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPartsOpen(true)}
            className="border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-950"
          >
            <Package className="h-4 w-4" />
            เบิกอะไหล่
          </Button>
        )}
        {canComplete && (
          <Button
            size="sm"
            onClick={() => setCompleteOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            ปิดงาน
          </Button>
        )}
        {canCancel && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCancelOpen(true)}
            className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950"
          >
            <XCircle className="h-4 w-4" />
            ยกเลิก
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onClose}>
          ปิด
        </Button>
      </div>

      {/* Assign dialog */}
      <AlertDialog open={assignOpen} onOpenChange={setAssignOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>มอบหมายช่าง</AlertDialogTitle>
            <AlertDialogDescription>
              ระบุชื่อช่างที่จะรับผิดชอบใบงาน {wo.woNumber}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="tech-name">ชื่อช่าง</Label>
              <Input
                id="tech-name"
                value={techName}
                onChange={(e) => setTechName(e.target.value)}
                placeholder="เช่น คุณสมชาย"
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="assign-note">หมายเหตุ (ถ้ามี)</Label>
              <Textarea
                id="assign-note"
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
                placeholder="เช่น นัดเข้าไปตรวจสอบวันที่..."
                className="min-h-[60px]"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assigning}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              disabled={assigning || !techName.trim()}
              onClick={(e) => {
                e.preventDefault()
                handleAssign()
              }}
            >
              {assigning ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : null}
              มอบหมาย
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Complete dialog */}
      <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>ปิดงาน</AlertDialogTitle>
            <AlertDialogDescription>
              ยืนยันการปิดงาน {wo.woNumber} — สถานะจะเปลี่ยนเป็น &quot;เสร็จแล้ว&quot;
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="complete-resolution">ผลการแก้ไข</Label>
              {resolutions.length === 0 ? (
                <Input
                  id="complete-resolution"
                  value={resolutionValue}
                  onChange={(e) => setResolutionValue(e.target.value)}
                  placeholder="พิมพ์ผลการแก้ไข"
                />
              ) : (
                <Select
                  value={resolutionValue}
                  onValueChange={(v) => {
                    setResolutionValue(v)
                    const opt = resolutions.find((r) => r.value === v)
                    setResolutionGroup(opt?.group ?? '')
                  }}
                >
                  <SelectTrigger id="complete-resolution">
                    <SelectValue placeholder="เลือกผลการแก้ไข" />
                  </SelectTrigger>
                  <SelectContent>
                    {resolutionGroups.map(([group, opts]) => (
                      <SelectGroup key={group}>
                        <SelectLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {group}
                        </SelectLabel>
                        {opts.map((o) => (
                          <SelectItem key={group + '|' + o.value} value={o.value}>
                            {o.value}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="complete-note">หมายเหตุการซ่อม</Label>
              <Textarea
                id="complete-note"
                value={completeNote}
                onChange={(e) => setCompleteNote(e.target.value)}
                placeholder="เช่น เปลี่ยนหมึก, แก้ไขการตั้งค่าเครือข่าย..."
                className="min-h-[80px]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="complete-pic-after">รูปหลังซ่อม (Optional)</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={picAfterInputRef}
                  id="complete-pic-after"
                  type="file"
                  accept="image/*"
                  onChange={handlePicAfterChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => picAfterInputRef.current?.click()}
                >
                  <ImageIcon className="h-4 w-4" />
                  {picAfter ? 'เปลี่ยนรูป' : 'เลือกรูป'}
                </Button>
                {picAfter && (
                  <div className="flex items-center gap-1">
                    <img
                      src={picAfter}
                      alt="pic-after"
                      className="h-8 w-8 rounded border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPicAfter(null)}
                      className="text-[11px] text-rose-500 underline"
                    >
                      ลบ
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={completing}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              disabled={completing}
              onClick={(e) => {
                e.preventDefault()
                handleComplete()
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {completing ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              ปิดงาน
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยกเลิกใบงาน</AlertDialogTitle>
            <AlertDialogDescription>
              ยืนยันการยกเลิกใบงาน {wo.woNumber} — ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5 py-2">
            <Label htmlFor="cancel-reason">
              เหตุผลการยกเลิก <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="เช่น ผู้แจ้งขอถอน, ซ่อมเองได้แล้ว, ไม่ใช่ปัญหาจริง..."
              className="min-h-[80px]"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={canceling}>ปิด</AlertDialogCancel>
            <AlertDialogAction
              disabled={canceling || !cancelReason.trim()}
              onClick={(e) => {
                e.preventDefault()
                handleCancel()
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {canceling ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              ยกเลิกใบงาน
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reporter edit dialog */}
      <Dialog open={reporterEditOpen} onOpenChange={setReporterEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-amber-500" />
              ผู้แจ้งแก้ไขใบงานเอง
            </DialogTitle>
            <DialogDescription>
              สามารถแก้ไขได้เฉพาะใบงานที่ยังไม่ถูกรับ (สถานะ PENDING)
              ต้องยืนยันตัวตนด้วยชื่อ + เบอร์โทรของผู้แจ้ง
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="re-verify-name">
                  ชื่อผู้แจ้ง <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="re-verify-name"
                  value={reporterEdit.verifyName}
                  onChange={(e) =>
                    setReporterEdit((s) => ({ ...s, verifyName: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="re-verify-phone">
                  เบอร์โทร <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="re-verify-phone"
                  value={reporterEdit.verifyPhone}
                  onChange={(e) =>
                    setReporterEdit((s) => ({ ...s, verifyPhone: e.target.value }))
                  }
                  inputMode="tel"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="re-emp">รหัสพนักงาน (Optional)</Label>
              <Input
                id="re-emp"
                value={reporterEdit.employeeCode}
                onChange={(e) =>
                  setReporterEdit((s) => ({ ...s, employeeCode: e.target.value }))
                }
              />
            </div>
            <div className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              ชื่อ + เบอร์โทรต้องตรงกับสมุดผู้ติดต่อ และตรงกับผู้แจ้งในใบงานนี้
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="re-subject">ประเภทปัญหา</Label>
              <Input
                id="re-subject"
                value={reporterEdit.subject}
                onChange={(e) =>
                  setReporterEdit((s) => ({ ...s, subject: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="re-building">อาคาร / ฝ่าย</Label>
                <Input
                  id="re-building"
                  value={reporterEdit.building}
                  onChange={(e) =>
                    setReporterEdit((s) => ({ ...s, building: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="re-location">ตำแหน่ง</Label>
                <Input
                  id="re-location"
                  value={reporterEdit.location}
                  onChange={(e) =>
                    setReporterEdit((s) => ({ ...s, location: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="re-details">รายละเอียด</Label>
              <Textarea
                id="re-details"
                value={reporterEdit.details}
                onChange={(e) =>
                  setReporterEdit((s) => ({ ...s, details: e.target.value }))
                }
                className="min-h-[80px]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="re-tel">เบอร์โทรใหม่</Label>
              <Input
                id="re-tel"
                value={reporterEdit.tel}
                onChange={(e) =>
                  setReporterEdit((s) => ({ ...s, tel: e.target.value }))
                }
                inputMode="tel"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReporterEditOpen(false)}
              disabled={reporterEditSaving}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={handleReporterEdit}
              disabled={reporterEditSaving}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {reporterEditSaving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Edit3 className="h-4 w-4" />
              )}
              บันทึกการแก้ไข
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Parts request dialog (เบิกอะไหล่) ── */}
      <Dialog open={partsOpen} onOpenChange={setPartsOpen}>
        <DialogContent className="max-h-[92vh] overflow-hidden sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-purple-500" />
              เบิกอะไหล่ — {wo.woNumber ?? '—'}
            </DialogTitle>
            <DialogDescription>
              ค้นหาอะไหล่ที่ต้องการ ระบุจำนวน แล้วกดบันทึก — ระบบจะสร้างคำขอรออนุมัติ
              (หากยังไม่มีอะไหล่รอ สถานะใบงานจะเปลี่ยนเป็น &quot;รออะไหล่&quot;)
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[68vh]">
            <div className="grid gap-3 px-1 py-1">
              {/* Requester */}
              <div className="grid gap-1.5">
                <Label htmlFor="parts-requester">ผู้เบิก (Optional)</Label>
                <Input
                  id="parts-requester"
                  value={partsRequester}
                  onChange={(e) => setPartsRequester(e.target.value)}
                  placeholder="ชื่อช่าง / ผู้เบิก"
                />
              </div>

              {/* Search products */}
              <div className="grid gap-1.5">
                <Label htmlFor="parts-search">ค้นหาสินค้า</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="parts-search"
                    value={partsSearch}
                    onChange={(e) => setPartsSearch(e.target.value)}
                    placeholder="พิมพ์รหัสสินค้า / ชื่อ / แบรนด์"
                    className="pl-9"
                    autoFocus
                  />
                </div>
                {partsSearchLoading && (
                  <div className="text-[11px] text-muted-foreground">
                    กำลังค้นหา...
                  </div>
                )}
                {!partsSearchLoading && partsSearchResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-md border bg-card">
                    {partsSearchResults.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => addPartsLine(it)}
                        disabled={!it.active}
                        className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-mono font-semibold text-purple-600 dark:text-purple-400">
                            {it.productCode}
                          </div>
                          <div className="truncate text-muted-foreground">
                            {it.productName}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>
                            คงเหลือ: {it.quantity} {it.unit}
                          </span>
                          <Plus className="h-3 w-3 text-purple-500" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {!partsSearchLoading &&
                  partsSearch.trim() &&
                  partsSearchResults.length === 0 && (
                    <div className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">
                      ไม่พบสินค้าที่ตรงกับ &quot;{partsSearch}&quot;
                    </div>
                  )}
              </div>

              {/* Selected parts list */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>รายการที่เบิก ({partsLines.length})</Label>
                </div>
                {partsLines.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    ยังไม่ได้เลือกอะไหล่ — ค้นหาแล้วกด + เพื่อเพิ่ม
                  </div>
                ) : (
                  <div className="space-y-2">
                    {partsLines.map((line, idx) => (
                      <div
                        key={`${line.productCode}-${idx}`}
                        className="grid grid-cols-12 gap-2 rounded-md border bg-muted/30 p-2"
                      >
                        <div className="col-span-12 sm:col-span-6">
                          <div className="font-mono text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                            {line.productCode}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {line.productName}
                          </div>
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) =>
                              updatePartsLine(idx, 'quantity', e.target.value)
                            }
                            className="h-8 text-xs"
                            placeholder="จำนวน"
                          />
                        </div>
                        <div className="col-span-7 sm:col-span-3">
                          <Input
                            value={line.remark}
                            onChange={(e) =>
                              updatePartsLine(idx, 'remark', e.target.value)
                            }
                            className="h-8 text-xs"
                            placeholder="หมายเหตุ"
                          />
                        </div>
                        <div className="col-span-1 flex items-center justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            onClick={() => removePartsLine(idx)}
                            aria-label="ลบรายการ"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPartsOpen(false)}
              disabled={partsSaving}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={handleRequestParts}
              disabled={partsSaving || partsLines.length === 0}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {partsSaving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Package className="h-4 w-4" />
              )}
              ส่งคำขอเบิก ({partsLines.filter((l) => Number(l.quantity) > 0).length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PartsStatusBadge({ status }: { status: string }) {
  if (status === 'PENDING') {
    return (
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
      >
        รออนุมัติ
      </Badge>
    )
  }
  if (status === 'APPROVED') {
    return (
      <Badge
        variant="outline"
        className="border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
      >
        อนุมัติแล้ว
      </Badge>
    )
  }
  if (status === 'REJECTED') {
    return (
      <Badge
        variant="outline"
        className="border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
      >
        ปฏิเสธ
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
    >
      {status}
    </Badge>
  )
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
    </div>
  )
}

function WoImage({
  label,
  src,
}: {
  label: string
  src: string | null
}) {
  if (!src) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
        <ImageIcon className="mb-1 h-5 w-5 opacity-40" />
        {label}
      </div>
    )
  }
  // If src is base64 or URL, render img
  return (
    <div className="relative aspect-square overflow-hidden rounded-md border">
      <img
        src={src}
        alt={label}
        className="h-full w-full object-cover"
        loading="lazy"
      />
      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
        {label}
      </span>
    </div>
  )
}
