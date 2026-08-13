/**
 * Notification System — ระบบส่งการแจ้งเตือน 3 ช่องทาง
 *
 * ช่องทาง (channel):
 *   - line-oa   → ส่งผ่าน LINE Official Account (Push/Reply)
 *   - telegram  → ส่งผ่าน Telegram Bot
 *   - email     → ส่งผ่าน SMTP/API
 *
 * Template:
 *   เป็นรายการข้อความภาษาไทยสำเร็จรูป สำหรับเหตุการณ์ต่าง ๆ ในระบบ (แจ้งซ่อม,
 *   มอบหมาย, ปิดงาน, คำขอเบิกอะไหล่, สต็อกต่ำ ฯลฯ)
 *
 * การใช้งาน:
 *   import { sendNotification, renderTemplate } from '@/lib/notifications'
 *
 *   await sendNotification({
 *     template: 'wo_created',
 *     channels: ['line-oa', 'telegram'],
 *     data: { woNumber, subject, building, location, reporterName, tel, priority },
 *     lineUserId,
 *   })
 *
 * หมายเหตุ:
 *   - ตอนนี้ระบบจะ log ข้อความแทนการส่งจริง (console.log + AuditLog)
 *     สามารถเปิดการส่งจริงได้ภายหลังโดยตั้งค่า API keys ใน AppSetting
 *   - API keys ที่ต้องใช้ (เก็บในตาราง AppSetting):
 *       line_channel_access_token  → LINE Messaging API token
 *       line_channel_secret        → LINE channel secret (ใช้ตรวจ signature)
 *       line_admin_group_id        → LINE group/room ID สำหรับส่งแจ้งเตือนแอดมิน
 *       telegram_bot_token         → Telegram Bot API token
 *       telegram_chat_id           → Telegram chat ID เริ่มต้น (แอดมิน)
 *       smtp_host / smtp_port / smtp_user / smtp_pass
 *       email_from                 → อีเมลผู้ส่งเริ่มต้น
 */

import { db } from '@/lib/db'

// ============================================================
// Types
// ============================================================

export type NotificationChannel = 'line-oa' | 'telegram' | 'email'

export type NotificationTemplate =
  | 'wo_created' // แจ้งซ่อนใหม่
  | 'wo_assigned' // มอบหมายงาน
  | 'wo_completed' // ปิดงานแล้ว
  | 'wo_cancelled' // ยกเลิกงาน
  | 'wo_message' // ข้อความใหม่ในใบงาน
  | 'parts_requested' // มีคำขอเบิกอะไหล่
  | 'parts_approved' // อนุมัติเบิกอะไหล่แล้ว
  | 'stock_low' // สต็อกต่ำ
  | 'stock_out' // สต็อกหมด
  | 'meter_reminder' // แจ้งเตือนจดมิเตอร์

export interface NotificationData {
  template: NotificationTemplate
  channels: NotificationChannel[]
  /** Context data for template rendering */
  data: Record<string, unknown>
  /** LINE: lineUserId (optional, if known from WorkOrder reporter) */
  lineUserId?: string
  /** Telegram: chatId */
  telegramChatId?: string
  /** Email: address */
  email?: string
  /** Actor (for audit log). Default 'system' */
  actor?: string
  /** Optional entity reference for audit log */
  entityId?: string
  /** Optional entity type for audit log */
  entity?: string
}

export interface RenderedMessage {
  title: string
  body: string
}

// ============================================================
// Settings loader (AppSetting-backed)
// ============================================================

interface NotifySettings {
  lineChannelAccessToken?: string
  lineChannelSecret?: string
  lineAdminGroupId?: string
  telegramBotToken?: string
  telegramChatId?: string
  smtpHost?: string
  smtpPort?: string
  smtpUser?: string
  smtpPass?: string
  emailFrom?: string
  /** Master switch — when false, log only */
  notifyEnabled?: boolean
}

async function loadSettings(): Promise<NotifySettings> {
  try {
    const rows = await db.appSetting.findMany()
    const get = (key: string) =>
      rows.find((r) => r.key === key)?.value || undefined
    return {
      lineChannelAccessToken: get('line_channel_access_token'),
      lineChannelSecret: get('line_channel_secret'),
      lineAdminGroupId: get('line_admin_group_id'),
      telegramBotToken: get('telegram_bot_token'),
      telegramChatId: get('telegram_chat_id'),
      smtpHost: get('smtp_host'),
      smtpPort: get('smtp_port'),
      smtpUser: get('smtp_user'),
      smtpPass: get('smtp_pass'),
      emailFrom: get('email_from'),
      notifyEnabled: get('notify_enabled') !== 'false',
    }
  } catch (err) {
    console.error('[notifications] loadSettings failed:', err)
    return {}
  }
}

// Convenience helpers for common events
export function notifyDeviceAdded(device: {
  assetCode: string; brand?: string | null; model?: string | null; site?: string | null
}, by: string): Promise<void> {
  return sendNotification({
    event: 'deviceAdded',
    title: '➕ เพิ่มอุปกรณ์ใหม่',
    message: `เพิ่ม ${device.assetCode} (${[device.brand, device.model].filter(Boolean).join(' ') || '-'}) สาขา ${device.site || '-'} โดย ${by}`,
    data: { device },
  })
}

export function notifyDeviceUpdated(device: {
  assetCode: string; brand?: string | null; model?: string | null
}, by: string, changes: string[]): Promise<void> {
  return sendNotification({
    event: 'deviceUpdated',
    title: '✏️ แก้ไขอุปกรณ์',
    message: `แก้ไข ${device.assetCode} (${[device.brand, device.model].filter(Boolean).join(' ') || '-'}) โดย ${by} — ${changes.join(', ')}`,
    data: { device, changes },
  })
}

export function notifyTransfer(info: {
  assetCode: string; fromSite?: string | null; toSite: string; by: string
}): Promise<void> {
  return sendNotification({
    event: 'transfer',
    title: '🔄 ย้ายตำแหน่งอุปกรณ์',
    message: `ย้าย ${info.assetCode} จาก ${info.fromSite || '-'} → ${info.toSite} โดย ${info.by}`,
    data: info,
  })
}

export function notifyMeter(info: {
  assetCode: string; pagesBw: number; pagesColor: number; by: string
}): Promise<void> {
  return sendNotification({
    event: 'meter',
    title: '📈 จดมิเตอร์',
    message: `จดมิเตอร์ ${info.assetCode}: BW=${info.pagesBw} สี=${info.pagesColor} โดย ${info.by}`,
    data: info,
  })
}

export function notifyLifecycle(info: {
  assetCode: string; fromStatus?: string | null; toStatus: string; by: string
}): Promise<void> {
  return sendNotification({
    event: 'lifecycle',
    title: '🔁 เปลี่ยนสถานะอุปกรณ์',
    message: `${info.assetCode}: ${info.fromStatus || '-'} → ${info.toStatus} โดย ${info.by}`,
    data: info,
  })
}
