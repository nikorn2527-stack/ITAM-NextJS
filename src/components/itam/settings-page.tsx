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
} from 'lucide-react'
import {
  type MasterItem,
  type Site,
  type AuditLog,
  MASTER_CATEGORIES,
} from './types'
import { MasterDataModal } from './master-data-modal'

const DEMO_USERS = [
  { email: 'admin@example.com', role: 'admin', roleLabel: 'ผู้ดูแลระบบ' },
  { email: 'manager@example.com', role: 'manager', roleLabel: 'ผู้จัดการ' },
  { email: 'staff@example.com', role: 'staff', roleLabel: 'เจ้าหน้าที่' },
  { email: 'viewer@example.com', role: 'viewer', roleLabel: 'ผู้ดู' },
]

export function SettingsPage() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">ตั้งค่าแอป</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          ตั้งค่าทั่วไป · ข้อมูลมาตรฐาน · สาขา · สิทธิ์ผู้ใช้
        </p>
      </div>

      <Tabs defaultValue="app" className="w-full">
        <TabsList className="h-auto flex-wrap dark:bg-slate-900 dark:border dark:border-slate-800">
          <TabsTrigger value="app" className="gap-1.5">
            <SettingsIcon className="h-4 w-4" />
            ตั้งค่าทั่วไป
          </TabsTrigger>
          <TabsTrigger value="master" className="gap-1.5">
            <Database className="h-4 w-4" />
            ข้อมูลมาตรฐาน
          </TabsTrigger>
          <TabsTrigger value="sites" className="gap-1.5">
            <Building2 className="h-4 w-4" />
            สาขา
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-4 w-4" />
            สิทธิ์ผู้ใช้
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5" data-permission="ADMIN">
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

  const [form, setForm] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (settings) setForm({ ...settings })
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
      <Card className="dark:border-slate-800 dark:bg-slate-900">
        <CardContent className="p-6">
          <Skeleton className="h-64 w-full dark:bg-slate-800" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
          <SettingsIcon className="h-4 w-4 text-[#f97316]" />
          ตั้งค่าทั่วไป
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">
              ชื่อองค์กร
            </Label>
            <Input
              value={form.orgName ?? ''}
              onChange={(e) => setForm({ ...form, orgName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">
              สาขาเริ่มต้น
            </Label>
            <Input
              value={form.defaultSite ?? ''}
              onChange={(e) =>
                setForm({ ...form, defaultSite: e.target.value })
              }
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
          <div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
              เปิดใช้งานการล็อกอินด้วยรหัสผ่าน
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              อนุญาตให้ผู้ใช้ล็อกอินด้วยรหัสผ่าน (นอกเหนือจาก SSO)
            </div>
          </div>
          <Switch
            checked={form.enablePasswordLogin === 'true'}
            onCheckedChange={(c) =>
              setForm({ ...form, enablePasswordLogin: c ? 'true' : 'false' })
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">
              แม่แบบสติกเกอร์
            </Label>
            <Input
              value={form.stickerTemplate ?? ''}
              onChange={(e) =>
                setForm({ ...form, stickerTemplate: e.target.value })
              }
              placeholder="template-1"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">
              แม่แบบเอกสาร
            </Label>
            <Input
              value={form.docTemplate ?? ''}
              onChange={(e) =>
                setForm({ ...form, docTemplate: e.target.value })
              }
              placeholder="doc-1"
            />
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
    <Card className="dark:border-slate-800 dark:bg-slate-900">
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
            <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
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
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-sm text-slate-400 dark:text-slate-500"
                  >
                    ไม่พบรายการ
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
        <AlertDialogContent className="dark:border-slate-800 dark:bg-slate-900">
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
    <Card className="dark:border-slate-800 dark:bg-slate-900">
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
                  <TableCell
                    colSpan={3}
                    className="py-8 text-center text-sm text-slate-400 dark:text-slate-500"
                  >
                    ยังไม่มีสาขา
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

/* ---------- Users tab (read-only) ---------- */
function UsersTab() {
  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-slate-800 dark:text-slate-100">
          <Users className="h-4 w-4 text-[#f97316]" />
          สิทธิ์ผู้ใช้ (แสดงผลเท่านั้น)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader className="bg-slate-50 dark:bg-slate-900">
              <TableRow>
                <TableHead className="text-slate-600 dark:text-slate-300">อีเมล</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300">บทบาท</TableHead>
                <TableHead className="text-slate-600 dark:text-slate-300">ป้ายกำกับ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEMO_USERS.map((u) => (
                <TableRow key={u.email} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TableCell className="font-medium text-slate-700 dark:text-slate-200">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        u.role === 'admin'
                          ? 'border-[#f97316]/30 bg-[#f97316]/10 text-[#f97316]'
                          : 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }
                    >
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-300">{u.roleLabel}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          หมายเหตุ: ระบบจัดการสิทธิ์ผู้ใช้เต็มรูปแบบอยู่ในเวอร์ชัน Apps Script — หน้านี้แสดงผลข้อมูลตัวอย่างเท่านั้น
        </p>
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
] as const

const AUDIT_ACTION_OPTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'METER_READING',
  'SYNC',
  'SEED',
  'IMPORT',
  'CYCLE_START',
  'CYCLE_END',
] as const

function actionBadgeClass(action: string): string {
  switch (action) {
    case 'CREATE':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
    case 'UPDATE':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
    case 'DELETE':
      return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300'
    case 'METER_READING':
      return 'border-[#f97316]/30 bg-[#f97316]/10 text-[#f97316]'
    case 'SYNC':
      return 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300'
    case 'SEED':
      return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
    case 'CYCLE_START':
      return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300'
    case 'CYCLE_END':
      return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300'
    case 'IMPORT':
      return 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300'
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
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

  return (
    <Card className="dark:border-slate-800 dark:bg-slate-900">
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
        </div>

        {/* Table */}
        <div className="itam-scroll max-h-[60vh] overflow-auto rounded-md border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
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
                  <TableCell colSpan={4}>
                    <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400 dark:text-slate-500">
                      <Inbox className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <span className="text-sm">ยังไม่มีประวัติการใช้งาน</span>
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