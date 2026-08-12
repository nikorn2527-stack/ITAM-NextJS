'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Package,
  AlertTriangle,
  Wallet,
  CalendarPlus,
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Search,
  Eye,
  ArrowDownToLine,
  ArrowUpFromLine,
  SlidersHorizontal,
  ClipboardList,
  Package2,
  ShoppingCart,
} from 'lucide-react'

// ---------- Types ----------

interface StockItem {
  id: string
  productCode: string
  productName: string
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
  txnNumber: string | null
  type: string
  quantity: number
  balanceAfter: number
  reason: string | null
  vendor: string | null
  cost: number | null
  txnDate: string
  performedBy: string | null
  remark: string | null
  createdAt: string
}

interface StockItemDetail extends StockItem {
  transactions: StockTransaction[]
}

interface StockStats {
  total: number
  lowStock: number
  totalValue: number
  thisMonth: number
}

interface StockListResponse {
  data: StockItem[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
  stats: StockStats
}

interface PurchaseOrderItem {
  id: string
  stockItemId: string
  quantityOrdered: number
  quantityReceived: number
  unitPrice: number | null
  totalValue: number | null
  stockItem: {
    productCode: string
    productName: string
    unit: string
  } | null
}

interface PurchaseOrder {
  id: string
  poNumber: string | null
  orderDate: string
  supplier: string | null
  status: string
  totalValue: number | null
  createdBy: string | null
  remark: string | null
  createdAt: string
  items?: PurchaseOrderItem[]
}

interface PurchaseOrderListResponse {
  data: PurchaseOrder[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

// ---------- Helpers ----------

const CATEGORIES = [
  'หมึกพิมพ์',
  'กระดาษ',
  'อะไหล่',
  'อุปกรณ์สำนักงาน',
  '耗材',
  'อื่น ๆ',
]

const UNITS = ['ชิ้น', 'กล่อง', 'แพ็ค', 'ม้วน', 'ลัง', 'ขวด']

function formatBaht(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `฿${value.toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatThaiDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso.length > 10 ? iso : iso + 'T00:00:00').toLocaleDateString(
      'th-TH',
      { day: '2-digit', month: '2-digit', year: 'numeric' },
    )
  } catch {
    return iso
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------- Form state ----------

interface ItemFormState {
  id?: string
  productCode: string
  productName: string
  category: string
  brand: string
  model: string
  unit: string
  quantity: string
  minQuantity: string
  maxQuantity: string
  unitCost: string
  location: string
  site: string
  compatibleDevices: string
  remark: string
}

const EMPTY_ITEM_FORM: ItemFormState = {
  productCode: '',
  productName: '',
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
}

interface TxnFormState {
  type: 'IN' | 'OUT' | 'ADJUST'
  quantity: string
  txnDate: string
  reason: string
  vendor: string
  cost: string
  performedBy: string
  remark: string
}

const EMPTY_TXN_FORM: TxnFormState = {
  type: 'IN',
  quantity: '',
  txnDate: todayISO(),
  reason: '',
  vendor: '',
  cost: '',
  performedBy: '',
  remark: '',
}

// ---------- Component ----------

export function StockPage() {
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = React.useState<'items' | 'po'>('items')

  // Filters
  const [search, setSearch] = React.useState('')
  const [category, setCategory] = React.useState('all')
  const [lowStockOnly, setLowStockOnly] = React.useState(false)

  // Dialogs
  const [itemDialogOpen, setItemDialogOpen] = React.useState(false)
  const [itemForm, setItemForm] = React.useState<ItemFormState>(EMPTY_ITEM_FORM)
  const [savingItem, setSavingItem] = React.useState(false)

  const [txnDialogOpen, setTxnDialogOpen] = React.useState(false)
  const [txnTarget, setTxnTarget] = React.useState<StockItem | null>(null)
  const [txnForm, setTxnForm] = React.useState<TxnFormState>(EMPTY_TXN_FORM)
  const [savingTxn, setSavingTxn] = React.useState(false)

  const [detailOpen, setDetailOpen] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = React.useState<StockItem | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // PO dialog
  const [poDialogOpen, setPoDialogOpen] = React.useState(false)
  const [poForm, setPoForm] = React.useState({
    orderDate: todayISO(),
    supplier: '',
    remark: '',
  })
  const [poLines, setPoLines] = React.useState<
    { stockItemId: string; quantityOrdered: string; unitPrice: string }[]
  >([{ stockItemId: '', quantityOrdered: '1', unitPrice: '' }])
  const [savingPo, setSavingPo] = React.useState(false)

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = React.useState('')
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // ---- Stock items query ----
  const { data: stockData, isLoading: loadingStock } = useQuery<StockListResponse>({
    queryKey: ['stock-items', debouncedSearch, category, lowStockOnly],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (category !== 'all') params.set('category', category)
      if (lowStockOnly) params.set('lowStock', '1')
      params.set('pageSize', '200')
      const res = await fetch(`/api/stock-items?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load stock items')
      const json = await res.json()
      return json as StockListResponse
    },
  })

