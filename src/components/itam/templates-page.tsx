'use client'

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
import { Textarea } from '@/components/ui/textarea'
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
  DialogFooter,
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
} from 'lucide-react'
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_TYPES,
  TEMPLATE_TYPE_META,
  type TemplateType,
} from '@/lib/templates'

// ---------- Types ----------

interface DocumentTemplate {
  id: string
  name: string
  type: string
  category: string | null
  content: string
  isActive: boolean
  isDefault: boolean
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

/** Pretty-print a JSON string for display; returns the original on parse error. */
function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

// ---------- Default-template seeding ----------
// On first load, if a type has zero templates, auto-create the default one.

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
        const def = DEFAULT_TEMPLATES[t]
        const res = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: def.name,
            type: t,
            content: def.content,
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

// ---------- Editor dialog ----------

interface EditorState {
  id: string | null // null = creating new
  name: string
  category: string
  content: string
  isActive: boolean
  isDefault: boolean
}

const EMPTY_EDITOR: EditorState = {
  id: null,
  name: '',
  category: '',
  content: '{\n  \n}',
  isActive: true,
  isDefault: false,
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
  const [jsonError, setJsonError] = React.useState<string | null>(null)

  // Sync form state whenever the dialog opens or the initial value changes.
  React.useEffect(() => {
    if (open) {
      setForm(initial)
      setJsonError(null)
    }
  }, [open, initial])

  const isEditing = form.id !== null

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Validate JSON content (must be parseable).
      let contentStr = form.content
      try {
        // Re-stringify to normalise — store a compact-but-valid JSON.
        const parsed = JSON.parse(form.content)
        contentStr = JSON.stringify(parsed)
      } catch {
        throw new Error('เนื้อหา (content) ต้องเป็น JSON ที่ถูกต้อง')
      }

      const payload = {
        name: form.name,
        type, // type is fixed by the selected card
        category: form.category.trim() || null,
        content: contentStr,
        isActive: form.isActive,
        isDefault: form.isDefault,
      }

      if (isEditing && form.id) {
        const res = await fetch(`/api/templates/${form.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? 'บันทึกไม่สำเร็จ')
        }
        return res.json()
      } else {
        const res = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error ?? 'สร้างไม่สำเร็จ')
        }
        return res.json()
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success(isEditing ? 'บันทึกเทมเพลตเรียบร้อย' : 'สร้างเทมเพลตเรียบร้อย')
      onOpenChange(false)
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ')
    },
  })

  // Live JSON validation as the user types.
  React.useEffect(() => {
    if (!open) return
    try {
      JSON.parse(form.content)
      setJsonError(null)
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'JSON ไม่ถูกต้อง')
    }
  }, [form.content, open])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error('กรุณาระบุชื่อเทมเพลต')
      return
    }
    saveMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'แก้ไขเทมเพลต' : 'สร้างเทมเพลตใหม่'}
          </DialogTitle>
          <DialogDescription>
            ประเภท:{' '}
            <span className="font-medium text-foreground">
              {TEMPLATE_TYPE_META.find((m) => m.value === type)?.label ?? type}
            </span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* name */}
          <div className="space-y-2">
            <Label htmlFor="tpl-name">
              ชื่อเทมเพลต <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tpl-name"
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="เช่น สติกเกอร์อุปกรณ์ IT"
              autoFocus
            />
          </div>

          {/* category */}
          <div className="space-y-2">
            <Label htmlFor="tpl-category">หมวดหมู่ (ไม่บังคับ)</Label>
            <Input
              id="tpl-category"
              value={form.category}
              onChange={(e) =>
                setForm((s) => ({ ...s, category: e.target.value }))
              }
              placeholder="เช่น asset, meter, location"
            />
          </div>

          {/* content (JSON) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tpl-content">
                เนื้อหา (JSON) <span className="text-destructive">*</span>
              </Label>
              <span
                className={
                  jsonError
                    ? 'text-xs font-medium text-rose-600 dark:text-rose-400'
                    : 'text-xs font-medium text-emerald-600 dark:text-emerald-400'
                }
              >
                {jsonError ? '⚠ JSON ไม่ถูกต้อง' : '✓ JSON ถูกต้อง'}
              </span>
            </div>
            <Textarea
              id="tpl-content"
              value={form.content}
              onChange={(e) =>
                setForm((s) => ({ ...s, content: e.target.value }))
              }
              className="min-h-[240px] font-mono text-xs"
              spellCheck={false}
            />
            {jsonError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {jsonError}
              </p>
            )}
          </div>

          {/* toggles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="tpl-active" className="cursor-pointer">
                  ใช้งาน
                </Label>
                <p className="text-xs text-muted-foreground">
                  ปิดชั่วคราวเพื่อซ่อนจากรายการที่ใช้ได้
                </p>
              </div>
              <Switch
                id="tpl-active"
                checked={form.isActive}
                onCheckedChange={(v) =>
                  setForm((s) => ({ ...s, isActive: v }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="tpl-default" className="cursor-pointer">
                  ตั้งเป็นค่าเริ่มต้น
                </Label>
                <p className="text-xs text-muted-foreground">
                  ใช้เป็นเทมเพลตหลักของประเภทนี้
                </p>
              </div>
              <Switch
                id="tpl-default"
                checked={form.isDefault}
                onCheckedChange={(v) =>
                  setForm((s) => ({ ...s, isDefault: v }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              ยกเลิก
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  กำลังบันทึก…
                </>
              ) : (
                'บันทึก'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Main page ----------

export function TemplatesPage() {
  const queryClient = useQueryClient()
  const [selectedType, setSelectedType] =
    React.useState<TemplateType>('sticker')
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editorInitial, setEditorInitial] =
    React.useState<EditorState>(EMPTY_EDITOR)
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
      ...EMPTY_EDITOR,
      content: DEFAULT_TEMPLATES[selectedType].content,
    })
    setEditorOpen(true)
  }

  function openEdit(tpl: DocumentTemplate) {
    setEditorInitial({
      id: tpl.id,
      name: tpl.name,
      category: tpl.category ?? '',
      content: prettyJson(tpl.content),
      isActive: tpl.isActive,
      isDefault: tpl.isDefault,
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
          สร้างและจัดการเทมเพลต — แยกตามประเภทงาน
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

      {/* Editor dialog */}
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
