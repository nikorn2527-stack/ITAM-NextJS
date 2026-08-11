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
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Gauge, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'

interface Reading {
  id: string; assetNo: string; readingDate: string | null; readingMonth: string | null
  meterBw: number; meterColor: number; pagesBw: number; pagesColor: number
  prevMeterBw: number; remark: string | null; readBy: string | null
  device?: { assetNo: string; brand: string | null; model: string | null; site: string | null }
}
interface ReadingsResponse {
  readings: Reading[]; pagination: { page: number; limit: number; total: number; totalPages: number }
}

export function ItamMeter() {
  const qc = useQueryClient()
  const [page, setPage] = React.useState(1)
  const [limit] = React.useState(20)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [assetNo, setAssetNo] = React.useState('')
  const [meterBw, setMeterBw] = React.useState('')
  const [remark, setRemark] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  const { data, isLoading } = useQuery<ReadingsResponse>({
    queryKey: ['itam-readings', page, limit],
    queryFn: async () => {
      const res = await fetch(`/api/itam/meter-readings?page=${page}&limit=${limit}`)
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })

  async function saveReading() {
    if (!assetNo || !meterBw) { toast.error('กรุณากรอกรหัสอุปกรณ์และค่ามิเตอร์'); return }
    try {
      setSaving(true)
      const res = await fetch('/api/itam/meter-readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetNo, meterBw: Number(meterBw), remark: remark || null }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed')
      }
      toast.success('บันทึกมิเตอร์แล้ว')
      setDialogOpen(false); setAssetNo(''); setMeterBw(''); setRemark('')
      await qc.invalidateQueries({ queryKey: ['itam-readings'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally { setSaving(false) }
  }

  const readings = data?.readings ?? []
  const total = data?.pagination.total ?? 0
  const totalPages = data?.pagination.totalPages ?? 0

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">จดมิเตอร์ (Real DB)</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{total.toLocaleString()} รายการ</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ['itam-readings'] })} className="dark:bg-slate-800 dark:border-slate-700">
            <RefreshCw className="h-4 w-4" /> รีเฟรช
          </Button>
          <Button className="bg-[#f97316] text-white hover:bg-[#ea580c]" onClick={() => setDialogOpen(true)}>
            <Gauge className="h-4 w-4" /> จดมิเตอร์
          </Button>
        </div>
      </div>

      <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-0">
          <div className="itam-scroll max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/80">
                <TableRow>
                  <TableHead>วันที่</TableHead>
                  <TableHead>รหัส</TableHead>
                  <TableHead>อุปกรณ์</TableHead>
                  <TableHead className="text-right">ค่ามิเตอร์</TableHead>
                  <TableHead className="text-right">ใช้ไป</TableHead>
                  <TableHead>หมายเหตุ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}><TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                  ))
                ) : readings.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-12 text-center text-slate-400 text-sm">ยังไม่มีข้อมูล</TableCell></TableRow>
                ) : (
                  readings.map((r) => (
                    <TableRow key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-xs text-slate-500">{r.readingDate?.substring(0, 16) || '—'}</TableCell>
                      <TableCell className="font-mono text-xs font-medium">{r.assetNo}</TableCell>
                      <TableCell className="text-xs">{r.device ? `${r.device.brand || ''} ${r.device.model || ''}` : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">{r.meterBw.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {(r.pagesBw + r.pagesColor).toLocaleString()} แผ่น
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">{r.remark || '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">หน้า {page} / {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* Dialog: จดมิเตอร์ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader><DialogTitle>📈 จดมิเตอร์</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">รหัสอุปกรณ์ *</Label>
              <Input value={assetNo} onChange={(e) => setAssetNo(e.target.value)} placeholder="เช่น 100" className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ค่ามิเตอร์ (ขาวดำ) *</Label>
              <Input type="number" value={meterBw} onChange={(e) => setMeterBw(e.target.value)} placeholder="เช่น 5000" className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">หมายเหตุ</Label>
              <Textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={2} className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveReading} disabled={saving} className="bg-[#f97316] text-white hover:bg-[#ea580c]">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
