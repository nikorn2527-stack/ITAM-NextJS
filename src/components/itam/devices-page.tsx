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
import { Plus, RefreshCw, Pencil, Trash2, Search } from 'lucide-react'
import {
  type Device,
  type Site,
  DEVICE_STATUS_OPTIONS,
  statusBadgeClass,
  statusLabel,
} from './types'

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

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">จัดการอุปกรณ์</h1>
          <p className="text-sm text-slate-500">
            เพิ่ม / แก้ไข / ลบ อุปกรณ์ IT ในระบบ
          </p>
        </div>
      </div>

      <Card>
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
                className="bg-[#f97316] text-white hover:bg-[#ea580c]"
              >
                <Plus className="h-4 w-4" />
                เพิ่มอุปกรณ์
              </Button>
              <Button
                variant="outline"
                onClick={() => qc.invalidateQueries({ queryKey: ['devices'] })}
              >
                <RefreshCw className="h-4 w-4" />
                รีเฟรช
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="itam-scroll mt-4 max-h-[60vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อ</TableHead>
                  <TableHead>แบรนด์</TableHead>
                  <TableHead>รุ่น</TableHead>
                  <TableHead>ประเภท</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>สาขา</TableHead>
                  <TableHead>แผนก</TableHead>
                  <TableHead>รหัสแผนก</TableHead>
                  <TableHead className="text-right">การจัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={10}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (devices ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="py-8 text-center text-sm text-slate-400"
                    >
                      ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไข
                    </TableCell>
                  </TableRow>
                ) : (
                  (devices ?? []).map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs font-medium text-slate-700">
                        {d.assetCode}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {d.name}
                      </TableCell>
                      <TableCell>{d.brand}</TableCell>
                      <TableCell className="max-w-[160px] truncate">
                        {d.model}
                      </TableCell>
                      <TableCell>{d.type}</TableCell>
                      <TableCell>
                        <Badge className={statusBadgeClass(d.status)}>
                          {statusLabel(d.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{d.site}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-slate-600">
                        {d.department ?? '-'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">
                        {d.departmentCode ?? '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
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
                            className="text-rose-600 hover:bg-rose-50"
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

          <div className="mt-2 text-xs text-slate-400">
            ทั้งหมด {(devices ?? []).length} รายการ
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
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
              className="bg-[#f97316] text-white hover:bg-[#ea580c]"
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
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleting ? 'กำลังลบ...' : 'ลบอุปกรณ์'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
