'use client'

// ============================================================
// TemplatesPage — เทมเพลตเอกสาร (Visual Editor)
// (Task ID: VISUAL-TEMPLATE-EDITOR, PART 3)
// ============================================================
// แทนที่ JSON editor เดิมด้วย TemplateEditor (WYSIWYG).
// Workflow:
//   • เลือกประเภทเทมเพลต (sticker / pdf / work-order / ...)
//   • รายการเทมเพลตในประเภทนั้น ๆ
//   • ปุ่ม "สร้างเทมเพลตใหม่" → เปิดหน้าจอ Visual Editor
//   • ปุ่ม "แก้ไข" → เปิด Visual Editor พร้อมโหลดเนื้อหาเดิม
//   • Toggle "ใช้งาน" / "ตั้งเป็นค่าเริ่มต้น" / "Fix สำหรับใบงานทั้งหมด"
// ============================================================

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  FileText,
  Plus,
  Pencil,
  Trash2,
  Check,
  Copy,
  Loader2,
  Pin,
} from 'lucide-react'
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_TYPES,
  TEMPLATE_TYPE_META,
  type TemplateType,
} from '@/lib/templates'
import {
  makeDefaultContent,
  parseContent,
  serializeContent,
  type TemplateContent,
} from '@/lib/template-editor'
import { TemplateEditor } from './template-editor'

// ---------- Types ----------

interface DocumentTemplate {
  id: string
  name: string
  type: string
  category: string | null
  content: string
  isActive: boolean
  isDefault: boolean
  isFixed: boolean
  createdAt: string
  updatedAt: string
}

// ---------- Helpers ----------

function formatThaiDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

// ---------- Default-template seeding ----------

function useSeedDefaults() {
  const queryClient = useQueryClient()
  const [seeding, setSeeding] = React.useState(false)
  const seededRef = React.useRef(false)

  const { data: allTemplates, isLoading } = useQuery<DocumentTemplate[]>({
    queryKey: ['templates', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/templates')
      if (!res.ok) throw new Error('Failed to load templates')
      const j = await res.json()
      return (j.templates ?? []) as DocumentTemplate[]
    },
    staleTime: 30_000,
  })

  React.useEffect(() => {
    if (isLoading || seededRef.current || !allTemplates) return
    const missing = TEMPLATE_TYPES.filter(
      (t) => !allTemplates.some((tpl) => tpl.type === t),
    )
    if (missing.length === 0) {
      seededRef.current = true
      return
    }
    seededRef.current = true
    setSeeding(true)
    Promise.all(
      missing.map(async (t) => {
        // For types we have visual layouts for, seed with makeDefaultContent.
        // Otherwise fall back to the legacy DEFAULT_TEMPLATES JSON.
        let content: string
        try {
          const def: TemplateContent = makeDefaultContent('A4', t)
          content = serializeContent(def)
        } catch {
          content = DEFAULT_TEMPLATES[t].content
        }
        const res = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: DEFAULT_TEMPLATES[t].name,
            type: t,
            content,
            isActive: true,
            isDefault: true,
          }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? `สร้างเทมเพลตเริ่มต้นสำหรับ ${t} ล้มเหลว`)
        }
        return res.json()
      }),
    )
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['templates'] })
        toast.success('สร้างเทมเพลตเริ่มต้นเรียบร้อยแล้ว')
      })
      .catch((err: unknown) => {
        toast.error(
          err instanceof Error ? err.message : 'สร้างเทมเพลตเริ่มต้นล้มเหลว',
        )
      })
      .finally(() => setSeeding(false))
  }, [allTemplates, isLoading, queryClient])

  return { seeding }
}

// ---------- Editor dialog (uses Visual TemplateEditor) ----------

interface EditorState {
  id: string | null // null = creating new
  name: string
  category: string
  content: TemplateContent
  isActive: boolean
  isDefault: boolean
  isFixed: boolean
}

interface EditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: TemplateType
  initial: EditorState
}

