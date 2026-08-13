'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pencil, Wrench, Package, History, Gauge, ArrowLeftRight, AlertTriangle, Loader2 } from 'lucide-react'

interface DeviceDetail {
  id: string
  assetCode: string
  type: string | null
  brand: string | null
  model: string | null
  serialNumber: string | null
  building: string | null
  floor: string | null
  department: string | null
  location: string | null
  departmentCode: string | null
  status: string
  site: string | null
  contractNo: string | null
  ip: string | null
  mac: string | null
  remoteId: string | null
  remark: string | null
  vendor: string | null
  purchaseDate: string | null
  warrantyEnd: string | null
  deviceGroup: string | null
  costCenter: string | null
  meterRequired: boolean
  meterMode: string | null
  assetSiteCode: string | null
  updatedAt: string | null
  meterReadings?: Array<{
    id: string; readingDate: string | null; readingMonth: string | null
    meterBw: number; meterColor: number; pagesBw: number; pagesColor: number; remark: string | null
  }>
  locationHistories?: Array<{
    id: string; logId: string | null; moveDate: string | null; action: string | null
    fromSite: string | null; toSite: string | null; fromAssetSiteCode: string | null; toAssetSiteCode: string | null
    movedBy: string | null; remark: string | null
  }>
  assignments?: Array<{
    id: string; assignee: string; assigneeRole: string | null
    department: string | null; checkoutDate: string | null
    actualReturnDate: string | null; status: string; notes: string | null
  }>
  maintenanceLogs?: Array<{
    id: string; type: string; status: string; startDate: string | null
    endDate: string | null; cost: number | null; vendor: string | null; description: string | null
  }>
}

interface Props {
  assetNo: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (assetNo: string) => void
}

const STATUS_BADGE: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  Inactive: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
  'In Stock': 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  'Pending Repair': 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  Retired: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm text-slate-700 dark:text-slate-200">{value || '—'}</div>
    </div>
  )
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('th-TH')
  } catch {
    return s
  }
}

interface Site {
  id: string
  siteCode: string
  siteName: string | null
  deviceCount?: number
  activeCount?: number
}

interface DeviceForCascading {
  site: string | null
  building: string | null
  floor: string | null
  department: string | null
}

