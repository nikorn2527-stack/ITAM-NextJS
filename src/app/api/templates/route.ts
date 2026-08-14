import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'
import { isTemplateType, TEMPLATE_TYPES } from '@/lib/templates'

// Re-export so existing callers can still `import { TEMPLATE_TYPES } from './route'`
export { TEMPLATE_TYPES }

/** Normalise an optional string field → string | null. */
function optStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/**
 * GET /api/templates
 * Optional query: ?type=<templateType> — filter by type
 * Returns: { templates: [...] }
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const typeParam = searchParams.get('type')?.trim() ?? ''

    const where: Record<string, unknown> = {}
    if (typeParam) {
      if (!isTemplateType(typeParam)) {
        return NextResponse.json(
          { error: `ประเภทเทมเพลตไม่ถูกต้อง: ${typeParam}` },
          { status: 400 },
        )
      }
      where.type = typeParam
    }

    const templates = await db.documentTemplate.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json({ templates })
  } catch (err) {
    console.error('GET /api/templates', err)
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/templates
 * Body: { name, type, category?, content, isActive?, isDefault? }
 * Returns: { template: {...} }
 *
 * If isDefault=true, all other templates of the same type are un-set as default
 * (only one default per type).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // ── Validate required fields ──
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json(
        { error: 'กรุณาระบุชื่อเทมเพลต (name)' },
        { status: 400 },
      )
    }
    if (!isTemplateType(body.type)) {
      return NextResponse.json(
        { error: 'ประเภทเทมเพลตไม่ถูกต้อง (type)' },
        { status: 400 },
      )
    }
    if (body.content === undefined || body.content === null) {
      return NextResponse.json(
        { error: 'กรุณาระบุเนื้อหาเทมเพลต (content)' },
        { status: 400 },
      )
    }

    const type = body.type
    const name = String(body.name).trim()
    const category = optStr(body.category)
    // content stored as a JSON string. If an object is passed, stringify it.
    const content =
      typeof body.content === 'string'
        ? body.content
        : JSON.stringify(body.content)
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : true
    const isDefault = body.isDefault === true

    // ── If setting as default, clear other defaults for this type ──
    if (isDefault) {
      await db.documentTemplate.updateMany({
        where: { type, isDefault: true },
        data: { isDefault: false },
      })
    }

    const created = await db.documentTemplate.create({
      data: {
        name,
        type,
        category,
        content,
        isActive,
        isDefault,
      },
    })

    await logAudit(
      'CREATE',
      'DocumentTemplate',
      created.id,
      `สร้างเทมเพลต "${created.name}" (${created.type})`,
      { type: created.type, name: created.name, isDefault: created.isDefault },
    )

    return NextResponse.json({ template: created }, { status: 201 })
  } catch (err) {
    console.error('POST /api/templates', err)
    const message =
      err instanceof Error ? err.message : 'Failed to create template'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
