'use client'

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useI18nStore } from '@/store/i18n-store'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  )

  // ── Sync the <html lang="..."> attribute with the i18n store ──
  // This makes native browser UI (date pickers, calendar popups, etc.)
  // follow the app's TH/EN toggle instead of being stuck on the hardcoded
  // lang="th" in layout.tsx.
  const lang = useI18nStore((s) => s.lang)
  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang === 'th' ? 'th' : 'en'
    }
  }, [lang])

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  )
}
