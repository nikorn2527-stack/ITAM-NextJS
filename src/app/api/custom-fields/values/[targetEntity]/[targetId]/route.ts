import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

/**
 * GET /api/custom-fields/values/[targetEntity]/[targetId]
 *   Get all custom field values for a target record.
 *
 * PUT /api/custom-fields/values/[targetEntity]/[targetId]
 *   Upsert values (batch): { values: [{ fieldId, value }] }
 *   Each value is validated against the Definition's fieldType + options.
 *   organizationId comes from auth context — never from client.
 */

interface Params {
  params: { targetEntity: string; targetId: string }
}

export async function GET(req: NextRequest, { params }: Params) {
  const { requireAuth } = await import('@/lib/auth-middleware')
  const auth = await requireAuth(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const orgId = auth.user.organizationId
  if (!orgId) {
    return NextResponse.json({ error: 'ผู้ใช้ไม่มี organization scope' }, { status: 400 })
  }

  const values = await db.customFieldValue.findMany({
    where: {
      organizationId: orgId,
      targetEntity: params.targetEntity,
      targetId: params.targetId,
    },
    include: { field: { include: { options: true } } },
  })

  return NextResponse.json({ values })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { requireAuth } = await import('@/lib/auth-middleware')
  const auth = await requireAuth(req, 'DEVICE_EDIT')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const orgId = auth.user.organizationId
  if (!orgId) {
    return NextResponse.json({ error: 'ผู้ใช้ไม่มี organization scope' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({} as any))
  const { values } = body || {}

  if (!Array.isArray(values)) {
    return NextResponse.json({ error: 'values ต้องเป็น array' }, { status: 400 })
  }

  const definitions = await db.customFieldDefinition.findMany({
    where: { organizationId: orgId, targetEntity: params.targetEntity, active: true },
    include: { options: true },
  })
  const defMap = new Map(definitions.map(d => [d.id, d]))

  let upserted = 0
  const errors: string[] = []

  for (const v of values) {
    const { fieldId, value } = v
    const def = defMap.get(fieldId)
    if (!def) {
      errors.push(`fieldId ${fieldId} ไม่อยู่ใน organization หรือ targetEntity นี้`)
      continue
    }

    if (def.required && (value === null || value === undefined || value === '')) {
      errors.push(`field "${def.key}" เป็น required`)
      continue
    }

    let valueJson: string
    let valueText: string | null = null
    let valueNumber: number | null = null
    let valueDate: Date | null = null

    if (value === null || value === undefined || value === '') {
      valueJson = 'null'
    } else {
      switch (def.fieldType) {
        case 'integer': {
          const intVal = parseInt(value)
          if (isNaN(intVal)) { errors.push(`field "${def.key}" ต้องเป็น integer`); continue }
          valueJson = JSON.stringify(intVal); valueNumber = intVal; break
        }
        case 'decimal': {
          const decVal = parseFloat(value)
          if (isNaN(decVal)) { errors.push(`field "${def.key}" ต้องเป็น decimal`); continue }
          valueJson = JSON.stringify(decVal); valueNumber = decVal; break
        }
        case 'boolean': {
          const boolVal = value === true || value === 'true' || value === 1 || value === '1'
          valueJson = JSON.stringify(boolVal); break
        }
        case 'date':
        case 'datetime': {
          const dateVal = new Date(value)
          if (isNaN(dateVal.getTime())) { errors.push(`field "${def.key}" ต้องเป็น date ที่ถูกต้อง`); continue }
          valueJson = JSON.stringify(value); valueDate = dateVal; break
        }
        case 'select': {
          const opt = def.options.find(o => o.value === value)
          if (!opt) { errors.push(`field "${def.key}" value "${value}" ไม่อยู่ใน options`); continue }
          valueJson = JSON.stringify(value); valueText = String(value); break
        }
        case 'multiselect': {
          const arr = Array.isArray(value) ? value : [value]
          let valid = true
          for (const v of arr) {
            if (!def.options.find(o => o.value === v)) {
              errors.push(`field "${def.key}" value "${v}" ไม่อยู่ใน options`); valid = false; break
            }
          }
          if (!valid) continue
          valueJson = JSON.stringify(arr); valueText = arr.join(','); break
        }
        case 'email':
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            errors.push(`field "${def.key}" ต้องเป็น email ที่ถูกต้อง`); continue
          }
          valueJson = JSON.stringify(value); valueText = String(value); break
        case 'url':
          try { new URL(value) } catch { errors.push(`field "${def.key}" ต้องเป็น URL ที่ถูกต้อง`); continue }
          valueJson = JSON.stringify(value); valueText = String(value); break
        default:
          valueJson = JSON.stringify(value); valueText = String(value)
      }
    }

    await db.customFieldValue.upsert({
      where: {
        organizationId_fieldId_targetEntity_targetId: {
          organizationId: orgId,
          fieldId,
          targetEntity: params.targetEntity,
          targetId: params.targetId,
        },
      },
      create: {
        organizationId: orgId,
        fieldId,
        targetEntity: params.targetEntity,
        targetId: params.targetId,
        valueJson,
        valueText,
        valueNumber,
        valueDate,
        updatedBy: auth.row.username ?? auth.user.email,
      },
      update: {
        valueJson,
        valueText,
        valueNumber,
        valueDate,
        updatedBy: auth.row.username ?? auth.user.email,
      },
    })
    upserted++
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: 'Validation failed', errors }, { status: 400 })
  }

  await logAudit(
    'CUSTOM_FIELD_VALUE_UPDATE',
    params.targetEntity,
    params.targetId,
    `อัปเดต ${upserted} custom field values บน ${params.targetEntity} ${params.targetId}`,
    { count: upserted, organizationId: orgId },
    auth.row.username ?? auth.user.email,
  )

  return NextResponse.json({ upserted })
}
