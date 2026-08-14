import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/stock-items/pending
 * List all pending stock-out requests (approvalStatus='PENDING').
 *
 * Query params:
 *   status=PENDING|APPROVED|REJECTED|all   (default PENDING)
 *   workOrderNo=WO-...                      (filter by linked WO)
 *   search=...                              (search product code/name/txn number)
 *   pageSize=...                            (default 100, max 500)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')?.trim() ?? 'PENDING'
    const workOrderNo = searchParams.get('workOrderNo')?.trim() ?? ''
    const search = searchParams.get('search')?.trim() ?? ''
    const pageSize = Math.min(
      500,
      Math.max(1, Number(searchParams.get('pageSize') ?? '100') || 100),
    )

    const where: Record<string, unknown> = {}
    if (status !== 'all') {
      where.approvalStatus = status
    } else {
      // For 'all' include only approval-related rows (skip legacy null rows)
      where.approvalStatus = { not: null }
    }
    if (workOrderNo) {
      where.workOrderNo = workOrderNo
    }
    if (search) {
      where.OR = [
        { txnNumber: { contains: search } },
        { productCode: { contains: search } },
        { productName: { contains: search } },
        { reason: { contains: search } },
        { workOrderNo: { contains: search } },
      ]
    }

    const [items, total] = await Promise.all([
      db.stockTransaction.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: pageSize,
        include: {
          stockItem: {
            select: {
              productCode: true,
              productName: true,
              unit: true,
              quantity: true,
              active: true,
            },
          },
        },
      }),
      db.stockTransaction.count({ where }),
    ])

    return NextResponse.json({
      data: items,
      pagination: {
        page: 1,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    })
  } catch (err) {
    console.error('GET /api/stock-items/pending', err)
    return NextResponse.json(
      { error: 'Failed to fetch pending requests' },
      { status: 500 },
    )
  }
}
