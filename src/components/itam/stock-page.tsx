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
  Clock,
  Check,
  XCircle,
  Hourglass,
  Printer,
  FileDown,
  Coins,
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
  stockItemId: string
  productCode: string | null
  productName: string | null
  type: string
  quantity: number
  unit: string | null
  balanceAfter: number
  reason: string | null
  requester: string | null
  department: string | null
  purpose: string | null
  approver: string | null
  approvedAt: string | null
  workOrderNo: string | null
  vendor: string | null
  receiver: string | null
  purchaseOrderNo: string | null
  cost: number | null
  unitCost: number | null
  txnDate: string
  performedBy: string | null
  remark: string | null
  createdAt: string
}

interface PendingStockTransaction extends StockTransaction {
  workOrderId: string | null
  approvalStatus: string | null
  approvalMode: string | null
  autoApproveAt: string | null
  rejectReason: string | null
  stockItem?: {
    productCode: string
    productName: string
    unit: string
    quantity: number
    active: boolean
  } | null
}

interface PendingListResponse {
  data: PendingStockTransaction[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
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
  'InkPrint',
  'Paper',
  'Parts',
  'DevicebureauWork',
  '耗材',
  'Other ',
]

const UNITS = ['pcs', 'box', 'pack', 'roll', 'box', 'bottles']

function formatBaht(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `THB${value.toLocaleString('th-TH', {
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

/**
 * Open a print URL in a new window/tab. The HTML page returned by the API
 * auto-triggers window.print() on load (only when opened programmatically).
 */
function printDocument(url: string) {
  const win = window.open(url, '_blank', 'width=900,height=700,noopener,noreferrer')
  if (!win) {
    toast.error('NoCanClosefrontdifferentPrint PleaseAllow Pop-up inbrowser')
  }
}

/**
 * Escape a CSV cell value following RFC 4180:
 * wrap in double quotes if it contains comma, quote, or newline;
 * double any embedded double quotes.
 */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Build and download a CSV file from an array of rows.
 * A UTF-8 BOM is prepended so Excel renders Thai characters correctly.
 */
function downloadCSV(
  filename: string,
  rows: (string | number | null | undefined)[][],
) {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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
  // ── WO-PARTS-FLOW Level 2+: cost model + expected usage defaults ──
  costModel: string // 'fixed' | 'per-page' | 'per-hour' | 'monthly' | 'per-device'
  expectedDevicesPerUnit: string
  expectedHoursPerUnit: string
  expectedPagesPerUnit: string
  ratePerPage: string
  ratePerHour: string
  ratePerMonth: string
  ratePerDevice: string
}

const EMPTY_ITEM_FORM: ItemFormState = {
  productCode: '',
  productName: '',
  category: '',
  brand: '',
  model: '',
  unit: 'pcs',
  quantity: '0',
  minQuantity: '0',
  maxQuantity: '0',
  unitCost: '',
  location: '',
  site: '',
  compatibleDevices: '',
  remark: '',
  costModel: 'fixed',
  expectedDevicesPerUnit: '',
  expectedHoursPerUnit: '',
  expectedPagesPerUnit: '',
  ratePerPage: '',
  ratePerHour: '',
  ratePerMonth: '',
  ratePerDevice: '',
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
  const [activeTab, setActiveTab] = React.useState<'items' | 'po' | 'pending'>('items')

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

  // ── Pending approval (PART 1) ──
  const [pendingFilter, setPendingFilter] = React.useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'all'>('PENDING')
  const [pendingSearch, setPendingSearch] = React.useState('')
  const [pendingDebouncedSearch, setPendingDebouncedSearch] = React.useState('')
  const [approvingTxn, setApprovingTxn] = React.useState<PendingStockTransaction | null>(null)
  const [approving, setApproving] = React.useState(false)
  const [rejectingTxn, setRejectingTxn] = React.useState<PendingStockTransaction | null>(null)
  const [rejectReason, setRejectReason] = React.useState('')
  const [rejecting, setRejecting] = React.useState(false)

  React.useEffect(() => {
    const t = setTimeout(() => setPendingDebouncedSearch(pendingSearch), 300)
    return () => clearTimeout(t)
  }, [pendingSearch])

  // ---- Pending list query ----
  const { data: pendingData, isLoading: loadingPending } = useQuery<PendingListResponse>({
    queryKey: ['stock-pending', pendingFilter, pendingDebouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('status', pendingFilter)
      if (pendingDebouncedSearch) params.set('search', pendingDebouncedSearch)
      params.set('pageSize', '200')
      const res = await fetch(`/api/stock-items/pending?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load pending')
      const json = await res.json()
      return json as PendingListResponse
    },
  })

  const pendingList = pendingData?.data ?? []

  async function handleApprovePending(t: PendingStockTransaction) {
    try {
      setApproving(true)
      setApprovingTxn(t)
      const res = await fetch(
        `/api/stock-items/${t.stockItemId}/pending/${t.id}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approver: 'admin' }),
        },
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'ApproveNoSuccess')
      }
      toast.success(`ApproveStock Out ${t.productCode ?? ''} Success`)
      setApprovingTxn(null)
      await qc.invalidateQueries({ queryKey: ['stock-pending'] })
      await qc.invalidateQueries({ queryKey: ['stock-items'] })
      // Refresh any open detail dialog
      if (detailId) {
        await qc.invalidateQueries({ queryKey: ['stock-item-detail', detailId] })
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ApproveNoSuccess')
    } finally {
      setApproving(false)
    }
  }

  async function handleRejectPending() {
    if (!rejectingTxn) return
    if (!rejectReason.trim()) {
      toast.error('PleaseSpecifycauseResultinReject')
      return
    }
    try {
      setRejecting(true)
      const res = await fetch(
        `/api/stock-items/${rejectingTxn.stockItemId}/pending/${rejectingTxn.id}/reject`,
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
        throw new Error(j.error ?? 'RejectNoSuccess')
      }
      toast.success(`RejectRequestStock Out ${rejectingTxn.productCode ?? ''} `)
      setRejectingTxn(null)
      setRejectReason('')
      await qc.invalidateQueries({ queryKey: ['stock-pending'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'RejectNoSuccess')
    } finally {
      setRejecting(false)
    }
  }

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
      costModel: (item as { costModel?: string | null }).costModel ?? 'fixed',
      expectedDevicesPerUnit: (item as { expectedDevicesPerUnit?: number | null }).expectedDevicesPerUnit != null ? String((item as { expectedDevicesPerUnit?: number | null }).expectedDevicesPerUnit) : '',
      expectedHoursPerUnit: (item as { expectedHoursPerUnit?: number | null }).expectedHoursPerUnit != null ? String((item as { expectedHoursPerUnit?: number | null }).expectedHoursPerUnit) : '',
      expectedPagesPerUnit: (item as { expectedPagesPerUnit?: number | null }).expectedPagesPerUnit != null ? String((item as { expectedPagesPerUnit?: number | null }).expectedPagesPerUnit) : '',
      ratePerPage: (item as { ratePerPage?: number | string | null }).ratePerPage != null ? String((item as { ratePerPage?: number | string | null }).ratePerPage) : '',
      ratePerHour: (item as { ratePerHour?: number | string | null }).ratePerHour != null ? String((item as { ratePerHour?: number | string | null }).ratePerHour) : '',
      ratePerMonth: (item as { ratePerMonth?: number | string | null }).ratePerMonth != null ? String((item as { ratePerMonth?: number | string | null }).ratePerMonth) : '',
      ratePerDevice: (item as { ratePerDevice?: number | string | null }).ratePerDevice != null ? String((item as { ratePerDevice?: number | string | null }).ratePerDevice) : '',
    })
    setItemDialogOpen(true)
  }
  async function saveItem() {
    if (!itemForm.productName) {
      toast.error('PleasePendingNameProduct')
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
        // WO-PARTS-FLOW Level 2+: cost model + expected usage + rates
        costModel: itemForm.costModel || null,
        expectedDevicesPerUnit: itemForm.expectedDevicesPerUnit === '' ? null : Number(itemForm.expectedDevicesPerUnit),
        expectedHoursPerUnit: itemForm.expectedHoursPerUnit === '' ? null : Number(itemForm.expectedHoursPerUnit),
        expectedPagesPerUnit: itemForm.expectedPagesPerUnit === '' ? null : Number(itemForm.expectedPagesPerUnit),
        ratePerPage: itemForm.ratePerPage === '' ? null : Number(itemForm.ratePerPage),
        ratePerHour: itemForm.ratePerHour === '' ? null : Number(itemForm.ratePerHour),
        ratePerMonth: itemForm.ratePerMonth === '' ? null : Number(itemForm.ratePerMonth),
        ratePerDevice: itemForm.ratePerDevice === '' ? null : Number(itemForm.ratePerDevice),
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
      toast.success(isEdit ? 'EditProduct' : 'AddProductNew')
      setItemDialogOpen(false)
      await qc.invalidateQueries({ queryKey: ['stock-items'] })
      if (isEdit && detailId === itemForm.id) {
        await qc.invalidateQueries({ queryKey: ['stock-item-detail', detailId] })
      }
      // Surface auto-generated productCode after create.
      if (!isEdit && json?.data?.productCode) {
        toast.info(`CodeProductNew: ${json.data.productCode}`)
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
      toast.success('DeleteProduct')
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
      toast.error('PleasePendingQuantityatcorrectMust')
      return
    }
    if ((txnForm.type === 'IN' || txnForm.type === 'OUT') && qty <= 0) {
      toast.error('QuantityForStock In/Stock OutMustComemore than 0')
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
          ? 'Stock In'
          : txnForm.type === 'OUT'
          ? 'Stock Out'
          : 'Update'
      toast.success(`${verb}Success — Remaining ${json.data.item.quantity} ${json.data.item.unit}`)
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
      toast.error('PleaseSpecifyDateorder')
      return
    }
    const cleanLines = poLines.filter((l) => l.stockItemId)
    if (cleanLines.length === 0) {
      toast.error('MustAddLikeless 1 itemProduct')
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
      toast.success('CreatePurchase Order')
      if (json?.data?.poNumber) {
        toast.info(`No.atPurchase Order: ${json.data.poNumber}`)
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
          Stock In
        </Badge>
      )
    if (type === 'OUT')
      return (
        <Badge className="border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
          Stock Out
        </Badge>
      )
    return (
      <Badge className="border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
        Update
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
      open: 'CloseAt',
      partial: 'ReceivesomeSection',
      received: 'Receivecomplete',
      cancelled: 'Cancel',
    }
    return (
      <Badge className={map[status] ?? map.open}>{labelMap[status] ?? status}</Badge>
    )
  }

  const pendingStatusBadge = (status: string | null) => {
    if (status === 'PENDING') {
      return (
        <Badge className="border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          PendingApprove
        </Badge>
      )
    }
    if (status === 'APPROVED') {
      return (
        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Approve
        </Badge>
      )
    }
    if (status === 'REJECTED') {
      return (
        <Badge className="border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
          Reject
        </Badge>
      )
    }
    return (
      <Badge className="border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        Doitem
      </Badge>
    )
  }

  // ---------- KPI cards ----------
  const KPI_CARDS = [
    {
      title: 'itemAll',
      value: stats.total,
      icon: <Package className="h-5 w-5" />,
      accent: 'bg-[#f97316] text-white',
      soft: 'bg-orange-50 dark:bg-orange-950/40',
      format: (v: number) => `${v} item`,
    },
    {
      title: 'StockLow',
      value: stats.lowStock,
      icon: <AlertTriangle className="h-5 w-5" />,
      accent: 'bg-rose-500 text-white',
      soft: 'bg-rose-50 dark:bg-rose-950/40',
      format: (v: number) => `${v} item`,
    },
    {
      title: 'ValueTotal',
      value: stats.totalValue,
      icon: <Wallet className="h-5 w-5" />,
      accent: 'bg-teal-600 text-white',
      soft: 'bg-teal-50 dark:bg-teal-950/40',
      format: (v: number) => formatBaht(v),
    },
    {
      title: 'itemmonths',
      value: stats.thisMonth,
      icon: <CalendarPlus className="h-5 w-5" />,
      accent: 'bg-slate-700 text-white',
      soft: 'bg-slate-100 dark:bg-slate-800/60',
      format: (v: number) => `${v} item`,
    },
  ]

  return (
    <div className="min-w-0 flex h-full flex-col overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      {/* Page header — primary CTA (AddProduct) is first so it's the
          obvious action; secondary actions follow. */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            📦 StockProduct
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            ManageProductInventory Stock In/Stock Out andPurchase Order
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={openAddItem}
            className="order-first w-full bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950 sm:order-none sm:w-auto"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            AddProduct
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={openAddPo}
            className="border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-950/40"
          >
            <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
            CreatePurchase Order
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['stock-items'] })}
            className="border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
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

      {/* Tabs: items | purchase orders | pending approval */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'items' | 'po' | 'pending')}>
        <TabsList className="bg-slate-100 dark:bg-slate-800">
          <TabsTrigger value="items">
            <Package2 className="mr-1.5 h-3.5 w-3.5" />
            ProductInventory
          </TabsTrigger>
          <TabsTrigger value="po">
            <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
            Purchase Order
          </TabsTrigger>
          <TabsTrigger value="pending">
            <Hourglass className="mr-1.5 h-3.5 w-3.5" />
            PendingApprove
          </TabsTrigger>
        </TabsList>

        {/* ===== Items tab ===== */}
        <TabsContent value="items" className="mt-4">
          {/* Filter bar */}
          <Card className="mb-4 border-slate-200 dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Search
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="CodeProduct Name Brand Model..."
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="w-full sm:w-56">
                <Label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Category
                </Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">CategoryAll</SelectItem>
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
                  aria-label="FilterStockLow"
                />
                <Label className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
                  ShowOnlyStockLow
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
                      <TableHead className="w-28">CodeProduct</TableHead>
                      <TableHead>NameProduct</TableHead>
                      <TableHead className="w-32">Category</TableHead>
                      <TableHead className="w-20 text-right">Remaining</TableHead>
                      <TableHead className="w-20">Unit</TableHead>
                      <TableHead className="w-24 text-right">Price/Unit</TableHead>
                      <TableHead className="w-28 text-right">ValueTotal</TableHead>
                      <TableHead className="w-56 text-right">Actions</TableHead>
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
                          <div className="text-sm">Not foundProductinStock</div>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={openAddItem}
                            className="mt-2 text-[#f97316] hover:text-[#ea580c]"
                          >
                            AddProductNew
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
                                  Lowthan {item.minQuantity}
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
                                  title="Stock In"
                                >
                                  <ArrowDownToLine className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                  onClick={() => openTxn(item, 'OUT')}
                                  title="Stock Out"
                                  disabled={item.quantity <= 0}
                                >
                                  <ArrowUpFromLine className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40"
                                  onClick={() => openTxn(item, 'ADJUST')}
                                  title="Update"
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
                                  title="ViewDetails"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-slate-600 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                                  onClick={() => openEditItem(item)}
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                  onClick={() => setDeleteTarget(item)}
                                  title="Delete"
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
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Purchase OrderAll ({purchaseOrders.length} item)
            </h3>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={purchaseOrders.length === 0}
                onClick={() => {
                  const rows: (string | number | null | undefined)[][] = [
                    [
                      'No.atPurchase Order',
                      'Dateorder',
                      'Supplier',
                      'Quantityitem',
                      'Status',
                      'ValueTotal',
                      'Personorder',
                      'Remark',
                      'itemProduct',
                    ],
                  ]
                  for (const po of purchaseOrders) {
                    const itemDesc = (po.items ?? [])
                      .map(
                        (it) =>
                          `${it.stockItem?.productCode ?? '—'} x${it.quantityOrdered} @ ${it.unitPrice ?? 0}`,
                      )
                      .join(' | ')
                    rows.push([
                      po.poNumber,
                      formatThaiDate(po.orderDate),
                      po.supplier,
                      po.items?.length ?? 0,
                      po.status,
                      po.totalValue,
                      po.createdBy,
                      po.remark,
                      itemDesc,
                    ])
                  }
                  const fname = `purchase-orders-${new Date().toISOString().slice(0, 10)}.csv`
                  downloadCSV(fname, rows)
                  toast.success(`Export ${purchaseOrders.length} Purchase Orderas CSV `)
                }}
                className="h-8 border-slate-300 px-3 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                title="ExportPurchase OrderAllas CSV"
              >
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>
          </div>
          <Card className="border-slate-200 dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/60">
                      <TableHead className="w-36">No.atPurchase Order</TableHead>
                      <TableHead className="w-32">Dateorder</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="w-24 text-right">item</TableHead>
                      <TableHead className="w-32 text-right">ValueTotal</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="w-32 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingPo ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={`p-${i}`}>
                          {Array.from({ length: 7 }).map((__, j) => (
                            <TableCell key={`p-${i}-${j}`}>
                              <Skeleton className="h-5 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : purchaseOrders.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="py-12 text-center text-slate-500 dark:text-slate-400"
                        >
                          <ClipboardList className="mx-auto mb-2 h-10 w-10 opacity-30" />
                          <div className="text-sm">StillNonePurchase Order</div>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={openAddPo}
                            className="mt-2 text-[#f97316] hover:text-[#ea580c]"
                          >
                            CreatePurchase OrderNew
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
                            {po.items?.length ?? 0} item
                          </TableCell>
                          <TableCell className="text-right font-medium text-slate-700 dark:text-slate-200">
                            {formatBaht(po.totalValue)}
                          </TableCell>
                          <TableCell>{poStatusBadge(po.status)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-[11px] text-teal-600 hover:bg-teal-50 hover:text-teal-700 dark:text-teal-400 dark:hover:bg-teal-950/40"
                              onClick={() =>
                                printDocument(`/api/purchase-orders/${po.id}/print`)
                              }
                              title="PrintPurchase Order"
                            >
                              <Printer className="mr-1 h-3 w-3" />
                              PrintPurchase Order
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== Pending approval tab ===== */}
        <TabsContent value="pending" className="mt-4">
          {/* Filter bar */}
          <Card className="mb-4 border-slate-200 dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Search
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={pendingSearch}
                    onChange={(e) => setPendingSearch(e.target.value)}
                    placeholder="No.atRequest / CodeProduct / Name / No.Work Order"
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="w-full sm:w-56">
                <Label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Status
                </Label>
                <Select
                  value={pendingFilter}
                  onValueChange={(v) =>
                    setPendingFilter(
                      v as 'PENDING' | 'APPROVED' | 'REJECTED' | 'all',
                    )
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">PendingApprove</SelectItem>
                    <SelectItem value="APPROVED">Approve</SelectItem>
                    <SelectItem value="REJECTED">Reject</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  qc.invalidateQueries({ queryKey: ['stock-pending'] })
                }
                className="border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Refresh
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/60">
                      <TableHead className="w-32">No.atRequest</TableHead>
                      <TableHead className="w-32">Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-24 text-right">Quantity</TableHead>
                      <TableHead className="w-28 text-right">Remaining</TableHead>
                      <TableHead className="w-32">No.Work Order</TableHead>
                      <TableHead>causeResult / Remark</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="w-40 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingPending ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <TableRow key={`pen-${i}`}>
                          {Array.from({ length: 9 }).map((__, j) => (
                            <TableCell key={`pen-${i}-${j}`}>
                              <Skeleton className="h-5 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : pendingList.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={9}
                          className="py-12 text-center text-slate-500 dark:text-slate-400"
                        >
                          <Hourglass className="mx-auto mb-2 h-10 w-10 opacity-30" />
                          <div className="text-sm">
                            Not foundRequestStock Out
                            {pendingFilter !== 'all'
                              ? ` atHasStatus "${
                                  pendingFilter === 'PENDING'
                                    ? 'PendingApprove'
                                    : pendingFilter === 'APPROVED'
                                    ? 'Approve'
                                    : 'Reject'
                                }"`
                              : ''}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      pendingList.map((t) => {
                        const stockQty = t.stockItem?.quantity
                        const insufficient =
                          stockQty !== undefined && stockQty < t.quantity
                        return (
                          <TableRow
                            key={t.id}
                            className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            <TableCell className="font-mono text-xs font-semibold text-purple-600 dark:text-purple-400">
                              {t.txnNumber ?? '—'}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                              {formatThaiDate(t.txnDate)}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-slate-800 dark:text-slate-100">
                                {t.productName ?? t.stockItem?.productName ?? '—'}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                {t.productCode ?? '—'}
                                {t.requester && (
                                  <span className="ml-1.5 text-slate-400">
                                    • PersonWithdraw: {t.requester}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-rose-600 dark:text-rose-400">
                              -{t.quantity} {t.unit ?? ''}
                            </TableCell>
                            <TableCell
                              className={`text-right ${
                                insufficient
                                  ? 'font-semibold text-rose-600 dark:text-rose-400'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {stockQty !== undefined ? stockQty : '—'}
                              {insufficient && (
                                <div className="text-[10px] font-normal text-rose-500">
                                  Nosufficient
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {t.workOrderNo ? (
                                <Badge
                                  variant="outline"
                                  className="border-purple-200 bg-purple-100 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300"
                                >
                                  {t.workOrderNo}
                                </Badge>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                              <div className="line-clamp-2 max-w-xs">
                                {t.reason ?? '—'}
                              </div>
                              {t.purpose && (
                                <div className="text-[10px] text-slate-400">
                                  for: {t.purpose}
                                </div>
                              )}
                              {t.rejectReason && (
                                <div className="text-[10px] text-rose-500">
                                  Reject: {t.rejectReason}
                                </div>
                              )}
                              {t.approver && (
                                <div className="text-[10px] text-slate-400">
                                  by: {t.approver}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>{pendingStatusBadge(t.approvalStatus)}</TableCell>
                            <TableCell>
                              {t.approvalStatus === 'PENDING' ? (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-2 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                                    onClick={() => handleApprovePending(t)}
                                    disabled={
                                      approving && approvingTxn?.id === t.id
                                    }
                                    title="Approve"
                                  >
                                    {approving && approvingTxn?.id === t.id ? (
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Check className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                    onClick={() => {
                                      setRejectingTxn(t)
                                      setRejectReason('')
                                    }}
                                    title="Reject"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <span className="block text-right text-[11px] text-slate-400">
                                  —
                                </span>
                              )}
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
      </Tabs>

      {/* ===== Item add/edit dialog ===== */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-slate-800 dark:text-slate-100">
              {itemForm.id ? '✏️ EditProduct' : '➕ AddProductNew'}
            </DialogTitle>
            <DialogDescription>
              {itemForm.id
                ? `EditDataProduct ${itemForm.productCode}`
                : 'CodeProductwillcorrectCreateAutoinimageType STK-NNNN IfUnspecified'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                CodeProduct
              </Label>
              <Input
                value={itemForm.productCode}
                onChange={(e) =>
                  setItemForm({ ...itemForm, productCode: e.target.value })
                }
                placeholder="STK-0001 (leave blankforCreateAuto)"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                NameProduct *
              </Label>
              <Input
                value={itemForm.productName}
                onChange={(e) =>
                  setItemForm({ ...itemForm, productName: e.target.value })
                }
                placeholder="e.g. InkPrint EPSON T544"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Category
              </Label>
              <Select
                value={itemForm.category}
                onValueChange={(v) =>
                  setItemForm({ ...itemForm, category: v === '__none' ? '' : v })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="SelectCategory" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— Unspecified —</SelectItem>
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
                Unit
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
                Brand
              </Label>
              <Input
                value={itemForm.brand}
                onChange={(e) =>
                  setItemForm({ ...itemForm, brand: e.target.value })
                }
                placeholder="e.g. EPSON, HP"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Model
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
                QuantityRemaining
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
                reorder point (stepLow)
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
                QuantityHighEnd
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
                PriceperUnit (THB)
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
              <p className="text-[10px] text-slate-400">
                UseFor cost model = &quot;PriceperUnit (remainat)&quot;
              </p>
            </div>

            {/* ── WO-PARTS-FLOW Level 2+: cost model + rate config ── */}
            <div className="col-span-2 rounded-lg border border-purple-200 bg-purple-50/40 p-3 dark:border-purple-800 dark:bg-purple-950/20">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300">
                <Coins className="h-3.5 w-3.5" />
                imageTypethinkFeeUsepay (Cost Model)
              </div>
              <div className="space-y-2">
                <div>
                  <Label className="text-[10px] text-slate-500">SelectimageTypethinkFeeUsepay</Label>
                  <select
                    className="mt-0.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                    value={itemForm.costModel}
                    onChange={(e) => setItemForm({ ...itemForm, costModel: e.target.value })}
                  >
                    <option value="fixed">PriceperUnit (remainat) — e.g. CartridgeInk, Parts</option>
                    <option value="per-page">PriceperfrontPrint — e.g. leasePrint</option>
                    <option value="per-hour">Priceperhr — e.g. Devicerentitemhr</option>
                    <option value="monthly">Comeitemmonths — e.g. Feemaintenanceitemmonths</option>
                    <option value="per-device">Priceperunits — e.g. Feeservice perunits</option>
                  </select>
                </div>

                {/* Conditional rate inputs based on costModel */}
                {itemForm.costModel === 'per-page' && (
                  <div>
                    <Label className="text-[10px] text-slate-500">rateFeeservice perfront (THB)</Label>
                    <Input type="number" min="0" step="0.01" value={itemForm.ratePerPage}
                      onChange={(e) => setItemForm({ ...itemForm, ratePerPage: e.target.value })}
                      placeholder="0.50" className="h-8 text-xs" />
                  </div>
                )}
                {itemForm.costModel === 'per-hour' && (
                  <div>
                    <Label className="text-[10px] text-slate-500">rateFeeservice perhr (THB)</Label>
                    <Input type="number" min="0" step="0.01" value={itemForm.ratePerHour}
                      onChange={(e) => setItemForm({ ...itemForm, ratePerHour: e.target.value })}
                      placeholder="100.00" className="h-8 text-xs" />
                  </div>
                )}
                {itemForm.costModel === 'monthly' && (
                  <div>
                    <Label className="text-[10px] text-slate-500">FeeComeitemmonths (THB)</Label>
                    <Input type="number" min="0" step="0.01" value={itemForm.ratePerMonth}
                      onChange={(e) => setItemForm({ ...itemForm, ratePerMonth: e.target.value })}
                      placeholder="1500.00" className="h-8 text-xs" />
                  </div>
                )}
                {itemForm.costModel === 'per-device' && (
                  <div>
                    <Label className="text-[10px] text-slate-500">Feeservice perunits (THB)</Label>
                    <Input type="number" min="0" step="0.01" value={itemForm.ratePerDevice}
                      onChange={(e) => setItemForm({ ...itemForm, ratePerDevice: e.target.value })}
                      placeholder="200.00" className="h-8 text-xs" />
                  </div>
                )}
              </div>

              {/* Expected usage defaults — used by parts picker */}
              <div className="mt-3 border-t border-purple-200 pt-2 dark:border-purple-800">
                <div className="mb-1.5 text-[10px] font-semibold text-purple-700 dark:text-purple-300">
                  specActive (FillAutoinfrontWithdrawParts)
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] text-slate-500">1 UnitFill?units</Label>
                    <Input type="number" min="0" value={itemForm.expectedDevicesPerUnit}
                      onChange={(e) => setItemForm({ ...itemForm, expectedDevicesPerUnit: e.target.value })}
                      placeholder="3" className="h-8 text-xs" />
                    <p className="text-[9px] text-slate-400">e.g. Inkwater 1 bottles Fill 3 units</p>
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-500">1 UnitUse?hr.</Label>
                    <Input type="number" min="0" value={itemForm.expectedHoursPerUnit}
                      onChange={(e) => setItemForm({ ...itemForm, expectedHoursPerUnit: e.target.value })}
                      placeholder="8" className="h-8 text-xs" />
                    <p className="text-[9px] text-slate-400">e.g. battery 8 hr.</p>
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-500">1 UnitPrint?front (Yield)</Label>
                    <Input type="number" min="0" value={itemForm.expectedPagesPerUnit}
                      onChange={(e) => setItemForm({ ...itemForm, expectedPagesPerUnit: e.target.value })}
                      placeholder="6000" className="h-8 text-xs" />
                    <p className="text-[9px] text-slate-400">e.g. Ink 6,000 sheets / drum 15,000 sheets</p>
                  </div>
                </div>
                <p className="mt-2 text-[9px] italic text-slate-400">
                  💡 unitLikespecStandard: Ink EPSON T544 = 6,000 sheets/bottles · drum OKI = 15,000 sheets/Cartridge · CartridgeInk HP 85A = 1,600 sheets
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                LocationStore
              </Label>
              <Input
                value={itemForm.location}
                onChange={(e) =>
                  setItemForm({ ...itemForm, location: e.target.value })
                }
                placeholder="e.g. Floor A-1"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Site
              </Label>
              <Input
                value={itemForm.site}
                onChange={(e) =>
                  setItemForm({ ...itemForm, site: e.target.value })
                }
                placeholder="e.g. HQ"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                DeviceatPendingReceive
              </Label>
              <Input
                value={itemForm.compatibleDevices}
                onChange={(e) =>
                  setItemForm({
                    ...itemForm,
                    compatibleDevices: e.target.value,
                  })
                }
                placeholder="e.g. EPSON L5290, L3210 (คั่withmicroPart)"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Remark
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
              Cancel
            </Button>
            <Button
              onClick={saveItem}
              disabled={savingItem}
              className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {savingItem ? 'Save...' : 'Save'}
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
                  ReceiveProductin
                </>
              )}
              {txnForm.type === 'OUT' && (
                <>
                  <ArrowUpFromLine className="h-4 w-4 text-rose-600" />
                  WithdrawProductout
                </>
              )}
              {txnForm.type === 'ADJUST' && (
                <>
                  <SlidersHorizontal className="h-4 w-4 text-amber-600" />
                  UpdateStock
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {txnTarget && (
                <span>
                  {txnTarget.productCode} — {txnTarget.productName}
                  <br />
                  RemainingCurrent: {txnTarget.quantity} {txnTarget.unit}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {txnForm.type === 'ADJUST'
                  ? 'QuantityRemainingNew (SetNew)'
                  : 'Quantity *'}
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
                  QuantityatWithdrawHighEnd: {txnTarget.quantity} {txnTarget.unit}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  DateDoitem
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
                  causeResult
                </Label>
                <Input
                  value={txnForm.reason}
                  onChange={(e) =>
                    setTxnForm({ ...txnForm, reason: e.target.value })
                  }
                  placeholder={
                    txnForm.type === 'IN'
                      ? 'buy / movein'
                      : txnForm.type === 'OUT'
                      ? 'WithdrawUse / moveout / Color'
                      : 'Stock Count / ReceiveAmount'
                  }
                />
              </div>
            </div>
            {txnForm.type === 'IN' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    buyfrom (Supplier)
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
                    ValueTotal (THB)
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
                  PersonDoitem
                </Label>
                <Input
                  value="SystemwillbindWithaccountatintoSystem"
                  readOnly
                  aria-describedby="stock-transaction-actor-help"
                />
                <p
                  id="stock-transaction-actor-help"
                  className="text-[11px] text-slate-500 dark:text-slate-400"
                >
                  NoCanChangeNamePersonDoitemfromform
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Remark
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
              Cancel
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
              {savingTxn ? 'Save...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Detail dialog ===== */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Eye className="h-4 w-4 text-slate-500" />
              DetailsProduct
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
                <DetailField label="CodeProduct" value={detailData.productCode} mono />
                <DetailField label="Category" value={detailData.category} />
                <DetailField label="Brand" value={detailData.brand} />
                <DetailField label="Model" value={detailData.model} />
                <DetailField
                  label="Remaining"
                  value={`${detailData.quantity} ${detailData.unit}`}
                  highlight={detailData.quantity <= detailData.minQuantity}
                />
                <DetailField
                  label="reorder point"
                  value={`${detailData.minQuantity} ${detailData.unit}`}
                />
                <DetailField
                  label="Price/Unit"
                  value={formatBaht(detailData.unitCost)}
                />
                <DetailField
                  label="ValueTotal"
                  value={formatBaht(
                    (detailData.unitCost ?? 0) * detailData.quantity,
                  )}
                />
                <DetailField label="LocationStore" value={detailData.location} />
                <DetailField label="Site" value={detailData.site} />
                <DetailField
                  label="DeviceatPendingReceive"
                  value={detailData.compatibleDevices}
                  span={2}
                />
                <DetailField
                  label="Remark"
                  value={detailData.remark}
                  span={2}
                />
                <DetailField
                  label="Status"
                  value={detailData.active ? 'Active' : 'CloseActive'}
                />
              </div>

              {/* Stock level progress */}
              {detailData.maxQuantity > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300">
                      levelStock
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
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    HistoryStock In/Stock Out
                  </h3>
                  <div className="flex items-center gap-2">
                    {detailData.transactions.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const rows: (string | number | null | undefined)[][] = [
                            [
                              'No.at',
                              'Type',
                              'CodeProduct',
                              'NameProduct',
                              'Quantity',
                              'Unit',
                              'Remaining',
                              'Price/Unit',
                              'ValueTotal',
                              'Supplier/PersonWithdraw',
                              'Dept',
                              'Objective/causeResult',
                              'PersonApprove',
                              'Purchase Order',
                              'Work Order',
                              'Date',
                              'blackhillby',
                              'Remark',
                            ],
                          ]
                          for (const t of detailData.transactions) {
                            rows.push([
                              t.txnNumber,
                              t.type,
                              t.productCode ?? detailData.productCode,
                              t.productName ?? detailData.productName,
                              t.quantity,
                              t.unit ?? detailData.unit,
                              t.balanceAfter,
                              t.unitCost ?? detailData.unitCost,
                              t.cost,
                              t.vendor ?? t.requester,
                              t.department,
                              t.purpose ?? t.reason,
                              t.approver,
                              t.purchaseOrderNo,
                              t.workOrderNo,
                              formatThaiDate(t.txnDate),
                              t.performedBy,
                              t.remark,
                            ])
                          }
                          const fname = `stock-transactions-${detailData.productCode || detailData.id}-${new Date().toISOString().slice(0, 10)}.csv`
                          downloadCSV(fname, rows)
                          toast.success(`Export ${detailData.transactions.length} itemas CSV `)
                        }}
                        className="h-7 border-slate-300 px-2 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        title="ExporttransactionAllas CSV"
                      >
                        <FileDown className="mr-1 h-3 w-3" />
                        Export CSV
                      </Button>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {detailData.transactions.length} item
                    </Badge>
                  </div>
                </div>
                {detailData.transactions.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    StillNoneHistoryStock In/Stock Out
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700">
                    <Table>
                      <TableHeader className="sticky top-0 bg-slate-50 dark:bg-slate-800/80">
                        <TableRow>
                          <TableHead className="w-28">No.at</TableHead>
                          <TableHead className="w-20">Type</TableHead>
                          <TableHead className="w-24 text-right">Quantity</TableHead>
                          <TableHead className="w-24 text-right">Remaining</TableHead>
                          <TableHead>causeResult</TableHead>
                          <TableHead className="w-28">Date</TableHead>
                          <TableHead className="w-16 text-right">Print</TableHead>
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
                                  from: {t.vendor}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 dark:text-slate-400">
                              {formatThaiDate(t.txnDate)}
                            </TableCell>
                            <TableCell className="text-right">
                              {t.type === 'IN' ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-[11px] text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                                  onClick={() =>
                                    printDocument(
                                      `/api/stock-items/${detailData.id}/print?txnId=${t.id}&type=in`,
                                    )
                                  }
                                  title="PrintticketReceiveProduct"
                                >
                                  <Printer className="mr-1 h-3 w-3" />
                                  ticketReceive
                                </Button>
                              ) : t.type === 'OUT' ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                                  onClick={() =>
                                    printDocument(
                                      `/api/stock-items/${detailData.id}/print?txnId=${t.id}&type=out`,
                                    )
                                  }
                                  title="PrintticketWithdrawProduct"
                                >
                                  <Printer className="mr-1 h-3 w-3" />
                                  ticketWithdraw
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-[11px] text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40"
                                  onClick={() =>
                                    printDocument(
                                      `/api/stock-items/${detailData.id}/print?txnId=${t.id}`,
                                    )
                                  }
                                  title="PrintticketUpdateStock"
                                >
                                  <Printer className="mr-1 h-3 w-3" />
                                  ticketReceive
                                </Button>
                              )}
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
                  Stock In
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
                  Stock Out
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
                  Update
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
                  Edit
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
              ConfirmDeleteProduct
            </DialogTitle>
            <DialogDescription>
              {deleteTarget && (
                <span>
                  youwillDelete{' '}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {deleteTarget.productCode} — {deleteTarget.productName}
                  </strong>
                  <br />
                  SystemwillSettingsStatusas &quot;CloseActive&quot; (soft delete)
                  forkeepHistoryStock In/Stock OutKeep
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
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {deleting ? 'Delete...' : 'DeleteProduct'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Purchase order dialog ===== */}
      <Dialog open={poDialogOpen} onOpenChange={setPoDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <ShoppingCart className="h-4 w-4 text-teal-600" />
              CreatePurchase Order
            </DialogTitle>
            <DialogDescription>
              No.atPurchase OrderwillcorrectCreateAutoinimageType PO-YYYYMMDD-NNN
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Dateorder *
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
                  Supplier
                </Label>
                <Input
                  value={poForm.supplier}
                  onChange={(e) =>
                    setPoForm({ ...poForm, supplier: e.target.value })
                  }
                  placeholder="Namecompany/shop"
                />
              </div>
            </div>

            {/* PO lines */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  itemProduct
                </Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addPoLine}
                  className="h-7 border-teal-300 px-2 text-xs text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-950/40"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Additem
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
                            <SelectValue placeholder="SelectProduct" />
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
                          placeholder="Quantity"
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
                          placeholder="Price/Unit"
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
                      ValueTotalall:
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
                Remark
              </Label>
              <Textarea
                value={poForm.remark}
                onChange={(e) =>
                  setPoForm({ ...poForm, remark: e.target.value })
                }
                rows={2}
                placeholder="e.g. orderforFillStockmonths..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPoDialogOpen(false)}
              disabled={savingPo}
            >
              Cancel
            </Button>
            <Button
              onClick={savePo}
              disabled={savingPo}
              className="bg-teal-600 text-white hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {savingPo ? 'Save...' : 'CreatePurchase Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Reject pending dialog ===== */}
      <Dialog
        open={Boolean(rejectingTxn)}
        onOpenChange={(o) => {
          if (!o) {
            setRejectingTxn(null)
            setRejectReason('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
              <XCircle className="h-4 w-4" />
              RejectRequestStock Out
            </DialogTitle>
            <DialogDescription>
              {rejectingTxn && (
                <span>
                  youwillRejectRequestStock Out{' '}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {rejectingTxn.productCode ?? '—'} — {rejectingTxn.productName ?? rejectingTxn.stockItem?.productName ?? ''}
                  </strong>
                  <br />
                  Quantity {rejectingTxn.quantity} {rejectingTxn.unit ?? ''}
                  {rejectingTxn.workOrderNo && (
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                      No.Work OrderatNamelink: {rejectingTxn.workOrderNo}
                    </span>
                  )}
                  <br />
                  SystemwillNoReduceQuantityStock — PersonWithdrawMustCreateRequestNewIfMust
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              causeResultatReject <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. SpecifycauseResultinReject, Quantitymore thanatApprove, NoYesWorkatReceivewronglike..."
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectingTxn(null)
                setRejectReason('')
              }}
              disabled={rejecting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRejectPending}
              disabled={rejecting || !rejectReason.trim()}
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {rejecting ? 'Save...' : 'RejectRequest'}
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
