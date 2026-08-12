import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'
import { logAudit } from '@/lib/audit'

const SETTING_KEY = 'contactDirectory'

export interface ContactDirectoryEntry {
  full_name: string
  phone_primary: string
  employee_code: string
  department: string
  active: boolean
  updated_at: string
  note?: string
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

function normalizeEntry(value: unknown): ContactDirectoryEntry | null {
  const row = asRecord(value)
  if (!row) return null

  const fullName = text(row.full_name ?? row.fullName ?? row.name)
  const phone = text(row.phone_primary ?? row.phone ?? row.tel)
  const employeeCode = text(row.employee_code ?? row.employeeCode ?? row.code)
  const department = text(row.department ?? row.dept)
  if (!fullName || !phone) return null

  return {
    full_name: fullName,
    phone_primary: phone,
    employee_code: employeeCode,
    department,
    active: row.active !== false,
    updated_at: text(row.updated_at ?? row.updatedAt) || new Date().toISOString(),
    ...(text(row.note) ? { note: text(row.note) } : {}),
  }
}

function normalizeEntries(value: unknown): ContactDirectoryEntry[] {
  const rows = Array.isArray(value) ? value : []
  const byKey = new Map<string, ContactDirectoryEntry>()
  for (const row of rows) {
    const entry = normalizeEntry(row)
    if (!entry) continue
    const key = `${entry.full_name.toLowerCase()}|${entry.phone_primary}`
    byKey.set(key, entry)
  }
  return [...byKey.values()]
}

async function readEntries(): Promise<ContactDirectoryEntry[]> {
  const setting = await db.appSetting.findUnique({ where: { key: SETTING_KEY } })
  if (!setting?.value) return []
  try {
    return normalizeEntries(JSON.parse(setting.value))
  } catch {
    return []
  }
}

async function saveEntries(entries: ContactDirectoryEntry[]): Promise<void> {
  await db.appSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: JSON.stringify(entries) },
    create: { key: SETTING_KEY, value: JSON.stringify(entries) },
  })
}

export async function GET(req: Request) {
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const entries = await readEntries()
    return NextResponse.json({ entries, total: entries.length })
  } catch (err) {
    console.error('GET /api/settings/contact-directory', err)
    return NextResponse.json({ error: 'ไม่สามารถอ่าน contact directory ได้' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const raw = await req.json()
    const body = asRecord(raw)
    const inputEntries = Array.isArray(raw) ? raw : body?.entries
    if (!Array.isArray(inputEntries)) {
      return NextResponse.json({ error: 'entries ต้องเป็น array' }, { status: 400 })
    }
    const entries = normalizeEntries(inputEntries)

    await saveEntries(entries)
    await logAudit(
      'CONTACT_DIRECTORY_REPLACE',
      'ContactDirectory',
      SETTING_KEY,
      `แทนที่ contact directory จำนวน ${entries.length} รายการ`,
      { count: entries.length },
      auth.user.email,
    )
    return NextResponse.json({ entries, total: entries.length })
  } catch (err) {
    console.error('PUT /api/settings/contact-directory', err)
    return NextResponse.json({ error: 'ไม่สามารถบันทึก contact directory ได้' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const entry = normalizeEntry(await req.json())
    if (!entry) {
      return NextResponse.json({ error: 'ข้อมูล contact ไม่ครบ ต้องมี full_name และ phone' }, { status: 400 })
    }

    const entries = await readEntries()
    const key = `${entry.full_name.toLowerCase()}|${entry.phone_primary}`
    const next = entries.filter(
      (item) => `${item.full_name.toLowerCase()}|${item.phone_primary}` !== key,
    )
    next.push(entry)
    await saveEntries(next)
    await logAudit(
      'CONTACT_DIRECTORY_UPSERT',
      'ContactDirectory',
      key,
      `เพิ่มหรือปรับปรุง contact ${entry.full_name}`,
      { employeeCode: entry.employee_code, department: entry.department },
      auth.user.email,
    )
    return NextResponse.json({ entry, entries: next, total: next.length }, { status: 201 })
  } catch (err) {
    console.error('POST /api/settings/contact-directory', err)
    return NextResponse.json({ error: 'ไม่สามารถบันทึก contact ได้' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAuth(req, 'ADMIN')
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const body = asRecord(await req.json())
    const fullName = text(body?.full_name ?? body?.fullName ?? body?.name).toLowerCase()
    const phone = text(body?.phone_primary ?? body?.phone ?? body?.tel)
    const employeeCode = text(body?.employee_code ?? body?.employeeCode)
    if (!fullName && !phone && !employeeCode) {
      return NextResponse.json({ error: 'ต้องระบุ contact ที่ต้องการปิดใช้งาน' }, { status: 400 })
    }

    const entries = await readEntries()
    let changed = false
    const next = entries.map((entry) => {
      const matches =
        (fullName && entry.full_name.toLowerCase() === fullName && (!phone || entry.phone_primary === phone)) ||
        (employeeCode && entry.employee_code === employeeCode)
      if (!matches || !entry.active) return entry
      changed = true
      return { ...entry, active: false, updated_at: new Date().toISOString() }
    })
    if (!changed) return NextResponse.json({ error: 'ไม่พบ contact ที่ active' }, { status: 404 })

    await saveEntries(next)
    await logAudit(
      'CONTACT_DIRECTORY_DEACTIVATE',
      'ContactDirectory',
      employeeCode || `${fullName}|${phone}`,
      'ปิดใช้งาน contact directory entry',
      { fullName, phone, employeeCode },
      auth.user.email,
    )
    return NextResponse.json({ entries: next, total: next.length })
  } catch (err) {
    console.error('DELETE /api/settings/contact-directory', err)
    return NextResponse.json({ error: 'ไม่สามารถปิดใช้งาน contact ได้' }, { status: 500 })
  }
}
