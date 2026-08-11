'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, RefreshCw, ChevronLeft, ChevronRight, Package } from 'lucide-react'

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

export function ItamDevices() {
  const qc = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [limit] = React.useState(20)
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const devices = data?.devices ?? []
  const total = data?.pagination.total ?? 0
  const totalPages = data?.pagination.totalPages ?? 0

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">จัดการอุปกรณ์ (Real DB)</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">ข้อมูลจริง {total.toLocaleString()} เครื่อง</p>
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
        <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey })} className="dark:bg-slate-800 dark:border-slate-700">
          <RefreshCw className="h-4 w-4" /> รีเฟรช
        </Button>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : devices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <Package className="h-10 w-10" />
                        <span className="text-sm">ไม่พบอุปกรณ์</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  devices.map((d) => (
                    <TableRow key={d.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
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
    </div>
  )
}
