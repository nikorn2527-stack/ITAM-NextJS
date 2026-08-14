// ============================================================
// PATCH /api/work-orders/[id]/print-template
// (Task ID: VISUAL-TEMPLATE-EDITOR, PART 2)
// ============================================================
// Saves the user's "remember this template for this WO" choice.
//
// Body: { printTemplateId: string | null, setAsDefault?: boolean }
//   • printTemplateId — null clears the saved choice
//   • setAsDefault=true — also mark this template as the default
//     for its type (so other WOs use it too)
//
// Returns: { workOrder, template? }
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const printTemplateId =
      typeof body.printTemplateId === 'string' && body.printTemplateId
        ? body.printTemplateId
        : null
    const setAsDefault = body.setAsDefault === true

    const wo = await db.workOrder.findUnique({ where: { id } })
    if (!wo) {
      return NextResponse.json(
        { error: 'ไม่พบใบงาน' },
        { status: 404 },
      )
    }

    // Validate that the template exists (if a non-null id is provided)
    let template = null
    if (printTemplateId) {
      template = await db.documentTemplate.findUnique({
        where: { id: printTemplateId },
      })
      if (!template) {
        return NextResponse.json(
          { error: 'ไม่พบเทมเพลตที่เลือก' },
          { status: 404 },
        )
      }
    }

    const updated = await db.workOrder.update({
      where: { id },
      data: { printTemplateId },
    })

    // Optionally promote template to default for its type
    if (setAsDefault && template) {
      await db.documentTemplate.updateMany({
        where: {
          type: template.type,
          isDefault: true,
          id: { not: template.id },
        },
        data: { isDefault: false },
      })
      await db.documentTemplate.update({
        where: { id: template.id },
        data: { isDefault: true },
      })
    }

    await logAudit(
      'UPDATE',
      'WorkOrder',
      id,
      printTemplateId
        ? `ตั้งเทมเพลตพิมพ์ "${template?.name ?? ''}" สำหรับใบงาน ${wo.woNumber ?? id}`
        : `ล้างการจำเทมเพลตพิมพ์ของใบงาน ${wo.woNumber ?? id}`,
      { printTemplateId, setAsDefault },
    )

    return NextResponse.json({ workOrder: updated, template })
  } catch (err) {
    console.error('PATCH /api/work-orders/[id]/print-template', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'บันทึกเทมเพลตไม่สำเร็จ',
      },
      { status: 500 },
    )
  }
}
