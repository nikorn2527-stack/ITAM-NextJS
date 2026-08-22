// Temporary fix endpoint — updates admin allowedSites to ALL
// DELETE after use
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const updated = await db.user.updateMany({
      where: { 
        OR: [
          { username: 'admin' },
          { username: 'superadmin' },
          { email: 'admin@itam.local' },
          { email: 'superadmin@itam.local' },
        ]
      },
      data: { allowedSites: 'ALL' },
    })
    return NextResponse.json({ 
      ok: true, 
      updated: updated.count,
      message: 'admin + superadmin allowedSites set to ALL' 
    })
  } catch (err) {
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : 'Failed' 
    }, { status: 500 })
  }
}
