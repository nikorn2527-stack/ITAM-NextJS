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
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Database, Building2, Plus, RefreshCw, Pencil, Trash2, Bell, Send, Palette, BookUser, ListChecks, MessageSquare, Users, Shield, KeyRound, AlertTriangle } from 'lucide-react'
import { type MasterItem } from './types'
import { SiteAttributesSection } from './site-attributes-section'
import { ContactDirectorySection } from './contact-directory-section'
import { WoOptionsSection } from './wo-options-section'
import { NotificationTemplatesSection } from './notification-templates-section'
import { PendingUsersSection } from './pending-users-section'
import { UserManagementSection } from './user-management-section'
import { OauthSection } from './oauth-section'
import { useAuthStore } from '@/store/auth-store'

/** Build fetch headers with the user's JWT (if logged in). */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra }
  const t = useAuthStore.getState()?.token
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

// ── Settings tab groups (Issue 5: organize 12 tabs into 4 groups) ──
// Each tab is now nested under a category header in the sidebar-style nav.
// Order: ข้อมูล → ระบบ → การแจ้งเตือน → ปรับแต่ง
type SettingsTab =
  | 'master'
  | 'site-attributes'
  | 'sites'
  | 'notifications'
  | 'notification-templates'
  | 'customize'
  | 'contacts'
  | 'wo-options'
  | 'pending'
  | 'users'
  | 'permissions'
  | 'oauth'

