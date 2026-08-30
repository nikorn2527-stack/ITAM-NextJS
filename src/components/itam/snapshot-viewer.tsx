'use client'

/**
 * SnapshotViewer — UI สำหรับดูและตรวจสอบ immutable meter report snapshots.
 *
 * Page entry point: แสดงปุ่ม "🔒 Snapshots" ที่เปิด Dialog ใหญ่ ภายในมี 2 tabs:
 *   1. รายการ Snapshots — ตารางลิสต์ + pagination (GET /api/v1/snapshots)
 *   2. รายละเอียด — metadata + frozen rows + verify button
 *      (GET /api/v1/snapshots/[id]?include=rows, POST /api/v1/snapshots/[id]/verify)
 *
 * Auth: /api/v1/* calls ไม่ถูก interceptor ของ /api/itam/* จับ → ต้องใส่ Bearer token เอง
 * ผ่าน getAuthHeaders() ที่อ่านจาก localStorage 'itam.token'.
 */

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Lock,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  ArrowLeft,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────────

interface Snapshot {
  id: string
  snapshotId: string
  cycleMonth: string
  revision: number
  status: string
  ruleVersion: string | null
  rowCount: number
  totalPagesBw: number
  totalPagesColor: number
  totalCost: number
  contentHash: string
  createdBy: string | null
  createdAt: string
}

interface SnapshotRow {
  id: string
  snapshotId: string
  assetNo: string
  readingDate: string | null
  readingMonth: string | null
  meterBw: number
  meterColor: number
  pagesBw: number
  pagesColor: number
  prevMeterBw: number
  prevMeterColor: number
  readingType: string | null
  brand: string | null
  model: string | null
  siteAtReading: string | null
  buildingAtReading: string | null
  floorAtReading: string | null
  departmentAtReading: string | null
  rateBw: number
  rateColor: number
  costBw: number
  costColor: number
  readBy: string | null
  remark: string | null
  createdAt: string
}

interface VerifyResult {
  verified: boolean
  snapshotId: string
  storedHash: string
  computedHash: string
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

interface ListResponse {
  data: Snapshot[]
  pagination: PaginationInfo
  meta: unknown
}

interface DetailResponse {
  data: { snapshot: Snapshot; rows?: SnapshotRow[] }
  meta: unknown
}

// ── Auth header helper for /api/v1/* calls ──────────────────────────────

function getAuthHeaders(): HeadersInit {
  if (typeof window !== 'undefined') {
    const token = useAuthStore.getState()?.token
    if (token) {
      return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    }
  }
  return { 'Content-Type': 'application/json' }
}

// ── Format helpers ──────────────────────────────────────────────────────

function formatBaht(n: number): string {
  const v = typeof n === 'number' && isFinite(n) ? n : 0
  return (
    '฿' +
    v.toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

function formatThaiDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    return d.toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function statusBadge(status: string) {
  if (status === 'ACTIVE') {
    return (
      <Badge className="border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        ACTIVE
      </Badge>
    )
  }
  return (
    <Badge
      variant="secondary"
      className="border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
    >
      {status || '—'}
    </Badge>
  )
}

const READING_TYPE_STYLES: Record<string, string> = {
  INITIAL:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  MONTHLY:
    'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  RESET:
    'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  CHECKOUT:
    'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300',
  RETURN:
    'border-teal-300 bg-teal-100 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300',
  FINAL:
    'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300',
  SEND_REPAIR:
    'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300',
}

function readingTypeBadge(type: string | null) {
  if (!type) return <span className="text-xs text-slate-400">—</span>
  const cls = READING_TYPE_STYLES[type]
  return (
    <Badge variant="outline" className={cls ?? ''}>
      {type}
    </Badge>
  )
}

// ── Main page component ─────────────────────────────────────────────────

export function SnapshotViewer() {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex h-full flex-col p-4 md:p-6">
      <div className="mx-auto w-full max-w-5xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-5 w-5 text-[#f97316]" />
              ตรวจสอบ Snapshot มิเตอร์
            </CardTitle>
            <CardDescription>
              ดูและตรวจสอบความถูกต้องของ snapshot มิเตอร์ที่ถูกสร้างเมื่อปิดรอบการจด
              (Immutable — ไม่สามารถแก้ไขได้หลังสร้าง)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-start gap-4">
              <div className="max-w-xl flex-1 text-sm text-slate-600 dark:text-slate-300">
                <p className="mb-2">
                  Snapshot เก็บข้อมูลมิเตอร์ทั้งหมดในรอบเดือนนั้น พร้อม hash SHA-256
                  เพื่อใช้ตรวจจับการแก้ไขภายหลัง ระบบจะสร้าง snapshot อัตโนมัติเมื่อ
                  <span className="font-medium"> ปิดรอบจดมิเตอร์</span>
                  (CLOSED cycle)
                </p>
                <p className="text-xs text-slate-500">
                  สิทธิ์: ผู้ดูแล (ADMIN) เท่านั้นที่กดตรวจสอบความถูกต้องได้
                </p>
              </div>
              <Button size="lg" onClick={() => setOpen(true)} className="gap-2">
                <Lock className="h-4 w-4" />
                🔒 Snapshots
              </Button>
            </div>
          </CardContent>
        </Card>

        <SnapshotDialog open={open} onOpenChange={setOpen} />
      </div>
    </div>
  )
}

// ── Dialog shell with tabs ──────────────────────────────────────────────

function SnapshotDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [tab, setTab] = React.useState<'list' | 'detail'>('list')
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  // Reset to list tab when dialog closes (after close animation)
  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setTab('list')
        setSelectedId(null)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [open])

