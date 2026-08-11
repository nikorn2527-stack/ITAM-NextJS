'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
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
import { Gauge, CalendarClock, Plus, RefreshCw, AlertTriangle, Download } from 'lucide-react'
import type { Device, Cycle, MeterReading } from './types'
import { statusBadgeClass, statusLabel } from './types'
import { downloadCsv, dateStamp } from '@/lib/csv'

const METER_CSV_HEADERS = [
  { key: 'date', label: 'วันที่' },
  { key: 'assetCode', label: 'รหัสอุปกรณ์' },
  { key: 'deviceName', label: 'ชื่ออุปกรณ์' },
  { key: 'brand', label: 'แบรนด์' },
  { key: 'model', label: 'รุ่น' },
  { key: 'prevReading', label: 'ค่าก่อนหน้า' },
  { key: 'reading', label: 'ค่ามิเตอร์' },
  { key: 'delta', label: 'ส่วนต่าง' },
  { key: 'remark', label: 'หมายเหตุ' },
]

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export function MeterPage() {
  const qc = useQueryClient()
  const [readingTarget, setReadingTarget] = React.useState<Device | null>(null)
  const [newReading, setNewReading] = React.useState('')
  const [readingDate, setReadingDate] = React.useState(todayISO())
  const [remark, setRemark] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [cycleDialogOpen, setCycleDialogOpen] = React.useState(false)
  const [cycleName, setCycleName] = React.useState('')
  const [cycleStart, setCycleStart] = React.useState(todayISO())
  const [cycleEnd, setCycleEnd] = React.useState(todayISO())
  const [creatingCycle, setCreatingCycle] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)

  const { data: activeCycle } = useQuery<Cycle | null>({
    queryKey: ['active-cycle'],
    queryFn: async () => {
      const res = await fetch('/api/cycles?status=active')
      if (!res.ok) return null
      const json = await res.json()
      return (json.cycles?.[0] as Cycle | undefined) ?? null
    },
  })

  const { data: devices, isLoading } = useQuery<Device[]>({
    queryKey: ['devices-meter'],
    queryFn: async () => {
      const res = await fetch('/api/devices')
      if (!res.ok) throw new Error('Failed to load devices')
      const json = await res.json()
      return (json.devices as Device[]).filter(
        (d) => d.type === 'COPIER' || d.type === 'MFP' || d.type === 'PRINTER',
      )
    },
  })

  const meterableDevices = devices ?? []

  function openReadingDialog(d: Device) {
    setReadingTarget(d)
    setNewReading(String(d.lastMeterReading ?? 0))
    setReadingDate(todayISO())
    setRemark('')
  }

  const prevReading = readingTarget?.lastMeterReading ?? 0
  const newReadingNum = Number(newReading)
  const delta = Number.isFinite(newReadingNum) ? newReadingNum - prevReading : 0
  const isReset = newReadingNum < prevReading
  const isExceed = delta > 20000
  const needsRemark = isReset && !remark.trim()

  async function saveReading() {
    if (!readingTarget) return
    if (!Number.isFinite(newReadingNum)) {
      toast.error('กรุณากรอกค่ามิเตอร์เป็นตัวเลข')
      return
    }
    if (needsRemark) {
      toast.error('ค่าใหม่น้อยกว่าค่าก่อนหน้า กรุณาระบุหมายเหตุ (RESET)')
      return
    }
    try {
      setSaving(true)
      const res = await fetch('/api/meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: readingTarget.id,
          reading: newReadingNum,
          date: readingDate,
          remark: remark.trim() || null,
          cycleId: activeCycle?.id ?? null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Save failed')
      }
      const json = await res.json()
      if (json.warning) {
        toast.warning(json.warning)
      } else {
        toast.success('บันทึกการจดมิเตอร์แล้ว')
      }
      setReadingTarget(null)
      await qc.invalidateQueries({ queryKey: ['devices-meter'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
      await qc.invalidateQueries({ queryKey: ['active-cycle'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function createCycle() {
    if (!cycleName || !cycleStart || !cycleEnd) {
      toast.error('กรุณากรอกชื่อรอบและวันที่ให้ครบ')
      return
    }
    try {
      setCreatingCycle(true)
      const res = await fetch('/api/cycles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cycleName,
          startDate: cycleStart,
          endDate: cycleEnd,
          status: 'active',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Create cycle failed')
      }
      toast.success('สร้างรอบจดมิเตอร์ใหม่แล้ว')
      setCycleDialogOpen(false)
      setCycleName('')
      await qc.invalidateQueries({ queryKey: ['active-cycle'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create cycle failed')
    } finally {
      setCreatingCycle(false)
    }
  }

  const remainingDays = activeCycle
    ? daysBetween(todayISO(), activeCycle.endDate)
    : null

  async function exportCsv() {
    try {
      setExporting(true)
      const res = await fetch('/api/meter')
      if (!res.ok) throw new Error('Failed to export')
      const json = await res.json()
      const rows = ((json.readings ?? []) as MeterReading[]).map((r) => ({
        date: r.date,
        assetCode: r.device?.assetCode ?? '',
        deviceName: r.device?.name ?? '',
        brand: r.device?.brand ?? '',
        model: r.device?.model ?? '',
        prevReading: r.prevReading,
        reading: r.reading,
        delta: r.delta,
        remark: r.remark ?? '',
      }))
      downloadCsv(`meter-readings-${dateStamp()}.csv`, rows, METER_CSV_HEADERS)
      toast.success(`ส่งออก ${rows.length} รายการแล้ว`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">จดมิเตอร์</h1>
          <p className="text-sm text-slate-500">
            บันทึกการอ่านค่ามิเตอร์เครื่องพิมพ์ / ถ่ายเอกสาร
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setCycleDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            จัดการรอบ
          </Button>
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={exporting}
          >
            <Download className="h-4 w-4" />
            {exporting ? 'กำลังส่งออก...' : 'ส่งออก CSV'}
          </Button>
          <Button
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ['devices-meter'] })}
          >
            <RefreshCw className="h-4 w-4" />
            รีเฟรช
          </Button>
        </div>
      </div>

      {/* Cycle bento card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-[#f97316]" />
              รอบจดมิเตอร์ปัจจุบัน
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeCycle ? (
              <div className="space-y-2">
                <div className="text-lg font-semibold text-slate-800">
                  {activeCycle.name}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  <span>📅 {activeCycle.startDate} → {activeCycle.endDate}</span>
                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    {activeCycle.status === 'active' ? 'กำลังดำเนินการ' : activeCycle.status}
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                ยังไม่มีรอบจดมิเตอร์ที่กำลังดำเนินการ
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex h-full flex-col items-center justify-center p-6 text-center">
            <Gauge className="mb-2 h-8 w-8 text-[#f97316]" />
            <div className="text-xs font-medium text-slate-500">เหลือเวลา</div>
            {remainingDays === null ? (
              <div className="text-sm text-slate-400">—</div>
            ) : (
              <>
                <div className="text-3xl font-bold text-slate-800">
                  {remainingDays}
                </div>
                <div className="text-xs text-slate-500">วัน</div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Devices table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">รายการอุปกรณ์ที่ต้องจดมิเตอร์</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="itam-scroll max-h-[55vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อ</TableHead>
                  <TableHead>แบรนด์/รุ่น</TableHead>
                  <TableHead>ประเภท</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>สาขา</TableHead>
                  <TableHead className="text-right">ค่าล่าสุด</TableHead>
                  <TableHead className="text-right">จดมิเตอร์</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={8}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : meterableDevices.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-8 text-center text-sm text-slate-400"
                    >
                      ไม่พบอุปกรณ์ที่ต้องจดมิเตอร์
                    </TableCell>
                  </TableRow>
                ) : (
                  meterableDevices.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs font-medium text-slate-700">
                        {d.assetCode}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {d.name}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {d.brand} {d.model}
                      </TableCell>
                      <TableCell>{d.type}</TableCell>
                      <TableCell>
                        <Badge className={statusBadgeClass(d.status)}>
                          {statusLabel(d.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{d.site}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {d.lastMeterReading.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => openReadingDialog(d)}
                          className="bg-[#f97316] text-white hover:bg-[#ea580c]"
                        >
                          <Gauge className="h-3.5 w-3.5" />
                          จดมิเตอร์
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

      {/* Reading Dialog */}
      <Dialog
        open={Boolean(readingTarget)}
        onOpenChange={(o) => !o && setReadingTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>📈 จดมิเตอร์</DialogTitle>
            <DialogDescription>
              {readingTarget?.name} ({readingTarget?.assetCode})
            </DialogDescription>
          </DialogHeader>

          {readingTarget && (
            <div className="space-y-3">
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">ค่าก่อนหน้า</span>
                  <span className="font-mono font-semibold text-slate-700">
                    {prevReading.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">
                  ค่ามิเตอร์ใหม่ *
                </Label>
                <Input
                  type="number"
                  value={newReading}
                  onChange={(e) => setNewReading(e.target.value)}
                  className={
                    isReset ? 'border-amber-400 focus-visible:ring-amber-200' : ''
                  }
                />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    ส่วนต่าง:{' '}
                    <span
                      className={
                        delta < 0
                          ? 'font-semibold text-amber-600'
                          : delta > 20000
                            ? 'font-semibold text-rose-600'
                            : 'font-semibold text-emerald-600'
                      }
                    >
                      {delta > 0 ? '+' : ''}
                      {delta.toLocaleString()} แผ่น
                    </span>
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">
                  วันที่จด *
                </Label>
                <Input
                  type="date"
                  value={readingDate}
                  onChange={(e) => setReadingDate(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">
                  หมายเหตุ {isReset && <span className="text-amber-600">* (จำเป็น)</span>}
                </Label>
                <Textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder={
                    isReset
                      ? 'ระบุเหตุผลที่ค่าลดลง เช่น เปลี่ยนชิ้นส่วน / RESET เคาน์เตอร์'
                      : 'หมายเหตุเพิ่มเติม (ถ้ามี)'
                  }
                  rows={2}
                />
              </div>

              {isReset && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    ค่าใหม่น้อยกว่าค่าก่อนหน้า ({delta.toLocaleString()}) ต้องระบุหมายเหตุเพื่อยืนยันการ RESET
                  </span>
                </div>
              )}
              {isExceed && !isReset && (
                <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    ค่าเพิ่มขึ้นเกิน 20,000 แผ่น ({delta.toLocaleString()}) ระบบจะบันทึกแต่แจ้งเตือนให้ตรวจสอบ
                  </span>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReadingTarget(null)}
              disabled={saving}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={saveReading}
              disabled={saving || needsRemark}
              className="bg-[#f97316] text-white hover:bg-[#ea580c]"
            >
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cycle manage dialog */}
      <Dialog open={cycleDialogOpen} onOpenChange={setCycleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>จัดการรอบจดมิเตอร์</DialogTitle>
            <DialogDescription>
              สร้างรอบใหม่ (รอบเดิมที่กำลังดำเนินการจะถูกปิดอัตโนมัติ)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">
                ชื่อรอบ *
              </Label>
              <Input
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
                placeholder="เช่น รอบจดมิเตอร์ ต.ค. 2025"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">
                  วันเริ่ม *
                </Label>
                <Input
                  type="date"
                  value={cycleStart}
                  onChange={(e) => setCycleStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">
                  วันสิ้นสุด *
                </Label>
                <Input
                  type="date"
                  value={cycleEnd}
                  onChange={(e) => setCycleEnd(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCycleDialogOpen(false)}
              disabled={creatingCycle}
            >
              ยกเลิก
            </Button>
            <Button
              onClick={createCycle}
              disabled={creatingCycle}
              className="bg-[#f97316] text-white hover:bg-[#ea580c]"
            >
              {creatingCycle ? 'กำลังสร้าง...' : 'สร้างรอบ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// (no extra exports)
