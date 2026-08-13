'use client'

/**
 * ItamWorkOrders — หน้า "แจ้งซ่อม / ใบงาน" (WorkOrder)
 *
 * แทนที่ itam-repairs.tsx ของเดิม — ออกแบบใหม่เป็นระบบ WorkOrder เต็มรูปแบบ
 * โดยเน้นการใช้งานจาก **มือถือของช่างที่หน้างาน** เป็นหลัก:
 *
 *   1. แจ้งซ่อมใหม่ — ฟอร์มกรอกเบื้องต้น + ถ่ายรูปหน้างาน + สแกน QR asset
 *   2. รับงาน / มอบหมายงาน — admin/staff รับหรือมอบหมายให้ช่าง
 *   3. ปิดงาน — ช่างอัปโหลดรูปหลังซ่อม + รายละเอียดงานที่ทำ
 *   4. ให้คะแนน — ผู้แจ้งซ่อมให้คะแนน + ความคิดเห็นหลังปิดงาน
 *   5. แชตในงาน — ทุกคนส่งข้อความในใบงานได้ตลอดเวลา
 *
 * API (v1 — ต้องแนบ Bearer token เองเพราะไม่ได้อยู่ใต้ /api/itam/*):
 *   - GET    /api/v1/work-orders?...        → { data: [...], pagination }
 *   - POST   /api/v1/work-orders            → { data: {...} }
 *   - GET    /api/v1/work-orders/[id]       → { data: { order, messages, review } }
 *   - PUT    /api/v1/work-orders/[id]       → { data: {...} }
 *   - POST   /api/v1/work-orders/[id]/assign
 *   - POST   /api/v1/work-orders/[id]/complete
 *   - POST   /api/v1/work-orders/[id]/cancel
 *   - GET    /api/v1/work-orders/[id]/messages
 *   - POST   /api/v1/work-orders/[id]/messages
 *   - POST   /api/v1/work-orders/[id]/review
 */

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
  Wrench,
  Plus,
  QrCode,
  Camera,
  CheckCircle,
  XCircle,
  Clock,
  Star,
  Send,
  MapPin,
  User,
  AlertCircle,
  RefreshCw,
  Search,
  Loader2,
  MessageCircle,
  CalendarDays,
  ChevronRight,
  ImageIcon,
} from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { useAuthStore } from '@/store/auth-store'
import { relativeTime } from './types'

// ── Types ───────────────────────────────────────────────────────────────

type WorkOrderStatus = 'PENDING' | 'IN_PROGRESS' | 'WAITING_PARTS' | 'COMPLETED' | 'CANCELLED'
type WorkOrderPriority = 'ปกติ' | 'ปานกลาง' | 'สูง' | 'ด่วน'

interface WorkOrder {
  id: string
  woNumber: string
  subject: string
  building: string | null
  location: string | null
  details: string | null
  priority: WorkOrderPriority
  reporterName: string | null
  reporterEmail: string | null
  tel: string | null
  employeeCode: string | null
  picBefore: string | null
  picOnsite: string | null
  picAfter: string | null
  status: WorkOrderStatus
  assignedTo: string | null
  assignedBy: string | null
  assignedAt: string | null
  detailsAdmin: string | null
  workCompletedAt: string | null
  closedAt: string | null
  canceledAt: string | null
  cancelReason: string | null
  assetCode: string | null
  createdAt: string
  updatedAt: string
}

interface WorkOrderMessage {
  id: string
  workOrderId: string
  senderName: string | null
  senderRole: string | null
  message: string
  createdAt: string
}

interface WorkOrderReview {
  id: string
  workOrderId: string
  rating: number
  comment: string | null
  reviewerName: string | null
  createdAt: string
}

interface WorkOrderDetailResponse {
  data: { order: WorkOrder; messages: WorkOrderMessage[]; review: WorkOrderReview | null }
}

