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
import { Checkbox } from '@/components/ui/checkbox'
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
  Pencil,
  Trash2,
  Search,
  Eye,
  Download,
  Upload,
  Tag,
  PackageOpen,
  X,
  ArrowRight,
  UserMinus,
} from 'lucide-react'
import {
  type Device,
  type Site,
  DEVICE_STATUS_OPTIONS,
  statusBadgeClass,
  statusLabel,
  computeWarranty,
  warrantyBadgeClass,
  warrantyLabel,
} from './types'
import { DeviceDetailSheet } from './device-detail-sheet'
import { CsvImportDialog } from './csv-import-dialog'
import { StickerPrintDialog } from './sticker-print-dialog'
import { QrCode, ScanLine } from 'lucide-react'
import { downloadCsv, dateStamp } from '@/lib/csv'
import { useAppStore } from '@/store/app-store'

const DEVICE_CSV_HEADERS = [
  { key: 'assetCode', label: 'รหัสอุปกรณ์' },
  { key: 'name', label: 'ชื่อ' },
  { key: 'brand', label: 'แบรนด์' },
  { key: 'model', label: 'รุ่น' },
  { key: 'type', label: 'ประเภท' },
  { key: 'serialNumber', label: 'หมายเลข SN' },
  { key: 'status', label: 'สถานะ' },
  { key: 'site', label: 'สาขา' },
  { key: 'currentAssignee', label: 'ผู้ใช้งาน' },
  { key: 'department', label: 'แผนก' },
  { key: 'departmentCode', label: 'รหัสแผนก' },
  { key: 'parentRef', label: 'ParentRef' },
  { key: 'displayLabel', label: 'DisplayLabel' },
  { key: 'location', label: 'ที่ตั้ง' },
  { key: 'purchaseDate', label: 'วันที่ซื้อ' },
  { key: 'lastMeterReading', label: 'มิเตอร์ล่าสุด' },
]

interface FormState {
  id?: string
  assetCode: string
  name: string
  brand: string
  model: string
  type: string
  serialNumber: string
  status: string
  site: string
  department: string
  departmentCode: string
  parentRef: string
  displayLabel: string
  location: string
  purchaseDate: string
  warrantyMonths: string
  purchasePrice: string
  salvageValue: string
  usefulLife: string
}

const EMPTY_FORM: FormState = {
  assetCode: '',
  name: '',
  brand: '',
  model: '',
  type: '',
  serialNumber: '',
  status: 'active',
  site: 'HQ',
  department: '',
  departmentCode: '',
  parentRef: '',
  displayLabel: '',
  location: '',
  purchaseDate: '',
  warrantyMonths: '12',
  purchasePrice: '',
  salvageValue: '0',
  usefulLife: '60',
}

const WARRANTY_FILTER_OPTIONS = [
  { value: 'all', label: 'รับประกันทั้งหมด' },
  { value: 'expiring', label: 'ใกล้หมด' },
  { value: 'expired', label: 'หมดแล้ว' },
] as const

const ASSIGNEE_FILTER_OPTIONS = [
  { value: 'all', label: 'ผู้ใช้งานทั้งหมด' },
  { value: 'assigned', label: 'มอบหมายแล้ว' },
  { value: 'unassigned', label: 'ยังไม่มอบหมาย' },
] as const

// Palette used for assignee avatars — deterministic per first character.
const AVATAR_COLORS = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
  'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
]
function avatarColor(name: string): string {
  if (!name) return AVATAR_COLORS[AVATAR_COLORS.length - 1]
  const code = name.charCodeAt(0)
  return AVATAR_COLORS[code % AVATAR_COLORS.length]
}