  const stockItems = stockData?.data ?? []
  const stats: StockStats = stockData?.stats ?? {
    total: 0,
    lowStock: 0,
    totalValue: 0,
    thisMonth: 0,
  }

  // ---- Purchase orders query ----
  const { data: poData, isLoading: loadingPo } = useQuery<PurchaseOrderListResponse>({
    queryKey: ['purchase-orders'],
    queryFn: async () => {
      const res = await fetch('/api/purchase-orders?pageSize=200')
      if (!res.ok) throw new Error('Failed to load purchase orders')
      const json = await res.json()
      return json as PurchaseOrderListResponse
    },
  })
  const purchaseOrders = poData?.data ?? []

  // ---- Detail query (lazy, only when dialog open) ----
  const { data: detailData, isLoading: loadingDetail } = useQuery<StockItemDetail>({
    queryKey: ['stock-item-detail', detailId],
    queryFn: async () => {
      if (!detailId) throw new Error('No id')
      const res = await fetch(`/api/stock-items/${detailId}`)
      if (!res.ok) throw new Error('Failed to load detail')
      const json = await res.json()
      return json.data as StockItemDetail
    },
    enabled: Boolean(detailId) && detailOpen,
  })

  // ---------- Item add/edit ----------
  function openAddItem() {
    setItemForm({ ...EMPTY_ITEM_FORM })
    setItemDialogOpen(true)
  }
  function openEditItem(item: StockItem) {
    setItemForm({
      id: item.id,
      productCode: item.productCode,
      productName: item.productName,
      category: item.category ?? '',
      brand: item.brand ?? '',
      model: item.model ?? '',
      unit: item.unit,
      quantity: String(item.quantity),
      minQuantity: String(item.minQuantity),
      maxQuantity: String(item.maxQuantity),
      unitCost: item.unitCost !== null ? String(item.unitCost) : '',
      location: item.location ?? '',
      site: item.site ?? '',
      compatibleDevices: item.compatibleDevices ?? '',
      remark: item.remark ?? '',
    })
    setItemDialogOpen(true)
  }
  async function saveItem() {
    if (!itemForm.productName) {
      toast.error('กรุณากรอกชื่อสินค้า')
      return
    }
    try {
      setSavingItem(true)
      const payload = {
        productCode: itemForm.productCode || undefined,
        productName: itemForm.productName,
        category: itemForm.category || null,
        brand: itemForm.brand || null,
        model: itemForm.model || null,
        unit: itemForm.unit,
        quantity: Number(itemForm.quantity) || 0,
        minQuantity: Number(itemForm.minQuantity) || 0,
        maxQuantity: Number(itemForm.maxQuantity) || 0,
        unitCost: itemForm.unitCost === '' ? null : Number(itemForm.unitCost),
        location: itemForm.location || null,
        site: itemForm.site || null,
        compatibleDevices: itemForm.compatibleDevices || null,
        remark: itemForm.remark || null,
      }
      const isEdit = Boolean(itemForm.id)
      const url = isEdit ? `/api/stock-items/${itemForm.id}` : '/api/stock-items'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Save failed')
      }
      const json = await res.json()
      toast.success(isEdit ? 'แก้ไขสินค้าแล้ว' : 'เพิ่มสินค้าใหม่แล้ว')
      setItemDialogOpen(false)
      await qc.invalidateQueries({ queryKey: ['stock-items'] })
      if (isEdit && detailId === itemForm.id) {
        await qc.invalidateQueries({ queryKey: ['stock-item-detail', detailId] })
      }
      // Surface auto-generated productCode after create.
      if (!isEdit && json?.data?.productCode) {
        toast.info(`รหัสสินค้าใหม่: ${json.data.productCode}`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingItem(false)
    }
  }

  // ---------- Delete (soft) ----------
  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      const res = await fetch(`/api/stock-items/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Delete failed')
      }
      toast.success('ลบสินค้าแล้ว')
      setDeleteTarget(null)
      await qc.invalidateQueries({ queryKey: ['stock-items'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  // ---------- Stock transaction (IN/OUT/ADJUST) ----------
  function openTxn(item: StockItem, type: 'IN' | 'OUT' | 'ADJUST') {
    setTxnTarget(item)
    setTxnForm({
      ...EMPTY_TXN_FORM,
      type,
      txnDate: todayISO(),
      // For ADJUST, pre-fill current quantity for clarity.
      quantity: type === 'ADJUST' ? String(item.quantity) : '',
    })
    setTxnDialogOpen(true)
  }
  async function saveTxn() {
    if (!txnTarget) return
    const qty = Number(txnForm.quantity)
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error('กรุณากรอกจำนวนที่ถูกต้อง')
      return
    }
    if ((txnForm.type === 'IN' || txnForm.type === 'OUT') && qty <= 0) {
      toast.error('จำนวนสำหรับรับเข้า/เบิกออกต้องมากกว่า 0')
      return
    }
    try {
      setSavingTxn(true)
      const payload: Record<string, unknown> = {
        type: txnForm.type,
        quantity: qty,
        txnDate: txnForm.txnDate,
        reason: txnForm.reason || undefined,
        vendor: txnForm.vendor || undefined,
        performedBy: txnForm.performedBy || undefined,
        remark: txnForm.remark || undefined,
      }
      if (txnForm.cost !== '') payload.cost = Number(txnForm.cost)
      const res = await fetch(`/api/stock-items/${txnTarget.id}/transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Transaction failed')
      }
      const json = await res.json()
      const verb =
        txnForm.type === 'IN'
          ? 'รับเข้า'
          : txnForm.type === 'OUT'
          ? 'เบิกออก'
          : 'ปรับปรุง'
      toast.success(`${verb}สำเร็จ — คงเหลือ ${json.data.item.quantity} ${json.data.item.unit}`)
      setTxnDialogOpen(false)
      await qc.invalidateQueries({ queryKey: ['stock-items'] })
      if (detailId === txnTarget.id) {
        await qc.invalidateQueries({ queryKey: ['stock-item-detail', detailId] })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transaction failed')
    } finally {
      setSavingTxn(false)
    }
  }