interface WorkOrderListResponse {
  data: WorkOrder[]
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

interface AuthUserLite {
  email: string
  name: string | null
  username: string | null
  role: string
  allowedSites: string | 'ALL'
}

// ── Constants ───────────────────────────────────────────────────────────

const STATUS_META: Record<
  WorkOrderStatus,
  { label: string; badge: string; dot: string }
> = {
  PENDING: {
    label: 'รอดำเนินการ',
    badge: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
    dot: 'bg-orange-500',
  },
  IN_PROGRESS: {
    label: 'กำลังซ่อม',
    badge: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    dot: 'bg-blue-500',
  },
  WAITING_PARTS: {
    label: 'รอเบิกอะไหล่',
    badge: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  COMPLETED: {
    label: 'เสร็จแล้ว',
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  CANCELLED: {
    label: 'ยกเลิก',
    badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    dot: 'bg-slate-400',
  },
}

const PRIORITY_META: Record<
  WorkOrderPriority,
  { badge: string; ring: string }
> = {
  ปกติ: {
    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    ring: 'ring-emerald-500',
  },
  ปานกลาง: {
    badge: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    ring: 'ring-amber-500',
  },
  สูง: {
    badge: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
    ring: 'ring-orange-500',
  },
  ด่วน: {
    badge: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
    ring: 'ring-red-500',
  },
}

const PRIORITIES: WorkOrderPriority[] = ['ปกติ', 'ปานกลาง', 'สูง', 'ด่วน']

const STATUS_FILTER_OPTIONS: { value: 'all' | WorkOrderStatus; label: string }[] = [
  { value: 'all', label: 'ทุกสถานะ' },
  { value: 'PENDING', label: 'รอดำเนินการ' },
  { value: 'IN_PROGRESS', label: 'กำลังซ่อม' },
  { value: 'WAITING_PARTS', label: 'รอเบิกอะไหล่' },
  { value: 'COMPLETED', label: 'เสร็จแล้ว' },
  { value: 'CANCELLED', label: 'ยกเลิก' },
]

const PRIORITY_FILTER_OPTIONS: { value: 'all' | WorkOrderPriority; label: string }[] = [
  { value: 'all', label: 'ทุกความเร่งด่วน' },
  { value: 'ปกติ', label: 'ปกติ' },
  { value: 'ปานกลาง', label: 'ปานกลาง' },
  { value: 'สูง', label: 'สูง' },
  { value: 'ด่วน', label: 'ด่วน' },
]

const COMMON_SUBJECTS = [
  'เครื่องพิมพ์',
  'สแกนเนอร์',
  'เครือข่าย',
  'คอมพิวเตอร์',
  'อื่นๆ',
] as const

const COMMON_BUILDINGS = [
  'อาคาร A',
  'อาคาร B',
  'อาคาร C',
  'สำนักงานใหญ่',
  'สาขา',
  'อื่นๆ',
]

const PAGE_SIZE = 20

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * แปะ Bearer token ให้กับ /api/v1/* calls เอง เพราะ global fetch interceptor
 * ครอบเฉพาะ /api/itam/* เท่านั้น
 */
function getAuthHeaders(): HeadersInit {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('itam.token')
    if (token) return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }
  return { 'Content-Type': 'application/json' }
}

function isThisMonth(iso: string | null | undefined): boolean {
  if (!iso) return false
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return false
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  } catch {
    return false
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString('th-TH', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/** อ่านไฟล์รูปเป็น base64 string (ไม่ upload — เก็บเป็น data URL ไว้ในฟิลด์ picBefore/picOnsite/picAfter ตาม spec) */
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// ── Sub-components ──────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WorkOrderStatus }) {
  const meta = STATUS_META[status]
  return (
    <Badge variant="outline" className={`gap-1 ${meta.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </Badge>
  )
}

function PriorityBadge({ priority }: { priority: WorkOrderPriority }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META['ปกติ']
  return (
    <Badge variant="outline" className={meta.badge}>
      {priority}
    </Badge>
  )
}

function StarRating({
  value,
  onChange,
  size = 'md',
  readOnly = false,
}: {
  value: number
  onChange?: (v: number) => void
  size?: 'sm' | 'md' | 'lg'
  readOnly?: boolean
}) {
  const sizeCls = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'
  const [hover, setHover] = React.useState(0)
  const display = hover || value
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="คะแนนรีวิว">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ดาว`}
          disabled={readOnly}
          onClick={() => !readOnly && onChange?.(n)}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          className={`rounded p-0.5 transition-transform ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400`}
        >
          <Star
            className={`${sizeCls} ${
              n <= display
                ? 'fill-amber-400 text-amber-400'
                : 'fill-transparent text-slate-300 dark:text-slate-600'
            }`}
          />
        </button>
      ))}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  tone,
  loading,
  hint,
}: {
  label: string
  value: React.ReactNode
  icon: React.ReactNode
  tone: 'orange' | 'blue' | 'emerald' | 'slate' | 'amber'
  loading?: boolean
  hint?: string
}) {
  const toneCls: Record<string, string> = {
    orange: 'text-orange-600 dark:text-orange-400',
    blue: 'text-blue-600 dark:text-blue-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    slate: 'text-slate-600 dark:text-slate-300',
    amber: 'text-amber-600 dark:text-amber-400',
  }
  return (
    <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <CardContent className="p-4">
        <div className={`flex items-center gap-2 ${toneCls[tone]}`}>
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
          {loading ? <Skeleton className="h-7 w-12" /> : value}
        </div>
        {hint && <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{hint}</div>}
      </CardContent>
    </Card>
  )
}

