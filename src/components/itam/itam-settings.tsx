'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWebAuthn } from '@/hooks/use-webauthn'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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
import { Database, Building2, Plus, RefreshCw, Pencil, Trash2, Bell, Send, Palette, BookUser, ListChecks, MessageSquare, Users, Shield, KeyRound, AlertTriangle, Hash, FlaskConical, FileText, Smartphone, Fingerprint, Loader2, Package, ClipboardList, Activity, User, Camera, Save } from 'lucide-react'
import { type MasterItem, MASTER_CATEGORIES } from './types'
import { SiteAttributesSection } from './site-attributes-section'
import { ContactDirectorySection } from './contact-directory-section'
import { WoOptionsSection } from './wo-options-section'
import { AssetPatternTab, WoPatternTab } from './settings-page-v2'
import { NotificationTemplatesSection } from './notification-templates-section'
import { NotificationLogSection } from './notification-log-section'
import { PendingUsersSection } from './pending-users-section'
import { UserManagementSection } from './user-management-section'
import { OauthSection } from './oauth-section'
import { DemoManagementSection } from './demo-management-section'
import { LicenseManagementSection } from './license-management-section'
import { AssetCategorySection } from './asset-category-section'
import { StockCountSection } from './stock-count-section'
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
  | 'notification-logs'
  | 'customize'
  | 'contacts'
  | 'wo-options'
  | 'pending'
  | 'users'
  | 'permissions'
  | 'oauth'
  | 'number-patterns'
  | 'wo-patterns'
  | 'demo'
  | 'mobile-nav'
  | 'my-biometrics'
  | 'my-profile'
  | 'licenses'
  | 'stock-count'

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
      { value: 'number-patterns', label: 'รูปแบบเลขทะเบียน', icon: Hash },
      { value: 'wo-patterns', label: 'เลขใบงาน', icon: FileText },
      { value: 'sites', label: 'สาขา (ภาพรวม)', icon: Building2 },
      { value: 'licenses', label: 'ลิขสิทธิ์ซอฟต์แวร์', icon: KeyRound },
      { value: 'asset-categories', label: 'หมวดหมู่สินทรัพย์', icon: Package },
      { value: 'stock-count', label: 'นับสต็อก/ตรวจนับ', icon: ClipboardList },
    ],
  },
  {
    title: 'ระบบ',
    items: [
      { value: 'users', label: 'จัดการผู้ใช้', icon: Users },
      // Bug Group G fix: hide "สิทธิ์ผู้ใช้" tab — was a duplicate of
      // "จัดการผู้ใช้" (rendered <UserManagementSection />) and never
      // had its own permissions/role view. Commented out until a proper
      // RolePermission manager is implemented.
      // { value: 'permissions', label: 'สิทธิ์ผู้ใช้', icon: Shield },
      { value: 'mobile-nav', label: 'เมนูมือถือ', icon: Smartphone },
      { value: 'pending', label: 'รออนุมัติ', icon: Users },
      { value: 'demo', label: '🧪 สาธิตระบบ', icon: FlaskConical },
    ],
  },
  {
    title: 'การแจ้งเตือน',
    items: [
      { value: 'notifications', label: 'การแจ้งเตือน', icon: Bell },
      { value: 'notification-templates', label: 'เทมเพลตข้อความ', icon: MessageSquare },
      { value: 'notification-logs', label: 'สถิติการส่ง', icon: Activity },
    ],
  },
  {
    title: 'ปรับแต่ง',
    items: [
      { value: 'customize', label: 'ปรับแต่งแอป', icon: Palette },
      { value: 'oauth', label: 'OAuth/External Login', icon: KeyRound },
      { value: 'my-profile', label: 'โปรไฟล์ของฉัน', icon: User },
      { value: 'my-biometrics', label: 'Passkey ของฉัน', icon: Fingerprint },
    ],
  },
]

