import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { logAudit } from '@/lib/audit'

const SUBJECT_KEY = 'subjectOptions'
const RESOLUTION_KEY = 'resolutionOptions'
const PRIORITIES = new Set(['ปกติ', 'ปานกลาง', 'สูง', 'ด่วน'])

type OptionKind = 'subjects' | 'resolutions'
type Option = { group: string; value: string; default_priority?: string }
type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

function kindKey(kind: OptionKind): string {
  return kind === 'subjects' ? SUBJECT_KEY : RESOLUTION_KEY
}

function normalizeOption(value: unknown, kind: OptionKind): Option | null {
  const row = asRecord(value)
  if (!row) return null
  const group = text(row.group ?? row.group_label)
  const optionValue = text(row.value ?? row.option_text ?? row.label)
  if (!group || !optionValue) return null
  if (kind === 'subjects') {
    const priority = text(row.default_priority ?? row.priority) || 'ปกติ'
    return {
      group,
      value: optionValue,
      default_priority: PRIORITIES.has(priority) ? priority : 'ปกติ',
    }
  }
  return { group, value: optionValue }
}

function normalizeOptions(value: unknown, kind: OptionKind): Option[] {
  const rows = Array.isArray(value) ? value : []
  const unique = new Map<string, Option>()
  for (const row of rows) {
    const option = normalizeOption(row, kind)
    if (!option) continue
    unique.set(`${option.group}\u0000${option.value}`, option)
  }
  return [...unique.values()]
}

async function readOptions(kind: OptionKind): Promise<Option[]> {
  const row = await db.appSetting.findUnique({ where: { key: kindKey(kind) } })
  if (!row?.value) return []
  try {
    const parsed = JSON.parse(row.value)
    if (!Array.isArray(parsed)) return []
    return normalizeOptions(parsed, kind)
  } catch {
    return []
  }
}

function parseKind(value: unknown): OptionKind | null {
  return value === 'subjects' || value === 'resolutions' ? value : null
}

export async function GET(req: Request) {
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const kind = parseKind(url.searchParams.get('kind'))
  try {
    const [subjects, resolutions] = await Promise.all([
      readOptions('subjects'),
      readOptions('resolutions'),
    ])
    if (kind) return NextResponse.json({ kind, options: kind === 'subjects' ? subjects : resolutions })
    return NextResponse.json({ subjects, resolutions })
  } catch (err) {
    console.error('GET /api/settings/options/admin', err)
    return NextResponse.json({ error: 'ไม่สามารถอ่านตัวเลือกได้' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = asRecord(await req.json())
    const kind = parseKind(body?.kind)
    const rawOptions = body?.options
    if (!kind || !Array.isArray(rawOptions)) {
      return NextResponse.json({ error: 'ต้องระบุ kind เป็น subjects/resolutions และ options เป็น array' }, { status: 400 })
    }
    const options = normalizeOptions(rawOptions, kind)
    await db.appSetting.upsert({
      where: { key: kindKey(kind) },
      update: { value: JSON.stringify(options) },
      create: { key: kindKey(kind), value: JSON.stringify(options) },
    })
    await logAudit(
      'OPTIONS_REPLACE',
      'AppSetting',
      kindKey(kind),
      `แทนที่ ${kind} จำนวน ${options.length} รายการ`,
      { kind, count: options.length },
      auth.user.email,
    )
    return NextResponse.json({ kind, options, total: options.length })
  } catch (err) {
    console.error('PUT /api/settings/options/admin', err)
    return NextResponse.json({ error: 'ไม่สามารถบันทึกตัวเลือกได้' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = asRecord(await req.json())
    const kind = parseKind(body?.kind)
    const option = normalizeOption(body?.option ?? body, kind ?? 'subjects')
    if (!kind || !option) {
      return NextResponse.json({ error: 'ข้อมูลตัวเลือกไม่ครบหรือ kind ไม่ถูกต้อง' }, { status: 400 })
    }
    const current = await readOptions(kind)
    const key = `${option.group}\u0000${option.value}`
    const next = current.filter((item) => `${item.group}\u0000${item.value}` !== key)
    next.push(option)
    await db.appSetting.upsert({
      where: { key: kindKey(kind) },
      update: { value: JSON.stringify(next) },
      create: { key: kindKey(kind), value: JSON.stringify(next) },
    })
    await logAudit(
      'OPTION_UPSERT',
      'AppSetting',
      `${kind}:${key}`,
      `เพิ่มหรือปรับปรุงตัวเลือก ${option.value}`,
      { kind, group: option.group },
      auth.user.email,
    )
    return NextResponse.json({ kind, option, options: next, total: next.length }, { status: 201 })
  } catch (err) {
    console.error('POST /api/settings/options/admin', err)
    return NextResponse.json({ error: 'ไม่สามารถเพิ่มตัวเลือกได้' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = asRecord(await req.json())
    const kind = parseKind(body?.kind)
    const group = text(body?.group ?? body?.group_label)
    const value = text(body?.value ?? body?.option_text ?? body?.label)
    if (!kind || !group || !value) {
      return NextResponse.json({ error: 'ต้องระบุ kind, group และ value' }, { status: 400 })
    }
    const current = await readOptions(kind)
    const next = current.filter((item) => item.group !== group || item.value !== value)
    if (next.length === current.length) {
      return NextResponse.json({ error: 'ไม่พบตัวเลือกที่ระบุ' }, { status: 404 })
    }
    await db.appSetting.upsert({
      where: { key: kindKey(kind) },
      update: { value: JSON.stringify(next) },
      create: { key: kindKey(kind), value: JSON.stringify(next) },
    })
    await logAudit(
      'OPTION_DELETE',
      'AppSetting',
      `${kind}:${group}:${value}`,
      `ลบตัวเลือก ${value}`,
      { kind, group, value },
      auth.user.email,
    )
    return NextResponse.json({ kind, options: next, total: next.length })
  } catch (err) {
    console.error('DELETE /api/settings/options/admin', err)
    return NextResponse.json({ error: 'ไม่สามารถลบตัวเลือกได้' }, { status: 500 })
  }
}
