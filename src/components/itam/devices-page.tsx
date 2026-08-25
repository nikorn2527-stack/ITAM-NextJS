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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
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
  AlertTriangle,
  CheckCircle2,
  Wrench,
  XCircle,
  ShieldCheck,
  Keyboard,
  Columns3,
  Eye,
  Clock,
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
import { PrintTemplateSelectionDialog } from './print-template-selection-dialog'
import { Combobox } from './combobox'
import { CustomExportDialog, type ExportColumn, type ExportFormat } from './custom-export-dialog'
import { downloadCsv, dateStamp } from '@/lib/csv'
import { cn } from '@/lib/utils'
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

/** License / Software row — mirrors the LicenseRecord Prisma model.
 *  Field names are camelCase in the client, mapped to PascalCase by the API. */
export interface LicenseRow {
  id?: string // present when loaded from DB (edit mode)
  licenseId: string // License_ID
  software: string // Software (required)
  licenseType: string // LicenseType (OEM | Volume | Retail | Subscription | Open License)
  licenseKey: string // License_Key
  quantity: number // Quantity
  expiryDate: string // Expiry_Date (yyyy-mm-dd)
  remark: string // Remark
}

const EMPTY_LICENSE: LicenseRow = {
  licenseId: '',
  software: '',
  licenseType: '',
  licenseKey: '',
  quantity: 1,
  expiryDate: '',
  remark: '',
}

const LICENSE_TYPE_OPTIONS = [
  { value: '__none__', label: '— เลือกประเภท —' },
  { value: 'OEM', label: 'OEM (มาพร้อมเครื่อง)' },
  { value: 'Volume', label: 'Volume License (ลายเซ็นต์ปริมาณ)' },
  { value: 'Retail', label: 'Retail (แบบกล่อง)' },
  { value: 'Subscription', label: 'Subscription (สมัครรายเดือน/ปี)' },
  { value: 'Open License', label: 'Open License' },
] as const

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
  // ── Device Set / Parent-Child (Task ID 9, Phase 2) ──
  parentDeviceId: string    // "" = no parent (this device is a parent or standalone)
  setLabel: string          // e.g. "ชุดเครื่องพิมพ์ห้องจ่ายยา"
  setPosition: string      // "" = unset
  // ── License / Software (NEW) ──
  licenses: LicenseRow[]
}

/**
 * DeviceGroup Thai labels — the MasterItem stores English codes (COMPANY,
 * LEASED, DEPT, PERSONAL) but the UI should display them in Thai so users
 * understand the meaning. The stored value stays the English code so the
 * backend / CSV / Apps Script bridge keeps working.
 */
const DEVICE_GROUP_THAI: Record<string, string> = {
  COMPANY: 'ของบริษัท',
  LEASED: 'เช่า/เช่าซื้อ',
  DEPT: 'ของแผนก',
  PERSONAL: 'ส่วนบุคคล',
}

/** Default DeviceGroup code on Add New (the user requested "ของบริษัท"). */
const DEFAULT_DEVICE_GROUP = 'COMPANY'

