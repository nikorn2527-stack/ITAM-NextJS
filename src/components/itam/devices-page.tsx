'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Plus, RefreshCw, Pencil, Trash2, Search, Eye, Download, Upload, Tag, PackageOpen } from 'lucide-react'
import {
  type Device,
  type Site,
  DEVICE_STATUS_OPTIONS,
  statusBadgeClass,
  statusLabel,
} from './types'
import { DeviceDetailSheet } from './device-detail-sheet'
import { CsvImportDialog } from './csv-import-dialog'
import { StickerPrintDialog } from './sticker-print-dialog'
import { downloadCsv, dateStamp } from '@/lib/csv'

const DEVICE_CSV_HEADERS = [
  { key: 'assetCode', label: 'รหัสอุปกรณ์' },
  { key: 'name', label: 'ชื่อ' },
  { key: 'brand', label: 'แบรนด์' },
  { key: 'model', label: 'รุ่น' },
  { key: 'type', label: 'ประเภท' },
  { key: 'serialNumber', label: 'หมายเลข SN' },
  { key: 'status', label: 'สถานะ' },
  { key: 'site', label: 'สาขา' },
  { key: 'department', label: 'แผนก' },
  { key: 'departmentCode', label: 'รหัสแผนก' },
  { key: 'parentRef', label: 'ParentRef' },
  { key: 'displayLabel', label: 'DisplayLabel' },
  { key: 'location', label: 'ที่ตั้ง' },
  { key: 'purchaseDate', label: 'วันที่ซื้อ' },
  { key: 'lastMeterReading', label: 'มิเตอร์ล่าสุด' },
]

interface FormState {
  id?: string
  assetCode: string
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
  purchaseDate: string
}

const EMPTY_FORM: FormState = {
  assetCode: '',
  name: '',
  brand: '',
  model: '',
  type: '',
  serialNumber: '',
  status: 'active',
  site: 'HQ',
  department: '',
  departmentCode: '',
  parentRef: '',
  displayLabel: '',
  location: '',
  purchaseDate: '',
}

