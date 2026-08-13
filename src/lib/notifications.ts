/**
 * notifications.ts — server-only notification sender.
 *
 * Supports 4 channels (Email / Telegram / LINE Notify / LINE OA) and 5 events:
 *   deviceAdded, deviceUpdated, transfer, lifecycle, meter
 *
 * Settings are read from the `app_settings` table (key → JSON or scalar):
 *   notifyChannels        — JSON: { email, telegram, lineNotify, lineOA } booleans
 *   notifyEvents          — JSON: { deviceAdded, deviceUpdated, transfer, lifecycle, meter } booleans
 *   notifyEmails          — comma-separated email addresses
 *   telegramBotToken      — string
 *   telegramChatId        — string
 *   lineNotifyToken       — string
 *   lineOaChannelAccessToken — string
 *   lineOaToUserId        — string (LINE user ID to push to)
 *
 * The function NEVER throws — all errors are logged. Notification failures
 * must not break user-facing mutations.
 */

import { db } from '@/lib/db'

export type NotifyEvent =
  | 'deviceAdded'
  | 'deviceUpdated'
  | 'transfer'
  | 'lifecycle'
  | 'meter'

export interface NotifyChannelConfig {
  email: boolean
  telegram: boolean
  lineNotify: boolean
  lineOA: boolean
}

export interface NotifyEventConfig {
  deviceAdded: boolean
  deviceUpdated: boolean
  transfer: boolean
  lifecycle: boolean
  meter: boolean
}

export interface NotificationPayload {
  event: NotifyEvent
  title: string
  message: string
  data?: Record<string, unknown>
}

const DEFAULT_CHANNELS: NotifyChannelConfig = {
  email: false,
  telegram: false,
  lineNotify: false,
  lineOA: false,
}

const DEFAULT_EVENTS: NotifyEventConfig = {
  deviceAdded: true,
  deviceUpdated: false,
  transfer: true,
  lifecycle: true,
  meter: false,
}

// ─── Settings accessors ────────────────────────────────────────────────────
async function getSetting(key: string): Promise<string | null> {
  const row = await db.appSetting.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function getNotifyChannels(): Promise<NotifyChannelConfig> {
  const raw = await getSetting('notifyChannels')
  if (!raw) return DEFAULT_CHANNELS
  try {
    const parsed = JSON.parse(raw) as Partial<NotifyChannelConfig>
    return { ...DEFAULT_CHANNELS, ...parsed }
  } catch {
    return DEFAULT_CHANNELS
  }
}

export async function getNotifyEvents(): Promise<NotifyEventConfig> {
  const raw = await getSetting('notifyEvents')
  if (!raw) return DEFAULT_EVENTS
  try {
    const parsed = JSON.parse(raw) as Partial<NotifyEventConfig>
    return { ...DEFAULT_EVENTS, ...parsed }
  } catch {
    return DEFAULT_EVENTS
  }
}

export async function saveNotifyChannels(channels: NotifyChannelConfig): Promise<void> {
  await db.appSetting.upsert({
    where: { key: 'notifyChannels' },
    create: { key: 'notifyChannels', value: JSON.stringify(channels) },
    update: { value: JSON.stringify(channels) },
  })
}

export async function saveNotifyEvents(events: NotifyEventConfig): Promise<void> {
  await db.appSetting.upsert({
    where: { key: 'notifyEvents' },
    create: { key: 'notifyEvents', value: JSON.stringify(events) },
    update: { value: JSON.stringify(events) },
  })
}

// ─── Channel senders ──────────────────────────────────────────────────────

/** Email — best-effort log (no SMTP available in sandbox). */
async function sendEmail(to: string[], subject: string, body: string): Promise<void> {
  if (to.length === 0) return
  // In a real deployment, integrate nodemailer / SendGrid / Mailgun here.
  // For the sandbox, we simply log to the server console.
  console.log(`[notify:email] → ${to.join(', ')}`)
  console.log(`  Subject: ${subject}`)
  console.log(`  Body: ${body}`)
}

/** Telegram — push a message via Bot API. */
async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  if (!token || !chatId) return
  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    console.error(`[notify:telegram] ${res.status}: ${t}`)
  }
}

/** LINE Notify — push a message via the LINE Notify API. */
async function sendLineNotify(token: string, message: string): Promise<void> {
  if (!token) return
  const res = await fetch('https://notify-api.line.me/api/notify', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ message }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    console.error(`[notify:lineNotify] ${res.status}: ${t}`)
  }
}

/** LINE OA — push a message via the LINE Messaging API. */
async function sendLineOA(token: string, toUserId: string, text: string): Promise<void> {
  if (!token || !toUserId) return
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: toUserId,
      messages: [{ type: 'text', text }],
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    console.error(`[notify:lineOA] ${res.status}: ${t}`)
  }
}

// ─── Public entry point ────────────────────────────────────────────────────

/**
 * Dispatch a notification — non-throwing.
 *
 * 1. Reads channel + event config from app_settings
 * 2. If the event is disabled in NotifyEventConfig → no-op
 * 3. For each enabled channel, fetches its credentials and dispatches
 * 4. All errors are logged but never thrown
 */
export async function sendNotification(payload: NotificationPayload): Promise<void> {
  try {
    const [channels, events] = await Promise.all([getNotifyChannels(), getNotifyEvents()])
    if (!events[payload.event]) return
    const subject = payload.title
    const body = payload.message

    if (channels.email) {
      const raw = await getSetting('notifyEmails')
      const emails = (raw ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      await sendEmail(emails, subject, body)
    }
    if (channels.telegram) {
      const [token, chatId] = await Promise.all([
        getSetting('telegramBotToken'),
        getSetting('telegramChatId'),
      ])
      await sendTelegram(token ?? '', chatId ?? '', `<b>${subject}</b>\n${body}`)
    }
    if (channels.lineNotify) {
      const token = await getSetting('lineNotifyToken')
      await sendLineNotify(token ?? '', `${subject}\n${body}`)
    }
    if (channels.lineOA) {
      const [token, toUserId] = await Promise.all([
        getSetting('lineOaChannelAccessToken'),
        getSetting('lineOaToUserId'),
      ])
      await sendLineOA(token ?? '', toUserId ?? '', `${subject}\n${body}`)
    }
  } catch (err) {
    console.error('[sendNotification] failed:', err)
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
