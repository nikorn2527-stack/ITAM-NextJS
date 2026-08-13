'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Link2,
  Building2,
  Users,
  Save,
  Settings as SettingsIcon,
  Database,
  History,
  Inbox,
  Package,
  FileBarChart,
  Repeat,
  CalendarClock,
  Server,
  Coins,
  Download,
  FileText,
  UserCheck,
  Undo2,
} from 'lucide-react'
import {
  type MasterItem,
  type Site,
  type SiteRate,
  type AuditLog,
  MASTER_CATEGORIES,
} from './types'
import { MasterDataModal } from './master-data-modal'
import { useAppStore, type SettingsTab } from '@/store/app-store'
import { downloadCsv, dateStamp } from '@/lib/csv'

/* ---------- User types & helpers ---------- */
interface AppUser {
  id: string
  email: string
  name: string | null
  role: string // admin | editor | viewer
  active: boolean
  createdAt: string
  updatedAt: string
}

const USER_ROLE_OPTIONS = [
  { value: 'admin', label: 'ผู้ดูแลระบบ', short: 'admin' },
  { value: 'editor', label: 'ผู้แก้ไข', short: 'editor' },
  { value: 'viewer', label: 'ผู้ดู', short: 'viewer' },
] as const

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'admin':
      return 'border-[#f97316]/30 bg-[#f97316]/10 text-[#f97316] dark:border-[#fb923c]/40 dark:bg-[#fb923c]/15 dark:text-[#fb923c]'
    case 'editor':
      return 'border-teal-200 bg-teal-100 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300'
    case 'viewer':
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
  }
}

function roleLabel(role: string): string {
  return USER_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role
}