export function DevicesPage() {
  const qc = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [siteFilter, setSiteFilter] = React.useState('all')
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

  const { data: devices, isLoading } = useQuery<Device[]>({
    queryKey: ['devices', search, statusFilter, siteFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (siteFilter !== 'all') params.set('site', siteFilter)
      const res = await fetch(`/api/devices?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load devices')
      const json = await res.json()
      return json.devices as Device[]
    },
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

  const { data: masterItems } = useQuery<{
    category: string
    code: string
    label: string
  }[]>({
    queryKey: ['master-all'],
    queryFn: async () => {
      const res = await fetch('/api/master')
      if (!res.ok) return []
      const json = await res.json()
      return (json.items ?? []) as {
        category: string
        code: string
        label: string
      }[]
    },
  })

  const brands = (masterItems ?? []).filter((m) => m.category === 'Brand')
  const types = (masterItems ?? []).filter((m) => m.category === 'Type')
  const departments = (masterItems ?? []).filter(
    (m) => m.category === 'Department',
  )

  function openAdd() {
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(d: Device) {
    setForm({
      id: d.id,
      assetCode: d.assetCode,
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
      purchaseDate: d.purchaseDate ?? '',
    })
    setDialogOpen(true)
  }

  async function save() {
    if (!form.assetCode || !form.name || !form.brand || !form.model || !form.type) {
      toast.error('กรุณากรอกข้อมูลที่จำเป็น (รหัส, ชื่อ, แบรนด์, รุ่น, ประเภท)')
      return
    }
    try {
      setSaving(true)
      const payload = {
        ...form,
        serialNumber: form.serialNumber || null,
        department: form.department || null,
        departmentCode: form.departmentCode || null,
        parentRef: form.parentRef || null,
        displayLabel: form.displayLabel || null,
        location: form.location || null,
        purchaseDate: form.purchaseDate || null,
      }
      const isEdit = Boolean(form.id)
      const url = isEdit ? `/api/devices/${form.id}` : '/api/devices'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Save failed')
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
      const res = await fetch(`/api/devices?${params.toString()}`)
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

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">จัดการอุปกรณ์</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            เพิ่ม / แก้ไข / ลบ อุปกรณ์ IT ในระบบ
          </p>
        </div>
      </div>

      <Card className="dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="ค้นหารหัส / ชื่อ / SN / แบรนด์..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
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
                  {(sites ?? []).map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={openAdd}
                className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <Plus className="h-4 w-4" />
                เพิ่มอุปกรณ์
              </Button>
              <Button
                variant="outline"
                onClick={() => setImportOpen(true)}
                className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <Upload className="h-4 w-4" />
                นำเข้า CSV
              </Button>
              <Button
                variant="outline"
                onClick={exportCsv}
                disabled={exporting}
                className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <Download className="h-4 w-4" />
                {exporting ? 'กำลังส่งออก...' : 'ส่งออก CSV'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setStickerOpen(true)}
                disabled={(devices ?? []).length === 0}
                className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <Tag className="h-4 w-4" />
                พิมพ์สติกเกอร์
              </Button>
              <Button
                variant="outline"
                onClick={() => qc.invalidateQueries({ queryKey: ['devices'] })}
                className="focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              >
                <RefreshCw className="h-4 w-4" />
                รีเฟรช
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="itam-scroll mt-4 max-h-[60vh] overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/80">
                <TableRow>
                  <TableHead className="text-slate-600 dark:text-slate-300">รหัส</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">ชื่อ</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">แบรนด์</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">รุ่น</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">ประเภท</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">สถานะ</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">สาขา</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">แผนก</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">รหัสแผนก</TableHead>
                  <TableHead className="text-right text-slate-600 dark:text-slate-300">การจัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={10}>
                        <Skeleton className="h-6 w-full dark:bg-slate-800" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (devices ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12">
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                          <PackageOpen className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                        </div>
                        <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                          {search || statusFilter !== 'all' || siteFilter !== 'all'
                            ? 'ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข'
                            : 'ยังไม่มีอุปกรณ์ในระบบ'}
                        </div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">
                          {search || statusFilter !== 'all' || siteFilter !== 'all'
                            ? 'ลองปรับตัวกรองหรือคำค้นหา หรือล้างตัวกรองเพื่อดูทั้งหมด'
                            : 'เริ่มต้นโดยการเพิ่มอุปกรณ์เครื่องแรกของคุณ'}
                        </div>
                        {(search || statusFilter !== 'all' || siteFilter !== 'all') ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSearch('')
                              setStatusFilter('all')
                              setSiteFilter('all')
                            }}
                            className="mt-2 focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
                          >
                            ล้างตัวกรอง
                          </Button>
                        ) : (
                          <Button
                            size="sm"
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
                  (devices ?? []).map((d) => (
                    <TableRow
                      key={d.id}
                      className="cursor-pointer transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                      onClick={() => setDetailDeviceId(d.id)}
                    >
                      <TableCell className="font-mono text-xs font-medium text-slate-700 dark:text-slate-200">
                        {d.assetCode}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-slate-700 dark:text-slate-200">
                        {d.name}
                      </TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-200">{d.brand}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-slate-700 dark:text-slate-200">
                        {d.model}
                      </TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-200">{d.type}</TableCell>
                      <TableCell>
                        <Badge className={statusBadgeClass(d.status)}>
                          {statusLabel(d.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-200">{d.site}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-slate-600 dark:text-slate-300">
                        {d.department ?? '-'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {d.departmentCode ?? '-'}
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDetailDeviceId(d.id)}
                            aria-label="ดูรายละเอียด"
                            title="ดูรายละเอียด"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(d)}
                            aria-label="แก้ไข"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteTarget(d)}
                            aria-label="ลบ"
                            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            ทั้งหมด {(devices ?? []).length} รายการ
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-slate-800 dark:text-slate-100">
              {form.id ? '✏️ แก้ไขอุปกรณ์' : '➕ เพิ่มอุปกรณ์ใหม่'}
            </DialogTitle>
            <DialogDescription>
              กรอกข้อมูลอุปกรณ์ให้ครบถ้วน ฟิลด์ที่มีเครื่องหมาย * เป็นข้อมูลที่จำเป็น
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="รหัสอุปกรณ์ *">
              <Input
                value={form.assetCode}
                onChange={(e) =>
                  setForm({ ...form, assetCode: e.target.value })
                }
                placeholder="IT-PRT-001"
              />
            </Field>
            <Field label="ชื่ออุปกรณ์ *">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="แบรนด์ *">
              <SelectValueInput
                value={form.brand}
                onChange={(v) => setForm({ ...form, brand: v })}
                options={brands.map((b) => ({ value: b.code, label: b.label }))}
                placeholder="เลือกหรือพิมพ์แบรนด์"
              />
            </Field>
            <Field label="รุ่น *">
              <Input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </Field>
            <Field label="ประเภท *">
              <SelectValueInput
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v })}
                options={types.map((t) => ({ value: t.code, label: t.label }))}
                placeholder="เลือกหรือพิมพ์ประเภท"
              />
            </Field>
            <Field label="Serial Number">
              <Input
                value={form.serialNumber}
                onChange={(e) =>
                  setForm({ ...form, serialNumber: e.target.value })
                }
              />
            </Field>
            <Field label="สถานะ *">
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
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
            <Field label="สาขา *">
              <Select
                value={form.site}
                onValueChange={(v) => setForm({ ...form, site: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(sites ?? []).map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="แผนก">
              <SelectValueInput
                value={form.department}
                onChange={(v) => setForm({ ...form, department: v })}
                options={departments.map((d) => ({
                  value: d.label,
                  label: d.label,
                }))}
                placeholder="เลือกหรือพิมพ์แผนก"
              />
            </Field>
            <Field label="รหัสแผนก (DepartmentCode)">
              <Input
                value={form.departmentCode}
                onChange={(e) =>
                  setForm({ ...form, departmentCode: e.target.value })
                }
              />
            </Field>
            <Field label="ParentRef">
              <Input
                value={form.parentRef}
                onChange={(e) =>
                  setForm({ ...form, parentRef: e.target.value })
                }
                placeholder="เช่น HP|PRINTER"
              />
            </Field>
            <Field label="DisplayLabel">
              <Input
                value={form.displayLabel}
                onChange={(e) =>
                  setForm({ ...form, displayLabel: e.target.value })
                }
              />
            </Field>
            <Field label="สถานที่ตั้ง">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </Field>
            <Field label="วันที่ซื้อ">
              <Input
                type="date"
                value={form.purchaseDate}
                onChange={(e) =>
                  setForm({ ...form, purchaseDate: e.target.value })
                }
              />
            </Field>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
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
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Sticker print */}
      <StickerPrintDialog
        open={stickerOpen}
        onOpenChange={setStickerOpen}
        devices={devices ?? []}
        orgName={settings?.orgName ?? null}
      />
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
    </div>
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
              type="button"
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