  function selectSnapshot(id: string) {
    setSelectedId(id)
    setTab('detail')
  }

  function backToList() {
    setTab('list')
    setSelectedId(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-b border-slate-200 px-6 pb-3 pt-5 dark:border-slate-700">
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-[#f97316]" />
            Snapshots — มิเตอร์รายงาน (Immutable)
          </DialogTitle>
          <DialogDescription>
            ข้อมูลมิเตอร์ที่ถูกแช่แข็งเมื่อปิดรอบ สามารถตรวจสอบความถูกต้องได้ผ่าน
            SHA-256 hash
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as 'list' | 'detail')}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-6 pb-5 pt-3"
        >
          <TabsList className="self-start">
            <TabsTrigger value="list">รายการ Snapshots</TabsTrigger>
            <TabsTrigger value="detail" disabled={!selectedId}>
              รายละเอียด
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="list"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <SnapshotListTab onSelect={selectSnapshot} />
          </TabsContent>

          <TabsContent
            value="detail"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {selectedId ? (
              <SnapshotDetailTab snapshotId={selectedId} onBack={backToList} />
            ) : null}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ── List tab ────────────────────────────────────────────────────────────

function SnapshotListTab({
  onSelect,
}: {
  onSelect: (snapshotId: string) => void
}) {
  const [page, setPage] = React.useState(1)
  const limit = 20

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['v1-snapshots', page],
    queryFn: async (): Promise<ListResponse> => {
      const res = await fetch(
        `/api/v1/snapshots?page=${page}&limit=${limit}&sort=-createdAt`,
        { headers: getAuthHeaders() },
      )
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(j?.error?.message || `HTTP ${res.status}`)
      }
      return (await res.json()) as ListResponse
    },
  })

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#f97316]" />
        <span className="ml-2 text-sm text-slate-500">กำลังโหลด...</span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
        <div className="text-sm text-rose-600 dark:text-rose-400">
          โหลดข้อมูลไม่สำเร็จ: {(error as Error).message}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" /> ลองอีกครั้ง
        </Button>
      </div>
    )
  }

  const snapshots = data?.data ?? []
  const pagination = data?.pagination

  if (snapshots.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
        <Shield className="h-10 w-10 text-slate-300" />
        <div className="text-sm text-slate-500">
          ยังไม่มี snapshot — จะถูกสร้างอัตโนมัติเมื่อปิดรอบจดมิเตอร์
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
            <TableRow>
              <TableHead className="whitespace-nowrap">Snapshot ID</TableHead>
              <TableHead className="whitespace-nowrap">รอบเดือน</TableHead>
              <TableHead className="text-center whitespace-nowrap">Rev</TableHead>
              <TableHead className="text-center whitespace-nowrap">สถานะ</TableHead>
              <TableHead className="text-right whitespace-nowrap">แถว</TableHead>
              <TableHead className="text-right whitespace-nowrap">
                หน้า BW / สี
              </TableHead>
              <TableHead className="text-right whitespace-nowrap">ค่าใช้จ่าย</TableHead>
              <TableHead className="whitespace-nowrap">สร้างโดย</TableHead>
              <TableHead className="whitespace-nowrap">เมื่อ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshots.map((s) => (
              <TableRow
                key={s.id}
                onClick={() => onSelect(s.snapshotId)}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  {s.snapshotId}
                </TableCell>
                <TableCell className="whitespace-nowrap font-medium">
                  {s.cycleMonth}
                </TableCell>
                <TableCell className="text-center">R{s.revision}</TableCell>
                <TableCell className="text-center">{statusBadge(s.status)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {s.rowCount.toLocaleString('th-TH')}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {s.totalPagesBw.toLocaleString('th-TH')} /{' '}
                  {s.totalPagesColor.toLocaleString('th-TH')}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap font-medium">
                  {formatBaht(s.totalCost)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                  {s.createdBy || '—'}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                  {formatThaiDate(s.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pagination ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            หน้า {pagination.page} / {pagination.totalPages} · ทั้งหมด{' '}
            {pagination.total.toLocaleString('th-TH')} รายการ
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!pagination.hasPrev || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> ก่อนหน้า
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!pagination.hasNext || isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              ถัดไป <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ── Detail tab ──────────────────────────────────────────────────────────

function SnapshotDetailTab({
  snapshotId,
  onBack,
}: {
  snapshotId: string
  onBack: () => void
}) {
  const [verifyResult, setVerifyResult] = React.useState<VerifyResult | null>(
    null,
  )
  const [verifying, setVerifying] = React.useState(false)
  const [verifyError, setVerifyError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['v1-snapshot', snapshotId],
    queryFn: async (): Promise<DetailResponse> => {
      const res = await fetch(
        `/api/v1/snapshots/${encodeURIComponent(snapshotId)}?include=rows`,
        { headers: getAuthHeaders() },
      )
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null
        throw new Error(j?.error?.message || `HTTP ${res.status}`)
      }
      return (await res.json()) as DetailResponse
    },
  })

  // Reset verify state when snapshot changes (react-query v5 dropped onSuccess)
  React.useEffect(() => {
    setVerifyResult(null)
    setVerifyError(null)
  }, [snapshotId])

  async function handleVerify() {
    setVerifying(true)
    setVerifyError(null)
    setVerifyResult(null)
    try {
      const res = await fetch(
        `/api/v1/snapshots/${encodeURIComponent(snapshotId)}/verify`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
        },
      )
      const j = (await res.json().catch(() => null)) as
        | { data?: VerifyResult; error?: { message?: string } }
        | null
      if (!res.ok) {
        throw new Error(j?.error?.message || `HTTP ${res.status}`)
      }
      if (j?.data) {
        setVerifyResult(j.data)
        if (j.data.verified) {
          toast.success('ข้อมูลถูกต้อง — hash ตรงกัน')
        } else {
          toast.error('ตรวจพบการแก้ไข — hash ไม่ตรงกัน')
        }
      }
    } catch (e) {
      setVerifyError((e as Error).message)
    } finally {
      setVerifying(false)
    }
  }

  async function copyHash() {
    const hash = data?.data?.snapshot?.contentHash
    if (!hash) return
    try {
      await navigator.clipboard.writeText(hash)
      setCopied(true)
      toast.success('คัดลอก hash แล้ว')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('คัดลอกไม่สำเร็จ')
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#f97316]" />
        <span className="ml-2 text-sm text-slate-500">กำลังโหลด...</span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
        <div className="text-sm text-rose-600 dark:text-rose-400">
          โหลดข้อมูลไม่สำเร็จ: {(error as Error).message}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" /> ลองอีกครั้ง
        </Button>
      </div>
    )
  }

  const snapshot = data?.data?.snapshot
  const rows = data?.data?.rows ?? []

  if (!snapshot) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      {/* Top action bar */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> กลับ
        </Button>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" /> รีเฟรช
        </Button>
      </div>

      {/* Metadata card */}
      <div className="flex-shrink-0 rounded-md border border-slate-200 bg-card p-4 dark:border-slate-700">
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
          <Info
            label="Snapshot ID"
            value={
              <span className="break-all font-mono text-xs">
                {snapshot.snapshotId}
              </span>
            }
          />
          <Info label="รอบเดือน" value={snapshot.cycleMonth} />
          <Info label="Revision" value={`R${snapshot.revision}`} />
          <Info label="สถานะ" value={statusBadge(snapshot.status)} />
          <Info
            label="Rule Version"
            value={snapshot.ruleVersion || '—'}
          />
          <Info
            label="จำนวนแถว"
            value={`${snapshot.rowCount.toLocaleString('th-TH')} แถว`}
          />
          <Info
            label="หน้าขาวดำ"
            value={`${snapshot.totalPagesBw.toLocaleString('th-TH')} แผ่น`}
          />
          <Info
            label="หน้าสี"
            value={`${snapshot.totalPagesColor.toLocaleString('th-TH')} แผ่น`}
          />
          <Info
            label="ค่าใช้จ่ายรวม"
            value={<span className="font-semibold">{formatBaht(snapshot.totalCost)}</span>}
          />
          <Info label="สร้างโดย" value={snapshot.createdBy || '—'} />
          <Info label="สร้างเมื่อ" value={formatThaiDate(snapshot.createdAt)} />
          <div className="col-span-2 md:col-span-1">
            <div className="mb-0.5 text-[11px] text-slate-500">
              Content Hash (SHA-256)
            </div>
            <div className="flex items-start gap-1">
              <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] dark:bg-slate-800">
                {snapshot.contentHash}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyHash}
                className="h-7 w-7 flex-shrink-0 p-0"
                aria-label="คัดลอก hash"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Verify section */}
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#f97316]" />
              <span className="text-sm font-medium">การตรวจสอบความถูกต้อง</span>
              <span className="text-xs text-slate-500">
                (เปรียบเทียบ SHA-256 hash กับข้อมูลปัจจุบัน)
              </span>
            </div>
            <Button size="sm" onClick={handleVerify} disabled={verifying}>
              {verifying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              ตรวจสอบความถูกต้อง
            </Button>
          </div>

          {verifyError ? (
            <div className="mt-2 text-sm text-rose-600 dark:text-rose-400">
              ตรวจสอบไม่สำเร็จ: {verifyError}
            </div>
          ) : null}

          {verifyResult ? (
            <div className="mt-2">
              {verifyResult.verified ? (
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <div className="font-medium">✓ ข้อมูลถูกต้อง</div>
                    <div className="mt-0.5 text-xs">
                      hash ตรงกัน — ไม่พบการแก้ไขหลังสร้าง snapshot
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">✗ ตรวจพบการแก้ไข</div>
                    <div className="mt-1 space-y-0.5 text-xs">
                      <div>
                        Stored hash:{' '}
                        <code className="font-mono">
                          {verifyResult.storedHash}
                        </code>
                      </div>
                      <div>
                        Computed hash:{' '}
                        <code className="font-mono">
                          {verifyResult.computedHash}
                        </code>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Frozen rows */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <div className="flex-shrink-0 text-sm font-medium">
          รายการแถวที่ถูกแช่แข็ง ({rows.length.toLocaleString('th-TH')} แถว)
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
              <TableRow>
                <TableHead className="whitespace-nowrap">เลขครุภัณฑ์</TableHead>
                <TableHead className="whitespace-nowrap">ยี่ห้อ / รุ่น</TableHead>
                <TableHead className="whitespace-nowrap">วันที่จด</TableHead>
                <TableHead className="text-center whitespace-nowrap">ประเภท</TableHead>
                <TableHead className="text-right whitespace-nowrap">มิเตอร์ BW</TableHead>
                <TableHead className="text-right whitespace-nowrap">มิเตอร์สี</TableHead>
                <TableHead className="text-right whitespace-nowrap">หน้า BW</TableHead>
                <TableHead className="text-right whitespace-nowrap">หน้าสี</TableHead>
                <TableHead className="text-right whitespace-nowrap">ค่า BW</TableHead>
                <TableHead className="text-right whitespace-nowrap">ค่าสี</TableHead>
                <TableHead className="whitespace-nowrap">สาขา</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="py-8 text-center text-sm text-slate-500"
                  >
                    ไม่มีแถวข้อมูลใน snapshot นี้
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {r.assetNo}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {[r.brand, r.model].filter(Boolean).join(' ') || '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.readingDate || '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {readingTypeBadge(r.readingType)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.meterBw.toLocaleString('th-TH')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.meterColor.toLocaleString('th-TH')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.pagesBw.toLocaleString('th-TH')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.pagesColor.toLocaleString('th-TH')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {formatBaht(r.costBw)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {formatBaht(r.costColor)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.siteAtReading || '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

// ── Tiny helper for metadata grid ───────────────────────────────────────

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-0.5 text-[11px] text-slate-500">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  )
}
