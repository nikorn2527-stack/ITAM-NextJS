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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, RefreshCw, ChevronLeft, ChevronRight, Download, ScrollText, Filter } from 'lucide-react'
import { downloadCsv, dateStamp } from '@/lib/csv'
import { useAuthStore } from '@/store/auth-store'
import { CustomExportDialog, type ExportColumn, type ExportFormat } from './custom-export-dialog'
import { runCustomExport } from '@/lib/custom-export'

// ============================================================
// Custom Export — Audit page (Task ID: FIX-1-2-EXPORT-PRINT)
// ============================================================
const AUDIT_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'createdAt', label: 'DateTime', group: 'Main' },
  { key: 'action', label: 'Do', group: 'Main' },
  { key: 'entity', label: 'entity', group: 'Main' },
  { key: 'summary', label: 'item', group: 'Main' },
  { key: 'actor', label: 'PersonDo', group: 'Main' },
  { key: 'site', label: 'Site', group: 'Main' },
]

/**
 * Audit Log display (Task ID: FIX-RBAC-AUDIT-CYCLE-SITE — Issue 3).
 *
 * AuditLog columns (matches Prisma schema + DB):
 *   id, action, entity, entityId, summary, detail, actor, createdAt
 *
 * Fixes vs old version:
 *   • Reads `log.createdAt` (was `log.timestamp`)
 *   • Reads `log.actor` (was `log.user`)
 *   • Reads `log.detail` / `log.summary` (was `log.details`)
 *   • Adds action / actor / search / date-range filters
 *   • CSV export with all columns
 */

interface AuditLog {
  id: string
  action: string
  entity: string
  entityId: string | null
  summary: string
  detail: string | null
  actor: string
  createdAt: string
}
interface AuditResponse {
  logs: AuditLog[]
  count: number
  pagination: { page: number; limit: number; total: number; totalPages: number }
  actions?: { action: string; count: number }[]
}

// Curated action set — the dropdown also fetches the DB's distinct actions
// so new ones appear automatically. These are the common labels.
const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Add',
  UPDATE: 'Edit',
  UPDATE_DEVICE: 'EditDevice',
  DELETE: 'Delete',
  LOGIN: 'intoSystem',
  LOGOUT: 'outfromSystem',
  METER_READING: 'ReadMeter',
  METER_WRITE: 'ReadMeter',
  ASSIGN: 'Assign',
  RETURN: 'return',
  MAINTENANCE: 'Repairmaintain',
  SYNC: 'Sync',
  TRANSFER: 'move',
  BULK_UPDATE_DEVICES: 'EditGroup',
  BULK_TRANSFER: 'moveGroup',
  BULK_DELETE: 'DeleteGroup',
  IMPORT_DEVICES: 'Import',
  NOTIFY_SENT: 'SendNotify',
  CYCLE_START: 'StartCycleReadMeter',
  CYCLE_END: 'endCycleReadMeter',
  // ── Additional labels (from QA batch-4 — bug #8: duplicate text fix) ──
  GENERATE: 'CreateReport',
  IMPORT_LEGACY: 'ImportDataOriginal',
  IMPORT: 'Import',
  INVITE_REQUEST: 'requestinActive',
  AUTH_FALLBACK: 'LockinSpare',
  DEMO_RESET: 'ResetDataDemo',
  DOC_TEMPLATE_RENDER: 'renderDocument',
  DOC_TEMPLATE_CREATE: 'CreateTemplateDocument',
  DOC_TEMPLATE_UPDATE: 'EditTemplateDocument',
  DOC_TEMPLATE_DELETE: 'DeleteTemplateDocument',
  DOC_TEMPLATE_ACTIVATE: 'CloseActiveTemplate',
  CONTACT_DIRECTORY_ADD: 'AdditemNamecontact',
  STOCK_IN: 'Stock InStock',
  STOCK_OUT: 'Stock OutStock',
  STOCK_ADJUST: 'ReceiveStock',
  PM_COMPLETE: 'Do PM Done',
  PM_SKIP: 'skip PM',
  WO_ASSIGN: 'AssignWork',
  WO_REOPEN: 'CloseWorkNew',
  WO_CLOSE: 'CloseWork',
  WO_CREATE: 'Repair RequestNew',
  WO_COMPLETE: 'CloseWorkRepair',
  WO_CANCEL: 'CancelWork',
  WO_PARTS_REQUEST: 'WithdrawParts',
  WO_UPDATE: 'EditWork Order',
  WO_MESSAGE: 'SendMessageinWork',
  WO_PHOTO_UPLOAD: 'upLoadimageWork',
  STICKER_RENDER: 'PrintSticker',
  PRINT: 'Print',
  EXPORT: 'ExportData',
  SEED: 'AddDataDefault',
  BACKUP: 'SpareData',
  SETTINGS_UPDATE: 'EditSettings',
  USER_CREATE: 'AddUser',
  USER_UPDATE: 'EditUser',
  USER_DELETE: 'DeleteUser',
  USER_APPROVE: 'ApproveUser',
  USER_REJECT: 'RejectUser',
  ROLE_UPDATE: 'EditChapterTHB',
  SITE_UPDATE: 'EditSite',
  METER_CYCLE_START: 'StartCycleReadMeter',
  METER_CYCLE_END: 'endCycleReadMeter',
}

