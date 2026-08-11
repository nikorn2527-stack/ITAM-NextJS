'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { Search, RefreshCw, ChevronLeft, ChevronRight, Package, Plus, Pencil, Trash2, Download, Eye } from 'lucide-react'
import { downloadCsv, dateStamp } from '@/lib/csv'
import { ItamDeviceDetailSheet } from './itam-device-detail-sheet'

interface Device {
  id: string; assetNo: string; deviceType: string | null; brand: string | null
  model: string | null; serial: string | null; status: string; site: string | null
  department: string | null; building: string | null; floor: string | null
  location: string | null; meterRequired: boolean; _count?: { meterReadings: number; locationHistories: number; assignments: number; maintenanceLogs: number }
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

export function ItamDevices() {
  const qc = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [limit] = React.useState(20)

  // Detail sheet
  const [detailAssetNo, setDetailAssetNo] = React.useState<string | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  // CRUD dialog
  const [crudOpen, setCrudOpen] = React.useState(false)
  const [editAssetNo, setEditAssetNo] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<DeviceForm>(EMPTY_FORM)
  const [saving, setSaving] = React.useState(false)

  // Delete confirm
  const [deleteAssetNo, setDeleteAssetNo] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // CSV export
  const [exporting, setExporting] = React.useState(false)

  const queryKey = React.useMemo(() => ['itam-devices', search, status, page, limit], [search, status, page, limit])

  const { data, isLoading } = useQuery<DevicesResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (search) params.set('search', search)
      if (status !== 'all') params.set('status', status)
      const res = await fetch(`/api/itam/devices?${params}`)
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })

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
    // Fetch current device fields then open dialog
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

  async function saveDevice() {
    if (!form.assetNo.trim()) {
      toast.error('กรุณากรอกรหัสสินทรัพย์')
      return
    }
    try {
      setSaving(true)
      const payload = {
        ...form,
        meterRequired: form.meterRequired,
      }
      if (editAssetNo) {
        const res = await fetch(`/api/itam/devices/${editAssetNo}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || 'Failed')
        }
        toast.success('แก้ไขอุปกรณ์แล้ว')
      } else {
        const res = await fetch('/api/itam/devices', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || 'Failed')
        }
        toast.success('เพิ่มอุปกรณ์แล้ว')
      }
      setCrudOpen(false)
      await qc.invalidateQueries({ queryKey: ['itam-devices'] })
      await qc.invalidateQueries({ queryKey: ['itam-dashboard'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteAssetNo) return
    try {
      setDeleting(true)
      const res = await fetch(`/api/itam/devices/${deleteAssetNo}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed')
      }
      toast.success(`ลบ ${deleteAssetNo} แล้ว`)
      setDeleteAssetNo(null)
      await qc.invalidateQueries({ queryKey: ['itam-devices'] })
      await qc.invalidateQueries({ queryKey: ['itam-dashboard'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    } finally {
      setDeleting(false)
    }
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
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey })} className="dark:bg-slate-800 dark:border-slate-700">
            <RefreshCw className="h-4 w-4" /> รีเฟรช
          </Button>
          <Button className="bg-[#f97316] text-white hover:bg-[#ea580c]" onClick={openAdd}>
            <Plus className="h-4 w-4" /> เพิ่มอุปกรณ์
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="ค้นหารหัส, แบรนด์, รุ่น, SN..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-9 dark:bg-slate-800 dark:border-slate-700"
          />
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
      </div>

      {/* Table */}
      <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-0">
          <div className="itam-scroll max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/80">
                <TableRow>
                  <TableHead className="w-16">รหัส</TableHead>
                  <TableHead>ประเภท</TableHead>
                  <TableHead>แบรนด์/รุ่น</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>สาขา</TableHead>
                  <TableHead>แผนก</TableHead>
                  <TableHead className="text-center">มิเตอร์</TableHead>
                  <TableHead className="text-right w-32">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : devices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Package className="h-10 w-10" />
                        <span className="text-sm">ไม่พบอุปกรณ์</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  devices.map((d) => (
                    <TableRow
                      key={d.id}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      onClick={() => { setDetailAssetNo(d.assetNo); setDetailOpen(true) }}
                    >
                      <TableCell className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300">{d.assetNo}</TableCell>
                      <TableCell className="text-xs text-slate-600 dark:text-slate-400">{d.deviceType || '—'}</TableCell>
                      <TableCell className="text-sm">{d.brand} {d.model}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_BADGE[d.status] || 'bg-slate-100 text-slate-600'}>{d.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{(d.site || '').substring(0, 20)}</TableCell>
                      <TableCell className="text-xs">{(d.department || '').substring(0, 20) || '—'}</TableCell>
                      <TableCell className="text-center">
                        {d.meterRequired ? <Badge className="bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300">✓</Badge> : '—'}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" title="ดู" onClick={() => { setDetailAssetNo(d.assetNo); setDetailOpen(true) }}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" title="แก้ไข" onClick={() => openEdit(d.assetNo)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" title="ลบ" className="text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30" onClick={() => setDeleteAssetNo(d.assetNo)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">หน้า {page} / {totalPages} ({total.toLocaleString()} รายการ)</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> ก่อนหน้า
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
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

      {/* CRUD Dialog */}
      <Dialog open={crudOpen} onOpenChange={setCrudOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl dark:border-slate-800 dark:bg-slate-900">
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
            <Button onClick={saveDevice} disabled={saving} className="bg-[#f97316] text-white hover:bg-[#ea580c]">
              {saving ? 'กำลังบันทึก...' : editAssetNo ? 'บันทึกการแก้ไข' : 'เพิ่มอุปกรณ์'}
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
            <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleting ? 'กำลังลบ...' : 'ลบ'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