function EditorDialog({ open, onOpenChange, type, initial }: EditorDialogProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<EditorState>(initial)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setForm(initial)
    }
  }, [open, initial])

  const isEditing = form.id !== null

  // ── Save handler — called by TemplateEditor's "บันทึก" button ──
  async function handleSave(content: TemplateContent) {
    if (!form.name.trim()) {
      toast.error('กรุณาระบุชื่อเทมเพลต')
      throw new Error('กรุณาระบุชื่อเทมเพลต')
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        type,
        category: form.category.trim() || null,
        content: serializeContent(content),
        isActive: form.isActive,
        isDefault: form.isDefault,
        isFixed: form.isFixed,
      }
      const res = isEditing && form.id
        ? await fetch(`/api/templates/${form.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'บันทึกไม่สำเร็จ')
      }
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success(isEditing ? 'บันทึกเทมเพลตเรียบร้อย' : 'สร้างเทมเพลตเรียบร้อย')
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[95vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1200px]">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            {isEditing ? 'แก้ไขเทมเพลต' : 'สร้างเทมเพลตใหม่'}{' '}
            <Badge variant="outline" className="text-xs">
              {TEMPLATE_TYPE_META.find((m) => m.value === type)?.label ?? type}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            ออกแบบเทมเพลตบนกระดาษจำลอง — ลาก/ย่อ/ขยาย แล้วกด
            &quot;บันทึก&quot; เมื่อเสร็จ
          </DialogDescription>
        </DialogHeader>

        {/* Meta form (name / category / toggles) */}
        <div className="grid grid-cols-1 gap-3 border-b bg-card px-5 py-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
          <div className="space-y-1">
            <Label htmlFor="tpl-name" className="text-[11px]">
              ชื่อเทมเพลต <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tpl-name"
              value={form.name}
              onChange={(e) =>
                setForm((s) => ({ ...s, name: e.target.value }))
              }
              placeholder="เช่น ใบแจ้งซ่อนมาตรฐาน"
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tpl-category" className="text-[11px]">
              หมวดหมู่
            </Label>
            <Input
              id="tpl-category"
              value={form.category}
              onChange={(e) =>
                setForm((s) => ({ ...s, category: e.target.value }))
              }
              placeholder="ไม่บังคับ"
              className="h-8"
            />
          </div>
          <div className="flex items-end gap-2">
            <Switch
              id="tpl-active"
              checked={form.isActive}
              onCheckedChange={(v) =>
                setForm((s) => ({ ...s, isActive: v }))
              }
            />
            <Label htmlFor="tpl-active" className="text-[11px]">
              ใช้งาน
            </Label>
          </div>
          <div className="flex items-end gap-2">
            <Switch
              id="tpl-default"
              checked={form.isDefault}
              onCheckedChange={(v) =>
                setForm((s) => ({ ...s, isDefault: v }))
              }
            />
            <Label htmlFor="tpl-default" className="text-[11px]">
              ค่าเริ่มต้น
            </Label>
          </div>
          <div className="flex items-end gap-2">
            <Switch
              id="tpl-fixed"
              checked={form.isFixed}
              onCheckedChange={(v) =>
                setForm((s) => ({ ...s, isFixed: v }))
              }
            />
            <Label
              htmlFor="tpl-fixed"
              className="flex items-center gap-1 text-[11px]"
              title="Fix กับเทมเพลตนี้สำหรับใบงานทั้งหมดในประเภทนี้"
            >
              <Pin className="h-3 w-3" />
              Fix
            </Label>
          </div>
        </div>

        {/* Visual editor */}
        <div className="min-h-0 flex-1">
          <TemplateEditor
            initialContent={form.content}
            onSave={handleSave}
            saving={saving}
            templateType={type}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Main page ----------

export function TemplatesPage() {
  const queryClient = useQueryClient()
  const [selectedType, setSelectedType] =
    React.useState<TemplateType>('work-order')
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editorInitial, setEditorInitial] = React.useState<EditorState>(() => ({
    id: null,
    name: '',
    category: '',
    content: makeDefaultContent('A4', 'work-order'),
    isActive: true,
    isDefault: false,
    isFixed: false,
  }))
  const [deleteTarget, setDeleteTarget] =
    React.useState<DocumentTemplate | null>(null)

  // Seed defaults on first mount (only for types that have zero templates).
  useSeedDefaults()

  // List filtered by selected type.
  const { data: templates, isLoading } = useQuery<DocumentTemplate[]>({
    queryKey: ['templates', selectedType],
    queryFn: async () => {
      const res = await fetch(`/api/templates?type=${selectedType}`)
      if (!res.ok) throw new Error('Failed to load templates')
      const j = await res.json()
      return (j.templates ?? []) as DocumentTemplate[]
    },
    staleTime: 15_000,
  })

  // ---- Mutations ----

  const setActiveMutation = useMutation({
    mutationFn: async (tpl: DocumentTemplate) => {
      const res = await fetch(`/api/templates/${tpl.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !tpl.isActive }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'อัปเดตไม่สำเร็จ')
      }
      return res.json()
    },
    onSuccess: (_data, tpl) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success(tpl.isActive ? 'ปิดใช้งานเทมเพลต' : 'เปิดใช้งานเทมเพลต')
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'อัปเดตไม่สำเร็จ')
    },
  })

  const setDefaultMutation = useMutation({
    mutationFn: async (tpl: DocumentTemplate) => {
      const res = await fetch(`/api/templates/${tpl.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: !tpl.isDefault }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'อัปเดตไม่สำเร็จ')
      }
      return res.json()
    },
    onSuccess: (_data, tpl) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success(
        tpl.isDefault ? 'ยกเลิกการตั้งเป็นค่าเริ่มต้น' : 'ตั้งเป็นค่าเริ่มต้นแล้ว',
      )
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'อัปเดตไม่สำเร็จ')
    },
  })

  const setFixedMutation = useMutation({
    mutationFn: async (tpl: DocumentTemplate) => {
      const res = await fetch(`/api/templates/${tpl.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFixed: !tpl.isFixed }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'อัปเดตไม่สำเร็จ')
      }
      return res.json()
    },
    onSuccess: (_data, tpl) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success(
        tpl.isFixed ? 'ยกเลิกการ Fix เทมเพลต' : 'Fix เทมเพลตเรียบร้อย',
      )
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'อัปเดตไม่สำเร็จ')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'ลบไม่สำเร็จ')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('ลบเทมเพลตเรียบร้อย')
      setDeleteTarget(null)
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'ลบไม่สำเร็จ')
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: async (tpl: DocumentTemplate) => {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${tpl.name} (สำเนา)`,
          type: tpl.type,
          category: tpl.category,
          content: tpl.content,
          isActive: true,
          isDefault: false,
          isFixed: false,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'คัดลอกไม่สำเร็จ')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('คัดลอกเทมเพลตเรียบร้อย')
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'คัดลอกไม่สำเร็จ')
    },
  })

  // ---- Dialog openers ----

  function openCreate() {
    setEditorInitial({
      id: null,
      name: '',
      category: '',
      content: makeDefaultContent('A4', selectedType),
      isActive: true,
      isDefault: false,
      isFixed: false,
    })
    setEditorOpen(true)
  }

  function openEdit(tpl: DocumentTemplate) {
    setEditorInitial({
      id: tpl.id,
      name: tpl.name,
      category: tpl.category ?? '',
      content: parseContent(tpl.content),
      isActive: tpl.isActive,
      isDefault: tpl.isDefault,
      isFixed: tpl.isFixed,
    })
    setEditorOpen(true)
  }

  const selectedMeta = TEMPLATE_TYPE_META.find(
    (m) => m.value === selectedType,
  )

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="space-y-1"
      >
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          📄 เทมเพลตเอกสาร
        </h1>
        <p className="text-sm text-muted-foreground md:text-base">
          สร้างและจัดการเทมเพลต — แยกตามประเภทงาน • ตัวแก้ไขแบบลากวาง (Visual
          Editor)
        </p>
      </motion.div>

      {/* Template type selector */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          เลือกประเภทเทมเพลต
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {TEMPLATE_TYPE_META.map((meta) => {
            const active = selectedType === meta.value
            return (
              <button
                key={meta.value}
                type="button"
                onClick={() => setSelectedType(meta.value)}
                aria-pressed={active}
                className={`
                  group relative flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2
                  ${
                    active
                      ? 'border-orange-400 bg-orange-50 shadow-sm dark:border-orange-700 dark:bg-orange-950/40'
                      : 'border-border bg-card hover:border-orange-300 hover:bg-orange-50/50 dark:hover:border-orange-800 dark:hover:bg-orange-950/20'
                  }
                `}
              >
                <span className="text-2xl" aria-hidden>
                  {meta.icon}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    active
                      ? 'text-orange-700 dark:text-orange-300'
                      : 'text-foreground'
                  }`}
                >
                  {meta.label}
                </span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {meta.description}
                </span>
                {active && (
                  <span
                    aria-hidden
                    className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white"
                  >
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Template list for selected type */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <span aria-hidden>{selectedMeta?.icon}</span>
              {selectedMeta?.label} — รายการเทมเพลต
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {selectedMeta?.description}
            </p>
          </div>
          <Button onClick={openCreate} size="sm" className="shrink-0">
            <Plus className="mr-1.5 h-4 w-4" />
            สร้างเทมเพลตใหม่
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !templates || templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm font-medium">ยังไม่มีเทมเพลตในประเภทนี้</p>
              <p className="text-xs text-muted-foreground">
                กด &quot;สร้างเทมเพลตใหม่&quot; เพื่อเริ่มต้น
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">ชื่อ</TableHead>
                    <TableHead className="min-w-[120px]">หมวดหมู่</TableHead>
                    <TableHead className="text-center">สถานะ</TableHead>
                    <TableHead className="text-center">ค่าเริ่มต้น</TableHead>
                    <TableHead className="text-center">Fix</TableHead>
                    <TableHead className="min-w-[110px]">สร้างเมื่อ</TableHead>
                    <TableHead className="text-right">การจัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((tpl) => (
                    <TableRow key={tpl.id}>
                      <TableCell className="font-medium">{tpl.name}</TableCell>
                      <TableCell>
                        {tpl.category ? (
                          <span className="text-sm text-muted-foreground">
                            {tpl.category}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground/60">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={tpl.isActive ? 'default' : 'secondary'}
                          className={
                            tpl.isActive
                              ? 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : ''
                          }
                        >
                          {tpl.isActive ? 'ใช้งาน' : 'ปิด'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {tpl.isDefault ? (
                          <Badge
                            variant="default"
                            className="border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300"
                          >
                            ★ ค่าเริ่มต้น
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground/60">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {tpl.isFixed ? (
                          <Badge
                            variant="default"
                            className="border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          >
                            <Pin className="mr-0.5 h-2.5 w-2.5" />
                            Fix
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground/60">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatThaiDate(tpl.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {/* Toggle active */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setActiveMutation.mutate(tpl)}
                            disabled={setActiveMutation.isPending}
                            title={tpl.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                            aria-label={
                              tpl.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'
                            }
                          >
                            <Check
                              className={`h-4 w-4 ${
                                tpl.isActive
                                  ? 'text-emerald-600'
                                  : 'text-muted-foreground'
                              }`}
                            />
                          </Button>
                          {/* Toggle default */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setDefaultMutation.mutate(tpl)}
                            disabled={setDefaultMutation.isPending}
                            title={
                              tpl.isDefault
                                ? 'ยกเลิกการตั้งเป็นค่าเริ่มต้น'
                                : 'ตั้งเป็นค่าเริ่มต้น'
                            }
                            aria-label="ค่าเริ่มต้น"
                          >
                            <span
                              className={`text-sm ${
                                tpl.isDefault
                                  ? 'text-orange-500'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              ★
                            </span>
                          </Button>
                          {/* Toggle fixed */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setFixedMutation.mutate(tpl)}
                            disabled={setFixedMutation.isPending}
                            title={
                              tpl.isFixed
                                ? 'ยกเลิกการ Fix'
                                : 'Fix สำหรับใบงานทั้งหมดในประเภทนี้'
                            }
                            aria-label="Fix"
                          >
                            <Pin
                              className={`h-4 w-4 ${
                                tpl.isFixed
                                  ? 'text-emerald-600'
                                  : 'text-muted-foreground'
                              }`}
                            />
                          </Button>
                          {/* Duplicate */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => duplicateMutation.mutate(tpl)}
                            disabled={duplicateMutation.isPending}
                            title="คัดลอก"
                            aria-label="คัดลอก"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          {/* Edit */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => openEdit(tpl)}
                            title="แก้ไข"
                            aria-label="แก้ไข"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {/* Delete (disabled for default) */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
                            onClick={() => setDeleteTarget(tpl)}
                            disabled={tpl.isDefault}
                            title={
                              tpl.isDefault
                                ? 'ไม่สามารถลบเทมเพลตค่าเริ่มต้นได้'
                                : 'ลบ'
                            }
                            aria-label="ลบ"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hint card */}
      <Card>
        <CardContent className="space-y-2 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            💡 วิธีใช้งาน Visual Editor
          </p>
          <ul className="ml-4 list-disc space-y-1 text-xs">
            <li>
              กดปุ่ม &quot;สร้างเทมเพลตใหม่&quot; หรือ &quot;แก้ไข&quot; เพื่อเปิดหน้าจอออกแบบ
            </li>
            <li>
              ลากองค์ประกอบเพื่อย้าย (จะ snap ตามกริด 1 มม.) • ลากจุดสี่มุมเพื่อย่อ/ขยาย
            </li>
            <li>
              ดับเบิลคลิกที่ข้อความเพื่อแก้ไข ณ ที่ • ปุ่มลัด: Del=ลบ, Ctrl+D=คัดลอก, Ctrl+Z=ยกเลิก
            </li>
            <li>
              ตัวแปร {`{woNumber}`} {`{subject}`} {`{reporterName}`} ฯลฯ จะถูกแทนค่าด้วยข้อมูลจริงตอนพิมพ์
            </li>
            <li>
              ติ๊ก &quot;Fix&quot; เพื่อให้เทมเพลตนี้ถูกใช้โดยอัตโนมัติสำหรับใบงานในประเภทนี้
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Editor dialog (full-screen visual editor) */}
      <EditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        type={selectedType}
        initial={editorInitial}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบเทมเพลต</AlertDialogTitle>
            <AlertDialogDescription>
              คุณแน่ใจหรือว่าต้องการลบเทมเพลต{' '}
              <span className="font-medium text-foreground">
                &quot;{deleteTarget?.name}&quot;
              </span>
              ? การกระทำนี้ไม่สามารถย้อนกลับได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-600"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
              }}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  กำลังลบ…
                </>
              ) : (
                'ลบเทมเพลต'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
