import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrgProfile, updateOrgProfile } from '@/lib/org-profile'

// GET /api/settings/org-profile — ดึง profile ขององค์กร
export async function GET() {
  try {
    const profile = await getOrgProfile()
    return NextResponse.json({ profile })
  } catch (err) {
    console.error('GET org-profile', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// PUT /api/settings/org-profile — อัปเดต profile
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const profile = await updateOrgProfile(body)
    // Audit log
    await db.auditLog.create({
      data: {
        action: 'UPDATE',
        entity: 'OrgProfile',
        summary: `อัปเดตข้อมูลองค์กร: ${profile.appName}`,
        detail: JSON.stringify(body),
        actor: 'admin',
      },
    })
    return NextResponse.json({ profile })
  } catch (err) {
    console.error('PUT org-profile', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
