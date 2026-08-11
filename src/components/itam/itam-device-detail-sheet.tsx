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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pencil, Wrench, Package, History, Gauge } from 'lucide-react'

interface DeviceDetail {
  id: string
  assetNo: string
  deviceType: string | null
  brand: string | null
  model: string | null
  serial: string | null
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
  installDate: string | null
  warrantyEnd: string | null
  deviceGroup: string | null
  costCenter: string | null
  meterRequired: boolean
  meterMode: string | null
  assetSiteCode: string | null
  updatedAt: string | null
  meterReadings?: Array<{
    id: string; readingDate: string | null; readingMonth: string | null
    meterBw: number; pagesBw: number; pagesColor: number; remark: string | null
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
            รายละเอียดอุปกรณ์ · มิเตอร์ · การมอบหมาย · การซ่อมบำรุง
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
            <div className="flex gap-2">
              {onEdit && (
                <Button size="sm" variant="outline" onClick={() => onEdit(device.assetNo)} className="dark:bg-slate-800 dark:border-slate-700">
                  <Pencil className="h-3.5 w-3.5" /> แก้ไข
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => refetch()} className="dark:bg-slate-800 dark:border-slate-700">
                <History className="h-3.5 w-3.5" /> รีเฟรช
              </Button>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
              <Field label="Asset No" value={device.assetNo} />
              <Field label="ประเภท" value={device.deviceType} />
              <Field label="แบรนด์" value={device.brand} />
              <Field label="รุ่น" value={device.model} />
              <Field label="Serial" value={device.serial} />
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
              <Field label="ติดตั้ง" value={fmtDate(device.installDate)} />
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
                  <Gauge className="mr-1 h-3.5 w-3.5" /> ประวัติมิเตอร์
                </TabsTrigger>
                <TabsTrigger value="assign" className="flex-1">
                  <Package className="mr-1 h-3.5 w-3.5" /> การมอบหมาย
                </TabsTrigger>
                <TabsTrigger value="mnt" className="flex-1">
                  <Wrench className="mr-1 h-3.5 w-3.5" /> การซ่อมบำรุง
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
                              <TableCell className="text-right font-mono text-xs tabular-nums">{r.meterBw.toLocaleString()}</TableCell>
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
    </Sheet>
  )
}