// BUG-SETTINGS-009 fix: API returns `code` + `name`, but the original
// interface expected `siteCode` + `siteName`. Accept both shapes so the
// sites list renders correctly regardless of which endpoint shape wins.
interface Site {
  id: string
  siteCode: string
  siteName: string | null
  lineOa: string | null
  hotline: string | null
  paperRateBw: number | null
  paperRateColor: number | null
  deviceCount?: number
  activeCount?: number
  // API also returns these aliases (from /api/sites route)
  code?: string
  name?: string | null
}

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
  const [deleteTarget, setDeleteTarget] = React.useState<MasterItem | null>(null)

  // Master items
  const { data: masterData, isLoading: masterLoading } = useQuery({
    queryKey: ['itam-master', category],
    queryFn: async () => {
      const params = category !== 'all' ? `?category=${category}` : ''
      const res = await fetch(`/api/itam/master-items${params}`, { headers: authHeaders() })
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
  // Bug Group E fix: switch to /api/itam/sites (returns SiteAttribute
  // + deviceCount + activeCount). The old /api/sites endpoint returns
  // a flat shape without deviceCount/activeCount, which made the
  // "สาขา (ภาพรวม)" tab show 0 เครื่อง for every site.
  // /api/itam/sites also returns the original SiteAttribute fields
  // (SiteCode, SiteName, PaperRateBW, PaperRateColor) plus lowercase
  // aliases (siteCode, siteName, paperRateBw, paperRateColor).
  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ['itam-sites-overview'],
    queryFn: async () => {
      const res = await fetch('/api/itam/sites', { headers: authHeaders() })
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
          method: 'PUT', headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(form),
        })
        if (!res.ok) throw new Error('Failed')
        toast.success('แก้ไขแล้ว')
      } else {
        const res = await fetch('/api/itam/master-items', {
          method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
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
    setDeleteTarget(item)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const item = deleteTarget
    try {
      await fetch(`/api/itam/master-items/${item.id}`, { method: 'DELETE', headers: authHeaders() })
      toast.success('ลบแล้ว')
      await qc.invalidateQueries({ queryKey: ['itam-master'] })
    } catch { toast.error('ลบไม่สำเร็จ') }
    finally { setDeleteTarget(null) }
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

      {tab === 'master' && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-48 dark:bg-slate-800 dark:border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">หมวดทั้งหมด</SelectItem>
                {MASTER_CATEGORIES.map((cat: string) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
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
                            {/* BUG-SETTINGS-008 fix: added title + aria-label */}
                            <Button size="sm" variant="ghost" onClick={() => openEdit(item)} title={`แก้ไข ${item.label}`} aria-label={`แก้ไข ${item.label}`}><Pencil className="h-3 w-3" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => deleteItem(item)} className="text-rose-500 hover:bg-rose-50" title={`ลบ ${item.label}`} aria-label={`ลบ ${item.label}`}><Trash2 className="h-3 w-3" /></Button>
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
            sites.map((s) => {
              // BUG-SETTINGS-009: support both `siteCode`/`siteName` (legacy
              // interface) and `code`/`name` (what /api/sites actually returns).
              const code = s.siteCode || s.code || '—'
              const name = s.siteName || s.name || null
              return (
              <Card key={s.id} className="shadow-sm border-slate-200 dark:border-slate-800 dark:bg-slate-900">
                <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-[#f97316]" /> {code}</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{name ?? code}</div>
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
              )
            })
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md dark:border-slate-800 dark:bg-slate-900">
          <DialogHeader><DialogTitle>{editItem ? 'แก้ไข' : 'เพิ่ม'} ข้อมูลมาตรฐาน</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {/* BUG-SETTINGS-007 fix: added id/name/aria-label + disabled when incomplete */}
            <div className="space-y-1.5">
              <Label htmlFor="master-category" className="text-xs">หมวดหมู่ *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger id="master-category" className="dark:bg-slate-800 dark:border-slate-700" aria-label="หมวดหมู่"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MASTER_CATEGORIES.map((cat: string) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="master-label" className="text-xs">ค่า *</Label>
              <Input id="master-label" name="label" aria-label="ค่า" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="เช่น BROTHER" className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="master-displayLabel" className="text-xs">Display Label</Label>
              <Input id="master-displayLabel" name="displayLabel" aria-label="Display Label" value={form.displayLabel} onChange={(e) => setForm({ ...form, displayLabel: e.target.value })} placeholder="ไม่บังคับ" className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="master-code" className="text-xs">รหัส</Label>
              <Input id="master-code" name="code" aria-label="รหัส" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ไม่บังคับ" className="dark:bg-slate-800 dark:border-slate-700" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            {/* BUG-SETTINGS-007 fix: disable save button when required fields are empty */}
            <Button onClick={saveItem} disabled={!form.category || !form.label} className="bg-[#f97316] text-white hover:bg-[#ea580c] disabled:opacity-50 disabled:cursor-not-allowed">บันทึก</Button>
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

      {tab === 'notification-logs' && <NotificationLogSection />}

      {tab === 'oauth' && <OauthSection />}

      {tab === 'customize' && <AppCustomizeTab />}

      {tab === 'number-patterns' && <AssetPatternTab />}

      {tab === 'wo-patterns' && <WoPatternTab />}

      {tab === 'demo' && <DemoManagementSection />}

      {tab === 'mobile-nav' && <MobileNavConfigSection />}

      {tab === 'my-biometrics' && <MyBiometricsSection />}
      {tab === 'my-profile' && <MyProfileSection />}

      {tab === 'licenses' && <LicenseManagementSection />}
      {tab === 'asset-categories' && <AssetCategorySection />}
      {tab === 'stock-count' && (
        <div className="space-y-4">
          <StockCountSection scope="STOCK_ITEM" />
          <StockCountSection scope="DEVICE" />
        </div>
      )}
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบ "{deleteTarget?.label ?? ''}" ใช่หรือไม่? การกระทำนี้ไม่สามารถยกเลิกได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              onClick={(e) => {
                e.preventDefault() // prevent Radix auto-close before async completes
                void confirmDelete()
              }}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        const res = await fetch('/api/settings/org-profile', { headers: authHeaders() })
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
        const res = await fetch('/api/settings', { headers: authHeaders() })
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
  const logoFileRef = React.useRef<HTMLInputElement>(null)

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
            <Label className="text-xs">โลโก้ (emoji, URL รูปภาพ หรืออัปโหลดไฟล์)</Label>
            <Input
              value={form.logoUrl}
              onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              placeholder="📦 หรือ https://example.com/logo.png"
              className="dark:bg-slate-800 dark:border-slate-700"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => logoFileRef.current?.click()}
                disabled={saving}
              >
                <Camera className="mr-1.5 h-3.5 w-3.5" />
                อัปโหลดรูป
              </Button>
              {form.logoUrl.startsWith('data:image/') && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm({ ...form, logoUrl: '' })}
                  disabled={saving}
                  className="text-red-500 hover:text-red-600"
                >
                  ลบรูป
                </Button>
              )}
              <input
                ref={logoFileRef}
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 2 * 1024 * 1024) {
                    toast.error('รูปใหญ่เกินไป (สูงสุด 2MB)')
                    return
                  }
                  const reader = new FileReader()
                  reader.onload = () => {
                    const img = new Image()
                    img.onload = () => {
                      const canvas = document.createElement('canvas')
                      const maxDim = 128
                      let { width, height } = img
                      if (width > height && width > maxDim) {
                        height = Math.round((height * maxDim) / width)
                        width = maxDim
                      } else if (height > maxDim) {
                        width = Math.round((width * maxDim) / height)
                        height = maxDim
                      }
                      canvas.width = width
                      canvas.height = height
                      const ctx = canvas.getContext('2d')
                      if (!ctx) return
                      ctx.drawImage(img, 0, 0, width, height)
                      const dataUrl = canvas.toDataURL('image/png')
                      setForm({ ...form, logoUrl: dataUrl })
                    }
                    img.src = reader.result as string
                  }
                  reader.readAsDataURL(file)
                }}
                className="hidden"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              💡 ใช้ emoji (เช่น 📦 🖨️ 💻), วาง URL รูปภาพ, หรือกดอัปโหลดไฟล์ (PNG/SVG, แนะนำ 32×32px, สูงสุด 2MB)
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
                <SelectItem value="office">สำนักงาน</SelectItem>
                <SelectItem value="corporate">องค์กร</SelectItem>
                <SelectItem value="education">สถาบันการศึกษา</SelectItem>
                <SelectItem value="government">หน่วยงานรัฐ</SelectItem>
                <SelectItem value="healthcare">สถานพยาบาล</SelectItem>
                <SelectItem value="industrial">อุตสาหกรรม</SelectItem>
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

// ============================================================
// MobileNavConfigSection — admin ตั้งค่าเมนูมือถือ/เดสก์ท็อปตาม role
// ============================================================
function MobileNavConfigSection() {
  const qc = useQueryClient()
  const [config, setConfig] = React.useState<Record<string, Record<string, boolean>>>({})
  const [selectedRole, setSelectedRole] = React.useState('staff')
  const [saving, setSaving] = React.useState(false)

  const ROLES = [
    { value: 'admin', label: 'ผู้ดูแลระบบ' },
    { value: 'manager', label: 'ผู้จัดการ' },
    { value: 'staff', label: 'ช่างเทคนิค' },
    { value: 'coordinator', label: 'ผู้ประสานงาน' },
    { value: 'viewer', label: 'ผู้ดู' },
  ]

  // All nav pages that can be toggled
  const NAV_PAGES = [
    { page: 'dashboard', label: '📊 Dashboard' },
    { page: 'itam-devices', label: '💻 จัดการอุปกรณ์' },
    { page: 'itam-meter-keyboard', label: '📈 จดมิเตอร์' },
    { page: 'itam-work-orders', label: '🔧 แจ้งซ่อม' },
    { page: 'pm-schedules', label: '🗓️ ตาราง PM' },
    { page: 'itam-stock', label: '📦 สต๊อก' },
    { page: 'itam-paper-analytics', label: '📄 วิเคราะห์กระดาษ' },
    { page: 'templates', label: '📄 เทมเพลต' },
    { page: 'import', label: '📥 นำเข้าข้อมูล' },
    { page: 'reports-hub', label: '📊 ศูนย์รายงาน' },
    { page: 'material-cost', label: '💰 ต้นทุนวัสดุ' },
    { page: 'monthly-report', label: '📅 รายงานรายเดือน' },
    { page: 'itam-settings', label: '⚙️ ตั้งค่าระบบ' },
    { page: 'itam-audit', label: '📜 ประวัติการใช้งาน' },
    { page: 'mobile', label: '📱 โหมดมือถือ' },
  ]

  // Load config from AppSetting
  const { data: settingsData } = useQuery({
    queryKey: ['mobile-nav-config-settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings', { headers: authHeaders() })
      if (!res.ok) return { settings: [] }
      return res.json()
    },
  })

  React.useEffect(() => {
    if (settingsData?.settings) {
      const raw = settingsData.settings.find((s: { key: string }) => s.key === 'mobileNavConfig')
      if (raw?.value) {
        try {
          setConfig(JSON.parse(raw.value))
        } catch {
          setConfig({})
        }
      }
    }
  }, [settingsData])

  function togglePage(role: string, page: string, value: boolean) {
    setConfig((prev) => ({
      ...prev,
      [role]: {
        ...(prev[role] ?? {}),
        [page]: value,
      },
    }))
  }

  function setAllForRole(role: string, value: boolean) {
    setConfig((prev) => ({
      ...prev,
      [role]: Object.fromEntries(NAV_PAGES.map((p) => [p.page, value])),
    }))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          mobileNavConfig: JSON.stringify(config),
        }),
      })
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ')
      toast.success('บันทึกการตั้งค่าเมนูมือถือแล้ว')
      qc.invalidateQueries({ queryKey: ['mobile-nav-config'] })
      qc.invalidateQueries({ queryKey: ['mobile-nav-config-settings'] })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const roleConfig = config[selectedRole] ?? {}

  return (
    <Card className="border-slate-200 dark:border-slate-800 dark:bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-5 w-5 text-[#f97316]" />
          ตั้งค่าเมนูมือถือ / เดสก์ท็อป
        </CardTitle>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          กำหนดว่าแต่ละ role จะเห็นเมนูใดบนมือถือ (หน้าจอ &lt; 768px) — บนเดสก์ท็อปจะเห็นทุกเมนูที่ไม่ได้ปิด
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Role selector */}
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs">เลือก Role:</Label>
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setSelectedRole(r.value)}
              className={`rounded-md border px-3 py-1 text-xs transition ${
                selectedRole === r.value
                  ? 'border-[#f97316] bg-[#f97316]/10 text-[#f97316] dark:border-[#fb923c] dark:bg-[#fb923c]/10 dark:text-[#fb923c]'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-[#f97316]/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Quick actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAllForRole(selectedRole, true)}>
            เปิดทั้งหมด
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAllForRole(selectedRole, false)}>
            ปิดทั้งหมด
          </Button>
        </div>

        {/* Page toggles */}
        <div className="rounded-md border border-slate-200 dark:border-slate-800">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead>เมนู</TableHead>
                <TableHead className="w-24 text-center">มือถือ</TableHead>
                <TableHead className="w-24 text-center">เดสก์ท็อป</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {NAV_PAGES.map((p) => {
                const mobileVisible = roleConfig[p.page] ?? true
                return (
                  <TableRow key={p.page} className="text-xs">
                    <TableCell>{p.label}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={mobileVisible}
                        onCheckedChange={(v) => togglePage(selectedRole, p.page, v)}
                      />
                    </TableCell>
                    <TableCell className="text-center text-slate-400">
                      ✓ (เห็นเสมอ)
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800/40 dark:text-slate-400">
          💡 <strong>มือถือ</strong> = ผู้ใช้เห็นเฉพาะเมนูที่เปิดไว้ (เมื่อเข้าผ่านหน้าจอ &lt; 768px)<br />
          💡 <strong>เดสก์ท็อป</strong> = ผู้ใช้เห็นทุกเมนู (ยกเว้นที่ปิดไว้)
        </div>

        <Button
          onClick={save}
          disabled={saving}
          className="bg-[#f97316] text-white hover:bg-[#ea580c]"
        >
          {saving ? 'กำลังบันทึก...' : '💾 บันทึกการตั้งค่า'}
        </Button>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// MyProfileSection — แก้โปรไฟล์ + อัปโหลดรูปโปรไฟล์ของตัวเอง
// ─────────────────────────────────────────────────────────────────────────
function MyProfileSection() {
  const { user: authUser, fetchMe } = useAuthStore()
  const token = useAuthStore((s) => s.token)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [department, setDepartment] = React.useState('')
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null)
  const [email, setEmail] = React.useState('')
  const [username, setUsername] = React.useState('')
  const [role, setRole] = React.useState('')
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const loadProfile = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/itam/auth/me/profile', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) return
      const { user } = await res.json()
      setName(user.name ?? '')
      setPhone(user.phone ?? '')
      setDepartment(user.department ?? '')
      setAvatarUrl(user.avatarUrl ?? null)
      setEmail(user.email ?? '')
      setUsername(user.username ?? '')
      setRole(user.role ?? '')
    } finally {
      setLoading(false)
    }
  }, [token])

  React.useEffect(() => {
    loadProfile()
  }, [loadProfile])

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('รูปใหญ่เกินไป (สูงสุด 5MB)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxDim = 256
        let { width, height } = img
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        setAvatarUrl(dataUrl)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/itam/auth/me/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name, avatarUrl, phone, department }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'บันทึกไม่สำเร็จ')
      }
      toast.success('บันทึกโปรไฟล์แล้ว')
      await fetchMe()
      await loadProfile()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          กำลังโหลด...
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base md:text-lg">
          <User className="h-5 w-5 text-[#f97316]" />
          โปรไฟล์ของฉัน
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          แก้ไขข้อมูลส่วนตัว + รูปโปรไฟล์ — ผู้ใช้ทุกคนแก้ได้เอง
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="avatar"
                className="h-20 w-20 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                <User className="h-8 w-8 text-slate-400" />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={saving}>
              <Camera className="mr-2 h-4 w-4" />
              {avatarUrl ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
            </Button>
            {avatarUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setAvatarUrl(null)} disabled={saving} className="text-red-500 hover:text-red-600">
                ลบรูป
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground">
              รองรับ JPG/PNG · ย่ออัตโนมัติ 256×256 · สูงสุด 5MB
            </p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">ชื่อ-นามสกุล</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="เช่น นิกร ศรีสุข" className="text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">เบอร์โทร</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="เช่น 081-234-5678" className="text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">แผนก</Label>
          <Input value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={100} placeholder="เช่น IT" className="text-sm" />
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/50">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground">อีเมล:</span>
              <br />
              <span className="font-medium">{email}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Username:</span>
              <br />
              <span className="font-medium">{username || '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">บทบาท:</span>
              <br />
              <span className="font-medium">{role}</span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            หากต้องการเปลี่ยนอีเมล/username/บทบาท ติดต่อแอดมิน
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full bg-[#f97316] text-white hover:bg-[#ea580c]">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          บันทึกโปรไฟล์
        </Button>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// MyBiometricsSection — จัดการPasskeyของผู้ใช้ปัจจุบัน
// ─────────────────────────────────────────────────────────────────────────
// ลงทะเบียน Touch ID / Face ID / Windows Hello / Android fingerprint
// หลังจากลงทะเบียนแล้ว ผู้ใช้สามารถ login ด้วยPasskeyแทน password ได้
// ─────────────────────────────────────────────────────────────────────────
function MyBiometricsSection() {
  const { isSupported, register, listCredentials, removeCredential, loading } = useWebAuthn()
  const [credentials, setCredentials] = React.useState<Array<{
    id: string
    deviceType: string | null
    name: string | null
    createdAt: string
    lastUsedAt: string | null
  }>>([])
  const [refreshing, setRefreshing] = React.useState(false)
  const [newName, setNewName] = React.useState('')

  const refresh = React.useCallback(async () => {
    setRefreshing(true)
    try {
      const list = await listCredentials()
      setCredentials(list)
    } finally {
      setRefreshing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

  async function handleRegister() {
    const result = await register(newName.trim() || undefined)
    if (result?.verified) {
      toast.success(`ลงทะเบียน "${result.name ?? 'Passkey'}" สำเร็จ`)
      setNewName('')
      refresh()
    }
  }

  async function handleRemove(id: string, name: string | null) {
    if (!confirm(`ยืนยันลบ Passkey "${name ?? 'Passkey'}" ?`)) return
    const ok = await removeCredential(id)
    if (ok) {
      toast.success('ลบ Passkey เรียบร้อย')
      refresh()
    } else {
      toast.error('ลบไม่สำเร็จ')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base md:text-lg">
          <Fingerprint className="h-5 w-5 text-[#f97316]" />
          Passkey ของฉัน (Touch ID / Face ID / Windows Hello / Security Key)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          ลงทะเบียน Passkey ของอุปกรณ์นี้เพื่อใช้ login โดยไม่ต้องกรอก password.
          รองรับ Touch ID, Face ID, Windows Hello, Passkey Android และ security key (YubiKey).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isSupported ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <p className="font-medium">⚠️ เบราว์เซอร์นี้ไม่รองรับ Passkey</p>
            <p className="mt-1 text-xs">กรุณาใช้ Chrome / Safari / Edge เวอร์ชันใหม่, หรือเปิดผ่าน HTTPS (ไม่ใช่ HTTP).</p>
          </div>
        ) : (
          <>
            {/* Register new credential */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">ลงทะเบียนอุปกรณ์ใหม่</h4>
              <div className="flex gap-2">
                <Input
                  placeholder="ชื่อเล่น เช่น iPhone ของผม, Mac ส่วนตัว"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 text-sm"
                  maxLength={50}
                />
                <Button
                  onClick={handleRegister}
                  disabled={loading}
                  className="bg-[#f97316] text-white hover:bg-[#ea580c]"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  ลงทะเบียน
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                หลังกดปุ่ม เบราว์เซอร์จะถามยืนยันตัวตน (fingerprint/ใบหน้า/security key). ทำตามขั้นตอนบนหน้าจอ.
              </p>
            </div>

            {/* List of registered credentials */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Passkey ที่ลงทะเบียน ({credentials.length})
                </h4>
                <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>
                  {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  รีเฟรช
                </Button>
              </div>
              {credentials.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-muted-foreground dark:border-slate-700">
                  <Fingerprint className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  ยังไม่ได้ลงทะเบียน Passkey
                </div>
              ) : (
                <div className="space-y-2">
                  {credentials.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
                    >
                      <div className="flex items-center gap-3">
                        <Fingerprint className="h-5 w-5 text-[#f97316]" />
                        <div>
                          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            {c.name ?? 'Passkey'}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {c.deviceType ?? 'webauthn'} · ลงทะเบียน {new Date(c.createdAt).toLocaleDateString('th-TH')}
                            {c.lastUsedAt && ` · ใช้ล่าสุด ${new Date(c.lastUsedAt).toLocaleDateString('th-TH')}`}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(c.id, c.name)}
                        className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Help section */}
            <div className="rounded-lg bg-slate-50 p-3 text-[11px] text-muted-foreground dark:bg-slate-800/30">
              <p className="font-medium">💡 วิธีใช้งาน:</p>
              <ol className="mt-1 ml-4 list-decimal space-y-0.5">
                <li>ลงทะเบียน Passkey ของอุปกรณ์นี้ (ด้านบน)</li>
                <li>ครั้งต่อไปที่ login — กรอก email แล้วกดปุ่ม &quot;เข้าสู่ระบบด้วย Passkey&quot;</li>
                <li>เบราว์เซอร์จะถามยืนยันตัวตน ไม่ต้องกรอก password</li>
              </ol>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
