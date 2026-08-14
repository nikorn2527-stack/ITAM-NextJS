import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { isTemplateType } from '@/lib/templates'

/** Normalise an optional string field → string | null. */
function optStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/**
 * GET /api/templates/[id]
 * Returns: { template: {...} }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const template = await db.documentTemplate.findUnique({ where: { id } })
    if (!template) {
      return NextResponse.json({ error: 'ไม่พบเทมเพลต' }, { status: 404 })
    }
    return NextResponse.json({ template })
  } catch (err) {
    console.error('GET /api/templates/[id]', err)
    return NextResponse.json(
      { error: 'Failed to fetch template' },
      { status: 500 },
    )
  }
}

/**
 * PUT /api/templates/[id]
 * Body: partial { name?, type?, category?, content?, isActive?, isDefault? }
 * Returns: { template: {...} }
 *
 * If isDefault=true, clear other defaults for the same type (excluding this one).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()

    const before = await db.documentTemplate.findUnique({ where: { id } })
    if (!before) {
      return NextResponse.json({ error: 'ไม่พบเทมเพลต' }, { status: 404 })
    }

    // ── Validate type if provided ──
    if (body.type !== undefined && !isTemplateType(body.type)) {
      return NextResponse.json(
        { error: 'ประเภทเทมเพลตไม่ถูกต้อง (type)' },
        { status: 400 },
      )
    }
    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json(
        { error: 'ชื่อเทมเพลตต้องไม่ว่าง' },
        { status: 400 },
      )
    }

    // Determine the effective type (for default-clearing logic)
    const effectiveType = body.type ?? before.type
    const willBeDefault = body.isDefault === true

    // ── If setting as default, clear other defaults for the same type ──
    if (willBeDefault) {
      await db.documentTemplate.updateMany({
        where: {
          type: effectiveType,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      })
    }

    // content: accept string or object (object → JSON.stringify)
    let contentUpdate: string | undefined
    if (body.content !== undefined) {
      contentUpdate =
        typeof body.content === 'string'
          ? body.content
          : JSON.stringify(body.content)
    }

    const updated = await db.documentTemplate.update({
      where: { id },
      data: {
        name: body.name !== undefined ? String(body.name).trim() : undefined,
        type: body.type !== undefined ? body.type : undefined,
        category: body.category !== undefined ? optStr(body.category) : undefined,
        content: contentUpdate,
        isActive:
          body.isActive !== undefined ? Boolean(body.isActive) : undefined,
        isDefault:
          body.isDefault !== undefined ? Boolean(body.isDefault) : undefined,
      },
    })

    // ── Audit log of changed fields ──
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const k of [
      'name',
      'type',
      'category',
      'isActive',
      'isDefault',
    ] as const) {
      if (body[k] !== undefined) {
        const from = before[k] as unknown
        const to = updated[k] as unknown
        if (String(from ?? '') !== String(to ?? '')) {
          changes[k] = { from, to }
        }
      }
    }
    if (body.content !== undefined) {
      changes.content = { from: '(เนื้อหาเดิม)', to: '(เนื้อหาใหม่)' }
    }
    await logAudit(
      'UPDATE',
      'DocumentTemplate',
      id,
      `แก้ไขเทมเพลต "${updated.name}" (${updated.type})`,
      { changes },
    )

    return NextResponse.json({ template: updated })
  } catch (err) {
    console.error('PUT /api/templates/[id]', err)
    const message =
      err instanceof Error ? err.message : 'Failed to update template'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/templates/[id]
 * Blocks deletion when the template is marked isDefault (so the system
 * always retains at least the default per type).
 * Returns: { success: true, id }
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const template = await db.documentTemplate.findUnique({ where: { id } })
    if (!template) {
      return NextResponse.json({ error: 'ไม่พบเทมเพลต' }, { status: 404 })
    }
    if (template.isDefault) {
      return NextResponse.json(
        {
          error:
            'ไม่สามารถลบเทมเพลตเริ่มต้นได้ — กรุณายกเลิกการตั้งเป็นค่าเริ่มต้นก่อน หรือตั้งเทมเพลตอื่นเป็นค่าเริ่มต้นแทน',
        },
        { status: 400 },
      )
    }

    await db.documentTemplate.delete({ where: { id } })

    await logAudit(
      'DELETE',
      'DocumentTemplate',
      id,
      `ลบเทมเพลต "${template.name}" (${template.type})`,
      { type: template.type, name: template.name },
    )

    return NextResponse.json({ success: true, id })
  } catch (err) {
    console.error('DELETE /api/templates/[id]', err)
    const message =
      err instanceof Error ? err.message : 'Failed to delete template'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