function ImageUploadField({
  label,
  value,
  onChange,
  capture,
}: {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  capture?: 'environment' | 'user'
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setBusy(true)
      const dataUrl = await readFileAsDataURL(file)
      onChange(dataUrl)
    } catch {
      toast.error('อ่านไฟล์รูปไม่สำเร็จ')
    } finally {
      setBusy(false)
      // reset so the same file can be picked again
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="flex items-start gap-3">
        <div
          className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
          aria-hidden
        >
          {value ? (
            <img src={value} alt={label} className="h-full w-full object-cover" />
          ) : busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          ) : (
            <ImageIcon className="h-6 w-6 text-slate-400" />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture={capture}
            onChange={onPick}
            className="hidden"
            aria-label={label}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-full justify-start"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <Camera className="h-4 w-4" />
            {value ? 'เปลี่ยนรูป' : 'ถ่ายรูป / เลือกไฟล์'}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start text-xs text-rose-600 hover:text-rose-700"
              onClick={() => onChange(null)}
            >
              <XCircle className="h-3.5 w-3.5" />
              ลบรูป
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ImageThumb({
  src,
  label,
  onClick,
}: {
  src: string
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative block aspect-square w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
      aria-label={`ดู${label}ขยาด`}
    >
      <img src={src} alt={label} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
      <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {label}
      </span>
    </button>
  )
}

// ── Image preview modal ─────────────────────────────────────────────────

function ImagePreviewModal({
  src,
  label,
  onClose,
}: {
  src: string | null
  label: string
  onClose: () => void
}) {
  return (
    <Dialog open={!!src} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        {src && (
          <img src={src} alt={label} className="max-h-[70vh] w-full rounded-lg object-contain" />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Main Component ──────────────────────────────────────────────────────

export function ItamWorkOrders() {
  const qc = useQueryClient()
  const authUser = useAuthStore((s) => s.user)
  const setQrScannerOpen = useAppStore((s) => s.setQrScannerOpen)

  // Filter state
  const [statusFilter, setStatusFilter] = React.useState<'all' | WorkOrderStatus>('all')
  const [priorityFilter, setPriorityFilter] = React.useState<'all' | WorkOrderPriority>('all')
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')

  // Pagination
  const [page, setPage] = React.useState(1)

  // Dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [previewImage, setPreviewImage] = React.useState<{ src: string; label: string } | null>(null)

  // Debounce search input
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset to page 1 when filter changes
  React.useEffect(() => {
    setPage(1)
  }, [statusFilter, priorityFilter])

  // Build query string
  const queryStr = React.useMemo(() => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('limit', String(PAGE_SIZE))
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (priorityFilter !== 'all') params.set('priority', priorityFilter)
    if (debouncedSearch) params.set('q', debouncedSearch)
    return params.toString()
  }, [page, statusFilter, priorityFilter, debouncedSearch])

  const queryKey = React.useMemo(
    () => ['itam-work-orders', queryStr] as const,
    [queryStr],
  )

  // ── List query ──
  const {
    data: listData,
    isLoading,
    isFetching,
    error,
  } = useQuery<WorkOrderListResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/v1/work-orders?${queryStr}`, {
        headers: getAuthHeaders(),
      })
      if (res.status === 401) {
        useAuthStore.getState().clear()
        throw new Error('กรุณาเข้าสู่ระบบใหม่')
      }
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'โหลดรายการใบงานไม่สำเร็จ')
      return json as WorkOrderListResponse
    },
    staleTime: 15_000,
  })

  // ── Detail query ── (only when detailOpen)
  const {
    data: detailData,
    isLoading: detailLoading,
  } = useQuery<WorkOrderDetailResponse>({
    queryKey: ['itam-work-order', detailId] as const,
    queryFn: async () => {
      if (!detailId) throw new Error('no id')
      const res = await fetch(`/api/v1/work-orders/${detailId}`, {
        headers: getAuthHeaders(),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'โหลดรายละเอียดใบงานไม่สำเร็จ')
      return json as WorkOrderDetailResponse
    },
    enabled: !!detailId && detailOpen,
    staleTime: 10_000,
  })

  const orders = listData?.data ?? []
  const pagination = listData?.pagination
  const detailOrder = detailData?.data?.order ?? null
  const detailMessages = detailData?.data?.messages ?? []
  const detailReview = detailData?.data?.review ?? null

  // ── Stats ──
  const stats = React.useMemo(() => {
    const all = orders
    const pending = all.filter((o) => o.status === 'PENDING').length
    const inProgress = all.filter(
      (o) => o.status === 'IN_PROGRESS' || o.status === 'WAITING_PARTS',
    ).length
    const completed = all.filter((o) => o.status === 'COMPLETED' && isThisMonth(o.closedAt || o.updatedAt)).length
    const cancelled = all.filter((o) => o.status === 'CANCELLED' && isThisMonth(o.canceledAt || o.updatedAt)).length
    return { pending, inProgress, completed, cancelled }
  }, [orders])

  // Average rating — requires server-side aggregation across all reviews.
  // Show "—" until the backend exposes a summary endpoint.
  const avgRating: number | null = null

  // ── Detail open handler ──
  function openDetail(id: string) {
    setDetailId(id)
    setDetailOpen(true)
  }

  function closeDetail() {
    setDetailOpen(false)
    // small delay so the dialog close animation doesn't show stale data
    setTimeout(() => setDetailId(null), 200)
  }

  // ── Invalidate helpers ──
  function refreshAll() {
    qc.invalidateQueries({ queryKey: ['itam-work-orders'] })
    if (detailId) qc.invalidateQueries({ queryKey: ['itam-work-order', detailId] })
  }

  // ── Role helpers ──
  const role = authUser?.role
  const isAdmin = role === 'superadmin' || role === 'admin'
  const isStaff = role === 'superadmin' || role === 'admin' || role === 'editor'
  const currentUserLabel = authUser?.name || authUser?.username || authUser?.email || 'ผู้ใช้'

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
            <Wrench className="h-6 w-6 text-[#f97316]" />
            แจ้งซ่อม / ใบงาน
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            แจ้งซ่อม รับงาน ซ่อม และปิดงาน — ครบวงจร
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={refreshAll}
            className="dark:bg-slate-800 dark:border-slate-700"
            aria-label="รีเฟรช"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">รีเฟรช</span>
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-[#f97316] text-white hover:bg-[#ea580c]"
          >
            <Plus className="h-4 w-4" /> แจ้งซ่อมใหม่
          </Button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="รอดำเนินการ"
          value={stats.pending.toLocaleString()}
          icon={<AlertCircle className="h-4 w-4" />}
          tone="orange"
          loading={isLoading}
        />
        <StatCard
          label="กำลังซ่อม"
          value={stats.inProgress.toLocaleString()}
          icon={<Clock className="h-4 w-4" />}
          tone="blue"
          loading={isLoading}
        />
        <StatCard
          label="เสร็จแล้ว"
          value={stats.completed.toLocaleString()}
          icon={<CheckCircle className="h-4 w-4" />}
          tone="emerald"
          loading={isLoading}
          hint="เดือนนี้"
        />
        <StatCard
          label="ยกเลิก"
          value={stats.cancelled.toLocaleString()}
          icon={<XCircle className="h-4 w-4" />}
          tone="slate"
          loading={isLoading}
          hint="เดือนนี้"
        />
        <StatCard
          label="คะแนนเฉลี่ย"
          value={
            avgRating ? (
              <span className="flex items-center gap-1">
                {avgRating.toFixed(1)}
                <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
              </span>
            ) : (
              <span className="text-base text-slate-400">—</span>
            )
          }
          icon={<Star className="h-4 w-4" />}
          tone="amber"
          loading={false}
          hint="รีวิวจากผู้แจ้งซ่อม"
        />
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | WorkOrderStatus)}>
          <SelectTrigger className="w-full sm:w-44 dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder="สถานะ" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as 'all' | WorkOrderPriority)}>
          <SelectTrigger className="w-full sm:w-44 dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder="ความเร่งด่วน" />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="ค้นหาด้วยเลขใบงาน / หัวข้อ / อาคาร / ผู้แจ้ง..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 dark:bg-slate-800 dark:border-slate-700"
          />
        </div>
      </div>

      {/* ── Work order list (card-based, mobile-friendly) ── */}
      {error ? (
        <Card className="border-rose-200 dark:border-rose-800">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500" />
            <div className="text-sm text-rose-600 dark:text-rose-400">
              {error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ'}
            </div>
            <Button variant="outline" onClick={refreshAll}>
              <RefreshCw className="h-4 w-4" /> ลองอีกครั้ง
            </Button>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={`sk-${i}`} className="dark:border-slate-800 dark:bg-slate-900">
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card className="dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950">
              <Wrench className="h-7 w-7 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-700 dark:text-slate-200">ยังไม่มีใบงาน</div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                กดปุ่ม &quot;แจ้งซ่อมใหม่&quot; เพื่อสร้างใบงานแรกของคุณ
              </div>
            </div>
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-[#f97316] text-white hover:bg-[#ea580c]"
            >
              <Plus className="h-4 w-4" /> แจ้งซ่อมใหม่
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {orders.map((o) => (
              <WorkOrderCard
                key={o.id}
                order={o}
                onClick={() => openDetail(o.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ก่อนหน้า
              </Button>
              <span className="text-sm text-slate-600 dark:text-slate-300">
                หน้า {page} / {pagination.totalPages} (รวม {pagination.total} รายการ)
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                ถัดไป
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── Create dialog ── */}
      <CreateWorkOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        authUser={authUser}
        onScanQr={() => setQrScannerOpen(true)}
        onCreated={() => {
          setCreateOpen(false)
          refreshAll()
        }}
      />

      {/* ── Detail dialog ── */}
      <Dialog open={detailOpen} onOpenChange={(o) => !o && closeDetail()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
              {detailLoading || !detailOrder ? (
                <Skeleton className="h-6 w-40" />
              ) : (
                <>
                  <span className="font-mono text-sm text-[#f97316]">{detailOrder.woNumber}</span>
                  <StatusBadge status={detailOrder.status} />
                  <PriorityBadge priority={detailOrder.priority} />
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {detailOrder ? `สร้างเมื่อ ${formatDateTime(detailOrder.createdAt)}` : 'กำลังโหลด...'}
            </DialogDescription>
          </DialogHeader>

          {detailLoading || !detailOrder ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <DetailBody
              order={detailOrder}
              messages={detailMessages}
              review={detailReview}
              isAdmin={isAdmin}
              isStaff={isStaff}
              currentUserLabel={currentUserLabel}
              currentUserEmail={authUser?.email ?? ''}
              onPreviewImage={(src, label) => setPreviewImage({ src, label })}
              onMutated={refreshAll}
              onClose={closeDetail}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Image preview ── */}
      <ImagePreviewModal
        src={previewImage?.src ?? null}
        label={previewImage?.label ?? ''}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  )
}

// ── WorkOrderCard ───────────────────────────────────────────────────────

function WorkOrderCard({
  order,
  onClick,
}: {
  order: WorkOrder
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[44px] w-full flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-[#f97316]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-[#f97316]/60"
      aria-label={`เปิดใบงาน ${order.woNumber}`}
    >
      {/* Top row: woNumber + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-[#f97316]">{order.woNumber}</span>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Subject + priority */}
      <div className="mt-2 flex items-center gap-2">
        <h3 className="line-clamp-1 flex-1 text-base font-semibold text-slate-800 dark:text-slate-100">
          {order.subject}
        </h3>
        <PriorityBadge priority={order.priority} />
      </div>

      {/* Building / location */}
      {(order.building || order.location) && (
        <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="line-clamp-1">
            {[order.building, order.location].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      )}

      {/* Reporter */}
      {order.reporterName && (
        <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          <User className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="line-clamp-1">{order.reporterName}</span>
        </div>
      )}

      {/* Assigned + time */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {order.assignedTo ? (
            <>
              <Wrench className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">ช่าง: {order.assignedTo}</span>
            </>
          ) : (
            <span className="italic">ยังไม่มอบหมาย</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{relativeTime(order.createdAt)}</span>
        </div>
      </div>

      {/* Hover affordance */}
      <div className="mt-2 flex items-center justify-end gap-1 text-[11px] font-medium text-[#f97316] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        ดูรายละเอียด <ChevronRight className="h-3 w-3" />
      </div>
    </button>
  )
}

// ── Detail body (info, images, actions, chat) ───────────────────────────

function DetailBody({
  order,
  messages,
  review,
  isAdmin,
  isStaff,
  currentUserLabel,
  currentUserEmail,
  onPreviewImage,
  onMutated,
  onClose,
}: {
  order: WorkOrder
  messages: WorkOrderMessage[]
  review: WorkOrderReview | null
  isAdmin: boolean
  isStaff: boolean
  currentUserLabel: string
  currentUserEmail: string
  onPreviewImage: (src: string, label: string) => void
  onMutated: () => void
  onClose: () => void
}) {
  // Sub-dialog state
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [completeOpen, setCompleteOpen] = React.useState(false)
  const [reviewOpen, setReviewOpen] = React.useState(false)
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [newPicOnsite, setNewPicOnsite] = React.useState<string | null>(null)

  // ── Mutations ──
  const qc = useQueryClient()

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/work-orders/${order.id}/assign`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ assignedTo: currentUserLabel, assignmentNote: 'รับงานโดยตรง' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'รับงานไม่สำเร็จ')
      return json
    },
    onSuccess: () => {
      toast.success('รับงานแล้ว — สถานะเปลี่ยนเป็น &quot;กำลังซ่อม&quot;')
      qc.invalidateQueries({ queryKey: ['itam-work-order', order.id] })
      onMutated()
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'),
  })

  const waitingPartsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/work-orders/${order.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'WAITING_PARTS' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'อัปเดตสถานะไม่สำเร็จ')
      return json
    },
    onSuccess: () => {
      toast.success('เปลี่ยนสถานะเป็น &quot;รอเบิกอะไหล่&quot; แล้ว')
      qc.invalidateQueries({ queryKey: ['itam-work-order', order.id] })
      onMutated()
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'),
  })

  const uploadPicOnsiteMutation = useMutation({
    mutationFn: async (picOnsite: string) => {
      const res = await fetch(`/api/v1/work-orders/${order.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ picOnsite }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'อัปโหลดรูปหน้างานไม่สำเร็จ')
      return json
    },
    onSuccess: () => {
      toast.success('บันทึกรูปหน้างานแล้ว')
      setNewPicOnsite(null)
      qc.invalidateQueries({ queryKey: ['itam-work-order', order.id] })
      onMutated()
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'),
  })

  // ── Action buttons (context-dependent) ──
  const actions: React.ReactNode[] = []
  if (order.status === 'PENDING' && isAdmin) {
    actions.push(
      <Button key="assign" onClick={() => setAssignOpen(true)} className="bg-[#f97316] text-white hover:bg-[#ea580c]">
        <User className="h-4 w-4" /> มอบหมายงาน
      </Button>,
    )
  }
  if (order.status === 'PENDING' && isStaff && !isAdmin) {
    actions.push(
      <Button key="accept" onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending} className="bg-blue-600 text-white hover:bg-blue-700">
        {acceptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
        รับงาน
      </Button>,
    )
  }
  if (order.status === 'PENDING' && isAdmin) {
    // admin can also accept directly
    actions.push(
      <Button key="accept-admin" variant="outline" onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending}>
        {acceptMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
        รับงานเอง
      </Button>,
    )
  }
  if (order.status === 'IN_PROGRESS') {
    actions.push(
      <Button key="pic-onsite" variant="outline" onClick={() => {
        if (newPicOnsite) {
          uploadPicOnsiteMutation.mutate(newPicOnsite)
        } else {
          toast.info('กรุณาเลือกรูปหน้างานก่อนกดบันทึก')
        }
      }} disabled={uploadPicOnsiteMutation.isPending}>
        {uploadPicOnsiteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        บันทึกรูปหน้างาน
      </Button>,
    )
    actions.push(
      <Button key="waiting" variant="outline" onClick={() => waitingPartsMutation.mutate()} disabled={waitingPartsMutation.isPending}>
        {waitingPartsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
        รอเบิกอะไหล่
      </Button>,
    )
    actions.push(
      <Button key="complete" onClick={() => setCompleteOpen(true)} className="bg-emerald-600 text-white hover:bg-emerald-700">
        <CheckCircle className="h-4 w-4" /> ปิดงาน
      </Button>,
    )
  }
  if (order.status === 'WAITING_PARTS') {
    actions.push(
      <Button key="complete" onClick={() => setCompleteOpen(true)} className="bg-emerald-600 text-white hover:bg-emerald-700">
        <CheckCircle className="h-4 w-4" /> ปิดงาน
      </Button>,
    )
  }
  if (order.status === 'COMPLETED' && !review) {
    actions.push(
      <Button key="review" onClick={() => setReviewOpen(true)} className="bg-amber-500 text-white hover:bg-amber-600">
        <Star className="h-4 w-4" /> ให้คะแนน
      </Button>,
    )
  }
  if (order.status !== 'CANCELLED' && order.status !== 'COMPLETED') {
    actions.push(
      <Button key="cancel" variant="outline" onClick={() => setCancelOpen(true)} className="border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950">
        <XCircle className="h-4 w-4" /> ยกเลิกงาน
      </Button>,
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Info section ── */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">ข้อมูลใบงาน</h4>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-2">
          <InfoRow label="หัวข้อ" value={order.subject} />
          <InfoRow label="ความเร่งด่วน" value={<PriorityBadge priority={order.priority} />} />
          <InfoRow label="อาคาร" value={order.building} />
          <InfoRow label="ตำแหน่ง" value={order.location} />
          <InfoRow label="รหัสอุปกรณ์" value={order.assetCode} mono />
          <InfoRow label="รหัสพนักงาน" value={order.employeeCode} />
          <InfoRow label="ผู้แจ้ง" value={order.reporterName} />
          <InfoRow label="เบอร์โทร" value={order.tel} />
          <InfoRow label="อีเมลผู้แจ้ง" value={order.reporterEmail} />
          {order.details && (
            <div className="sm:col-span-2">
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">รายละเอียด</div>
              <div className="mt-0.5 whitespace-pre-wrap text-slate-800 dark:text-slate-200">{order.details}</div>
            </div>
          )}
        </div>
      </section>

      {/* ── Images section ── */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">รูปภาพ</h4>
        <div className="grid grid-cols-3 gap-2">
          <ImageSlot label="ก่อนซ่อม" src={order.picBefore} onPreview={() => order.picBefore && onPreviewImage(order.picBefore, 'รูปก่อนซ่อม')} />
          <ImageSlot label="หน้างาน" src={order.picOnsite} onPreview={() => order.picOnsite && onPreviewImage(order.picOnsite, 'รูปหน้างาน')} />
          <ImageSlot label="หลังซ่อม" src={order.picAfter} onPreview={() => order.picAfter && onPreviewImage(order.picAfter, 'รูปหลังซ่อม')} />
        </div>
        {/* Inline pic-onsite uploader for IN_PROGRESS */}
        {order.status === 'IN_PROGRESS' && (
          <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/20">
            <div className="mb-2 text-xs font-medium text-blue-700 dark:text-blue-300">ถ่ายรูปหน้างาน (ขณะซ่อม)</div>
            <ImageUploadField
              label=""
              value={newPicOnsite}
              onChange={setNewPicOnsite}
              capture="environment"
            />
          </div>
        )}
      </section>

      {/* ── Assignment section ── */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">การมอบหมาย</h4>
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-2">
          <InfoRow label="มอบหมายให้" value={order.assignedTo} />
          <InfoRow label="มอบหมายโดย" value={order.assignedBy} />
          <InfoRow label="เวลาที่มอบหมาย" value={order.assignedAt ? formatDateTime(order.assignedAt) : null} />
        </div>
      </section>

      {/* ── Admin section ── */}
      {(order.detailsAdmin || order.workCompletedAt) && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">ผลการซ่อม</h4>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-2">
            {order.detailsAdmin && (
              <div className="sm:col-span-2">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">รายละเอียดการซ่อม</div>
                <div className="mt-0.5 whitespace-pre-wrap text-slate-800 dark:text-slate-200">{order.detailsAdmin}</div>
              </div>
            )}
            <InfoRow label="วันที่เสร็จ" value={order.workCompletedAt ? formatDateTime(order.workCompletedAt) : null} />
            <InfoRow label="วันที่ปิดงาน" value={order.closedAt ? formatDateTime(order.closedAt) : null} />
          </div>
        </section>
      )}

      {/* ── Review section ── */}
      {review && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">รีวิวจากผู้แจ้ง</h4>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-center gap-2">
              <StarRating value={review.rating} readOnly size="sm" />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                โดย {review.reviewerName || 'ไม่ระบุ'} · {formatDateTime(review.createdAt)}
              </span>
            </div>
            {review.comment && (
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{review.comment}</p>
            )}
          </div>
        </section>
      )}

      {/* ── Cancel info ── */}
      {order.status === 'CANCELLED' && order.cancelReason && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-rose-500 dark:text-rose-400">เหตุผลยกเลิก</h4>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
            {order.cancelReason}
            {order.canceledAt && (
              <div className="mt-1 text-xs text-rose-500">{formatDateTime(order.canceledAt)}</div>
            )}
          </div>
        </section>
      )}

      {/* ── Timeline ── */}
      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">ไทม์ไลน์</h4>
        <Timeline order={order} />
      </section>

      {/* ── Actions ── */}
      {actions.length > 0 && (
        <section className="flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          {actions}
        </section>
      )}

      {/* ── Chat ── */}
      <section className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <MessageCircle className="h-3.5 w-3.5" />
          ข้อความในใบงาน ({messages.length})
        </h4>
        <ChatSection
          orderId={order.id}
          messages={messages}
          currentUserLabel={currentUserLabel}
          currentUserEmail={currentUserEmail}
          onMutated={onMutated}
        />
      </section>

      {/* ── Sub-dialogs ── */}
      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        orderId={order.id}
        onDone={() => {
          setAssignOpen(false)
          onMutated()
        }}
      />
      <CompleteDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        orderId={order.id}
        onDone={() => {
          setCompleteOpen(false)
          onMutated()
          onClose()
        }}
      />
      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        orderId={order.id}
        reviewerName={currentUserLabel}
        onDone={() => {
          setReviewOpen(false)
          onMutated()
        }}
      />
      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        orderId={order.id}
        onDone={() => {
          setCancelOpen(false)
          onMutated()
          onClose()
        }}
      />
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
}) {
  return (
    <div>
      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-0.5 text-slate-800 dark:text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>
        {value == null || value === '' ? <span className="text-slate-400">—</span> : value}
      </div>
    </div>
  )
}

function ImageSlot({
  label,
  src,
  onPreview,
}: {
  label: string
  src: string | null
  onPreview: () => void
}) {
  if (!src) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-[10px] text-slate-400 dark:border-slate-700 dark:bg-slate-800">
        <ImageIcon className="mb-1 h-5 w-5" />
        {label}
      </div>
    )
  }
  return <ImageThumb src={src} label={label} onClick={onPreview} />
}

function Timeline({ order }: { order: WorkOrder }) {
  const items: { label: string; time: string | null; done: boolean }[] = [
    { label: 'แจ้งซ่อม', time: order.createdAt, done: true },
    { label: 'มอบหมาย', time: order.assignedAt, done: !!order.assignedAt },
    { label: 'เสร็จงาน', time: order.workCompletedAt, done: !!order.workCompletedAt },
    { label: 'ปิดงาน', time: order.closedAt, done: !!order.closedAt },
  ]
  return (
    <ol className="relative space-y-3 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
      {items.map((it, i) => (
        <li key={i} className="relative">
          <span
            className={`absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${
              it.done ? 'bg-[#f97316]' : 'bg-slate-300 dark:bg-slate-600'
            }`}
            aria-hidden
          />
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm font-medium ${it.done ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400'}`}>
              {it.label}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {it.time ? formatDateTime(it.time) : '—'}
            </span>
          </div>
        </li>
      ))}
      {order.status === 'CANCELLED' && (
        <li className="relative">
          <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-white bg-rose-500 dark:border-slate-900" aria-hidden />
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-rose-600 dark:text-rose-400">ยกเลิกงาน</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {order.canceledAt ? formatDateTime(order.canceledAt) : '—'}
            </span>
          </div>
        </li>
      )}
    </ol>
  )
}