interface SettingsTabGroup {
  title: string
  items: { value: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[]
}

const SETTINGS_TAB_GROUPS: SettingsTabGroup[] = [
  {
    title: 'ข้อมูล',
    items: [
      { value: 'master', label: 'ข้อมูลมาตรฐาน', icon: Database },
      { value: 'site-attributes', label: 'จัดการสาขา', icon: Building2 },
      { value: 'contacts', label: 'สมุดผู้ติดต่อ', icon: BookUser },
      { value: 'wo-options', label: 'ตัวเลือกใบงาน', icon: ListChecks },
      { value: 'sites', label: 'สาขา (ภาพรวม)', icon: Building2 },
    ],
  },
  {
    title: 'ระบบ',
    items: [
      { value: 'users', label: 'จัดการผู้ใช้', icon: Users },
      { value: 'permissions', label: 'สิทธิ์ผู้ใช้', icon: Shield },
      { value: 'pending', label: 'รออนุมัติ', icon: Users },
    ],
  },
  {
    title: 'การแจ้งเตือน',
    items: [
      { value: 'notifications', label: 'การแจ้งเตือน', icon: Bell },
      { value: 'notification-templates', label: 'เทมเพลตข้อความ', icon: MessageSquare },
    ],
  },
  {
    title: 'ปรับแต่ง',
    items: [
      { value: 'customize', label: 'ปรับแต่งแอป', icon: Palette },
      { value: 'oauth', label: 'OAuth/External Login', icon: KeyRound },
    ],
  },
]

interface Site { id: string; siteCode: string; siteName: string | null; lineOa: string | null; hotline: string | null; paperRateBw: number | null; paperRateColor: number | null; deviceCount?: number; activeCount?: number }

interface NotifySettings {
  channels: { email: boolean; telegram: boolean; lineNotify: boolean; lineOA: boolean }
  events: { deviceAdded: boolean; deviceUpdated: boolean; transfer: boolean; lifecycle: boolean; meter: boolean }
  credentials: Record<string, string>
}

export function ItamSettings() {
  const qc = useQueryClient()
  const [tab, setTab] = React.useState<SettingsTab>('master')
  const [category, setCategory] = React.useState('all')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<MasterItem | null>(null)
  const [form, setForm] = React.useState({ category: '', code: '', label: '', displayLabel: '' })

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

  // Notification settings — fetched whenever the user is on the notifications tab.
  // The query is enabled regardless of auth state so the form is always visible;
  // on error (e.g. 401/403) we fall back to defaults (Issue 4: tab empty fix).
  const {
    data: notifyData,
    isLoading: notifyLoading,
    error: notifyError,
  } = useQuery<NotifySettings>({
    queryKey: ['itam-notify-settings'],
    queryFn: async () => {
      const res = await fetch('/api/itam/notifications/settings', {
        headers: authHeaders(),
      })
      if (!res.ok) {
        // Throw a structured error so we can show a useful message in the UI.
        throw new Error(`โหลดการตั้งค่าไม่สำเร็จ (HTTP ${res.status})`)
      }
      return res.json()
    },
    enabled: tab === 'notifications',
    // Fall back to safe defaults if the API errors out — keeps the form visible.
    retry: false,
  })
  const [notifyDraft, setNotifyDraft] = React.useState<NotifySettings | null>(null)
  React.useEffect(() => {
    if (notifyData) {
      setNotifyDraft(JSON.parse(JSON.stringify(notifyData)) as NotifySettings)
    } else if (notifyError) {
      // Fall back to safe defaults so the form stays visible even when the
      // API errors out (e.g. 401/403 — admin without SYSTEM_CONFIG permission).
      setNotifyDraft({
        channels: { email: false, telegram: false, lineNotify: false, lineOA: false },
        events: {
          deviceAdded: false,
          deviceUpdated: false,
          transfer: false,
          lifecycle: false,
          meter: false,
        },
        credentials: {
          notifyEmails: '',
          telegramBotToken: '',
          telegramChatId: '',
          lineNotifyToken: '',
          lineOaChannelAccessToken: '',
          lineOaToUserId: '',
        },
      })
    }
  }, [notifyData, notifyError])

  async function saveNotify() {
    if (!notifyDraft) return
    try {
      const res = await fetch('/api/itam/notifications/settings', {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          channels: notifyDraft.channels,
          events: notifyDraft.events,
          notifyEmails: notifyDraft.credentials.notifyEmails,
          telegramBotToken: notifyDraft.credentials.telegramBotToken,
          telegramChatId: notifyDraft.credentials.telegramChatId,
          lineNotifyToken: notifyDraft.credentials.lineNotifyToken,
          lineOaChannelAccessToken: notifyDraft.credentials.lineOaChannelAccessToken,
          lineOaToUserId: notifyDraft.credentials.lineOaToUserId,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed')
      }
      toast.success('บันทึกการตั้งค่าการแจ้งเตือนแล้ว')
      await qc.invalidateQueries({ queryKey: ['itam-notify-settings'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  async function sendTestNotify() {
    try {
      const res = await fetch('/api/itam/notifications/test', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message: '🔔 ทดสอบการแจ้งเตือนจาก ITAM' }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed')
      const ch = (j.channels ?? []).join(', ') || '—'
      toast.success(`ส่งการแจ้งเตือนทดสอบแล้ว (${ch}) — ตรวจสอบช่องทางที่เปิดใช้`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ส่งไม่สำเร็จ')
    }
  }

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
    setForm({ category: 'Brand', code: '', label: '', displayLabel: '' })
    setDialogOpen(true)
  }

  function openEdit(item: MasterItem) {
    setEditItem(item)
    setForm({ category: item.category, code: item.code, label: item.label, displayLabel: item.displayLabel || '' })
    setDialogOpen(true)
  }

  async function saveItem() {
    if (!form.category || !form.label) { toast.error('กรุณากรอกหมวดหมู่และค่า'); return }
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
    if (!confirm(`ลบ "${item.label}"?`)) return
    try {
      await fetch(`/api/itam/master-items/${item.id}`, { method: 'DELETE' })
      toast.success('ลบแล้ว')
      await qc.invalidateQueries({ queryKey: ['itam-master'] })
    } catch { toast.error('ลบไม่สำเร็จ') }
  }

  const items = masterData?.items ?? []
  const sites = sitesData?.sites ?? []

  return (
    <div className="flex h-full flex-col p-3 md:p-4">
      <div className="mb-3 flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">ตั้งค่าระบบ</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            ข้อมูลมาตรฐาน · สาขา · ผู้ใช้ · การแจ้งเตือน · ปรับแต่งแอป — แบ่งตามกลุ่มเพื่อให้หาง่าย
          </p>
        </div>
        {tab !== 'master' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTab('master')}
            className="self-start dark:bg-slate-800 dark:border-slate-700"
          >
            ← กลับหน้าหลัก
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {/* Grouped tab navigation (Issue 5: organize 12 tabs into 4 groups) */}
        <nav
          aria-label="Settings sections"
          className="flex flex-shrink-0 flex-col gap-3 rounded-md border border-slate-300 bg-white p-2 shadow-sm lg:w-56 dark:border-slate-800 dark:bg-slate-900"
        >
          {SETTINGS_TAB_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.title}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = tab === item.value
                  const Icon = item.icon
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setTab(item.value)}
                      aria-current={active ? 'page' : undefined}
                      className={[
                        'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors',
                        active
                          ? 'bg-[#f97316]/10 text-[#f97316] dark:bg-[#f97316]/20 dark:text-[#fb923c]'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
                      ].join(' ')}
                    >
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Tab content — scrolls internally (Issue 3: heights fill space) */}
        <div className="itam-scroll min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-3 shadow-sm md:p-4 dark:border-slate-800 dark:bg-slate-900">
          {tab === 'pending' && <PendingUsersSection />}

          {tab === 'users' && <UserManagementSection />}

          {tab === 'permissions' && <UserManagementSection />}

      {tab === 'master' && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-48 dark:bg-slate-800 dark:border-slate-700"><SelectValue /></SelectTrigger>
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
            <div className="flex gap-2 sm:ml-auto">
              <Button variant="outline" size="sm" onClick={openAdd} className="flex-1 sm:flex-none"><Plus className="h-4 w-4" /> เพิ่ม</Button>
              <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ['itam-master'] })}><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </div>

          <Card className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="p-0">
              <div className="itam-scroll max-h-[55vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-100/95 dark:bg-slate-900/95">
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
                      // Skeleton rows matching column widths
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={`sk-${i}`}>
                          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-8 rounded-full mx-auto" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-20 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : items.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="py-8 text-center text-slate-400 text-sm">ไม่มีข้อมูล</TableCell></TableRow>
                    ) : (
                      items.map((item) => (
                        <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <TableCell><Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item.category}</Badge></TableCell>
                          <TableCell className="text-sm font-medium">{item.label}</TableCell>
                          <TableCell className="text-xs text-slate-400">{item.displayLabel || '—'}</TableCell>
                          <TableCell className="text-xs">{item.code || '—'}</TableCell>
                          <TableCell className="text-center">{(item as { active?: boolean }).active ? <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">✓</Badge> : <Badge className="bg-slate-50 text-slate-400">—</Badge>}</TableCell>
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

      {tab === 'site-attributes' && <SiteAttributesSection />}

      {tab === 'wo-options' && <WoOptionsSection />}

      {tab === 'contacts' && <ContactDirectorySection />}

      {tab === 'sites' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sitesLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
                <CardHeader><Skeleton className="h-5 w-20" /></CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))
          ) : sites.length === 0 ? (
            <div className="col-span-full py-12 text-center text-sm text-slate-400">ยังไม่มีข้อมูลสาขา</div>
          ) : (
            sites.map((s) => (
              <Card key={s.id} className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
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
            ))
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader><DialogTitle>{editItem ? 'แก้ไข' : 'เพิ่ม'} ข้อมูลมาตรฐาน</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">หมวดหมู่ *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
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
            <div className="space-y-1.5"><Label className="text-xs">ค่า *</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Display Label</Label><Input value={form.displayLabel} onChange={(e) => setForm({ ...form, displayLabel: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" /></div>
            <div className="space-y-1.5"><Label className="text-xs">รหัส</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveItem} className="bg-[#f97316] text-white hover:bg-[#ea580c]">บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notifications tab — Issue 4: render form even on API error (with defaults) */}
      {tab === 'notifications' && (
        <div className="space-y-4">
          {notifyError && (
            <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <div className="font-medium text-amber-800 dark:text-amber-200">
                  ไม่สามารถโหลดการตั้งค่าการแจ้งเตือนจาก server ได้
                </div>
                <div className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-300/80">
                  {notifyError instanceof Error ? notifyError.message : 'Unknown error'} —
                  แสดงค่าเริ่มต้นเพื่อให้กรอกได้ทันที กดปุ่ม &quot;บันทึก&quot; เพื่อบันทึกค่าใหม่
                </div>
              </div>
            </div>
          )}
          {notifyLoading || !notifyDraft ? (
            <Card className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
              <CardContent className="p-6">
                <Skeleton className="h-64 w-full rounded" />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bell className="h-4 w-4 text-[#f97316]" /> ช่องทางการแจ้งเตือน (Channels)
                  </CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    เลือกช่องทางที่ต้องการส่ง — Email (log), Telegram (Bot API), LINE Notify, LINE OA
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-md border border-slate-200 p-3 dark:border-slate-700">
                    <div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">📧 Email</div>
                      <div className="text-xs text-slate-400">บันทึกใน server log (sandbox ไม่ส่งจริง)</div>
                    </div>
                    <Switch checked={notifyDraft.channels.email} onCheckedChange={(v) => setNotifyDraft({ ...notifyDraft, channels: { ...notifyDraft.channels, email: v } })} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-slate-200 p-3 dark:border-slate-700">
                    <div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">✈️ Telegram</div>
                      <div className="text-xs text-slate-400">ส่งผ่าน Telegram Bot API</div>
                    </div>
                    <Switch checked={notifyDraft.channels.telegram} onCheckedChange={(v) => setNotifyDraft({ ...notifyDraft, channels: { ...notifyDraft.channels, telegram: v } })} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-slate-200 p-3 dark:border-slate-700">
                    <div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">💬 LINE Notify</div>
                      <div className="text-xs text-slate-400">ส่งผ่าน LINE Notify API</div>
                    </div>
                    <Switch checked={notifyDraft.channels.lineNotify} onCheckedChange={(v) => setNotifyDraft({ ...notifyDraft, channels: { ...notifyDraft.channels, lineNotify: v } })} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-slate-200 p-3 dark:border-slate-700">
                    <div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">🎯 LINE OA</div>
                      <div className="text-xs text-slate-400">ส่งผ่าน LINE Messaging API</div>
                    </div>
                    <Switch checked={notifyDraft.channels.lineOA} onCheckedChange={(v) => setNotifyDraft({ ...notifyDraft, channels: { ...notifyDraft.channels, lineOA: v } })} />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
                <CardHeader>
                  <CardTitle className="text-base">เหตุการณ์ที่แจ้งเตือน (Events)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { key: 'deviceAdded' as const, label: '➕ เพิ่มอุปกรณ์ใหม่' },
                    { key: 'deviceUpdated' as const, label: '✏️ แก้ไขอุปกรณ์' },
                    { key: 'transfer' as const, label: '🔄 ย้ายตำแหน่งอุปกรณ์' },
                    { key: 'lifecycle' as const, label: '🔁 เปลี่ยนสถานะ' },
                    { key: 'meter' as const, label: '📈 จดมิเตอร์' },
                  ].map((ev) => (
                    <div key={ev.key} className="flex items-center justify-between rounded-md border border-slate-200 p-3 dark:border-slate-700">
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{ev.label}</div>
                      <Switch checked={notifyDraft.events[ev.key]} onCheckedChange={(v) => setNotifyDraft({ ...notifyDraft, events: { ...notifyDraft.events, [ev.key]: v } })} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
                <CardHeader>
                  <CardTitle className="text-base">ข้อมูลประจำตัว (Credentials)</CardTitle>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Token จะถูก mask หลังบันทึก — พิมพ์ค่าใหม่เพื่อเขียนทับ
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">อีเมลผู้รับ (คั่นด้วยจุลภาค)</Label>
                    <Input
                      value={notifyDraft.credentials.notifyEmails || ''}
                      onChange={(e) => setNotifyDraft({ ...notifyDraft, credentials: { ...notifyDraft.credentials, notifyEmails: e.target.value } })}
                      placeholder="admin@example.com, ops@example.com"
                      className="dark:bg-slate-800 dark:border-slate-700"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Telegram Bot Token</Label>
                      <Input
                        value={notifyDraft.credentials.telegramBotToken || ''}
                        onChange={(e) => setNotifyDraft({ ...notifyDraft, credentials: { ...notifyDraft.credentials, telegramBotToken: e.target.value } })}
                        placeholder="123456:ABC-DEF..."
                        className="dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Telegram Chat ID</Label>
                      <Input
                        value={notifyDraft.credentials.telegramChatId || ''}
                        onChange={(e) => setNotifyDraft({ ...notifyDraft, credentials: { ...notifyDraft.credentials, telegramChatId: e.target.value } })}
                        placeholder="-1001234567890"
                        className="dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">LINE Notify Token</Label>
                      <Input
                        value={notifyDraft.credentials.lineNotifyToken || ''}
                        onChange={(e) => setNotifyDraft({ ...notifyDraft, credentials: { ...notifyDraft.credentials, lineNotifyToken: e.target.value } })}
                        placeholder="abcXYZ..."
                        className="dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">LINE OA Channel Access Token</Label>
                      <Input
                        value={notifyDraft.credentials.lineOaChannelAccessToken || ''}
                        onChange={(e) => setNotifyDraft({ ...notifyDraft, credentials: { ...notifyDraft.credentials, lineOaChannelAccessToken: e.target.value } })}
                        placeholder="abcXYZ..."
                        className="dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs">LINE OA Target User ID</Label>
                      <Input
                        value={notifyDraft.credentials.lineOaToUserId || ''}
                        onChange={(e) => setNotifyDraft({ ...notifyDraft, credentials: { ...notifyDraft.credentials, lineOaToUserId: e.target.value } })}
                        placeholder="U1234567890abcdef..."
                        className="dark:bg-slate-800 dark:border-slate-700 font-mono text-xs"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-2">
                <Button onClick={saveNotify} className="bg-[#f97316] text-white hover:bg-[#ea580c]">
                  บันทึกการตั้งค่า
                </Button>
                <Button variant="outline" onClick={sendTestNotify} className="dark:bg-slate-800 dark:border-slate-700">
                  <Send className="h-4 w-4" /> ส่งทดสอบ
                </Button>
                <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ['itam-notify-settings'] })} className="dark:bg-slate-800 dark:border-slate-700">
                  <RefreshCw className="h-4 w-4" /> รีเฟรช
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ปรับแต่งแอป tab — appName, logo, tagline, search fields ── */}
      {tab === 'notification-templates' && <NotificationTemplatesSection />}

      {tab === 'oauth' && <OauthSection />}

      {tab === 'customize' && <AppCustomizeTab />}
        </div>
      </div>
    </div>
  )
}

// ── AppCustomizeTab — ปรับแต่งชื่อแอป, โลโก้, tagline, สี, ฟิลด์ค้นหา ────────
// Uses /api/settings/org-profile (PUT) — the same source the sidebar reads via
// the ['org-profile'] query. Invalidating that query makes the sidebar update
// immediately after save.
function AppCustomizeTab() {
  const qc = useQueryClient()

  // Fetch the org profile (singleton) — supplies appName, appTagline, logoUrl,
  // primaryColor, accentColor, industryType, language, timezone, currency.
  const { data: profile, isLoading } = useQuery<{
    appName: string
    appTagline: string
    industryType: string
    logoUrl: string | null
    primaryColor: string
    accentColor: string
    language: string
    timezone: string
    currency: string
    allowExcelImport: boolean
  } | null>({
    queryKey: ['org-profile'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/settings/org-profile')
        if (!res.ok) return null
        const j = await res.json()
        return j.profile ?? null
      } catch {
        return null
      }
    },
    staleTime: 60_000,
  })

  // searchFields lives in the separate itam settings table — load in parallel.
  const { data: searchFields } = useQuery<string>({
    queryKey: ['app-customization'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/settings')
        if (!res.ok) return 'assetNo,serial,brand,model'
        const j = await res.json()
        // /api/settings returns { settings: { key: value, ... } }
        const map: Record<string, string> = j.settings ?? {}
        return map.searchFields ?? 'assetNo,serial,brand,model'
      } catch {
        return 'assetNo,serial,brand,model'
      }
    },
  })

  const [form, setForm] = React.useState({
    appName: 'ระบบจัดการสินทรัพย์',
    logoUrl: '',
    appTagline: 'Asset Management System',
    primaryColor: '#f97316',
    accentColor: '#0d9488',
    industryType: 'general',
    searchFields: 'assetNo,serial,brand,model',
  })
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (profile) {
      setForm((prev) => ({
        ...prev,
        appName: profile.appName || 'ระบบจัดการสินทรัพย์',
        logoUrl: profile.logoUrl || '',
        appTagline: profile.appTagline || 'Asset Management System',
        primaryColor: profile.primaryColor || '#f97316',
        accentColor: profile.accentColor || '#0d9488',
        industryType: profile.industryType || 'general',
      }))
    }
  }, [profile])

  React.useEffect(() => {
    if (searchFields) {
      setForm((prev) => ({ ...prev, searchFields }))
    }
  }, [searchFields])

  async function save() {
    setSaving(true)
    try {
      // 1) Save org-profile fields via PUT /api/settings/org-profile
      const res = await fetch('/api/settings/org-profile', {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          appName: form.appName,
          appTagline: form.appTagline,
          logoUrl: form.logoUrl,
          primaryColor: form.primaryColor,
          accentColor: form.accentColor,
          industryType: form.industryType,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to save org profile')
      }

      // 2) Save searchFields via PUT /api/settings (object map upsert)
      try {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ searchFields: form.searchFields }),
        })
      } catch {
        // Non-fatal — searchFields is a secondary setting
      }

      toast.success('บันทึกการตั้งค่าแอปแล้ว — sidebar จะอัปเดตทันที')
      // Invalidate both so the sidebar (reads org-profile) + this tab re-fetch
      await qc.invalidateQueries({ queryKey: ['org-profile'] })
      await qc.invalidateQueries({ queryKey: ['app-customization'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />

  // Live preview: show what the sidebar header will look like
  const previewLogo = form.logoUrl
  const previewIsImg = previewLogo && previewLogo.startsWith('http')

  return (
    <div className="space-y-4">
      {/* Live preview card */}
      <Card className="border-[#f97316]/30 bg-gradient-to-br from-orange-50/50 to-white dark:border-[#fb923c]/20 dark:from-orange-950/20 dark:to-slate-900">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Palette className="h-4 w-4 text-[#f97316]" /> ตัวอย่างหน้าตา (Live Preview)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            {previewIsImg ? (
              <img
                src={previewLogo}
                alt={form.appName}
                className="h-9 w-9 flex-shrink-0 rounded object-contain"
              />
            ) : (
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-slate-100 text-xl dark:bg-slate-800">
                {previewLogo || '📦'}
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-900 dark:text-white">
                {form.appName || 'ระบบจัดการสินทรัพย์'}
              </div>
              <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {form.appTagline || 'Asset Management System'}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span
                className="h-4 w-4 rounded-full ring-2 ring-slate-200 dark:ring-white/10"
                style={{ background: form.primaryColor }}
                aria-hidden
              />
              <span
                className="h-4 w-4 rounded-full ring-2 ring-slate-200 dark:ring-white/10"
                style={{ background: form.accentColor }}
                aria-hidden
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4 text-[#f97316]" /> ปรับแต่งหน้าตาแอป
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">ชื่อแอป (แสดงใน sidebar)</Label>
              <Input
                value={form.appName}
                onChange={(e) => setForm({ ...form, appName: e.target.value })}
                placeholder="ระบบจัดการสินทรัพย์"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">แท็กไลน์ (ใต้ชื่อแอป)</Label>
              <Input
                value={form.appTagline}
                onChange={(e) => setForm({ ...form, appTagline: e.target.value })}
                placeholder="Asset Management System"
                className="dark:bg-slate-800 dark:border-slate-700"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">โลโก้ (emoji หรือ URL รูปภาพ)</Label>
            <Input
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="📦 หรือ https://example.com/logo.png"
              className="dark:bg-slate-800 dark:border-slate-700"
            />
            <p className="text-[11px] text-slate-500">
              💡 ใช้ emoji (เช่น 📦 🖨️ 💻) หรือวาง URL รูปภาพ (PNG/SVG, แนะนำขนาด 32×32px)
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">สีหลัก (Primary)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800"
                  aria-label="เลือกสีหลัก"
                />
                <Input
                  value={form.primaryColor}
                  onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                  className="font-mono text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">สีเสริม (Accent)</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                  className="h-9 w-12 cursor-pointer rounded border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800"
                  aria-label="เลือกสีเสริม"
                />
                <Input
                  value={form.accentColor}
                  onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                  className="font-mono text-xs dark:bg-slate-800 dark:border-slate-700"
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ประเภทอุตสาหกรรม</Label>
            <Select
              value={form.industryType}
              onValueChange={(v) => setForm({ ...form, industryType: v })}
            >
              <SelectTrigger className="dark:bg-slate-800 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">ทั่วไป</SelectItem>
                <SelectItem value="hospital">โรงพยาบาล</SelectItem>
                <SelectItem value="factory">โรงงาน</SelectItem>
                <SelectItem value="office">สำนักงาน</SelectItem>
                <SelectItem value="school">สถาบันการศึกษา</SelectItem>
                <SelectItem value="government">หน่วยงานรัฐ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ฟิลด์ที่ใช้ค้นหา (คั่นด้วยจุลภาค)</Label>
            <Input
              value={form.searchFields}
              onChange={(e) => setForm({ ...form, searchFields: e.target.value })}
              placeholder="assetNo,serial,brand,model"
              className="font-mono text-xs dark:bg-slate-800 dark:border-slate-700"
            />
            <p className="text-[11px] text-slate-500">
              💡 ฟิลด์ที่รองรับ: assetNo, serial, brand, model, deviceType, department, location, site —
              ลำดับแรกจะถูกค้นหาก่อน (ตัวอย่าง: &quot;serial,assetNo,brand&quot; จะค้น Serial ก่อน)
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving} className="bg-[#f97316] text-white hover:bg-[#ea580c]">
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Palette className="h-4 w-4" />}
              บันทึก
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ['org-profile'] })
                qc.invalidateQueries({ queryKey: ['app-customization'] })
              }}
              className="dark:bg-slate-800 dark:border-slate-700"
            >
              <RefreshCw className="h-4 w-4" /> รีเฟรช
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
