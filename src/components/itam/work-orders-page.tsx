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
import {
  Select,
  SelectContent,
  SelectItem,
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
  picBefore: string | null
  picOnsite: string | null
  picAfter: string | null
  status: string
  assignedTo: string | null
  assignedBy: string | null
  assignedAt: string | null
  assignmentNote: string | null
  detailsAdmin: string | null
  dateAdmin: string | null
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
  { value: 'all', label: 'ความเร่งด่วยทั้งหมด' },
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

// ============================================================
// Main component
// ============================================================
interface NewFormState {
  subject: string
  building: string
  location: string
  details: string
  priority: string
  reporterName: string
  tel: string
}

const EMPTY_FORM: NewFormState = {
  subject: '',
  building: '',
  location: '',
  details: '',
  priority: 'ปกติ',
  reporterName: '',
  tel: '',
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
    try {
      setSaving(true)
      const res = await fetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: form.subject.trim(),
          building: form.building.trim() || null,
          location: form.location.trim() || null,
          details: form.details.trim() || null,
          priority: form.priority,
          reporterName: form.reporterName.trim() || null,
          tel: form.tel.trim() || null,
          actor: form.reporterName.trim() || 'system',
        }),
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
            ระบบแจ้งซ่อมครบวงจร — แจ้ง → รับงาน → ซ่อม → ปิดงาน
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
      />

      {/* Detail dialog */}
      <WorkOrderDetailDialog
        id={detailId}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
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
          <Badge className={statusBadgeClass(wo.status)} variant="outline">
            {statusLabel(wo.status)}
          </Badge>
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
// Create Dialog
// ============================================================
function CreateWorkOrderDialog({
  open,
  onOpenChange,
  form,
  setForm,
  saving,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: NewFormState
  setForm: React.Dispatch<React.SetStateAction<NewFormState>>
  saving: boolean
  onSubmit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-orange-500" />
            แจ้งซ่อมใหม่
          </DialogTitle>
          <DialogDescription>
            กรอกรายละเอียดปัญหา ระบบจะสร้างเลขใบงานอัตโนมัติ (WO-YYYYMMDD-NNN)
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="wo-subject">
              ประเภทปัญหา <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="wo-subject"
              value={form.subject}
              onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))}
              placeholder="เช่น เครื่องพิมพ์ไม่ทำงาน, อินเทอร์เน็ตไม่ติด, คอมพิวเตอร์ค้าง"
              autoFocus
            />
          </div>

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

          <div className="grid gap-1.5">
            <Label htmlFor="wo-details">รายละเอียดปัญหา</Label>
            <Textarea
              id="wo-details"
              value={form.details}
              onChange={(e) =>
                setForm((s) => ({ ...s, details: e.target.value }))
              }
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
              <Label htmlFor="wo-tel">เบอร์โทร</Label>
              <Input
                id="wo-tel"
                value={form.tel}
                onChange={(e) => setForm((s) => ({ ...s, tel: e.target.value }))}
                placeholder="08xxxxxxxx"
                inputMode="tel"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="wo-reporter">ผู้แจ้ง</Label>
            <Input
              id="wo-reporter"
              value={form.reporterName}
              onChange={(e) =>
                setForm((s) => ({ ...s, reporterName: e.target.value }))
              }
              placeholder="ชื่อผู้แจ้งซ่อม"
            />
          </div>
        </div>

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
            disabled={saving || !form.subject.trim()}
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
}: {
  id: string | null
  onOpenChange: (open: boolean) => void
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
      <DialogContent className="max-h-[92vh] overflow-hidden p-0 sm:max-w-[720px]">
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
}: {
  wo: WorkOrderDetail
  onMutated: () => void
  onClose: () => void
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

  // Cancel
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [cancelReason, setCancelReason] = React.useState('')
  const [canceling, setCanceling] = React.useState(false)

  // Chat
  const [chatText, setChatText] = React.useState('')
  const [sendingMsg, setSendingMsg] = React.useState(false)
  const messagesEndRef = React.useRef<HTMLDivElement>(null)
  const messages = wo.messages ?? []

  React.useEffect(() => {
    // sync tech name when WO changes
    setTechName(wo.assignedTo ?? '')
    setAssignNote(wo.assignmentNote ?? '')
  }, [wo.id, wo.assignedTo, wo.assignmentNote])

  React.useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  const canAssign = wo.status === 'PENDING' || wo.status === 'IN_PROGRESS' || wo.status === 'WAITING_PARTS'
  const canComplete = wo.status === 'IN_PROGRESS' || wo.status === 'WAITING_PARTS'
  const canCancel = wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED'
  const canChat = wo.status !== 'COMPLETED' && wo.status !== 'CANCELLED'

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

  async function handleComplete() {
    try {
      setCompleting(true)
      const res = await fetch(`/api/work-orders/${wo.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: completeNote.trim() || null,
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
          <Badge className={statusBadgeClass(wo.status)} variant="outline">
            {statusLabel(wo.status)}
          </Badge>
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
        </div>
      </div>

      {/* Body — scrollable */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="space-y-4 px-5 py-4">
          {/* Info grid */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
          </div>

          {/* Details */}
          {wo.details && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="mb-1 text-xs font-semibold text-muted-foreground">
                รายละเอียดปัญหา
              </div>
              <p className="whitespace-pre-wrap text-sm">{wo.details}</p>
            </div>
          )}

          {/* Admin note */}
          {wo.detailsAdmin && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm dark:border-orange-800 dark:bg-orange-950/40">
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-orange-700 dark:text-orange-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                หมายเหตุช่าง
              </div>
              <p className="whitespace-pre-wrap">{wo.detailsAdmin}</p>
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ปิดงาน</AlertDialogTitle>
            <AlertDialogDescription>
              ยืนยันการปิดงาน {wo.woNumber} — สถานะจะเปลี่ยนเป็น &quot;เสร็จแล้ว&quot;
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1.5 py-2">
            <Label htmlFor="complete-note">หมายเหตุการซ่อม</Label>
            <Textarea
              id="complete-note"
              value={completeNote}
              onChange={(e) => setCompleteNote(e.target.value)}
              placeholder="เช่น เปลี่ยนหมึก, แก้ไขการตั้งค่าเครือข่าย..."
              className="min-h-[80px]"
            />
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
    </div>
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