const ACTION_BADGE: Record<string, string> = {
  CREATE: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  UPDATE_DEVICE: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800',
  UPDATE: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800',
  DELETE: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
  BULK_DELETE: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
  LOGIN: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
  LOGOUT: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
  METER_READING: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  METER_WRITE: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  ASSIGN: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  RETURN: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  MAINTENANCE: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  SYNC: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800',
  TRANSFER: 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300',
  BULK_UPDATE_DEVICES: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  BULK_TRANSFER: 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300',
  IMPORT_DEVICES: 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-800',
  NOTIFY_SENT: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  CYCLE_START: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  CYCLE_END: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300',
}

function fmtTimestamp(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', {
      dateStyle: 'short',
      timeStyle: 'medium',
    })
  } catch {
    return iso
  }
}

function tryPrettyDetail(s: string | null): string {
  if (!s) return '—'
  try {
    const obj = JSON.parse(s)
    return JSON.stringify(obj)
  } catch {
    return s
  }
}

function actionLabel(a: string): string {
  return ACTION_LABELS[a] ?? a
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra }
  const t = useAuthStore.getState()?.token
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

export function ItamAudit() {
  const qc = useQueryClient()
  const [action, setAction] = React.useState('all')
  const [actor, setActor] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [limit] = React.useState(25)

  // Custom export dialog state (Task ID: FIX-1-2-EXPORT-PRINT)
  const [customExportOpen, setCustomExportOpen] = React.useState(false)

  const queryKey = React.useMemo(
    () => ['itam-audit', action, actor, search, startDate, endDate, page, limit],
    [action, actor, search, startDate, endDate, page, limit],
  )

  const { data, isLoading, isFetching } = useQuery<AuditResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (action !== 'all') params.set('action', action)
      if (actor.trim()) params.set('actor', actor.trim())
      if (search.trim()) params.set('q', search.trim())
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const res = await fetch(`/api/itam/audit?${params}`, {
        headers: authHeaders(),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed')
      }
      return res.json()
    },
  })

  const logs = data?.logs ?? []
  const total = data?.pagination.total ?? 0
  const totalPages = data?.pagination.totalPages ?? 0

  // Build the action dropdown options — merge the curated list with what
  // the DB reports as currently present.
  const actionOptions = React.useMemo(() => {
    const set = new Set<string>()
    for (const a of data?.actions ?? []) set.add(a.action)
    for (const k of Object.keys(ACTION_LABELS)) set.add(k)
    return Array.from(set).sort()
  }, [data?.actions])

  async function exportCsv() {
    // Bug Group D — audit export must include ALL matching rows, not just
    // the current page. Re-fetch with a high limit using the same filters
    // so the exported CSV matches what the user sees on screen.
    toast.info('prepareDataExport…')
    const params = new URLSearchParams({ page: '1', limit: '10000' })
    if (action !== 'all') params.set('action', action)
    if (actor.trim()) params.set('actor', actor.trim())
    if (search.trim()) params.set('q', search.trim())
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)
    let allLogs: AuditLog[] = logs
    try {
      const res = await fetch(`/api/itam/audit?${params}`, { headers: authHeaders() })
      if (res.ok) {
        const j: { logs?: AuditLog[] } = await res.json()
        if (Array.isArray(j.logs) && j.logs.length > 0) allLogs = j.logs
      }
    } catch {
      // Fall back to current page logs if the bulk fetch fails.
      allLogs = logs
    }
    if (allLogs.length === 0) {
      toast.warning('No datatoExport')
      return
    }
    const rows = allLogs.map((l) => ({
      createdAt: l.createdAt || '',
      action: l.action,
      actionLabel: actionLabel(l.action),
      entity: l.entity || '',
      entityId: l.entityId || '',
      actor: l.actor || '',
      summary: l.summary || '',
      detail: tryPrettyDetail(l.detail),
    }))
    downloadCsv(`audit-${dateStamp()}.csv`, rows, [
      { key: 'createdAt', label: 'Date' },
      { key: 'action', label: 'Action' },
      { key: 'actionLabel', label: 'Do' },
      { key: 'entity', label: 'Entity' },
      { key: 'entityId', label: 'Entity ID' },
      { key: 'actor', label: 'PersonDo' },
      { key: 'summary', label: 'Summary' },
      { key: 'detail', label: 'Details' },
    ])
    toast.success(`Export ${rows.length} item`)
  }

  function resetFilters() {
    setAction('all')
    setActor('')
    setSearch('')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  // ── Custom Export handler ── (Task ID: FIX-1-2-EXPORT-PRINT)
  // Fetches ALL matching audit logs (ignoring pagination) and maps each
  // row to the user-selected columns. The `site` column is best-effort:
  // if the audit detail JSON contains a `site` field we use it; otherwise
  // empty string. (AuditLog schema doesn't have a dedicated site column.)
  const handleCustomExport = React.useCallback(
    async (columns: ExportColumn[], format: ExportFormat) => {
      // Re-fetch with a high limit so the export includes everything that
      // matches the current filters, not just the current page.
      const params = new URLSearchParams({ page: '1', limit: '10000' })
      if (action !== 'all') params.set('action', action)
      if (actor.trim()) params.set('actor', actor.trim())
      if (search.trim()) params.set('q', search.trim())
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      const res = await fetch(`/api/itam/audit?${params}`, { headers: authHeaders() })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'LoadData audit NoSuccess')
      }
      const json: { logs: AuditLog[] } = await res.json()
      const allLogs = json.logs ?? []
      if (allLogs.length === 0) {
        toast.warning('No data audit inunitFilterCurrenttoExport')
        return
      }
      const rows: Record<string, unknown>[] = allLogs.map((l) => {
        // Try to extract `site` from the detail JSON if present.
        let siteVal = ''
        if (l.detail) {
          try {
            const obj = JSON.parse(l.detail) as Record<string, unknown>
            if (typeof obj.site === 'string') siteVal = obj.site
            else if (typeof obj.siteName === 'string') siteVal = obj.siteName
          } catch {
            // detail wasn't JSON — leave siteVal empty
          }
        }
        return {
          createdAt: fmtTimestamp(l.createdAt),
          action: actionLabel(l.action),
          entity: l.entity ?? '',
          summary: l.summary ?? '',
          actor: l.actor ?? '',
          site: siteVal,
        }
      })
      runCustomExport(columns, format, rows, 'audit-log', 'ReportHistoryActive (Audit Log)')
      toast.success(`Export ${rows.length} item`)
    },
    [action, actor, search, startDate, endDate],
  )

  const hasActiveFilter =
    action !== 'all' ||
    actor.trim() !== '' ||
    search.trim() !== '' ||
    startDate !== '' ||
    endDate !== ''

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
            📜 HistoryActive (Audit Log)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Datareal {total.toLocaleString('th-TH')} item
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey })}
            className="dark:bg-slate-800 dark:border-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button
            variant="outline"
            onClick={exportCsv}
            className="dark:bg-slate-800 dark:border-slate-700"
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          {/* Export (custom) — Task ID: FIX-1-2-EXPORT-PRINT */}
          <Button
            variant="outline"
            onClick={() => setCustomExportOpen(true)}
            className="border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10 dark:border-[#fb923c] dark:text-[#fb923c]"
          >
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card className="flex-shrink-0 border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="w-full sm:w-48">
              <Label className="mb-1 block text-xs text-slate-500">Do</Label>
              <Select value={action} onValueChange={(v) => { setAction(v); setPage(1) }}>
                <SelectTrigger className="w-full dark:bg-slate-800 dark:border-slate-700">
                  <SelectValue placeholder="Do" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">AllDo</SelectItem>
                  {actionOptions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {actionLabel(a)} ({a})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-48">
              <Label className="mb-1 block text-xs text-slate-500">PersonDo</Label>
              <Input
                placeholder="e.g. admin@example.com"
                value={actor}
                onChange={(e) => { setActor(e.target.value); setPage(1) }}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>
            <div className="flex-1">
              <Label className="mb-1 block text-xs text-slate-500">Search (Summary/Details)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Searchwordin summary / detail / actor..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="pl-9 dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
            </div>
            <div className="w-full sm:w-40">
              <Label className="mb-1 block text-xs text-slate-500">fromDate</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>
            <div className="w-full sm:w-40">
              <Label className="mb-1 block text-xs text-slate-500">toDate</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>
            {hasActiveFilter && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-slate-500 hover:text-slate-700 dark:text-slate-400">
                <Filter className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="flex min-h-0 flex-1 flex-col border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="min-h-0 flex-1 p-0">
          <div className="itam-scroll h-full overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm dark:bg-slate-900/95">
                <TableRow>
                  <TableHead className="w-44">Date</TableHead>
                  <TableHead className="w-40">Do</TableHead>
                  <TableHead className="w-28">Entity</TableHead>
                  <TableHead className="w-48">PersonDo</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell>
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <ScrollText className="h-10 w-10" />
                        <span className="text-sm">Not foundHistory</span>
                        {hasActiveFilter && (
                          <Button variant="ghost" size="sm" onClick={resetFilters} className="mt-1">
                            ClearunitFilter
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((l) => (
                    <TableRow key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-300">
                        {fmtTimestamp(l.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge className={ACTION_BADGE[l.action] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}>
                          {actionLabel(l.action)}
                        </Badge>
                        <span className="ml-1.5 font-mono text-[10px] text-slate-400">{l.action}</span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 dark:text-slate-400">
                        {l.entity || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                        {l.actor || '—'}
                      </TableCell>
                      <TableCell
                        className="max-w-md truncate text-xs text-slate-700 dark:text-slate-300"
                        title={tryPrettyDetail(l.detail)}
                      >
                        <div className="truncate font-medium">{l.summary || '—'}</div>
                        {l.detail && (
                          <div className="truncate text-[10px] text-slate-400 dark:text-slate-500">
                            {tryPrettyDetail(l.detail)}
                          </div>
                        )}
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
        <div className="flex flex-shrink-0 items-center justify-between">
          <span className="text-xs text-slate-500">front {page} / {totalPages} ({total.toLocaleString('th-TH')} item)</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Beforefront
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              nextto <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Custom Export Dialog — Task ID: FIX-1-2-EXPORT-PRINT */}
      <CustomExportDialog
        open={customExportOpen}
        onOpenChange={setCustomExportOpen}
        availableColumns={AUDIT_EXPORT_COLUMNS}
        onExport={handleCustomExport}
        storageKey="itam-audit-export-cols"
        totalRows={total}
      />
    </div>
  )
}
