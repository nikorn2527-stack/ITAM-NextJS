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
} from 'lucide-react'
import {
  type MasterItem,
  type Site,
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
        <h1 className="text-2xl font-bold text-slate-800">ตั้งค่าแอป</h1>
        <p className="text-sm text-slate-500">
          ตั้งค่าทั่วไป · ข้อมูลมาตรฐาน · สาขา · สิทธิ์ผู้ใช้
        </p>
      </div>

      <Tabs defaultValue="app" className="w-full">
        <TabsList className="h-auto flex-wrap">
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
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
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

        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-slate-700">
              เปิดใช้งานการล็อกอินด้วยรหัสผ่าน
            </div>
            <div className="text-xs text-slate-500">
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
            className="bg-[#f97316] text-white hover:bg-[#ea580c]"
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
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
              className="bg-[#f97316] text-white hover:bg-[#ea580c]"
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
        <div className="itam-scroll max-h-[55vh] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-slate-50">
              <TableRow>
                <TableHead>หมวดหมู่</TableHead>
                <TableHead>รหัส</TableHead>
                <TableHead>ชื่อ</TableHead>
                <TableHead>ParentRef</TableHead>
                <TableHead>DisplayLabel</TableHead>
                <TableHead>SiteCode</TableHead>
                <TableHead className="text-right">การจัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (items ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-sm text-slate-400"
                  >
                    ไม่พบรายการ
                  </TableCell>
                </TableRow>
              ) : (
                (items ?? []).map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <Badge className="border-slate-200 bg-slate-100 text-slate-700">
                        {it.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-medium text-slate-700">
                      {it.code}
                    </TableCell>
                    <TableCell>{it.label}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {it.parentRef ?? '-'}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {it.displayLabel ?? '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
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
        <div className="text-xs text-slate-400">
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบรายการ</AlertDialogTitle>
            <AlertDialogDescription>
              ลบ{' '}
              <span className="font-semibold text-slate-700">
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
              className="bg-rose-600 text-white hover:bg-rose-700"
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
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
            className="bg-[#f97316] text-white hover:bg-[#ea580c]"
          >
            <Plus className="h-4 w-4" />
            เพิ่ม
          </Button>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>รหัส</TableHead>
                <TableHead>ชื่อ</TableHead>
                <TableHead>วันที่สร้าง</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ) : (sites ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-8 text-center text-sm text-slate-400"
                  >
                    ยังไม่มีสาขา
                  </TableCell>
                </TableRow>
              ) : (
                (sites ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs font-medium text-slate-700">
                      {s.code}
                    </TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell className="text-xs text-slate-400">
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-[#f97316]" />
          สิทธิ์ผู้ใช้ (แสดงผลเท่านั้น)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>อีเมล</TableHead>
                <TableHead>บทบาท</TableHead>
                <TableHead>ป้ายกำกับ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {DEMO_USERS.map((u) => (
                <TableRow key={u.email}>
                  <TableCell className="font-medium text-slate-700">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        u.role === 'admin'
                          ? 'border-[#f97316]/30 bg-[#f97316]/10 text-[#f97316]'
                          : 'border-slate-200 bg-slate-100 text-slate-700'
                      }
                    >
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600">{u.roleLabel}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          หมายเหตุ: ระบบจัดการสิทธิ์ผู้ใช้เต็มรูปแบบอยู่ในเวอร์ชัน Apps Script — หน้านี้แสดงผลข้อมูลตัวอย่างเท่านั้น
        </p>
      </CardContent>
    </Card>
  )
}

// (no extra exports)
