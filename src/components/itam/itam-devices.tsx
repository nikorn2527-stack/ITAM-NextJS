'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Search, RefreshCw, ChevronLeft, ChevronRight, Package, Plus, Pencil, Trash2, Download, Eye, X, History, CheckCheck, Printer, Tag, Upload, FileSpreadsheet, FileText, Edit3, QrCode, Zap, List } from 'lucide-react'
import { downloadCsv, dateStamp, parseCsv } from '@/lib/csv'
import { ItamDeviceDetailSheet } from './itam-device-detail-sheet'
import { printSingleSticker, printBulkStickers } from './sticker-print-helpers'
import { SavedFilters, type FilterCombo } from './saved-filters'
import {
  DocumentTemplatePicker,
  getDocumentTemplateMode,
  getActiveDocumentTemplateIdForExport,
  type DocumentTemplatePickerResult,
} from './document-template-picker'
import type { DocumentRenderRow } from '@/lib/document-template'
import { useAppStore } from '@/store/app-store'
import { useAuthStore } from '@/store/auth-store'

interface Device {
  id: string; assetNo: string; deviceType: string | null; brand: string | null
  model: string | null; serial: string | null; status: string; site: string | null
  department: string | null; building: string | null; floor: string | null
  location: string | null; meterRequired: boolean; _count?: { meterReadings: number; locationHistories: number; assignments: number; maintenanceLogs: number }
  /** client-only flag: optimistic row in flight */
  __optimistic?: 'add' | 'edit' | 'delete' | null
  /** client-only: timestamp when this row was last successfully saved */
  __savedAt?: number
}
interface DevicesResponse {
  devices: Device[]; pagination: { page: number; limit: number; total: number; totalPages: number }
}

const STATUS_BADGE: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  Inactive: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
  'In Stock': 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  'Pending Repair': 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  Retired: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
}

const STATUS_OPTIONS = ['Active', 'In Stock', 'Pending Repair', 'Inactive', 'Retired']

