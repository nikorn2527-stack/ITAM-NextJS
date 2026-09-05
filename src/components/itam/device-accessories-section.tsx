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
 *   - พิมพ์สติกเกอร์ (StickerPrintDialog) — สติกเกอร์ใช้ QR เฉพาะของ accessory
 *     (เข้า /qr/a/{shortId}?action=view) และข้อมูลอุปกรณ์ต่อพ่วงผสมกับข้อมูล
 *     อุปกรณ์หลัก (site/department/building/floor/…)
 */

import * as React from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Pencil, Keyboard, Mouse, Monitor, Cable, Battery, Usb, Printer, Package } from 'lucide-react'
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
import { generateAccessoryQrUrl } from '@/lib/smart-qr'
import { StickerPrintDialog } from './sticker-print-dialog'
import type { Device } from './types'

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
export function DeviceAccessoriesSection({
  deviceId,
  parentDevice,
}: {
  deviceId: string
  /**
   * Parent device data — used to build the sticker print payload (we mix
   * accessory fields with parent device's site/department/building/etc).
   * Optional for backward-compat (the section still works without it, just
   * without the sticker print feature).
   */
  parentDevice?: Pick<
    Device,
    | 'id'
    | 'assetCode'
    | 'assetSiteCode'
    | 'site'
    | 'building'
    | 'floor'
    | 'department'
    | 'departmentCode'
    | 'location'
  > | null
}) {
  const token = useAuthStore((s) => s.token)
  const [accessories, setAccessories] = React.useState<Array<{
    id: string; accessoryType: string; brand: string | null; model: string | null
    serialNumber: string | null; status: string; installedDate: string | null; remark: string | null
  }>>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  // ── Sticker print dialog state ──
  // When the user clicks the Printer icon on an accessory row, we build a
  // fake "Device" payload for the StickerPrintDialog and open it. The
  // qrContentFor prop encodes the accessory's smart-qr URL.
  const [stickerOpen, setStickerOpen] = React.useState(false)
  const [stickerDevices, setStickerDevices] = React.useState<Device[]>([])

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
   * Open the StickerPrintDialog for a single accessory.
   *
   * Builds a "fake" Device payload that mixes accessory fields (brand, model,
   * serialNumber, type) with the parent device's location fields (site,
   * building, floor, department). The assetCode is set to
   * `<parent.assetCode>-A<position>` so the printed label clearly identifies
   * it as an accessory of the parent device.
   *
   * The QR content is overridden via the `qrContentFor` prop to encode the
   * accessory's Smart QR URL (/qr/a/{shortId}?action=view) instead of the
   * parent device's asset code.
   */
  function openAccessorySticker(acc: typeof accessories[0], position: number) {
    if (!parentDevice) {
      toast.error('ไม่พบข้อมูลอุปกรณ์หลัก — ไม่สามารถพิมพ์สติกเกอร์ได้')
      return
    }
    const typeMeta = getTypeMeta(acc.accessoryType)
    // Build a "fake" Device payload for the StickerPrintDialog.
    // The StickerPrintDialog expects Device-shaped objects, so we cast via
    // `as unknown as Device` after filling in the fields it reads.
    const fakeDevice = {
      id: acc.id,
      // Suffix the parent's assetCode with `-A1`, `-A2`, … to keep the
      // accessory visually associated with its parent on the printed label.
      assetCode: `${parentDevice.assetCode}-A${position}`,
      name: typeMeta.label,
      brand: acc.brand ?? '',
      model: acc.model ?? '',
      type: typeMeta.label,
      serialNumber: acc.serialNumber ?? '',
      // Force "Active" status so the dialog's disposed-device filter doesn't
      // hide the accessory (accessory status uses the same vocabulary).
      status: 'Active',
      site: parentDevice.site ?? '',
      department: parentDevice.department ?? null,
      departmentCode: parentDevice.departmentCode ?? null,
      assetSiteCode: parentDevice.assetSiteCode ?? null,
      purchaseDate: acc.installedDate ?? null,
    } as unknown as Device

    setStickerDevices([fakeDevice])
    setStickerOpen(true)
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
          accessories.map((acc, idx) => {
            const typeMeta = getTypeMeta(acc.accessoryType)
            const statusMeta = getStatusMeta(acc.status)
            const Icon = typeMeta.icon
            const accessoryPosition = idx + 1
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
                    onClick={() => openAccessorySticker(acc, accessoryPosition)}
                    disabled={!parentDevice}
                    title="พิมพ์สติกเกอร์อุปกรณ์ต่อพ่วง"
                  >
                    <Printer className="h-3.5 w-3.5" />
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

      {/* Sticker print dialog (per-accessory) */}
      <StickerPrintDialog
        open={stickerOpen}
        onOpenChange={setStickerOpen}
        devices={stickerDevices}
        dialogTitle={
          <span className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-[#f97316]" />
            🖨️ พิมพ์สติกเกอร์อุปกรณ์ต่อพ่วง
          </span>
        }
        dialogDescription="QR บนสติกเกอร์จะลิงก์ไปยังหน้าดูข้อมูลอุปกรณ์ต่อพ่วงโดยตรง (/qr/a/{shortId}?action=view)"
        // Override QR content — encode the accessory's Smart QR URL instead of
        // the asset code. The fake device's `id` is the accessory's id, so we
        // can resolve the URL from the device payload here.
        qrContentFor={(d) => generateAccessoryQrUrl(d.id, 'view')}
      />
    </Card>
  )
}
