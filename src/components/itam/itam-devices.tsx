'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Search, RefreshCw, ChevronLeft, ChevronRight, Package, Plus, Pencil, Trash2, Download, Eye, X, History, CheckCheck } from 'lucide-react'
import { downloadCsv, dateStamp } from '@/lib/csv'
import { ItamDeviceDetailSheet } from './itam-device-detail-sheet'
import { useAppStore } from '@/store/app-store'

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
  const [limit] = React.useState(20)

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
          <Button variant="outline" onClick={exportCsv} disabled={exporting} className="dark:bg-slate-800 dark:border-slate-700">
            <Download className="h-4 w-4" /> ส่งออก CSV
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
      </div>

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

      {/* Table */}
      <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-0">
          <div className="itam-scroll max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/80">
                <TableRow>
                  <TableHead className="w-20">รหัส</TableHead>
                  <TableHead className="w-28">ประเภท</TableHead>
                  <TableHead>แบรนด์/รุ่น</TableHead>
                  <TableHead className="w-32">สถานะ</TableHead>
                  <TableHead className="w-32">สาขา</TableHead>
                  <TableHead className="w-32">แผนก</TableHead>
                  <TableHead className="w-16 text-center">มิเตอร์</TableHead>
                  <TableHead className="w-40 text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {showSkeletons ? (
                  // Skeleton rows matching column widths
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : devices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12">
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
        </CardContent>
      </Card>

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
              <Input value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Asset Site Code</Label>
              <Input value={form.assetSiteCode} onChange={(e) => setForm({ ...form, assetSiteCode: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">อาคาร</Label>
              <Input value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ชั้น</Label>
              <Input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">แผนก</Label>
              <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">รหัสแผนก</Label>
              <Input value={form.departmentCode} onChange={(e) => setForm({ ...form, departmentCode: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ที่ตั้ง</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
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
    </div>
  )
}
