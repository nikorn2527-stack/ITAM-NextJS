import { db } from '@/lib/db'

// ============================================================
// Guest Contact Validation
// Validates a guest reporter's name + phone (and optionally
// employee_code) against the AppSetting 'contactDirectory'.
// Mirrors the behavior of the legacy Services app:
//   - name + phone must both be provided
//   - name (case-insensitive) + phone (digits only) must match
//     a row in contactDirectory
//   - if employee_code is provided, it must also match
//   - inactive rows (active === false) are skipped
// ============================================================

export interface ContactDirectoryEntry {
  full_name: string
  phone_primary?: string
  phone?: string // alias
  employee_code?: string
  employeeCode?: string // alias
  department?: string
  active?: boolean
}

export interface GuestValidationInput {
  name: string
  phone: string
  employeeCode?: string | null
}

export interface GuestValidationResult {
  ok: boolean
  /** matched directory entry (when ok=true) */
  entry?: ContactDirectoryEntry
  /** normalized name pulled from directory (canonical) */
  canonicalName?: string
  /** normalized phone pulled from directory (canonical) */
  canonicalPhone?: string
  /** normalized employee_code pulled from directory */
  canonicalEmployeeCode?: string
  /** department from directory, if present */
  department?: string
  /** human-readable error (Thai) when ok=false */
  error?: string
}

/**
 * Reads the contactDirectory JSON from AppSetting.
 * Returns an empty array on any error (so validation
 * simply fails closed).
 */
export async function loadContactDirectory(): Promise<
  ContactDirectoryEntry[]
> {
  try {
    const row = await db.appSetting.findUnique({
      where: { key: 'contactDirectory' },
    })
    if (!row || !row.value) return []
    let parsed: unknown
    try {
      parsed = JSON.parse(row.value)
    } catch {
      return []
    }
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is ContactDirectoryEntry =>
        !!e && typeof e === 'object' && typeof (e as ContactDirectoryEntry).full_name === 'string',
    )
  } catch (err) {
    console.error('loadContactDirectory failed:', err)
    return []
  }
}

/**
 * Normalizes a phone number to digits only (strips spaces, dashes, +66 → 0).
 */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return ''
  let s = String(input).trim()
  // Convert +66 / 66 prefix to Thai local 0
  if (s.startsWith('+66')) s = '0' + s.slice(3)
  else if (s.startsWith('66') && s.length === 11) s = '0' + s.slice(2)
  // Keep only digits
  return s.replace(/\D+/g, '')
}

/**
 * Normalizes a name for case-insensitive, whitespace-insensitive comparison.
 */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return ''
  return String(input)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * Validates a guest's reported contact info against the contactDirectory.
 *
 * Rules:
 *  - name + phone must both be provided
 *  - name (case-insensitive) + phone (digits only) must match a row
 *  - if employee_code is provided, it must also match
 *  - inactive rows are skipped
 */
export async function validateGuestContact(
  input: GuestValidationInput,
): Promise<GuestValidationResult> {
  const nameRaw = (input.name ?? '').trim()
  const phoneRaw = (input.phone ?? '').trim()
  const codeRaw = (input.employeeCode ?? '').trim()

  if (!nameRaw) {
    return { ok: false, error: 'กรุณาระบุชื่อผู้แจ้ง' }
  }
  if (!phoneRaw) {
    return { ok: false, error: 'กรุณาระบุเบอร์โทรผู้แจ้ง' }
  }

  const dir = await loadContactDirectory()
  if (dir.length === 0) {
    return {
      ok: false,
      error: 'ยังไม่มีข้อมูลผู้ติดต่อในระบบ (contactDirectory) กรุณาติดต่อผู้ดูแล',
    }
  }

  const normName = normalizeName(nameRaw)
  const normPhone = normalizePhone(phoneRaw)

  if (!normPhone) {
    return { ok: false, error: 'เบอร์โทรไม่ถูกต้อง' }
  }

  // Skip inactive rows
  const activeDir = dir.filter((e) => e.active !== false)

  // First pass: match by name + phone
  const candidates = activeDir.filter((e) => {
    const eName = normalizeName(e.full_name)
    const ePhoneRaw = e.phone_primary ?? e.phone ?? ''
    const ePhone = normalizePhone(ePhoneRaw)
    return eName === normName && ePhone === normPhone
  })

  if (candidates.length === 0) {
    return {
      ok: false,
      error: 'ไม่พบชื่อและเบอร์โทรในสมุดผู้ติดต่อ กรุณาตรวจสอบอีกครั้ง',
    }
  }

  // If employee_code provided, narrow to rows where it matches
  let matched: ContactDirectoryEntry | undefined
  if (codeRaw) {
    matched = candidates.find((e) => {
      const eCode = String(e.employee_code ?? e.employeeCode ?? '').trim()
      return eCode && eCode.toLowerCase() === codeRaw.toLowerCase()
    })
    if (!matched) {
      return {
        ok: false,
        error: 'รหัสพนักงานไม่ตรงกับข้อมูลในสมุดผู้ติดต่อ',
      }
    }
  } else {
    matched = candidates[0]
  }

  return {
    ok: true,
    entry: matched,
    canonicalName: matched.full_name?.trim() || nameRaw,
    canonicalPhone:
      normalizePhone(matched.phone_primary ?? matched.phone ?? '') || phoneRaw,
    canonicalEmployeeCode: (matched.employee_code ?? matched.employeeCode ?? '').trim() || null,
    department: matched.department?.trim() || undefined,
  }
}