// ============ Cascading dropdown hook ============
// Fetches distinct values for a location field, filtered by previous selections.
function useCascadingOptions(
  field: 'building' | 'floor' | 'department' | 'location',
  parents: { site?: string; building?: string; floor?: string; department?: string },
): string[] {
  const [values, setValues] = React.useState<string[]>([])
  const { site, building, floor, department } = parents
  React.useEffect(() => {
    let cancelled = false
    const params = new URLSearchParams({ field })
    if (site) params.set('site', site)
    if (building) params.set('building', building)
    if (floor) params.set('floor', floor)
    if (department) params.set('department', department)
    fetch(`/api/itam/devices/cascading?${params}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((j: { values: string[] }) => { if (!cancelled) setValues(j.values ?? []) })
      .catch(() => { if (!cancelled) setValues([]) })
    return () => { cancelled = true }
  }, [field, site, building, floor, department])
  return values
}

// ============ Sites list hook ============
function useSitesList(): string[] {
  const [sites, setSites] = React.useState<string[]>([])
  React.useEffect(() => {
    fetch('/api/itam/sites')
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((j: { sites: Array<{ siteName: string | null }> }) => {
        const names = j.sites.map((s) => s.siteName).filter((s): s is string => !!s)
        setSites(names)
      })
      .catch(() => setSites([]))
  }, [])
  return sites
}

type DeviceForm = {
  assetNo: string; deviceType: string; brand: string; model: string; serial: string
  building: string; floor: string; department: string; location: string; departmentCode: string
  status: string; site: string; contractNo: string; ip: string; mac: string; remoteId: string
  vendor: string; installDate: string; warrantyEnd: string; deviceGroup: string; costCenter: string
  meterRequired: boolean; meterMode: string; assetSiteCode: string; remark: string
}

const EMPTY_FORM: DeviceForm = {
  assetNo: '', deviceType: '', brand: '', model: '', serial: '',
  building: '', floor: '', department: '', location: '', departmentCode: '',
  status: 'Active', site: '', contractNo: '', ip: '', mac: '', remoteId: '',
  vendor: '', installDate: '', warrantyEnd: '', deviceGroup: '', costCenter: '',
  meterRequired: false, meterMode: 'TOTAL', assetSiteCode: '', remark: '',
}

const CSV_HEADERS = [
  { key: 'assetNo', label: 'รหัสสินทรัพย์' },
  { key: 'deviceType', label: 'ประเภท' },
  { key: 'brand', label: 'แบรนด์' },
  { key: 'model', label: 'รุ่น' },
  { key: 'serial', label: 'Serial' },
  { key: 'status', label: 'สถานะ' },
  { key: 'site', label: 'สาขา' },
  { key: 'building', label: 'อาคาร' },
  { key: 'floor', label: 'ชั้น' },
  { key: 'department', label: 'แผนก' },
  { key: 'departmentCode', label: 'รหัสแผนก' },
  { key: 'location', label: 'ที่ตั้ง' },
  { key: 'deviceGroup', label: 'กลุ่ม' },
  { key: 'costCenter', label: 'Cost Center' },
  { key: 'contractNo', label: 'เลขสัญญา' },
  { key: 'vendor', label: 'ผู้ขาย' },
  { key: 'ip', label: 'IP' },
  { key: 'mac', label: 'MAC' },
  { key: 'remoteId', label: 'Remote ID' },
  { key: 'installDate', label: 'วันติดตั้ง' },
  { key: 'warrantyEnd', label: 'วันหมดประกัน' },
  { key: 'meterRequired', label: 'ต้องจดมิเตอร์' },
  { key: 'meterMode', label: 'โหมดมิเตอร์' },
  { key: 'assetSiteCode', label: 'Asset Site Code' },
  { key: 'remark', label: 'หมายเหตุ' },
]

// ============ Search debounce hook (200ms) ============
function useDebounced<T>(value: T, delayMs = 200): [T, boolean] {
  const [debounced, setDebounced] = React.useState<T>(value)
  const [isPending, setIsPending] = React.useState(false)
  React.useEffect(() => {
    setIsPending(true)
    const t = setTimeout(() => {
      setDebounced(value)
      setIsPending(false)
    }, delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return [debounced, isPending]
}

// ============ Highlight matched text ============
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text || '—'}</>
  const q = query.trim()
  // Escape regex special chars
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = (text || '').split(new RegExp(`(${esc})`, 'ig'))
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.toLowerCase()
          ? <mark key={i} className="rounded bg-orange-200 px-0.5 text-slate-900 dark:bg-orange-500/60 dark:text-white">{p}</mark>
          : <React.Fragment key={i}>{p}</React.Fragment>,
      )}
    </>
  )
}

// ============ Recent searches (localStorage) ============
const RECENT_KEY = 'itam-recent-searches'
function loadRecent(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, 6) : []
  } catch {
    return []
  }
}
function saveRecent(q: string) {
  if (typeof window === 'undefined' || !q.trim()) return
  try {
    const cur = loadRecent()
    const next = [q.trim(), ...cur.filter((x) => x !== q.trim())].slice(0, 6)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
}

export function ItamDevices() {
  const qc = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [debouncedSearch, searchPending] = useDebounced(search, 200)
  const [status, setStatus] = React.useState('all')
  const [deviceType, setDeviceType] = React.useState('all')
  const [page, setPage] = React.useState(1)
  // Virtual scroll toggle — when ON, fetch 500 rows in one shot and virtualize
  // (so 2,378+ devices scroll smoothly). Persisted in localStorage.
  const [virtualScroll, setVirtualScroll] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return window.localStorage.getItem('itam.virtual-scroll') === '1' } catch { return false }
  })
  React.useEffect(() => {
    try { window.localStorage.setItem('itam.virtual-scroll', virtualScroll ? '1' : '0') } catch { /* ignore */ }
  }, [virtualScroll])
  // Adaptive limit: virtual mode → 2000 rows in one shot (handles the full
  // 2,378-device dataset); standard mode → 20 with pagination.
  const limit = React.useMemo(() => virtualScroll ? 2000 : 20, [virtualScroll])
  // Reset page when toggling virtual mode (different page sizes)
  React.useEffect(() => { setPage(1) }, [virtualScroll])

  // QR scanner trigger (singleton dialog mounted at the app shell)
  const setQrScannerOpen = useAppStore((s) => s.setQrScannerOpen)

  // Search metrics (Yms)
  const [searchStartedAt, setSearchStartedAt] = React.useState<number | null>(null)
  const [searchMs, setSearchMs] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (search) setSearchStartedAt(Date.now())
    else { setSearchStartedAt(null); setSearchMs(null) }
  }, [search])

  // Recent searches
  const [recent, setRecent] = React.useState<string[]>([])
  React.useEffect(() => { setRecent(loadRecent()) }, [])
  function commitRecent(q: string) {
    saveRecent(q)
    setRecent(loadRecent())
  }

  // Drill-down from dashboard
  const pendingDeviceType = useAppStore((s) => s.pendingDeviceType)
  const pendingDeviceStatus = useAppStore((s) => s.pendingDeviceStatus)
  const clearPendingDeviceType = useAppStore((s) => s.clearPendingDeviceType)
  const clearPendingDeviceStatus = useAppStore((s) => s.clearPendingDeviceStatus)
  React.useEffect(() => {
    if (pendingDeviceType) {
      setDeviceType(pendingDeviceType)
      setPage(1)
      clearPendingDeviceType()
    }
    if (pendingDeviceStatus) {
      setStatus(pendingDeviceStatus)
      setPage(1)
      clearPendingDeviceStatus()
    }
  }, [pendingDeviceType, pendingDeviceStatus, clearPendingDeviceType, clearPendingDeviceStatus])

  // Detail sheet
  const [detailAssetNo, setDetailAssetNo] = React.useState<string | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  // CRUD dialog
  const [crudOpen, setCrudOpen] = React.useState(false)
  const [editAssetNo, setEditAssetNo] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<DeviceForm>(EMPTY_FORM)

  // Delete confirm
  const [deleteAssetNo, setDeleteAssetNo] = React.useState<string | null>(null)

  // Track rows that just saved (for the "✓ บันทึกแล้ว" badge)
  const [savedAssetNos, setSavedAssetNos] = React.useState<Set<string>>(new Set())
  function flashSaved(assetNo: string) {
    setSavedAssetNos((prev) => {
      const next = new Set(prev)
      next.add(assetNo)
      return next
    })
    setTimeout(() => {
      setSavedAssetNos((prev) => {
        const next = new Set(prev)
        next.delete(assetNo)
        return next
      })
    }, 2000)
  }

  // CSV export
  const [exporting, setExporting] = React.useState(false)

  // Sticker selection state (for bulk print)
  const [selectedAssetNos, setSelectedAssetNos] = React.useState<Set<string>>(new Set())
  const [stickerPrinting, setStickerPrinting] = React.useState(false)

  // Import dialog state
  const [importOpen, setImportOpen] = React.useState(false)
  const [importText, setImportText] = React.useState('')
  const [importMode, setImportMode] = React.useState<'upsert' | 'create_only' | 'update_only'>('upsert')
  const [importing, setImporting] = React.useState(false)
  const [importResult, setImportResult] = React.useState<{
    inserted: number; updated: number; errors: Array<{ row: number; assetNo: string; error: string }>; total: number
  } | null>(null)

  // Bulk-edit dialog state
  const [bulkEditOpen, setBulkEditOpen] = React.useState(false)
  const [bulkEditForm, setBulkEditForm] = React.useState<{
    status: string; site: string; building: string; floor: string; department: string
  }>({ status: '', site: '', building: '', floor: '', department: '' })
  const [bulkSaving, setBulkSaving] = React.useState(false)
  const [bulkProgress, setBulkProgress] = React.useState<{ done: number; total: number } | null>(null)

  // Excel/PDF export status
  const [excelExporting, setExcelExporting] = React.useState(false)
  const [pdfExporting, setPdfExporting] = React.useState(false)

  // Document Template Picker state
  const [docTplPickerOpen, setDocTplPickerOpen] = React.useState(false)
  const [docTplPickerTarget, setDocTplPickerTarget] = React.useState<'export' | 'custom' | null>(null)
  // Cached devices fetched before showing the picker — used to render after the user picks a template
  const docTplPendingDevicesRef = React.useRef<Device[] | null>(null)
  // Cached columns (for custom export)
  const docTplPendingColumnsRef = React.useRef<typeof CSV_HEADERS | null>(null)

  // Auth-driven permissions
  const authUser = useAuthStore((s) => s.user)
  const canEdit = !!authUser && ['DEVICE_EDIT', 'DEVICE_DELETE', 'DEVICE_TRANSFER'].some((p) => authUser.permissions.includes(p as never))

  // Cascading dropdown options — re-fetch when parent selections change
  const sites = useSitesList()
  const buildingOptions = useCascadingOptions('building', { site: form.site })
  const floorOptions = useCascadingOptions('floor', { site: form.site, building: form.building })
  const departmentOptions = useCascadingOptions('department', { site: form.site, building: form.building, floor: form.floor })
  const locationOptions = useCascadingOptions('location', { site: form.site, building: form.building, floor: form.floor, department: form.department })
  // Bulk-edit dialog also uses cascading dropdowns
  const bulkBuildingOptions = useCascadingOptions('building', { site: bulkEditForm.site })
  const bulkFloorOptions = useCascadingOptions('floor', { site: bulkEditForm.site, building: bulkEditForm.building })
  const bulkDepartmentOptions = useCascadingOptions('department', { site: bulkEditForm.site, building: bulkEditForm.building, floor: bulkEditForm.floor })

  function toggleSelectAssetNo(assetNo: string) {
    setSelectedAssetNos((prev) => {
      const next = new Set(prev)
      if (next.has(assetNo)) next.delete(assetNo)
      else next.add(assetNo)
      return next
    })
  }

  function toggleSelectAllOnPage(checked: boolean) {
    setSelectedAssetNos((prev) => {
      const next = new Set(prev)
      if (checked) {
        for (const d of devices) next.add(d.assetNo)
      } else {
        for (const d of devices) next.delete(d.assetNo)
      }
      return next
    })
  }

  // Reset selection when search/filter changes
  React.useEffect(() => {
    setSelectedAssetNos(new Set())
  }, [debouncedSearch, status, deviceType, page])

  async function handleSingleStickerPrint(assetNo: string) {
    setStickerPrinting(true)
    try {
      await printSingleSticker(assetNo)
      toast.success(`เตรียมสติกเกอร์สำหรับ ${assetNo} แล้ว`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'พิมพ์สติกเกอร์ไม่สำเร็จ')
    } finally {
      setStickerPrinting(false)
    }
  }

  async function handleBulkStickerPrint() {
    if (selectedAssetNos.size === 0) {
      toast.error('กรุณาเลือกอุปกรณ์อย่างน้อย 1 เครื่อง')
      return
    }
    setStickerPrinting(true)
    try {
      const assetNos = Array.from(selectedAssetNos)
      const n = await printBulkStickers(assetNos)
      toast.success(`เตรียมสติกเกอร์ ${n} ใบแล้ว`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'พิมพ์สติกเกอร์ไม่สำเร็จ')
    } finally {
      setStickerPrinting(false)
    }
  }

  // Unique types from current page data (for filter dropdown)
  const queryKey = React.useMemo(
    () => ['itam-devices', debouncedSearch, status, deviceType, page, limit] as const,
    [debouncedSearch, status, deviceType, page, limit],
  )

  const { data, isLoading, isFetching } = useQuery<DevicesResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (status !== 'all') params.set('status', status)
      if (deviceType !== 'all') params.set('type', deviceType)
      const res = await fetch(`/api/itam/devices?${params}`)
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    placeholderData: keepPreviousData,
  })

  // Compute search duration when data arrives
  React.useEffect(() => {
    if (searchStartedAt !== null && data) {
      setSearchMs(Date.now() - searchStartedAt)
    }
  }, [data, searchStartedAt])

  // ===== Mutations with optimistic UI =====

  // Helper: cast query data for cache manipulation
  type DevicesQueryData = DevicesResponse

  function onSearch(val: string) {
    setSearch(val)
    setPage(1)
  }

  function openAdd() {
    setEditAssetNo(null)
    setForm(EMPTY_FORM)
    setCrudOpen(true)
  }

  function openEdit(assetNo: string) {
    setEditAssetNo(assetNo)
    fetch(`/api/itam/devices/${assetNo}`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then((j: { device: Device & Record<string, unknown> }) => {
        const d = j.device
        setForm({
          assetNo: d.assetNo, deviceType: d.deviceType || '', brand: d.brand || '', model: d.model || '',
          serial: d.serial || '', building: d.building || '', floor: d.floor || '',
          department: d.department || '', location: d.location || '', departmentCode: d.departmentCode || '',
          status: d.status, site: d.site || '', contractNo: (d as { contractNo?: string }).contractNo || '',
          ip: (d as { ip?: string }).ip || '', mac: (d as { mac?: string }).mac || '',
          remoteId: (d as { remoteId?: string }).remoteId || '',
          vendor: (d as { vendor?: string }).vendor || '',
          installDate: (d as { installDate?: string }).installDate || '',
          warrantyEnd: (d as { warrantyEnd?: string }).warrantyEnd || '',
          deviceGroup: (d as { deviceGroup?: string }).deviceGroup || '',
          costCenter: (d as { costCenter?: string }).costCenter || '',
          meterRequired: d.meterRequired, meterMode: (d as { meterMode?: string }).meterMode || 'TOTAL',
          assetSiteCode: (d as { assetSiteCode?: string }).assetSiteCode || '',
          remark: d.remark || '',
        })
        setCrudOpen(true)
      })
      .catch(() => toast.error('โหลดข้อมูลไม่สำเร็จ'))
  }

  // === ADD mutation (optimistic) ===
  const addMutation = useMutation({
    mutationFn: async (payload: DeviceForm) => {
      const res = await fetch('/api/itam/devices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed')
      }
      return res.json() as Promise<{ device: Device }>
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ['itam-devices'] })
      const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const optimisticDevice: Device = {
        id: tempId,
        assetNo: payload.assetNo,
        deviceType: payload.deviceType || null,
        brand: payload.brand || null,
        model: payload.model || null,
        serial: payload.serial || null,
        status: payload.status || 'Active',
        site: payload.site || null,
        department: payload.department || null,
        building: payload.building || null,
        floor: payload.floor || null,
        location: payload.location || null,
        meterRequired: payload.meterRequired,
        _count: { meterReadings: 0, locationHistories: 0, assignments: 0, maintenanceLogs: 0 },
        __optimistic: 'add',
      }
      // Snapshot for rollback
      const snapshots = qc.getQueriesData<DevicesQueryData>({ queryKey: ['itam-devices'] })
      qc.setQueriesData<DevicesQueryData>({ queryKey: ['itam-devices'] }, (old) => {
        if (!old) return old
        return {
          ...old,
          devices: [optimisticDevice, ...old.devices],
          pagination: { ...old.pagination, total: old.pagination.total + 1 },
        }
      })
      return { snapshots }
    },
    onError: (err, _payload, ctx) => {
      // Rollback
      if (ctx?.snapshots) {
        for (const [key, val] of ctx.snapshots) {
          qc.setQueryData(key, val)
        }
      }
      toast.error(err instanceof Error ? err.message : 'เพิ่มไม่สำเร็จ')
    },
    onSettled: (_d, _e, payload) => {
      qc.invalidateQueries({ queryKey: ['itam-devices'] })
      qc.invalidateQueries({ queryKey: ['itam-dashboard'] })
      flashSaved(payload.assetNo)
      toast.success('เพิ่มอุปกรณ์แล้ว')
    },
  })

  // === EDIT mutation (optimistic, in-place update) ===
  const editMutation = useMutation({
    mutationFn: async ({ assetNo, payload }: { assetNo: string; payload: DeviceForm }) => {
      const res = await fetch(`/api/itam/devices/${assetNo}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed')
      }
      return res.json() as Promise<{ device: Device }>
    },
    onMutate: async ({ assetNo, payload }) => {
      await qc.cancelQueries({ queryKey: ['itam-devices'] })
      const snapshots = qc.getQueriesData<DevicesQueryData>({ queryKey: ['itam-devices'] })
      qc.setQueriesData<DevicesQueryData>({ queryKey: ['itam-devices'] }, (old) => {
        if (!old) return old
        return {
          ...old,
          devices: old.devices.map((d) =>
            d.assetNo === assetNo
              ? {
                  ...d,
                  deviceType: payload.deviceType || d.deviceType,
                  brand: payload.brand || d.brand,
                  model: payload.model || d.model,
                  status: payload.status || d.status,
                  site: payload.site || d.site,
                  department: payload.department || d.department,
                  meterRequired: payload.meterRequired,
                  __optimistic: 'edit',
                }
              : d,
          ),
        }
      })
      return { snapshots }
    },
    onError: (err, _v, ctx) => {
      if (ctx?.snapshots) {
        for (const [key, val] of ctx.snapshots) {
          qc.setQueryData(key, val)
        }
      }
      toast.error(err instanceof Error ? err.message : 'แก้ไขไม่สำเร็จ')
    },
    onSettled: (_d, _e, { assetNo }) => {
      qc.invalidateQueries({ queryKey: ['itam-devices'] })
      qc.invalidateQueries({ queryKey: ['itam-dashboard'] })
      flashSaved(assetNo)
      toast.success('แก้ไขอุปกรณ์แล้ว')
    },
  })

  // === DELETE mutation (optimistic, fade out + remove) ===
  const deleteMutation = useMutation({
    mutationFn: async (assetNo: string) => {
      const res = await fetch(`/api/itam/devices/${assetNo}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed')
      }
      return { assetNo }
    },
    onMutate: async (assetNo) => {
      await qc.cancelQueries({ queryKey: ['itam-devices'] })
      const snapshots = qc.getQueriesData<DevicesQueryData>({ queryKey: ['itam-devices'] })
      qc.setQueriesData<DevicesQueryData>({ queryKey: ['itam-devices'] }, (old) => {
        if (!old) return old
        return {
          ...old,
          devices: old.devices.filter((d) => d.assetNo !== assetNo),
          pagination: { ...old.pagination, total: Math.max(0, old.pagination.total - 1) },
        }
      })
      return { snapshots }
    },
    onError: (err, _v, ctx) => {
      if (ctx?.snapshots) {
        for (const [key, val] of ctx.snapshots) {
          qc.setQueryData(key, val)
        }
      }
      toast.error(err instanceof Error ? err.message : 'ลบไม่สำเร็จ')
    },
    onSettled: (_d, _e, assetNo) => {
      qc.invalidateQueries({ queryKey: ['itam-devices'] })
      qc.invalidateQueries({ queryKey: ['itam-dashboard'] })
      toast.success(`ลบ ${assetNo} แล้ว`)
    },
  })

  async function saveDevice() {
    if (!form.assetNo.trim()) {
      toast.error('กรุณากรอกรหัสสินทรัพย์')
      return
    }
    const payload = { ...form }
    setCrudOpen(false)
    try {
      if (editAssetNo) {
        editMutation.mutate({ assetNo: editAssetNo, payload })
      } else {
        addMutation.mutate(payload)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  function confirmDelete() {
    if (!deleteAssetNo) return
    const an = deleteAssetNo
    setDeleteAssetNo(null)
    deleteMutation.mutate(an)
  }

  // Commit recent search when search is non-empty AND user blurs / presses Enter
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && search.trim()) {
      commitRecent(search.trim())
    }
  }
  function onSearchBlur() {
    if (search.trim()) commitRecent(search.trim())
  }

  async function exportCsv() {
    try {
      setExporting(true)
      toast.info('กำลังดึงข้อมูลทั้งหมด...')
      const res = await fetch('/api/itam/devices?limit=100')
      if (!res.ok) throw new Error('Failed')
      const j: DevicesResponse = await res.json()
      const rows = j.devices.map(d => ({
        assetNo: d.assetNo, deviceType: d.deviceType || '', brand: d.brand || '',
        model: d.model || '', serial: d.serial || '', status: d.status,
        site: d.site || '', building: d.building || '', floor: d.floor || '',
        department: d.department || '', departmentCode: '', location: d.location || '',
        deviceGroup: '', costCenter: '', contractNo: '', vendor: '',
        ip: '', mac: '', remoteId: '', installDate: '', warrantyEnd: '',
        meterRequired: d.meterRequired ? 'Yes' : 'No', meterMode: '', assetSiteCode: '',
        remark: '',
      }))
      downloadCsv(`devices-${dateStamp()}.csv`, rows, CSV_HEADERS)
      toast.success(`ส่งออก ${rows.length} เครื่อง`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ส่งออกไม่สำเร็จ')
    } finally {
      setExporting(false)
    }
  }

  // ── Excel export: builds an HTML table and exports as .xls (Excel opens it natively)
  async function exportExcel() {
    try {
      setExcelExporting(true)
      toast.info('กำลังดึงข้อมูลทั้งหมด...')
      const res = await fetch('/api/itam/devices?limit=100')
      if (!res.ok) throw new Error('Failed')
      const j: DevicesResponse = await res.json()
      const rows = j.devices
      const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
      const headerHtml = CSV_HEADERS.map((h) => `<th style="background:#f97316;color:#fff;padding:6px;border:1px solid #ddd;font-weight:600">${esc(h.label)}</th>`).join('')
      const bodyHtml = rows.map((d) => {
        const cells = CSV_HEADERS.map((h) => {
          const v = (d as Record<string, unknown>)[h.key]
          const text = h.key === 'meterRequired' ? (d.meterRequired ? 'Yes' : 'No') : (v ?? '')
          return `<td style="padding:5px;border:1px solid #e2e8f0;mso-number-format:'\\@'">${esc(text)}</td>`
        }).join('')
        return `<tr>${cells}</tr>`
      }).join('')
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table style="border-collapse:collapse;font-family:'Tahoma',sans-serif;font-size:11px"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></body></html>`
      const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `devices-${dateStamp()}.xls`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`ส่งออก Excel ${rows.length} เครื่อง`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ส่งออก Excel ไม่สำเร็จ')
    } finally {
      setExcelExporting(false)
    }
  }

  // ── Map Device → DocumentRenderRow (for the document-template renderer)
  function deviceToRenderRow(d: Device, idx: number): DocumentRenderRow {
    const dev = d as Device & { vendor?: string | null; contractNo?: string | null; remark?: string | null }
    return {
      no: idx + 1,
      brand: d.brand ?? '',
      model: d.model ?? '',
      serial: d.serial ?? '',
      buildingFloor: `${d.building ?? ''}/${d.floor ?? ''}`,
      building: d.building ?? '',
      floor: d.floor ?? '',
      department: d.department ?? '',
      location: d.location ?? '',
      site: d.site ?? '',
      status: d.status,
      vendor: dev.vendor ?? '',
      remark: dev.remark ?? '',
    }
  }

  // ── Render PDF using a Document Template (calls /api/itam/document-templates/render)
  async function exportPdfWithTemplate(
    devices: Device[],
    templateId: string,
    title: string,
  ): Promise<void> {
    const rows = devices.map((d, i) => deviceToRenderRow(d, i))
    const res = await fetch('/api/itam/document-templates/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId,
        data: {
          title,
          rows,
          siteName: devices[0]?.site ?? '',
        },
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error || 'Render failed')
    }
    const j = (await res.json()) as { html: string; totalPages: number }
    const win = window.open('', '_blank', 'width=1000,height=1200')
    if (!win) {
      toast.warning('เบราว์เซอร์บล็อกป๊อปอัป — กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง')
      return
    }
    win.document.open()
    win.document.write(j.html)
    win.document.close()
    toast.success(`กำลังเปิดหน้าพิมพ์รายงาน PDF (${j.totalPages} หน้า)...`)
  }

  // ── PDF export: opens a print window with a professional table layout.
  // If document templates are enabled, shows the template picker first.
  async function exportPdf() {
    try {
      setPdfExporting(true)
      toast.info('กำลังดึงข้อมูลทั้งหมด...')
      const res = await fetch('/api/itam/devices?limit=100')
      if (!res.ok) throw new Error('Failed')
      const j: DevicesResponse = await res.json()
      const rows = j.devices

      // ── Check if document templates are enabled ────────────────────
      const tplMode = await getDocumentTemplateMode()
      if (tplMode === 'single') {
        // Only 1 template → use it directly (no picker)
        const tplId = await getActiveDocumentTemplateIdForExport()
        if (tplId) {
          await exportPdfWithTemplate(rows, tplId, 'รายงานอุปกรณ์ ITAM')
          return
        }
      } else if (tplMode === 'multi') {
        // Multiple templates → show the picker — actual render happens in
        // handleDocTplPickerSelect after the user picks a template.
        docTplPendingDevicesRef.current = rows
        docTplPendingColumnsRef.current = null
        setDocTplPickerTarget('export')
        setDocTplPickerOpen(true)
        toast.info('เลือกเทมเพลตเอกสาร PDF')
        return
      }

      // ── Standard layout (no template) ──────────────────────────────
      await exportPdfStandard(rows)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ส่งออก PDF ไม่สำเร็จ')
    } finally {
      setPdfExporting(false)
    }
  }

  // Standard PDF layout (legacy behavior — used when templates disabled
  // OR when the user explicitly picks "Use standard layout" in the picker)
  async function exportPdfStandard(rows: Device[]) {
    const win = window.open('', '_blank', 'width=1000,height=1200')
    if (!win) {
      toast.warning('เบราว์เซอร์บล็อกป๊อปอัป — กรุณาอนุญาตป๊อปอัปแล้วลองอีกครั้ง')
      return
    }
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
    const generatedAt = new Date().toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })
    const headCells = ['รหัส', 'ประเภท', 'แบรนด์/รุ่น', 'Serial', 'สถานะ', 'สาขา', 'อาคาร', 'ชั้น', 'แผนก', 'ที่ตั้ง', 'มิเตอร์']
      .map((h) => `<th>${esc(h)}</th>`).join('')
    const bodyRows = rows.map((d) => {
      return `<tr>
        <td class="mono">${esc(d.assetNo)}</td>
        <td>${esc(d.deviceType || '')}</td>
        <td>${esc(d.brand || '')} ${esc(d.model || '')}</td>
        <td class="mono">${esc(d.serial || '')}</td>
        <td>${esc(d.status)}</td>
        <td>${esc(d.site || '')}</td>
        <td>${esc(d.building || '')}</td>
        <td>${esc(d.floor || '')}</td>
        <td>${esc(d.department || '')}</td>
        <td>${esc(d.location || '')}</td>
        <td class="ctr">${d.meterRequired ? '✓' : '—'}</td>
      </tr>`
    }).join('')
    const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ITAM Devices Report</title>