export function DevicesPage() {
  const qc = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [siteFilter, setSiteFilter] = React.useState('all')
  const [warrantyFilter, setWarrantyFilter] = React.useState<string>('all')
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>('all')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<Device | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [detailDeviceId, setDetailDeviceId] = React.useState<string | null>(
    null,
  )
  const [exporting, setExporting] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [stickerOpen, setStickerOpen] = React.useState(false)

  // Bulk operations state
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = React.useState<string>('')
  const [bulkSite, setBulkSite] = React.useState<string>('')
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)
  const [bulkAction, setBulkAction] = React.useState(false)

  // Read pendingDeviceId / pendingWarrantyFilter from store on mount
  const pendingDeviceId = useAppStore((s) => s.pendingDeviceId)
  const clearPendingDeviceId = useAppStore((s) => s.clearPendingDeviceId)
  const pendingWarrantyFilter = useAppStore((s) => s.pendingWarrantyFilter)
  const clearPendingWarrantyFilter = useAppStore(
    (s) => s.clearPendingWarrantyFilter,
  )

  React.useEffect(() => {
    if (pendingDeviceId) {
      setDetailDeviceId(pendingDeviceId)
      clearPendingDeviceId()
    }
  }, [pendingDeviceId, clearPendingDeviceId])

  React.useEffect(() => {
    if (pendingWarrantyFilter) {
      setWarrantyFilter(pendingWarrantyFilter)
      clearPendingWarrantyFilter()
    }
  }, [pendingWarrantyFilter, clearPendingWarrantyFilter])

  // Settings query for org name (used in sticker header)
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings')
      if (!res.ok) return {}
      const json = await res.json()
      return (json.settings ?? {}) as Record<string, string>
    },
  })

  const { data: devicesRaw, isLoading } = useQuery<Device[]>({
    queryKey: ['devices', search, statusFilter, siteFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (siteFilter !== 'all') params.set('site', siteFilter)
      const res = await fetch(`/api/devices?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load devices')
      const json = await res.json()
      return json.devices as Device[]
    },
  })

  // Apply warranty filter client-side (computed from purchaseDate + warrantyMonths)
  const devices = React.useMemo<Device[] | undefined>(() => {
    if (!devicesRaw) return undefined
    let list = devicesRaw
    if (warrantyFilter !== 'all') {
      list = list.filter((d) => {
        const w = computeWarranty(d.purchaseDate, d.warrantyMonths ?? 12)
        return w.status === warrantyFilter
      })
    }
    if (assigneeFilter === 'assigned') {
      list = list.filter((d) => Boolean(d.currentAssignee))
    } else if (assigneeFilter === 'unassigned') {
      list = list.filter((d) => !d.currentAssignee)
    }
    return list
  }, [devicesRaw, warrantyFilter, assigneeFilter])

  const { data: sites } = useQuery<Site[]>({
    queryKey: ['sites'],
    queryFn: async () => {
      const res = await fetch('/api/sites')
      if (!res.ok) return []
      const json = await res.json()
      return json.sites as Site[]
    },
  })

  const { data: masterItems } = useQuery<{
    category: string
    code: string
    label: string
  }[]>({
    queryKey: ['master-all'],
    queryFn: async () => {
      const res = await fetch('/api/master')
      if (!res.ok) return []
      const json = await res.json()
      return (json.items ?? []) as {
        category: string
        code: string
        label: string
      }[]
    },
  })

  const brands = (masterItems ?? []).filter((m) => m.category === 'Brand')
  const types = (masterItems ?? []).filter((m) => m.category === 'Type')
  const departments = (masterItems ?? []).filter(
    (m) => m.category === 'Department',
  )

  function openAdd() {
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(d: Device) {
    setForm({
      id: d.id,
      assetCode: d.assetCode,
      name: d.name,
      brand: d.brand,
      model: d.model,
      type: d.type,
      serialNumber: d.serialNumber ?? '',
      status: d.status,
      site: d.site,
      department: d.department ?? '',
      departmentCode: d.departmentCode ?? '',
      parentRef: d.parentRef ?? '',
      displayLabel: d.displayLabel ?? '',
      location: d.location ?? '',
      purchaseDate: d.purchaseDate ?? '',
      warrantyMonths: String(d.warrantyMonths ?? 12),
      purchasePrice:
        d.purchasePrice !== null && d.purchasePrice !== undefined
          ? String(d.purchasePrice)
          : '',
      salvageValue:
        d.salvageValue !== null && d.salvageValue !== undefined
          ? String(d.salvageValue)
          : '0',
      usefulLife:
        d.usefulLife !== null && d.usefulLife !== undefined
          ? String(d.usefulLife)
          : '60',
    })
    setDialogOpen(true)
  }

  async function save() {
    if (!form.assetCode || !form.name || !form.brand || !form.model || !form.type) {
      toast.error('กรุณากรอกข้อมูลที่จำเป็น (รหัส, ชื่อ, แบรนด์, รุ่น, ประเภท)')
      return
    }
    try {
      setSaving(true)
      const payload = {
        ...form,
        serialNumber: form.serialNumber || null,
        department: form.department || null,
        departmentCode: form.departmentCode || null,
        parentRef: form.parentRef || null,
        displayLabel: form.displayLabel || null,
        location: form.location || null,
        purchaseDate: form.purchaseDate || null,
        warrantyMonths: Number(form.warrantyMonths) || 12,
        purchasePrice:
          form.purchasePrice === '' ? null : Number(form.purchasePrice),
        salvageValue:
          form.salvageValue === '' ? 0 : Number(form.salvageValue),
        usefulLife:
          form.usefulLife === '' ? null : Number(form.usefulLife),
      }
      const isEdit = Boolean(form.id)
      const url = isEdit ? `/api/devices/${form.id}` : '/api/devices'
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
      toast.success(isEdit ? 'แก้ไขอุปกรณ์แล้ว' : 'เพิ่มอุปกรณ์ใหม่แล้ว')
      setDialogOpen(false)
      await qc.invalidateQueries({ queryKey: ['devices'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      const res = await fetch(`/api/devices/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Delete failed')
      }
      toast.success('ลบอุปกรณ์แล้ว')
      setDeleteTarget(null)
      await qc.invalidateQueries({ queryKey: ['devices'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  async function exportCsv() {
    try {
      setExporting(true)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (siteFilter !== 'all') params.set('site', siteFilter)
      const res = await fetch(`/api/devices?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to export')
      const json = await res.json()
      const rows = (json.devices ?? []) as Device[]
      downloadCsv(`devices-${dateStamp()}.csv`, rows, DEVICE_CSV_HEADERS)
      toast.success(`ส่งออก ${rows.length} รายการแล้ว`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  // ---- Bulk operations ----
  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set((devices ?? []).map((d) => d.id)))
    } else {
      setSelectedIds(new Set())
    }
  }
  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }
  function clearSelection() {
    setSelectedIds(new Set())
    setBulkStatus('')
    setBulkSite('')
  }

  async function logBulkAction(
    action: 'BULK_UPDATE' | 'BULK_TRANSFER' | 'BULK_DELETE',
    summary: string,
    detail: Record<string, unknown>,
  ) {
    try {
      await fetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, entity: 'Device', summary, detail }),
      })
    } catch {
      // non-fatal
    }
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return
    setBulkAction(true)
    const ids = Array.from(selectedIds)
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/devices/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: bulkStatus }),
        }),
      ),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const fail = results.length - ok
    const label = statusLabel(bulkStatus)
    if (fail === 0) {
      toast.success(`อัปเดต ${ok} เครื่องเป็น "${label}" แล้ว`)
    } else {
      toast.warning(`อัปเดตสำเร็จ ${ok} เครื่อง, ล้มเหลว ${fail} เครื่อง`)
    }
    await logBulkAction('BULK_UPDATE', `เปลี่ยนสถานะอุปกรณ์ ${ok} เครื่องเป็น ${label}`, {
      status: bulkStatus,
      count: ok,
      failed: fail,
      deviceIds: ids,
    })
    setBulkStatus('')
    clearSelection()
    await qc.invalidateQueries({ queryKey: ['devices'] })
    await qc.invalidateQueries({ queryKey: ['dashboard'] })
    await qc.invalidateQueries({ queryKey: ['audit'] })
    setBulkAction(false)
  }

  async function applyBulkTransfer() {
    if (!bulkSite || selectedIds.size === 0) return
    setBulkAction(true)
    const ids = Array.from(selectedIds)
    const today = new Date().toISOString().slice(0, 10)
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/devices/${id}/transfer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toSite: bulkSite, transferDate: today }),
        }),
      ),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const fail = results.length - ok
    const siteName =
      (sites ?? []).find((s) => s.code === bulkSite)?.name ?? bulkSite
    if (fail === 0) {
      toast.success(`ย้าย ${ok} เครื่องไปสาขา ${siteName} แล้ว`)
    } else {
      toast.warning(`ย้ายสำเร็จ ${ok} เครื่อง, ล้มเหลว ${fail} เครื่อง`)
    }
    await logBulkAction('BULK_TRANSFER', `ย้ายอุปกรณ์ ${ok} เครื่องไปสาขา ${siteName}`, {
      toSite: bulkSite,
      count: ok,
      failed: fail,
      deviceIds: ids,
    })
    setBulkSite('')
    clearSelection()
    await qc.invalidateQueries({ queryKey: ['devices'] })
    await qc.invalidateQueries({ queryKey: ['dashboard'] })
    await qc.invalidateQueries({ queryKey: ['audit'] })
    setBulkAction(false)
  }

  async function applyBulkDelete() {
    if (selectedIds.size === 0) return
    setBulkAction(true)
    const ids = Array.from(selectedIds)
    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/devices/${id}`, { method: 'DELETE' })),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    const fail = results.length - ok
    if (fail === 0) {
      toast.success(`ลบ ${ok} เครื่องแล้ว`)
    } else {
      toast.warning(`ลบสำเร็จ ${ok} เครื่อง, ล้มเหลว ${fail} เครื่อง`)
    }
    await logBulkAction('BULK_DELETE', `ลบอุปกรณ์ ${ok} เครื่อง`, {
      count: ok,
      failed: fail,
      deviceIds: ids,
    })
    setBulkDeleteOpen(false)
    clearSelection()
    await qc.invalidateQueries({ queryKey: ['devices'] })
    await qc.invalidateQueries({ queryKey: ['dashboard'] })
    await qc.invalidateQueries({ queryKey: ['audit'] })
    setBulkAction(false)
  }

  const hasDevices = (devices ?? []).length > 0
  const allSelected =
    hasDevices && selectedIds.size === (devices ?? []).length
  const someSelected = selectedIds.size > 0 && !allSelected

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">จัดการอุปกรณ์</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            เพิ่ม / แก้ไข / ลบ อุปกรณ์ IT ในระบบ
          </p>
        </div>
      </div>

      <Card className="dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="ค้นหา Serial / รหัส / ตึก / ชั้น / หน่วยงาน / แบรนด์..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  onKeyDown={(e) => {
                    // Enter key triggers search (already debounced but this gives immediate feedback)
                    if (e.key === 'Enter') setSearch((e.target as HTMLInputElement).value)
                  }}
                />
                {/* Quick scan button — opens QR/barcode scanner */}
                <button
                  type="button"
                  onClick={() => useAppStore.getState().setQrScannerOpen(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#f97316] dark:hover:bg-slate-800"
                  title="สแกน QR / บาร์โค้ด"
                  aria-label="สแกน QR / บาร์โค้ด"
                >
                  <ScanLine className="h-4 w-4" />
                </button>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="สถานะ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">สถานะทั้งหมด</SelectItem>
                  {DEVICE_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={siteFilter} onValueChange={setSiteFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="สาขา" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">สาขาทั้งหมด</SelectItem>
                  {(sites ?? []).map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={warrantyFilter} onValueChange={setWarrantyFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="รับประกัน" />
                </SelectTrigger>
                <SelectContent>
                  {WARRANTY_FILTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="ผู้ใช้งาน" />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNEE_FILTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={openAdd}
                className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <Plus className="h-4 w-4" />
                เพิ่มอุปกรณ์
              </Button>
              <Button
                variant="outline"
                onClick={() => setImportOpen(true)}
                className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <Upload className="h-4 w-4" />
                นำเข้า CSV
              </Button>
              <Button
                variant="outline"
                onClick={exportCsv}
                disabled={exporting}
                className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <Download className="h-4 w-4" />
                {exporting ? 'กำลังส่งออก...' : 'ส่งออก CSV'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setStickerOpen(true)}
                disabled={(devices ?? []).length === 0}
                className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <Tag className="h-4 w-4" />
                พิมพ์สติกเกอร์
              </Button>
              <Button
                variant="outline"
                onClick={() => qc.invalidateQueries({ queryKey: ['devices'] })}
                className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <RefreshCw className="h-4 w-4" />
                รีเฟรช
              </Button>
            </div>
          </div>

          {/* Bulk action bar — slides in when any rows are selected */}
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="sticky top-0 z-20 -mt-2 mb-2 flex flex-col gap-3 rounded-lg border-l-4 border-[#f97316] border-y border-r border-slate-200 bg-white/90 p-3 shadow-md backdrop-blur-md dark:border-[#fb923c] dark:border-y-slate-800 dark:border-r-slate-800 dark:bg-slate-900/90 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 items-center rounded-md bg-[#f97316]/10 px-2.5 text-sm font-semibold text-[#f97316] dark:bg-[#fb923c]/10 dark:text-[#fb923c]">
                    เลือกแล้ว {selectedIds.size} เครื่อง
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearSelection}
                    className="h-7 px-2 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <X className="h-3.5 w-3.5" />
                    ยกเลิกการเลือก
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Bulk status */}
                  <Select
                    value={bulkStatus}
                    onValueChange={(v) => {
                      setBulkStatus(v)
                    }}
                  >
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue placeholder="เปลี่ยนสถานะ" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEVICE_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!bulkStatus || bulkAction}
                    onClick={applyBulkStatus}
                    className="h-8 focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
                  >
                    ใช้
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>

                  {/* Bulk site move */}
                  <Select
                    value={bulkSite}
                    onValueChange={(v) => {
                      setBulkSite(v)
                    }}
                  >
                    <SelectTrigger className="h-8 w-[140px]">
                      <SelectValue placeholder="ย้ายสาขา" />
                    </SelectTrigger>
                    <SelectContent>
                      {(sites ?? []).map((s) => (
                        <SelectItem key={s.code} value={s.code}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!bulkSite || bulkAction}
                    onClick={applyBulkTransfer}
                    className="h-8 focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
                  >
                    ย้าย
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>

                  {/* Bulk delete */}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkAction}
                    onClick={() => setBulkDeleteOpen(true)}
                    className="h-8 border-rose-300 text-rose-600 hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-1 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:focus-visible:ring-offset-slate-950"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    ลบ
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Table */}
          <div className="itam-scroll mt-4 max-h-[60vh] overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/80">
                <TableRow>
                  {hasDevices && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                        onCheckedChange={(v) => toggleSelectAll(v === true)}
                        aria-label="เลือกทั้งหมด"
                        className="border-slate-300 data-[state=checked]:bg-[#f97316] data-[state=checked]:border-[#f97316] data-[state=checked]:text-white dark:border-slate-600 dark:data-[state=checked]:bg-[#f97316] dark:data-[state=checked]:border-[#f97316]"
                      />
                    </TableHead>
                  )}
                  <TableHead className="text-slate-600 dark:text-slate-300">รหัส</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">Serial No.</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">ชื่อ</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">แบรนด์</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">รุ่น</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">ประเภท</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">สถานะ</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">รับประกัน</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">สาขา</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">ผู้ใช้งาน</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">แผนก</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">รหัสแผนก</TableHead>
                  <TableHead className="text-right text-slate-600 dark:text-slate-300">การจัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={14}>
                        <Skeleton className="h-6 w-full dark:bg-slate-800" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (devices ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="py-12">
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                          <PackageOpen className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                        </div>
                        <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                          {search || statusFilter !== 'all' || siteFilter !== 'all' || warrantyFilter !== 'all' || assigneeFilter !== 'all'
                            ? 'ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข'
                            : 'ยังไม่มีอุปกรณ์ในระบบ'}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {search || statusFilter !== 'all' || siteFilter !== 'all' || warrantyFilter !== 'all' || assigneeFilter !== 'all'
                            ? 'ลองปรับตัวกรองหรือคำค้นหา หรือล้างตัวกรองเพื่อดูทั้งหมด'
                            : 'เริ่มต้นโดยการเพิ่มอุปกรณ์เครื่องแรกของคุณ'}
                        </div>
                        {(search || statusFilter !== 'all' || siteFilter !== 'all' || warrantyFilter !== 'all' || assigneeFilter !== 'all') ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSearch('')
                              setStatusFilter('all')
                              setSiteFilter('all')
                              setWarrantyFilter('all')
                              setAssigneeFilter('all')
                            }}
                            className="mt-2 focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
                          >
                            ล้างตัวกรอง
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={openAdd}
                            className="mt-2 bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
                          >
                            <Plus className="h-4 w-4" />
                            เพิ่มอุปกรณ์
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  (devices ?? []).map((d) => {
                    const w = computeWarranty(d.purchaseDate, d.warrantyMonths ?? 12)
                    const isSelected = selectedIds.has(d.id)
                    return (
                    <TableRow
                      key={d.id}
                      className={
                        'cursor-pointer transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/50' +
                        (isSelected
                          ? ' bg-orange-50 dark:bg-orange-950/30'
                          : '')
                      }
                      onClick={() => setDetailDeviceId(d.id)}
                    >
                      <TableCell
                        className="w-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(v) => toggleSelect(d.id, v === true)}
                          aria-label={`เลือก ${d.assetCode}`}
                          className="border-slate-300 data-[state=checked]:bg-[#f97316] data-[state=checked]:border-[#f97316] data-[state=checked]:text-white dark:border-slate-600 dark:data-[state=checked]:bg-[#f97316] dark:data-[state=checked]:border-[#f97316]"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium text-slate-700 dark:text-slate-200">
                        {d.assetCode}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {d.serialNumber || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-slate-700 dark:text-slate-200">
                        {d.name}
                      </TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-200">{d.brand}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-slate-700 dark:text-slate-200">
                        {d.model}
                      </TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-200">{d.type}</TableCell>
                      <TableCell>
                        <Badge className={statusBadgeClass(d.status)}>
                          {statusLabel(d.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={warrantyBadgeClass(w.status)} title={w.expiry ?? undefined}>
                          {warrantyLabel(w.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-200">{d.site}</TableCell>
                      <TableCell
                        className="max-w-[180px] truncate"
                        onClick={(e) => {
                          // clicking the assignee opens the detail sheet — but allow
                          // row click to also fire.
                          if (d.currentAssignee) {
                            e.stopPropagation()
                            setDetailDeviceId(d.id)
                          }
                        }}
                      >
                        {d.currentAssignee ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={
                                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                                avatarColor(d.currentAssignee)
                              }
                              title={d.currentAssignee}
                            >
                              {(d.currentAssignee.charAt(0) || '?').toUpperCase()}
                            </span>
                            <span className="truncate text-sm text-slate-700 dark:text-slate-200" title={d.currentAssignee}>
                              {d.currentAssignee}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                            <UserMinus className="h-3.5 w-3.5" />
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-slate-600 dark:text-slate-300">
                        {d.department ?? '-'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {d.departmentCode ?? '-'}
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDetailDeviceId(d.id)}
                            aria-label="ดูรายละเอียด"
                            title="ดูรายละเอียด"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(d)}
                            aria-label="แก้ไข"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteTarget(d)}
                            aria-label="ลบ"
                            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                          >
                            <Trash2 className="h-4 w-4" />
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

          <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            ทั้งหมด {(devices ?? []).length} รายการ
            {selectedIds.size > 0 && (
              <span className="ml-2 text-[#f97316] dark:text-[#fb923c]">
                · เลือก {selectedIds.size} เครื่อง
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bulk delete confirm */}
      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(o) => !o && setBulkDeleteOpen(false)}
      >
        <AlertDialogContent className="dark:border-slate-800 dark:bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-800 dark:text-slate-100">
              ยืนยันการลบอุปกรณ์หลายเครื่อง
            </AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบอุปกรณ์{' '}
              <span className="font-semibold text-rose-700 dark:text-rose-400">
                {selectedIds.size} เครื่อง
              </span>{' '}
              ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้ และจะลบประวัติการจดมิเตอร์ของอุปกรณ์เหล่านี้ด้วย
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkAction}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={applyBulkDelete}
              disabled={bulkAction}
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {bulkAction ? 'กำลังลบ...' : `ลบ ${selectedIds.size} เครื่อง`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-slate-800 dark:text-slate-100">
              {form.id ? '✏️ แก้ไขอุปกรณ์' : '➕ เพิ่มอุปกรณ์ใหม่'}
            </DialogTitle>
            <DialogDescription>
              กรอกข้อมูลอุปกรณ์ให้ครบถ้วน ฟิลด์ที่มีเครื่องหมาย * เป็นข้อมูลที่จำเป็น
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="รหัสอุปกรณ์ *">
              <Input
                value={form.assetCode}
                onChange={(e) =>
                  setForm({ ...form, assetCode: e.target.value })
                }
                placeholder="IT-PRT-001"
              />
            </Field>
            <Field label="ชื่ออุปกรณ์ *">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="แบรนด์ *">
              <SelectValueInput
                value={form.brand}
                onChange={(v) => setForm({ ...form, brand: v })}
                options={brands.map((b) => ({ value: b.code, label: b.label }))}
                placeholder="เลือกหรือพิมพ์แบรนด์"
              />
            </Field>
            <Field label="รุ่น *">
              <Input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </Field>
            <Field label="ประเภท *">
              <SelectValueInput
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v })}
                options={types.map((t) => ({ value: t.code, label: t.label }))}
                placeholder="เลือกหรือพิมพ์ประเภท"
              />
            </Field>
            <Field label="Serial Number">
              <Input
                value={form.serialNumber}
                onChange={(e) =>
                  setForm({ ...form, serialNumber: e.target.value })
                }
              />
            </Field>
            <Field label="สถานะ *">
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="สาขา *">
              <Select
                value={form.site}
                onValueChange={(v) => setForm({ ...form, site: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(sites ?? []).map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="แผนก">
              <SelectValueInput
                value={form.department}
                onChange={(v) => setForm({ ...form, department: v })}
                options={departments.map((d) => ({
                  value: d.label,
                  label: d.label,
                }))}
                placeholder="เลือกหรือพิมพ์แผนก"
              />
            </Field>
            <Field label="รหัสแผนก (DepartmentCode)">
              <Input
                value={form.departmentCode}
                onChange={(e) =>
                  setForm({ ...form, departmentCode: e.target.value })
                }
              />
            </Field>
            <Field label="ParentRef">
              <Input
                value={form.parentRef}
                onChange={(e) =>
                  setForm({ ...form, parentRef: e.target.value })
                }
                placeholder="เช่น HP|PRINTER"
              />
            </Field>
            <Field label="DisplayLabel">
              <Input
                value={form.displayLabel}
                onChange={(e) =>
                  setForm({ ...form, displayLabel: e.target.value })
                }
              />
            </Field>
            <Field label="สถานที่ตั้ง">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field label="วันที่ซื้อ">
              <Input
                type="date"
                value={form.purchaseDate}
                onChange={(e) =>
                  setForm({ ...form, purchaseDate: e.target.value })
                }
              />
            </Field>
            <Field label="รับประกัน (เดือน)">
              <Input
                type="number"
                min={1}
                max={120}
                step={1}
                value={form.warrantyMonths}
                onChange={(e) =>
                  setForm({ ...form, warrantyMonths: e.target.value })
                }
              />
            </Field>
          </div>

          {/* Financial section — depreciation tracking */}
          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#f97316] dark:text-[#fb923c]">
              💰 การเงิน (สำหรับคำนวณค่าเสื่อมราคา)
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="ราคาซื้อ (฿)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.purchasePrice}
                  onChange={(e) =>
                    setForm({ ...form, purchasePrice: e.target.value })
                  }
                  placeholder="0.00"
                />
              </Field>
              <Field label="มูลค่าซาลเวจ (฿)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.salvageValue}
                  onChange={(e) =>
                    setForm({ ...form, salvageValue: e.target.value })
                  }
                  placeholder="0.00"
                />
              </Field>
              <Field label="อายุการใช้งาน (เดือน)">
                <Input
                  type="number"
                  min={1}
                  max={240}
                  step={1}
                  value={form.usefulLife}
                  onChange={(e) =>
                    setForm({ ...form, usefulLife: e.target.value })
                  }
                  placeholder="60"
                />
              </Field>
            </div>
            <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              ค่าเสื่อมราคาคำนวณแบบเส้นตรง: (ราคาซื้อ − มูลค่าซาลเวจ) ÷ อายุการใช้งาน
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบอุปกรณ์</AlertDialogTitle>
            <AlertDialogDescription>
              คุณกำลังจะลบ{' '}
              <span className="font-semibold text-slate-700">
                {deleteTarget?.name} ({deleteTarget?.assetCode})
              </span>
              {' '}การกระทำนี้ไม่สามารถย้อนกลับได้ และจะลบประวัติการจดมิเตอร์ของอุปกรณ์นี้ด้วย
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {deleting ? 'กำลังลบ...' : 'ลบอุปกรณ์'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail sheet */}
      <DeviceDetailSheet
        deviceId={detailDeviceId}
        onClose={() => setDetailDeviceId(null)}
        onEdit={(d) => {
          setDetailDeviceId(null)
          openEdit(d)
        }}
      />

      {/* CSV Import */}
      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Sticker print */}
      <StickerPrintDialog
        open={stickerOpen}
        onOpenChange={setStickerOpen}
        devices={devices ?? []}
        orgName={settings?.orgName ?? null}
      />
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
    </div>
  )
}

// A combobox-like input: lets the user either type or pick from a dropdown list
function SelectValueInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}) {
  const [open, setOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
      />
      {open && options.length > 0 && (
        <div className="itam-scroll absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-100"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(o.value)
                setOpen(false)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// (no extra exports)
