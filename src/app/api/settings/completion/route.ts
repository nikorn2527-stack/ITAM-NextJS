/**
 * GET /api/settings/completion
 *
 * Returns Settings Completion Checklist items per UX/UI Standards §4.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-middleware'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, 'VIEW_DASHBOARD')
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const user = auth.row
  const canEdit = user.role === 'admin' || user.role === 'superadmin'

  const items: Array<{
    key: string
    category: string
    label: string
    status: 'complete' | 'incomplete' | 'error' | 'not_started' | 'not_required' | 'permission_limited'
    href?: string
    canEdit: boolean
    reason?: string
    requiredFor?: string[]
  }> = []

  // 1. Organization
  try {
    const orgCount = await db.organization.count()
    items.push({
      key: 'organization', category: 'ระบบและองค์กร', label: 'ข้อมูลหน่วยงาน',
      status: orgCount > 0 ? 'complete' : 'not_started',
      href: '/settings?tab=organizations', canEdit,
      reason: orgCount > 0 ? undefined : 'ยังไม่ได้สร้างองค์กร',
      requiredFor: ['multi-org', 'sync'],
    })
  } catch { items.push({ key: 'organization', category: 'ระบบและองค์กร', label: 'ข้อมูลหน่วยงาน', status: 'error', canEdit, reason: 'ตรวจสอบไม่ได้' }) }

  // 2. Sites
  try {
    const siteCount = await db.siteAttribute.count()
    items.push({
      key: 'sites', category: 'ระบบและองค์กร', label: 'ไซต์/สาขา',
      status: siteCount > 0 ? 'complete' : 'incomplete',
      href: '/settings?tab=site-attributes', canEdit,
      reason: siteCount > 0 ? undefined : 'ยังไม่มีสาขา',
      requiredFor: ['devices', 'work-orders'],
    })
  } catch { items.push({ key: 'sites', category: 'ระบบและองค์กร', label: 'ไซต์/สาขา', status: 'error', canEdit, reason: 'ตรวจสอบไม่ได้' }) }

  // 3. Users
  try {
    const userCount = await db.user.count({ where: { active: true } })
    items.push({
      key: 'users', category: 'ผู้ใช้และความปลอดภัย', label: 'ผู้ใช้และสิทธิ์',
      status: userCount > 0 ? 'complete' : 'not_started',
      href: '/settings?tab=users', canEdit,
      reason: userCount > 0 ? undefined : 'ยังไม่มีผู้ใช้',
      requiredFor: ['all'],
    })
  } catch { items.push({ key: 'users', category: 'ผู้ใช้และความปลอดภัย', label: 'ผู้ใช้และสิทธิ์', status: 'error', canEdit, reason: 'ตรวจสอบไม่ได้' }) }

  // 4. Master Data
  try {
    const masterCount = await db.masterItem.count()
    items.push({
      key: 'master-data', category: 'ข้อมูลและการดำเนินงาน', label: 'Master Data',
      status: masterCount > 0 ? 'complete' : 'incomplete',
      href: '/settings?tab=master', canEdit,
      reason: masterCount > 0 ? undefined : 'ยังไม่มีข้อมูลมาตรฐาน',
      requiredFor: ['devices', 'work-orders'],
    })
  } catch { items.push({ key: 'master-data', category: 'ข้อมูลและการดำเนินงาน', label: 'Master Data', status: 'error', canEdit, reason: 'ตรวจสอบไม่ได้' }) }

  // 5. Notifications
  try {
    const notifSettings = await db.appSetting.findFirst({ where: { key: 'notifyemails' } })
    const hasNotif = notifSettings && notifSettings.value
    items.push({
      key: 'notifications', category: 'การแจ้งเตือน', label: 'การแจ้งเตือน',
      status: hasNotif ? 'complete' : 'not_started',
      href: '/settings?tab=notifications', canEdit,
      reason: hasNotif ? undefined : 'ยังไม่ได้ตั้งค่า',
      requiredFor: [],
    })
  } catch { items.push({ key: 'notifications', category: 'การแจ้งเตือน', label: 'การแจ้งเตือน', status: 'not_required', canEdit, reason: 'ไม่จำเป็น' }) }

  // 6. OAuth (optional)
  items.push({ key: 'oauth', category: 'ผู้ใช้และความปลอดภัย', label: 'OAuth/เข้าสู่ระบบภายนอก', status: 'not_required', canEdit, reason: 'ไม่จำเป็น' })

  // 7. Sync
  try {
    const nodeCount = await db.syncNode.count()
    items.push({
      key: 'sync-nodes', category: 'การตรวจสอบ', label: 'Sync Status',
      status: nodeCount > 0 ? 'complete' : 'not_required',
      href: '/settings?tab=sync-test', canEdit,
      reason: nodeCount > 0 ? undefined : 'ไม่ได้ใช้ Offline Sync',
      requiredFor: [],
    })
  } catch { items.push({ key: 'sync-nodes', category: 'การตรวจสอบ', label: 'Sync Status', status: 'not_required', canEdit }) }

  // 8. Number patterns
  try {
    const patternCount = await db.assetNumberPattern.count()
    items.push({
      key: 'number-patterns', category: 'ข้อมูลและการดำเนินงาน', label: 'รูปแบบเลขที่ทรัพย์สิน',
      status: patternCount > 0 ? 'complete' : 'incomplete',
      href: '/settings?tab=number-patterns', canEdit,
      reason: patternCount > 0 ? undefined : 'ยังไม่ได้ตั้งค่า',
      requiredFor: ['devices'],
    })
  } catch { items.push({ key: 'number-patterns', category: 'ข้อมูลและการดำเนินงาน', label: 'รูปแบบเลขที่ทรัพย์สิน', status: 'not_required', canEdit }) }

  return NextResponse.json({ items })
}