<style>
@page { size: A4 landscape; margin: 12mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; font-family: 'Sukhumvit Set', 'Thonburi', 'Tahoma', sans-serif; color: #1e293b; font-size: 11px; line-height: 1.4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.header { border-bottom: 3px solid #f97316; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start; }
.header .org { font-size: 18px; font-weight: 700; color: #0f172a; }
.header .subtitle { font-size: 12px; color: #475569; margin-top: 2px; }
.header .meta { text-align: right; font-size: 11px; color: #64748b; }
table { width: 100%; border-collapse: collapse; margin-top: 4px; }
th, td { border: 1px solid #e2e8f0; padding: 5px 6px; text-align: left; vertical-align: top; }
th { background: #f97316; color: white; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
td.mono, th.mono { font-family: monospace; font-size: 10px; }
td.ctr, th.ctr { text-align: center; }
tr:nth-child(even) td { background: #fafbfc; }
.print-btn { position: fixed; top: 12px; right: 12px; background: #f97316; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }
.print-btn:hover { background: #ea580c; }
.footer { margin-top: 14px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
.footer .brand { color: #f97316; font-weight: 700; letter-spacing: 0.04em; }
@media print { .no-print { display: none; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } thead { display: table-header-group; } }
</style></head><body>
<button class="print-btn no-print" onclick="window.print()">🖨 พิมพ์ / บันทึก PDF</button>
<div class="header">
  <div><div class="org">PNG TEAM</div><div class="subtitle">ITAM Devices Report — ${rows.length} เครื่อง</div></div>
  <div class="meta"><div>วันที่ออกรายงาน: ${esc(generatedAt)}</div></div>
</div>
<table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>
<div class="footer"><div><span class="brand">PNG TEAM</span> — IT Asset Management</div><div>หน้า 1 · ${esc(generatedAt)}</div></div>
<script>window.addEventListener('load', function () { setTimeout(function () { try { window.print(); } catch (e) {} }, 250); });</script>
</body></html>`
    win.document.open()
    win.document.write(html)
    win.document.close()
    toast.success('กำลังเปิดหน้าพิมพ์รายงาน PDF...')
  }

  // ── Handle the result from the document template picker ──────────────
  async function handleDocTplPickerSelect(result: DocumentTemplatePickerResult | null) {
    const devices = docTplPendingDevicesRef.current
    const target = docTplPickerTarget
    // Clear cached state
    docTplPendingDevicesRef.current = null
    docTplPendingColumnsRef.current = null
    setDocTplPickerTarget(null)

    if (!result || !devices || !target) return

    try {
      if (target === 'export') {
        setPdfExporting(true)
        if (result.mode === 'template' && result.templateId) {
          await exportPdfWithTemplate(devices, result.templateId, 'รายงานอุปกรณ์ ITAM')
        } else {
          await exportPdfStandard(devices)
        }
      } else if (target === 'custom') {
        setCustomExporting(true)
        if (result.mode === 'template' && result.templateId) {
          await exportPdfWithTemplate(devices, result.templateId, 'รายงานอุปกรณ์ ITAM (Custom)')
        } else {
          // Use the standard custom-export PDF (legacy behavior)
          await exportCustomPdfStandard(devices, docTplPendingColumnsRef.current ?? CSV_HEADERS)
        }
        setCustomExportOpen(false)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ส่งออก PDF ไม่สำเร็จ')
    } finally {
      setPdfExporting(false)
      setCustomExporting(false)
    }
  }

  // ── Custom Export (เลือกคอลัมน์เอง + เลือก format CSV/Excel/PDF)
  const [customExportOpen, setCustomExportOpen] = React.useState(false)
  const [selectedColumns, setSelectedColumns] = React.useState<string[]>(
    () => JSON.parse(localStorage.getItem('itam.customExportColumns') || 'null') || CSV_HEADERS.map(h => h.key)
  )
  const [customExporting, setCustomExporting] = React.useState(false)

  function toggleColumn(key: string) {
    setSelectedColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  function selectAllColumns() { setSelectedColumns(CSV_HEADERS.map(h => h.key)) }

  async function customExport(format: 'csv' | 'excel' | 'pdf') {
    if (selectedColumns.length === 0) { toast.error('กรุณาเลือกอย่างน้อย 1 คอลัมน์'); return }
    try {
      setCustomExporting(true)
      toast.info('กำลังดึงข้อมูลทั้งหมด...')
      const res = await fetch('/api/itam/devices?limit=2000')
      if (!res.ok) throw new Error('Failed')
      const j: DevicesResponse = await res.json()
      const rows = j.devices
      const cols = CSV_HEADERS.filter(h => selectedColumns.includes(h.key))
      localStorage.setItem('itam.customExportColumns', JSON.stringify(selectedColumns))

      if (format === 'csv') {
        const exportRows = rows.map(d => {
          const row: Record<string, unknown> = {}
          cols.forEach(h => {
            const v = (d as Record<string, unknown>)[h.key]
            row[h.key] = h.key === 'meterRequired' ? (d.meterRequired ? 'Yes' : 'No') : (v ?? '')
          })
          return row
        })
        downloadCsv(`devices-custom-${dateStamp()}.csv`, exportRows, cols)
        toast.success(`ส่งออก CSV ${rows.length} เครื่อง (${cols.length} คอลัมน์)`)
      } else if (format === 'excel') {
        const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
        const headerHtml = cols.map(h => `<th style="background:#f97316;color:#fff;padding:6px;border:1px solid #ddd;font-weight:600">${esc(h.label)}</th>`).join('')
        const bodyHtml = rows.map(d => {
          const cells = cols.map(h => {
            const v = (d as Record<string, unknown>)[h.key]
            const text = h.key === 'meterRequired' ? (d.meterRequired ? 'Yes' : 'No') : (v ?? '')
            return `<td style="padding:5px;border:1px solid #e2e8f0;mso-number-format:'\\@'">${esc(text)}</td>`
          }).join('')
          return `<tr>${cells}</tr>`
        }).join('')
        const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table style="border-collapse:collapse;font-family:'Tahoma',sans-serif;font-size:11px"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></body></html>`
        const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `devices-custom-${dateStamp()}.xls`; a.click()
        URL.revokeObjectURL(url)
        toast.success(`ส่งออก Excel ${rows.length} เครื่อง (${cols.length} คอลัมน์)`)
      } else if (format === 'pdf') {
        // ── Check if document templates are enabled ─────────────────
        const tplMode = await getDocumentTemplateMode()
        if (tplMode === 'single') {
          // Only 1 template → use it directly (no picker)
          const tplId = await getActiveDocumentTemplateIdForExport()
          if (tplId) {
            await exportPdfWithTemplate(rows, tplId, 'รายงานอุปกรณ์ ITAM (Custom)')
            setCustomExportOpen(false)
            return
          }
        } else if (tplMode === 'multi') {
          // Multiple templates → show the picker — actual render
          // happens in handleDocTplPickerSelect after the user picks.
          docTplPendingDevicesRef.current = rows
          docTplPendingColumnsRef.current = cols
          setDocTplPickerTarget('custom')
          setDocTplPickerOpen(true)
          toast.info('เลือกเทมเพลตเอกสาร PDF')
          return
        }
        // Standard custom-export PDF (legacy behavior)
        await exportCustomPdfStandard(rows, cols)
      }
      setCustomExportOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ส่งออกไม่สำเร็จ')
    } finally {
      setCustomExporting(false)
    }
  }

  // Standard custom-export PDF (legacy behavior — used when templates
  // disabled OR when the user picks "Use standard layout" in the picker)
  async function exportCustomPdfStandard(
    rows: Device[],
    cols: typeof CSV_HEADERS,
  ): Promise<void> {
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
    const generatedAt = new Date().toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short' })
    const headCells = cols.map(h => `<th>${esc(h.label)}</th>`).join('')
    const bodyRows = rows.map(d => {
      const cells = cols.map(h => {
        const v = (d as Record<string, unknown>)[h.key]
        const text = h.key === 'meterRequired' ? (d.meterRequired ? '✓' : '—') : (v ?? '')
        return `<td>${esc(text)}</td>`
      }).join('')
      return `<tr>${cells}</tr>`
    }).join('')
    const win = window.open('', '_blank', 'width=1000,height=1200')
    if (!win) { toast.warning('เบราว์เซอร์บล็อกป๊อปอัป'); return }
    win.document.open()
    win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ITAM Custom Report</title>
<style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:'Sukhumvit Set','Thonburi','Tahoma',sans-serif;color:#1e293b;font-size:10px;line-height:1.3;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.header{border-bottom:3px solid #f97316;padding-bottom:8px;margin-bottom:10px;display:flex;justify-content:space-between}
.header .org{font-size:16px;font-weight:700}.header .meta{text-align:right;font-size:10px;color:#64748b}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #e2e8f0;padding:4px 5px;text-align:left}
th{background:#f97316;color:#fff;font-weight:600;font-size:9px;text-transform:uppercase}
tr:nth-child(even) td{background:#fafbfc}
.print-btn{position:fixed;top:12px;right:12px;background:#f97316;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600}
.footer{margin-top:10px;padding-top:6px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;display:flex;justify-content:space-between}
@media print{.no-print{display:none}tr{page-break-inside:avoid}thead{display:table-header-group}}
</style></head><body>
<button class="print-btn no-print" onclick="window.print()">🖨 พิมพ์ / บันทึก PDF</button>
<div class="header"><div><div class="org">PNG TEAM</div><div style="font-size:11px;color:#475569">ITAM Custom Report — ${rows.length} เครื่อง · ${cols.length} คอลัมน์</div></div><div class="meta">วันที่: ${esc(generatedAt)}</div></div>
<table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>
<div class="footer"><div><span style="color:#f97316;font-weight:700">PNG TEAM</span> — IT Asset Management</div><div>${esc(generatedAt)}</div></div>
<script>setTimeout(function(){try{window.print()}catch(e){}},300)</script>
</body></html>`)
    win.document.close()
    toast.success(`กำลังเปิดหน้า PDF (${cols.length} คอลัมน์)...`)
  }

  // ── Import CSV
  function openImport() {
    setImportText('')
    setImportMode('upsert')
    setImportResult(null)
    setImportOpen(true)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      setImportText(text)
    }
    reader.onerror = () => toast.error('อ่านไฟล์ไม่สำเร็จ')
    reader.readAsText(file, 'utf-8')
    // Reset input so the same file can be uploaded again later
    e.target.value = ''
  }

  // Preview: first 5 data rows of the pasted/loaded CSV
  const importPreview = React.useMemo(() => {
    if (!importText.trim()) return null
    try {
      const rows = parseCsv(importText)
      if (rows.length === 0) return null
      return { header: rows[0], rows: rows.slice(1, 6) }
    } catch {
      return null
    }
  }, [importText])

  async function runImport() {
    if (!importText.trim()) {
      toast.error('กรุณาวาง CSV หรืออัปโหลดไฟล์')
      return
    }
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/itam/devices/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: importText, mode: importMode }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed')
      setImportResult(j)
      toast.success(`นำเข้าสำเร็จ — เพิ่ม ${j.inserted} · อัปเดต ${j.updated}${j.errors.length ? ` · ข้าม ${j.errors.length}` : ''}`)
      await qc.invalidateQueries({ queryKey: ['itam-devices'] })
      await qc.invalidateQueries({ queryKey: ['itam-dashboard'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'นำเข้าไม่สำเร็จ')
    } finally {
      setImporting(false)
    }
  }

  // ── Bulk edit
  function openBulkEdit() {
    if (selectedAssetNos.size === 0) {
      toast.error('กรุณาเลือกอุปกรณ์อย่างน้อย 1 เครื่อง')
      return
    }
    setBulkEditForm({ status: '', site: '', building: '', floor: '', department: '' })
    setBulkProgress(null)
    setBulkEditOpen(true)
  }

  async function saveBulkEdit() {
    const patch: Record<string, unknown> = {}
    if (bulkEditForm.status) patch.status = bulkEditForm.status
    if (bulkEditForm.site) patch.site = bulkEditForm.site
    if (bulkEditForm.building) patch.building = bulkEditForm.building
    if (bulkEditForm.floor) patch.floor = bulkEditForm.floor
    if (bulkEditForm.department) patch.department = bulkEditForm.department
    if (Object.keys(patch).length === 0) {
      toast.error('กรุณาเลือกฟิลด์อย่างน้อย 1 ฟิลด์เพื่ออัปเดต')
      return
    }
    const assetNos = Array.from(selectedAssetNos)
    setBulkSaving(true)
    setBulkProgress({ done: 0, total: assetNos.length })
    try {
      const res = await fetch('/api/itam/devices/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetNos, patch }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed')
      toast.success(`อัปเดต ${j.updated} เครื่องสำเร็จ${j.skipped ? ` · ข้าม ${j.skipped}` : ''}`)
      setBulkEditOpen(false)
      setSelectedAssetNos(new Set())
      await qc.invalidateQueries({ queryKey: ['itam-devices'] })
      await qc.invalidateQueries({ queryKey: ['itam-dashboard'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBulkSaving(false)
      setBulkProgress(null)
    }
  }

  const devices = data?.devices ?? []
  const total = data?.pagination.total ?? 0
  const totalPages = data?.pagination.totalPages ?? 0

  // Build a unique-type list for the type filter from current data
  const typeOptions = React.useMemo(() => {
    const s = new Set<string>()
    for (const d of devices) if (d.deviceType) s.add(d.deviceType)
    return Array.from(s).sort()
  }, [devices])

  // Show skeleton rows when first loading (no cached data)
  const showSkeletons = isLoading

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">จัดการอุปกรณ์ (Real DB)</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">ข้อมูลจริง {total.toLocaleString()} เครื่อง</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setQrScannerOpen(true)}
            className="border-[#f97316]/50 text-[#f97316] hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-950/30"
            title="สแกน QR Code เพื่อค้นหาอุปกรณ์"
          >
            <QrCode className="h-4 w-4" /> สแกน
          </Button>
          <Button variant="outline" onClick={exportCsv} disabled={exporting} className="dark:bg-slate-800 dark:border-slate-700">
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" onClick={exportExcel} disabled={excelExporting} className="dark:bg-slate-800 dark:border-slate-700">
            {excelExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel
          </Button>
          <Button variant="outline" onClick={exportPdf} disabled={pdfExporting} className="dark:bg-slate-800 dark:border-slate-700">
            {pdfExporting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF
          </Button>
          <Button variant="outline" onClick={() => setCustomExportOpen(true)} className="border-[#f97316]/50 text-[#f97316] hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-950/30">
            ⚙️ Custom
          </Button>
          {canEdit && (
            <Button variant="outline" onClick={openImport} className="dark:bg-slate-800 dark:border-slate-700">
              <Upload className="h-4 w-4" /> นำเข้า CSV
            </Button>
          )}
          {canEdit && selectedAssetNos.size > 0 && (
            <Button variant="outline" onClick={openBulkEdit} className="border-[#f97316] text-[#f97316] dark:bg-orange-950/30">
              <Edit3 className="h-4 w-4" /> แก้ไขหลายรายการ ({selectedAssetNos.size})
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleBulkStickerPrint}
            disabled={stickerPrinting || selectedAssetNos.size === 0}
            className="dark:border-slate-700 dark:bg-slate-800"
            title={selectedAssetNos.size === 0 ? 'เลือกอุปกรณ์ด้วย checkbox ก่อน' : `พิมพ์สติกเกอร์ ${selectedAssetNos.size} ใบ`}
          >
            {stickerPrinting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            พิมพ์สติกเกอร์ {selectedAssetNos.size > 0 ? `(${selectedAssetNos.size})` : ''}
          </Button>
          <Button
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ['itam-devices'] })}
            disabled={isFetching}
            className="dark:bg-slate-800 dark:border-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> รีเฟรช
          </Button>
          <Button className="bg-[#f97316] text-white hover:bg-[#ea580c]" onClick={openAdd}>
            <Plus className="h-4 w-4" /> เพิ่มอุปกรณ์
          </Button>
        </div>
      </div>

      {/* Toolbar — stacked on mobile */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="ค้นหารหัส, แบรนด์, รุ่น, SN... (Enter เพื่อบันทึกคำค้น)"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={onSearchKeyDown}
            onBlur={onSearchBlur}
            className="pl-9 pr-9 dark:bg-slate-800 dark:border-slate-700"
          />
          {searchPending && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-orange-500" />
            </div>
          )}
          {!searchPending && search && (
            <button
              onClick={() => { setSearch(''); setPage(1) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="ล้างคำค้นหา"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-48 dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder="สถานะ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">สถานะทั้งหมด</SelectItem>
            <SelectItem value="Active">ใช้งานอยู่</SelectItem>
            <SelectItem value="In Stock">สำรอง</SelectItem>
            <SelectItem value="Pending Repair">ส่งซ่อม</SelectItem>
            <SelectItem value="Inactive">ไม่ใช้งาน</SelectItem>
            <SelectItem value="Retired">ตัดของออก</SelectItem>
          </SelectContent>
        </Select>
        {deviceType !== 'all' && (
          <Badge
            className="inline-flex items-center gap-1 border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300"
          >
            ประเภท: {deviceType}
            <button onClick={() => { setDeviceType('all'); setPage(1) }} aria-label="ล้างตัวกรองประเภท">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {/* Virtual scroll toggle */}
        <Button
          type="button"
          variant={virtualScroll ? 'default' : 'outline'}
          size="sm"
          onClick={() => setVirtualScroll((v) => !v)}
          title={virtualScroll ? 'โหมดเลื่อนเสมือน — โหลด 500 รายการต่อหน้า, เลื่อนลื่น' : 'โหมดมาตรฐาน — 20 รายการต่อหน้า, มี pagination'}
          className={
            virtualScroll
              ? 'h-9 bg-[#f97316] text-white hover:bg-[#ea580c]'
              : 'h-9 dark:bg-slate-800 dark:border-slate-700'
          }
        >
          {virtualScroll ? <Zap className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{virtualScroll ? 'เลื่อนเสมือน' : 'มาตรฐาน'}</span>
        </Button>
      </div>

      {/* Saved filters — named presets + last-used auto-restore */}
      <SavedFilters
        current={{ search, status, type: deviceType }}
        onApply={(f) => {
          setSearch(f.search || '')
          setStatus(f.status || 'all')
          setDeviceType(f.type || 'all')
          setPage(1)
        }}
        onReset={() => {
          setSearch('')
          setStatus('all')
          setDeviceType('all')
          setPage(1)
        }}
      />

      {/* Search metrics + recent searches */}
      <div className="flex flex-col gap-2 text-xs text-slate-500 dark:text-slate-400">
        {search && !showSkeletons && (
          <div>
            พบ <span className="font-semibold text-slate-700 dark:text-slate-200">{total.toLocaleString()}</span> ผล
            {searchMs !== null && <span> ใน <span className="font-semibold text-emerald-600">{searchMs}ms</span></span>}
          </div>
        )}
        {!search && recent.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <History className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-400">ค้นหาล่าสุด:</span>
            {recent.map((q) => (
              <button
                key={q}
                onClick={() => { setSearch(q); setPage(1) }}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-orange-700 dark:hover:bg-orange-950 dark:hover:text-orange-300"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table — standard OR virtualized based on the toggle */}
      <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-0">
          {virtualScroll && !showSkeletons && devices.length > 0 ? (
            <VirtualDevicesTable
              devices={devices}
              query={debouncedSearch}
              selectedAssetNos={selectedAssetNos}
              savedAssetNos={savedAssetNos}
              stickerPrinting={stickerPrinting}
              canEdit={canEdit}
              onRowClick={(assetNo) => { setDetailAssetNo(assetNo); setDetailOpen(true) }}
              onToggle={(assetNo) => toggleSelectAssetNo(assetNo)}
              onSelectAll={(checked) => toggleSelectAllOnPage(checked)}
              onView={(assetNo) => { setDetailAssetNo(assetNo); setDetailOpen(true) }}
              onPrintSticker={(assetNo) => handleSingleStickerPrint(assetNo)}
              onEdit={(assetNo) => openEdit(assetNo)}
              onDelete={(assetNo) => setDeleteAssetNo(assetNo)}
            />
          ) : (
          <div className="itam-scroll max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/80">
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={devices.length > 0 && devices.every((d) => selectedAssetNos.has(d.assetNo))}
                      onCheckedChange={(c) => toggleSelectAllOnPage(!!c)}
                      aria-label="เลือกทั้งหน้า"
                    />
                  </TableHead>
                  <TableHead className="w-20">รหัส</TableHead>
                  <TableHead className="w-28">ประเภท</TableHead>
                  <TableHead>แบรนด์/รุ่น</TableHead>
                  <TableHead className="w-32">Serial</TableHead>
                  <TableHead className="w-32">สถานะ</TableHead>
                  <TableHead className="w-32">สาขา</TableHead>
                  <TableHead className="w-32">แผนก</TableHead>
                  <TableHead className="w-16 text-center">มิเตอร์</TableHead>
                  <TableHead className="w-48 text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {showSkeletons ? (
                  // Skeleton rows matching column widths (10 cols: checkbox + 9 data + actions)
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : devices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12">
                      <div className="flex flex-col items-center gap-3 text-slate-400">
                        <Package className="h-12 w-12 text-slate-300 dark:text-slate-700" />
                        <div className="text-sm">
                          {search || status !== 'all' || deviceType !== 'all'
                            ? 'ไม่พบผลลัพธ์ที่ตรง'
                            : 'ยังไม่มีอุปกรณ์ในระบบ'}
                        </div>
                        {(search || status !== 'all' || deviceType !== 'all') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setSearch(''); setStatus('all'); setDeviceType('all'); setPage(1) }}
                            className="dark:bg-slate-800 dark:border-slate-700"
                          >
                            <X className="h-3.5 w-3.5" /> ลองค้นหาด้วยคำอื่น / ล้างตัวกรอง
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <AnimatePresence initial={false}>
                    {devices.map((d) => {
                      const isSaving = d.__optimistic === 'add' || d.__optimistic === 'edit'
                      const isDeleting = d.__optimistic === 'delete'
                      const justSaved = savedAssetNos.has(d.assetNo)
                      return (
                        <motion.tr
                          key={d.id}
                          layout
                          initial={d.__optimistic === 'add' ? { opacity: 0, y: -10, backgroundColor: 'rgba(249, 115, 22, 0.15)' } : false}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -16, transition: { duration: 0.2 } }}
                          transition={{ duration: 0.25 }}
                          className={[
                            'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50',
                            isSaving ? 'itam-saving-row' : '',
                          ].join(' ')}
                          onClick={() => { setDetailAssetNo(d.assetNo); setDetailOpen(true) }}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedAssetNos.has(d.assetNo)}
                              onCheckedChange={() => toggleSelectAssetNo(d.assetNo)}
                              aria-label={`เลือก ${d.assetNo}`}
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                            <Highlight text={d.assetNo} query={debouncedSearch} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                            <Highlight text={d.deviceType || ''} query={debouncedSearch} />
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="text-slate-700 dark:text-slate-200">
                              <Highlight text={d.brand || ''} query={debouncedSearch} />{' '}
                              <Highlight text={d.model || ''} query={debouncedSearch} />
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-xs text-slate-600 dark:text-slate-400">
                            <Highlight text={d.serial || '—'} query={debouncedSearch} />
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_BADGE[d.status] || 'bg-slate-100 text-slate-600'}>{d.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            <Highlight text={(d.site || '').substring(0, 20)} query={debouncedSearch} />
                          </TableCell>
                          <TableCell className="text-xs">
                            <Highlight text={(d.department || '').substring(0, 20)} query={debouncedSearch} />
                          </TableCell>
                          <TableCell className="text-center">
                            {d.meterRequired ? <Badge className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300">✓</Badge> : '—'}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {justSaved && (
                                <motion.span
                                  initial={{ opacity: 0, scale: 0.85 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0 }}
                                  className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                >
                                  <CheckCheck className="h-3 w-3" /> บันทึกแล้ว
                                </motion.span>
                              )}
                              <Button size="sm" variant="ghost" title="ดู" onClick={() => { setDetailAssetNo(d.assetNo); setDetailOpen(true) }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="พิมพ์สติกเกอร์"
                                className="text-[#f97316] hover:bg-orange-50 dark:hover:bg-orange-950/30"
                                onClick={() => handleSingleStickerPrint(d.assetNo)}
                                disabled={stickerPrinting}
                              >
                                <Tag className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" title="แก้ไข" onClick={() => openEdit(d.assetNo)} disabled={isSaving}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="ลบ"
                                className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                onClick={() => setDeleteAssetNo(d.assetNo)}
                                disabled={isSaving || isDeleting}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </motion.tr>
                      )
                    })}
                  </AnimatePresence>
                )}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      {/* Virtual scroll hint */}
      {virtualScroll && !showSkeletons && devices.length > 0 && (
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-[#f97316]" />
            โหมดเลื่อนเสมือน — แสดง {devices.length.toLocaleString()} รายการในหน้านี้ (render เฉพาะแถวที่มองเห็น)
          </span>
          {total > devices.length && (
            <span>ทั้งหมด {total.toLocaleString()} — ใช้ pagination เพื่อดูหน้าถัดไป</span>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-slate-500">
            หน้า {page} / {totalPages} ({total.toLocaleString()} รายการ)
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="dark:bg-slate-800 dark:border-slate-700">
              <ChevronLeft className="h-4 w-4" /> ก่อนหน้า
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="dark:bg-slate-800 dark:border-slate-700">
              ถัดไป <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      <ItamDeviceDetailSheet
        assetNo={detailAssetNo}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={(an) => {
          setDetailOpen(false)
          openEdit(an)
        }}
      />

      {/* CRUD Dialog — full screen on mobile */}
      <Dialog open={crudOpen} onOpenChange={setCrudOpen}>
        <DialogContent className="max-h-[100vh] overflow-y-auto sm:max-h-[92vh] sm:max-w-3xl dark:border-slate-800 dark:bg-slate-900 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Package className="h-5 w-5 text-[#f97316]" />
              {editAssetNo ? `แก้ไขอุปกรณ์: ${editAssetNo}` : 'เพิ่มอุปกรณ์ใหม่'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">รหัสสินทรัพย์ *</Label>
              <Input value={form.assetNo} onChange={(e) => setForm({ ...form, assetNo: e.target.value })} disabled={!!editAssetNo} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ประเภท</Label>
              <Input value={form.deviceType} onChange={(e) => setForm({ ...form, deviceType: e.target.value })} placeholder="เช่น PRINTER" className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">กลุ่มอุปกรณ์</Label>
              <Input value={form.deviceGroup} onChange={(e) => setForm({ ...form, deviceGroup: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">แบรนด์</Label>
              <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">รุ่น</Label>
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Serial</Label>
              <Input value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">สถานะ</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">สาขา</Label>
              <Select value={form.site} onValueChange={(v) => setForm({ ...form, site: v, building: '', floor: '', department: '', location: '' })}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700"><SelectValue placeholder="เลือกสาขา" /></SelectTrigger>
                <SelectContent>
                  {sites.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Asset Site Code</Label>
              <Input value={form.assetSiteCode} onChange={(e) => setForm({ ...form, assetSiteCode: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">อาคาร</Label>
              <Input
                value={form.building}
                onChange={(e) => setForm({ ...form, building: e.target.value, floor: '', department: '', location: '' })}
                list="dl-building"
                placeholder="เลือกหรือพิมพ์"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
              <datalist id="dl-building">
                {buildingOptions.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ชั้น</Label>
              <Input
                value={form.floor}
                onChange={(e) => setForm({ ...form, floor: e.target.value, department: '', location: '' })}
                list="dl-floor"
                placeholder="เลือกหรือพิมพ์"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
              <datalist id="dl-floor">
                {floorOptions.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">แผนก</Label>
              <Input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value, location: '' })}
                list="dl-department"
                placeholder="เลือกหรือพิมพ์"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
              <datalist id="dl-department">
                {departmentOptions.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">รหัสแผนก</Label>
              <Input value={form.departmentCode} onChange={(e) => setForm({ ...form, departmentCode: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ที่ตั้ง</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                list="dl-location"
                placeholder="เลือกหรือพิมพ์"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
              <datalist id="dl-location">
                {locationOptions.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cost Center</Label>
              <Input value={form.costCenter} onChange={(e) => setForm({ ...form, costCenter: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">เลขสัญญา</Label>
              <Input value={form.contractNo} onChange={(e) => setForm({ ...form, contractNo: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ผู้ขาย</Label>
              <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">IP</Label>
              <Input value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">MAC</Label>
              <Input value={form.mac} onChange={(e) => setForm({ ...form, mac: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Remote ID</Label>
              <Input value={form.remoteId} onChange={(e) => setForm({ ...form, remoteId: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">วันติดตั้ง</Label>
              <Input type="date" value={form.installDate} onChange={(e) => setForm({ ...form, installDate: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">วันหมดประกัน</Label>
              <Input type="date" value={form.warrantyEnd} onChange={(e) => setForm({ ...form, warrantyEnd: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">โหมดมิเตอร์</Label>
              <Select value={form.meterMode} onValueChange={(v) => setForm({ ...form, meterMode: v })}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOTAL">TOTAL</SelectItem>
                  <SelectItem value="BW_COLOR">BW_COLOR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-700 sm:col-span-1">
              <Switch checked={form.meterRequired} onCheckedChange={(c) => setForm({ ...form, meterRequired: c })} />
              <Label className="text-xs">ต้องจดมิเตอร์</Label>
            </div>
            <div className="space-y-1.5 sm:col-span-2 md:col-span-3">
              <Label className="text-xs">หมายเหตุ</Label>
              <Textarea value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} rows={2} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCrudOpen(false)}>ยกเลิก</Button>
            <Button
              onClick={saveDevice}
              disabled={addMutation.isPending || editMutation.isPending}
              className="bg-[#f97316] text-white hover:bg-[#ea580c]"
            >
              {(addMutation.isPending || editMutation.isPending) ? 'กำลังบันทึก...' : editAssetNo ? 'บันทึกการแก้ไข' : 'เพิ่มอุปกรณ์'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteAssetNo} onOpenChange={(o) => !o && setDeleteAssetNo(null)}>
        <AlertDialogContent className="dark:border-slate-800 dark:bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ?</AlertDialogTitle>
            <AlertDialogDescription>
              จะลบอุปกรณ์ <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{deleteAssetNo}</span> และประวัติที่เกี่ยวข้องทั้งหมด (มิเตอร์, มอบหมาย, ซ่อม) การกระทำนี้ย้อนกลับไม่ได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleteMutation.isPending ? 'กำลังลบ...' : 'ลบ'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Custom Export Dialog — เลือกคอลัมน์ + format */}
      <Dialog open={customExportOpen} onOpenChange={setCustomExportOpen}>
        <DialogContent className="sm:max-w-lg dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              📋 เลือกคอลัมน์สำหรับ Export
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500 dark:text-slate-400">ติ๊กเลือกคอลัมน์ที่ต้องการส่งออก ({selectedColumns.length}/{CSV_HEADERS.length} เลือก)</p>
          <div className="itam-scroll max-h-[50vh] overflow-y-auto space-y-1 pr-1">
            {CSV_HEADERS.map((col) => (
              <label key={col.key} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50">
                <Checkbox
                  checked={selectedColumns.includes(col.key)}
                  onCheckedChange={() => toggleColumn(col.key)}
                  className="data-[state=checked]:bg-[#f97316] data-[state=checked]:border-[#f97316]"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{col.label}</span>
                <span className="ml-auto text-xs text-slate-400">{col.key}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={selectAllColumns}>เลือกทั้งหมด</Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => customExport('csv')} disabled={customExporting || selectedColumns.length === 0}>
                📥 CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => customExport('excel')} disabled={customExporting || selectedColumns.length === 0}>
                📊 Excel
              </Button>
              <Button size="sm" onClick={() => customExport('pdf')} disabled={customExporting || selectedColumns.length === 0} className="bg-[#f97316] text-white hover:bg-[#ea580c]">
                📄 PDF
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-slate-400">
            💡 เมื่อกด PDF — ถ้าเปิดใช้งานเทมเพลตเอกสาร ระบบจะถามให้เลือกเทมเพลตก่อน (คอลัมน์ที่เลือกจะใช้เฉพาะเมื่อเลือก "layout มาตรฐาน")
          </p>
        </DialogContent>
      </Dialog>

      {/* Document Template Picker — shown when document templates are enabled */}
      <DocumentTemplatePicker
        open={docTplPickerOpen}
        onOpenChange={setDocTplPickerOpen}
        onSelect={handleDocTplPickerSelect}
        title={docTplPickerTarget === 'custom' ? 'เลือกเทมเพลต (Custom Export)' : 'เลือกเทมเพลตเอกสาร PDF'}
      />

      {/* Import CSV dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl dark:border-slate-800 dark:bg-slate-900 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Upload className="h-5 w-5 text-[#f97316]" /> นำเข้า CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/60 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
              รูปแบบ CSV: แถวแรกเป็น header ที่มีคอลัมน์ <code className="rounded bg-orange-100 px-1 text-orange-700 dark:bg-orange-950 dark:text-orange-300">assetNo</code> (จำเป็น)
              คอลัมน์อื่น ๆ ที่รองรับ: <code>deviceType, brand, model, serial, status, site, building, floor, department, departmentCode, location, deviceGroup, costCenter, contractNo, vendor, ip, mac, remoteId, installDate, warrantyEnd, meterRequired, meterMode, assetSiteCode, remark</code>
              <br />การจับคู่: ถ้ามี <code>assetNo</code> อยู่แล้ว → อัปเดต ถ้าไม่มี → สร้างใหม่
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-orange-300 hover:bg-orange-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-orange-950/30">
                <Upload className="h-3.5 w-3.5" /> เลือกไฟล์ CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
              <Select value={importMode} onValueChange={(v) => setImportMode(v as typeof importMode)}>
                <SelectTrigger className="h-8 w-44 dark:bg-slate-800 dark:border-slate-700 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="upsert">เพิ่ม + อัปเดต</SelectItem>
                  <SelectItem value="create_only">เพิ่มใหม่เท่านั้น</SelectItem>
                  <SelectItem value="update_only">อัปเดตเท่านั้น</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">หรือวาง CSV text ที่นี่</Label>
              <Textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={6}
                placeholder={'assetNo,deviceType,brand,model,site,building,floor,department\n1,PRINTER,KYOCERA,FS-1041,โรงพยาบาล...,ตึก A,1,ธุรการ\n2,MONITOR,DELL,P2419H,...'}
                className="font-mono text-xs dark:bg-slate-800 dark:border-slate-700"
              />
            </div>

            {/* Preview */}
            {importPreview && (
              <div className="space-y-1.5">
                <Label className="text-xs">ตัวอย่าง 5 แถวแรก</Label>
                <div className="itam-scroll max-h-56 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
                  <Table>
                    <TableHeader className="sticky top-0 bg-slate-50/80 dark:bg-slate-900/80">
                      <TableRow>
                        {importPreview.header.map((h, i) => (
                          <TableHead key={i} className="text-[10px] whitespace-nowrap">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.rows.map((r, i) => (
                        <TableRow key={i}>
                          {importPreview.header.map((_, j) => (
                            <TableCell key={j} className="text-[10px] whitespace-nowrap text-slate-600 dark:text-slate-300">{r[j] ?? ''}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Result */}
            {importResult && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs dark:border-emerald-800 dark:bg-emerald-950/30">
                <div className="font-semibold text-emerald-700 dark:text-emerald-300">นำเข้าเสร็จสิ้น</div>
                <div className="mt-1 text-slate-700 dark:text-slate-300">
                  เพิ่มใหม่ <span className="font-semibold">{importResult.inserted}</span> ·
                  อัปเดต <span className="font-semibold">{importResult.updated}</span> ·
                  ข้าม/ผิดพลาด <span className="font-semibold">{importResult.errors.length}</span> ·
                  ทั้งหมด <span className="font-semibold">{importResult.total}</span>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto">
                    <div className="font-medium text-rose-700 dark:text-rose-300">รายการที่ข้าม:</div>
                    {importResult.errors.slice(0, 10).map((e, i) => (
                      <div key={i} className="text-[10px] text-slate-600 dark:text-slate-400">
                        แถว {e.row} ({e.assetNo || '-'}): {e.error}
                      </div>
                    ))}
                    {importResult.errors.length > 10 && <div className="text-[10px] text-slate-400">…และอีก {importResult.errors.length - 10} รายการ</div>}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>ปิด</Button>
            <Button onClick={runImport} disabled={importing || !importText.trim()} className="bg-[#f97316] text-white hover:bg-[#ea580c]">
              {importing ? 'กำลังนำเข้า...' : 'นำเข้า'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit dialog */}
      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Edit3 className="h-5 w-5 text-[#f97316]" /> แก้ไขหลายรายการ ({selectedAssetNos.size} เครื่อง)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ปล่อยว่าง = ไม่เปลี่ยนแปลงฟิลด์นั้น ๆ เฉพาะฟิลด์ที่กรอกจะถูกอัปเดตให้ทุกเครื่องที่เลือก
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">สถานะ</Label>
              <Select value={bulkEditForm.status} onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, status: v === '__none' ? '' : v })}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700"><SelectValue placeholder="ไม่เปลี่ยนแปลง" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">ไม่เปลี่ยนแปลง</SelectItem>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">สาขา</Label>
              <Select value={bulkEditForm.site} onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, site: v === '__none' ? '' : v, building: '', floor: '', department: '' })}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700"><SelectValue placeholder="ไม่เปลี่ยนแปลง" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">ไม่เปลี่ยนแปลง</SelectItem>
                  {sites.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">อาคาร</Label>
              <Input
                value={bulkEditForm.building}
                onChange={(e) => setBulkEditForm({ ...bulkEditForm, building: e.target.value, floor: '', department: '' })}
                list="dl-bulk-building"
                placeholder="ไม่เปลี่ยนแปลง"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
              <datalist id="dl-bulk-building">
                {bulkBuildingOptions.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ชั้น</Label>
              <Input
                value={bulkEditForm.floor}
                onChange={(e) => setBulkEditForm({ ...bulkEditForm, floor: e.target.value, department: '' })}
                list="dl-bulk-floor"
                placeholder="ไม่เปลี่ยนแปลง"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
              <datalist id="dl-bulk-floor">
                {bulkFloorOptions.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">แผนก</Label>
              <Input
                value={bulkEditForm.department}
                onChange={(e) => setBulkEditForm({ ...bulkEditForm, department: e.target.value })}
                list="dl-bulk-department"
                placeholder="ไม่เปลี่ยนแปลง"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
              <datalist id="dl-bulk-department">
                {bulkDepartmentOptions.map((v) => <option key={v} value={v} />)}
              </datalist>
            </div>
            {bulkProgress && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                กำลังประมวลผล: {bulkProgress.done}/{bulkProgress.total}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkEditOpen(false)} disabled={bulkSaving}>ยกเลิก</Button>
            <Button onClick={saveBulkEdit} disabled={bulkSaving} className="bg-[#f97316] text-white hover:bg-[#ea580c]">
              {bulkSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// VirtualDevicesTable — virtualized rendering of device rows.
//
// Why this exists:
//   Google Apps Script renders every row via innerHTML — fine for 100 rows
//   but janky at 2,378+. Next.js can use @tanstack/react-virtual to render
//   ONLY the ~20 rows visible in the viewport + a small overscan buffer,
//   while keeping the full scroll height. Result: 60fps scrolling through
//   thousands of rows.
//
// Implementation notes:
//   • Uses CSS Grid (not <table>) so each row is a div that can be absolutely
//     positioned by the virtualizer.
//   • Header is sticky on top via `position: sticky; top: 0`.
//   • Column widths mirror the standard <Table> variant so the two views
//     look identical.
//   • Overscan = 8 rows — smooth scrolling without too many offscreen DOM
//     nodes.
// ─────────────────────────────────────────────────────────────────────────────

const VIRTUAL_ROW_HEIGHT = 44 // px — must match the row's actual rendered height
const VIRTUAL_OVERSCAN = 8

// Grid template columns — kept in sync with the standard table column widths
// (w-10, w-20, w-28, 1fr, w-32, w-32, w-32, w-16, w-48)
const GRID_COLS = 'grid-cols-[40px_80px_112px_minmax(140px,1fr)_128px_128px_128px_128px_64px_192px]'

interface VirtualDevicesTableProps {
  devices: Device[]
  query: string
  selectedAssetNos: Set<string>
  savedAssetNos: Set<string>
  stickerPrinting: boolean
  canEdit: boolean
  onRowClick: (assetNo: string) => void
  onToggle: (assetNo: string) => void
  onSelectAll: (checked: boolean) => void
  onView: (assetNo: string) => void
  onPrintSticker: (assetNo: string) => void
  onEdit: (assetNo: string) => void
  onDelete: (assetNo: string) => void
}

function VirtualDevicesTable({
  devices,
  query,
  selectedAssetNos,
  savedAssetNos,
  stickerPrinting,
  onRowClick,
  onToggle,
  onSelectAll,
  onView,
  onPrintSticker,
  onEdit,
  onDelete,
}: VirtualDevicesTableProps) {
  const parentRef = React.useRef<HTMLDivElement | null>(null)

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns functions that React Compiler can't auto-memoize; this is by design.
  const rowVirtualizer = useVirtualizer({
    count: devices.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => VIRTUAL_ROW_HEIGHT,
    overscan: VIRTUAL_OVERSCAN,
  })

  const totalSize = rowVirtualizer.getTotalSize()
  const virtualRows = rowVirtualizer.getVirtualItems()
  const allSelected = devices.length > 0 && devices.every((d) => selectedAssetNos.has(d.assetNo))

  return (
    <div
      ref={parentRef}
      className="itam-scroll max-h-[60vh] overflow-auto"
      role="table"
      aria-label="ตารางอุปกรณ์ (โหมดเลื่อนเสมือน)"
    >
      {/* Sticky header — same grid as the rows */}
      <div
        className={`sticky top-0 z-10 grid ${GRID_COLS} gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-300`}
        role="row"
      >
        <div className="flex items-center" role="columnheader">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(c) => onSelectAll(!!c)}
            aria-label="เลือกทั้งหน้า"
          />
        </div>
        <div role="columnheader">รหัส</div>
        <div role="columnheader">ประเภท</div>
        <div role="columnheader">แบรนด์/รุ่น</div>
        <div role="columnheader">Serial</div>
        <div role="columnheader">สถานะ</div>
        <div role="columnheader">สาขา</div>
        <div role="columnheader">แผนก</div>
        <div role="columnheader" className="text-center">มิเตอร์</div>
        <div role="columnheader" className="text-right">จัดการ</div>
      </div>

      {/* Virtualized body — spacer div sized to total height, rows positioned absolutely */}
      <div style={{ height: totalSize, position: 'relative' }} role="rowgroup">
        {virtualRows.map((virtualRow) => {
          const d = devices[virtualRow.index]
          if (!d) return null
          const isSaving = d.__optimistic === 'add' || d.__optimistic === 'edit'
          const justSaved = savedAssetNos.has(d.assetNo)
          const isSelected = selectedAssetNos.has(d.assetNo)
          return (
            <div
              key={d.id}
              role="row"
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              onClick={() => onRowClick(d.assetNo)}
              className={[
                `grid ${GRID_COLS} cursor-pointer items-center gap-2 border-b border-slate-100 px-3 text-xs transition-colors dark:border-slate-800`,
                'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                isSelected ? 'bg-orange-50 dark:bg-orange-950/20' : '',
                isSaving ? 'itam-saving-row' : '',
                justSaved ? 'bg-emerald-50 dark:bg-emerald-950/20' : '',
              ].join(' ')}
            >
              <div onClick={(e) => e.stopPropagation()} className="flex items-center" role="cell">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggle(d.assetNo)}
                  aria-label={`เลือก ${d.assetNo}`}
                />
              </div>
              <div role="cell" className="whitespace-nowrap font-mono font-medium text-slate-700 dark:text-slate-300">
                <Highlight text={d.assetNo} query={query} />
              </div>
              <div role="cell" className="whitespace-nowrap text-slate-600 dark:text-slate-400">
                <Highlight text={d.deviceType || ''} query={query} />
              </div>
              <div role="cell" className="truncate text-slate-700 dark:text-slate-200">
                <Highlight text={d.brand || ''} query={query} />{' '}
                <Highlight text={d.model || ''} query={query} />
              </div>
              <div role="cell" className="whitespace-nowrap font-mono text-slate-600 dark:text-slate-400">
                <Highlight text={d.serial || '—'} query={query} />
              </div>
              <div role="cell">
                <Badge className={STATUS_BADGE[d.status] || 'bg-slate-100 text-slate-600'}>{d.status}</Badge>
              </div>
              <div role="cell" className="truncate text-slate-600 dark:text-slate-400">
                <Highlight text={(d.site || '').substring(0, 20)} query={query} />
              </div>
              <div role="cell" className="truncate text-slate-600 dark:text-slate-400">
                <Highlight text={(d.department || '').substring(0, 20)} query={query} />
              </div>
              <div role="cell" className="text-center">
                {d.meterRequired ? (
                  <Badge className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300">✓</Badge>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>
              <div role="cell" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1">
                  {justSaved && (
                    <span className="mr-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <CheckCheck className="h-3 w-3" /> บันทึกแล้ว
                    </span>
                  )}
                  <Button size="sm" variant="ghost" title="ดู" onClick={() => onView(d.assetNo)} className="h-7 w-7 p-0">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="พิมพ์สติกเกอร์"
                    className="h-7 w-7 p-0 text-[#f97316] hover:bg-orange-50 dark:hover:bg-orange-950/30"
                    onClick={() => onPrintSticker(d.assetNo)}
                    disabled={stickerPrinting}
                  >
                    <Tag className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" title="แก้ไข" onClick={() => onEdit(d.assetNo)} disabled={isSaving} className="h-7 w-7 p-0">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="ลบ"
                    className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    onClick={() => onDelete(d.assetNo)}
                    disabled={isSaving}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
