/**
 * i18n-store.ts — language state for the ITAM app.
 *
 * Zustand store with localStorage persistence so the user's language
 * choice survives refresh.
 *
 * Exports:
 *   - useI18nStore     — store hook (lang, setLang, t)
 *   - useT             — convenience hook returning the bound translate fn
 *   - formatDate       — locale-aware date formatter (พ.ศ./เดือนไทย when TH)
 *   - formatDateTime   — same but with time
 */

'use client'

import * as React from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { translate, type Lang } from '@/lib/i18n'

interface I18nState {
  lang: Lang
  setLang: (lang: Lang) => void
  /** Translate a glossary key using the current language. */
  t: (key: string) => string
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set, get) => ({
      lang: 'th',
      setLang: (lang) => set({ lang }),
      t: (key) => translate(key, get().lang),
    }),
    {
      name: 'itam-lang',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          }
        }
        return localStorage
      }),
      // Only persist the language, not the bound `t` function.
      partialize: (state) => ({ lang: state.lang }),
    },
  ),
)

/**
 * Convenience hook: returns a translate function bound to the current lang.
 * Re-renders the component when `lang` changes (so all strings flip).
 *
 * Usage:
 *   const t = useT()
 *   <button>{t('menu.dashboard')}</button>
 */
export function useT(): (key: string) => string {
  return useI18nStore((s) => s.t)
}

/**
 * Convenience hook for components that need both the lang and the toggle.
 *
 * Usage:
 *   const { lang, setLang } = useLang()
 *   <button onClick={() => setLang('en')}>EN</button>
 */
export function useLang() {
  const lang = useI18nStore((s) => s.lang)
  const setLang = useI18nStore((s) => s.setLang)
  return { lang, setLang }
}

// ── Locale-aware date formatters ─────────────────────────────────
//
// TH = Buddhist Era (พ.ศ.) + Thai short month names (e.g. "ก.ย.")
// EN = Gregorian (ค.ศ.) + English short month names (e.g. "Sept")
//
// Both use 24-hour HH:mm. Both are defensive against bad input.

export function formatDateTime(iso: string, lang: Lang = 'th'): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const intlLocale = lang === 'th' ? 'th-TH' : 'en-GB'
    return new Intl.DateTimeFormat(intlLocale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(lang === 'th' ? { calendar: 'buddhist' } : {}),
    }).format(d)
  } catch {
    return iso
  }
}

export function formatDate(iso: string, lang: Lang = 'th'): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso
    const intlLocale = lang === 'th' ? 'th-TH' : 'en-GB'
    return new Intl.DateTimeFormat(intlLocale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...(lang === 'th' ? { calendar: 'buddhist' } : {}),
    }).format(d)
  } catch {
    return iso
  }
}

/**
 * Hook-bound date formatters — these re-render the component when the
 * language changes. Use in components instead of the bare `formatDate`
 * / `formatDateTime` exports.
 */
export function useFormatDate() {
  const lang = useI18nStore((s) => s.lang)
  return React.useCallback(
    (iso: string) => formatDate(iso, lang),
    [lang],
  )
}

export function useFormatDateTime() {
  const lang = useI18nStore((s) => s.lang)
  return React.useCallback(
    (iso: string) => formatDateTime(iso, lang),
    [lang],
  )
}
