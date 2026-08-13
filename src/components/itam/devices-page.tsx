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
  Download,
  Upload,
  Tag,
  PackageOpen,
  X,
  ArrowRight,
  History,
  QrCode,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ScanLine,
} from 'lucide-react'
import {
  type Device,
  type Site,
  DEVICE_STATUS_OPTIONS,
  statusBadgeClass,
  statusLabel,
  computeWarranty,
  formatMonthThai,
  formatDateTime,
} from './types'
import { DeviceDetailSheet } from './device-detail-sheet'
import { CsvImportDialog } from './csv-import-dialog'
import { StickerPrintDialog } from './sticker-print-dialog'
import { Combobox } from './combobox'
import { downloadCsv, dateStamp } from '@/lib/csv'
import { useAppStore } from '@/store/app-store'
import { useAuthStore } from '@/store/auth-store'

/** Build fetch headers with the user's JWT (if logged in). */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra }
  const t = useAuthStore.getState()?.token
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

/** Authenticated fetch wrapper — forwards the Bearer token to the API. */
async function authFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

/**
 * Auto-format a MAC address as the user types: strips everything but
 * hex chars, uppercases, and inserts ":" every 2 chars (max 6 groups).
 *   "aabbccddeeff"   → "AA:BB:CC:DD:EE:FF"
 *   "aa:bb:cc-dd-ee" → "AA:BB:CC:DD:EE"
 */
function formatMacInput(raw: string): string {
  const hex = raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase().slice(0, 12)
  if (!hex) return ''
  return (hex.match(/.{1,2}/g) ?? []).join(':')
}

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
  assetSiteCode: string
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
  // ── ข้อมูลที่ตั้ง ──
  building: string
  floor: string
  room: string
  // ── เครือข่าย ──
  ip: string
  mac: string
  remoteId: string
  // ── การซื้อ/รับประกัน ──
  purchaseDate: string
  warrantyMonths: string
  purchasePrice: string
  salvageValue: string
  usefulLife: string
  warrantyEnd: string
  vendor: string
  contractNo: string
  uninstallDate: string
  // ── มิเตอร์ ──
  meterRequired: boolean
  meterMode: string
  // ── อื่นๆ ──
  costCenter: string
  deviceGroup: string
  remark: string
}

const EMPTY_FORM: FormState = {
  assetCode: '',
  assetSiteCode: '',
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
  building: '',
  floor: '',
  room: '',
  ip: '',
  mac: '',
  remoteId: '',
  purchaseDate: '',
  warrantyMonths: '12',
  purchasePrice: '',
  salvageValue: '0',
  usefulLife: '60',
  warrantyEnd: '',
  vendor: '',
  contractNo: '',
  uninstallDate: '',
  meterRequired: false,
  meterMode: 'TOTAL',
  costCenter: '',
  deviceGroup: '',
  remark: '',
}