  // ---------- Purchase order create ----------
  function openAddPo() {
    setPoForm({ orderDate: todayISO(), supplier: '', remark: '' })
    setPoLines([{ stockItemId: '', quantityOrdered: '1', unitPrice: '' }])
    setPoDialogOpen(true)
  }
  function addPoLine() {
    setPoLines((prev) => [
      ...prev,
      { stockItemId: '', quantityOrdered: '1', unitPrice: '' },
    ])
  }
  function removePoLine(idx: number) {
    setPoLines((prev) => prev.filter((_, i) => i !== idx))
  }
  function updatePoLine(idx: number, key: 'stockItemId' | 'quantityOrdered' | 'unitPrice', value: string) {
    setPoLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)),
    )
  }
  async function savePo() {
    if (!poForm.orderDate) {
      toast.error('กรุณาระบุวันที่สั่งซื้อ')
      return
    }
    const cleanLines = poLines.filter((l) => l.stockItemId)
    if (cleanLines.length === 0) {
      toast.error('ต้องเพิ่มอย่างน้อย 1 รายการสินค้า')
      return
    }
    try {
      setSavingPo(true)
      const payload = {
        orderDate: poForm.orderDate,
        supplier: poForm.supplier || null,
        remark: poForm.remark || null,
        items: cleanLines.map((l) => ({
          stockItemId: l.stockItemId,
          quantityOrdered: Number(l.quantityOrdered) || 0,
          unitPrice: l.unitPrice === '' ? null : Number(l.unitPrice),
        })),
      }
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Save failed')
      }
      const json = await res.json()
      toast.success('สร้างใบสั่งซื้อแล้ว')
      if (json?.data?.poNumber) {
        toast.info(`เลขที่ใบสั่งซื้อ: ${json.data.poNumber}`)
      }
      setPoDialogOpen(false)
      await qc.invalidateQueries({ queryKey: ['purchase-orders'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingPo(false)
    }
  }

  // ---------- Render helpers ----------
  const txnTypeBadge = (type: string) => {
    if (type === 'IN')
      return (
        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          รับเข้า
        </Badge>
      )
    if (type === 'OUT')
      return (
        <Badge className="border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
          เบิกออก
        </Badge>
      )
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
        ปรับปรุง
      </Badge>
    )
  }

  const poStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      open: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
      partial:
        'border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
      received:
        'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
      cancelled:
        'border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
    }
    const labelMap: Record<string, string> = {
      open: 'เปิดอยู่',
      partial: 'รับบางส่วน',
      received: 'รับครบแล้ว',
      cancelled: 'ยกเลิก',
    }
    return (
      <Badge className={map[status] ?? map.open}>{labelMap[status] ?? status}</Badge>
    )
  }

  // ---------- KPI cards ----------
  const KPI_CARDS = [
    {
      title: 'รายการทั้งหมด',
      value: stats.total,
      icon: <Package className="h-5 w-5" />,
      accent: 'bg-[#f97316] text-white',
      soft: 'bg-orange-50 dark:bg-orange-950/40',
      format: (v: number) => `${v} รายการ`,
    },
    {
      title: 'สต็อกต่ำ',
      value: stats.lowStock,
      icon: <AlertTriangle className="h-5 w-5" />,
      accent: 'bg-rose-500 text-white',
      soft: 'bg-rose-50 dark:bg-rose-950/40',
      format: (v: number) => `${v} รายการ`,
    },
    {
      title: 'มูลค่ารวม',
      value: stats.totalValue,
      icon: <Wallet className="h-5 w-5" />,
      accent: 'bg-teal-600 text-white',
      soft: 'bg-teal-50 dark:bg-teal-950/40',
      format: (v: number) => formatBaht(v),
    },
    {
      title: 'รายการเดือนนี้',
      value: stats.thisMonth,
      icon: <CalendarPlus className="h-5 w-5" />,
      accent: 'bg-slate-700 text-white',
      soft: 'bg-slate-100 dark:bg-slate-800/60',
      format: (v: number) => `${v} รายการ`,
    },
  ]

  return (
    <div className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            📦 สต๊อกสินค้า
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            จัดการสินค้าคงคลัง รับเข้า/เบิกออก และใบสั่งซื้อ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['stock-items'] })}
            className="border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            รีเฟรช
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openAddPo}
            className="border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-950/40"
          >
            <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
            สร้างใบสั่งซื้อ
          </Button>
          <Button
            size="sm"
            onClick={openAddItem}
            className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            เพิ่มสินค้า
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {KPI_CARDS.map((kpi, i) => (
          <motion.div
            key={kpi.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
          >
            <Card className="overflow-hidden border-slate-200 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {kpi.title}
                    </div>
                    <div className="mt-1 truncate text-xl font-bold text-slate-800 dark:text-slate-100">
                      {loadingStock ? (
                        <Skeleton className="h-6 w-20" />
                      ) : (
                        kpi.format(kpi.value)
                      )}
                    </div>
                  </div>
                  <div
                    className={`flex h-10 w-10 flex-none items-center justify-center rounded-lg ${kpi.soft}`}
                  >
                    <div
                      className={`flex h-7 w-7 items-center justify-center rounded-md ${kpi.accent}`}
                    >
                      {kpi.icon}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Tabs: items | purchase orders */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'items' | 'po')}>
        <TabsList className="bg-slate-100 dark:bg-slate-800">
          <TabsTrigger value="items">
            <Package2 className="mr-1.5 h-3.5 w-3.5" />
            สินค้าคงคลัง
          </TabsTrigger>
          <TabsTrigger value="po">
            <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
            ใบสั่งซื้อ
          </TabsTrigger>
        </TabsList>

        {/* ===== Items tab ===== */}
        <TabsContent value="items" className="mt-4">
          {/* Filter bar */}
          <Card className="mb-4 border-slate-200 dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  ค้นหา
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="รหัสสินค้า ชื่อ แบรนด์ รุ่น..."
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="w-full sm:w-56">
                <Label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  หมวดหมู่
                </Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">หมวดหมู่ทั้งหมด</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
                <Switch
                  checked={lowStockOnly}
                  onCheckedChange={setLowStockOnly}
                  aria-label="กรองสต็อกต่ำ"
                />
                <Label className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
                  แสดงเฉพาะสต็อกต่ำ
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="border-slate-200 dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/60">
                      <TableHead className="w-28">รหัสสินค้า</TableHead>
                      <TableHead>ชื่อสินค้า</TableHead>
                      <TableHead className="w-32">หมวดหมู่</TableHead>
                      <TableHead className="w-20 text-right">คงเหลือ</TableHead>
                      <TableHead className="w-20">หน่วย</TableHead>
                      <TableHead className="w-24 text-right">ราคา/หน่วย</TableHead>
                      <TableHead className="w-28 text-right">มูลค่ารวม</TableHead>
                      <TableHead className="w-56 text-right">การจัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingStock ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={`s-${i}`}>
                          {Array.from({ length: 8 }).map((__, j) => (
                            <TableCell key={`s-${i}-${j}`}>
                              <Skeleton className="h-5 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : stockItems.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          className="py-12 text-center text-slate-500 dark:text-slate-400"
                        >
                          <Package className="mx-auto mb-2 h-10 w-10 opacity-30" />
                          <div className="text-sm">ไม่พบสินค้าในสต็อก</div>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={openAddItem}
                            className="mt-2 text-[#f97316] hover:text-[#ea580c]"
                          >
                            เพิ่มสินค้าใหม่
                          </Button>
                        </TableCell>
                      </TableRow>
                    ) : (
                      stockItems.map((item) => {
                        const low = item.quantity <= item.minQuantity
                        const totalValue =
                          (item.unitCost ?? 0) * item.quantity
                        return (
                          <TableRow
                            key={item.id}
                            className="cursor-default transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <TableCell className="font-mono text-xs font-semibold text-[#f97316]">
                              {item.productCode}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-slate-800 dark:text-slate-100">
                                {item.productName}
                              </div>
                              {(item.brand || item.model) && (
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {[item.brand, item.model]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {item.category ? (
                                <Badge
                                  variant="outline"
                                  className="border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
                                >
                                  {item.category}
                                </Badge>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </TableCell>
                            <TableCell
                              className={`text-right font-semibold ${
                                low
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-800 dark:text-slate-100'
                              }`}
                            >
                              {item.quantity}
                              {low && item.minQuantity > 0 && (
                                <div className="text-[10px] font-normal text-rose-500">
                                  ต่ำกว่า {item.minQuantity}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-300">
                              {item.unit}
                            </TableCell>
                            <TableCell className="text-right text-slate-700 dark:text-slate-200">
                              {formatBaht(item.unitCost)}
                            </TableCell>
                            <TableCell className="text-right font-medium text-slate-700 dark:text-slate-200">
                              {formatBaht(totalValue)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                                  onClick={() => openTxn(item, 'IN')}
                                  title="รับเข้า"
                                >
                                  <ArrowDownToLine className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                  onClick={() => openTxn(item, 'OUT')}
                                  title="เบิกออก"
                                  disabled={item.quantity <= 0}
                                >
                                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40"
                                  onClick={() => openTxn(item, 'ADJUST')}
                                  title="ปรับปรุง"
                                >
                                  <SlidersHorizontal className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                  onClick={() => {
                                    setDetailId(item.id)
                                    setDetailOpen(true)
                                  }}
                                  title="ดูรายละเอียด"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                  onClick={() => openEditItem(item)}
                                  title="แก้ไข"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                  onClick={() => setDeleteTarget(item)}
                                  title="ลบ"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
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
        </TabsContent>

        {/* ===== Purchase Orders tab ===== */}
        <TabsContent value="po" className="mt-4">
          <Card className="border-slate-200 dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/60">
                      <TableHead className="w-36">เลขที่ใบสั่งซื้อ</TableHead>
                      <TableHead className="w-32">วันที่สั่ง</TableHead>
                      <TableHead>ผู้จัดจำหน่าย</TableHead>
                      <TableHead className="w-24 text-right">รายการ</TableHead>
                      <TableHead className="w-32 text-right">มูลค่ารวม</TableHead>
                      <TableHead className="w-28">สถานะ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingPo ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={`p-${i}`}>
                          {Array.from({ length: 6 }).map((__, j) => (
                            <TableCell key={`p-${i}-${j}`}>
                              <Skeleton className="h-5 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : purchaseOrders.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-12 text-center text-slate-500 dark:text-slate-400"
                        >
                          <ClipboardList className="mx-auto mb-2 h-10 w-10 opacity-30" />
                          <div className="text-sm">ยังไม่มีใบสั่งซื้อ</div>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={openAddPo}
                            className="mt-2 text-[#f97316] hover:text-[#ea580c]"
                          >
                            สร้างใบสั่งซื้อใหม่
                          </Button>
                        </TableCell>
                      </TableRow>
                    ) : (
                      purchaseOrders.map((po) => (
                        <TableRow
                          key={po.id}
                          className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <TableCell className="font-mono text-xs font-semibold text-[#f97316]">
                            {po.poNumber ?? '—'}
                          </TableCell>
                          <TableCell className="text-slate-600 dark:text-slate-300">
                            {formatThaiDate(po.orderDate)}
                          </TableCell>
                          <TableCell className="text-slate-800 dark:text-slate-100">
                            {po.supplier ?? '—'}
                          </TableCell>
                          <TableCell className="text-right text-slate-600 dark:text-slate-300">
                            {po.items?.length ?? 0} รายการ
                          </TableCell>
                          <TableCell className="text-right font-medium text-slate-700 dark:text-slate-200">
                            {formatBaht(po.totalValue)}
                          </TableCell>
                          <TableCell>{poStatusBadge(po.status)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== Item add/edit dialog ===== */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-slate-800 dark:text-slate-100">
              {itemForm.id ? '✏️ แก้ไขสินค้า' : '➕ เพิ่มสินค้าใหม่'}
            </DialogTitle>
            <DialogDescription>
              {itemForm.id
                ? `แก้ไขข้อมูลสินค้า ${itemForm.productCode}`
                : 'รหัสสินค้าจะถูกสร้างอัตโนมัติในรูปแบบ STK-NNNN หากไม่ระบุ'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                รหัสสินค้า
              </Label>
              <Input
                value={itemForm.productCode}
                onChange={(e) =>
                  setItemForm({ ...itemForm, productCode: e.target.value })
                }
                placeholder="STK-0001 (ปล่อยว่างเพื่อสร้างอัตโนมัติ)"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                ชื่อสินค้า *
              </Label>
              <Input
                value={itemForm.productName}
                onChange={(e) =>
                  setItemForm({ ...itemForm, productName: e.target.value })
                }
                placeholder="เช่น หมึกพิมพ์ EPSON T544"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                หมวดหมู่
              </Label>
              <Select
                value={itemForm.category}
                onValueChange={(v) =>
                  setItemForm({ ...itemForm, category: v === '__none' ? '' : v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="เลือกหมวดหมู่" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— ไม่ระบุ —</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                หน่วย
              </Label>
              <Select
                value={itemForm.unit}
                onValueChange={(v) => setItemForm({ ...itemForm, unit: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                แบรนด์
              </Label>
              <Input
                value={itemForm.brand}
                onChange={(e) =>
                  setItemForm({ ...itemForm, brand: e.target.value })
                }
                placeholder="เช่น EPSON, HP"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                รุ่น
              </Label>
              <Input
                value={itemForm.model}
                onChange={(e) =>
                  setItemForm({ ...itemForm, model: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                จำนวนคงเหลือ
              </Label>
              <Input
                type="number"
                min="0"
                value={itemForm.quantity}
                onChange={(e) =>
                  setItemForm({ ...itemForm, quantity: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                จุดสั่งซื้อ (ขั้นต่ำ)
              </Label>
              <Input
                type="number"
                min="0"
                value={itemForm.minQuantity}
                onChange={(e) =>
                  setItemForm({ ...itemForm, minQuantity: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                จำนวนสูงสุด
              </Label>
              <Input
                type="number"
                min="0"
                value={itemForm.maxQuantity}
                onChange={(e) =>
                  setItemForm({ ...itemForm, maxQuantity: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                ราคาต่อหน่วย (฿)
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={itemForm.unitCost}
                onChange={(e) =>
                  setItemForm({ ...itemForm, unitCost: e.target.value })
                }
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                ตำแหน่งจัดเก็บ
              </Label>
              <Input
                value={itemForm.location}
                onChange={(e) =>
                  setItemForm({ ...itemForm, location: e.target.value })
                }
                placeholder="เช่น ชั้น A-1"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                สาขา
              </Label>
              <Input
                value={itemForm.site}
                onChange={(e) =>
                  setItemForm({ ...itemForm, site: e.target.value })
                }
                placeholder="เช่น HQ"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                อุปกรณ์ที่รองรับ
              </Label>
              <Input
                value={itemForm.compatibleDevices}
                onChange={(e) =>
                  setItemForm({
                    ...itemForm,
                    compatibleDevices: e.target.value,
                  })
                }
                placeholder="เช่น EPSON L5290, L3210 (คั่นด้วยจุลภาค)"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                หมายเหตุ
              </Label>
              <Textarea
                value={itemForm.remark}
                onChange={(e) =>
                  setItemForm({ ...itemForm, remark: e.target.value })
                }
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setItemDialogOpen(false)}
              disabled={savingItem}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={saveItem}
              disabled={savingItem}
              className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {savingItem ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Transaction dialog ===== */}
      <Dialog open={txnDialogOpen} onOpenChange={setTxnDialogOpen}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              {txnForm.type === 'IN' && (
                <>
                  <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
                  รับสินค้าเข้า
                </>
              )}
              {txnForm.type === 'OUT' && (
                <>
                  <ArrowUpFromLine className="h-4 w-4 text-rose-600" />
                  เบิกสินค้าออก
                </>
              )}
              {txnForm.type === 'ADJUST' && (
                <>
                  <SlidersHorizontal className="h-4 w-4 text-amber-600" />
                  ปรับปรุงสต็อก
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {txnTarget && (
                <span>
                  {txnTarget.productCode} — {txnTarget.productName}
                  <br />
                  คงเหลือปัจจุบัน: {txnTarget.quantity} {txnTarget.unit}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {txnForm.type === 'ADJUST'
                  ? 'จำนวนคงเหลือใหม่ (ชุดใหม่)'
                  : 'จำนวน *'}
              </Label>
              <Input
                type="number"
                min="0"
                value={txnForm.quantity}
                onChange={(e) =>
                  setTxnForm({ ...txnForm, quantity: e.target.value })
                }
                autoFocus
              />
              {txnForm.type === 'OUT' && txnTarget && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  จำนวนที่เบิกได้สูงสุด: {txnTarget.quantity} {txnTarget.unit}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  วันที่ทำรายการ
                </Label>
                <Input
                  type="date"
                  value={txnForm.txnDate}
                  onChange={(e) =>
                    setTxnForm({ ...txnForm, txnDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  เหตุผล
                </Label>
                <Input
                  value={txnForm.reason}
                  onChange={(e) =>
                    setTxnForm({ ...txnForm, reason: e.target.value })
                  }
                  placeholder={
                    txnForm.type === 'IN'
                      ? 'ซื้อ / ย้ายเข้า'
                      : txnForm.type === 'OUT'
                      ? 'เบิกใช้ / ย้ายออก / เสีย'
                      : 'ตรวจนับ / ปรับยอด'
                  }
                />
              </div>
            </div>
            {txnForm.type === 'IN' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    ซื้อจาก (ผู้จัดจำหน่าย)
                  </Label>
                  <Input
                    value={txnForm.vendor}
                    onChange={(e) =>
                      setTxnForm({ ...txnForm, vendor: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    มูลค่ารวม (฿)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={txnForm.cost}
                    onChange={(e) =>
                      setTxnForm({ ...txnForm, cost: e.target.value })
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  ผู้ทำรายการ
                </Label>
                <Input
                  value={txnForm.performedBy}
                  onChange={(e) =>
                    setTxnForm({ ...txnForm, performedBy: e.target.value })
                  }
                  placeholder="ชื่อ-นามสกุล"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  หมายเหตุ
                </Label>
                <Input
                  value={txnForm.remark}
                  onChange={(e) =>
                    setTxnForm({ ...txnForm, remark: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTxnDialogOpen(false)}
              disabled={savingTxn}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={saveTxn}
              disabled={savingTxn}
              className={
                txnForm.type === 'IN'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950'
                  : txnForm.type === 'OUT'
                  ? 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950'
                  : 'bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950'
              }
            >
              {savingTxn ? 'กำลังบันทึก...' : 'ยืนยัน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Detail dialog ===== */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Eye className="h-4 w-4 text-slate-500" />
              รายละเอียดสินค้า
            </DialogTitle>
            <DialogDescription>
              {detailData && (
                <span>
                  {detailData.productCode} — {detailData.productName}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {loadingDetail || !detailData ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Item info grid */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50 sm:grid-cols-3">
                <DetailField label="รหัสสินค้า" value={detailData.productCode} mono />
                <DetailField label="หมวดหมู่" value={detailData.category} />
                <DetailField label="แบรนด์" value={detailData.brand} />
                <DetailField label="รุ่น" value={detailData.model} />
                <DetailField
                  label="คงเหลือ"
                  value={`${detailData.quantity} ${detailData.unit}`}
                  highlight={detailData.quantity <= detailData.minQuantity}
                />
                <DetailField
                  label="จุดสั่งซื้อ"
                  value={`${detailData.minQuantity} ${detailData.unit}`}
                />
                <DetailField
                  label="ราคา/หน่วย"
                  value={formatBaht(detailData.unitCost)}
                />
                <DetailField
                  label="มูลค่ารวม"
                  value={formatBaht(
                    (detailData.unitCost ?? 0) * detailData.quantity,
                  )}
                />
                <DetailField label="ตำแหน่งจัดเก็บ" value={detailData.location} />
                <DetailField label="สาขา" value={detailData.site} />
                <DetailField
                  label="อุปกรณ์ที่รองรับ"
                  value={detailData.compatibleDevices}
                  span={2}
                />
                <DetailField
                  label="หมายเหตุ"
                  value={detailData.remark}
                  span={2}
                />
                <DetailField
                  label="สถานะ"
                  value={detailData.active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                />
              </div>

              {/* Stock level progress */}
              {detailData.maxQuantity > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300">
                      ระดับสต็อก
                    </span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {detailData.quantity} / {detailData.maxQuantity}{' '}
                      {detailData.unit}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(
                      100,
                      (detailData.quantity / detailData.maxQuantity) * 100,
                    )}
                    className="h-2"
                  />
                </div>
              )}

              {/* Transaction history */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    ประวัติการรับเข้า/เบิกออก
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    {detailData.transactions.length} รายการ
                  </Badge>
                </div>
                {detailData.transactions.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    ยังไม่มีประวัติรับเข้า/เบิกออก
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
                    <Table>
                      <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-800/80">
                        <TableRow>
                          <TableHead className="w-28">เลขที่</TableHead>
                          <TableHead className="w-20">ประเภท</TableHead>
                          <TableHead className="w-24 text-right">จำนวน</TableHead>
                          <TableHead className="w-24 text-right">คงเหลือ</TableHead>
                          <TableHead>เหตุผล</TableHead>
                          <TableHead className="w-28">วันที่</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailData.transactions.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {t.txnNumber ?? '—'}
                            </TableCell>
                            <TableCell>{txnTypeBadge(t.type)}</TableCell>
                            <TableCell className="text-right font-medium text-slate-700 dark:text-slate-200">
                              {t.type === 'IN'
                                ? `+${t.quantity}`
                                : t.type === 'OUT'
                                ? `-${t.quantity}`
                                : `=${t.quantity}`}
                            </TableCell>
                            <TableCell className="text-right text-slate-600 dark:text-slate-300">
                              {t.balanceAfter}
                            </TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-300">
                              {t.reason ?? '—'}
                              {t.vendor && (
                                <div className="text-[10px] text-slate-400">
                                  จาก: {t.vendor}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 dark:text-slate-400">
                              {formatThaiDate(t.txnDate)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Quick actions */}
              <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!detailData) return
                    setDetailOpen(false)
                    openTxn(detailData, 'IN')
                  }}
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                >
                  <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
                  รับเข้า
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!detailData) return
                    setDetailOpen(false)
                    openTxn(detailData, 'OUT')
                  }}
                  disabled={detailData.quantity <= 0}
                  className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
                >
                  <ArrowUpFromLine className="mr-1.5 h-3.5 w-3.5" />
                  เบิกออก
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!detailData) return
                    setDetailOpen(false)
                    openTxn(detailData, 'ADJUST')
                  }}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
                >
                  <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                  ปรับปรุง
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!detailData) return
                    setDetailOpen(false)
                    openEditItem(detailData)
                  }}
                  className="ml-auto border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  แก้ไข
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Delete confirmation ===== */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
              <Trash2 className="h-4 w-4" />
              ยืนยันการลบสินค้า
            </DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <span>
                  คุณกำลังจะลบ{' '}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {deleteTarget.productCode} — {deleteTarget.productName}
                  </strong>
                  <br />
                  ระบบจะตั้งค่าสถานะเป็น &quot;ปิดใช้งาน&quot; (soft delete)
                  เพื่อรักษาประวัติการรับเข้า/เบิกออกไว้
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {deleting ? 'กำลังลบ...' : 'ลบสินค้า'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Purchase order dialog ===== */}
      <Dialog open={poDialogOpen} onOpenChange={setPoDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <ShoppingCart className="h-4 w-4 text-teal-600" />
              สร้างใบสั่งซื้อ
            </DialogTitle>
            <DialogDescription>
              เลขที่ใบสั่งซื้อจะถูกสร้างอัตโนมัติในรูปแบบ PO-YYYYMMDD-NNN
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  วันที่สั่งซื้อ *
                </Label>
                <Input
                  type="date"
                  value={poForm.orderDate}
                  onChange={(e) =>
                    setPoForm({ ...poForm, orderDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  ผู้จัดจำหน่าย
                </Label>
                <Input
                  value={poForm.supplier}
                  onChange={(e) =>
                    setPoForm({ ...poForm, supplier: e.target.value })
                  }
                  placeholder="ชื่อบริษัท/ร้านค้า"
                />
              </div>
            </div>

            {/* PO lines */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  รายการสินค้า
                </Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addPoLine}
                  className="h-7 border-teal-300 px-2 text-xs text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-950/40"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  เพิ่มรายการ
                </Button>
              </div>
              <div className="space-y-2">
                {poLines.map((line, idx) => {
                  const unitPrice = line.unitPrice === '' ? null : Number(line.unitPrice)
                  const qty = Number(line.quantityOrdered) || 0
                  const lineTotal =
                    unitPrice !== null && Number.isFinite(qty)
                      ? unitPrice * qty
                      : 0
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50"
                    >
                      <div className="col-span-12 sm:col-span-5">
                        <Select
                          value={line.stockItemId}
                          onValueChange={(v) =>
                            updatePoLine(idx, 'stockItemId', v)
                          }
                        >
                          <SelectTrigger className="h-8 w-full text-xs">
                            <SelectValue placeholder="เลือกสินค้า" />
                          </SelectTrigger>
                          <SelectContent>
                            {stockItems.map((it) => (
                              <SelectItem key={it.id} value={it.id}>
                                {it.productCode} — {it.productName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <Input
                          type="number"
                          min="1"
                          value={line.quantityOrdered}
                          onChange={(e) =>
                            updatePoLine(idx, 'quantityOrdered', e.target.value)
                          }
                          className="h-8 text-xs"
                          placeholder="จำนวน"
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) =>
                            updatePoLine(idx, 'unitPrice', e.target.value)
                          }
                          className="h-8 text-xs"
                          placeholder="ราคา/หน่วย"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-2 flex items-center text-right text-xs font-medium text-slate-700 dark:text-slate-200">
                        {formatBaht(lineTotal)}
                      </div>
                      <div className="col-span-1 flex items-center justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          onClick={() => removePoLine(idx)}
                          disabled={poLines.length === 1}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {(() => {
                const grand = poLines.reduce((sum, l) => {
                  const up = l.unitPrice === '' ? null : Number(l.unitPrice)
                  const q = Number(l.quantityOrdered) || 0
                  if (up === null || !Number.isFinite(q)) return sum
                  return sum + up * q
                }, 0)
                return (
                  <div className="flex justify-end gap-2 border-t border-slate-200 pt-2 text-sm dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400">
                      มูลค่ารวมทั้งสิ้น:
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {formatBaht(grand)}
                    </span>
                  </div>
                )
              })()}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                หมายเหตุ
              </Label>
              <Textarea
                value={poForm.remark}
                onChange={(e) =>
                  setPoForm({ ...poForm, remark: e.target.value })
                }
                rows={2}
                placeholder="เช่น สั่งซื้อเพื่อเติมสต็อกเดือน..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPoDialogOpen(false)}
              disabled={savingPo}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={savePo}
              disabled={savingPo}
              className="bg-teal-600 text-white hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {savingPo ? 'กำลังบันทึก...' : 'สร้างใบสั่งซื้อ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- Detail field helper ----------

function DetailField({
  label,
  value,
  mono,
  highlight,
  span,
}: {
  label: string
  value: string | null | undefined
  mono?: boolean
  highlight?: boolean
  span?: 1 | 2
}) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div
        className={`mt-0.5 text-sm ${
          highlight
            ? 'font-semibold text-rose-600 dark:text-rose-400'
            : 'text-slate-800 dark:text-slate-100'
        } ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value || value === '0' ? value : '—'}
      </div>
    </div>
  )
}
