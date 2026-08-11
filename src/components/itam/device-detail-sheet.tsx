'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Pencil, X, Gauge, Inbox } from 'lucide-react'
import type { Device, MeterReading } from './types'
import { statusBadgeClass, statusLabel } from './types'

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

export function DeviceDetailSheet({ deviceId, onClose, onEdit }: Props) {
  const open = Boolean(deviceId)
  const { theme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const isDark = mounted && theme === 'dark'
  const gridStroke = isDark ? '#334155' : '#e2e8f0'
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0'
  const tooltipBg = isDark ? '#0f172a' : '#ffffff'
  const tooltipFg = isDark ? '#e2e8f0' : '#1e293b'

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
                <Badge className={statusBadgeClass(device.status)}>
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
                <InfoRow label="วันที่ซื้อ" value={device.purchaseDate} />
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
                <Inbox className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                <span className="text-sm">ยังไม่มีประวัติการจดมิเตอร์</span>
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
                            r.delta < 0
                              ? 'border-amber-200 bg-amber-50 text-amber-700 tabular-nums dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : r.delta === 0
                                ? 'border-slate-200 bg-slate-100 text-slate-600 tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 tabular-nums dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
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
            onClick={handleEdit}
            disabled={!device || !onEdit}
            className="flex-1 bg-[#f97316] text-white hover:bg-[#ea580c]"
          >
            <Pencil className="h-4 w-4" />
            แก้ไข
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
