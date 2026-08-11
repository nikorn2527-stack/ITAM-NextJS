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
} from 'lucide-react'
import type { Device, MeterReading, DeviceTransfer, Site } from './types'
import {
  statusBadgeClass,
  statusLabel,
  computeWarranty,
  warrantyBadgeClass,
  warrantyLabel,
  formatThaiDate,
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
    </Sheet>
  )
}
