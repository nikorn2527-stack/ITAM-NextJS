'use client'

/**
 * ItamStock — หน้า "📦 คลังสต๊อก"
 *
 * ผู้ใช้สามารถ:
 *   1. ดู KPI สรุปจำนวนสินค้าทั้งหมด / สต็อกต่ำ / มูลค่ารวม / รายการเดือนนี้
 *   2. กรองรายการตามหมวดหมู่ / สาขา / สต็อกต่ำ / คำค้น (ชื่อ/แบรนด์/รุ่น/รหัส)
 *   3. เพิ่มสินค้าใหม่ผ่าน Dialog (ระบุชื่อ/หมวด/แบรนด์/รุ่น/หน่วย/จำนวน/ต่ำสุด/สูงสุด/ราคา/ตำแหน่ง/...)
 *   4. คลิกแถวเพื่อดูรายละเอียดเต็ม + ประวัติ 10 รายการล่าสุด
 *   5. ทำรายการรับเข้า (IN) / เบิกออก (OUT) / ปรับปรุง (ADJUST) สต็อก
 *
 * API (มี interceptor แปะ Bearer token ให้ /api/itam/* อัตโนมัติ):
 *   - GET    /api/itam/stock                       → { items, stats }
 *   - POST   /api/itam/stock                       → create new item
 *   - GET    /api/itam/stock/[id]                  → { item, transactions }
 *   - POST   /api/itam/stock/[id]/transaction      → IN/OUT/ADJUST
 *   - GET    /api/itam/devices?limit=100           → สำหรับค้นเลือกอุปกรณ์ในการเบิกออก
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
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Package,
  Plus,
  RefreshCw,
  Search,
  AlertTriangle,
  Banknote,
  CalendarClock,
  Loader2,
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
  Check,
  ChevronsUpDown,
  Eye,
  PackageSearch,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────────

interface StockItem {
  id: string
  itemId: string | null
  name: string
  category: string | null
  brand: string | null
  model: string | null
  unit: string
  quantity: number
  minQuantity: number
  maxQuantity: number
  unitCost: number | null
  location: string | null
  site: string | null
  compatibleDevices: string | null
  remark: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

interface StockTransaction {
  id: string
  txnId: string | null
  stockItemId: string
  type: string // IN | OUT | ADJUST
  quantity: number
  balanceAfter: number
  reason: string | null
  relatedAssetNo: string | null
  cost: number | null
  vendor: string | null
  txnDate: string
  performedBy: string | null
  remark: string | null
  createdAt: string
}

interface StockListResponse {
  items: StockItem[]
  stats?: { txnThisMonth: number }
}

interface StockDetailResponse {
  item: StockItem
  transactions: StockTransaction[]
}

interface DeviceLite {
  id: string
  assetCode: string
  brand: string | null
  model: string | null
  type: string | null
  site: string | null
}

// ── Constants ───────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'ทุกหมวดหมู่' },
  { value: 'หมึกพิมพ์', label: 'หมึกพิมพ์' },
  { value: 'กระดาษ', label: 'กระดาษ' },
  { value: 'อะไหล่', label: 'อะไหล่' },
  { value: 'อุปกรณ์สำนักงาน', label: 'อุปกรณ์สำนักงาน' },
  { value: 'สายไฟ/สายเคเบิล', label: 'สายไฟ/สายเคเบิล' },
  { value: 'อื่น ๆ', label: 'อื่น ๆ' },
]

const SITE_OPTIONS = [
  { value: 'all', label: 'ทุกสาขา' },
  { value: 'MECUD', label: 'MECUD (อุดร)' },
  { value: 'MECNK', label: 'MECNK (นคร)' },
  { value: 'MECSK', label: 'MECSK (สกล)' },
  { value: 'MECL', label: 'MECL (ลำปาง)' },
  { value: 'MECPK', label: 'MECPK (แพร่)' },
]

const TYPE_LABELS: Record<string, string> = {
  IN: 'รับเข้า',
  OUT: 'เบิกออก',
  ADJUST: 'ปรับปรุง',
}

const TYPE_BADGES: Record<string, string> = {
  IN: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  OUT: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  ADJUST: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatBaht(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return '฿' + n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatInt(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return n.toLocaleString('th-TH')
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleString('th-TH', {
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

function isLow(item: StockItem): boolean {
  return item.minQuantity > 0 && item.quantity <= item.minQuantity
}

function truncate(s: string | null | undefined, n = 40): string {
  if (!s) return '—'
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ── Component ───────────────────────────────────────────────────────────

export function ItamStock() {
  const qc = useQueryClient()

  // Filter state
  const [categoryFilter, setCategoryFilter] = React.useState('all')
  const [siteFilter, setSiteFilter] = React.useState('all')
  const [lowStockOnly, setLowStockOnly] = React.useState(false)
  const [search, setSearch] = React.useState('')

  // Create dialog state
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createForm, setCreateForm] = React.useState({
    name: '',
    category: '',
    brand: '',
    model: '',
    unit: 'ชิ้น',
    quantity: '0',
    minQuantity: '0',
    maxQuantity: '0',
    unitCost: '',
    location: '',
    site: '',
    compatibleDevices: '',
    remark: '',
  })

  // Detail dialog state
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [detailItem, setDetailItem] = React.useState<StockItem | null>(null)

  // Transaction dialog state
  type TxnType = 'IN' | 'OUT' | 'ADJUST'
  const [txnOpen, setTxnOpen] = React.useState(false)
  const [txnType, setTxnType] = React.useState<TxnType>('IN')
  const [txnTarget, setTxnTarget] = React.useState<StockItem | null>(null)
  const [txnForm, setTxnForm] = React.useState({
    quantity: '',
    vendor: '',
    cost: '',
    relatedAssetNo: '',
    reason: '',
    remark: '',
  })
  const [devicePickerOpen, setDevicePickerOpen] = React.useState(false)

  // ── Queries ──────────────────────────────────────────────────────────

  // Stock items list
  const queryKey = React.useMemo(
    () => ['itam-stock', categoryFilter, siteFilter, lowStockOnly ? 1 : 0, search.trim().toLowerCase()],
    [categoryFilter, siteFilter, lowStockOnly, search],
  )
  const { data, isLoading, isFetching } = useQuery<StockListResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (categoryFilter !== 'all') params.set('category', categoryFilter)
      if (siteFilter !== 'all') params.set('site', siteFilter)
      if (lowStockOnly) params.set('lowStock', '1')
      const q = search.trim()
      if (q) params.set('q', q)
      const res = await fetch(`/api/itam/stock?${params.toString()}`)
      if (!res.ok) throw new Error('ไม่สามารถโหลดข้อมูลสต๊อกได้')
      return res.json()
    },
    staleTime: 30_000,
  })

  const items = data?.items ?? []
  const txnThisMonth = data?.stats?.txnThisMonth ?? 0

  // Detail (item + transactions) — only when dialog open
  const { data: detailData, isLoading: detailLoading } = useQuery<StockDetailResponse>({
    queryKey: ['itam-stock-detail', detailItem?.id],
    queryFn: async () => {
      const res = await fetch(`/api/itam/stock/${detailItem!.id}`)
      if (!res.ok) throw new Error('ไม่สามารถโหลดรายละเอียดสินค้าได้')
      return res.json()
    },
    enabled: !!detailItem && detailOpen,
    staleTime: 10_000,
  })

  // Devices for OUT asset picker
  const { data: devicesData } = useQuery<{ devices: DeviceLite[] }>({
    queryKey: ['itam-devices-picker', 'limit-100'],
    queryFn: async () => {
      const res = await fetch('/api/itam/devices?limit=100')
      if (!res.ok) throw new Error('Failed to load devices')
      return res.json()
    },
    enabled: txnOpen && txnType === 'OUT',
    staleTime: 60_000,
  })
  const devices = devicesData?.devices ?? []

  // ── KPI stats (computed client-side from items) ──────────────────────
  const stats = React.useMemo(() => {
    const total = items.length
    const low = items.filter(isLow).length
    const totalValue = items.reduce((sum, it) => sum + (it.unitCost ?? 0) * it.quantity, 0)
    return { total, low, totalValue, txnThisMonth }
  }, [items, txnThisMonth])

  // ── Mutations ────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (input: typeof createForm) => {
      const res = await fetch('/api/itam/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: input.name.trim(),
          category: input.category.trim() || null,
          brand: input.brand.trim() || null,
          model: input.model.trim() || null,
          unit: input.unit.trim() || 'ชิ้น',
          quantity: Number(input.quantity) || 0,
          minQuantity: Number(input.minQuantity) || 0,
          maxQuantity: Number(input.maxQuantity) || 0,
          unitCost: input.unitCost === '' ? null : Number(input.unitCost),
          location: input.location.trim() || null,
          site: input.site.trim() || null,
          compatibleDevices: input.compatibleDevices.trim() || null,
          remark: input.remark.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'ไม่สามารถสร้างสินค้าได้')
      return json
    },
    onSuccess: () => {
      toast.success('สร้างสินค้าสต๊อกแล้ว')
      qc.invalidateQueries({ queryKey: ['itam-stock'] })
      setCreateOpen(false)
      setCreateForm({
        name: '',
        category: '',
        brand: '',
        model: '',
        unit: 'ชิ้น',
        quantity: '0',
        minQuantity: '0',
        maxQuantity: '0',
        unitCost: '',
        location: '',
        site: '',
        compatibleDevices: '',
        remark: '',
      })
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    },
  })

  const txnMutation = useMutation({
    mutationFn: async ({ id, type, body }: { id: string; type: TxnType; body: Record<string, unknown> }) => {
      const res = await fetch(`/api/itam/stock/${id}/transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'ไม่สามารถบันทึกรายการได้')
      return json
    },
    onSuccess: () => {
      const verb = txnType === 'IN' ? 'รับเข้า' : txnType === 'OUT' ? 'เบิกออก' : 'ปรับปรุง'
      toast.success(`${verb}สต็อกเรียบร้อยแล้ว`)
      qc.invalidateQueries({ queryKey: ['itam-stock'] })
      if (detailOpen) {
        qc.invalidateQueries({ queryKey: ['itam-stock-detail', detailItem?.id] })
      }
      setTxnOpen(false)
      setTxnTarget(null)
      setTxnForm({
        quantity: '',
        vendor: '',
        cost: '',
        relatedAssetNo: '',
        reason: '',
        remark: '',
      })
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    },
  })

  // ── Handlers ─────────────────────────────────────────────────────────

  function openDetail(item: StockItem) {
    setDetailItem(item)
    setDetailOpen(true)
  }

  function openTxn(item: StockItem, type: TxnType, e?: React.MouseEvent) {
    e?.stopPropagation()
    setTxnTarget(item)
    setTxnType(type)
    setTxnForm({
      quantity: type === 'ADJUST' ? String(item.quantity) : '',
      vendor: '',
      cost: '',
      relatedAssetNo: '',
      reason: '',
      remark: '',
    })
    setTxnOpen(true)
  }

  function submitCreate() {
    if (!createForm.name.trim()) {
      toast.error('กรุณาระบุชื่อสินค้า')
      return
    }
    createMutation.mutate(createForm)
  }

  function submitTxn() {
    if (!txnTarget) return
    const qty = Number(txnForm.quantity)
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error('กรุณาระบุจำนวนที่ถูกต้อง')
      return
    }
    if (txnType !== 'ADJUST' && qty <= 0) {
      toast.error('จำนวนต้องมากกว่า 0')
      return
    }
    if (txnType === 'OUT' && qty > txnTarget.quantity) {
      toast.error(`จำนวนเบิกเกินคงเหลือ (${txnTarget.quantity} ${txnTarget.unit})`)
      return
    }
    txnMutation.mutate({
      id: txnTarget.id,
      type: txnType,
      body: {
        quantity: Math.trunc(qty),
        vendor: txnForm.vendor.trim() || null,
        cost: txnForm.cost === '' ? null : Number(txnForm.cost),
        relatedAssetNo: txnForm.relatedAssetNo.trim() || null,
        reason: txnForm.reason.trim() || null,
        remark: txnForm.remark.trim() || null,
      },
    })
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            📦 คลังสต๊อก
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            จัดการอุปกรณ์สิ้นเปลือง อะไหล่ และวัสดุ
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey })}
            className="dark:bg-slate-800 dark:border-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            รีเฟรช
          </Button>
          <Button onClick={() => setCreateOpen(true)} className="bg-[#f97316] hover:bg-[#ea580c]">
            <Plus className="h-4 w-4" /> เพิ่มสินค้า
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400">
              <Package className="h-4 w-4" />
              <span className="text-xs font-medium">รายการทั้งหมด</span>
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
              {isLoading ? <Skeleton className="h-7 w-12" /> : formatInt(stats.total)}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs font-medium">สต็อกต่ำ</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                {isLoading ? <Skeleton className="h-7 w-12" /> : formatInt(stats.low)}
              </span>
              {stats.low > 0 && !isLoading && (
                <Badge className="bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800">
                  ต้องเติม
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <Banknote className="h-4 w-4" />
              <span className="text-xs font-medium">มูลค่ารวม</span>
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
              {isLoading ? <Skeleton className="h-7 w-24" /> : formatBaht(stats.totalValue)}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-[#f97316]">
              <CalendarClock className="h-4 w-4" />
              <span className="text-xs font-medium">รายการเดือนนี้</span>
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
              {isLoading ? <Skeleton className="h-7 w-12" /> : formatInt(stats.txnThisMonth)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full lg:w-44 dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder="หมวดหมู่" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={siteFilter} onValueChange={setSiteFilter}>
          <SelectTrigger className="w-full lg:w-44 dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder="สาขา" />
          </SelectTrigger>
          <SelectContent>
            {SITE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
          <Switch
            id="low-only"
            checked={lowStockOnly}
            onCheckedChange={setLowStockOnly}
            className="data-[state=checked]:bg-rose-500"
          />
          <Label htmlFor="low-only" className="cursor-pointer text-xs text-slate-600 dark:text-slate-300">
            สต็อกต่ำเท่านั้น
          </Label>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="ค้นหาด้วยชื่อ / แบรนด์ / รุ่น / รหัส..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 dark:bg-slate-800 dark:border-slate-700"
          />
        </div>
      </div>

      {/* Table */}
      <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-0">
          <div className="itam-scroll max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/80">
                <TableRow>
                  <TableHead className="w-24">รหัส</TableHead>
                  <TableHead className="min-w-[200px]">ชื่อ</TableHead>
                  <TableHead className="w-28">หมวดหมู่</TableHead>
                  <TableHead className="w-28 text-right">คงเหลือ</TableHead>
                  <TableHead className="w-20 text-right">ต่ำสุด</TableHead>
                  <TableHead className="w-28 text-right">ราคา/หน่วย</TableHead>
                  <TableHead className="w-32 text-right">มูลค่ารวม</TableHead>
                  <TableHead className="w-32">ตำแหน่ง</TableHead>
                  <TableHead className="w-64 text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={9}><Skeleton className="h-7 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-14">
                      <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-500">
                        <PackageSearch className="h-12 w-12" />
                        <div className="text-sm font-medium">ยังไม่มีสินค้าในสต๊อก</div>
                        <Button
                          size="sm"
                          onClick={() => setCreateOpen(true)}
                          className="bg-[#f97316] hover:bg-[#ea580c]"
                        >
                          <Plus className="h-4 w-4" /> เพิ่มสินค้า
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const low = isLow(item)
                    return (
                      <TableRow
                        key={item.id}
                        onClick={() => openDetail(item)}
                        className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${!item.active ? 'opacity-50' : ''}`}
                      >
                        <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                          {item.itemId ?? '—'}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-slate-800 dark:text-slate-100">{item.name}</div>
                          {(item.brand || item.model) && (
                            <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                              {[item.brand, item.model].filter(Boolean).join(' · ')}
                            </div>
                          )}
                          {!item.active && (
                            <Badge className="mt-0.5 bg-slate-200 text-slate-500" variant="outline">ปิดใช้งาน</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.category ? (
                            <Badge className="bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                              {item.category}
                            </Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-xs ${low ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-700 dark:text-slate-200'}`}>
                          {formatInt(item.quantity)}
                          <span className="ml-1 text-[10px] text-slate-400">{item.unit}</span>
                          {low && <AlertTriangle className="ml-1 inline h-3 w-3" />}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-slate-500 dark:text-slate-400">
                          {item.minQuantity > 0 ? formatInt(item.minQuantity) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-slate-700 dark:text-slate-200">
                          {formatBaht(item.unitCost)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {formatBaht((item.unitCost ?? 0) * item.quantity)}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate text-xs text-slate-600 dark:text-slate-300" title={item.location ?? ''}>
                          {item.location ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              title="รับเข้า"
                              onClick={(e) => openTxn(item, 'IN', e)}
                              className="h-7 px-2 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950"
                            >
                              <ArrowDownToLine className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="เบิกออก"
                              onClick={(e) => openTxn(item, 'OUT', e)}
                              disabled={item.quantity <= 0}
                              className="h-7 px-2 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950"
                            >
                              <ArrowUpFromLine className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="ปรับปรุง"
                              onClick={(e) => openTxn(item, 'ADJUST', e)}
                              className="h-7 px-2 text-sky-600 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-950"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              title="ดูรายละเอียด"
                              onClick={(e) => {
                                e.stopPropagation()
                                openDetail(item)
                              }}
                              className="h-7 px-2 text-slate-500 hover:text-[#f97316]"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Footer summary */}
      {items.length > 0 && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          แสดง {items.length.toLocaleString()} รายการ
        </div>
      )}

      {/* ── Create Dialog ─────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle>📦 เพิ่มสินค้าสต๊อก</DialogTitle>
            <DialogDescription>กรอกข้อมูลสินค้าที่ต้องการเก็บในคลังสต๊อก</DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1 itam-scroll">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="stk-name">ชื่อสินค้า <span className="text-rose-500">*</span></Label>
              <Input
                id="stk-name"
                placeholder="เช่น หมึกพิมพ์ EPSON T544"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="stk-cat">หมวดหมู่</Label>
              <Input
                id="stk-cat"
                list="stk-cat-list"
                placeholder="เช่น หมึกพิมพ์, กระดาษ, อะไหล่..."
                value={createForm.category}
                onChange={(e) => setCreateForm((f) => ({ ...f, category: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
              <datalist id="stk-cat-list">
                {CATEGORY_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
                  <option key={o.value} value={o.value} />
                ))}
              </datalist>
            </div>

            {/* Brand + Model */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stk-brand">แบรนด์</Label>
                <Input
                  id="stk-brand"
                  placeholder="เช่น EPSON"
                  value={createForm.brand}
                  onChange={(e) => setCreateForm((f) => ({ ...f, brand: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stk-model">รุ่น/ขนาด</Label>
                <Input
                  id="stk-model"
                  placeholder="เช่น T544"
                  value={createForm.model}
                  onChange={(e) => setCreateForm((f) => ({ ...f, model: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
            </div>

            {/* Unit + Quantity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stk-unit">หน่วย</Label>
                <Input
                  id="stk-unit"
                  placeholder="ชิ้น, กล่อง, แพ็ค, ม้วน..."
                  value={createForm.unit}
                  onChange={(e) => setCreateForm((f) => ({ ...f, unit: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stk-qty">จำนวนเริ่มต้น</Label>
                <Input
                  id="stk-qty"
                  type="number"
                  min="0"
                  value={createForm.quantity}
                  onChange={(e) => setCreateForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
            </div>

            {/* Min + Max */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stk-min">สต็อกต่ำสุด (เตือน)</Label>
                <Input
                  id="stk-min"
                  type="number"
                  min="0"
                  value={createForm.minQuantity}
                  onChange={(e) => setCreateForm((f) => ({ ...f, minQuantity: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stk-max">สต็อกสูงสุด</Label>
                <Input
                  id="stk-max"
                  type="number"
                  min="0"
                  value={createForm.maxQuantity}
                  onChange={(e) => setCreateForm((f) => ({ ...f, maxQuantity: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
            </div>

            {/* Unit cost */}
            <div className="space-y-1.5">
              <Label htmlFor="stk-cost">ราคาต่อหน่วย (฿)</Label>
              <Input
                id="stk-cost"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={createForm.unitCost}
                onChange={(e) => setCreateForm((f) => ({ ...f, unitCost: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>

            {/* Location + Site */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stk-loc">ตำแหน่งเก็บ</Label>
                <Input
                  id="stk-loc"
                  placeholder="ตู้ A / ชั้น 3..."
                  value={createForm.location}
                  onChange={(e) => setCreateForm((f) => ({ ...f, location: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stk-site">สาขา</Label>
                <Input
                  id="stk-site"
                  list="stk-site-list"
                  placeholder="MECUD / MECNK / ..."
                  value={createForm.site}
                  onChange={(e) => setCreateForm((f) => ({ ...f, site: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
                <datalist id="stk-site-list">
                  {SITE_OPTIONS.filter((o) => o.value !== 'all').map((o) => (
                    <option key={o.value} value={o.value} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Compatible devices */}
            <div className="space-y-1.5">
              <Label htmlFor="stk-comp">อุปกรณ์ที่รองรับ</Label>
              <Input
                id="stk-comp"
                placeholder="คั่นด้วยจุลภาค เช่น EPSON L5290, L3210"
                value={createForm.compatibleDevices}
                onChange={(e) => setCreateForm((f) => ({ ...f, compatibleDevices: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>

            {/* Remark */}
            <div className="space-y-1.5">
              <Label htmlFor="stk-rem">หมายเหตุ</Label>
              <Textarea
                id="stk-rem"
                rows={2}
                placeholder="(ไม่บังคับ)"
                value={createForm.remark}
                onChange={(e) => setCreateForm((f) => ({ ...f, remark: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              ยกเลิก
            </Button>
            <Button
              onClick={submitCreate}
              disabled={createMutation.isPending || !createForm.name.trim()}
              className="bg-[#f97316] hover:bg-[#ea580c]"
            >
              {createMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> กำลังบันทึก...</>
              ) : (
                <><Plus className="h-4 w-4" /> สร้างสินค้า</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Transaction Dialog (IN / OUT / ADJUST) ────────────────────── */}
      <Dialog open={txnOpen} onOpenChange={setTxnOpen}>
        <DialogContent className="sm:max-w-lg dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle>
              {txnType === 'IN' && <><ArrowDownToLine className="mr-1 inline h-5 w-5 text-emerald-600" /> รับเข้าสต็อก</>}
              {txnType === 'OUT' && <><ArrowUpFromLine className="mr-1 inline h-5 w-5 text-amber-600" /> เบิกออกสต็อก</>}
              {txnType === 'ADJUST' && <><SlidersHorizontal className="mr-1 inline h-5 w-5 text-sky-600" /> ปรับปรุงสต็อก</>}
            </DialogTitle>
            <DialogDescription>
              {txnTarget && (
                <span className="font-mono text-xs">
                  {txnTarget.itemId ?? ''} · {txnTarget.name}
                  <span className="ml-2 text-slate-400">คงเหลือปัจจุบัน: {txnTarget.quantity} {txnTarget.unit}</span>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Quantity */}
            <div className="space-y-1.5">
              <Label htmlFor="txn-qty">
                {txnType === 'ADJUST' ? 'จำนวนคงเหลือใหม่' : 'จำนวน'} <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="txn-qty"
                type="number"
                min="0"
                value={txnForm.quantity}
                onChange={(e) => setTxnForm((f) => ({ ...f, quantity: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
              {txnType === 'OUT' && txnTarget && (
                <div className="text-xs text-slate-400">
                  คงเหลือปัจจุบัน {txnTarget.quantity} {txnTarget.unit}
                  {txnTarget.minQuantity > 0 && (
                    <span className="ml-1">(ต่ำสุด {txnTarget.minQuantity})</span>
                  )}
                </div>
              )}
            </div>

            {/* Vendor (IN only) */}
            {txnType === 'IN' && (
              <div className="space-y-1.5">
                <Label htmlFor="txn-vendor">ซื้อจาก / ผู้จำหน่าย</Label>
                <Input
                  id="txn-vendor"
                  placeholder="(ไม่บังคับ) เช่น บจก. ออฟฟิศเมท..."
                  value={txnForm.vendor}
                  onChange={(e) => setTxnForm((f) => ({ ...f, vendor: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
            )}

            {/* Cost (IN only) */}
            {txnType === 'IN' && (
              <div className="space-y-1.5">
                <Label htmlFor="txn-cost">มูลค่ารวม (฿)</Label>
                <Input
                  id="txn-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={txnForm.cost}
                  onChange={(e) => setTxnForm((f) => ({ ...f, cost: e.target.value }))}
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
            )}

            {/* Related asset (OUT only) — searchable picker */}
            {txnType === 'OUT' && (
              <div className="space-y-1.5">
                <Label>อุปกรณ์ที่เบิกไปใช้ (ไม่บังคับ)</Label>
                <Popover open={devicePickerOpen} onOpenChange={setDevicePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal dark:bg-slate-800 dark:border-slate-700"
                    >
                      {txnForm.relatedAssetNo ? (
                        <span className="flex items-center gap-2 truncate">
                          <span className="font-mono text-xs">{txnForm.relatedAssetNo}</span>
                          {(() => {
                            const d = devices.find((x) => x.assetCode === txnForm.relatedAssetNo)
                            if (!d) return null
                            return (
                              <span className="truncate text-xs text-slate-500">
                                {[d.brand, d.model].filter(Boolean).join(' · ')}
                              </span>
                            )
                          })()}
                        </span>
                      ) : (
                        <span className="text-slate-400">เลือกอุปกรณ์ (ไม่บังคับ)...</span>
                      )}
                      <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 dark:border-slate-700 dark:bg-slate-900" align="start">
                    <Command>
                      <CommandInput placeholder="ค้นหา asset no / brand / model..." />
                      <CommandList className="itam-scroll max-h-72">
                        <CommandEmpty>ไม่พบอุปกรณ์</CommandEmpty>
                        <CommandGroup>
                          {devices.map((d) => (
                            <CommandItem
                              key={d.id}
                              value={`${d.assetCode} ${d.brand ?? ''} ${d.model ?? ''}`}
                              onSelect={() => {
                                setTxnForm((f) => ({ ...f, relatedAssetNo: d.assetCode }))
                                setDevicePickerOpen(false)
                              }}
                              className="hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Check
                                className={`mr-2 h-3.5 w-3.5 ${
                                  txnForm.relatedAssetNo === d.assetCode ? 'opacity-100' : 'opacity-0'
                                }`}
                              />
                              <div className="flex flex-1 items-center gap-2 truncate">
                                <span className="font-mono text-xs font-semibold">{d.assetCode}</span>
                                <span className="truncate text-xs text-slate-500">
                                  {[d.brand, d.model].filter(Boolean).join(' · ')}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Reason */}
            <div className="space-y-1.5">
              <Label htmlFor="txn-reason">เหตุผล</Label>
              <Input
                id="txn-reason"
                placeholder={
                  txnType === 'IN'
                    ? 'เช่น ซื้อใหม่, รับบริจาค, คืนจากการยืม...'
                    : txnType === 'OUT'
                      ? 'เช่น เบิกใช้, ย้าย, เสีย, หมดอายุ...'
                      : 'เช่น ตรวจนับ, แก้ไขยอด...'
                }
                value={txnForm.reason}
                onChange={(e) => setTxnForm((f) => ({ ...f, reason: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>

            {/* Remark */}
            <div className="space-y-1.5">
              <Label htmlFor="txn-rem">หมายเหตุ</Label>
              <Textarea
                id="txn-rem"
                rows={2}
                placeholder="(ไม่บังคับ)"
                value={txnForm.remark}
                onChange={(e) => setTxnForm((f) => ({ ...f, remark: e.target.value }))}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTxnOpen(false)} disabled={txnMutation.isPending}>
              ยกเลิก
            </Button>
            <Button
              onClick={submitTxn}
              disabled={txnMutation.isPending}
              className={
                txnType === 'IN'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : txnType === 'OUT'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-sky-600 hover:bg-sky-700'
              }
            >
              {txnMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> กำลังบันทึก...</>
              ) : (
                <><Check className="h-4 w-4" /> บันทึก</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail Dialog ─────────────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-[#f97316]" />
              {detailData?.item.name ?? detailItem?.name ?? '—'}
            </DialogTitle>
            <DialogDescription>
              {detailData?.item.itemId && (
                <span className="font-mono text-xs">{detailData.item.itemId}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {detailLoading && !detailData ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-6 w-1/2" />
            </div>
          ) : detailData ? (
            <div className="space-y-4">
              {/* Top summary */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                  <div className="text-[10px] uppercase text-slate-400">หมวดหมู่</div>
                  <div className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                    {detailData.item.category ?? '—'}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                  <div className="text-[10px] uppercase text-slate-400">คงเหลือ</div>
                  <div className={`mt-1 font-mono text-sm font-bold ${isLow(detailData.item) ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
                    {detailData.item.quantity} {detailData.item.unit}
                    {isLow(detailData.item) && (
                      <Badge className="ml-1 bg-rose-100 text-rose-700 border-rose-200 text-[9px] dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800">
                        ต่ำ
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                  <div className="text-[10px] uppercase text-slate-400">ต่ำสุด / สูงสุด</div>
                  <div className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                    {detailData.item.minQuantity} / {detailData.item.maxQuantity} {detailData.item.unit}
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                  <div className="text-[10px] uppercase text-slate-400">ราคา/หน่วย</div>
                  <div className="mt-1 font-mono text-xs text-slate-700 dark:text-slate-200">
                    {formatBaht(detailData.item.unitCost)}
                  </div>
                </div>
              </div>

              {/* Detail grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">แบรนด์:</span>{' '}
                  <span className="text-slate-700 dark:text-slate-200">{detailData.item.brand ?? '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400">รุ่น:</span>{' '}
                  <span className="text-slate-700 dark:text-slate-200">{detailData.item.model ?? '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400">ตำแหน่ง:</span>{' '}
                  <span className="text-slate-700 dark:text-slate-200">{detailData.item.location ?? '—'}</span>
                </div>
                <div>
                  <span className="text-slate-400">สาขา:</span>{' '}
                  <span className="text-slate-700 dark:text-slate-200">{detailData.item.site ?? '—'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400">อุปกรณ์ที่รองรับ:</span>{' '}
                  <span className="text-slate-700 dark:text-slate-200">
                    {detailData.item.compatibleDevices ?? '—'}
                  </span>
                </div>
                {detailData.item.remark && (
                  <div className="col-span-2">
                    <span className="text-slate-400">หมายเหตุ:</span>{' '}
                    <span className="text-slate-700 dark:text-slate-200">{detailData.item.remark}</span>
                  </div>
                )}
              </div>

              {/* Quick action buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openTxn(detailData.item, 'IN')}
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" /> รับเข้า
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openTxn(detailData.item, 'OUT')}
                  disabled={detailData.item.quantity <= 0}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950"
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5" /> เบิกออก
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openTxn(detailData.item, 'ADJUST')}
                  className="border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300 dark:hover:bg-sky-950"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" /> ปรับปรุง
                </Button>
              </div>

              {/* Transaction history */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    ประวัติ 10 รายการล่าสุด
                  </Label>
                  {detailData.transactions.length === 0 && (
                    <span className="text-[10px] text-slate-400">ยังไม่มีรายการ</span>
                  )}
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-700">
                  <div className="itam-scroll max-h-60 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                        <TableRow>
                          <TableHead className="h-8 text-[10px]">วันที่</TableHead>
                          <TableHead className="h-8 text-[10px]">ประเภท</TableHead>
                          <TableHead className="h-8 text-[10px] text-right">จำนวน</TableHead>
                          <TableHead className="h-8 text-[10px] text-right">คงเหลือ</TableHead>
                          <TableHead className="h-8 text-[10px]">เหตุผล</TableHead>
                          <TableHead className="h-8 text-[10px]">ผู้ทำ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailData.transactions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="py-6 text-center text-xs text-slate-400">
                              ยังไม่มีรายการเข้า-ออก
                            </TableCell>
                          </TableRow>
                        ) : (
                          detailData.transactions.map((t) => (
                            <TableRow key={t.id}>
                              <TableCell className="py-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                                {formatDateTime(t.txnDate)}
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Badge className={`${TYPE_BADGES[t.type] ?? 'bg-slate-100'} px-1.5 py-0 text-[10px]`}>
                                  {TYPE_LABELS[t.type] ?? t.type}
                                </Badge>
                              </TableCell>
                              <TableCell className={`py-1.5 text-right font-mono text-[11px] ${t.type === 'IN' ? 'text-emerald-600' : t.type === 'OUT' ? 'text-amber-600' : 'text-sky-600'}`}>
                                {t.type === 'IN' ? '+' : t.type === 'OUT' ? '-' : '='}{Math.abs(t.quantity)}
                              </TableCell>
                              <TableCell className="py-1.5 text-right font-mono text-[11px] text-slate-700 dark:text-slate-200">
                                {t.balanceAfter}
                              </TableCell>
                              <TableCell className="py-1.5 text-[11px] text-slate-600 dark:text-slate-300" title={t.reason ?? ''}>
                                {truncate(t.reason, 24)}
                              </TableCell>
                              <TableCell className="py-1.5 text-[11px] text-slate-500 dark:text-slate-400" title={t.performedBy ?? ''}>
                                {truncate(t.performedBy, 18)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