export function SettingsPage() {
  const pendingTab = useAppStore((s) => s.pendingSettingsTab)
  const clearPendingTab = useAppStore((s) => s.clearPendingSettingsTab)
  const [activeTab, setActiveTab] = React.useState<string>('app')

  React.useEffect(() => {
    if (pendingTab) {
      setActiveTab(pendingTab)
      clearPendingTab()
    }
  }, [pendingTab, clearPendingTab])

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">ตั้งค่าแอป</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          กำหนดค่าระบบ ข้อมูลมาตรฐาน สาขา อัตราค่ากระดาษ และสิทธิ์ผู้ใช้
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="h-auto flex-wrap dark:bg-slate-900 dark:border dark:border-slate-800">
          <TabsTrigger value="app" className="gap-1.5 px-3">
            <SettingsIcon className="h-4 w-4" />
            ตั้งค่าทั่วไป
          </TabsTrigger>
          <TabsTrigger value="master" className="gap-1.5 px-3">
            <Database className="h-4 w-4" />
            ข้อมูลมาตรฐาน
          </TabsTrigger>
          <TabsTrigger value="sites" className="gap-1.5 px-3">
            <Building2 className="h-4 w-4" />
            สาขา
          </TabsTrigger>
          <TabsTrigger value="rates" className="gap-1.5 px-3">
            <Coins className="h-4 w-4" />
            อัตราค่ากระดาษ
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5 px-3">
            <Users className="h-4 w-4" />
            สิทธิ์ผู้ใช้
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 px-3" data-permission="ADMIN">
            <History className="h-4 w-4" />
            ประวัติการใช้งาน
          </TabsTrigger>
        </TabsList>

        <TabsContent value="app" className="mt-4">
          <AppTab />
        </TabsContent>
        <TabsContent value="master" className="mt-4">
          <MasterTab />
        </TabsContent>
        <TabsContent value="sites" className="mt-4">
          <SitesTab />
        </TabsContent>
        <TabsContent value="rates" className="mt-4">
          <RatesTab />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/* ---------- App tab ---------- */
function AppTab() {
  const qc = useQueryClient()
  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings')
      if (!res.ok) throw new Error('Failed to load settings')
      const json = await res.json()
      return json.settings as Record<string, string>
    },
  })
  const { data: sites } = useQuery<Site[]>({
    queryKey: ['sites'],
    queryFn: async () => {
      const res = await fetch('/api/sites')
      if (!res.ok) throw new Error('Failed to load sites')
      const json = await res.json()
      return json.sites as Site[]
    },
  })

  const [form, setForm] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (settings) {
      // Provide defaults for cycle template keys so the UI is initialized
      // even on first load (before the user saves anything).
      const merged: Record<string, string> = {
        'cycleTemplate.enabled': settings['cycleTemplate.enabled'] ?? 'true',
        'cycleTemplate.autoCreate': settings['cycleTemplate.autoCreate'] ?? 'true',
        'cycleTemplate.durationDays': settings['cycleTemplate.durationDays'] ?? '30',
        ...settings,
      }
      setForm(merged)
    }
  }, [settings])

  async function save() {
    try {
      setSaving(true)
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Save failed')
      toast.success('บันทึกการตั้งค่าแล้ว')
      await qc.invalidateQueries({ queryKey: ['settings'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-6">
          <Skeleton className="h-64 w-full dark:bg-slate-800" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
          <SettingsIcon className="h-4 w-4 text-[#f97316]" />
          ตั้งค่าทั่วไป
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              ชื่อองค์กร
            </Label>
            <Input
              value={form.orgName ?? ''}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
              placeholder="PNG TEAM"
              className="dark:bg-slate-800 dark:border-slate-700"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              สาขาเริ่มต้น
            </Label>
            <Select
              value={form.defaultSite ?? ''}
              onValueChange={(v) => setForm({ ...form, defaultSite: v })}
            >
              <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700">
                <SelectValue placeholder="เลือกสาขา" />
              </SelectTrigger>
              <SelectContent>
                {(sites ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.code}>
                    {s.code} — {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
          <div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
              ล็อกอินด้วยรหัสผ่าน
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              อนุญาตนอกเหนือจาก SSO (Google)
            </div>
          </div>
          <Switch
            checked={form.enablePasswordLogin === 'true'}
            onCheckedChange={(c) =>
              setForm({ ...form, enablePasswordLogin: c ? 'true' : 'false' })
            }
          />
        </div>

        {/* Cycle template section — distinct Card with subtle gradient bg */}
        <div className="overflow-hidden rounded-lg border border-[#f97316]/30 bg-gradient-to-br from-orange-50 via-white to-white shadow-sm dark:border-[#f97316]/40 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
          <div className="flex items-center gap-2 border-b border-[#f97316]/20 bg-gradient-to-r from-orange-50/80 to-transparent px-4 py-3 dark:border-[#f97316]/30 dark:from-slate-800/60 dark:to-transparent">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#f97316]/15 text-[#f97316] dark:bg-[#fb923c]/15 dark:text-[#fb923c]">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                ตั้งค่ารอบจดมิเตอร์อัตโนมัติ
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                กำหนดเทมเพลตสำหรับสร้างรอบใหม่เมื่อจบรอบปัจจุบัน
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4">
            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="pr-3">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  สร้างรอบใหม่อัตโนมัติเมื่อจบรอบ
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  เมื่อจบรอบปัจจุบัน ระบบจะแนะนำการสร้างรอบใหม่โดยอัตโนมัติ
                </div>
              </div>
              <Switch
                checked={form['cycleTemplate.autoCreate'] === 'true'}
                onCheckedChange={(c) =>
                  setForm({
                    ...form,
                    'cycleTemplate.autoCreate': c ? 'true' : 'false',
                    'cycleTemplate.enabled': c ? 'true' : 'false',
                  })
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  ระยะเวลารอบ (วัน)
                </Label>
                <Input
                  type="number"
                  min={7}
                  max={90}
                  value={form['cycleTemplate.durationDays'] ?? '30'}
                  onChange={(e) => {
                    const v = Math.min(
                      90,
                      Math.max(7, Number(e.target.value) || 30),
                    )
                    setForm({
                      ...form,
                      'cycleTemplate.durationDays': String(v),
                    })
                  }}
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div className="flex items-end">
                <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                  ชื่อรอบใหม่จะเป็น "<span className="font-medium">รอบจดมิเตอร์ &lt;เดือน&gt; &lt;ปี&gt;</span>"
                  เริ่มวันนี้ และสิ้นสุดในอีก {form['cycleTemplate.durationDays'] ?? '30'} วัน
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-[#f97316]/5 px-3 py-2 text-xs text-[#f97316] dark:bg-[#fb923c]/10 dark:text-[#fb923c]">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                ตั้งค่านี้ใช้กับการจบรอบจดมิเตอร์ในหน้า "จดมิเตอร์" → จัดการรอบ เท่านั้น
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={save}
            disabled={saving}
            className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
          >
            <Save className="h-4 w-4" />
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- Master tab ---------- */
function MasterTab() {
  const qc = useQueryClient()
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all')
  const [modalOpen, setModalOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<MasterItem | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<MasterItem | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [syncing, setSyncing] = React.useState<string | null>(null)

  const { data: items, isLoading } = useQuery<MasterItem[]>({
    queryKey: ['master', categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (categoryFilter !== 'all') params.set('category', categoryFilter)
      const res = await fetch(`/api/master?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load master')
      const json = await res.json()
      return json.items as MasterItem[]
    },
  })

  function openAdd() {
    setEditTarget(null)
    setModalOpen(true)
  }
  function openEdit(item: MasterItem) {
    setEditTarget(item)
    setModalOpen(true)
  }

  async function runSync(type: 'model' | 'dept' | 'labels') {
    try {
      setSyncing(type)
      const res = await fetch(`/api/master/sync?type=${type}`, {
        method: 'POST',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Sync failed')
      }
      const json = await res.json()
      toast.success(
        `ซิงค์ข้อมูลสำเร็จ (${type}) — อัปเดต ${json.updated ?? 0} รายการ`,
      )
      await qc.invalidateQueries({ queryKey: ['master'] })
      await qc.invalidateQueries({ queryKey: ['devices'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      const res = await fetch(`/api/master/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Delete failed')
      }
      toast.success('ลบรายการแล้ว')
      setDeleteTarget(null)
      await qc.invalidateQueries({ queryKey: ['master'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
          <Database className="h-4 w-4 text-[#f97316]" />
          ข้อมูลมาตรฐาน (Master Data)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={categoryFilter}
              onValueChange={setCategoryFilter}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="หมวดหมู่" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">หมวดหมู่ทั้งหมด</SelectItem>
                {MASTER_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => runSync('model')}
              disabled={syncing !== null}
            >
              <Link2 className="h-3.5 w-3.5" />
              {syncing === 'model' ? '...' : 'Model'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runSync('dept')}
              disabled={syncing !== null}
            >
              <Link2 className="h-3.5 w-3.5" />
              {syncing === 'dept' ? '...' : 'Dept'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => runSync('labels')}
              disabled={syncing !== null}
            >
              <Link2 className="h-3.5 w-3.5" />
              {syncing === 'labels' ? '...' : 'Labels'}
            </Button>
            <Button
              onClick={openAdd}
              className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
              size="sm"
            >
              <Plus className="h-3.5 w-3.5" />
              เพิ่มรายการ
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => qc.invalidateQueries({ queryKey: ['master'] })}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="itam-scroll max-h-[55vh] overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm dark:bg-slate-900/95">
              <TableRow>
                <TableHead className="text-slate-600 dark:text-slate-300">หมวดหมู่</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300">รหัส</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300">ชื่อ</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300">ParentRef</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300">DisplayLabel</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300">SiteCode</TableHead>
                <TableHead className="text-right text-slate-600 dark:text-slate-300">การจัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-6 w-full dark:bg-slate-800" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (items ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12">
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <Database className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                      </div>
                      <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        ไม่พบรายการมาตรฐาน
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        {categoryFilter !== 'all'
                          ? 'ไม่มีรายการในหมวดหมู่ที่เลือก — ลองเปลี่ยนหมวดหมู่ หรือเพิ่มรายการใหม่'
                          : 'เริ่มต้นด้วยการเพิ่มรายการมาตรฐาน (แบรนด์/ประเภท/รุ่น/แผนก ฯลฯ)'}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (items ?? []).map((it) => (
                  <TableRow key={it.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TableCell>
                      <Badge className="border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {it.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-medium text-slate-700 dark:text-slate-200">
                      {it.code}
                    </TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200">{it.label}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {it.parentRef ?? '-'}
                    </TableCell>
                    <TableCell className="text-slate-600 dark:text-slate-300">
                      {it.displayLabel ?? '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {it.siteCode ?? '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(it)}
                          aria-label="แก้ไข"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteTarget(it)}
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
        <div className="text-xs text-slate-400 dark:text-slate-500">
          ทั้งหมด {(items ?? []).length} รายการ · ปุ่มซิงค์ (Model/Dept/Labels) ใช้สำหรับ backfill ฟิลด์ ParentRef / DepartmentCode / DisplayLabel
        </div>
      </CardContent>

      <MasterDataModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editTarget}
        fixedCategory={
          categoryFilter !== 'all' ? categoryFilter : undefined
        }
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-800 dark:text-slate-100">ยืนยันการลบรายการ</AlertDialogTitle>
            <AlertDialogDescription>
              ลบ{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {deleteTarget?.label} ({deleteTarget?.code})
              </span>{' '}
              ออกจากข้อมูลมาตรฐาน?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {deleting ? 'กำลังลบ...' : 'ลบ'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

/* ---------- Sites tab ---------- */
function SitesTab() {
  const qc = useQueryClient()
  const { data: sites, isLoading } = useQuery<Site[]>({
    queryKey: ['sites'],
    queryFn: async () => {
      const res = await fetch('/api/sites')
      if (!res.ok) throw new Error('Failed to load sites')
      const json = await res.json()
      return json.sites as Site[]
    },
  })

  const [code, setCode] = React.useState('')
  const [name, setName] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  async function addSite() {
    if (!code || !name) {
      toast.error('กรุณากรอกรหัสและชื่อสาขา')
      return
    }
    try {
      setSaving(true)
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Add failed')
      }
      toast.success('เพิ่มสาขาแล้ว')
      setCode('')
      setName('')
      await qc.invalidateQueries({ queryKey: ['sites'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Add failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
          <Building2 className="h-4 w-4 text-[#f97316]" />
          สาขา
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <Input
            placeholder="รหัสสาขา"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Input
            placeholder="ชื่อสาขา"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            onClick={addSite}
            disabled={saving}
            className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
          >
            <Plus className="h-4 w-4" />
            เพิ่ม
          </Button>
        </div>

        <div className="rounded-md border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900">
              <TableRow>
                <TableHead className="text-slate-600 dark:text-slate-300">รหัส</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300">ชื่อ</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300">วันที่สร้าง</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Skeleton className="h-6 w-full dark:bg-slate-800" />
                  </TableCell>
                </TableRow>
              ) : (sites ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-12">
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <Building2 className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                      </div>
                      <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        ยังไม่มีสาขา
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        เพิ่มสาขาแรกโดยกรอกรหัสและชื่อด้านบน แล้วกดปุ่ม &quot;เพิ่ม&quot;
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (sites ?? []).map((s) => (
                  <TableRow key={s.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TableCell className="font-mono text-xs font-medium text-slate-700 dark:text-slate-200">
                      {s.code}
                    </TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-200">{s.name}</TableCell>
                    <TableCell className="text-xs text-slate-400 dark:text-slate-500">
                      {new Date(s.createdAt).toLocaleDateString('th-TH')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- Rates tab (site paper rates) ---------- */
function RatesTab() {
  const qc = useQueryClient()
  const { data: rates, isLoading } = useQuery<SiteRate[]>({
    queryKey: ['site-rates'],
    queryFn: async () => {
      const res = await fetch('/api/site-rates')
      if (!res.ok) throw new Error('Failed to load site rates')
      const json = await res.json()
      return (json.rates ?? []) as SiteRate[]
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

  const [editTarget, setEditTarget] = React.useState<SiteRate | null>(null)
  const [addOpen, setAddOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<SiteRate | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      const res = await fetch(`/api/site-rates/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Delete failed')
      }
      toast.success('ลบอัตราค่ากระดาษแล้ว')
      setDeleteTarget(null)
      await qc.invalidateQueries({ queryKey: ['site-rates'] })
      await qc.invalidateQueries({ queryKey: ['cost-analytics'] })
      await qc.invalidateQueries({ queryKey: ['audit'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
          <Coins className="h-4 w-4 text-[#f97316]" />
          💰 อัตราค่ากระดาษรายสาขา
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            กำหนดอัตราค่ากระดาษขาวดำ / สี (บาท/แผ่น) สำหรับแต่ละสาขา — ใช้คำนวณต้นทุนในหน้าการใช้กระดาษ
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => qc.invalidateQueries({ queryKey: ['site-rates'] })}
              aria-label="รีเฟรช"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              onClick={() => {
                setEditTarget(null)
                setAddOpen(true)
              }}
              size="sm"
              disabled={(sites ?? []).length === 0}
              className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              <Plus className="h-3.5 w-3.5" />
              เพิ่มอัตรา
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader className="sticky top-0 bg-slate-100/95 backdrop-blur-sm dark:bg-slate-900/95">
              <TableRow>
                <TableHead className="text-slate-600 dark:text-slate-300">สาขา</TableHead>
                <TableHead className="text-right text-slate-600 dark:text-slate-300">อัตราขาวดำ (฿/แผ่น)</TableHead>
                <TableHead className="text-right text-slate-600 dark:text-slate-300">อัตราสี (฿/แผ่น)</TableHead>
                <TableHead className="text-right text-slate-600 dark:text-slate-300">การจัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-6 w-full dark:bg-slate-800" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (rates ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12">
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <Coins className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                      </div>
                      <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        ยังไม่มีอัตราค่ากระดาษ
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        เพิ่มอัตราสาขาแรกโดยกดปุ่ม &quot;เพิ่มอัตรา&quot; ด้านขวาบน
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (rates ?? []).map((r) => (
                  <TableRow key={r.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TableCell>
                      <div className="font-medium text-slate-700 dark:text-slate-200">{r.siteName}</div>
                      <div className="font-mono text-xs text-slate-400 dark:text-slate-500">{r.siteCode}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-700 dark:text-slate-200">
                      ฿{r.bwRate.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-700 dark:text-slate-200">
                      ฿{r.colorRate.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditTarget(r)
                            setAddOpen(true)
                          }}
                          aria-label="แก้ไข"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteTarget(r)}
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
        <div className="text-xs text-slate-400 dark:text-slate-500">
          ทั้งหมด {(rates ?? []).length} รายการ · ค่าเริ่มต้น ขาวดำ 0.50 ฿/แผ่น · สี 2.00 ฿/แผ่น
        </div>
      </CardContent>

      <SiteRateDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initial={editTarget}
        sites={sites ?? []}
        existingRates={rates ?? []}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-800 dark:text-slate-100">ยืนยันการลบอัตราค่ากระดาษ</AlertDialogTitle>
            <AlertDialogDescription>
              ลบอัตราค่ากระดาษของสาขา{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {deleteTarget?.siteName} ({deleteTarget?.siteCode})
              </span>{' '}
              ออกจากระบบ? การคำนวณต้นทุนของสาขานี้จะกลับไปใช้อัตราเริ่มต้น (0.50 ฿/แผ่น)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
            >
              {deleting ? 'กำลังลบ...' : 'ลบ'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

/* ---------- Site rate add/edit dialog ---------- */
function SiteRateDialog({
  open,
  onOpenChange,
  initial,
  sites,
  existingRates,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial: SiteRate | null
  sites: Site[]
  existingRates: SiteRate[]
}) {
  const qc = useQueryClient()
  const [siteCode, setSiteCode] = React.useState('')
  const [bwRate, setBwRate] = React.useState('0.50')
  const [colorRate, setColorRate] = React.useState('2.00')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      if (initial) {
        setSiteCode(initial.siteCode)
        setBwRate(String(initial.bwRate))
        setColorRate(String(initial.colorRate))
      } else {
        setSiteCode('')
        setBwRate('0.50')
        setColorRate('2.00')
      }
    }
  }, [open, initial])

  const isEdit = Boolean(initial)
  const availableSites = sites.filter(
    (s) => !existingRates.some((r) => r.siteCode === s.code) || s.code === siteCode,
  )

  async function save() {
    if (!siteCode) {
      toast.error('กรุณาเลือกสาขา')
      return
    }
    const bw = parseFloat(bwRate)
    const color = parseFloat(colorRate)
    if (!Number.isFinite(bw) || bw < 0) {
      toast.error('อัตราขาวดำต้องเป็นตัวเลขที่ไม่ติดลบ')
      return
    }
    if (!Number.isFinite(color) || color < 0) {
      toast.error('อัตราสีต้องเป็นตัวเลขที่ไม่ติดลบ')
      return
    }
    try {
      setSaving(true)
      const res = await fetch('/api/site-rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteCode, bwRate: bw, colorRate: color }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Save failed')
      }
      toast.success(isEdit ? 'แก้ไขอัตราค่ากระดาษแล้ว' : 'เพิ่มอัตราค่ากระดาษแล้ว')
      onOpenChange(false)
      await qc.invalidateQueries({ queryKey: ['site-rates'] })
      await qc.invalidateQueries({ queryKey: ['cost-analytics'] })
      await qc.invalidateQueries({ queryKey: ['audit'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <Coins className="h-4 w-4 text-[#f97316]" />
            {isEdit ? '✏️ แก้ไขอัตราค่ากระดาษ' : '➕ เพิ่มอัตราค่ากระดาษ'}
          </DialogTitle>
          <DialogDescription>
            กำหนดอัตราค่ากระดาษขาวดำ/สี (บาท/แผ่น) สำหรับสาขานี้
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              สาขา *
            </Label>
            <Select
              value={siteCode}
              onValueChange={setSiteCode}
              disabled={isEdit}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="เลือกสาขา" />
              </SelectTrigger>
              <SelectContent>
                {availableSites.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEdit && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                ไม่สามารถเปลี่ยนสาขาได้ในการแก้ไข — ลบแล้วเพิ่มใหม่หากต้องการย้าย
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                อัตราขาวดำ (฿/แผ่น)
              </Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                value={bwRate}
                onChange={(e) => setBwRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                อัตราสี (฿/แผ่น)
              </Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                value={colorRate}
                onChange={(e) => setColorRate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            ยกเลิก
          </Button>
          <Button
            onClick={save}
            disabled={saving || (!isEdit && !siteCode)}
            className="bg-[#f97316] text-white hover:bg-[#ea580c] focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-950"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- Users tab (read-only) ---------- */
function UsersTab() {
  const qc = useQueryClient()
  const { data: users, isLoading } = useQuery<AppUser[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error('Failed to load users')
      const json = await res.json()
      return json.users as AppUser[]
    },
  })

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<AppUser | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<AppUser | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Form fields
  const [email, setEmail] = React.useState('')
  const [name, setName] = React.useState('')
  const [role, setRole] = React.useState<string>('viewer')
  const [active, setActive] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [touched, setTouched] = React.useState(false)

  const emailValid = EMAIL_RE.test(email.trim())
  const emailError =
    touched && email.length > 0 && !emailValid
      ? 'รูปแบบอีเมลไม่ถูกต้อง'
      : null

  // Active-admin count — used to disable delete / deactivation for the last admin
  const activeAdminCount = (users ?? []).filter(
    (u) => u.role === 'admin' && u.active,
  ).length

  function openAdd() {
    setEditTarget(null)
    setEmail('')
    setName('')
    setRole('viewer')
    setActive(true)
    setTouched(false)
    setDialogOpen(true)
  }

  function openEdit(u: AppUser) {
    setEditTarget(u)
    setEmail(u.email)
    setName(u.name ?? '')
    setRole(u.role)
    setActive(u.active)
    setTouched(false)
    setDialogOpen(true)
  }

  async function save() {
    setTouched(true)
    if (!emailValid) return
    try {
      setSaving(true)
      const payload = {
        email: email.trim().toLowerCase(),
        name: name.trim() || null,
        role,
        active,
      }
      const res = editTarget
        ? await fetch(`/api/users/${editTarget.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Save failed')
      }
      toast.success(editTarget ? 'แก้ไขผู้ใช้แล้ว' : 'เพิ่มผู้ใช้แล้ว')
      setDialogOpen(false)
      await qc.invalidateQueries({ queryKey: ['users'] })
      await qc.invalidateQueries({ queryKey: ['audit'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(u: AppUser, next: boolean) {
    // If turning off an active admin, check last-admin guard on client too
    if (
      u.role === 'admin' &&
      u.active === true &&
      next === false &&
      activeAdminCount <= 1
    ) {
      toast.error('ไม่สามารถปิดการใช้งานผู้ดูแลคนสุดท้ายได้')
      return
    }
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Update failed')
      }
      toast.success(next ? 'เปิดใช้งานแล้ว' : 'ปิดใช้งานแล้ว')
      await qc.invalidateQueries({ queryKey: ['users'] })
      await qc.invalidateQueries({ queryKey: ['audit'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Delete failed')
      }
      toast.success('ลบผู้ใช้แล้ว')
      setDeleteTarget(null)
      await qc.invalidateQueries({ queryKey: ['users'] })
      await qc.invalidateQueries({ queryKey: ['audit'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  const isLastAdmin = (u: AppUser): boolean =>
    u.role === 'admin' && u.active && activeAdminCount <= 1

  return (
    <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
          <Users className="h-4 w-4 text-[#f97316]" />
          สิทธิ์ผู้ใช้
        </CardTitle>
        <Button
          size="sm"
          onClick={openAdd}
          className="bg-[#f97316] text-white hover:bg-[#ea580c]"
        >
          <Plus className="h-4 w-4" />
          เพิ่มผู้ใช้
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
          <div className="itam-scroll overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-900">
                <TableRow>
                  <TableHead className="text-slate-600 dark:text-slate-300">อีเมล</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">ชื่อ</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">บทบาท</TableHead>
                  <TableHead className="text-slate-600 dark:text-slate-300">สถานะ</TableHead>
                  <TableHead className="text-right text-slate-600 dark:text-slate-300">การจัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={`us-${i}`}>
                      <TableCell colSpan={5}>
                        <Skeleton className="h-8 w-full dark:bg-slate-800" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (users ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      ยังไม่มีผู้ใช้ — กด "เพิ่มผู้ใช้" เพื่อเริ่ม
                    </TableCell>
                  </TableRow>
                ) : (
                  (users ?? []).map((u) => {
                    const last = isLastAdmin(u)
                    return (
                      <TableRow
                        key={u.id}
                        className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <TableCell className="font-medium text-slate-700 dark:text-slate-200">
                          {u.email}
                        </TableCell>
                        <TableCell className="text-slate-600 dark:text-slate-300">
                          {u.name || <span className="text-slate-400">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={roleBadgeClass(u.role)}>
                            {roleLabel(u.role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={u.active}
                              disabled={last}
                              onCheckedChange={(c) => toggleActive(u, c)}
                              aria-label="สถานะผู้ใช้"
                            />
                            <span
                              className={`text-xs ${
                                u.active
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {u.active ? 'ใช้งาน' : 'ปิด'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEdit(u)}
                              aria-label="แก้ไข"
                              className="h-8 w-8 text-slate-500 hover:text-[#f97316] dark:text-slate-400 dark:hover:text-[#fb923c]"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteTarget(u)}
                              aria-label="ลบ"
                              disabled={last}
                              className="h-8 w-8 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          บทบาท: <span className="font-medium text-[#f97316]">admin</span> = จัดการได้ทุกอย่าง ·{' '}
          <span className="font-medium text-teal-600 dark:text-teal-400">editor</span> = แก้ไขข้อมูลได้ ·{' '}
          <span className="font-medium text-slate-500 dark:text-slate-400">viewer</span> = ดูได้อย่างเดียว
        </p>

        {/* Add / Edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-slate-800 dark:text-slate-100">
                {editTarget ? 'แก้ไขผู้ใช้' : 'เพิ่มผู้ใช้'}
              </DialogTitle>
              <DialogDescription>
                กรอกข้อมูลผู้ใช้และกำหนดบทบาท
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="user-email" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  อีเมล *
                </Label>
                <Input
                  id="user-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder="name@example.com"
                  className={
                    emailError
                      ? 'border-rose-400 focus-visible:ring-rose-300 dark:border-rose-700'
                      : 'dark:bg-slate-800 dark:border-slate-700'
                  }
                />
                {emailError ? (
                  <div className="text-xs text-rose-600 dark:text-rose-400">{emailError}</div>
                ) : (
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    ใช้สำหรับล็อกอิน ต้องเป็นอีเมลที่ถูกต้อง
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="user-name" className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  ชื่อ
                </Label>
                <Input
                  id="user-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ชื่อ นามสกุล"
                  className="dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600 dark:text-slate-300">บทบาท</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="w-full dark:bg-slate-800 dark:border-slate-700">
                    <SelectValue placeholder="เลือกบทบาท" />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_ROLE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={roleBadgeClass(o.value)}>
                            {o.short}
                          </Badge>
                          <span>{o.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
                <div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">เปิดใช้งาน</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    ปิดเพื่อระงับการเข้าถึงชั่วคราว
                  </div>
                </div>
                <Switch checked={active} onCheckedChange={setActive} />
              </div>
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
                disabled={saving || !emailValid}
                className="bg-[#f97316] text-white hover:bg-[#ea580c]"
              >
                <Save className="h-4 w-4" />
                {saving ? 'กำลังบันทึก...' : editTarget ? 'บันทึก' : 'เพิ่ม'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(o) => {
            if (!o) setDeleteTarget(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>ยืนยันการลบผู้ใช้</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  จะลบผู้ใช้{' '}
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {deleteTarget?.email}
                  </span>{' '}
                  ({deleteTarget ? roleLabel(deleteTarget.role) : ''}) ออกจากระบบ
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteTarget && isLastAdmin(deleteTarget) ? (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                ⚠️ ไม่สามารถลบผู้ดูแลคนสุดท้ายได้ — กรุณาเพิ่มผู้ดูแลคนอื่นก่อน
              </div>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                disabled={deleting || (deleteTarget ? isLastAdmin(deleteTarget) : false)}
                className="bg-rose-600 text-white hover:bg-rose-700"
              >
                {deleting ? 'กำลังลบ...' : 'ลบ'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}

/* ---------- Audit tab ---------- */
const AUDIT_ENTITY_OPTIONS = [
  'Device',
  'MasterItem',
  'MeterReading',
  'Cycle',
  'Site',
  'Setting',
  'User',
] as const

const AUDIT_ACTION_OPTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'METER_READING',
  'SYNC',
  'SEED',
  'IMPORT',
  'TRANSFER',
  'PRINT',
  'ASSIGN',
  'RETURN',
  'CYCLE_START',
  'CYCLE_END',
  'CYCLE_CANCEL',
  'CYCLE_REOPEN',
  'BULK_UPDATE',
  'BULK_TRANSFER',
  'BULK_DELETE',
] as const

function actionBadgeClass(action: string): string {
  const base = ' transition-colors hover:scale-105'
  switch (action) {
    case 'CREATE':
      return 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' + base
    case 'UPDATE':
      return 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300' + base
    case 'DELETE':
      return 'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300' + base
    case 'METER_READING':
      return 'border-[#f97316]/30 bg-[#f97316]/10 text-[#f97316]' + base
    case 'SYNC':
      return 'border-teal-300 bg-teal-100 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300' + base
    case 'SEED':
      return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300' + base
    case 'CYCLE_START':
      return 'border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300' + base
    case 'CYCLE_END':
      return 'border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300' + base
    case 'CYCLE_CANCEL':
      return 'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300' + base
    case 'CYCLE_REOPEN':
      return 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' + base
    case 'IMPORT':
      return 'border-teal-300 bg-teal-100 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300' + base
    case 'TRANSFER':
      return 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300' + base
    case 'PRINT':
      return 'border-[#f97316]/30 bg-[#f97316]/10 text-[#f97316]' + base
    case 'ASSIGN':
      return 'border-teal-300 bg-teal-100 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300' + base
    case 'RETURN':
      return 'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300' + base
    case 'BULK_UPDATE':
      return 'border-[#f97316]/30 bg-[#f97316]/10 text-[#f97316]' + base
    case 'BULK_TRANSFER':
      return 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300' + base
    case 'BULK_DELETE':
      return 'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300' + base
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300' + base
  }
}

function entityIcon(entity: string) {
  const cls = 'h-3.5 w-3.5'
  switch (entity) {
    case 'Device':
      return <Package className={cls} />
    case 'MasterItem':
      return <Database className={cls} />
    case 'MeterReading':
      return <FileBarChart className={cls} />
    case 'Cycle':
      return <CalendarClock className={cls} />
    case 'Site':
      return <Building2 className={cls} />
    case 'Setting':
      return <SettingsIcon className={cls} />
    case 'User':
      return <Users className={cls} />
    case 'Assignment':
      return <UserCheck className={cls} />
    default:
      return <Server className={cls} />
  }
}

function formatThaiDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function AuditTab() {
  const qc = useQueryClient()
  const [entity, setEntity] = React.useState('all')
  const [action, setAction] = React.useState('all')
  const [q, setQ] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')

  // Debounce search input
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350)
    return () => clearTimeout(t)
  }, [q])

  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ['audit', entity, action, debouncedQ],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set('limit', '100')
      if (entity !== 'all') params.set('entity', entity)
      if (action !== 'all') params.set('action', action)
      if (debouncedQ) params.set('q', debouncedQ)
      const res = await fetch(`/api/audit?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load audit logs')
      const json = await res.json()
      return (json.logs ?? []) as AuditLog[]
    },
  })

  // Org name shown in the PDF report header.
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings')
      if (!res.ok) return {}
      const json = await res.json()
      return (json.settings as Record<string, string>) ?? {}
    },
    staleTime: 60_000,
  })

  const [exporting, setExporting] = React.useState<'csv' | 'pdf' | null>(null)

  async function fetchAllFiltered(): Promise<AuditLog[]> {
    // Always request a high limit so exports include every matching entry,
    // not just the visible page (limit 100 on the table query).
    const params = new URLSearchParams()
    params.set('limit', '500')
    if (entity !== 'all') params.set('entity', entity)
    if (action !== 'all') params.set('action', action)
    if (debouncedQ) params.set('q', debouncedQ)
    const res = await fetch(`/api/audit?${params.toString()}`)
    if (!res.ok) throw new Error('Failed to fetch audit logs')
    const json = await res.json()
    return (json.logs ?? []) as AuditLog[]
  }

  function describeFilters(): string {
    const parts: string[] = []
    parts.push(
      'รายการ: ' + (entity === 'all' ? 'ทั้งหมด' : entity),
    )
    parts.push(
      'การกระทำ: ' + (action === 'all' ? 'ทั้งหมด' : action),
    )
    if (debouncedQ) parts.push('คำค้น: "' + debouncedQ + '"')
    return parts.join(' · ')
  }

  function escapeHtml(s: string): string {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  async function exportCsv() {
    try {
      setExporting('csv')
      const all = await fetchAllFiltered()
      if (all.length === 0) {
        toast.error('ไม่มีรายการให้ส่งออก')
        return
      }
      const headers = [
        { key: 'createdAt', label: 'วันที่เวลา' },
        { key: 'action', label: 'การกระทำ' },
        { key: 'entity', label: 'รายการ' },
        { key: 'summary', label: 'รายละเอียด' },
        { key: 'actor', label: 'ผู้กระทำ' },
      ]
      const rows = all.map((l) => ({
        createdAt: formatThaiDateTime(l.createdAt),
        action: l.action,
        entity: l.entity + (l.entityId ? ' · ' + l.entityId.slice(-8) : ''),
        summary: l.summary,
        actor: l.actor,
      }))
      downloadCsv(`audit-log-${dateStamp()}.csv`, rows, headers)
      toast.success(`ส่งออก ${all.length} รายการแล้ว`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'CSV export failed')
    } finally {
      setExporting(null)
    }
  }

  async function exportPdf() {
    try {
      setExporting('pdf')
      const all = await fetchAllFiltered()
      if (all.length === 0) {
        toast.error('ไม่มีรายการให้ส่งออก')
        return
      }
      const printWindow = window.open('', '_blank', 'width=900,height=700')
      if (!printWindow) {
        toast.error('ไม่สามารถเปิดหน้าต่างพิมพ์ได้ — กรุณาอนุญาต popup')
        return
      }
      const org = settings?.orgName ?? '—'
      const generatedDate = new Date().toLocaleString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
      const filters = describeFilters()
      const rows = all
        .map(
          (l, i) => `
          <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
            <td>${escapeHtml(formatThaiDateTime(l.createdAt))}</td>
            <td><span class="badge badge-${escapeHtml(l.action.toLowerCase())}">${escapeHtml(l.action)}</span></td>
            <td>${escapeHtml(l.entity)}${l.entityId ? ' <span class="muted">·' + escapeHtml(l.entityId.slice(-8)) + '</span>' : ''}</td>
            <td>${escapeHtml(l.summary)}</td>
            <td>${escapeHtml(l.actor)}</td>
          </tr>`,
        )
        .join('')
      const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<title>ประวัติการใช้งานระบบ — Audit Log</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Sukhumvit Set","Noto Sans Thai","Tahoma","Segoe UI",sans-serif;
    color: #1e293b; margin: 0; padding: 0; font-size: 11px;
  }
  .header { border-bottom: 3px solid #f97316; padding-bottom: 8px; margin-bottom: 10px; }
  .header h1 { font-size: 18px; margin: 0 0 4px 0; color: #0f172a; }
  .header .meta { font-size: 10px; color: #64748b; line-height: 1.5; }
  .header .org { font-weight: 600; color: #0d9488; }
  .filters {
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 4px; padding: 6px 8px; margin-bottom: 10px;
    font-size: 10px; color: #475569;
  }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead th {
    background: #0f172a; color: #fff; padding: 6px 8px; text-align: left;
    font-size: 10px; font-weight: 600; border: 1px solid #0f172a;
  }
  tbody td { padding: 5px 8px; border: 1px solid #e2e8f0; vertical-align: top; }
  tr.odd td { background: #fafbfc; }
  tr.even td { background: #ffffff; }
  .badge {
    display: inline-block; padding: 1px 6px; border-radius: 3px;
    font-size: 9px; font-weight: 600; color: #fff;
    background: #64748b; min-width: 28px; text-align: center;
  }
  .badge-create, .badge-cycle_reopen { background: #10b981; }
  .badge-update, .badge-transfer, .badge-bulk_transfer { background: #f59e0b; color: #1e293b; }
  .badge-delete, .badge-cycle_cancel, .badge-bulk_delete { background: #f43f5e; }
  .badge-meter_reading, .badge-print, .badge-bulk_update { background: #f97316; }
  .badge-sync, .badge-import { background: #14b8a6; }
  .badge-assign { background: #14b8a6; }
  .badge-return { background: #f43f5e; }
  .badge-cycle_start, .badge-cycle_end { background: #8b5cf6; }
  .badge-seed { background: #64748b; }
  .muted { color: #94a3b8; }
  .footer {
    margin-top: 12px; padding-top: 8px; border-top: 1px solid #e2e8f0;
    font-size: 9px; color: #94a3b8; text-align: center;
  }
  .footer strong { color: #f97316; }
</style>
</head>
<body>
  <div class="header">
    <h1>📋 ประวัติการใช้งานระบบ</h1>
    <div class="meta">
      <div class="org">${escapeHtml(org)}</div>
      <div>สร้างเมื่อ: ${escapeHtml(generatedDate)} · จำนวนรายการ: ${all.length}</div>
    </div>
  </div>
  <div class="filters">🔎 ตัวกรอง — ${escapeHtml(filters)}</div>
  <table>
    <thead>
      <tr>
        <th style="width: 110px">วันที่เวลา</th>
        <th style="width: 90px">การกระทำ</th>
        <th style="width: 100px">รายการ</th>
        <th>รายละเอียด</th>
        <th style="width: 100px">ผู้กระทำ</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="footer">
    <strong>PNG TEAM</strong> — IT Asset Management · Audit Log Report
  </div>
  <script>
    window.onload = function () { setTimeout(function () { window.print(); }, 250); };
  </script>
</body>
</html>`
      printWindow.document.open()
      printWindow.document.write(html)
      printWindow.document.close()
      toast.success(`กำลังเปิดหน้าพิมพ์ (${all.length} รายการ)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF export failed')
    } finally {
      setExporting(null)
    }
  }

  return (
    <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
          <History className="h-4 w-4 text-[#f97316]" />
          ประวัติการใช้งาน (Audit Log)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter bar */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="รายการ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">รายการทั้งหมด</SelectItem>
              {AUDIT_ENTITY_OPTIONS.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="การกระทำ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">การกระทำทั้งหมด</SelectItem>
              {AUDIT_ACTION_OPTIONS.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <RefreshCw className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-45 text-slate-400" />
            <Input
              placeholder="ค้นหาจากคำอธิบาย..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => qc.invalidateQueries({ queryKey: ['audit'] })}
            aria-label="รีเฟรช"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={exporting !== null}
            aria-label="ส่งออก CSV"
            title="ส่งออก CSV (ทั้งหมดตามตัวกรอง)"
            className="border-[#0d9488] text-[#0d9488] hover:bg-[#0d9488]/10 focus-visible:ring-2 focus-visible:ring-[#0d9488] focus-visible:ring-offset-1 dark:border-[#14b8a6] dark:text-[#14b8a6] dark:hover:bg-[#14b8a6]/10 dark:focus-visible:ring-offset-slate-950"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
          <Button
            variant="outline"
            onClick={exportPdf}
            disabled={exporting !== null}
            aria-label="ส่งออก PDF"
            title="ส่งออก PDF (ทั้งหมดตามตัวกรอง)"
            className="border-[#f97316] text-[#f97316] hover:bg-[#f97316]/10 focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-1 dark:border-[#fb923c] dark:text-[#fb923c] dark:hover:bg-[#fb923c]/10 dark:focus-visible:ring-offset-slate-950"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">PDF</span>
          </Button>
        </div>

        {/* Table */}
        <div className="itam-scroll max-h-[60vh] overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm dark:bg-slate-900/95">
              <TableRow>
                <TableHead className="w-44 text-slate-600 dark:text-slate-300">วันที่เวลา</TableHead>
                <TableHead className="w-36 text-slate-600 dark:text-slate-300">การกระทำ</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300">รายการ</TableHead>
                <TableHead className="w-44 text-slate-600 dark:text-slate-300">ผู้กระทำ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-6 w-full dark:bg-slate-800" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (logs ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12">
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        <Inbox className="h-7 w-7 text-slate-300 dark:text-slate-600" />
                      </div>
                      <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                        ยังไม่มีประวัติการใช้งาน
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">
                        ระบบจะบันทึกการกระทำต่าง ๆ (เพิ่ม/แก้ไข/ลบ/จดมิเตอร์/ซิงค์/นำเข้า/ย้าย/พิมพ์) ที่นี่
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (logs ?? []).map((log) => (
                  <TableRow key={log.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TableCell className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                      {formatThaiDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={actionBadgeClass(log.action)}
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 shrink-0 text-slate-400 dark:text-slate-500">
                          {entityIcon(log.entity)}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm text-slate-700 dark:text-slate-200">
                            {log.summary}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            {log.entity}
                            {log.entityId ? ` · ${log.entityId.slice(-8)}` : ''}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {log.actor}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <Repeat className="h-3 w-3" />
          แสดง {(logs ?? []).length} รายการล่าสุด · กรองได้ตามรายการ / การกระทำ / คำค้น
        </div>
      </CardContent>
    </Card>
  )
}

// (no extra exports)