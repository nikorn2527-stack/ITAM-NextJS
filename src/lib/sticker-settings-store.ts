/**
 * sticker-settings-store.ts — server-only helpers that read/write the
 * `app_settings` table for sticker templates and sticker print settings.
 *
 * Storage layout (mirror of Apps Script):
 *   stickerTemplates            → JSON array of StickerTemplate objects
 *   activeStickerTemplateId     → string template id
 *   stickerTemplateEnabled      → 'true' / 'false'
 *   stickerCompanyName          → string
 *   stickerHospitalName         → string
 *   stickerFooterNote           → string
 *   stickerHotline              → string
 *   stickerLineOALink           → string
 */

import { db } from '@/lib/db'
import {
  buildDefaultTemplate,
  DEFAULT_STICKER_SETTINGS,
  normalizeTemplate,
  type StickerSettings,
  type StickerTemplate,
} from '@/lib/sticker-template'

export const SETTING_KEYS = {
  templates: 'stickerTemplates',
  activeId: 'activeStickerTemplateId',
  enabled: 'stickerTemplateEnabled',
  companyName: 'stickerCompanyName',
  hospitalName: 'stickerHospitalName',
  footerNote: 'stickerFooterNote',
  hotline: 'stickerHotline',
  lineOA: 'stickerLineOALink',
} as const

// ─── Low-level get/set ────────────────────────────────────────────────────
export async function getSetting(key: string): Promise<string | null> {
  const row = await db.appSetting.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  })
}

// ─── Templates ───────────────────────────────────────────────────────────
export async function getStickerTemplates(): Promise<StickerTemplate[]> {
  const raw = await getSetting(SETTING_KEYS.templates)
  if (!raw) {
    // First run — seed the default template
    const def = buildDefaultTemplate()
    await setSetting(SETTING_KEYS.templates, JSON.stringify([def]))
    await setSetting(SETTING_KEYS.activeId, def.id)
    return [def]
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('not array')
    const templates = parsed.map((t) => normalizeTemplate(t))
    // Always make sure default template exists
    if (!templates.some((t) => t.id === 'tpl-default')) {
      const def = buildDefaultTemplate()
      templates.unshift(def)
      await setSetting(SETTING_KEYS.templates, JSON.stringify(templates))
    }
    return templates
  } catch {
    // Corrupt JSON — reset to default
    const def = buildDefaultTemplate()
    await setSetting(SETTING_KEYS.templates, JSON.stringify([def]))
    await setSetting(SETTING_KEYS.activeId, def.id)
    return [def]
  }
}

export async function saveStickerTemplates(templates: StickerTemplate[]): Promise<void> {
  await setSetting(SETTING_KEYS.templates, JSON.stringify(templates))
}

export async function getActiveTemplateId(): Promise<string | null> {
  return getSetting(SETTING_KEYS.activeId)
}

export async function setActiveTemplateId(id: string): Promise<void> {
  await setSetting(SETTING_KEYS.activeId, id)
}

// ─── Settings (companyName, hotline, etc.) ───────────────────────────────
export async function getStickerSettings(): Promise<StickerSettings> {
  const [companyName, hospitalName, footerNote, hotline, lineOALink] = await Promise.all([
    getSetting(SETTING_KEYS.companyName),
    getSetting(SETTING_KEYS.hospitalName),
    getSetting(SETTING_KEYS.footerNote),
    getSetting(SETTING_KEYS.hotline),
    getSetting(SETTING_KEYS.lineOA),
  ])
  return {
    companyName: companyName ?? DEFAULT_STICKER_SETTINGS.companyName,
    hospitalName: hospitalName ?? DEFAULT_STICKER_SETTINGS.hospitalName,
    footerNote: footerNote ?? DEFAULT_STICKER_SETTINGS.footerNote,
    hotline: hotline ?? DEFAULT_STICKER_SETTINGS.hotline,
    lineOALink: lineOALink ?? DEFAULT_STICKER_SETTINGS.lineOALink,
  }
}

export async function saveStickerSettings(s: StickerSettings): Promise<void> {
  await Promise.all([
    setSetting(SETTING_KEYS.companyName, s.companyName),
    setSetting(SETTING_KEYS.hospitalName, s.hospitalName),
    setSetting(SETTING_KEYS.footerNote, s.footerNote),
    setSetting(SETTING_KEYS.hotline, s.hotline),
    setSetting(SETTING_KEYS.lineOA, s.lineOALink),
  ])
}