const EMPTY_FORM: FormState = {
  assetCode: '',
  assetSiteCode: '',
  name: '',
  brand: '',
  model: '',
  type: '',
  serialNumber: '',
  status: 'active',
  site: '',
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
  deviceGroup: DEFAULT_DEVICE_GROUP,
  remark: '',
  parentDeviceId: '',
  setLabel: '',
  setPosition: '',
  licenses: [],
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
  const [printTemplateOpen, setPrintTemplateOpen] = React.useState(false)

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

  // ── New: recently-viewed devices (persisted in localStorage) ──
  // Stores the last 5 device IDs the user opened in the detail sheet.
  const [recentDeviceIds, setRecentDeviceIds] = React.useState<string[]>([])
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('itam-recent-devices')
      if (raw) setRecentDeviceIds(JSON.parse(raw))
    } catch (e) { console.error(String(e)) }
  }, [])
  const pushRecentDevice = React.useCallback((id: string) => {
    setRecentDeviceIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 5)
      try {
        localStorage.setItem('itam-recent-devices', JSON.stringify(next))
      } catch (e) { console.error(String(e)) }
      return next
    })
  }, [])

  // ── New: keyboard shortcuts help dialog ──
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)

  // ── New: column visibility (persisted) ──
  // Default columns mirror what the table currently renders. Hidden columns
  // are removed from the header + body. Users can toggle via the Columns button.
  type ColumnKey =
    | 'assetCode'
    | 'assetSiteCode'
    | 'type'
    | 'brandModel'
    | 'serialNumber'
    | 'location'
    | 'department'
    | 'status'
    | 'meter'
    | 'updatedAt'
    | 'actions'
  const ALL_COLUMNS: { key: ColumnKey; label: string }[] = [
    { key: 'assetCode', label: 'รหัสทรัพย์สิน' },
    { key: 'assetSiteCode', label: 'ทะเบียน Site' },
    { key: 'type', label: 'ประเภท' },
    { key: 'brandModel', label: 'ยี่ห้อ/รุ่น' },
    { key: 'serialNumber', label: 'Serial No.' },
    { key: 'location', label: 'อาคาร/ชั้น' },
    { key: 'department', label: 'แผนก/ตำแหน่ง' },
    { key: 'status', label: 'สถานะ' },
    { key: 'meter', label: 'มิเตอร์ล่าสุด' },
    { key: 'updatedAt', label: 'อัปเดตล่าสุด' },
    { key: 'actions', label: 'การกระทำ' },
  ]
  const [hiddenColumns, setHiddenColumns] = React.useState<Set<ColumnKey>>(
    () => {
      try {
        const raw = localStorage.getItem('itam-devices-hidden-cols')
        if (raw) return new Set(JSON.parse(raw))
      } catch (e) { console.error(String(e)) }
      return new Set()
    },
  )
  const toggleColumn = React.useCallback((key: ColumnKey) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try {
        localStorage.setItem(
          'itam-devices-hidden-cols',
          JSON.stringify([...next]),
        )
      } catch (e) { console.error(String(e)) }
      return next
    })
  }, [])
  const isColVisible = (key: ColumnKey) => !hiddenColumns.has(key)

  // ── New: global keyboard shortcuts ──
  // Ctrl/Cmd+K → focus search; Ctrl/Cmd+N → new device; Ctrl/Cmd+R → refresh; ? → shortcuts help
  const searchInputId = 'itam-devices-search'
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Skip when typing in inputs (except for Escape)
      const target = e.target as HTMLElement
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      if (isTyping && e.key !== 'Escape') return

      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const el = document.getElementById(searchInputId) as HTMLInputElement | null
        el?.focus()
        el?.select()
      } else if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        openAdd()
      } else if (mod && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        qc.invalidateQueries({ queryKey: ['devices'] })
      } else if (e.key === '?' && !mod) {
        e.preventDefault()
        setShortcutsOpen(true)
      } else if (e.key === 'Escape') {
        if (shortcutsOpen) setShortcutsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcutsOpen, qc])

  // ── New: derived KPI counts from the filtered `devices` list ──
  // (Moved below `devices` declaration so the closure captures it correctly.)

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
    queryKey: ['devices', search, statusFilter, siteFilter, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (siteFilter !== 'all') params.set('site', siteFilter)
      // Use the user-selected page size (20/50/100) for the API request.
      // Previously hardcoded to 500 which caused the page size selector to
      // appear broken (UI showed 50 but API always fetched 500).
      params.set('limit', String(pageSize))
      params.set('page', '1')
      const res = await fetch(`/api/devices?${params.toString()}`, {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to load devices')
      const json = await res.json()
      return json.devices as Device[]
    },
    staleTime: 5 * 60 * 1000, // 5 min — reduce refetch frequency
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

  // ── New: derived KPI counts from the filtered `devices` list ──
  // Clicking a KPI card in the UI applies the corresponding filter.
  // Status matching is case-insensitive — DB stores mixed-case values
  // (Active, In Repair, Retired, Inactive, Disposed, Returned) but the
  // legacy short forms (active, spare, repair, disposed) also appear in
  // old imports. We normalise by lowercasing + checking against a set of
  // known aliases per KPI bucket.
  const kpi = React.useMemo(() => {
    const list = devices ?? []
    const norm = (s: string | null | undefined): string =>
      (s ?? '').trim().toLowerCase()
    const active = list.filter((d) => {
      const s = norm(d.status)
      return s === 'active' || s === 'in use'
    }).length
    const repair = list.filter((d) => {
      const s = norm(d.status)
      return s === 'in repair' || s === 'repair' || s === 'pending repair'
    }).length
    const inactive = list.filter((d) => {
      const s = norm(d.status)
      return (
        s === 'inactive'
        || s === 'retired'
        || s === 'disposed'
        || s === 'returned'
      )
    }).length
    const spare = list.filter((d) => {
      const s = norm(d.status)
      return s === 'spare' || s === 'in stock'
    }).length
    const warrantyExpiringSoon = list.filter((d) => {
      const w = computeWarranty(d.purchaseDate, d.warrantyMonths ?? 12)
      return w.status === 'expiring'
    }).length
    const warrantyExpired = list.filter((d) => {
      const w = computeWarranty(d.purchaseDate, d.warrantyMonths ?? 12)
      return w.status === 'expired'
    }).length
    return {
      total: list.length,
      active,
      repair,
      inactive,
      spare,
      warrantyExpiringSoon,
      warrantyExpired,
    }
  }, [devices])

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
      const res = await fetch('/api/sites', { headers: authHeaders() })
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

  // ── Cascading master data (DeviceType → Brand → Model) ──
  // Uses the new /api/master?type=... endpoints backed by normalized tables.
  const { data: deviceTypes } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['master', 'device-types'],
    queryFn: async () => {
      const res = await fetch('/api/master?type=device-types', { headers: authHeaders() })
      if (!res.ok) return []
      const json = await res.json()
      return (json.items ?? []) as { id: string; name: string }[]
    },
    staleTime: 5 * 60 * 1000,
  })

  // Brands are filtered by the selected DeviceType (cascading).
  const { data: brandsData } = useQuery<{ id: string; name: string; typeId: string }[]>({
    queryKey: ['master', 'brands', form.type],
    queryFn: async () => {
      if (!form.type) return []
      // Find the DeviceType id from the deviceTypes list
      const typeId = deviceTypes?.find((t) => t.name === form.type)?.id
      if (!typeId) return []
      const res = await fetch(`/api/master?type=brands&typeId=${typeId}`, { headers: authHeaders() })
      if (!res.ok) return []
      const json = await res.json()
      return (json.items ?? []) as { id: string; name: string; typeId: string }[]
    },
    enabled: !!form.type && !!deviceTypes,
    staleTime: 5 * 60 * 1000,
  })

  // Models are filtered by the selected Brand (cascading).
  const { data: modelsData } = useQuery<{ id: string; name: string; brandId: string }[]>({
    queryKey: ['master', 'models', form.brand],
    queryFn: async () => {
      if (!form.brand) return []
      // Find the Brand id from the brandsData list
      const brandId = brandsData?.find((b) => b.name === form.brand)?.id
      if (!brandId) return []
      const res = await fetch(`/api/master?type=models&brandId=${brandId}`, { headers: authHeaders() })
      if (!res.ok) return []
      const json = await res.json()
      return (json.items ?? []) as { id: string; name: string; brandId: string }[]
    },
    enabled: !!form.brand && !!brandsData,
    staleTime: 5 * 60 * 1000,
  })

  // ── Legacy MasterItem lookups (Department, DeviceGroup, Affiliation) ──
  // These remain as flat MasterItem rows (not normalized into separate tables).
  const { data: masterItems } = useQuery<{
    category: string
    code: string
    label: string
    parentRef?: string | null
    deviceType?: string | null
    brand?: string | null
    model?: string | null
  }[]>({
    queryKey: ['master-all'],
    queryFn: async () => {
      const res = await fetch('/api/master', { headers: authHeaders() })
      if (!res.ok) return []
      const json = await res.json()
      return (json.items ?? []) as {
        category: string
        code: string
        label: string
        parentRef?: string | null
        deviceType?: string | null
        brand?: string | null
        model?: string | null
      }[]
    },
  })

  const departments = (masterItems ?? []).filter(
    (m) => m.category === 'Department',
  )
  const deviceGroups = (masterItems ?? []).filter(
    (m) => m.category === 'DeviceGroup',
  )
  // Affiliation rows — parent of Department. Used for the Affiliation dropdown.
  const affiliations = (masterItems ?? []).filter(
    (m) => m.category === 'Affiliation',
  )
  // Departments filtered by the selected Affiliation (parentRef stores the
  // Affiliation LABEL — not the code — so we match against label).
  const filteredDepartments = form.parentRef
    ? departments.filter((d) => d.parentRef === form.parentRef)
    : departments

  // ── DeviceClassification rows (Type/Brand/Model lookup) ──
  // Used for the reverse cascade: when the user picks a Model, we can
  // auto-fill Brand + Type from the matching DeviceClassification row.
  // Also used to filter brands by type and models by brand.
  const deviceClassifications = (masterItems ?? []).filter(
    (m) => m.category === 'DeviceClassification',
  )

  // ── Cascading dropdowns: site → building → floor → location ──
  // Uses /api/master?type=buildings|floors for buildings/floors (backed by
  // MasterItem with siteCode matching — works correctly with site CODES
  // like "UDH"). Location still uses the device-history-based cascading API
  // because locations aren't master data.
  const { data: buildingOptions } = useQuery<string[]>({
    queryKey: ['master', 'buildings', form.site],
    queryFn: async () => {
      try {
        const url = `/api/master?type=buildings${form.site ? `&site=${encodeURIComponent(form.site)}` : ''}`
        const res = await fetch(url, { headers: authHeaders() })
        if (!res.ok) return []
        const j = (await res.json()) as { items?: string[] }
        return j.items ?? []
      } catch {
        return []
      }
    },
    enabled: dialogOpen && Boolean(form.site),
  })
  const { data: floorOptions } = useQuery<string[]>({
    queryKey: ['master', 'floors'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/master?type=floors', { headers: authHeaders() })
        if (!res.ok) return []
        const j = (await res.json()) as { items?: string[] }
        return j.items ?? []
      } catch {
        return []
      }
    },
    enabled: dialogOpen,
  })
  // ── GLOBAL locations (distinct across all devices) ──
  // Used as the full list for the Location dropdown — so the user sees
  // every location that has ever been entered in the system, as a guide.
  // The ones matching the current floor are HIGHLIGHTED in green.
  const { data: globalLocations } = useQuery<string[]>({
    queryKey: ['global-locations'],
    queryFn: async () => {
      try {
        const j = await authFetch<{ values: string[] }>(
          '/api/itam/devices/cascading?field=location',
        )
        return j.values ?? []
      } catch {
        return []
      }
    },
    enabled: dialogOpen,
  })

  // ── Location Summary: which floors + departments + locations have devices at this building ──
  // Used to HIGHLIGHT (green) the floors/departments that actually exist at
  // the selected site+building — so the user knows "this floor has 5 departments"
  // without blocking them from picking others.
  const { data: locationSummary } = useQuery<{
    floors: string[]
    departments: string[]
    locations: string[]
    floorCounts: Record<string, number>
    departmentCounts: Record<string, number>
    locationCounts: Record<string, number>
  }>({
    queryKey: ['location-summary', form.site, form.building],
    queryFn: async () => {
      if (!form.site || !form.building) return { floors: [], departments: [], locations: [], floorCounts: {}, departmentCounts: {}, locationCounts: {} }
      try {
        const params = new URLSearchParams({
          site: form.site,
          building: form.building,
        })
        const j = await authFetch<{
          floors: string[]
          departments: string[]
          locations: string[]
          floorCounts: Record<string, number>
          departmentCounts: Record<string, number>
          locationCounts: Record<string, number>
        }>(`/api/itam/devices/location-summary?${params.toString()}`)
        return j
      } catch {
        return { floors: [], departments: [], locations: [], floorCounts: {}, departmentCounts: {}, locationCounts: {} }
      }
    },
    enabled: dialogOpen && Boolean(form.site) && Boolean(form.building),
  })

  // Derived highlight sets + badges
  const highlightedFloors = locationSummary?.floors ?? []
  const highlightedDepartments = locationSummary?.departments ?? []
  const highlightedLocations = locationSummary?.locations ?? []
  const floorBadges = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const [floor, count] of Object.entries(locationSummary?.floorCounts ?? {})) {
      m[floor] = `${count} เครื่อง`
    }
    return m
  }, [locationSummary])
  const departmentBadges = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const [dept, count] of Object.entries(locationSummary?.departmentCounts ?? {})) {
      m[dept] = `${count} เครื่อง`
    }
    return m
  }, [locationSummary])
  const locationBadges = React.useMemo(() => {
    const m: Record<string, string> = {}
    for (const [loc, count] of Object.entries(locationSummary?.locationCounts ?? {})) {
      m[loc] = `${count} เครื่อง`
    }
    return m
  }, [locationSummary])

  // ── Auto-derive meterRequired from Type ──
  // Printers, copiers, and multi-function devices need meter tracking.
  // Scanners, barcode scanners, and other devices do not.
  // This runs whenever form.type changes — the user doesn't need to
  // manually check a "meter required" checkbox.
  const METER_REQUIRED_TYPES = ['PRINTER', 'COPIER', 'MFD', 'MULTIFUNCTION']
  React.useEffect(() => {
    if (!form.type) return
    const isMeterRequired = METER_REQUIRED_TYPES.some((t) =>
      form.type.toUpperCase().includes(t),
    )
    setForm((prev) =>
      prev.meterRequired === isMeterRequired
        ? prev
        : { ...prev, meterRequired: isMeterRequired },
    )
  }, [form.type])

  // ── Auto-generate device name from brand + model + location ──
  // Watches brand, model, building, floor, location — auto-fills `name`
  // unless the user has manually typed something.
  // Example: "BROTHER HL-L5210DN ตึกผู้ป่วยนอก (OPD) ชั้น 2"
  const nameManuallyEditedRef = React.useRef(false)
  React.useEffect(() => {
    // Don't auto-fill if user has manually edited the name
    if (nameManuallyEditedRef.current) return
    const parts = [
      form.brand,
      form.model,
      form.building,
      form.floor ? `ชั้น ${form.floor}` : '',
      form.location,
    ].filter(Boolean)
    const autoName = parts.join(' ')
    setForm((prev) =>
      prev.name === autoName ? prev : { ...prev, name: autoName },
    )
  }, [form.brand, form.model, form.building, form.floor, form.location])

  function openAdd() {
    setForm({ ...EMPTY_FORM })
    nameManuallyEditedRef.current = false
    setDialogOpen(true)
    // Auto-generate the next assetCode continuing from the latest integer
    // (the legacy Apps Script assigned sequential integers 1, 2, 3 …).
    // Best-effort — if the API call fails, the user can still type a code.
    void fetchNextAssetCode()
  }

  // ── Auto-generate assetCode (continuing from latest) ──
  // Calls /api/devices/next-asset-code and fills the field on Add New.
  // Only auto-fills when the field is empty (CREATE only).
  const generatingAssetCodeRef = React.useRef(false)
  const fetchNextAssetCode = React.useCallback(async () => {
    if (generatingAssetCodeRef.current) return
    generatingAssetCodeRef.current = true
    try {
      const res = await fetch('/api/devices/next-asset-code', { headers: authHeaders() })
      if (!res.ok) return
      const j = (await res.json()) as { code?: string | null; next?: number }
      if (j.code) {
        setForm((prev) =>
          prev.assetCode ? prev : { ...prev, assetCode: j.code ?? '' },
        )
      }
    } catch {
      /* non-fatal — user can still type a code manually */
    } finally {
      generatingAssetCodeRef.current = false
    }
  }, [])

  function openEdit(d: Device) {
    nameManuallyEditedRef.current = true
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
      // ── Device Set fields (Task ID 9, Phase 2) ──
      // Cast through unknown because the legacy `Device` type doesn't
      // include parentDeviceId/setLabel/setPosition yet (only the DB row does).
      parentDeviceId: (d as unknown as { parentDeviceId?: string | null }).parentDeviceId ?? '',
      setLabel: (d as unknown as { setLabel?: string | null }).setLabel ?? '',
      setPosition: (d as unknown as { setPosition?: number | null }).setPosition != null
        ? String((d as unknown as { setPosition?: number | null }).setPosition)
        : '',
      licenses: [],
    })
    setDialogOpen(true)
    // Load existing licenses for this device (edit mode only)
    void loadDeviceLicenses(d.id)
  }

  // ── Load licenses for an existing device (edit mode) ──
  // For new devices, licenses are kept in local state and POSTed after
  // the device is created (see save()).
  const [licensesLoading, setLicensesLoading] = React.useState(false)
  async function loadDeviceLicenses(deviceId: string) {
    setLicensesLoading(true)
    try {
      const res = await fetch(`/api/devices/${deviceId}/licenses`, {
        headers: authHeaders(),
      })
      if (!res.ok) return
      const j = (await res.json()) as {
        licenses?: Array<{
          id: string
          License_ID: string | null
          Software: string
          LicenseType: string | null
          License_Key: string | null
          Quantity: number
          Expiry_Date: string | null
          Remark: string | null
        }>
      }
      const mapped: LicenseRow[] = (j.licenses ?? []).map((l) => ({
        id: l.id,
        licenseId: l.License_ID ?? '',
        software: l.Software ?? '',
        licenseType: l.LicenseType ?? '',
        licenseKey: l.License_Key ?? '',
        quantity: l.Quantity ?? 1,
        expiryDate: l.Expiry_Date ?? '',
        remark: l.Remark ?? '',
      }))
      setForm((prev) => ({ ...prev, licenses: mapped }))
    } catch {
      /* non-fatal */
    } finally {
      setLicensesLoading(false)
    }
  }

  // ── License helpers (local state CRUD) ──
  function addLicense() {
    setForm((prev) => ({
      ...prev,
      licenses: [...prev.licenses, { ...EMPTY_LICENSE }],
    }))
  }
  function updateLicense(idx: number, patch: Partial<LicenseRow>) {
    setForm((prev) => ({
      ...prev,
      licenses: prev.licenses.map((l, i) =>
        i === idx ? { ...l, ...patch } : l,
      ),
    }))
  }
  function removeLicense(idx: number) {
    setForm((prev) => ({
      ...prev,
      licenses: prev.licenses.filter((_, i) => i !== idx),
    }))
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
    if (!form.assetCode || !form.name || !form.brand || !form.model || !form.type || !form.site) {
      toast.error('กรุณากรอกข้อมูลที่จำเป็น (สาขา, รหัส, ชื่อ, แบรนด์, รุ่น, ประเภท)')
      return
    }
    try {
      setSaving(true)
      // Omit licenses from the device payload — they're saved separately
      // via /api/devices/[id]/licenses after the device is created/updated.
      const { licenses: _licenses, ...deviceFields } = form
      void _licenses
      const payload = {
        ...deviceFields,
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
        // ── Device Set fields (Task ID 9, Phase 2) ──
        parentDeviceId: form.parentDeviceId || null,
        setLabel: form.setLabel || null,
        setPosition: form.setPosition === '' ? null : Number(form.setPosition),
      }
      const isEdit = Boolean(form.id)
      const url = isEdit ? `/api/devices/${form.id}` : '/api/devices'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Save failed')
      }
      // After device is saved, sync licenses to the backend.
      // - New device: POST every license row
      // - Edit device: diff local vs server (we have the row IDs) — for
      //   simplicity, we POST new rows (no id) and PUT existing rows.
      let savedDeviceId = form.id
      if (!isEdit) {
        const j = (await res.json()) as { device?: { id: string } }
        savedDeviceId = j.device?.id
      }
      if (savedDeviceId && form.licenses.length > 0) {
        const licenseResults = await Promise.allSettled(
          form.licenses
            .filter((l) => l.software.trim() !== '')
            .map((l) => {
              const body = {
                software: l.software,
                licenseId: l.licenseId || undefined,
                licenseType: l.licenseType || undefined,
                licenseKey: l.licenseKey || undefined,
                quantity: l.quantity || 1,
                expiryDate: l.expiryDate || undefined,
                remark: l.remark || undefined,
              }
              if (l.id) {
                // Existing license — PUT update
                return fetch(
                  `/api/devices/${savedDeviceId}/licenses?licenseId=${l.id}`,
                  {
                    method: 'PUT',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(body),
                  },
                )
              }
              // New license — POST create
              return fetch(`/api/devices/${savedDeviceId}/licenses`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(body),
              })
            }),
        )
        const failed = licenseResults.filter(
          (r) => r.status === 'rejected',
        ).length
        if (failed > 0) {
          toast.warning(
            `บันทึกอุปกรณ์แล้ว แต่ ${failed} รายการ License ไม่สำเร็จ`,
          )
        }
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
      // For CSV export, request the maximum page size (500) and include auth
      params.set('limit', '500')
      const res = await fetch(`/api/devices?${params.toString()}`, {
        headers: authHeaders(),
      })
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

  // ── Custom Export Dialog (Task ID 9, Phase 3) ──
  // Full list of columns that can be exported — richer than the default
  // DEVICE_CSV_HEADERS list. Grouped for visual clarity in the picker.
  const EXPORT_AVAILABLE_COLUMNS: ExportColumn[] = [
    { key: 'assetCode', label: 'รหัสทรัพย์สิน', group: 'ข้อมูลทั่วไป' },
    { key: 'assetSiteCode', label: 'ทะเบียน Site', group: 'ข้อมูลทั่วไป' },
    { key: 'name', label: 'ชื่ออุปกรณ์', group: 'ข้อมูลทั่วไป' },
    { key: 'type', label: 'ประเภท', group: 'ข้อมูลทั่วไป' },
    { key: 'brand', label: 'ยี่ห้อ', group: 'ข้อมูลทั่วไป' },
    { key: 'model', label: 'รุ่น', group: 'ข้อมูลทั่วไป' },
    { key: 'serialNumber', label: 'Serial No.', group: 'ข้อมูลทั่วไป' },
    { key: 'status', label: 'สถานะ', group: 'ข้อมูลทั่วไป' },
    { key: 'site', label: 'สาขา', group: 'ตำแหน่ง' },
    { key: 'building', label: 'อาคาร', group: 'ตำแหน่ง' },
    { key: 'floor', label: 'ชั้น', group: 'ตำแหน่ง' },
    { key: 'room', label: 'ห้อง', group: 'ตำแหน่ง' },
    { key: 'department', label: 'แผนก', group: 'ตำแหน่ง' },
    { key: 'departmentCode', label: 'รหัสแผนก', group: 'ตำแหน่ง' },
    { key: 'location', label: 'ตำแหน่ง/ที่ตั้ง', group: 'ตำแหน่ง' },
    { key: 'currentAssignee', label: 'ผู้ใช้งานปัจจุบัน', group: 'ผู้ใช้/การเงิน' },
    { key: 'costCenter', label: 'Cost Center', group: 'ผู้ใช้/การเงิน' },
    { key: 'deviceGroup', label: 'กลุ่มอุปกรณ์', group: 'ผู้ใช้/การเงิน' },
    { key: 'purchaseDate', label: 'วันที่รับ', group: 'ผู้ใช้/การเงิน' },
    { key: 'purchasePrice', label: 'ราคาทุน', group: 'ผู้ใช้/การเงิน' },
    { key: 'salvageValue', label: 'มูลค่าซาก', group: 'ผู้ใช้/การเงิน' },
    { key: 'usefulLife', label: 'อายุการใช้งาน (เดือน)', group: 'ผู้ใช้/การเงิน' },
    { key: 'warrantyMonths', label: 'การรับประกัน (เดือน)', group: 'ผู้ใช้/การเงิน' },
    { key: 'warrantyEnd', label: 'วันหมดรับประกัน', group: 'ผู้ใช้/การเงิน' },
    { key: 'vendor', label: 'ผู้จำหน่าย', group: 'ผู้ใช้/การเงิน' },
    { key: 'contractNo', label: 'เลขที่สัญญา', group: 'ผู้ใช้/การเงิน' },
    { key: 'meterRequired', label: 'ต้องจดมิเตอร์', group: 'มิเตอร์' },
    { key: 'meterMode', label: 'โหมดมิเตอร์', group: 'มิเตอร์' },
    { key: 'lastMeterBw', label: 'มิเตอร์ ขาวดำ', group: 'มิเตอร์' },
    { key: 'lastMeterColor', label: 'มิเตอร์ สี', group: 'มิเตอร์' },
    { key: 'lastReadingMonth', label: 'เดือนที่จดล่าสุด', group: 'มิเตอร์' },
    { key: 'ip', label: 'IP Address', group: 'เครือข่าย' },
    { key: 'mac', label: 'MAC Address', group: 'เครือข่าย' },
    { key: 'remoteId', label: 'Remote ID', group: 'เครือข่าย' },
    { key: 'parentRef', label: 'Parent Ref', group: 'ความสัมพันธ์' },
    { key: 'parentDeviceId', label: 'อุปกรณ์หลัก (Set)', group: 'ความสัมพันธ์' },
    { key: 'setLabel', label: 'ชื่อชุด', group: 'ความสัมพันธ์' },
    { key: 'setPosition', label: 'ลำดับในชุด', group: 'ความสัมพันธ์' },
    { key: 'displayLabel', label: 'Display Label', group: 'อื่นๆ' },
    { key: 'uninstallDate', label: 'วันที่ถอน', group: 'อื่นๆ' },
    { key: 'remark', label: 'หมายเหตุ', group: 'อื่นๆ' },
    { key: 'updatedBy', label: 'ผู้แก้ไขล่าสุด', group: 'อื่นๆ' },
    { key: 'updatedAt', label: 'วันที่อัปเดต', group: 'อื่นๆ' },
  ]
  const [customExportOpen, setCustomExportOpen] = React.useState(false)

  /** Custom export handler — fetches devices and writes them in the chosen
   *  format with the user-selected columns (in the chosen order). */
  async function handleCustomExport(
    columns: ExportColumn[],
    format: ExportFormat,
  ) {
    try {
      setExporting(true)
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (siteFilter !== 'all') params.set('site', siteFilter)
      params.set('limit', '500')
      const res = await fetch(`/api/devices?${params.toString()}`, {
        headers: authHeaders(),
      })
      if (!res.ok) throw new Error('Failed to fetch devices for export')
      const json = await res.json()
      const rows = (json.devices ?? []) as Record<string, unknown>[]

      const headers = columns.map((c) => ({ key: c.key, label: c.label }))
      const filename = `devices-${dateStamp()}`

      if (format === 'csv') {
        downloadCsv(`${filename}.csv`, rows, headers)
      } else if (format === 'xlsx') {
        // Dynamic import keeps xlsx out of the main bundle — only loaded
        // when the user actually picks Excel format.
        const XLSX = await import('xlsx')
        const data = rows.map((r) => {
          const obj: Record<string, unknown> = {}
          for (const h of headers) obj[h.label] = r[h.key] ?? ''
          return obj
        })
        const ws = XLSX.utils.json_to_sheet(data)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Devices')
        XLSX.writeFile(wb, `${filename}.xlsx`)
      } else if (format === 'pdf') {
        // PDF: open a print-friendly window with a table the browser can
        // print to PDF. Avoids heavy pdf-lib dependency; uses the browser's
        // native print → Save as PDF.
        const printWin = window.open('', '_blank', 'width=1024,height=768')
        if (!printWin) {
          throw new Error('โปรดอนุญาต popup เพื่อสร้าง PDF')
        }
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${filename}</title>
<style>
body { font-family: 'Sarabun', 'Helvetica', sans-serif; margin: 16px; font-size: 11px; }
h1 { font-size: 16px; margin: 0 0 8px; }
.meta { color: #666; font-size: 10px; margin-bottom: 12px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; }
th { background: #f97316; color: white; font-weight: 600; font-size: 10px; }
tr:nth-child(even) { background: #fafafa; }
</style></head><body>
<h1>รายการอุปกรณ์ IT</h1>
<div class="meta">ส่งออกเมื่อ ${new Date().toLocaleString('th-TH')} — ${rows.length} รายการ, ${columns.length} คอลัมน์</div>
<table>
<thead><tr>${headers.map((h) => `<th>${h.label}</th>`).join('')}</tr></thead>
<tbody>
${rows.map((r) => `<tr>${headers.map((h) => `<td>${String(r[h.key] ?? '').replace(/</g, '&lt;')}</td>`).join('')}</tr>`).join('')}
</tbody>
</table>
<script>window.onload = () => { window.print(); };</script>
</body></html>`
        printWin.document.write(html)
        printWin.document.close()
      }
      toast.success(`ส่งออก ${rows.length} รายการ (${columns.length} คอลัมน์) เป็น ${format.toUpperCase()} แล้ว`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Custom export failed')
      throw e
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

  // ── When the Add/Edit full-page form is open, render ONLY the form ──
  // (no list view, no sidebar clutter behind it). This makes the form feel
  // like a real page rather than a modal floating over content.
  if (dialogOpen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 dark:bg-slate-950">
        {/* ── Sticky Header ── */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title="ยกเลิก กลับสู่รายการ"
            >
              <X className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 sm:text-lg">
                {form.id ? '✏️ แก้ไขอุปกรณ์' : '➕ เพิ่มอุปกรณ์ใหม่'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                กรอกข้อมูลให้ครบ — ฟิลด์ที่มี <span className="font-semibold text-[#f97316]">*</span> เป็นข้อมูลที่จำเป็น
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="hidden sm:inline-flex"
            >
              ยกเลิก
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {saving ? 'กำลังบันทึก...' : '💾 บันทึกอุปกรณ์'}
            </Button>
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
            {/* ── SN Scanner (always visible at top) ──
                Scan a barcode → auto-fills the Serial Number field (in อุปกรณ์ tab).
                Useful for quickly entering SN without manual typing.
                Uses Enter key (sent by most barcode scanners) to commit the value. */}
            <div className="mb-4 flex items-center gap-2 rounded-md border border-[#f97316]/30 bg-[#f97316]/5 px-3 py-2 dark:border-[#fb923c]/30 dark:bg-[#fb923c]/5">
              <ScanLine className="h-4 w-4 shrink-0 text-[#f97316] dark:text-[#fb923c]" />
              <input
                type="text"
                placeholder="สแกนหรือพิมพ์ Serial Number แล้วกด Enter เพื่อกรอกอัตโนมัติ…"
                className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200 dark:placeholder:text-slate-500"
                onKeyDown={(e) => {
                  // Most barcode scanners send Enter after the code.
                  // We commit the value to form.serialNumber on Enter.
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const v = (e.target as HTMLInputElement).value.trim()
                    if (v) {
                      setForm((prev) => ({ ...prev, serialNumber: v }))
                      ;(e.target as HTMLInputElement).value = ''
                      // Auto-switch to อุปกรณ์ tab so the user sees the filled SN
                      const deviceTab = document.querySelector('[data-state="inactive"][role="tab"]')
                      // The Tabs component is controlled by Radix, so we just
                      // clear the input — the user can click the อุปกรณ์ tab to verify.
                    }
                  }
                }}
                onBlur={(e) => {
                  // Also commit on blur (if user typed manually and clicked away)
                  const v = e.target.value.trim()
                  if (v) {
                    setForm((prev) => ({ ...prev, serialNumber: v }))
                    e.target.value = ''
                  }
                }}
              />
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                สแกนบาร์โค้ด → กด Enter → กรอก SN อัตโนมัติ
              </span>
            </div>

            {/* ── Quick legend ── */}
            <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <span className="font-semibold text-[#f97316]">*</span>
                จำเป็น (Required)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                ไม่บังคับ (Optional)
              </span>
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-[#f97316]" />
                ระบบสร้างให้อัตโนมัติ
              </span>
            </div>

            {/* ── Tabs: 3 sections ──
                Tab 1: 📍 สถานที่ติดตั้ง (สาขา + รหัส + อาคาร/ชั้น/แผนก + ตำแหน่ง/ห้อง)
                Tab 2: 💻 อุปกรณ์ (สถานะ, Type/Brand/Model, IP/MAC, กลุ่มอุปกรณ์, โหมดมิเตอร์)
                Tab 3: ⚙️ ขั้นสูง (Remote ID, ซื้อ/รับประกัน, การเงิน, License, อื่นๆ) */}
            <Tabs defaultValue="location" className="w-full">
              <TabsList className="mb-4 grid w-full grid-cols-4">
                <TabsTrigger value="location" onClick={() => {}}>📍 สถานที่ติดตั้ง</TabsTrigger>
                <TabsTrigger value="device" onClick={() => {}}>💻 อุปกรณ์</TabsTrigger>
                <TabsTrigger value="set" onClick={() => {}}>📦 ชุดอุปกรณ์</TabsTrigger>
                <TabsTrigger value="advanced" onClick={() => {}}>⚙️ ขั้นสูง</TabsTrigger>
              </TabsList>

              {/* ═══════════════════════════════════════════════════════
                  Tab 1: 📍 สถานที่ติดตั้ง
                  ═══════════════════════════════════════════════════════ */}
              <TabsContent value="location" className="space-y-4">
                {/* ── Row 1: สาขา + รหัสอุปกรณ์ + รหัสประจำ Site (แถวเดียว — 2 อันหลัง auto จากสาขา) ── */}
                <div className="rounded-lg border border-sky-200 bg-white p-4 shadow-sm dark:border-sky-900/40 dark:bg-slate-900">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
                    📍 สถานที่ติดตั้ง
                  </div>
                  <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
                    <Field label="สาขา" required>
                      <Select
                        value={form.site}
                        onValueChange={(v) => {
                          setForm((prev) => ({
                            ...prev,
                            site: v,
                            building: '',
                            floor: '',
                            room: '',
                          }))
                          if (!form.id && !form.assetSiteCode) {
                            void fetchNextSiteCode(v)
                          }
                        }}
                      >
                        <SelectTrigger className="w-full" id="dev-site">
                          <SelectValue placeholder="— เลือกสาขา —" />
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
                    <Field label="รหัสอุปกรณ์" required>
                      <div className="relative">
                        <ScanLine className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="dev-assetCode"
                          value={form.assetCode}
                          onChange={(e) =>
                            setForm({ ...form, assetCode: e.target.value })
                          }
                          placeholder="สร้างอัตโนมัติ เช่น 2379"
                          className="bg-amber-50/50 pl-8 font-mono dark:bg-amber-950/10"
                        />
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => void fetchNextAssetCode()}
                          disabled={Boolean(form.id)}
                          title="สร้างเลขถัดไปอัตโนมัติ"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-[#f97316] hover:bg-[#f97316]/10 disabled:opacity-40 dark:text-[#fb923c]"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </Field>
                    <Field label="รหัสประจำ Site">
                      <div className="flex gap-2">
                        <Input
                          id="dev-assetSiteCode"
                          value={form.assetSiteCode}
                          onChange={(e) =>
                            setForm({ ...form, assetSiteCode: e.target.value })
                          }
                          placeholder="สร้างอัตโนมัติ เช่น UDH-02234"
                          className="bg-amber-50/50 font-mono text-xs dark:bg-amber-950/10 dark:border-slate-700"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={generateSiteCodeNow}
                          disabled={!form.site}
                          className="h-9 shrink-0 border-[#f97316]/30 text-[#f97316] hover:bg-[#f97316]/10 dark:border-[#fb923c]/30 dark:text-[#fb923c]"
                          title="สร้าง/อัปเดตรหัสประจำ Site อัตโนมัติ"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Field>
                  </div>

                  {/* ── Row 2: อาคาร + ชั้น + แผนก ── */}
                  <div className="mt-4 grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
                    <Field label="อาคาร" required>
                      <Combobox
                        value={form.building}
                        onChange={(v) =>
                          setForm((prev) => ({
                            ...prev,
                            building: v,
                            floor: '',
                            location: '',
                            room: '',
                          }))
                        }
                        items={(buildingOptions ?? []).map((b) => ({
                          value: b,
                          label: b,
                        }))}
                        placeholder="เลือกหรือพิมพ์อาคาร"
                        emptyText="ยังไม่มีอาคารในสาขานี้ — พิมพ์เพื่อเพิ่มใหม่"
                      />
                    </Field>
                    <Field label="ชั้น" required hint={highlightedFloors.length > 0 ? `🟢 ไฮไลต์ = ชั้นที่มีเครื่องอยู่จริงในอาคารนี้ (${highlightedFloors.length} ชั้น)` : undefined}>
                      <Combobox
                        value={form.floor}
                        onChange={(v) =>
                          setForm((prev) => ({
                            ...prev,
                            floor: v,
                            location: '',
                            room: '',
                          }))
                        }
                        items={(floorOptions ?? []).map((f) => ({
                          value: f,
                          label: f,
                        }))}
                        highlightedValues={highlightedFloors}
                        highlightBadges={floorBadges}
                        placeholder="เลือกหรือพิมพ์ชั้น"
                        emptyText="ไม่พบชั้น — พิมพ์เพื่อเพิ่มใหม่"
                      />
                    </Field>
                    <Field label="แผนก (Department)" hint={highlightedDepartments.length > 0 ? `🟢 ไฮไลต์ = แผนกที่มีเครื่องอยู่จริงในชั้นนี้ (${highlightedDepartments.length} แผนก)` : undefined}>
                      <Combobox
                        value={form.department}
                        onChange={(v) => {
                          const match = departments.find((d) => d.label === v)
                          if (match?.parentRef) {
                            setForm((prev) => ({
                              ...prev,
                              department: v,
                              parentRef: match.parentRef ?? prev.parentRef,
                              departmentCode: match.parentRef ?? prev.departmentCode,
                            }))
                          } else {
                            setForm((prev) => ({ ...prev, department: v }))
                          }
                        }}
                        items={filteredDepartments.map((d) => ({
                          value: d.label,
                          label: d.label,
                        }))}
                        highlightedValues={highlightedDepartments}
                        highlightBadges={departmentBadges}
                        placeholder="เลือกแผนก — สังกัด auto"
                        emptyText="ไม่พบแผนก — พิมพ์เพื่อเพิ่มใหม่"
                      />
                    </Field>
                  </div>

                  {/* ── สังกัด auto hint ── */}
                  {form.parentRef && (
                    <div className="mt-3 flex items-center gap-2 rounded-md bg-sky-50 px-3 py-2 text-[11px] text-sky-700 dark:bg-sky-950/30 dark:text-sky-400">
                      <span className="font-semibold">สังกัด (auto):</span>
                      <span>{form.parentRef}</span>
                      <span className="text-sky-400">← เติมอัตโนมัติจากแผนกที่เลือก</span>
                    </div>
                  )}

                  {/* ── Row 3: ตำแหน่ง + ห้อง (optional, ระบุจุดจำเพาะ) ── */}
                  <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      ระบุจุดจำเพาะ (ไม่บังคับ — ใส่เฉพาะตอนต้องการ)
                    </div>
                    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
                      <Field label="ตำแหน่ง (Location)" hint={highlightedLocations.length > 0 ? `🟢 ไฮไลต์ = ตำแหน่งที่มีเครื่องอยู่ในตึกนี้ (${highlightedLocations.length} ตำแหน่ง)` : 'ดึงตำแหน่งทั้งหมดที่เคยมีในระบบ — พิมพ์เพื่อเพิ่มใหม่ได้'}>
                        <Combobox
                          value={form.location}
                          onChange={(v) => setForm({ ...form, location: v })}
                          items={(globalLocations ?? []).map((l) => ({
                            value: l,
                            label: l,
                          }))}
                          highlightedValues={highlightedLocations}
                          highlightBadges={locationBadges}
                          placeholder="เลือกหรือพิมพ์ตำแหน่ง เช่น ห้องตรวจ 77"
                          emptyText="พิมพ์เพื่อเพิ่มใหม่"
                        />
                      </Field>
                      <Field label="ห้อง (Room)">
                        <Input
                        id="dev-room"
                          value={form.room}
                          onChange={(e) =>
                            setForm({ ...form, room: e.target.value })
                          }
                          placeholder="หมายเลขห้อง เช่น 301"
                        />
                      </Field>
                    </div>
                  </div>

                  {/* ── ข้อมูลเครื่อง (moved from Tab 2) ──
                      Type / Brand / Model / Name / Serial — ย้ายมาไว้ใน
                      Tab 1 เพราะพื้นที่พอและเป็นข้อมูลจำเป็นต้องกรอก */}
                  <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      💻 ข้อมูลเครื่อง
                    </div>
                    <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
                      <Field label="ประเภท (Type)" required hint="เลือกแล้วระบบกำหนด จดมิเตอร์ อัตโนมัติ">
                        <Combobox
                          value={form.type}
                          onChange={(v) =>
                            setForm({ ...form, type: v, brand: '', model: '' })
                          }
                          items={(deviceTypes ?? []).map((t) => ({
                            value: t.name,
                            label: t.name,
                          }))}
                          placeholder="เลือกหรือพิมพ์ประเภท เช่น PRINTER LASER"
                          emptyText="ไม่พบประเภท"
                        />
                      </Field>
                      <Field label="แบรนด์ (Brand)" required>
                        <Combobox
                          value={form.brand}
                          onChange={(v) =>
                            setForm({ ...form, brand: v, model: '' })
                          }
                          items={(brandsData ?? []).map((b) => ({
                            value: b.name,
                            label: b.name,
                          }))}
                          placeholder="เลือกหรือพิมพ์แบรนด์ เช่น BROTHER"
                          emptyText="ไม่พบแบรนด์"
                        />
                      </Field>
                      <Field label="รุ่น (Model)" required hint="เลือกรุ่นแล้ว แบรนด์/ประเภท auto">
                        <Combobox
                          value={form.model}
                          onChange={(v) => {
                            const match = deviceClassifications.find(
                              (c) =>
                                (c.model ?? '').toLowerCase() ===
                                v.toLowerCase(),
                            )
                            if (match) {
                              setForm((prev) => ({
                                ...prev,
                                model: v,
                                brand: match.brand ?? prev.brand,
                                type: match.deviceType ?? prev.type,
                              }))
                            } else {
                              setForm((prev) => ({ ...prev, model: v }))
                            }
                          }}
                          items={Array.from(
                            new Set(
                              deviceClassifications
                                .map((c) => c.model)
                                .filter((m): m is string => Boolean(m)),
                            ),
                          )
                            .sort()
                            .map((m) => ({ value: m, label: m }))}
                          placeholder="เลือกรุ่น เช่น HL-L5210DN"
                          emptyText="ไม่พบรุ่น — พิมพ์เพื่อเพิ่มใหม่"
                        />
                      </Field>
                      <Field label="ชื่ออุปกรณ์ (auto)" hint="สร้างอัตโนมัติจาก แบรนด์ + รุ่น + สถานที่ — แก้ไขได้ถ้าต้องการ">
                        <Input
                          id="dev-name"
                          value={form.name}
                          onChange={(e) => {
                            nameManuallyEditedRef.current = true
                            setForm({ ...form, name: e.target.value })
                          }}
                          placeholder="สร้างอัตโนมัติ เช่น BROTHER HL-L5210DN ตึกผู้ป่วยนอก (OPD) ชั้น 2"
                          className="bg-amber-50/50 dark:bg-amber-950/10"
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
                            placeholder="สแกนจากด้านบน หรือพิมพ์ SN"
                            className="pl-8 font-mono text-xs"
                          />
                        </div>
                      </Field>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ═══════════════════════════════════════════════════════
                  Tab 2: 💻 อุปกรณ์ (ตั้งค่า — Remote ID, สถานะ, IP/MAC, กลุ่ม, มิเตอร์)
                  ═══════════════════════════════════════════════════════ */}
              <TabsContent value="device" className="space-y-4">
                <div className="rounded-lg border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-900/40 dark:bg-slate-900">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    💻 ตั้งค่าอุปกรณ์
                  </div>
                  <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
                    <Field label="สถานะ" required>
                      <Select
                        value={form.status}
                        onValueChange={(v) =>
                          setForm({ ...form, status: v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="เลือกสถานะ" />
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
                    <Field label="Remote ID (TeamViewer / AnyDesk)">
                      <Input
                        id="dev-remoteId"
                        value={form.remoteId}
                        onChange={(e) =>
                          setForm({ ...form, remoteId: e.target.value })
                        }
                        placeholder="เช่น 123 456 789"
                        className="font-mono text-xs"
                      />
                    </Field>
                    <Field label="IP Address">
                      <div className="relative">
                        <ScanLine className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="dev-ip"
                          value={form.ip}
                          onChange={(e) =>
                            setForm({ ...form, ip: e.target.value })
                          }
                          placeholder="192.168.1.10"
                          className="pl-8 font-mono text-xs"
                          inputMode="decimal"
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
                            setForm({
                              ...form,
                              mac: formatMacInput(e.target.value),
                            })
                          }
                          placeholder="AA:BB:CC:DD:EE:FF"
                          className="pl-8 font-mono text-xs"
                          inputMode="text"
                        />
                      </div>
                    </Field>
                    <Field
                      label="กลุ่มอุปกรณ์ (Device Group)"
                    >
                      <Combobox
                        value={form.deviceGroup}
                        onChange={(v) =>
                          setForm({ ...form, deviceGroup: v })
                        }
                        items={deviceGroups.map((g) => ({
                          value: g.code,
                          label: DEVICE_GROUP_THAI[g.code] ?? g.label,
                        }))}
                        displayValue={(v) => DEVICE_GROUP_THAI[v] ?? v}
                        placeholder="เลือกกลุ่มอุปกรณ์ (default: ของบริษัท)"
                        emptyText="ไม่พบกลุ่มอุปกรณ์"
                      />
                    </Field>
                    <Field label="โหมดมิเตอร์">
                      <Select
                        value={form.meterMode}
                        onValueChange={(v) =>
                          setForm({ ...form, meterMode: v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="เลือกโหมดมิเตอร์" />
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

                  {/* ── meter status hint (auto-derived from Type) ── */}
                  <div className={`mt-3 rounded-md px-3 py-2 text-[11px] ${form.meterRequired ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400'}`}>
                    {form.meterRequired ? (
                      <>✅ <span className="font-semibold">ต้องจดมิเตอร์</span> — อัตโนมัติจากประเภท "{form.type}" (เครื่องพิมพ์/ก๊อปปี้)</>
                    ) : (
                      <>⚪ <span className="font-semibold">ไม่ต้องจดมิเตอร์</span> — อัตโนมัติจากประเภท "{form.type || '(ยังไม่เลือก)'}"</>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ═══════════════════════════════════════════════════════
                  Tab 3: 📦 ชุดอุปกรณ์ (Device Set / Parent-Child)
                  ─────────────────────────────────────────────────────
                  Lets the user mark this device as belonging to a "set":
                  • If this is a parent device, leave parent empty — children
                    will be assigned their own parentDeviceId via this same UI.
                  • If this is a child device, pick the parent device from
                    the combobox (search by assetCode or name).
                  • setLabel = a free-text name for the whole set (shared
                    across all members — e.g. "ชุดเครื่องพิมพ์ห้องจ่ายยา").
                  • setPosition = optional ordering inside the set (1, 2, 3…).
                  ═══════════════════════════════════════════════════════ */}
              <TabsContent value="set" className="space-y-4">
                <div className="rounded-lg border border-teal-200 bg-white p-4 shadow-sm dark:border-teal-900/40 dark:bg-slate-900">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400">
                    📦 ชุดอุปกรณ์ (Device Set)
                  </div>
                  <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                    จัดกลุ่มอุปกรณ์หลายชิ้นเป็นชุดเดียวกัน — เช่น เครื่องพิมพ์ + UPS + สายเครือข่าย
                    เครื่องหลัก (parent) คือเครื่องที่เป็นศูนย์กลางของชุด ส่วนอุปกรณ์อื่นๆ ที่อยู่ในชุด
                    จะอ้างอิงมาที่เครื่องหลักผ่าน parent
                  </p>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label="อุปกรณ์หลักในชุด (Parent)">
                      <Input
                        value={form.parentDeviceId}
                        onChange={(e) =>
                          setForm({ ...form, parentDeviceId: e.target.value })
                        }
                        placeholder="รหัสอุปกรณ์หลัก (เช่น 2378) — เว้นว่างถ้าเป็นเครื่องหลัก"
                      />
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        💡 ใส่รหัสทรัพย์สินของเครื่องหลัก — เครื่องนี้จะกลายเป็น "อุปกรณ์ลูก" ในชุด
                      </p>
                    </Field>

                    <Field label="ลำดับในชุด (Set Position)">
                      <Input
                        type="number"
                        min="1"
                        value={form.setPosition}
                        onChange={(e) =>
                          setForm({ ...form, setPosition: e.target.value })
                        }
                        placeholder="1, 2, 3, …"
                      />
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        ใช้สำหรับจัดเรียงลำดับเครื่องในชุด (ไม่บังคับ)
                      </p>
                    </Field>

                    <Field label="ชื่อชุด (Set Label)">
                      <Input
                        value={form.setLabel}
                        onChange={(e) =>
                          setForm({ ...form, setLabel: e.target.value })
                        }
                        placeholder="เช่น ชุดเครื่องพิมพ์ห้องจ่ายยา"
                      />
                      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                        ชื่อที่ใช้เรียกชุด — ใส่เหมือนกันทุกเครื่องในชุด
                      </p>
                    </Field>
                  </div>

                  {form.parentDeviceId && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                      ⚠️ อุปกรณ์นี้ถูกกำหนดเป็น <strong>อุปกรณ์ลูก</strong> ในชุด —
                      เมื่อย้ายเครื่องหลัก คุณสามารถเลือกให้อุปกรณ์ลูกตามไปด้วยได้จากหน้ารายละเอียด
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* ═══════════════════════════════════════════════════════
                  Tab 4: ⚙️ ขั้นสูง
                  ═══════════════════════════════════════════════════════ */}
              <TabsContent value="advanced" className="space-y-4">
                {/* ── License / Software ── */}
                <div className="rounded-lg border border-violet-200 bg-white p-4 shadow-sm dark:border-violet-900/40 dark:bg-slate-900">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">
                      🔐 License / Software
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addLicense}
                      className="border-[#f97316]/30 text-[#f97316] hover:bg-[#f97316]/10 dark:border-[#fb923c]/30 dark:text-[#fb923c]"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      เพิ่ม License
                    </Button>
                  </div>
                  {licensesLoading && (
                    <div className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                      กำลังโหลด License ที่มีอยู่...
                    </div>
                  )}
                  {form.licenses.length === 0 && !licensesLoading ? (
                    <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      ยังไม่มี License สำหรับอุปกรณ์นี้ — กด "เพิ่ม License" เพื่อเพิ่มซอฟต์แวร์
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {form.licenses.map((lic, idx) => (
                        <div
                          key={lic.id ?? `new-${idx}`}
                          className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                              License #{idx + 1}
                              {lic.id && (
                                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  {lic.id.slice(-8)}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeLicense(idx)}
                              className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                              title="ลบ License นี้"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <Field label="ซอฟต์แวร์" required>
                              <Input
                                value={lic.software}
                                onChange={(e) =>
                                  updateLicense(idx, {
                                    software: e.target.value,
                                  })
                                }
                                placeholder="เช่น Microsoft Office 2021"
                              />
                            </Field>
                            <Field label="ประเภท License">
                              <Select
                                value={lic.licenseType || '__none__'}
                                onValueChange={(v) =>
                                  updateLicense(idx, { licenseType: v === '__none__' ? '' : v })
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="— เลือกประเภท —" />
                                </SelectTrigger>
                                <SelectContent>
                                  {LICENSE_TYPE_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </Field>
                            <Field label="จำนวน Seat">
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                value={lic.quantity}
                                onChange={(e) =>
                                  updateLicense(idx, {
                                    quantity: Number(e.target.value) || 1,
                                  })
                                }
                              />
                            </Field>
                            <Field label="License ID">
                              <Input
                                value={lic.licenseId}
                                onChange={(e) =>
                                  updateLicense(idx, {
                                    licenseId: e.target.value,
                                  })
                                }
                                placeholder="รหัส License ของผู้ขาย"
                                className="font-mono text-xs"
                              />
                            </Field>
                            <Field label="License Key">
                              <Input
                                value={lic.licenseKey}
                                onChange={(e) =>
                                  updateLicense(idx, {
                                    licenseKey: e.target.value,
                                  })
                                }
                                placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                                className="font-mono text-xs"
                              />
                            </Field>
                            <Field label="วันหมดอายุ">
                              <Input
                                type="date"
                                value={lic.expiryDate}
                                onChange={(e) =>
                                  updateLicense(idx, {
                                    expiryDate: e.target.value,
                                  })
                                }
                              />
                            </Field>
                            <Field label="หมายเหตุ">
                              <Input
                                value={lic.remark}
                                onChange={(e) =>
                                  updateLicense(idx, {
                                    remark: e.target.value,
                                  })
                                }
                                placeholder="ข้อความเพิ่มเติม"
                              />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── การซื้อ / รับประกัน ── */}
                <div className="rounded-lg border border-violet-200 bg-white p-4 shadow-sm dark:border-violet-900/40 dark:bg-slate-900">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">
                    🧾 การซื้อ / รับประกัน
                  </div>
                  <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
                    <Field label="ผู้ขาย (Vendor)">
                      <Input
                        id="dev-vendor"
                        value={form.vendor}
                        onChange={(e) =>
                          setForm({ ...form, vendor: e.target.value })
                        }
                        placeholder="ชื่อบริษัท / ร้านค้า"
                      />
                    </Field>
                    <Field label="เลขที่สัญญา (Contract No)">
                      <Input
                        id="dev-contractNo"
                        value={form.contractNo}
                        onChange={(e) =>
                          setForm({ ...form, contractNo: e.target.value })
                        }
                        placeholder="เลขที่สัญญา"
                      />
                    </Field>
                    <Field label="วันที่ซื้อ">
                      <Input
                        type="date"
                        id="dev-purchaseDate"
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
                        id="dev-warrantyMonths"
                        value={form.warrantyMonths}
                        onChange={(e) =>
                          setForm({ ...form, warrantyMonths: e.target.value })
                        }
                        placeholder="12"
                      />
                    </Field>
                    <Field label="วันหมดประกัน">
                      <Input
                        type="date"
                        id="dev-warrantyEnd"
                        value={form.warrantyEnd}
                        onChange={(e) =>
                          setForm({ ...form, warrantyEnd: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="วันที่ถอดถอน">
                      <Input
                        type="date"
                        id="dev-uninstallDate"
                        value={form.uninstallDate}
                        onChange={(e) =>
                          setForm({ ...form, uninstallDate: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                </div>

                {/* ── การเงิน ── */}
                <div className="rounded-lg border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-900/40 dark:bg-slate-900">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    💰 การเงิน (ค่าเสื่อมราคา)
                  </div>
                  <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
                    <Field label="ราคาซื้อ (฿)">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        id="dev-purchasePrice"
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
                        id="dev-salvageValue"
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
                        id="dev-usefulLife"
                        value={form.usefulLife}
                        onChange={(e) =>
                          setForm({ ...form, usefulLife: e.target.value })
                        }
                        placeholder="60"
                      />
                    </Field>
                  </div>
                  <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                    📐 สูตร: (ราคาซื้อ − มูลค่าซาลเวจ) ÷ อายุการใช้งาน = ค่าเสื่อมราคาต่อเดือน
                  </div>
                </div>


                {/* ── อื่นๆ (Tech fields) ── */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    📝 อื่นๆ (ฟิลด์เทคนิค)
                  </div>
                  <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
                    <Field label="ศูนย์ต้นทุน (Cost Center)">
                      <Input
                        id="dev-costCenter"
                        value={form.costCenter}
                        onChange={(e) =>
                          setForm({ ...form, costCenter: e.target.value })
                        }
                        placeholder="ศูนย์ต้นทุน"
                      />
                    </Field>
                    <Field label="รหัสแผนก (DepartmentCode)">
                      <Input
                        id="dev-departmentCode"
                        value={form.departmentCode}
                        onChange={(e) =>
                          setForm({ ...form, departmentCode: e.target.value })
                        }
                        placeholder="รหัสแผนก (auto จากสังกัด)"
                      />
                    </Field>
                    <Field label="ParentRef" hint="ใช้สำหรับ grouping แบบเดิม เช่น HP|PRINTER">
                      <Input
                        id="dev-parentRef"
                        value={form.parentRef}
                        onChange={(e) =>
                          setForm({ ...form, parentRef: e.target.value })
                        }
                        placeholder="เช่น HP|PRINTER"
                      />
                    </Field>
                    <Field label="DisplayLabel" hint="ป้ายแสดงผลที่กำหนดเอง">
                      <Input
                        id="dev-displayLabel"
                        value={form.displayLabel}
                        onChange={(e) =>
                          setForm({ ...form, displayLabel: e.target.value })
                        }
                        placeholder="ป้ายแสดงผล"
                      />
                    </Field>
                    <Field label="หมายเหตุ (Remark)">
                      <Input
                        id="dev-remark"
                        value={form.remark}
                        onChange={(e) =>
                          setForm({ ...form, remark: e.target.value })
                        }
                        placeholder="หมายเหตุ"
                      />
                    </Field>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* ── Bottom spacing ── */}
            <div className="h-16" />
          </div>
        </div>

        {/* ── Sticky Footer (mobile-friendly save bar) ── */}
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          <Button
            variant="outline"
            type="button"
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
            {saving ? 'กำลังบันทึก...' : '💾 บันทึกอุปกรณ์'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-3 md:p-4">
      <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">จัดการอุปกรณ์</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            เพิ่ม / แก้ไข / ลบ อุปกรณ์ IT ในระบบ
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Keyboard shortcuts help — `?` anywhere opens it */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShortcutsOpen(true)}
            className="hidden text-slate-500 hover:bg-slate-100 hover:text-[#f97316] dark:text-slate-400 dark:hover:bg-slate-800 sm:inline-flex"
            title="คีย์ลัด (กด ? เพื่อเปิด)"
            aria-label="คีย์ลัด"
          >
            <Keyboard className="h-4 w-4" />
          </Button>
          {/* Primary CTA in the header — always visible without scrolling.
              On mobile it's full-width; on sm+ it's right-aligned. */}
          <Button
            type="button"
                onClick={openAdd}
            className="w-full bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950 sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            เพิ่มอุปกรณ์
          </Button>
        </div>
      </div>

      {/* ── KPI summary cards ──
          Quick stats computed from the filtered device list. Clicking a
          card applies the corresponding filter instantly. */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        <KpiCard
          label="ทั้งหมด"
          value={kpi.total}
          tone="neutral"
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
        />
        <KpiCard
          label="ใช้งานอยู่"
          value={kpi.active}
          tone="success"
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          active={statusFilter === 'active'}
          onClick={() => setStatusFilter('active')}
        />
        <KpiCard
          label="ส่งซ่อม"
          value={kpi.repair}
          tone="warning"
          icon={<Wrench className="h-3.5 w-3.5" />}
          active={statusFilter === 'repair'}
          onClick={() => setStatusFilter('repair')}
        />
        <KpiCard
          label="สำรอง"
          value={kpi.spare}
          tone="info"
          icon={<PackageOpen className="h-3.5 w-3.5" />}
          active={statusFilter === 'spare'}
          onClick={() => setStatusFilter('spare')}
        />
        <KpiCard
          label="ไม่ใช้งาน/เกษียณ"
          value={kpi.inactive}
          tone="danger"
          icon={<XCircle className="h-3.5 w-3.5" />}
          active={statusFilter === 'disposed'}
          onClick={() => setStatusFilter('disposed')}
        />
        <KpiCard
          label="รับประกันใกล้หมด"
          value={kpi.warrantyExpiringSoon}
          tone="warning"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          active={warrantyFilter === 'expiring'}
          onClick={() => setWarrantyFilter('expiring')}
        />
        <KpiCard
          label="รับประกันหมดแล้ว"
          value={kpi.warrantyExpired}
          tone="danger"
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          active={warrantyFilter === 'expired'}
          onClick={() => setWarrantyFilter('expired')}
        />
      </div>

      {/* ── Recently-viewed devices bar ──
          Shows the last 5 device IDs opened in the detail sheet, persisted
          in localStorage so they survive page reloads. Clicking opens the
          detail sheet instantly. */}
      {recentDeviceIds.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900/70">
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-slate-500 dark:text-slate-400">ล่าสุด:</span>
          {recentDeviceIds.map((id) => {
            const dev = (devices ?? []).find((d) => d.id === id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setDetailDeviceId(id)
                  pushRecentDevice(id)
                }}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700 transition-colors hover:bg-[#f97316]/10 hover:text-[#f97316] dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-[#fb923c]/10 dark:hover:text-[#fb923c]"
                title={dev ? `${dev.assetCode} — ${dev.name}` : id}
              >
                {dev ? dev.assetCode : id.slice(-6)}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => {
              setRecentDeviceIds([])
              try {
                localStorage.removeItem('itam-recent-devices')
              } catch (e) { console.error(String(e)) }
            }}
            className="ml-auto rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="ล้างรายการล่าสุด"
            title="ล้างรายการล่าสุด"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <Card className="flex min-h-0 flex-1 flex-col border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="flex min-h-0 flex-1 flex-col p-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id={searchInputId}
                  placeholder="ค้นหา Serial / รหัส / ตึก / ชั้น / หน่วยงาน / แบรนด์... (Ctrl+K)"
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
                  {(visibleSites ?? []).length === 0 && (
                    <SelectItem value="__none__" disabled>
                      — ยังไม่มีสาขาที่เข้าถึงได้ —
                    </SelectItem>
                  )}
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
                variant="outline"
                type="button"
                onClick={() => setImportOpen(true)}
                aria-label="นำเข้า CSV"
                className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">นำเข้า CSV</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => setCustomExportOpen(true)}
                disabled={exporting}
                aria-label={exporting ? 'กำลังส่งออก' : 'ส่งออกข้อมูล'}
                className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">{exporting ? 'กำลังส่งออก...' : 'ส่งออก'}</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => setStickerOpen(true)}
                disabled={(devices ?? []).length === 0}
                aria-label="พิมพ์สติกเกอร์"
                className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <Tag className="h-4 w-4" />
                <span className="hidden sm:inline">พิมพ์สติกเกอร์</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => qc.invalidateQueries({ queryKey: ["devices"] })}
                aria-label="รีเฟรช"
                className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">รีเฟรช</span>
              </Button>
              {/* Column visibility dropdown — lets the user hide columns
                  they don't need. Choice persists in localStorage. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    aria-label="เลือกคอลัมน์"
                    className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
                  >
                    <Columns3 className="h-4 w-4" />
                    <span className="hidden sm:inline">คอลัมน์</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs text-slate-500 dark:text-slate-400">
                    เลือกคอลัมน์ที่จะแสดง
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ALL_COLUMNS.map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.key}
                      checked={isColVisible(col.key)}
                      onCheckedChange={() => toggleColumn(col.key)}
                      className="text-sm"
                    >
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setHiddenColumns(new Set())
                      try {
                        localStorage.removeItem('itam-devices-hidden-cols')
                      } catch (e) { console.error(String(e)) }
                    }}
                    className="text-xs text-[#f97316] focus:text-[#f97316]"
                  >
                    รีเซ็ตเป็นค่าเริ่มต้น
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
          {/* Table — fills remaining height of the Card. overflow-x-auto for mobile horizontal scroll. */}
          <div className="itam-scroll mt-4 min-h-0 flex-1 overflow-auto overflow-x-auto rounded-md border border-slate-300 bg-white dark:border-slate-800 dark:bg-slate-900">
            <Table className="min-w-[800px]">
              <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm dark:bg-slate-900/95">
                <TableRow>
                  {hasDevices && isColVisible('assetCode') && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                        onCheckedChange={(v) => toggleSelectAll(v === true)}
                        aria-label="เลือกหน้านี้ทั้งหมด"
                        className="border-slate-300 data-[state=checked]:bg-[#f97316] data-[state=checked]:border-[#f97316] data-[state=checked]:text-white dark:border-slate-600 dark:data-[state=checked]:bg-[#f97316] dark:data-[state=checked]:border-[#f97316]"
                      />
                    </TableHead>
                  )}
                  {isColVisible('assetCode') && <TableHead className="text-slate-600 dark:text-slate-300">รหัสทรัพย์สิน</TableHead>}
                  {isColVisible('assetSiteCode') && <TableHead className="text-slate-600 dark:text-slate-300">ทะเบียน Site</TableHead>}
                  {isColVisible('type') && <TableHead className="text-slate-600 dark:text-slate-300">ประเภท</TableHead>}
                  {isColVisible('brandModel') && <TableHead className="text-slate-600 dark:text-slate-300">ยี่ห้อ/รุ่น</TableHead>}
                  {isColVisible('serialNumber') && <TableHead className="text-slate-600 dark:text-slate-300">Serial No.</TableHead>}
                  {isColVisible('location') && <TableHead className="text-slate-600 dark:text-slate-300">อาคาร/ชั้น</TableHead>}
                  {isColVisible('department') && <TableHead className="text-slate-600 dark:text-slate-300">แผนก/ตำแหน่ง</TableHead>}
                  {isColVisible('status') && <TableHead className="text-slate-600 dark:text-slate-300">สถานะ</TableHead>}
                  {isColVisible('meter') && <TableHead className="text-slate-600 dark:text-slate-300">มิเตอร์ล่าสุด</TableHead>}
                  {isColVisible('updatedAt') && <TableHead className="text-slate-600 dark:text-slate-300">อัปเดตล่าสุด</TableHead>}
                  {isColVisible('actions') && <TableHead className="text-right text-slate-600 dark:text-slate-300">การกระทำ</TableHead>}
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
                            type="button"
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
                        {isColVisible('assetCode') && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(v) => toggleSelect(d.id, v === true)}
                            aria-label={`เลือก ${d.assetCode}`}
                            className="border-slate-300 data-[state=checked]:bg-[#f97316] data-[state=checked]:border-[#f97316] data-[state=checked]:text-white dark:border-slate-600 dark:data-[state=checked]:bg-[#f97316] dark:data-[state=checked]:border-[#f97316]"
                          />
                        )}
                      </TableCell>
                      {/* รหัสทรัพย์สิน */}
                      {isColVisible('assetCode') && (
                      <TableCell className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {d.assetCode}
                      </TableCell>
                      )}
                      {/* ทะเบียน Site */}
                      {isColVisible('assetSiteCode') && (
                      <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {d.assetSiteCode || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </TableCell>
                      )}
                      {/* ประเภท */}
                      {isColVisible('type') && (
                      <TableCell className="text-slate-700 dark:text-slate-200">{d.type}</TableCell>
                      )}
                      {/* ยี่ห้อ/รุ่น */}
                      {isColVisible('brandModel') && (
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
                      )}
                      {/* Serial No. */}
                      {isColVisible('serialNumber') && (
                      <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {d.serialNumber || <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </TableCell>
                      )}
                      {/* อาคาร/ชั้น */}
                      {isColVisible('location') && (
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
                      )}
                      {/* แผนก/ตำแหน่ง */}
                      {isColVisible('department') && (
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
                      )}
                      {/* สถานะ */}
                      {isColVisible('status') && (
                      <TableCell>
                        <Badge className={statusBadgeClass(d.status)}>
                          {statusLabel(d.status)}
                        </Badge>
                      </TableCell>
                      )}
                      {/* มิเตอร์ล่าสุด */}
                      {isColVisible('meter') && (
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
                      )}
                      {/* อัปเดตล่าสุด */}
                      {isColVisible('updatedAt') && (
                      <TableCell className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDateTime(d.updatedAt)}
                      </TableCell>
                      )}
                      {/* การกระทำ */}
                      {isColVisible('actions') && (
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
                      )}
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

      {/* Custom Export — column picker + reorder + format selector (CSV/Excel/PDF) */}
      <CustomExportDialog
        open={customExportOpen}
        onOpenChange={setCustomExportOpen}
        availableColumns={EXPORT_AVAILABLE_COLUMNS}
        onExport={handleCustomExport}
        storageKey="itam-devices-export-cols"
        defaultSelectedKeys={DEVICE_CSV_HEADERS.map((h) => h.key)}
        totalRows={totalCount}
      />

      {/* Sticker print */}
      <StickerPrintDialog
        open={stickerOpen}
        onOpenChange={setStickerOpen}
        devices={devices ?? []}
        orgName={settings?.orgName ?? null}
      />

      {/* Print Template Selection — lets user choose which template to use */}
      <PrintTemplateSelectionDialog
        open={printTemplateOpen}
        onOpenChange={setPrintTemplateOpen}
        templateType="sticker"
        actionLabel="พิมพ์สติกเกอร์"
        onSelect={(template) => {
          toast.success(`เลือกเทมเพลต: ${template.name}`)
          setStickerOpen(true)
        }}
        onCreateNew={() => {
          useAppStore.getState().setActivePage('templates')
        }}
      />

      {/* ── Keyboard shortcuts dialog ──
          Opened via the keyboard icon button or by pressing `?` anywhere. */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-[#f97316]" />
              คีย์ลัด (Keyboard Shortcuts)
            </DialogTitle>
            <DialogDescription>
              เร่งการทำงานด้วยคีย์ลัดเหล่านี้ — ใช้ได้ทุกที่ในหน้าจัดการอุปกรณ์
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {[
              { keys: ['Ctrl', 'K'], desc: 'โฟกัสช่องค้นหา' },
              { keys: ['Ctrl', 'N'], desc: 'เพิ่มอุปกรณ์ใหม่' },
              { keys: ['Ctrl', 'R'], desc: 'รีเฟรชรายการ' },
              { keys: ['?'], desc: 'เปิดเมนูคีย์ลัดนี้' },
              { keys: ['Esc'], desc: 'ปิด dialog / ยกเลิกการเลือก' },
              { keys: ['Enter'], desc: 'ในช่องค้นหา → ค้นหาทันที' },
            ].map((s) => (
              <div
                key={s.desc}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="text-slate-700 dark:text-slate-300">
                  {s.desc}
                </span>
                <div className="flex items-center gap-1">
                  {s.keys.map((k) => (
                    <kbd
                      key={k}
                      className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-slate-300 bg-white px-1.5 font-mono text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── KpiCard ─────────────────────────────────────────────────────────
// A compact stat card used at the top of the devices page. Clickable so
// users can apply the corresponding filter instantly. `tone` controls the
// accent color (border-left + icon tint) so each metric is scannable.
type KpiTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'
function KpiCard({
  label,
  value,
  tone = 'neutral',
  icon,
  active,
  onClick,
}: {
  label: string
  value: number
  tone?: KpiTone
  icon?: React.ReactNode
  active?: boolean
  onClick?: () => void
}) {
  const toneClasses: Record<KpiTone, { ring: string; text: string; bg: string }> = {
    neutral: {
      ring: 'border-slate-200 dark:border-slate-800',
      text: 'text-slate-700 dark:text-slate-300',
      bg: 'bg-white dark:bg-slate-900',
    },
    success: {
      ring: 'border-emerald-200 dark:border-emerald-900/50',
      text: 'text-emerald-700 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    },
    warning: {
      ring: 'border-amber-200 dark:border-amber-900/50',
      text: 'text-amber-700 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950/30',
    },
    danger: {
      ring: 'border-rose-200 dark:border-rose-900/50',
      text: 'text-rose-700 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-950/30',
    },
    info: {
      ring: 'border-sky-200 dark:border-sky-900/50',
      text: 'text-sky-700 dark:text-sky-400',
      bg: 'bg-sky-50 dark:bg-sky-950/30',
    },
  }
  const t = toneClasses[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group relative flex flex-col gap-1 rounded-lg border p-2.5 text-left transition-all',
        'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1',
        t.bg,
        t.ring,
        active && 'ring-2 ring-[#f97316] ring-offset-1',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            'flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide',
            t.text,
          )}
        >
          {icon}
          {label}
        </span>
      </div>
      <span className="text-xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
        {value.toLocaleString('th-TH')}
      </span>
    </button>
  )
}

function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string
  children: React.ReactNode
  hint?: string
  /** When true, shows an orange asterisk next to the label and gives the
   *  wrapper a subtle orange left-border to make required fields scannable. */
  required?: boolean
}) {
  return (
    <div
      className={`flex flex-col gap-1.5 ${
        required ? 'border-l-2 border-[#f97316]/60 pl-2 dark:border-[#fb923c]/60' : ''
      }`}
    >
      <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
        {label}
        {required && (
          <span className="ml-0.5 font-semibold text-[#f97316] dark:text-[#fb923c]">*</span>
        )}
      </Label>
      {children}
      {hint && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400">{hint}</p>
      )}
    </div>
  )
}

/**
 * FormSection — a consistent card wrapper for each section of the full-page
 * form. Renders a numbered step badge + icon + title + subtitle, an optional
 * action button (e.g. "เพิ่ม License"), and the children inside a padded body.
 *
 * Accent color options:
 *   amber  → รหัสอุปกรณ์ / มิเตอร์ (amber-500)
 *   blue   → สถานที่ติดตั้ง (sky-500)
 *   emerald → ข้อมูลเครื่อง / การเงิน (emerald-500)
 *   violet → การซื้อ / License (violet-500)
 *   slate  → เครือข่าย / อื่นๆ (slate-500)
 */
function FormSection({
  step,
  icon,
  title,
  subtitle,
  accent = 'amber',
  action,
  children,
}: {
  step: number
  icon: string
  title: string
  subtitle?: string
  accent?: 'amber' | 'blue' | 'emerald' | 'violet' | 'slate'
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const accentMap: Record<string, { ring: string; text: string; badge: string }> = {
    amber: {
      ring: 'border-amber-200 dark:border-amber-900/40',
      text: 'text-amber-700 dark:text-amber-400',
      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
    },
    blue: {
      ring: 'border-sky-200 dark:border-sky-900/40',
      text: 'text-sky-700 dark:text-sky-400',
      badge: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400',
    },
    emerald: {
      ring: 'border-emerald-200 dark:border-emerald-900/40',
      text: 'text-emerald-700 dark:text-emerald-400',
      badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
    },
    violet: {
      ring: 'border-violet-200 dark:border-violet-900/40',
      text: 'text-violet-700 dark:text-violet-400',
      badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400',
    },
    slate: {
      ring: 'border-slate-200 dark:border-slate-800',
      text: 'text-slate-700 dark:text-slate-300',
      badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    },
  }
  const a = accentMap[accent] ?? accentMap.amber
  return (
    <section className={`mb-5 overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-slate-900 ${a.ring}`}>
      <header className={`flex items-start justify-between gap-3 border-b px-4 py-3 dark:border-slate-800 ${a.ring}`}>
        <div className="flex items-start gap-3">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${a.badge}`}
          >
            {step}
          </span>
          <div>
            <h3 className={`flex items-center gap-1.5 text-sm font-semibold ${a.text}`}>
              <span className="text-base">{icon}</span>
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
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
