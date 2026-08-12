'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, RefreshCw, ChevronLeft, ChevronRight, Download, ScrollText } from 'lucide-react'
import { downloadCsv, dateStamp } from '@/lib/csv'

interface AuditLog {
  id: string
  timestamp: string | null
  action: string
  user: string | null
  details: string | null
}
interface AuditResponse {
  logs: AuditLog[]
  count: number
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

const ACTION_OPTIONS = [
  { value: 'all', label: 'ทุกการกระทำ' },
  { value: 'CREATE', label: 'CREATE' },
  { value: 'UPDATE_DEVICE', label: 'UPDATE_DEVICE' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'LOGIN', label: 'LOGIN' },
  { value: 'LOGOUT', label: 'LOGOUT' },
  { value: 'METER_READING', label: 'METER_READING' },
  { value: 'ASSIGN', label: 'ASSIGN' },
  { value: 'RETURN', label: 'RETURN' },
  { value: 'MAINTENANCE', label: 'MAINTENANCE' },
  { value: 'SYNC', label: 'SYNC' },
  { value: 'TRANSFER', label: 'TRANSFER' },
]

const ACTION_BADGE: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  UPDATE_DEVICE: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800',
  UPDATE: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800',
  DELETE: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
  LOGIN: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
  LOGOUT: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
  METER_READING: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  ASSIGN: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  RETURN: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  MAINTENANCE: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  SYNC: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800',
  TRANSFER: 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300',
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' })
  } catch {
    return iso
  }
}

function tryPrettyDetails(s: string | null): string {
  if (!s) return '—'
  try {
    const obj = JSON.parse(s)
    return JSON.stringify(obj)
  } catch {
    return s
  }
}

export function ItamAudit() {
  const qc = useQueryClient()
  const [action, setAction] = React.useState('all')
  const [user, setUser] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [limit] = React.useState(25)

  const queryKey = React.useMemo(() => ['itam-audit', action, user, search, page, limit], [action, user, search, page, limit])

  const { data, isLoading, isFetching } = useQuery<AuditResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (action !== 'all') params.set('action', action)
      if (user.trim()) params.set('user', user.trim())
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/itam/audit?${params}`)
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
  })

  const logs = data?.logs ?? []
  const total = data?.pagination.total ?? 0
  const totalPages = data?.pagination.totalPages ?? 0

  function exportCsv() {
    if (logs.length === 0) {
      toast.warning('ไม่มีข้อมูลให้ส่งออก')
      return
    }
    const rows = logs.map(l => ({
      timestamp: l.timestamp || '',
      action: l.action,
      user: l.user || '',
      details: tryPrettyDetails(l.details),
    }))
    downloadCsv(`audit-${dateStamp()}.csv`, rows, [
      { key: 'timestamp', label: 'วันที่' },
      { key: 'action', label: 'การกระทำ' },
      { key: 'user', label: 'ผู้ใช้' },
      { key: 'details', label: 'รายละเอียด' },
    ])
    toast.success(`ส่งออก ${rows.length} รายการ`)
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">📜 ประวัติการใช้งาน (Audit Log)</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">ข้อมูลจริง {total.toLocaleString()} รายการ</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey })} className="dark:bg-slate-800 dark:border-slate-700">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> รีเฟรช
          </Button>
          <Button variant="outline" onClick={exportCsv} className="dark:bg-slate-800 dark:border-slate-700">
            <Download className="h-4 w-4" /> ส่งออก CSV
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={action} onValueChange={(v) => { setAction(v); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-56 dark:bg-slate-800 dark:border-slate-700">
            <SelectValue placeholder="การกระทำ" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="ผู้ใช้ (เช่น admin@example.com)"
          value={user}
          onChange={(e) => { setUser(e.target.value); setPage(1) }}
          className="w-full sm:w-56 dark:bg-slate-800 dark:border-slate-700"
        />
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="ค้นหารายละเอียด..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-9 dark:bg-slate-800 dark:border-slate-700"
          />
        </div>
      </div>

      {/* Table */}
      <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-0">
          <div className="itam-scroll max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/80">
                <TableRow>
                  <TableHead className="w-44">วันที่</TableHead>
                  <TableHead className="w-40">การกระทำ</TableHead>
                  <TableHead className="w-48">ผู้ใช้</TableHead>
                  <TableHead>รายละเอียด</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={4}><Skeleton className="h-6 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-12">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <ScrollText className="h-10 w-10" />
                        <span className="text-sm">ไม่พบประวัติ</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((l) => (
                    <TableRow key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {fmtTimestamp(l.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge className={ACTION_BADGE[l.action] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>
                          {l.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 dark:text-slate-300">{l.user || '—'}</TableCell>
                      <TableCell className="max-w-md truncate text-xs text-slate-500 dark:text-slate-400" title={tryPrettyDetails(l.details)}>
                        {tryPrettyDetails(l.details)}
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