export function ItamDeviceDetailSheet({ assetNo, open, onOpenChange, onEdit }: Props) {
  const qc = useQueryClient()

  const { data, isLoading, refetch } = useQuery<{ device: DeviceDetail }>({
    queryKey: ['itam-device-detail', assetNo],
    queryFn: async () => {
      const res = await fetch(`/api/itam/devices/${assetNo}`)
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    enabled: !!assetNo && open,
  })

  const device = data?.device

  // Assignment dialog
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [assignForm, setAssignForm] = React.useState({ assignee: '', assigneeRole: '', department: '', checkoutDate: '' })
  const [assignSaving, setAssignSaving] = React.useState(false)

  // Maintenance dialog
  const [mntOpen, setMntOpen] = React.useState(false)
  const [mntForm, setMntForm] = React.useState({ type: 'repair', status: 'open', startDate: '', cost: '', vendor: '', description: '' })
  const [mntSaving, setMntSaving] = React.useState(false)

  // Transfer dialog
  const [transferOpen, setTransferOpen] = React.useState(false)

  React.useEffect(() => {
    if (open && assetNo) {
      setAssignForm({ assignee: '', assigneeRole: '', department: '', checkoutDate: new Date().toISOString().slice(0, 10) })
      setMntForm({ type: 'repair', status: 'open', startDate: new Date().toISOString().slice(0, 10), cost: '', vendor: '', description: '' })
    }
  }, [open, assetNo])

  async function saveAssignment() {
    if (!assetNo || !assignForm.assignee || !assignForm.checkoutDate) {
      toast.error('กรุณากรอกชื่อผู้รับและวันที่มอบหมาย')
      return
    }
    try {
      setAssignSaving(true)
      const res = await fetch('/api/itam/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetNo,
          assignee: assignForm.assignee.trim(),
          assigneeRole: assignForm.assigneeRole || null,
          department: assignForm.department || null,
          checkoutDate: assignForm.checkoutDate,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed')
      }
      toast.success('มอบหมายแล้ว')
      setAssignOpen(false)
      await refetch()
      await qc.invalidateQueries({ queryKey: ['itam-devices'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setAssignSaving(false)
    }
  }

  async function saveMaintenance() {
    if (!assetNo || !mntForm.startDate) {
      toast.error('กรุณาระบุวันที่เริ่ม')
      return
    }
    try {
      setMntSaving(true)
      const res = await fetch('/api/itam/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetNo,
          type: mntForm.type,
          status: mntForm.status,
          startDate: mntForm.startDate,
          cost: mntForm.cost ? Number(mntForm.cost) : null,
          vendor: mntForm.vendor || null,
          description: mntForm.description || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed')
      }
      toast.success('บันทึกการซ่อมแล้ว')
      setMntOpen(false)
      await refetch()
      await qc.invalidateQueries({ queryKey: ['itam-devices'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setMntSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl dark:border-slate-800 dark:bg-slate-900">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <Package className="h-5 w-5 text-[#f97316]" />
            {assetNo}
            {device && (
              <Badge className={STATUS_BADGE[device.status] || 'bg-slate-100 text-slate-600'}>
                {device.status}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription className="text-slate-500 dark:text-slate-400">
            รายละเอียดอุปกรณ์ · มิเตอร์ · การมอบหมาย · การซ่อมบำรุง · ประวัติการย้าย
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !device ? (
          <div className="p-8 text-center text-sm text-slate-400">ไม่พบข้อมูล</div>
        ) : (
          <div className="space-y-4 px-4 pb-8">
            {/* Action bar */}
            <div className="flex flex-wrap gap-2">
              {onEdit && (
                <Button size="sm" variant="outline" onClick={() => onEdit(device.assetCode)} className="dark:bg-slate-800 dark:border-slate-700">
                  <Pencil className="h-3.5 w-3.5" /> แก้ไข
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)} className="dark:bg-slate-800 dark:border-slate-700">
                <ArrowLeftRight className="h-3.5 w-3.5" /> ย้ายตำแหน่ง
              </Button>
              <Button size="sm" variant="outline" onClick={() => refetch()} className="dark:bg-slate-800 dark:border-slate-700">
                <History className="h-3.5 w-3.5" /> รีเฟรช
              </Button>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
              <Field label="Asset No" value={device.assetCode} />
              <Field label="ประเภท" value={device.type} />
              <Field label="แบรนด์" value={device.brand} />
              <Field label="รุ่น" value={device.model} />
              <Field label="Serial" value={device.serialNumber} />
              <Field label="กลุ่ม" value={device.deviceGroup} />
              <Field label="สาขา" value={device.site} />
              <Field label="อาคาร" value={device.building} />
              <Field label="ชั้น" value={device.floor} />
              <Field label="แผนก" value={device.department} />
              <Field label="รหัสแผนก" value={device.departmentCode} />
              <Field label="ที่ตั้ง" value={device.location} />
              <Field label="IP" value={device.ip} />
              <Field label="MAC" value={device.mac} />
              <Field label="Remote ID" value={device.remoteId} />
              <Field label="สัญญา" value={device.contractNo} />
              <Field label="ผู้ขาย" value={device.vendor} />
              <Field label="Cost Center" value={device.costCenter} />
              <Field label="ติดตั้ง" value={fmtDate(device.purchaseDate)} />
              <Field label="หมดประกัน" value={fmtDate(device.warrantyEnd)} />
              <Field label="จดมิเตอร์" value={device.meterRequired ? <Badge className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300">✓ ต้องจด</Badge> : '—'} />
              <Field label="โหมดมิเตอร์" value={device.meterMode} />
              <Field label="Asset Site Code" value={device.assetSiteCode} />
              <Field label="หมายเหตุ" value={device.remark} />
            </div>

            {/* Tabs */}
            <Tabs defaultValue="meter" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="meter" className="flex-1">
                  <Gauge className="mr-1 h-3.5 w-3.5" /> มิเตอร์
                </TabsTrigger>
                <TabsTrigger value="assign" className="flex-1">
                  <Package className="mr-1 h-3.5 w-3.5" /> มอบหมาย
                </TabsTrigger>
                <TabsTrigger value="mnt" className="flex-1">
                  <Wrench className="mr-1 h-3.5 w-3.5" /> ซ่อมบำรุง
                </TabsTrigger>
                <TabsTrigger value="history" className="flex-1">
                  <History className="mr-1 h-3.5 w-3.5" /> ประวัติย้าย
                </TabsTrigger>
              </TabsList>

              {/* Meter tab */}
              <TabsContent value="meter" className="mt-3">
                <div className="rounded-md border border-slate-200 dark:border-slate-800">
                  <div className="itam-scroll max-h-72 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-slate-50/80 dark:bg-slate-900/80">
                        <TableRow>
                          <TableHead className="text-xs">วันที่</TableHead>
                          <TableHead className="text-right text-xs">มิเตอร์</TableHead>
                          <TableHead className="text-right text-xs">แผ่น</TableHead>
                          <TableHead className="text-xs">หมายเหตุ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(device.meterReadings ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="py-6 text-center text-xs text-slate-400">ยังไม่มีข้อมูลมิเตอร์</TableCell>
                          </TableRow>
                        ) : (
                          (device.meterReadings ?? []).map(r => (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-xs">{r.readingDate?.substring(0, 10) || '—'}</TableCell>
                              <TableCell className="text-right font-mono text-xs tabular-nums">
                                {r.meterBw.toLocaleString()}
                                {r.meterColor > 0 && (
                                  <span className="ml-1 text-[10px] text-slate-400">/ {r.meterColor.toLocaleString()}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  {(r.pagesBw + r.pagesColor).toLocaleString()}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-slate-400">{r.remark || '—'}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              {/* Assignment tab */}
              <TabsContent value="assign" className="mt-3 space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" className="bg-[#f97316] text-white hover:bg-[#ea580c]" onClick={() => setAssignOpen(true)}>
                    <Package className="h-3.5 w-3.5" /> มอบหมาย
                  </Button>
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-800">
                  <div className="itam-scroll max-h-72 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-slate-50/80 dark:bg-slate-900/80">
                        <TableRow>
                          <TableHead className="text-xs">ผู้รับ</TableHead>
                          <TableHead className="text-xs">ตำแหน่ง</TableHead>
                          <TableHead className="text-xs">แผนก</TableHead>
                          <TableHead className="text-xs">วันที่</TableHead>
                          <TableHead className="text-xs">สถานะ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(device.assignments ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-6 text-center text-xs text-slate-400">ยังไม่มีประวัติมอบหมาย</TableCell>
                          </TableRow>
                        ) : (
                          (device.assignments ?? []).map(a => (
                            <TableRow key={a.id}>
                              <TableCell className="text-xs font-medium">{a.assignee}</TableCell>
                              <TableCell className="text-xs text-slate-500">{a.assigneeRole || '—'}</TableCell>
                              <TableCell className="text-xs text-slate-500">{a.department || '—'}</TableCell>
                              <TableCell className="font-mono text-xs">{fmtDate(a.checkoutDate)}</TableCell>
                              <TableCell>
                                <Badge className={a.status === 'active'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}>
                                  {a.status === 'active' ? 'ใช้งาน' : 'คืนแล้ว'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              {/* Maintenance tab */}
              <TabsContent value="mnt" className="mt-3 space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" className="bg-[#f97316] text-white hover:bg-[#ea580c]" onClick={() => setMntOpen(true)}>
                    <Wrench className="h-3.5 w-3.5" /> บันทึกซ่อม
                  </Button>
                </div>
                <div className="rounded-md border border-slate-200 dark:border-slate-800">
                  <div className="itam-scroll max-h-72 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-slate-50/80 dark:bg-slate-900/80">
                        <TableRow>
                          <TableHead className="text-xs">ประเภท</TableHead>
                          <TableHead className="text-xs">วันที่</TableHead>
                          <TableHead className="text-xs">ร้านซ่อม</TableHead>
                          <TableHead className="text-right text-xs">ค่าซ่อม</TableHead>
                          <TableHead className="text-xs">สถานะ</TableHead>
                          <TableHead className="text-xs">รายละเอียด</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(device.maintenanceLogs ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="py-6 text-center text-xs text-slate-400">ยังไม่มีประวัติซ่อม</TableCell>
                          </TableRow>
                        ) : (
                          (device.maintenanceLogs ?? []).map(m => (
                            <TableRow key={m.id}>
                              <TableCell>
                                <Badge className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800">
                                  {m.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs">{fmtDate(m.startDate)}</TableCell>
                              <TableCell className="text-xs">{m.vendor || '—'}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{m.cost != null ? `฿${m.cost.toLocaleString()}` : '—'}</TableCell>
                              <TableCell>
                                <Badge className={m.status === 'completed'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : m.status === 'open'
                                    ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}>
                                  {m.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-xs truncate text-xs text-slate-500" title={m.description || ''}>{m.description || '—'}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              {/* Location history tab */}
              <TabsContent value="history" className="mt-3">
                <div className="rounded-md border border-slate-200 dark:border-slate-800">
                  <div className="itam-scroll max-h-72 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-slate-50/80 dark:bg-slate-900/80">
                        <TableRow>
                          <TableHead className="text-xs">วันที่</TableHead>
                          <TableHead className="text-xs">การกระทำ</TableHead>
                          <TableHead className="text-xs">จาก</TableHead>
                          <TableHead className="text-xs">ไป</TableHead>
                          <TableHead className="text-xs">AssetSiteCode</TableHead>
                          <TableHead className="text-xs">โดย</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(device.locationHistories ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="py-6 text-center text-xs text-slate-400">ยังไม่มีประวัติการย้าย</TableCell>
                          </TableRow>
                        ) : (
                          (device.locationHistories ?? []).map(h => (
                            <TableRow key={h.id}>
                              <TableCell className="font-mono text-xs">{h.moveDate?.substring(0, 16) || '—'}</TableCell>
                              <TableCell>
                                <Badge className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800">
                                  {h.action || 'TRANSFER'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                                {h.fromSite || '—'}
                                {h.fromAssetSiteCode && <span className="ml-1 text-[10px] text-slate-400">({h.fromAssetSiteCode})</span>}
                              </TableCell>
                              <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                                {h.toSite || '—'}
                                {h.toAssetSiteCode && <span className="ml-1 text-[10px] text-slate-400">({h.toAssetSiteCode})</span>}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {h.fromAssetSiteCode && h.toAssetSiteCode && h.fromAssetSiteCode !== h.toAssetSiteCode ? (
                                  <span className="text-[#f97316]">{h.fromAssetSiteCode} → {h.toAssetSiteCode}</span>
                                ) : (
                                  <span className="text-slate-400">{h.toAssetSiteCode || '—'}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-slate-400">{h.movedBy || '—'}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>

      {/* Assignment dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader><DialogTitle>📦 มอบหมายอุปกรณ์</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">รหัสอุปกรณ์</Label>
              <Input value={assetNo ?? ''} disabled className="bg-slate-50 dark:bg-slate-800" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ผู้รับมอบ *</Label>
              <Input value={assignForm.assignee} onChange={(e) => setAssignForm({ ...assignForm, assignee: e.target.value })} placeholder="ชื่อ-นามสกุล" className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ตำแหน่ง</Label>
              <Input value={assignForm.assigneeRole} onChange={(e) => setAssignForm({ ...assignForm, assigneeRole: e.target.value })} placeholder="เช่น เจ้าหน้าที่" className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">แผนก</Label>
              <Input value={assignForm.department} onChange={(e) => setAssignForm({ ...assignForm, department: e.target.value })} placeholder="เช่น ไอที" className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">วันที่มอบ *</Label>
              <Input type="date" value={assignForm.checkoutDate} onChange={(e) => setAssignForm({ ...assignForm, checkoutDate: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveAssignment} disabled={assignSaving} className="bg-[#f97316] text-white hover:bg-[#ea580c]">
              {assignSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Maintenance dialog */}
      <Dialog open={mntOpen} onOpenChange={setMntOpen}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader><DialogTitle>🔧 บันทึกการซ่อมบำรุง</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">รหัสอุปกรณ์</Label>
              <Input value={assetNo ?? ''} disabled className="bg-slate-50 dark:bg-slate-800" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">ประเภท *</Label>
                <Select value={mntForm.type} onValueChange={(v) => setMntForm({ ...mntForm, type: v })}>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="repair">ซ่อม</SelectItem>
                    <SelectItem value="maintenance">บำรุงรักษา</SelectItem>
                    <SelectItem value="inspection">ตรวจสอบ</SelectItem>
                    <SelectItem value="upgrade">อัปเกรด</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">สถานะ</Label>
                <Select value={mntForm.status} onValueChange={(v) => setMntForm({ ...mntForm, status: v })}>
                  <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">เปิด</SelectItem>
                    <SelectItem value="in_progress">กำลังดำเนินการ</SelectItem>
                    <SelectItem value="completed">เสร็จสิ้น</SelectItem>
                    <SelectItem value="cancelled">ยกเลิก</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">วันที่เริ่ม *</Label>
                <Input type="date" value={mntForm.startDate} onChange={(e) => setMntForm({ ...mntForm, startDate: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ค่าซ่อม (฿)</Label>
                <Input type="number" value={mntForm.cost} onChange={(e) => setMntForm({ ...mntForm, cost: e.target.value })} placeholder="0" className="dark:bg-slate-800 dark:border-slate-700" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ร้านซ่อม/ผู้ให้บริการ</Label>
              <Input value={mntForm.vendor} onChange={(e) => setMntForm({ ...mntForm, vendor: e.target.value })} placeholder="เช่น ABC Service" className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">รายละเอียด/อาการ</Label>
              <Textarea value={mntForm.description} onChange={(e) => setMntForm({ ...mntForm, description: e.target.value })} rows={2} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMntOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveMaintenance} disabled={mntSaving} className="bg-[#f97316] text-white hover:bg-[#ea580c]">
              {mntSaving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      {device && (
        <TransferDialog
          open={transferOpen}
          onOpenChange={setTransferOpen}
          device={device}
          onTransferred={async () => {
            await refetch()
            await qc.invalidateQueries({ queryKey: ['itam-devices'] })
            await qc.invalidateQueries({ queryKey: ['itam-dashboard'] })
          }}
        />
      )}
    </Sheet>
  )
}

// =============== Transfer Dialog (Phase 2) =================

interface TransferDialogProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  device: DeviceDetail
  onTransferred: () => void | Promise<void>
}

interface TransferFormState {
  toSite: string
  toBuilding: string
  toFloor: string
  toDepartment: string
  toDepartmentCode: string
  toLocation: string
  toAssetSiteCode: string
  meterBw: string
  meterColor: string
  meterRemark: string
  skipMeterReason: string
}

function emptyTransferForm(): TransferFormState {
  return {
    toSite: '',
    toBuilding: '',
    toFloor: '',
    toDepartment: '',
    toDepartmentCode: '',
    toLocation: '',
    toAssetSiteCode: '',
    meterBw: '',
    meterColor: '',
    meterRemark: '',
    skipMeterReason: '',
  }
}

function TransferDialog({ open, onOpenChange, device, onTransferred }: TransferDialogProps) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState<TransferFormState>(emptyTransferForm())
  const [saving, setSaving] = React.useState(false)
  const [meterPath, setMeterPath] = React.useState<'none' | 'meter' | 'skip'>('none')
  const [meterReadingId, setMeterReadingId] = React.useState<string | null>(null)

  // Sites list + cascading devices (for building/floor/department suggestions).
  const { data: sitesData } = useQuery<{ sites: Site[] }>({
    queryKey: ['itam-sites'],
    queryFn: async () => {
      const res = await fetch('/api/itam/sites')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })
  const { data: cascadeData } = useQuery<{ devices: DeviceForCascading[] }>({
    queryKey: ['itam-devices-cascade', 'transfer'],
    queryFn: async () => {
      // Pull 100 devices to seed cascading dropdowns. We accept this cost once
      // per open; users with a small allowedSites set get an even smaller fetch.
      const res = await fetch('/api/itam/devices?limit=100')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    enabled: open,
  })

  const sites = sitesData?.sites ?? []

  // Reset form when dialog opens.
  React.useEffect(() => {
    if (open) {
      setForm(emptyTransferForm())
      setMeterPath('none')
      setMeterReadingId(null)
    }
  }, [open, device.assetCode])

  // Compute cascading suggestions for the currently-chosen target site.
  const buildingsForSite = React.useMemo(() => {
    if (!cascadeData?.devices || !form.toSite) return []
    const set = new Set<string>()
    for (const d of cascadeData.devices) {
      if (d.site === form.toSite && d.building) set.add(d.building)
    }
    return Array.from(set).sort()
  }, [cascadeData, form.toSite])

  const floorsForBuilding = React.useMemo(() => {
    if (!cascadeData?.devices || !form.toSite || !form.toBuilding) return []
    const set = new Set<string>()
    for (const d of cascadeData.devices) {
      if (d.site === form.toSite && d.building === form.toBuilding && d.floor) set.add(d.floor)
    }
    return Array.from(set).sort()
  }, [cascadeData, form.toSite, form.toBuilding])

  const departmentsForFloor = React.useMemo(() => {
    if (!cascadeData?.devices || !form.toSite || !form.toBuilding || !form.toFloor) return []
    const set = new Set<string>()
    for (const d of cascadeData.devices) {
      if (
        d.site === form.toSite &&
        d.building === form.toBuilding &&
        d.floor === form.toFloor &&
        d.department
      ) {
        set.add(d.department)
      }
    }
    return Array.from(set).sort()
  }, [cascadeData, form.toSite, form.toBuilding, form.toFloor])

  // Pre-fill the new location fields when target site = current site (i.e.
  // user is just relocating within the same site). We prefill with the
  // device's existing values so they can edit just the bits that change.
  React.useEffect(() => {
    if (open && form.toSite === device.site) {
      setForm((prev) => ({
        ...prev,
        toBuilding: prev.toBuilding || device.building || '',
        toFloor: prev.toFloor || device.floor || '',
        toDepartment: prev.toDepartment || device.department || '',
        toDepartmentCode: prev.toDepartmentCode || device.departmentCode || '',
        toLocation: prev.toLocation || device.location || '',
        toAssetSiteCode: prev.toAssetSiteCode || device.assetSiteCode || '',
      }))
    }
  }, [open, form.toSite, device])

  // Quick meter path: save the meter reading first (so the transfer endpoint
  // can reference it via meterReadingId), then perform the transfer.
  async function preSaveMeterReading(): Promise<string | null> {
    if (!form.meterBw) {
      toast.error('กรุณากรอกค่ามิเตอร์')
      return null
    }
    try {
      const res = await fetch('/api/itam/meter-readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetCode: device.assetCode,
          meterBw: Number(form.meterBw),
          meterColor: form.meterColor ? Number(form.meterColor) : 0,
          remark: form.meterRemark || 'จดมิเตอร์ก่อนย้าย',
          readingType: 'CHECKOUT',
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Save meter failed')
      }
      const j = await res.json()
      return j.reading?.id as string | null
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
      return null
    }
  }

  async function doTransfer() {
    if (!form.toSite) {
      toast.error('กรุณาระบุสาขาปลายทาง')
      return
    }
    if (form.toSite === device.site && !form.toBuilding && !form.toFloor && !form.toDepartment && !form.toLocation) {
      toast.error('ต้องเปลี่ยนอย่างน้อยหนึ่งฟิลด์ (อาคาร/ชั้น/แผนก/ที่ตั้ง) เมื่อย้ายในสาขาเดิม')
      return
    }

    let finalMeterReadingId: string | null = meterReadingId
    if (device.meterRequired && meterPath === 'meter' && !finalMeterReadingId) {
      setSaving(true)
      finalMeterReadingId = await preSaveMeterReading()
      setSaving(false)
      if (!finalMeterReadingId) return
      setMeterReadingId(finalMeterReadingId)
    }

    if (device.meterRequired && meterPath === 'none' && !finalMeterReadingId && !form.skipMeterReason.trim()) {
      toast.error('อุปกรณ์นี้ต้องจดมิเตอร์ก่อนย้าย — เลือก “จดมิเตอร์เลย” หรือ “ระบุเหตุผลที่จดไม่ได้”')
      return
    }

    try {
      setSaving(true)
      const res = await fetch(`/api/itam/devices/${device.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toSite: form.toSite,
          toBuilding: form.toBuilding || null,
          toFloor: form.toFloor || null,
          toDepartment: form.toDepartment || null,
          toDepartmentCode: form.toDepartmentCode || null,
          toLocation: form.toLocation || null,
          toAssetSiteCode: form.toAssetSiteCode || null,
          meterReadingId: finalMeterReadingId,
          skipMeterReason: form.skipMeterReason.trim() || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Transfer failed')
      }
      const j = await res.json()
      toast.success(
        j.reusedAssetSiteCode
          ? 'ย้ายอุปกรณ์แล้ว (กลับสู่ AssetSiteCode เดิม)'
          : `ย้ายอุปกรณ์แล้ว${j.locationHistory?.toAssetSiteCode ? ` · ${j.locationHistory.toAssetSiteCode}` : ''}`,
        { description: `${j.locationHistory?.fromSite || '—'} → ${j.locationHistory?.toSite || '—'}` },
      )
      onOpenChange(false)
      await qc.invalidateQueries({ queryKey: ['itam-readings'] })
      await onTransferred()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  const meterModeIsColor = (device.meterMode || 'TOTAL').toUpperCase() === 'BW_COLOR'
  const crossSite = form.toSite !== '' && form.toSite !== device.site

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg dark:border-slate-800 dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <ArrowLeftRight className="h-5 w-5 text-[#f97316]" />
            🔄 ย้ายตำแหน่งอุปกรณ์
          </DialogTitle>
          <DialogDescription>
            รหัส {device.assetCode} · {device.brand || ''} {device.model || ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* From (read-only) */}
          <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              ตำแหน่งปัจจุบัน
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-slate-700 dark:text-slate-200">
              <div><span className="text-slate-400">สาขา:</span> {device.site || '—'}</div>
              <div><span className="text-slate-400">AssetSiteCode:</span> <span className="font-mono">{device.assetSiteCode || '—'}</span></div>
              <div><span className="text-slate-400">อาคาร:</span> {device.building || '—'}</div>
              <div><span className="text-slate-400">ชั้น:</span> {device.floor || '—'}</div>
              <div><span className="text-slate-400">แผนก:</span> {device.department || '—'}</div>
              <div><span className="text-slate-400">ที่ตั้ง:</span> {device.location || '—'}</div>
            </div>
          </div>

          {/* To (editable) */}
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              ตำแหน่งใหม่
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">สาขาปลายทาง *</Label>
              <Select
                value={form.toSite}
                onValueChange={(v) => {
                  setForm({
                    ...emptyTransferForm(),
                    toSite: v,
                    toAssetSiteCode: '',
                  })
                  setMeterPath('none')
                  setMeterReadingId(null)
                }}
              >
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700">
                  <SelectValue placeholder="เลือกสาขา" />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.siteName || s.siteCode}>
                      {s.siteName || s.siteCode} <span className="ml-1 text-[10px] text-slate-400">({s.siteCode})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.toSite && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">อาคาร</Label>
                    <Input
                      list="transfer-buildings"
                      value={form.toBuilding}
                      onChange={(e) => setForm({ ...form, toBuilding: e.target.value, toFloor: '', toDepartment: '' })}
                      placeholder="เช่น อาคารผู้ป่วยนอก"
                      className="dark:bg-slate-800 dark:border-slate-700"
                    />
                    <datalist id="transfer-buildings">
                      {buildingsForSite.map((b) => <option key={b} value={b} />)}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">ชั้น</Label>
                    <Input
                      list="transfer-floors"
                      value={form.toFloor}
                      onChange={(e) => setForm({ ...form, toFloor: e.target.value, toDepartment: '' })}
                      placeholder="เช่น 1"
                      className="dark:bg-slate-800 dark:border-slate-700"
                    />
                    <datalist id="transfer-floors">
                      {floorsForBuilding.map((f) => <option key={f} value={f} />)}
                    </datalist>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">แผนก</Label>
                    <Input
                      list="transfer-depts"
                      value={form.toDepartment}
                      onChange={(e) => setForm({ ...form, toDepartment: e.target.value })}
                      placeholder="เช่น ไอที"
                      className="dark:bg-slate-800 dark:border-slate-700"
                    />
                    <datalist id="transfer-depts">
                      {departmentsForFloor.map((d) => <option key={d} value={d} />)}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">รหัสแผนก</Label>
                    <Input
                      value={form.toDepartmentCode}
                      onChange={(e) => setForm({ ...form, toDepartmentCode: e.target.value })}
                      placeholder="เช่น IT-001"
                      className="dark:bg-slate-800 dark:border-slate-700"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">ที่ตั้ง</Label>
                    <Input
                      value={form.toLocation}
                      onChange={(e) => setForm({ ...form, toLocation: e.target.value })}
                      placeholder="ห้อง/จุดวาง"
                      className="dark:bg-slate-800 dark:border-slate-700"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">AssetSiteCode</Label>
                    <Input
                      value={form.toAssetSiteCode}
                      onChange={(e) => setForm({ ...form, toAssetSiteCode: e.target.value })}
                      placeholder={crossSite ? 'อัตโนมัติ' : 'ปล่อยว่าง = เดิม'}
                      className="font-mono dark:bg-slate-800 dark:border-slate-700"
                    />
                    {crossSite && (
                      <div className="text-[10px] text-slate-400">
                        ปล่อยว่าง = ระบบออกรหัสให้อัตโนมัติ (ใช้รหัสเดิมถ้าเคยอยู่สาขานี้)
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Meter-required enforcement block */}
            {device.meterRequired && form.toSite && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
                <div className="mb-1.5 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="font-semibold">⚠️ ต้องจดมิเตอร์ก่อนย้าย</span>
                </div>

                <div className="mb-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={meterPath === 'meter' ? 'default' : 'outline'}
                    onClick={() => setMeterPath('meter')}
                    className={
                      meterPath === 'meter'
                        ? 'bg-[#f97316] text-white hover:bg-[#ea580c]'
                        : 'dark:bg-slate-800 dark:border-slate-700'
                    }
                  >
                    <Gauge className="h-3.5 w-3.5" /> จดมิเตอร์เลย
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={meterPath === 'skip' ? 'default' : 'outline'}
                    onClick={() => setMeterPath('skip')}
                    className={
                      meterPath === 'skip'
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'dark:bg-slate-800 dark:border-slate-700'
                    }
                  >
                    ระบุเหตุผลที่จดไม่ได้
                  </Button>
                </div>

                {meterPath === 'meter' && (
                  <div className="space-y-2 rounded-md border border-amber-200 bg-white p-2 dark:border-amber-800 dark:bg-slate-900">
                    {meterReadingId && (
                      <div className="rounded bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        ✓ บันทึกมิเตอร์แล้ว (ID: {meterReadingId.slice(0, 8)}…) — พร้อมย้าย
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">ค่ามิเตอร์{meterModeIsColor ? ' ขาวดำ' : ''} *</Label>
                        <Input
                          type="number"
                          value={form.meterBw}
                          onChange={(e) => setForm({ ...form, meterBw: e.target.value })}
                          disabled={!!meterReadingId}
                          placeholder="เช่น 5000"
                          className="h-8 text-xs dark:bg-slate-800 dark:border-slate-700"
                        />
                      </div>
                      {meterModeIsColor && (
                        <div className="space-y-1">
                          <Label className="text-[10px]">ค่ามิเตอร์ สี</Label>
                          <Input
                            type="number"
                            value={form.meterColor}
                            onChange={(e) => setForm({ ...form, meterColor: e.target.value })}
                            disabled={!!meterReadingId}
                            placeholder="เช่น 1200"
                            className="h-8 text-xs dark:bg-slate-800 dark:border-slate-700"
                          />
                        </div>
                      )}
                    </div>
                    <Input
                      value={form.meterRemark}
                      onChange={(e) => setForm({ ...form, meterRemark: e.target.value })}
                      disabled={!!meterReadingId}
                      placeholder="หมายเหตุ (ถ้ามี)"
                      className="h-8 text-xs dark:bg-slate-800 dark:border-slate-700"
                    />
                  </div>
                )}

                {meterPath === 'skip' && (
                  <Textarea
                    value={form.skipMeterReason}
                    onChange={(e) => setForm({ ...form, skipMeterReason: e.target.value })}
                    rows={2}
                    placeholder="เหตุผลที่จดมิเตอร์ไม่ได้ * (เช่น เครื่องดับ เครื่องพัง ไม่สามารถเข้าถึงได้)"
                    className="text-xs dark:bg-slate-800 dark:border-slate-700"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>ยกเลิก</Button>
          <Button onClick={doTransfer} disabled={saving} className="bg-[#f97316] text-white hover:bg-[#ea580c]">
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                กำลังย้าย...
              </>
            ) : 'ยืนยันการย้าย'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