const METER_MODE_OPTIONS = [
  { value: 'TOTAL', label: 'TOTAL (รวม)' },
  { value: 'BW_COLOR', label: 'BW_COLOR (ขาวดำ / สี)' },
] as const

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

  // Pagination state (client-side slicing of the filtered `devices` array)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(50)
  const [pageInput, setPageInput] = React.useState('1')

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

  // ── Pagination: client-side slicing of the filtered `devices` array ──
  // When search/filter changes, reset to page 1.
  const totalCount = devices?.length ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIdx = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endIdx = Math.min(currentPage * pageSize, totalCount)
  const pagedDevices = React.useMemo<Device[]>(() => {
    if (!devices) return []
    const start = (currentPage - 1) * pageSize
    return devices.slice(start, start + pageSize)
  }, [devices, currentPage, pageSize])

  // Reset to page 1 whenever the underlying filter inputs change
  React.useEffect(() => {
    setPage(1)
    setPageInput('1')
  }, [search, statusFilter, siteFilter, warrantyFilter, assigneeFilter, pageSize])

  // Keep pageInput in sync when currentPage changes externally
  React.useEffect(() => {
    setPageInput(String(currentPage))
  }, [currentPage])

  const { data: sites } = useQuery<Site[]>({
    queryKey: ['sites'],
    queryFn: async () => {
      const res = await fetch('/api/sites')
      if (!res.ok) return []
      const json = await res.json()
      return json.sites as Site[]
    },
  })

  // ── Filter the site dropdown by the current user's allowedSites ──
  // (Non-admin users should only see their own sites in the form.)
  const authUser = useAuthStore((s) => s.user)
  const userAllowedSites = authUser?.allowedSites ?? 'ALL'
  const userSitesArr = React.useMemo<string[] | null>(() => {
    if (!userAllowedSites || userAllowedSites.toUpperCase() === 'ALL') return null
    return userAllowedSites
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }, [userAllowedSites])
  const visibleSites = React.useMemo<Site[]>(() => {
    if (!sites) return []
    if (!userSitesArr) return sites
    return sites.filter((s) => userSitesArr.includes(s.code))
  }, [sites, userSitesArr])

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
  const deviceGroups = (masterItems ?? []).filter(
    (m) => m.category === 'DeviceGroup',
  )
  // Models filtered by the currently selected brand (cascading).
  const models = (masterItems ?? []).filter((m) => {
    if (m.category !== 'Model') return false
    if (!form.brand) return true // no brand selected → show all models
    // MasterItem.parentRef is "Brand|Type" for Model rows; we match by Brand.
    return !m.parentRef || m.parentRef === form.brand || m.parentRef.includes(`|${form.brand}|`)
  })

  // ── Cascading dropdowns: site → building → floor → location ──
  // Pulls distinct values from existing devices via /api/itam/devices/cascading
  // (which requires VIEW_DEVICES permission). Falls back to an empty list if
  // the call fails so the user can still type a free-form value.
  const { data: buildingOptions } = useQuery<string[]>({
    queryKey: ['cascading', 'building', form.site],
    queryFn: async () => {
      try {
        const j = await authFetch<{ values: string[] }>(
          `/api/itam/devices/cascading?field=building${form.site ? `&site=${encodeURIComponent(form.site)}` : ''}`,
        )
        return j.values ?? []
      } catch {
        return []
      }
    },
    enabled: dialogOpen && Boolean(form.site),
  })
  const { data: floorOptions } = useQuery<string[]>({
    queryKey: ['cascading', 'floor', form.site, form.building],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({ field: 'floor' })
        if (form.site) params.set('site', form.site)
        if (form.building) params.set('building', form.building)
        const j = await authFetch<{ values: string[] }>(
          `/api/itam/devices/cascading?${params.toString()}`,
        )
        return j.values ?? []
      } catch {
        return []
      }
    },
    enabled: dialogOpen && Boolean(form.building),
  })
  const { data: locationOptions } = useQuery<string[]>({
    queryKey: ['cascading', 'location', form.site, form.building, form.floor],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({ field: 'location' })
        if (form.site) params.set('site', form.site)
        if (form.building) params.set('building', form.building)
        if (form.floor) params.set('floor', form.floor)
        const j = await authFetch<{ values: string[] }>(
          `/api/itam/devices/cascading?${params.toString()}`,
        )
        return j.values ?? []
      } catch {
        return []
      }
    },
    enabled: dialogOpen && Boolean(form.building) && Boolean(form.floor),
  })

  function openAdd() {
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(d: Device) {
    setForm({
      id: d.id,
      assetCode: d.assetCode,
      assetSiteCode: d.assetSiteCode ?? '',
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
      building: d.building ?? '',
      floor: d.floor ?? '',
      room: d.room ?? '',
      ip: d.ip ?? '',
      mac: d.mac ?? '',
      remoteId: d.remoteId ?? '',
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
      warrantyEnd: d.warrantyEnd ?? '',
      vendor: d.vendor ?? '',
      contractNo: d.contractNo ?? '',
      uninstallDate: d.uninstallDate ?? '',
      meterRequired: Boolean(d.meterRequired),
      meterMode: d.meterMode ?? 'TOTAL',
      costCenter: d.costCenter ?? '',
      deviceGroup: d.deviceGroup ?? '',
      remark: d.remark ?? '',
    })
    setDialogOpen(true)
  }

  // ── Auto-generate assetSiteCode when the user picks a site ──
  // Calls /api/devices/next-site-code?site=<code> and fills the field.
  // Only auto-fills on CREATE (when the field is empty) — on edit, the
  // user has to click the "✨ สร้างรหัส" button explicitly to avoid
  // overwriting an existing code.
  const generatingCodeRef = React.useRef(false)
  const fetchNextSiteCode = React.useCallback(async (siteCode: string) => {
    if (!siteCode || generatingCodeRef.current) return
    generatingCodeRef.current = true
    try {
      const res = await fetch(
        `/api/devices/next-site-code?site=${encodeURIComponent(siteCode)}`,
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        if (j.error) toast.warning(j.error)
        return
      }
      const j = (await res.json()) as { code?: string | null }
      if (j.code) {
        setForm((prev) => ({ ...prev, assetSiteCode: j.code ?? '' }))
      }
    } catch {
      /* non-fatal */
    } finally {
      generatingCodeRef.current = false
    }
  }, [])

  async function generateSiteCodeNow() {
    if (!form.site) {
      toast.warning('กรุณาเลือกสาขาก่อน')
      return
    }
    await fetchNextSiteCode(form.site)
    toast.success('สร้างรหัสประจำ Site เรียบร้อย')
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
        assetSiteCode: form.assetSiteCode || null,
        serialNumber: form.serialNumber || null,
        department: form.department || null,
        departmentCode: form.departmentCode || null,
        parentRef: form.parentRef || null,
        displayLabel: form.displayLabel || null,
        location: form.location || null,
        building: form.building || null,
        floor: form.floor || null,
        room: form.room || null,
        ip: form.ip || null,
        mac: form.mac || null,
        remoteId: form.remoteId || null,
        purchaseDate: form.purchaseDate || null,
        warrantyMonths: Number(form.warrantyMonths) || 12,
        purchasePrice:
          form.purchasePrice === '' ? null : Number(form.purchasePrice),
        salvageValue:
          form.salvageValue === '' ? 0 : Number(form.salvageValue),
        usefulLife:
          form.usefulLife === '' ? null : Number(form.usefulLife),
        warrantyEnd: form.warrantyEnd || null,
        vendor: form.vendor || null,
        contractNo: form.contractNo || null,
        uninstallDate: form.uninstallDate || null,
        meterRequired: Boolean(form.meterRequired),
        meterMode: form.meterMode || null,
        costCenter: form.costCenter || null,
        deviceGroup: form.deviceGroup || null,
        remark: form.remark || null,
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
  // toggleSelectAll now operates on the current page only (matches what the
  // user sees in the table header checkbox).
  function toggleSelectAll(checked: boolean) {
    if (checked) {
      const next = new Set(selectedIds)
      for (const d of pagedDevices) next.add(d.id)
      setSelectedIds(next)
    } else {
      const next = new Set(selectedIds)
      for (const d of pagedDevices) next.delete(d.id)
      setSelectedIds(next)
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
  // "all selected" reflects the CURRENT PAGE (since the header checkbox only
  // affects visible rows).
  const pageIds = pagedDevices.map((d) => d.id)
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
  const someSelected = pageIds.some((id) => selectedIds.has(id)) && !allSelected

  return (
    <div className="flex h-full flex-col p-3 md:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">จัดการอุปกรณ์</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            เพิ่ม / แก้ไข / ลบ อุปกรณ์ IT ในระบบ
          </p>
        </div>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="flex min-h-0 flex-1 flex-col p-4">
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
                  {(visibleSites ?? []).map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.code} — {s.name}
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
                      {(visibleSites ?? []).map((s) => (
                        <SelectItem key={s.code} value={s.code}>
                          {s.code} — {s.name}
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
          {/* Table — fills remaining height of the Card (Issue 3: heights fill available space) */}
          <div className="itam-scroll mt-4 min-h-0 flex-1 overflow-auto rounded-md border border-slate-300 bg-white dark:border-slate-800 dark:bg-slate-900">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm dark:bg-slate-900/95">
                <TableRow>
                  {hasDevices && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                        onCheckedChange={(v) => toggleSelectAll(v === true)}
                        aria-label="เลือกหน้านี้ทั้งหมด"
                        className="border-slate-300 data-[state=checked]:bg-[#f97316] data-[state=checked]:border-[#f97316] data-[state=checked]:text-white dark:border-slate-600 dark:data-[state=checked]:bg-[#f97316] dark:data-[state=checked]:border-[#f97316]"
                      />
                    </TableHead>
                  )}
                  <TableHead className="text-slate-600 dark:text-slate-300">รหัสทรัพย์สิน</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">ทะเบียน Site</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">ประเภท</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">ยี่ห้อ/รุ่น</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">Serial No.</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">อาคาร/ชั้น</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">แผนก/ตำแหน่ง</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">สถานะ</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">มิเตอร์ล่าสุด</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">อัปเดตล่าสุด</TableHead>
                  <TableHead className="text-right text-slate-600 dark:text-slate-300">การกระทำ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={12}>
                        <Skeleton className="h-6 w-full dark:bg-slate-800" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (devices ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="py-12">
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
                  pagedDevices.map((d) => {
                    const isSelected = selectedIds.has(d.id)
                    const lastMeterBw = (d as { lastMeterBw?: number }).lastMeterBw ?? 0
                    const lastMeterColor = (d as { lastMeterColor?: number }).lastMeterColor ?? 0
                    const lastReadingMonth = d.lastReadingMonth
                    const hasMeter = Boolean(lastReadingMonth) || lastMeterBw > 0
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
                      {/* รหัสทรัพย์สิน */}
                      <TableCell className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {d.assetCode}
                      </TableCell>
                      {/* ทะเบียน Site */}
                      <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {d.assetSiteCode || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </TableCell>
                      {/* ประเภท */}
                      <TableCell className="text-slate-700 dark:text-slate-200">{d.type}</TableCell>
                      {/* ยี่ห้อ/รุ่น */}
                      <TableCell className="max-w-[180px]">
                        <div className="text-sm text-slate-700 dark:text-slate-200 truncate" title={`${d.brand} ${d.model}`}>
                          {d.brand || '-'}
                        </div>
                        {d.model && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={d.model}>
                            {d.model}
                          </div>
                        )}
                      </TableCell>
                      {/* Serial No. */}
                      <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {d.serialNumber || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </TableCell>
                      {/* อาคาร/ชั้น */}
                      <TableCell className="max-w-[140px]">
                        <div className="text-sm text-slate-700 dark:text-slate-200 truncate" title={d.building ?? ''}>
                          {d.building || '-'}
                        </div>
                        {d.floor && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            ชั้น {d.floor}
                          </div>
                        )}
                      </TableCell>
                      {/* แผนก/ตำแหน่ง */}
                      <TableCell className="max-w-[160px]">
                        <div className="text-sm text-slate-700 dark:text-slate-200 truncate" title={d.department ?? ''}>
                          {d.department || '-'}
                        </div>
                        {d.location && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={d.location}>
                            {d.location}
                          </div>
                        )}
                      </TableCell>
                      {/* สถานะ */}
                      <TableCell>
                        <Badge className={statusBadgeClass(d.status)}>
                          {statusLabel(d.status)}
                        </Badge>
                      </TableCell>
                      {/* มิเตอร์ล่าสุด */}
                      <TableCell className="min-w-[100px]">
                        {hasMeter ? (
                          <div>
                            <div className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                              {lastMeterBw.toLocaleString()}
                            </div>
                            {lastMeterColor > 0 && (
                              <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                                สี: {lastMeterColor.toLocaleString()}
                              </div>
                            )}
                            <div className="text-[10px] text-slate-400 dark:text-slate-500">
                              {lastReadingMonth ? formatMonthThai(lastReadingMonth) : '-'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            ไม่มีข้อมูล
                          </span>
                        )}
                      </TableCell>
                      {/* อัปเดตล่าสุด */}
                      <TableCell className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDateTime(d.updatedAt)}
                      </TableCell>
                      {/* การกระทำ */}
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDetailDeviceId(d.id)}
                            aria-label="ดูประวัติตำแหน่งและมิเตอร์"
                            title="ดูประวัติตำแหน่งและมิเตอร์"
                            className="h-7 gap-1 px-2 text-[11px] dark:bg-slate-800 dark:border-slate-700"
                          >
                            <History className="h-3.5 w-3.5" />
                            ประวัติ
                          </Button>
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => openEdit(d)}
                            aria-label="แก้ไขข้อมูลอุปกรณ์"
                            title="แก้ไขข้อมูลอุปกรณ์"
                            className="h-7 gap-1 bg-[#f97316] px-2 text-[11px] text-white hover:bg-[#ea580c]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            แก้ไข
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setStickerOpen(true)}
                            aria-label="พิมพ์สติกเกอร์"
                            title="พิมพ์สติกเกอร์"
                            className="h-7 gap-1 px-2 text-[11px] dark:bg-slate-800 dark:border-slate-700"
                          >
                            <QrCode className="h-3.5 w-3.5" />
                            สติกเกอร์
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

          {/* Pagination footer — shows range, total, per-page selector, prev/next, page input */}
          <div className="mt-3 flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span>
                แสดง <span className="font-semibold text-slate-700 dark:text-slate-200">{startIdx}-{endIdx}</span>
                {' '}จาก{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">{totalCount.toLocaleString()}</span>
                {' '}รายการ
              </span>
              {selectedIds.size > 0 && (
                <span className="text-[#f97316] dark:text-[#fb923c]">
                  · เลือก {selectedIds.size} เครื่อง
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Per-page selector */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span>หน้าละ</span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger className="h-8 w-[68px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  aria-label="หน้าก่อนหน้า"
                  className="h-8 gap-1 px-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  ก่อนหน้า
                </Button>

                {/* Page input — type a page number to jump */}
                <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <span className="hidden sm:inline">หน้า</span>
                  <Input
                    value={pageInput}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '')
                      setPageInput(v)
                    }}
                    onBlur={() => {
                      const n = parseInt(pageInput, 10)
                      if (!isNaN(n) && n >= 1 && n <= totalPages) {
                        setPage(n)
                      } else {
                        setPageInput(String(currentPage))
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const n = parseInt(pageInput, 10)
                        if (!isNaN(n) && n >= 1 && n <= totalPages) {
                          setPage(n)
                        } else {
                          setPageInput(String(currentPage))
                        }
                      }
                    }}
                    className="h-8 w-14 text-center text-xs dark:bg-slate-800 dark:border-slate-700"
                    aria-label="เลขหน้า"
                    inputMode="numeric"
                  />
                  <span>/ {totalPages.toLocaleString()}</span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                  aria-label="หน้าถัดไป"
                  className="h-8 gap-1 px-2 text-xs dark:bg-slate-800 dark:border-slate-700"
                >
                  ถัดไป
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk delete confirm */}
      <AlertDialog
        open={bulkDeleteOpen}
        onOpenChange={(o) => !o && setBulkDeleteOpen(false)}
      >
        <AlertDialogContent className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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

          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
            <Field label="รหัสอุปกรณ์ *">
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  id="dev-assetCode"
                  value={form.assetCode}
                  onChange={(e) =>
                    setForm({ ...form, assetCode: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      document.getElementById('dev-name')?.focus()
                    }
                  }}
                  placeholder="IT-PRT-001"
                  autoFocus
                  className="pl-8"
                />
              </div>
            </Field>
            <Field label="ชื่ออุปกรณ์ *">
              <Input
                id="dev-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    document.getElementById('dev-serialNumber')?.focus()
                  }
                }}
              />
            </Field>
            <Field label="Serial Number">
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  id="dev-serialNumber"
                  value={form.serialNumber}
                  onChange={(e) =>
                    setForm({ ...form, serialNumber: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      document.getElementById('dev-mac')?.focus()
                    }
                  }}
                  placeholder="สแกนหรือพิมพ์ SN"
                  className="pl-8 font-mono text-xs"
                />
              </div>
            </Field>
            <Field label="MAC Address">
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  id="dev-mac"
                  value={form.mac}
                  onChange={(e) =>
                    setForm({ ...form, mac: formatMacInput(e.target.value) })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      document.getElementById('dev-ip')?.focus()
                    }
                  }}
                  placeholder="AA:BB:CC:DD:EE:FF"
                  className="pl-8 font-mono text-xs"
                  inputMode="text"
                />
              </div>
            </Field>
            <Field label="IP Address">
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  id="dev-ip"
                  value={form.ip}
                  onChange={(e) => setForm({ ...form, ip: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      document.getElementById('dev-assetSiteCode')?.focus()
                    }
                  }}
                  placeholder="192.168.1.10"
                  className="pl-8 font-mono text-xs"
                  inputMode="decimal"
                />
              </div>
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
                onValueChange={(v) => {
                  setForm((prev) => ({ ...prev, site: v, building: '', floor: '', room: '' }))
                  // Auto-generate assetSiteCode on CREATE (when the field is
                  // empty). On edit, the user has to click the "✨ สร้างรหัส"
                  // button explicitly to avoid overwriting an existing code.
                  if (!form.id && !form.assetSiteCode) {
                    void fetchNextSiteCode(v)
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(visibleSites ?? []).map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.code} — {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="แบรนด์ *">
              <Combobox
                value={form.brand}
                onChange={(v) => setForm({ ...form, brand: v, model: '' })}
                items={brands.map((b) => ({ value: b.code, label: b.label }))}
                placeholder="เลือกหรือพิมพ์แบรนด์"
                emptyText="ไม่พบแบรนด์"
              />
            </Field>
            <Field label="รุ่น *">
              <Combobox
                value={form.model}
                onChange={(v) => setForm({ ...form, model: v })}
                items={models.map((m) => ({ value: m.code, label: m.label }))}
                placeholder={form.brand ? 'เลือกรุ่นของแบรนด์ที่เลือก' : 'เลือกแบรนด์ก่อน หรือพิมพ์รุ่น'}
                emptyText={form.brand ? 'ไม่พบรุ่นของแบรนด์นี้' : 'ไม่พบรุ่น'}
                groupLabel={form.brand ? `รุ่นของ ${form.brand}` : 'ทั้งหมด'}
              />
            </Field>
            <Field label="ประเภท *">
              <Combobox
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v })}
                items={types.map((t) => ({ value: t.code, label: t.label }))}
                placeholder="เลือกหรือพิมพ์ประเภท"
                emptyText="ไม่พบประเภท"
              />
            </Field>
            <Field label="แผนก">
              <Combobox
                value={form.department}
                onChange={(v) => setForm({ ...form, department: v })}
                items={departments.map((d) => ({ value: d.label, label: d.label }))}
                placeholder="เลือกหรือพิมพ์แผนก"
                emptyText="ไม่พบแผนก"
              />
            </Field>
            <Field label="กลุ่มอุปกรณ์ (Device Group)">
              <Combobox
                value={form.deviceGroup}
                onChange={(v) => setForm({ ...form, deviceGroup: v })}
                items={deviceGroups.map((g) => ({ value: g.code, label: g.label }))}
                placeholder="เลือกหรือพิมพ์กลุ่มอุปกรณ์"
                emptyText="ไม่พบกลุ่มอุปกรณ์"
              />
            </Field>
            <Field label="รหัสประจำ Site (AssetSiteCode)">
              <div className="flex gap-2">
                <Input
                  id="dev-assetSiteCode"
                  value={form.assetSiteCode}
                  onChange={(e) => setForm({ ...form, assetSiteCode: e.target.value })}
                  placeholder="เช่น UDH-00001"
                  className="font-mono text-xs dark:bg-slate-800 dark:border-slate-700"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generateSiteCodeNow}
                  disabled={!form.site}
                  className="h-9 shrink-0 border-[#f97316]/30 text-[#f97316] hover:bg-[#f97316]/10 dark:border-[#fb923c]/30 dark:text-[#fb923c]"
                  title="สร้าง/อัปเดตรหัสประจำ Site อัตโนมัติ"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  สร้างรหัส
                </Button>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                รูปแบบ PREFIX-NNNNN (เช่น UDH-00001) — ระบบจะหาเลขถัดไปให้อัตโนมัติ
              </p>
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

          {/* Location section — building → floor → location → room (cascading) */}
          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#f97316] dark:text-[#fb923c]">
              📍 ข้อมูลที่ตั้ง
              <span className="text-[10px] font-normal text-slate-400">
                (เลือกจากรายการที่เคยบันทึก หรือพิมพ์ใหม่ได้)
              </span>
            </div>
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
              <Field label="อาคาร (Building)">
                <Combobox
                  value={form.building}
                  onChange={(v) => setForm((prev) => ({ ...prev, building: v, floor: '', location: '', room: '' }))}
                  items={(buildingOptions ?? []).map((b) => ({ value: b, label: b }))}
                  placeholder={form.site ? 'เลือกหรือพิมพ์อาคาร' : 'เลือกสาขาก่อน'}
                  emptyText="ยังไม่มีอาคารในสาขานี้ — พิมพ์เพื่อเพิ่มใหม่"
                />
              </Field>
              <Field label="ชั้น (Floor)">
                <Combobox
                  value={form.floor}
                  onChange={(v) => setForm((prev) => ({ ...prev, floor: v, location: '', room: '' }))}
                  items={(floorOptions ?? []).map((f) => ({ value: f, label: f }))}
                  placeholder={form.building ? 'เลือกหรือพิมพ์ชั้น' : 'เลือกอาคารก่อน'}
                  emptyText={form.building ? 'ยังไม่มีชั้นในอาคารนี้ — พิมพ์เพื่อเพิ่มใหม่' : 'ไม่พบชั้น'}
                />
              </Field>
              <Field label="ตำแหน่ง (Location)">
                <Combobox
                  value={form.location}
                  onChange={(v) => setForm({ ...form, location: v })}
                  items={(locationOptions ?? []).map((l) => ({ value: l, label: l }))}
                  placeholder={form.floor ? 'เลือกหรือพิมพ์ตำแหน่ง' : 'เลือกชั้นก่อน'}
                  emptyText={form.floor ? 'ยังไม่มีตำแหน่ง — พิมพ์เพื่อเพิ่มใหม่' : 'ไม่พบตำแหน่ง'}
                />
              </Field>
              <Field label="ห้อง (Room)">
                <Input
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  placeholder="เช่น 301"
                />
              </Field>
            </div>
          </div>

          {/* Network section — remote ID only (ip/mac moved to basic info for barcode support) */}
          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#f97316] dark:text-[#fb923c]">
              🌐 เครือข่าย (Remote ID)
            </div>
            <div className="grid grid-cols-1 items-start gap-3">
              <Field label="Remote ID (TeamViewer/AnyDesk)">
                <Input
                  value={form.remoteId}
                  onChange={(e) =>
                    setForm({ ...form, remoteId: e.target.value })
                  }
                  placeholder="เช่น 123 456 789"
                  className="font-mono text-xs"
                />
              </Field>
            </div>
          </div>

          {/* Purchase / Warranty section */}
          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#f97316] dark:text-[#fb923c]">
              🧾 การซื้อ / รับประกัน
            </div>
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
              <Field label="ผู้ขาย (Vendor)">
                <Input
                  value={form.vendor}
                  onChange={(e) =>
                    setForm({ ...form, vendor: e.target.value })
                  }
                />
              </Field>
              <Field label="เลขที่สัญญา (Contract No)">
                <Input
                  value={form.contractNo}
                  onChange={(e) =>
                    setForm({ ...form, contractNo: e.target.value })
                  }
                />
              </Field>
              <Field label="วันหมดประกัน (Warranty End)">
                <Input
                  type="date"
                  value={form.warrantyEnd}
                  onChange={(e) =>
                    setForm({ ...form, warrantyEnd: e.target.value })
                  }
                />
              </Field>
              <Field label="วันที่ถอดถอน (Uninstall Date)">
                <Input
                  type="date"
                  value={form.uninstallDate}
                  onChange={(e) =>
                    setForm({ ...form, uninstallDate: e.target.value })
                  }
                />
              </Field>
            </div>
          </div>

          {/* Meter section */}
          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#f97316] dark:text-[#fb923c]">
              ⚙️ มิเตอร์
            </div>
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
              <div className="flex h-9 items-center gap-2">
                <Checkbox
                  id="meterRequired"
                  checked={form.meterRequired}
                  onCheckedChange={(v) =>
                    setForm({ ...form, meterRequired: v === true })
                  }
                  className="border-slate-300 data-[state=checked]:bg-[#f97316] data-[state=checked]:border-[#f97316] data-[state=checked]:text-white dark:border-slate-600"
                />
                <Label
                  htmlFor="meterRequired"
                  className="text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  ต้องจดมิเตอร์ (Meter Required)
                </Label>
              </div>
              <Field label="โหมดมิเตอร์ (Meter Mode)">
                <Select
                  value={form.meterMode}
                  onValueChange={(v) => setForm({ ...form, meterMode: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METER_MODE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          {/* Other section — costCenter / remark (deviceGroup moved to basic info) */}
          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#f97316] dark:text-[#fb923c]">
              📝 อื่นๆ
            </div>
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
              <Field label="ศูนย์ต้นทุน (Cost Center)">
                <Input
                  value={form.costCenter}
                  onChange={(e) =>
                    setForm({ ...form, costCenter: e.target.value })
                  }
                />
              </Field>
              <Field label="หมายเหตุ (Remark)">
                <Input
                  value={form.remark}
                  onChange={(e) =>
                    setForm({ ...form, remark: e.target.value })
                  }
                />
              </Field>
            </div>
          </div>

          {/* Financial section — depreciation tracking */}
          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/30">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#f97316] dark:text-[#fb923c]">
              💰 การเงิน (สำหรับคำนวณค่าเสื่อมราคา)
            </div>
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
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
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</Label>
      {children}
      {hint && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400">{hint}</p>
      )}
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