// ── Chat section ────────────────────────────────────────────────────────

function ChatSection({
  orderId,
  messages,
  currentUserLabel,
  currentUserEmail,
  onMutated,
}: {
  orderId: string
  messages: WorkOrderMessage[]
  currentUserLabel: string
  currentUserEmail: string
  onMutated: () => void
}) {
  const qc = useQueryClient()
  const [text, setText] = React.useState('')
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  const sendMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await fetch(`/api/v1/work-orders/${orderId}/messages`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ message: msg, senderName: currentUserLabel, senderEmail: currentUserEmail }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'ส่งข้อความไม่สำเร็จ')
      return json
    },
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey: ['itam-work-order', orderId] })
      onMutated()
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'),
  })

  function send() {
    const v = text.trim()
    if (!v) return
    sendMutation.mutate(v)
  }

  return (
    <div className="space-y-2">
      <div
        ref={scrollRef}
        className="itam-scroll max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">ยังไม่มีข้อความ — เริ่มสนทนาในใบงานนี้</div>
        ) : (
          messages.map((m) => {
            const isMe = m.senderName === currentUserLabel
            return (
              <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
                  isMe
                    ? 'bg-[#f97316] text-white'
                    : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                }`}>
                  {!isMe && (
                    <div className="text-[10px] font-semibold opacity-70">
                      {m.senderName || 'ผู้ใช้'} {m.senderRole ? `· ${m.senderRole}` : ''}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.message}</div>
                </div>
                <div className="mt-0.5 px-1 text-[10px] text-slate-400">
                  {relativeTime(m.createdAt)}
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="พิมพ์ข้อความ..."
          className="min-h-[44px] flex-1 resize-none dark:bg-slate-800 dark:border-slate-700"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <Button
          onClick={send}
          disabled={sendMutation.isPending || !text.trim()}
          className="h-11 bg-[#f97316] text-white hover:bg-[#ea580c]"
          aria-label="ส่งข้อความ"
        >
          {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

// ── Create dialog ───────────────────────────────────────────────────────

function CreateWorkOrderDialog({
  open,
  onOpenChange,
  authUser,
  onScanQr,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  authUser: { name: string | null; username: string | null; email: string | null; role: string } | null
  onScanQr: () => void
  onCreated: () => void
}) {
  const qc = useQueryClient()
  const [subject, setSubject] = React.useState<string>('')
  const [customSubject, setCustomSubject] = React.useState('')
  const [building, setBuilding] = React.useState('')
  const [location, setLocation] = React.useState('')
  const [details, setDetails] = React.useState('')
  const [priority, setPriority] = React.useState<WorkOrderPriority>('ปกติ')
  const [reporterName, setReporterName] = React.useState('')
  const [tel, setTel] = React.useState('')
  const [assetNo, setAssetNo] = React.useState('')
  const [picBefore, setPicBefore] = React.useState<string | null>(null)

  // Prefill reporter name from auth user
  React.useEffect(() => {
    if (open && authUser && !reporterName) {
      setReporterName(authUser.name || authUser.username || authUser.email || '')
    }
  }, [open, authUser, reporterName])

  // Reset on close
  React.useEffect(() => {
    if (!open) {
      setSubject('')
      setCustomSubject('')
      setBuilding('')
      setLocation('')
      setDetails('')
      setPriority('ปกติ')
      setTel('')
      setAssetNo('')
      setPicBefore(null)
      // keep reporterName so next create is faster
    }
  }, [open])

  const finalSubject = subject === 'อื่นๆ' ? customSubject.trim() : subject

  const createMutation = useMutation({
    mutationFn: async () => {
      const body = {
        subject: finalSubject,
        building: building || null,
        location: location || null,
        details: details || null,
        priority,
        reporterName: reporterName || null,
        reporterEmail: authUser?.email || null,
        tel: tel || null,
        assetNo: assetNo || null,
        picBefore,
      }
      const res = await fetch('/api/v1/work-orders', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'สร้างใบงานไม่สำเร็จ')
      return json
    },
    onSuccess: () => {
      toast.success('แจ้งซ่อมสำเร็จ — ทางเราจะติดต่อกลับโดยเร็ว')
      qc.invalidateQueries({ queryKey: ['itam-work-orders'] })
      onCreated()
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'),
  })

  function submit() {
    if (!finalSubject) {
      toast.error('กรุณาเลือกหัวข้อ / ระบุปัญหา')
      return
    }
    if (!reporterName.trim()) {
      toast.error('กรุณาระบุชื่อผู้แจ้ง')
      return
    }
    createMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-[#f97316]" /> แจ้งซ่อมใหม่
          </DialogTitle>
          <DialogDescription>กรอกรายละเอียดปัญหา — ช่างจะรับงานและติดต่อกลับ</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Asset + QR */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">รหัสอุปกรณ์ (ถ้ามี)</Label>
            <div className="flex gap-2">
              <Input
                value={assetNo}
                onChange={(e) => setAssetNo(e.target.value)}
                placeholder="เช่น CPN-00123"
                className="font-mono dark:bg-slate-800 dark:border-slate-700"
              />
              <Button
                type="button"
                variant="outline"
                onClick={onScanQr}
                className="h-11 flex-shrink-0 border-[#f97316]/40 text-[#f97316] hover:bg-[#f97316]/10"
                aria-label="สแกน QR Code"
              >
                <QrCode className="h-4 w-4" />
                <span className="hidden sm:inline">สแกน QR</span>
              </Button>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">หัวข้อปัญหา <span className="text-rose-500">*</span></Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700">
                <SelectValue placeholder="เลือกหัวข้อ..." />
              </SelectTrigger>
              <SelectContent>
                {COMMON_SUBJECTS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {subject === 'อื่นๆ' && (
              <Input
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="ระบุหัวข้ออื่นๆ"
                className="mt-1.5 dark:bg-slate-800 dark:border-slate-700"
              />
            )}
          </div>

          {/* Building + Location */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">อาคาร</Label>
              <Input
                list="wo-buildings"
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
                placeholder="เช่น อาคาร A"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
              <datalist id="wo-buildings">
                {COMMON_BUILDINGS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">ตำแหน่ง/ชั้น</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="เช่น ชั้น 3 ห้อง 305"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>
          </div>

          {/* Details */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">รายละเอียดอาการ</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="อธิบายอาการ/ปัญหาที่พบ เช่น เครื่องพิมพ์ไม่ตอบ ไฟแดงกระพริบ..."
              rows={3}
              className="resize-none dark:bg-slate-800 dark:border-slate-700"
            />
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">ความเร่งด่วน</Label>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITIES.map((p) => {
                const meta = PRIORITY_META[p]
                const active = priority === p
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`rounded-md border px-2 py-2 text-sm font-medium transition-all ${
                      active
                        ? `border-transparent ${meta.badge} ring-2 ${meta.ring} ring-offset-1`
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                    aria-pressed={active}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Reporter + Tel */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">ชื่อผู้แจ้ง <span className="text-rose-500">*</span></Label>
              <Input
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                placeholder="ชื่อ-นามสกุล"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">เบอร์โทร</Label>
              <Input
                value={tel}
                onChange={(e) => setTel(e.target.value)}
                placeholder="08x-xxx-xxxx"
                inputMode="tel"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>
          </div>

          {/* Picture */}
          <ImageUploadField
            label="รูปภาพก่อนซ่อม (ถ้ามี)"
            value={picBefore}
            onChange={setPicBefore}
            capture="environment"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            ยกเลิก
          </Button>
          <Button
            onClick={submit}
            disabled={createMutation.isPending}
            className="bg-[#f97316] text-white hover:bg-[#ea580c]"
          >
            {createMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> กำลังส่ง...</>
            ) : (
              <><Send className="h-4 w-4" /> แจ้งซ่อม</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Assign dialog ───────────────────────────────────────────────────────

function AssignDialog({
  open,
  onOpenChange,
  orderId,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  orderId: string
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [technician, setTechnician] = React.useState('')
  const [note, setNote] = React.useState('')

  // Fetch technician list from /api/itam/auth/users (admin only)
  // Note: this endpoint requires USER_MANAGE permission, so we handle 403 gracefully.
  const { data: users, isLoading: usersLoading } = useQuery<{ users: AuthUserLite[] }>({
    queryKey: ['itam-auth-users'] as const,
    queryFn: async () => {
      const res = await fetch('/api/itam/auth/users')
      if (!res.ok) return { users: [] as AuthUserLite[] }
      return (await res.json()) as { users: AuthUserLite[] }
    },
    enabled: open,
    staleTime: 60_000,
  })

  const userList = users?.users ?? []

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!technician) throw new Error('กรุณาเลือกช่าง')
      const res = await fetch(`/api/v1/work-orders/${orderId}/assign`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ assignedTo: technician, assignmentNote: note || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'มอบหมายงานไม่สำเร็จ')
      return json
    },
    onSuccess: () => {
      toast.success(`มอบหมายงานให้ ${technician} แล้ว`)
      qc.invalidateQueries({ queryKey: ['itam-work-order', orderId] })
      qc.invalidateQueries({ queryKey: ['itam-work-orders'] })
      setTechnician('')
      setNote('')
      onDone()
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-[#f97316]" /> มอบหมายงาน
          </DialogTitle>
          <DialogDescription>เลือกช่างที่จะรับผิดชอบใบงานนี้</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">ช่างผู้รับผิดชอบ <span className="text-rose-500">*</span></Label>
            {usersLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : userList.length === 0 ? (
              <Input
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
                placeholder="พิมพ์ชื่อช่าง"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            ) : (
              <Select value={technician} onValueChange={setTechnician}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700">
                  <SelectValue placeholder="เลือกช่าง..." />
                </SelectTrigger>
                <SelectContent>
                  {userList.map((u) => (
                    <SelectItem key={u.email} value={u.name || u.username || u.email}>
                      {u.name || u.username || u.email} <span className="text-xs text-slate-400">({u.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">หมายเหตุ (ถ้ามี)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น นัดถึงหน้างาน 09:00 น."
              rows={2}
              className="resize-none dark:bg-slate-800 dark:border-slate-700"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assignMutation.isPending}>
            ยกเลิก
          </Button>
          <Button
            onClick={() => assignMutation.mutate()}
            disabled={assignMutation.isPending || !technician}
            className="bg-[#f97316] text-white hover:bg-[#ea580c]"
          >
            {assignMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> กำลังมอบหมาย...</>
            ) : (
              <><CheckCircle className="h-4 w-4" /> มอบหมาย</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Complete dialog ─────────────────────────────────────────────────────

function CompleteDialog({
  open,
  onOpenChange,
  orderId,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  orderId: string
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [detailsAdmin, setDetailsAdmin] = React.useState('')
  const [picAfter, setPicAfter] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setDetailsAdmin('')
      setPicAfter(null)
    }
  }, [open])

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!detailsAdmin.trim()) throw new Error('กรุณาระบุรายละเอียดการซ่อม')
      const res = await fetch(`/api/v1/work-orders/${orderId}/complete`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ detailsAdmin, picAfter }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'ปิดงานไม่สำเร็จ')
      return json
    },
    onSuccess: () => {
      toast.success('ปิดงานสำเร็จ — ขอบคุณครับ/ค่ะ')
      qc.invalidateQueries({ queryKey: ['itam-work-order', orderId] })
      qc.invalidateQueries({ queryKey: ['itam-work-orders'] })
      onDone()
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-600" /> ปิดงาน
          </DialogTitle>
          <DialogDescription>ระบุผลการซ่อมเพื่อปิดใบงานนี้</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">รายละเอียดการซ่อม <span className="text-rose-500">*</span></Label>
            <Textarea
              value={detailsAdmin}
              onChange={(e) => setDetailsAdmin(e.target.value)}
              placeholder="เช่น เปลี่ยน drum unit แล้วทดสอบพิมพ์ผ่าน ส่งมอบผู้ใช้แล้ว"
              rows={4}
              className="resize-none dark:bg-slate-800 dark:border-slate-700"
            />
          </div>
          <ImageUploadField
            label="รูปหลังซ่อม (ถ้ามี)"
            value={picAfter}
            onChange={setPicAfter}
            capture="environment"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={completeMutation.isPending}>
            ยกเลิก
          </Button>
          <Button
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {completeMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> กำลังปิดงาน...</>
            ) : (
              <><CheckCircle className="h-4 w-4" /> ปิดงานเสร็จสิ้น</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Review dialog ───────────────────────────────────────────────────────

function ReviewDialog({
  open,
  onOpenChange,
  orderId,
  reviewerName,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  orderId: string
  reviewerName: string
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [rating, setRating] = React.useState(0)
  const [comment, setComment] = React.useState('')

  React.useEffect(() => {
    if (!open) {
      setRating(0)
      setComment('')
    }
  }, [open])

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (rating < 1 || rating > 5) throw new Error('กรุณาให้คะแนน 1-5 ดาว')
      const res = await fetch(`/api/v1/work-orders/${orderId}/review`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ rating, comment: comment.trim() || null, reviewerName }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'ส่งรีวิวไม่สำเร็จ')
      return json
    },
    onSuccess: () => {
      toast.success('ขอบคุณสำหรับรีวิว!')
      qc.invalidateQueries({ queryKey: ['itam-work-order', orderId] })
      qc.invalidateQueries({ queryKey: ['itam-work-orders'] })
      onDone()
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" /> ให้คะแนนงานซ่อม
          </DialogTitle>
          <DialogDescription>รีวิวคุณภาพงานซ่อมเพื่อปรับปรุงบริการ</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <div className="text-sm font-medium text-slate-600 dark:text-slate-300">คะแนนความพึงพอใจ</div>
            <StarRating value={rating} onChange={setRating} size="lg" />
            <div className="text-xs text-slate-500">
              {rating === 0 && 'คลิกดาวเพื่อให้คะแนน'}
              {rating === 1 && 'แย่มาก'}
              {rating === 2 && 'แย่'}
              {rating === 3 && 'ปานกลาง'}
              {rating === 4 && 'ดี'}
              {rating === 5 && 'ดีมาก'}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">ความคิดเห็น (ถ้ามี)</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="เช่น ช่างรวดเร็ว บริการดี แต่..."
              rows={3}
              className="resize-none dark:bg-slate-800 dark:border-slate-700"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reviewMutation.isPending}>
            ยกเลิก
          </Button>
          <Button
            onClick={() => reviewMutation.mutate()}
            disabled={reviewMutation.isPending || rating === 0}
            className="bg-amber-500 text-white hover:bg-amber-600"
          >
            {reviewMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> กำลังส่ง...</>
            ) : (
              <><Star className="h-4 w-4" /> ส่งรีวิว</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Cancel dialog ───────────────────────────────────────────────────────

function CancelDialog({
  open,
  onOpenChange,
  orderId,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  orderId: string
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [reason, setReason] = React.useState('')

  React.useEffect(() => {
    if (!open) setReason('')
  }, [open])

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) throw new Error('กรุณาระบุเหตุผลยกเลิก')
      const res = await fetch(`/api/v1/work-orders/${orderId}/cancel`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ cancelReason: reason.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'ยกเลิกงานไม่สำเร็จ')
      return json
    },
    onSuccess: () => {
      toast.success('ยกเลิกงานแล้ว')
      qc.invalidateQueries({ queryKey: ['itam-work-order', orderId] })
      qc.invalidateQueries({ queryKey: ['itam-work-orders'] })
      onDone()
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <XCircle className="h-5 w-5" /> ยกเลิกงาน
          </DialogTitle>
          <DialogDescription>ใบงานนี้จะถูกปิดและไม่สามารถกู้คืนได้</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">เหตุผลยกเลิก <span className="text-rose-500">*</span></Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ซ่อเองได้แล้ว / ไม่ใช่อุปกรณ์ที่แจ้ง / เปลี่ยนใจ"
              rows={3}
              className="resize-none dark:bg-slate-800 dark:border-slate-700"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cancelMutation.isPending}>
            กลับ
          </Button>
          <Button
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending || !reason.trim()}
            className="bg-rose-600 text-white hover:bg-rose-700"
          >
            {cancelMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> กำลังยกเลิก...</>
            ) : (
              <><XCircle className="h-4 w-4" /> ยืนยันยกเลิก</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
