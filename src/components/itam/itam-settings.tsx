'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Database, Building2, Plus, RefreshCw, Pencil, Trash2 } from 'lucide-react'

interface MasterItem { id: string; itemId: string | null; categoryKey: string; value: string; displayLabel: string | null; active: boolean; departmentCode: string | null }
interface Site { id: string; siteCode: string; siteName: string | null; lineOa: string | null; hotline: string | null; paperRateBw: number | null; paperRateColor: number | null; deviceCount?: number; activeCount?: number }

export function ItamSettings() {
  const qc = useQueryClient()
  const [tab, setTab] = React.useState<'master' | 'sites'>('master')
  const [category, setCategory] = React.useState('all')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<MasterItem | null>(null)
  const [form, setForm] = React.useState({ categoryKey: '', value: '', displayLabel: '', departmentCode: '' })

  // Master items
  const { data: masterData, isLoading: masterLoading } = useQuery({
    queryKey: ['itam-master', category],
    queryFn: async () => {
      const params = category !== 'all' ? `?category=${category}` : ''
      const res = await fetch(`/api/itam/master-items${params}`)
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ items: MasterItem[] }>
    },
  })

  // Sites
  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ['itam-sites'],
    queryFn: async () => {
      const res = await fetch('/api/itam/sites')
      if (!res.ok) throw new Error('Failed')
      return res.json() as Promise<{ sites: Site[] }>
    },
  })

  function openAdd() {
    setEditItem(null)
    setForm({ categoryKey: 'Brand', value: '', displayLabel: '', departmentCode: '' })
    setDialogOpen(true)
  }

  function openEdit(item: MasterItem) {
    setEditItem(item)
    setForm({ categoryKey: item.categoryKey, value: item.value, displayLabel: item.displayLabel || '', departmentCode: item.departmentCode || '' })
    setDialogOpen(true)
  }

  async function saveItem() {
    if (!form.categoryKey || !form.value) { toast.error('กรุณากรอกหมวดหมู่และค่า'); return }
    try {
      if (editItem) {
        const res = await fetch(`/api/itam/master-items/${editItem.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!res.ok) throw new Error('Failed')
        toast.success('แก้ไขแล้ว')
      } else {
        const res = await fetch('/api/itam/master-items', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!res.ok) throw new Error('Failed')
        toast.success('เพิ่มแล้ว')
      }
      setDialogOpen(false)
      await qc.invalidateQueries({ queryKey: ['itam-master'] })
    } catch (e) { toast.error('บันทึกไม่สำเร็จ') }
  }

  async function deleteItem(item: MasterItem) {
    if (!confirm(`ลบ "${item.value}"?`)) return
    try {
      await fetch(`/api/itam/master-items/${item.id}`, { method: 'DELETE' })
      toast.success('ลบแล้ว')
      await qc.invalidateQueries({ queryKey: ['itam-master'] })
    } catch { toast.error('ลบไม่สำเร็จ') }
  }

  const items = masterData?.items ?? []
  const sites = sitesData?.sites ?? []

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">ตั้งค่า (Real DB)</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">ข้อมูลมาตรฐาน + สาขา</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => setTab('master')} className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${tab === 'master' ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Database className="mr-1 inline h-4 w-4" /> ข้อมูลมาตรฐาน
        </button>
        <button onClick={() => setTab('sites')} className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${tab === 'sites' ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Building2 className="mr-1 inline h-4 w-4" /> สาขา
        </button>
      </div>

      {tab === 'master' && (
        <>
          <div className="flex items-center gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-48 dark:bg-slate-800 dark:border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">หมวดทั้งหมด</SelectItem>
                <SelectItem value="Brand">Brand</SelectItem>
                <SelectItem value="DeviceType">ประเภทอุปกรณ์</SelectItem>
                <SelectItem value="Model">Model</SelectItem>
                <SelectItem value="Department">แผนก</SelectItem>
                <SelectItem value="Status">สถานะ</SelectItem>
                <SelectItem value="DeviceGroup">กลุ่มอุปกรณ์</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={openAdd} className="ml-auto"><Plus className="h-4 w-4" /> เพิ่ม</Button>
            <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['itam-master'] })}><RefreshCw className="h-4 w-4" /></Button>
          </div>

          <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="p-0">
              <div className="itam-scroll max-h-[55vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-50/80 dark:bg-slate-900/80">
                    <TableRow>
                      <TableHead>หมวดหมู่</TableHead>
                      <TableHead>ค่า</TableHead>
                      <TableHead>Display Label</TableHead>
                      <TableHead>รหัสแผนก</TableHead>
                      <TableHead className="text-center">สถานะ</TableHead>
                      <TableHead className="text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {masterLoading ? (
                      Array.from({ length: 8 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>)
                    ) : items.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="py-8 text-center text-slate-400 text-sm">ไม่มีข้อมูล</TableCell></TableRow>
                    ) : (
                      items.map((item) => (
                        <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <TableCell><Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item.categoryKey}</Badge></TableCell>
                          <TableCell className="text-sm font-medium">{item.value}</TableCell>
                          <TableCell className="text-xs text-slate-400">{item.displayLabel || '—'}</TableCell>
                          <TableCell className="text-xs">{item.departmentCode || '—'}</TableCell>
                          <TableCell className="text-center">{item.active ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓</Badge> : <Badge className="bg-slate-50 text-slate-400">—</Badge>}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(item)}><Pencil className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteItem(item)} className="text-rose-500 hover:bg-rose-50"><Trash2 className="h-3 w-3" /></Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {tab === 'sites' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sitesLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)
          ) : sites.map((s) => (
            <Card key={s.id} className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-[#f97316]" /> {s.siteCode}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.siteName}</div>
                <div className="flex gap-4 text-xs text-slate-500">
                  <span>📦 {s.deviceCount ?? 0} เครื่อง</span>
                  <span>✅ {s.activeCount ?? 0} ใช้งาน</span>
                </div>
                <div className="flex gap-4 text-xs text-slate-400">
                  <span>📄 ขาวดำ: ฿{s.paperRateBw ?? 0.5}/แผ่น</span>
                  <span>🎨 สี: ฿{s.paperRateColor ?? 2}/แผ่น</span>
                </div>
                {s.hotline && <div className="text-xs text-slate-400">📞 {s.hotline}</div>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader><DialogTitle>{editItem ? 'แก้ไข' : 'เพิ่ม'} ข้อมูลมาตรฐาน</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">หมวดหมู่ *</Label>
              <Select value={form.categoryKey} onValueChange={(v) => setForm({ ...form, categoryKey: v })}>
                <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Brand">Brand</SelectItem>
                  <SelectItem value="DeviceType">ประเภทอุปกรณ์</SelectItem>
                  <SelectItem value="Model">Model</SelectItem>
                  <SelectItem value="Department">แผนก</SelectItem>
                  <SelectItem value="Status">สถานะ</SelectItem>
                  <SelectItem value="DeviceGroup">กลุ่มอุปกรณ์</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">ค่า *</Label><Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Display Label</Label><Input value={form.displayLabel} onChange={(e) => setForm({ ...form, displayLabel: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" /></div>
            <div className="space-y-1.5"><Label className="text-xs">รหัสแผนก</Label><Input value={form.departmentCode} onChange={(e) => setForm({ ...form, departmentCode: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveItem} className="bg-[#f97316] text-white hover:bg-[#ea580c]">บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
