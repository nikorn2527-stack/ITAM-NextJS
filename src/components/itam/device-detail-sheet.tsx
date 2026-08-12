'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Pencil,
  X,
  Gauge,
  Inbox,
  ArrowLeftRight,
  ArrowRight,
  Loader2,
  MapPin,
  ShieldAlert,
  User,
  UserPlus,
  Undo2,
  ClipboardList,
  KeyRound,
  Plus,
  Trash2,
} from 'lucide-react'
import type { Device, MeterReading, DeviceTransfer, Site, Assignment, LicenseRecord } from './types'
import {
  statusBadgeClass,
  statusLabel,
  computeWarranty,
  warrantyBadgeClass,
  warrantyLabel,
  formatThaiDate,
  formatBaht,
} from './types'

interface Props {
  deviceId: string | null
  onClose: () => void
  onEdit?: (device: Device) => void
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="break-words text-sm font-medium text-slate-800 dark:text-slate-100">
        {value === null || value === undefined || value === '' ? (
          <span className="text-slate-400 dark:text-slate-600">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}

function formatThaiDateTime(iso: string): string {
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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function DeviceDetailSheet({ deviceId, onClose, onEdit }: Props) {
  const open = Boolean(deviceId)
  const qc = useQueryClient()
  const { theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const isDark = mounted && theme === 'dark'
  const gridStroke = isDark ? '#334155' : '#e2e8f0'
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0'
  const tooltipBg = isDark ? '#0f172a' : '#ffffff'
  const tooltipFg = isDark ? '#e2e8f0' : '#1e293b'

  // Transfer dialog state
  const [transferOpen, setTransferOpen] = React.useState(false)
  const [tSite, setTSite] = React.useState('')
  const [tDept, setTDept] = React.useState('')
  const [tDeptCode, setTDeptCode] = React.useState('')
  const [tReason, setTReason] = React.useState('')
  const [tDate, setTDate] = React.useState(todayISO())
  const [transferring, setTransferring] = React.useState(false)

  // Assign dialog state
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [aAssignee, setAAssignee] = React.useState('')
  const [aRole, setARole] = React.useState('')
  const [aDept, setADept] = React.useState('')
  const [aCheckout, setACheckout] = React.useState(todayISO())
  const [aExpectedReturn, setAExpectedReturn] = React.useState('')
  const [aNotes, setANotes] = React.useState('')
  const [assigning, setAssigning] = React.useState(false)

  // Return dialog state
  const [returnOpen, setReturnOpen] = React.useState(false)
  const [rReturnDate, setRReturnDate] = React.useState(todayISO())
  const [rNotes, setRNotes] = React.useState('')
  const [returning, setReturning] = React.useState(false)

  // License dialog state
  const [licenseOpen, setLicenseOpen] = React.useState(false)
  const [lcSoftware, setLcSoftware] = React.useState('')
  const [lcLicenseId, setLcLicenseId] = React.useState('')
  const [lcLicenseType, setLcLicenseType] = React.useState('')
  const [lcLicenseKey, setLcLicenseKey] = React.useState('')
  const [lcQuantity, setLcQuantity] = React.useState('1')
  const [lcExpiryDate, setLcExpiryDate] = React.useState('')
  const [lcRemark, setLcRemark] = React.useState('')
  const [savingLicense, setSavingLicense] = React.useState(false)
  const [deletingLicenseId, setDeletingLicenseId] = React.useState<string | null>(
    null,
  )

  const LICENSE_TYPE_OPTIONS = [
    { value: 'OEM', label: 'OEM' },
    { value: 'Volume', label: 'Volume' },
    { value: 'Retail', label: 'Retail' },
    { value: 'Subscription', label: 'Subscription' },
    { value: 'Open License', label: 'Open License' },
  ]

  const { data: deviceData, isLoading: deviceLoading } = useQuery<{
    device: Device
  } | null>({
    queryKey: ['device-detail', deviceId],
    queryFn: async () => {
      if (!deviceId) return null
      const res = await fetch(`/api/devices/${deviceId}`)
      if (!res.ok) return null
      const json = await res.json()
      return { device: json.device as Device }
    },
    enabled: Boolean(deviceId),
  })

  const { data: readings, isLoading: readingsLoading } = useQuery<
    MeterReading[]
  >({
    queryKey: ['device-meter', deviceId],
    queryFn: async () => {
      if (!deviceId) return []
      const res = await fetch(`/api/meter?deviceId=${deviceId}`)
      if (!res.ok) return []
      const json = await res.json()
      return (json.readings ?? []) as MeterReading[]
    },
    enabled: Boolean(deviceId),
  })

  const { data: transfers, isLoading: transfersLoading } = useQuery<
    DeviceTransfer[]
  >({
    queryKey: ['device-transfers', deviceId],
    queryFn: async () => {
      if (!deviceId) return []
      const res = await fetch(`/api/devices/${deviceId}/transfer`)
      if (!res.ok) return []
      const json = await res.json()
      return (json.transfers ?? []) as DeviceTransfer[]
    },
    enabled: Boolean(deviceId),
  })

  const { data: assignments, isLoading: assignmentsLoading } = useQuery<
    Assignment[]
  >({
    queryKey: ['device-assignments', deviceId],
    queryFn: async () => {
      if (!deviceId) return []
      const res = await fetch(`/api/devices/${deviceId}/assign`)
      if (!res.ok) return []
      const json = await res.json()
      return (json.assignments ?? []) as Assignment[]
    },
    enabled: Boolean(deviceId),
  })

  const { data: licenses, isLoading: licensesLoading } = useQuery<
    LicenseRecord[]
  >({
    queryKey: ['device-licenses', deviceId],
    queryFn: async () => {
      if (!deviceId) return []
      const res = await fetch(`/api/devices/${deviceId}/licenses`)
      if (!res.ok) return []
      const json = await res.json()
      return (json.licenses ?? []) as LicenseRecord[]
    },
    enabled: Boolean(deviceId),
  })

  function openLicenseDialog() {
    setLcSoftware('')
    setLcLicenseId('')
    setLcLicenseType('')
    setLcLicenseKey('')
    setLcQuantity('1')
    setLcExpiryDate('')
    setLcRemark('')
    setLicenseOpen(true)
  }

  async function saveLicense() {
    if (!deviceId) return
    if (!lcSoftware.trim()) {
      toast.error('กรุณากรอกชื่อซอฟต์แวร์')
      return
    }
    try {
      setSavingLicense(true)
      const res = await fetch(`/api/devices/${deviceId}/licenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseId: lcLicenseId || null,
          software: lcSoftware.trim(),
          licenseType: lcLicenseType || null,
          licenseKey: lcLicenseKey || null,
          quantity: Number(lcQuantity) || 1,
          expiryDate: lcExpiryDate || null,
          remark: lcRemark || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Save failed')
      }
      toast.success('เพิ่ม License แล้ว')
      setLicenseOpen(false)
      await qc.invalidateQueries({ queryKey: ['device-licenses', deviceId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingLicense(false)
    }
  }

  async function deleteLicense(id: string) {
    if (!deviceId) return
    try {
      setDeletingLicenseId(id)
      const res = await fetch(
        `/api/devices/${deviceId}/licenses?licenseId=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Delete failed')
      }
      toast.success('ลบ License แล้ว')
      await qc.invalidateQueries({ queryKey: ['device-licenses', deviceId] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeletingLicenseId(null)
    }
  }

  const activeAssignment = React.useMemo(
    () => (assignments ?? []).find((a) => a.status === 'active') ?? null,
    [assignments],
  )

  const { data: sites } = useQuery<Site[]>({
    queryKey: ['sites'],
    queryFn: async () => {
      const res = await fetch('/api/sites')
      if (!res.ok) return []
      const json = await res.json()
      return json.sites as Site[]
    },
  })

  const device = deviceData?.device
  const sortedReadings = React.useMemo(
    () =>
      (readings ?? [])
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date)),
    [readings],
  )
  const chartData = sortedReadings.map((r) => ({
    date: r.date,
    label: r.date.slice(5),
    reading: r.reading,
  }))

  function handleEdit() {
    if (device && onEdit) {
      onEdit(device)
    }
  }

  function openTransferDialog() {
    if (!device) return
    setTSite('')
    setTDept(device.department ?? '')
    setTDeptCode(device.departmentCode ?? '')
    setTReason('')
    setTDate(todayISO())
    setTransferOpen(true)
  }

  function openAssignDialog() {
    if (!device) return
    setAAssignee('')
    setARole('')
    setADept(device.department ?? '')
    setACheckout(todayISO())
    setAExpectedReturn('')
    setANotes('')
    setAssignOpen(true)
  }

  function openReturnDialog() {
    if (!activeAssignment) return
    setRReturnDate(todayISO())
    setRNotes('')
    setReturnOpen(true)
  }

  async function confirmAssign() {
    if (!device) return
    if (!aAssignee.trim()) {
      toast.error('กรุณากรอกชื่อผู้รับมอบหมาย')
      return
    }
    try {
      setAssigning(true)
      const res = await fetch(`/api/devices/${device.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignee: aAssignee.trim(),
          assigneeRole: aRole.trim() || null,
          department: aDept.trim() || null,
          checkoutDate: aCheckout,
          expectedReturnDate: aExpectedReturn || null,
          notes: aNotes.trim() || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Assign failed')
      }
      toast.success(`มอบหมายอุปกรณ์ให้ ${aAssignee.trim()} แล้ว`)
      setAssignOpen(false)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['device-detail', deviceId] }),
        qc.invalidateQueries({ queryKey: ['device-assignments', deviceId] }),
        qc.invalidateQueries({ queryKey: ['devices'] }),
        qc.invalidateQueries({ queryKey: ['audit'] }),
      ])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Assign failed')
    } finally {
      setAssigning(false)
    }
  }

  async function confirmReturn() {
    if (!device || !activeAssignment) return
    try {
      setReturning(true)
      const res = await fetch(`/api/devices/${device.id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualReturnDate: rReturnDate,
          notes: rNotes.trim() || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Return failed')
      }
      toast.success(`คืนอุปกรณ์จาก ${activeAssignment.assignee} แล้ว`)
      setReturnOpen(false)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['device-detail', deviceId] }),
        qc.invalidateQueries({ queryKey: ['device-assignments', deviceId] }),
        qc.invalidateQueries({ queryKey: ['devices'] }),
        qc.invalidateQueries({ queryKey: ['audit'] }),
      ])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Return failed')
    } finally {
      setReturning(false)
    }
  }

  async function confirmTransfer() {
    if (!device) return
    if (!tSite) {
      toast.error('กรุณาเลือกสาขาปลายทาง')
      return
    }
    if (tSite === device.site && tDept.trim() === (device.department ?? '') && tDeptCode.trim() === (device.departmentCode ?? '')) {
      toast.error('ไม่มีการเปลี่ยนแปลง — สาขา/แผนกเหมือนเดิม')
      return
    }
    try {
      setTransferring(true)
      const res = await fetch(`/api/devices/${device.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toSite: tSite,
          toDept: tDept.trim() || null,
          toDeptCode: tDeptCode.trim() || null,
          reason: tReason.trim() || null,
          transferDate: tDate,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Transfer failed')
      }
      toast.success('ย้ายอุปกรณ์แล้ว')
      setTransferOpen(false)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['device-detail', deviceId] }),
        qc.invalidateQueries({ queryKey: ['device-transfers', deviceId] }),
        qc.invalidateQueries({ queryKey: ['devices'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
        qc.invalidateQueries({ queryKey: ['audit'] }),
      ])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Transfer failed')
    } finally {
      setTransferring(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="itam-scroll w-full gap-0 overflow-y-auto border-slate-800 bg-white p-0 dark:border-slate-800 dark:bg-slate-900 sm:max-w-[480px]"
      >
        <SheetHeader className="border-b border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
          {deviceLoading ? (
            <>
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </>
          ) : device ? (
            <>
              <SheetTitle className="text-lg text-slate-800 dark:text-slate-100">
                {device.name}
              </SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{device.assetCode}</span>
                <Badge className={statusBadgeClass(device.status) + ' transition-colors hover:scale-105'}>
                  {statusLabel(device.status)}
                </Badge>
              </SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle>—</SheetTitle>
              <SheetDescription>ไม่พบอุปกรณ์</SheetDescription>
            </>
          )}
        </SheetHeader>

        <div className="flex-1 space-y-5 p-5">
          {/* Warranty alert banner */}
          {device && (() => {
            const w = computeWarranty(device.purchaseDate, device.warrantyMonths ?? 12)
            if (w.status === 'expired' && w.expiry) {
              return (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-semibold">⚠️ รับประกันหมดแล้วเมื่อ {formatThaiDate(w.expiry)}</span>
                    <span className="mt-0.5 block text-xs text-rose-600 dark:text-rose-400">
                      อุปกรณ์นี้อาจไม่ได้รับการคุ้มครองจากผู้ผลิต — พิจารณาต่ออายุรับประกันหรือวางแผนส่งซ่อม
                    </span>
                  </span>
                </div>
              )
            }
            if (w.status === 'expiring' && w.expiry && w.daysUntilExpiry !== null) {
              return (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-semibold">⏰ รับประกันจะหมดในอีก {w.daysUntilExpiry} วัน ({formatThaiDate(w.expiry)})</span>
                    <span className="mt-0.5 block text-xs text-amber-600 dark:text-amber-400">
                      วางแผนต่ออายุรับประกันหรือเตรียมอุปกรณ์สำรองก่อนวันหมดรับประกัน
                    </span>
                  </span>
                </div>
              )
            }
            return null
          })()}

          {/* Current assignee card */}
          {device && (
            <section>
              {assignmentsLoading ? (
                <Skeleton className="h-24 w-full dark:bg-slate-800" />
              ) : activeAssignment ? (
                <div className="relative overflow-hidden rounded-lg border border-teal-200 bg-gradient-to-br from-teal-50 to-white p-4 dark:border-teal-800/60 dark:from-teal-950/30 dark:to-slate-900">
                  <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#14b8a6] to-[#0d9488]" />
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                          ผู้ใช้งานปัจจุบัน
                        </h3>
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          active
                        </Badge>
                      </div>
                      <div className="mt-1 text-base font-bold text-slate-800 dark:text-slate-100">
                        {activeAssignment.assignee}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {activeAssignment.assigneeRole && (
                          <span>{activeAssignment.assigneeRole}</span>
                        )}
                        {activeAssignment.department && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {activeAssignment.department}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <ClipboardList className="h-3 w-3" />
                          มอบเมื่อ {formatThaiDate(activeAssignment.checkoutDate)}
                        </span>
                        {activeAssignment.expectedReturnDate && (
                          <span>
                            กำหนดคืน {formatThaiDate(activeAssignment.expectedReturnDate)}
                          </span>
                        )}
                      </div>
                      {activeAssignment.notes && (
                        <div className="mt-1.5 rounded bg-teal-50 px-2 py-1 text-xs text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                          📝 {activeAssignment.notes}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={openReturnDialog}
                      disabled={returning}
                      className="shrink-0 border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
                    >
                      <Undo2 className="h-4 w-4" />
                      คืนอุปกรณ์
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-teal-300 bg-teal-50/40 py-6 text-center dark:border-teal-700 dark:bg-teal-950/20">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300">
                    <User className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    ยังไม่มีผู้ใช้งานปัจจุบัน
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    มอบหมายอุปกรณ์นี้ให้ผู้ใช้งานเพื่อติดตามการใช้งาน
                  </div>
                  <Button
                    size="sm"
                    onClick={openAssignDialog}
                    className="mt-1 border border-[#0d9488] bg-[#0d9488] text-white hover:bg-[#0f766e] focus-visible:ring-2 focus-visible:ring-[#0d9488] focus-visible:ring-offset-1 dark:border-[#14b8a6] dark:bg-[#14b8a6] dark:hover:bg-[#0d9488] dark:focus-visible:ring-offset-slate-950"
                  >
                    <UserPlus className="h-4 w-4" />
                    มอบหมาย
                  </Button>
                </div>
              )}
            </section>
          )}

          {/* Info grid */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              ข้อมูลอุปกรณ์
            </h3>
            {deviceLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : device ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <InfoRow label="แบรนด์" value={device.brand} />
                <InfoRow label="รุ่น" value={device.model} />
                <InfoRow label="ประเภท" value={device.type} />
                <InfoRow
                  label="หมายเลข SN"
                  value={
                    <span className="font-mono text-xs">
                      {device.serialNumber}
                    </span>
                  }
                />
                <InfoRow label="สาขา" value={device.site} />
                <InfoRow label="แผนก" value={device.department} />
                <InfoRow
                  label="รหัสแผนก"
                  value={
                    <span className="font-mono text-xs">
                      {device.departmentCode}
                    </span>
                  }
                />
                <InfoRow
                  label="ParentRef"
                  value={
                    <span className="font-mono text-xs">
                      {device.parentRef}
                    </span>
                  }
                />
                <InfoRow label="DisplayLabel" value={device.displayLabel} />
                <InfoRow label="ที่ตั้ง" value={device.location} />
                <InfoRow label="วันที่ซื้อ" value={formatThaiDate(device.purchaseDate)} />
                <InfoRow
                  label="รับประกัน (เดือน)"
                  value={
                    <span className="tabular-nums">
                      {device.warrantyMonths ?? 12}
                    </span>
                  }
                />
                {(() => {
                  const w = computeWarranty(
                    device.purchaseDate,
                    device.warrantyMonths ?? 12,
                  )
                  return (
                    <InfoRow
                      label="วันหมดรับประกัน"
                      value={
                        w.expiry ? (
                          <span
                            className={
                              'font-medium ' +
                              (w.status === 'expired'
                                ? 'text-rose-600 dark:text-rose-400'
                                : w.status === 'expiring'
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400')
                            }
                          >
                            {formatThaiDate(w.expiry)}
                          </span>
                        ) : (
                          <Badge className={warrantyBadgeClass(w.status)}>
                            {warrantyLabel(w.status)}
                          </Badge>
                        )
                      }
                    />
                  )
                })()}
                <InfoRow
                  label="มิเตอร์ล่าสุด"
                  value={
                    <span className="font-mono tabular-nums">
                      {device.lastMeterReading.toLocaleString()}
                    </span>
                  }
                />
                {(() => {
                  // Compute straight-line depreciation inline using device fields.
                  const price = device.purchasePrice
                  const salvage =
                    device.salvageValue !== null &&
                    device.salvageValue !== undefined
                      ? device.salvageValue
                      : 0
                  const usefulLife =
                    device.usefulLife && device.usefulLife > 0
                      ? device.usefulLife
                      : 60
                  if (price === null || price === undefined || price <= 0) {
                    return null
                  }
                  // Age in months
                  let ageInMonths = 0
                  if (
                    device.purchaseDate &&
                    /^\d{4}-\d{2}-\d{2}/.test(device.purchaseDate)
                  ) {
                    const start = new Date(
                      device.purchaseDate.slice(0, 10) + 'T00:00:00',
                    )
                    if (!Number.isNaN(start.getTime())) {
                      const now = new Date()
                      let m =
                        (now.getFullYear() - start.getFullYear()) * 12 +
                        (now.getMonth() - start.getMonth())
                      if (now.getDate() < start.getDate()) m -= 1
                      ageInMonths = Math.max(0, m)
                    }
                  }
                  const clampedSalvage = Math.min(salvage, price)
                  const monthlyDepreciation =
                    (price - clampedSalvage) / usefulLife
                  const accumulatedDepreciation = Math.min(
                    Math.max(0, monthlyDepreciation * ageInMonths),
                    Math.max(0, price - clampedSalvage),
                  )
                  const currentValue = Math.max(
                    clampedSalvage,
                    price - accumulatedDepreciation,
                  )
                  const pct =
                    price > 0
                      ? Math.round((accumulatedDepreciation / price) * 100)
                      : 0
                  const status =
                    currentValue <= clampedSalvage
                      ? 'หมดอายุการใช้งาน'
                      : ageInMonths < 1
                        ? 'ใหม่'
                        : 'กำลังเสื่อม'
                  const statusColor =
                    currentValue <= clampedSalvage
                      ? 'text-rose-600 dark:text-rose-400'
                      : ageInMonths < 1
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                  return (
                    <InfoRow
                      label="มูลค่าปัจจุบัน"
                      value={
                        <div className="space-y-1">
                          <div className="flex items-baseline gap-2">
                            <span className="font-semibold tabular-nums text-[#0d9488] dark:text-[#14b8a6]">
                              {formatBaht(currentValue)}
                            </span>
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              · เสื่อม {pct}%
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500">
                            ราคาซื้อ {formatBaht(price)} ·{' '}
                            <span className={statusColor}>{status}</span>
                          </div>
                        </div>
                      }
                    />
                  )
                })()}
                <InfoRow
                  label="สร้างเมื่อ"
                  value={formatThaiDateTime(device.createdAt)}
                />
                <InfoRow
                  label="อัปเดตเมื่อ"
                  value={formatThaiDateTime(device.updatedAt)}
                />
              </dl>
            ) : null}
          </section>

          {/* Meter history */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <Gauge className="h-3.5 w-3.5 text-[#0d9488]" />
              ประวัติการจดมิเตอร์ ({sortedReadings.length})
            </h3>
            {readingsLoading ? (
              <Skeleton className="h-44 w-full" />
            ) : chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 py-8 text-slate-400 dark:border-slate-700 dark:text-slate-500">
                <Inbox className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">ยังไม่มีประวัติการจดมิเตอร์</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">เริ่มจดมิเตอร์ได้จากหน้าจดมิเตอร์</span>
              </div>
            ) : (
              <>
                <div className="rounded-md border border-slate-200 bg-slate-50/60 p-2 dark:border-slate-800 dark:bg-slate-800/40">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={gridStroke}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        tickLine={false}
                        width={48}
                        tickFormatter={(v) =>
                          Number(v).toLocaleString('en-US', {
                            notation: 'compact',
                          })
                        }
                      />
                      <Tooltip
                        formatter={(v: number) => [
                          v.toLocaleString(),
                          'ค่ามิเตอร์',
                        ]}
                        labelFormatter={(l) => `วันที่ ${l}`}
                        contentStyle={{
                          fontSize: 12,
                          borderRadius: 8,
                          border: `1px solid ${tooltipBorder}`,
                          background: tooltipBg,
                          color: tooltipFg,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="reading"
                        stroke="#0d9488"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: '#0d9488' }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <ul className="itam-scroll mt-3 max-h-48 space-y-1.5 overflow-y-auto">
                  {[...sortedReadings].reverse().map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {r.date}
                        </div>
                        <div className="text-sm font-medium text-slate-700 tabular-nums dark:text-slate-200">
                          {r.reading.toLocaleString()}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {r.remark && (
                          <span
                            className="max-w-[120px] truncate text-xs text-amber-600 dark:text-amber-400"
                            title={r.remark}
                          >
                            ⚠ {r.remark}
                          </span>
                        )}
                        <Badge
                          className={
                            'tabular-nums transition-colors hover:scale-105 ' +
                            (r.delta < 0
                              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : r.delta === 0
                                ? 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300')
                          }
                        >
                          {r.delta >= 0 ? '+' : ''}
                          {r.delta.toLocaleString()}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Transfer history */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <ArrowLeftRight className="h-3.5 w-3.5 text-[#f97316]" />
              ประวัติการย้าย ({transfers?.length ?? 0})
            </h3>
            {transfersLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !transfers || transfers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 py-8 text-slate-400 dark:border-slate-700 dark:text-slate-500">
                <MapPin className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">ยังไม่มีประวัติการย้าย</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">กดปุ่ม &quot;ย้ายอุปกรณ์&quot; ด้านล่างเพื่อบันทึกการย้าย</span>
              </div>
            ) : (
              <ol className="relative space-y-4 border-l-2 border-[#f97316]/30 pl-5">
                {transfers.map((t) => (
                  <li key={t.id} className="relative">
                    {/* connector dot */}
                    <span className="absolute -left-[26px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-[#f97316] bg-white dark:bg-slate-900">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#f97316]" />
                    </span>
                    <div className="rounded-md border border-slate-100 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono">{t.transferDate}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                        <span>{t.fromSite ?? '—'}</span>
                        {t.fromDept && (
                          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                            ({t.fromDept})
                          </span>
                        )}
                        <ArrowRight className="h-3.5 w-3.5 text-[#f97316]" />
                        <span className="text-[#f97316]">{t.toSite}</span>
                        {t.toDept && (
                          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                            ({t.toDept})
                          </span>
                        )}
                      </div>
                      {t.reason && (
                        <div className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                          📝 {t.reason}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Assignment history timeline */}
          <section>
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <User className="h-3.5 w-3.5 text-[#0d9488]" />
              ประวัติการมอบหมาย ({assignments?.length ?? 0})
            </h3>
            {assignmentsLoading ? (
              <Skeleton className="h-24 w-full dark:bg-slate-800" />
            ) : !assignments || assignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 py-8 text-slate-400 dark:border-slate-700 dark:text-slate-500">
                <User className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">ยังไม่มีประวัติการมอบหมาย</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">กดปุ่ม &quot;มอบหมาย&quot; ด้านบนเพื่อบันทึกการมอบหมาย</span>
              </div>
            ) : (
              <ol className="relative space-y-4 border-l-2 border-[#0d9488]/30 pl-5">
                {assignments.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[26px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-[#0d9488] bg-white dark:bg-slate-900">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#0d9488]" />
                    </span>
                    <div className="rounded-md border border-slate-100 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          {a.checkoutDate}
                        </div>
                        <Badge
                          className={
                            a.status === 'active'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }
                        >
                          {a.status === 'active' ? 'กำลังใช้งาน' : 'คืนแล้ว'}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                        <User className="h-3.5 w-3.5 text-[#0d9488]" />
                        <span>{a.assignee}</span>
                        {a.assigneeRole && (
                          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                            · {a.assigneeRole}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {a.department && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {a.department}
                          </span>
                        )}
                        {a.expectedReturnDate && (
                          <span>กำหนดคืน {formatThaiDate(a.expectedReturnDate)}</span>
                        )}
                        {a.actualReturnDate && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            คืนจริง {formatThaiDate(a.actualReturnDate)}
                          </span>
                        )}
                      </div>
                      {a.notes && (
                        <div className="mt-1.5 rounded bg-teal-50 px-2 py-1 text-xs text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                          📝 {a.notes}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* License records section */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <KeyRound className="h-3.5 w-3.5 text-[#0d9488]" />
                ลิขสิทธิ์ซอฟต์แวร์ ({licenses?.length ?? 0})
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={openLicenseDialog}
                disabled={!device}
                className="h-7 border-[#0d9488]/40 text-[#0d9488] hover:bg-[#0d9488]/10 focus-visible:ring-2 focus-visible:ring-[#0d9488] focus-visible:ring-offset-1 dark:border-[#14b8a6]/40 dark:text-[#14b8a6] dark:focus-visible:ring-offset-slate-950"
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่ม License
              </Button>
            </div>
            {licensesLoading ? (
              <Skeleton className="h-24 w-full dark:bg-slate-800" />
            ) : !licenses || licenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 py-8 text-slate-400 dark:border-slate-700 dark:text-slate-500">
                <KeyRound className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  ยังไม่มีลิขสิทธิ์ซอฟต์แวร์
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  กดปุ่ม &quot;เพิ่ม License&quot; ด้านบนเพื่อบันทึก License ใหม่
                </span>
              </div>
            ) : (
              <ul className="space-y-2">
                {licenses.map((lc) => (
                  <li
                    key={lc.id}
                    className="rounded-md border border-slate-100 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {lc.software}
                          </span>
                          {lc.licenseType && (
                            <Badge className="border-[#0d9488]/30 bg-[#0d9488]/10 text-[#0d9488] dark:border-[#14b8a6]/30 dark:bg-[#14b8a6]/10 dark:text-[#14b8a6]">
                              {lc.licenseType}
                            </Badge>
                          )}
                          <Badge className="border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            จำนวน {lc.quantity}
                          </Badge>
                        </div>
                        {lc.licenseId && (
                          <div className="mt-0.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                            ID: {lc.licenseId}
                          </div>
                        )}
                        {lc.licenseKey && (
                          <div className="mt-1 font-mono text-xs text-slate-600 dark:text-slate-300">
                            Key: <span className="break-all">{lc.licenseKey}</span>
                          </div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {lc.expiryDate && (
                            <span>
                              หมดอายุ:{' '}
                              <span className="font-medium">
                                {formatThaiDate(lc.expiryDate)}
                              </span>
                            </span>
                          )}
                        </div>
                        {lc.remark && (
                          <div className="mt-1.5 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                            📝 {lc.remark}
                          </div>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteLicense(lc.id)}
                        disabled={deletingLicenseId === lc.id}
                        aria-label="ลบ License"
                        title="ลบ License"
                        className="h-7 w-7 shrink-0 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                      >
                        {deletingLicenseId === lc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <SheetFooter className="flex-row gap-2 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            <X className="h-4 w-4" />
            ปิด
          </Button>
          <Button
            variant="outline"
            onClick={openTransferDialog}
            disabled={!device}
            className="flex-1 border-[#f97316]/40 text-[#f97316] hover:bg-[#f97316]/10 focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
          >
            <ArrowLeftRight className="h-4 w-4" />
            🔄 ย้ายอุปกรณ์
          </Button>
          <Button
            onClick={handleEdit}
            disabled={!device || !onEdit}
            className="flex-1 bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
          >
            <Pencil className="h-4 w-4" />
            แก้ไข
          </Button>
        </SheetFooter>
      </SheetContent>

      {/* Transfer sub-dialog */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <ArrowLeftRight className="h-4 w-4 text-[#f97316]" />
              🔄 ย้ายอุปกรณ์
            </DialogTitle>
            <DialogDescription>
              {device?.name} ({device?.assetCode}) — ปัจจุบัน:{' '}
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {device?.site}
                {device?.department ? ` · ${device.department}` : ''}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                สาขาปลายทาง *
              </Label>
              <Select value={tSite} onValueChange={setTSite}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="เลือกสาขา" />
                </SelectTrigger>
                <SelectContent>
                  {(sites ?? []).map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  แผนกใหม่
                </Label>
                <Input
                  value={tDept}
                  onChange={(e) => setTDept(e.target.value)}
                  placeholder="เช่น IT"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  รหัสแผนกใหม่
                </Label>
                <Input
                  value={tDeptCode}
                  onChange={(e) => setTDeptCode(e.target.value)}
                  placeholder="เช่น IT-001"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                วันที่ย้าย *
              </Label>
              <Input
                type="date"
                value={tDate}
                onChange={(e) => setTDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                เหตุผลการย้าย
              </Label>
              <Textarea
                value={tReason}
                onChange={(e) => setTReason(e.target.value)}
                placeholder="เช่น ย้ายไปใช้ที่แผนกใหม่ / เปลี่ยนสาขา"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTransferOpen(false)}
              disabled={transferring}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={confirmTransfer}
              disabled={transferring || !tSite}
              className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {transferring ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  กำลังย้าย...
                </>
              ) : (
                'ยืนยันการย้าย'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign sub-dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <UserPlus className="h-4 w-4 text-[#0d9488]" />
              👤 มอบหมายอุปกรณ์
            </DialogTitle>
            <DialogDescription>
              {device?.name} ({device?.assetCode}) — ระบุผู้รับมอบหมายเพื่อติดตามการใช้งาน
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                ผู้รับมอบหมาย *
              </Label>
              <Input
                value={aAssignee}
                onChange={(e) => setAAssignee(e.target.value)}
                placeholder="ชื่อ-นามสกุล หรือ email"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  ตำแหน่ง/บทบาท
                </Label>
                <Input
                  value={aRole}
                  onChange={(e) => setARole(e.target.value)}
                  placeholder="เช่น พนักงาน IT"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  แผนก
                </Label>
                <Input
                  value={aDept}
                  onChange={(e) => setADept(e.target.value)}
                  placeholder="เช่น IT"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  วันที่มอบ *
                </Label>
                <Input
                  type="date"
                  value={aCheckout}
                  onChange={(e) => setACheckout(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  กำหนดคืน
                </Label>
                <Input
                  type="date"
                  value={aExpectedReturn}
                  onChange={(e) => setAExpectedReturn(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                หมายเหตุ
              </Label>
              <Textarea
                value={aNotes}
                onChange={(e) => setANotes(e.target.value)}
                placeholder="หมายเหตุการมอบหมาย (ถ้ามี)"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignOpen(false)}
              disabled={assigning}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={confirmAssign}
              disabled={assigning || !aAssignee.trim()}
              className="border border-[#0d9488] bg-[#0d9488] text-white hover:bg-[#0f766e] focus-visible:ring-2 focus-visible:ring-[#0d9488] focus-visible:ring-offset-1 dark:border-[#14b8a6] dark:bg-[#14b8a6] dark:hover:bg-[#0d9488] dark:focus-visible:ring-offset-slate-950"
            >
              {assigning ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  กำลังมอบหมาย...
                </>
              ) : (
                'ยืนยันการมอบหมาย'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return sub-dialog */}
      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Undo2 className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              📥 คืนอุปกรณ์
            </DialogTitle>
            <DialogDescription>
              {device?.name} ({device?.assetCode}) — คืนจาก{' '}
              <span className="font-medium text-slate-600 dark:text-slate-300">
                {activeAssignment?.assignee}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                วันที่คืนจริง *
              </Label>
              <Input
                type="date"
                value={rReturnDate}
                onChange={(e) => setRReturnDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                หมายเหตุการคืน
              </Label>
              <Textarea
                value={rNotes}
                onChange={(e) => setRNotes(e.target.value)}
                placeholder="สภาพอุปกรณ์ / อุปกรณ์เสริมที่คืน / หมายเหตุอื่น ๆ"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReturnOpen(false)}
              disabled={returning}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={confirmReturn}
              disabled={returning}
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {returning ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  กำลังคืน...
                </>
              ) : (
                'ยืนยันการคืน'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* License add sub-dialog */}
      <Dialog open={licenseOpen} onOpenChange={setLicenseOpen}>
        <DialogContent className="sm:max-w-lg dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <KeyRound className="h-4 w-4 text-[#0d9488]" />
              🔑 เพิ่ม License ให้ {device?.assetCode}
            </DialogTitle>
            <DialogDescription>
              บันทึกลิขสิทธิ์ซอฟต์แวร์ของอุปกรณ์นี้
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                ชื่อซอฟต์แวร์ *
              </Label>
              <Input
                value={lcSoftware}
                onChange={(e) => setLcSoftware(e.target.value)}
                placeholder="เช่น Microsoft Office 2021, Windows 11 Pro"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                License ID
              </Label>
              <Input
                value={lcLicenseId}
                onChange={(e) => setLcLicenseId(e.target.value)}
                placeholder="เช่น LIC-0001"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                ประเภท License
              </Label>
              <Select
                value={lcLicenseType}
                onValueChange={(v) =>
                  setLcLicenseType(v === '__none__' ? '' : v)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="เลือกประเภท" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— ไม่ระบุ —</SelectItem>
                  {LICENSE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                License Key / Product Key
              </Label>
              <Input
                value={lcLicenseKey}
                onChange={(e) => setLcLicenseKey(e.target.value)}
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                จำนวน (Quantity)
              </Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={lcQuantity}
                onChange={(e) => setLcQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                วันหมดอายุ
              </Label>
              <Input
                type="date"
                value={lcExpiryDate}
                onChange={(e) => setLcExpiryDate(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                หมายเหตุ
              </Label>
              <Textarea
                value={lcRemark}
                onChange={(e) => setLcRemark(e.target.value)}
                rows={2}
                placeholder="หมายเหตุเพิ่มเติม"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setLicenseOpen(false)}
              disabled={savingLicense}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={saveLicense}
              disabled={savingLicense}
              className="bg-[#0d9488] text-white hover:bg-[#0f766e] focus-visible:ring-2 focus-visible:ring-[#0d9488] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {savingLicense ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                'บันทึก'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  )
}
