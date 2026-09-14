/**
 * server-i18n.ts — Server-side i18n helpers.
 *
 * I18N-04: server-side render routes (report, template, print) need to
 * respect the user's language choice. The client-side Zustand store
 * (`useI18nStore`) is not available on the server, so these helpers
 * read the language from:
 *   1. `?lang=th|en` query parameter (explicit, highest priority)
 *   2. `itam-lang` cookie (set by the client store via localStorage sync)
 *   3. `Accept-Language` header (browser default)
 *   4. Fallback: 'th' (app default)
 *
 * Usage in a route handler:
 *   import { getServerLang, serverTranslate, serverFormatDate } from '@/lib/server-i18n'
 *   const lang = getServerLang(req)
 *   const title = serverTranslate('reports.title', lang)
 *   const dateStr = serverFormatDate(wo.createdAt, lang)
 */

import type { NextRequest } from 'next/server'
import { translate, type Lang, GLOSSARY } from '@/lib/i18n'

/**
 * Resolve the user's preferred language from a server-side request.
 *
 * Priority:
 *   1. `?lang=th|en` query param (explicit override)
 *   2. `itam-lang` cookie (synced from client Zustand store)
 *      Format: `{"state":{"lang":"en"},"version":0}` (zustand/persist JSON)
 *   3. `Accept-Language` header (th-TH → th, en-* → en)
 *   4. Default: 'th'
 */
export function getServerLang(req: NextRequest | Request): Lang {
  const url = new URL(req.url)

  // 1. Explicit ?lang= param
  const queryLang = url.searchParams.get('lang')
  if (queryLang === 'th' || queryLang === 'en') return queryLang

  // 2. Cookie (zustand persist format)
  const cookieHeader = req.headers.get('cookie') || ''
  const cookieMatch = cookieHeader.match(/itam-lang=([^;]+)/)
  if (cookieMatch) {
    try {
      const decoded = decodeURIComponent(cookieMatch[1])
      const parsed = JSON.parse(decoded) as { state?: { lang?: Lang } }
      if (parsed.state?.lang === 'th' || parsed.state?.lang === 'en') {
        return parsed.state.lang
      }
    } catch {
      // Cookie may be stale or malformed — fall through to Accept-Language
    }
  }

  // 3. Accept-Language header
  const acceptLang = req.headers.get('accept-language') || ''
  if (acceptLang.toLowerCase().startsWith('en')) return 'en'
  if (acceptLang.toLowerCase().startsWith('th')) return 'th'

  // 4. Default
  return 'th'
}

/**
 * Server-side translate — same as client translate() but uses a lang
 * resolved from the request (not the Zustand store).
 */
export function serverTranslate(key: string, lang: Lang): string {
  return translate(key, lang)
}

/**
 * Server-side date formatter — locale-aware (th-TH Buddhist / en-GB Gregorian).
 */
export function serverFormatDate(iso: string | Date, lang: Lang = 'th'): string {
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso
    if (isNaN(d.getTime())) return String(iso)
    const locale = lang === 'th' ? 'th-TH' : 'en-GB'
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...(lang === 'th' ? { calendar: 'buddhist' } : {}),
    }).format(d)
  } catch {
    return String(iso)
  }
}

/**
 * Server-side date+time formatter.
 */
export function serverFormatDateTime(iso: string | Date, lang: Lang = 'th'): string {
  try {
    const d = typeof iso === 'string' ? new Date(iso) : iso
    if (isNaN(d.getTime())) return String(iso)
    const locale = lang === 'th' ? 'th-TH' : 'en-GB'
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(lang === 'th' ? { calendar: 'buddhist' } : {}),
    }).format(d)
  } catch {
    return String(iso)
  }
}

/**
 * Server-side number formatter.
 */
export function serverFormatNumber(value: number, lang: Lang = 'th', options?: Intl.NumberFormatOptions): string {
  try {
    const locale = lang === 'th' ? 'th-TH' : 'en-GB'
    return new Intl.NumberFormat(locale, options).format(value)
  } catch {
    return String(value)
  }
}

/**
 * Server-side currency formatter (THB default).
 */
export function serverFormatCurrency(value: number, lang: Lang = 'th', currency = 'THB'): string {
  try {
    const locale = lang === 'th' ? 'th-TH' : 'en-GB'
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return String(value)
  }
}

/**
 * Get the full dictionary for a lang — useful for server-side report
 * generators that need to look up many keys (avoids repeated calls).
 */
export function getServerGlossary(lang: Lang): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(GLOSSARY)) {
    result[key] = entry[lang] ?? entry.th ?? key
  }
  return result
}
