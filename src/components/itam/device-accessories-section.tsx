'use client'

/**
 * DeviceAccessoriesSection — ส่วนจัดการอุปกรณ์ต่อพ่วง
 *
 * แสดงใน device detail (desktop + mobile)
 * ฟีเจอร์:
 *   - แสดงรายการอุปกรณ์ต่อพ่วงทั้งหมดของอุปกรณ์นี้
 *   - เพิ่มอุปกรณ์ต่อพ่วงใหม่
 *   - แก้ไข / ลบ
 *   - เปลี่ยนสถานะ (Active → Inactive → Disposed)
 */

import * as React from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Pencil, Keyboard, Mouse, Monitor, Cable, Battery, Usb, Printer, Package, QrCode } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAuthStore } from '@/store/auth-store'
import { generateAccessoryQrUrl, getActionLabel } from '@/lib/smart-qr'

// ── Accessory types ──────────────────────────────────────────────────
const ACCESSORY_TYPES = [
  { value: 'KEYBOARD', label: 'คีย์บอร์ด', icon: Keyboard },
  { value: 'MOUSE', label: 'เมาส์', icon: Mouse },
  { value: 'MONITOR', label: 'จอภาพ', icon: Monitor },
  { value: 'SCANNER', label: 'สแกนเนอร์เสริม', icon: Package },
  { value: 'CABLE', label: 'สาย / แลน', icon: Cable },
  { value: 'ADAPTER', label: 'อะแดปเตอร์', icon: Cable },
  { value: 'UPS', label: 'UPS / สำรองไฟ', icon: Battery },
  { value: 'HUB', label: 'USB Hub', icon: Usb },
  { value: 'PRINTHEAD', label: 'หัวพิมพ์', icon: Printer },
  { value: 'TRAY', label: 'ถาดกระดาษเสริม', icon: Package },
  { value: 'OTHER', label: 'อื่นๆ', icon: Package },
]

const ACCESSORY_STATUSES = [
  { value: 'Active', label: 'ใช้งานอยู่', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'Inactive', label: 'ไม่ใช้งาน', color: 'bg-slate-100 text-slate-600' },
  { value: 'In Repair', label: 'ส่งซ่อม', color: 'bg-amber-100 text-amber-700' },
  { value: 'Disposed', label: 'ตัดจ่าย', color: 'bg-rose-100 text-rose-700' },
]

function getTypeMeta(type: string) {
  return ACCESSORY_TYPES.find((t) => t.value === type) ?? ACCESSORY_TYPES[ACCESSORY_TYPES.length - 1]
}

function getStatusMeta(status: string) {
  return ACCESSORY_STATUSES.find((s) => s.value === status) ?? ACCESSORY_STATUSES[0]
}

