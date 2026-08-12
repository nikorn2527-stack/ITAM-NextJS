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
import { Database, Building2, Plus, RefreshCw, Pencil, Trash2, Bell, Send } from 'lucide-react'

interface MasterItem { id: string; itemId: string | null; categoryKey: string; value: string; displayLabel: string | null; active: boolean; departmentCode: string | null }
interface Site { id: string; siteCode: string; siteName: string | null; lineOa: string | null; hotline: string | null; paperRateBw: number | null; paperRateColor: number | null; deviceCount?: number; activeCount?: number }

interface NotifySettings {
  channels: { email: boolean; telegram: boolean; lineNotify: boolean; lineOA: boolean }
  events: { deviceAdded: boolean; deviceUpdated: boolean; transfer: boolean; lifecycle: boolean; meter: boolean }
  credentials: Record<string, string>
}

export function ItamSettings() {
  const qc = useQueryClient()
  const [tab, setTab] = React.useState<'master' | 'sites' | 'notifications'>('master')
  const [category, setCategory] = React.useState('all')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editItem, setEditItem] = React.useState<MasterItem | null>(null)
  const [form, setForm] = React.useState({ categoryKey: '', value: '', displayLabel: '', departmentCode: '' })

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

  // Notification settings (only fetched when tab === 'notifications')
  const { data: notifyData, isLoading: notifyLoading } = useQuery<NotifySettings>({
    queryKey: ['itam-notify-settings'],
    queryFn: async () => {
      const res = await fetch('/api/itam/notifications/settings')
      if (!res.ok) throw new Error('Failed')
      return res.json()
    },
    enabled: tab === 'notifications',
  })
  const [notifyDraft, setNotifyDraft] = React.useState<NotifySettings | null>(null)
  React.useEffect(() => {
    if (notifyData) setNotifyDraft(JSON.parse(JSON.stringify(notifyData)) as NotifySettings)
  }, [notifyData])

  async function saveNotify() {
    if (!notifyDraft) return
    try {
      const res = await fetch('/api/itam/notifications/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
      if (!res.ok) throw new Error('Failed')
      toast.success('บันทึกการตั้งค่าการแจ้งเตือนแล้ว')
      await qc.invalidateQueries({ queryKey: ['itam-notify-settings'] })
    } catch {
      toast.error('บันทึกไม่สำเร็จ')
    }
  }

  async function sendTestNotify() {
    try {
      const res = await fetch('/api/itam/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '🔔 ทดสอบการแจ้งเตือนจาก ITAM' }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed')
      toast.success('ส่งการแจ้งเตือนทดสอบแล้ว — ตรวจสอบ logs / ช่องทางที่เปิดใช้')
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
    setForm({ categoryKey: 'Brand', value: '', displayLabel: '', departmentCode: '' })
    setDialogOpen(true)
  }

  function openEdit(item: MasterItem) {
    setEditItem(item)
    setForm({ categoryKey: item.categoryKey, value: item.value, displayLabel: item.displayLabel || '', departmentCode: item.departmentCode || '' })
    setDialogOpen(true)
  }

  async function saveItem() {
    if (!form.categoryKey || !form.value) { toast.error('กรุณากรอกหมวดหมู่และค่า'); return }
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
    if (!confirm(`ลบ "${item.value}"?`)) return
    try {
      await fetch(`/api/itam/master-items/${item.id}`, { method: 'DELETE' })
      toast.success('ลบแล้ว')
      await qc.invalidateQueries({ queryKey: ['itam-master'] })
    } catch { toast.error('ลบไม่สำเร็จ') }
  }

  const items = masterData?.items ?? []
  const sites = sitesData?.sites ?? []

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">ตั้งค่า (Real DB)</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">ข้อมูลมาตรฐาน + สาขา</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => setTab('master')} className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${tab === 'master' ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Database className="mr-1 inline h-4 w-4" /> ข้อมูลมาตรฐาน
        </button>
        <button onClick={() => setTab('sites')} className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${tab === 'sites' ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Building2 className="mr-1 inline h-4 w-4" /> สาขา
        </button>
        <button onClick={() => setTab('notifications')} className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${tab === 'notifications' ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          <Bell className="mr-1 inline h-4 w-4" /> การแจ้งเตือน
        </button>
      </div>

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

          <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <CardContent className="p-0">
              <div className="itam-scroll max-h-[55vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-50/80 dark:bg-slate-900/80">
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
                          <TableCell><Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item.categoryKey}</Badge></TableCell>
                          <TableCell className="text-sm font-medium">{item.value}</TableCell>
                          <TableCell className="text-xs text-slate-400">{item.displayLabel || '—'}</TableCell>
                          <TableCell className="text-xs">{item.departmentCode || '—'}</TableCell>
                          <TableCell className="text-center">{item.active ? <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">✓</Badge> : <Badge className="bg-slate-50 text-slate-400">—</Badge>}</TableCell>
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

      {tab === 'sites' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sitesLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
              <Card key={s.id} className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
              <Select value={form.categoryKey} onValueChange={(v) => setForm({ ...form, categoryKey: v })}>
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
            <div className="space-y-1.5"><Label className="text-xs">ค่า *</Label><Input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Display Label</Label><Input value={form.displayLabel} onChange={(e) => setForm({ ...form, displayLabel: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" /></div>
            <div className="space-y-1.5"><Label className="text-xs">รหัสแผนก</Label><Input value={form.departmentCode} onChange={(e) => setForm({ ...form, departmentCode: e.target.value })} className="dark:bg-slate-800 dark:border-slate-700" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={saveItem} className="bg-[#f97316] text-white hover:bg-[#ea580c]">บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notifications tab */}
      {tab === 'notifications' && (
        <div className="space-y-4">
          {notifyLoading || !notifyDraft ? (
            <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <CardContent className="p-6">
                <Skeleton className="h-64 w-full rounded" />
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
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

              <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
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

              <Card className="shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
    </div>
  )
}