// ── Component ────────────────────────────────────────────────────────
export function DeviceAccessoriesSection({ deviceId }: { deviceId: string }) {
  const token = useAuthStore((s) => s.token)
  const [accessories, setAccessories] = React.useState<Array<{
    id: string; accessoryType: string; brand: string | null; model: string | null
    serialNumber: string | null; status: string; installedDate: string | null; remark: string | null
  }>>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)

  // Form state
  const [formType, setFormType] = React.useState('KEYBOARD')
  const [formBrand, setFormBrand] = React.useState('')
  const [formModel, setFormModel] = React.useState('')
  const [formSerial, setFormSerial] = React.useState('')
  const [formStatus, setFormStatus] = React.useState('Active')
  const [formRemark, setFormRemark] = React.useState('')

  // Load accessories
  const loadAccessories = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/devices/${deviceId}/accessories`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('โหลดไม่สำเร็จ')
      const data = await res.json()
      setAccessories(data.accessories ?? [])
    } catch {
      // silent fail
    } finally {
      setLoading(false)
    }
  }, [deviceId, token])

  React.useEffect(() => {
    loadAccessories()
  }, [loadAccessories])

  function openAdd() {
    setEditingId(null)
    setFormType('KEYBOARD')
    setFormBrand('')
    setFormModel('')
    setFormSerial('')
    setFormStatus('Active')
    setFormRemark('')
    setDialogOpen(true)
  }

  function openEdit(acc: typeof accessories[0]) {
    setEditingId(acc.id)
    setFormType(acc.accessoryType)
    setFormBrand(acc.brand ?? '')
    setFormModel(acc.model ?? '')
    setFormSerial(acc.serialNumber ?? '')
    setFormStatus(acc.status)
    setFormRemark(acc.remark ?? '')
    setDialogOpen(true)
  }

  async function handleSave() {
    try {
      const payload = {
        accessoryType: formType,
        brand: formBrand.trim() || null,
        model: formModel.trim() || null,
        serialNumber: formSerial.trim() || null,
        status: formStatus,
        remark: formRemark.trim() || null,
      }

      if (editingId) {
        // Update
        const res = await fetch(`/api/devices/${deviceId}/accessories/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('แก้ไขไม่สำเร็จ')
        toast.success('แก้ไขอุปกรณ์ต่อพ่วงเรียบร้อย')
      } else {
        // Create
        const res = await fetch(`/api/devices/${deviceId}/accessories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('เพิ่มไม่สำเร็จ')
        toast.success('เพิ่มอุปกรณ์ต่อพ่วงเรียบร้อย')
      }

      setDialogOpen(false)
      loadAccessories()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('ยืนยันลบอุปกรณ์ต่อพ่วงนี้?')) return
    try {
      const res = await fetch(`/api/devices/${deviceId}/accessories/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('ลบไม่สำเร็จ')
      toast.success('ลบเรียบร้อย')
      loadAccessories()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ลบไม่สำเร็จ')
    }
  }

  /**
   * Print accessory sticker — generates a QR code that, when scanned,
   * opens the device detail page (showing the accessory + parent device).
   *
   * The QR encodes: /qr/a/{shortId}?action=view
   * When scanned: resolves to parent device + highlights the accessory.
   */
  function printAccessorySticker(acc: typeof accessories[0]) {
    const typeMeta = getTypeMeta(acc.accessoryType)
    const qrUrl = generateAccessoryQrUrl(acc.id, 'view')

    // Open a print window with the sticker layout
    const printWindow = window.open('', '_blank', 'width=400,height=300')
    if (!printWindow) {
      toast.error('เบราว์เซอร์บล็อกป๊อปอัป — กรุณาอนุญาตป๊อปอัป')
      return
    }

    printWindow.document.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>สติกเกอร์อุปกรณ์ต่อพ่วง — ${typeMeta.label}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Sukhumvit Set', 'Noto Sans Thai', 'Tahoma', sans-serif; }
          .sticker {
            width: 180px; height: 100px;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 4mm;
            display: flex; flex-direction: column; gap: 2mm;
          }
          .header { display: flex; align-items: center; gap: 2mm; }
          .type-badge {
            background: #f97316; color: white;
            font-size: 7pt; font-weight: 700;
            padding: 1px 4px; border-radius: 2px;
          }
          .brand-model { font-size: 8pt; color: #1e293b; font-weight: 600; }
          .serial { font-size: 7pt; color: #64748b; }
          .qr-area { display: flex; align-items: center; gap: 3mm; }
          .qr-code { width: 55px; height: 55px; }
          .info { font-size: 6pt; color: #94a3b8; line-height: 1.3; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="sticker">
          <div class="header">
            <span class="type-badge">${typeMeta.label}</span>
            <span class="brand-model">${acc.brand ?? ''} ${acc.model ?? ''}</span>
          </div>
          <div class="qr-area">
            <img class="qr-code" src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrUrl)}" alt="QR" />
            <div>
              <div class="serial">S/N: ${acc.serialNumber ?? '—'}</div>
              <div class="info">สแกน QR เพื่อดูข้อมูล</div>
              <div class="info">อุปกรณ์ต่อพ่วง</div>
            </div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          };
        </script>
      </body>
      </html>
    `)
    printWindow.document.close()
    toast.success('เปิดหน้าพิมพ์สติกเกอร์แล้ว')
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Usb className="h-4 w-4 text-[#f97316]" />
          อุปกรณ์ต่อพ่วง ({accessories.length})
        </CardTitle>
        <Button size="sm" variant="outline" onClick={openAdd} className="h-7 text-xs">
          <Plus className="mr-1 h-3.5 w-3.5" /> เพิ่ม
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-center text-xs text-muted-foreground py-4">กำลังโหลด...</p>
        ) : accessories.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-4">
            ยังไม่มีอุปกรณ์ต่อพ่วง — กด "เพิ่ม" เพื่อเพิ่ม
          </p>
        ) : (
          accessories.map((acc) => {
            const typeMeta = getTypeMeta(acc.accessoryType)
            const statusMeta = getStatusMeta(acc.status)
            const Icon = typeMeta.icon
            return (
              <div
                key={acc.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5 dark:border-slate-700"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {typeMeta.label}
                    </span>
                    <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${statusMeta.color}`}>
                      {statusMeta.label}
                    </Badge>
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {acc.brand} {acc.model}
                    {acc.serialNumber && ` · S/N: ${acc.serialNumber}`}
                    {acc.installedDate && ` · ติดตั้ง: ${acc.installedDate}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="ghost" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(acc)} title="แก้ไข">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="ghost"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-[#f97316]"
                    onClick={() => printAccessorySticker(acc)}
                    title="พิมพ์สติกเกอร์ QR"
                  >
                    <QrCode className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="ghost" variant="ghost" className="h-7 w-7 p-0 text-rose-500" onClick={() => handleDelete(acc.id)} title="ลบ">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </CardContent>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'แก้ไขอุปกรณ์ต่อพ่วง' : 'เพิ่มอุปกรณ์ต่อพ่วง'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Type */}
            <div className="space-y-1.5">
              <Label className="text-xs">ประเภท *</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCESSORY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Brand + Model */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">ยี่ห้อ</Label>
                <Input value={formBrand} onChange={(e) => setFormBrand(e.target.value)} placeholder="Logitech" className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">รุ่น</Label>
                <Input value={formModel} onChange={(e) => setFormModel(e.target.value)} placeholder="K380" className="text-sm" />
              </div>
            </div>
            {/* Serial + Status */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Serial Number</Label>
                <Input value={formSerial} onChange={(e) => setFormSerial(e.target.value)} placeholder="SN..." className="text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">สถานะ</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCESSORY_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Remark */}
            <div className="space-y-1.5">
              <Label className="text-xs">หมายเหตุ</Label>
              <Input value={formRemark} onChange={(e) => setFormRemark(e.target.value)} placeholder="หมายเหตุ (ถ้ามี)" className="text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} className="bg-[#f97316] text-white hover:bg-[#ea580c]">
              {editingId ? 'บันทึก' : 'เพิ่ม'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
