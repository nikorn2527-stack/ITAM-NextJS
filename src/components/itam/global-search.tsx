'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search,
  Package,
  Database,
  Gauge,
  History,
  Building2,
  ArrowRight,
} from 'lucide-react'
import { useAppStore } from '@/store/app-store'
import { useAuthStore } from '@/store/auth-store'
import { useT } from '@/store/i18n-store'
import type { SearchResults } from './types'

const ICON_CLASSES = 'h-4 w-4 shrink-0'

function SearchResultSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <Skeleton className="h-4 w-4 rounded dark:bg-slate-800" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-1/2 dark:bg-slate-800" />
            <Skeleton className="h-2.5 w-2/3 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function GlobalSearch() {
  const {
    searchOpen,
    setSearchOpen,
    setActivePage,
    setPendingDeviceId,
    setPendingSettingsTab,
  } = useAppStore()

  const [q, setQ] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const t = useT()

  // Reset query when palette closes
  React.useEffect(() => {
    if (!searchOpen) {
      const t = setTimeout(() => {
        setQ('')
        setDebounced('')
      }, 200)
      return () => clearTimeout(t)
    }
  }, [searchOpen])

  // Debounce search query
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  // NOTE: the keyboard shortcut (Ctrl+K / Cmd+K) listener lives in the Sidebar
  // component, which calls setSearchOpen(true). Closing is handled by the Dialog
  // itself (Esc key + click-outside) and the close button.

  const { data, isFetching } = useQuery<{ results: SearchResults; total: number }>({
    queryKey: ['global-search', debounced],
    queryFn: async () => {
      if (debounced.length < 2) {
        return { results: { devices: [], master: [], meter: [], audit: [], sites: [] }, total: 0 }
      }
      const res = await fetch(`/api/search?q=${encodeURIComponent(debounced)}`, {
        headers: (() => { const t = useAuthStore.getState()?.token; return t ? { Authorization: `Bearer ${t}` } : {} })(),
      })
      if (!res.ok) throw new Error('Search failed')
      return res.json()
    },
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  })

  const results = data?.results ?? {
    devices: [],
    master: [],
    meter: [],
    audit: [],
    sites: [],
  }
  const total = data?.total ?? 0
  const showLoading = debounced.length >= 2 && isFetching
  const hasQuery = debounced.length >= 2

  function handleSelect(type: string, id: string, deviceId?: string) {
    setSearchOpen(false)
    if (type === 'device') {
      setActivePage('devices')
      // Defer setting the pending device id so the devices page mounts first
      setTimeout(() => setPendingDeviceId(id), 50)
    } else if (type === 'master') {
      setActivePage('settings')
      setPendingSettingsTab('master')
    } else if (type === 'meter') {
      setActivePage('devices')
      if (deviceId) {
        setTimeout(() => setPendingDeviceId(deviceId), 50)
      }
    } else if (type === 'audit') {
      setActivePage('settings')
      setPendingSettingsTab('audit')
    } else if (type === 'site') {
      setActivePage('settings')
      setPendingSettingsTab('sites')
    }
  }

  return (
    <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t('search.title')}</DialogTitle>
          <DialogDescription>{t('search.placeholder')}</DialogDescription>
        </DialogHeader>
        <AnimatePresence>
          <motion.div
            key="search-content"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <Command
              className="bg-white dark:bg-slate-900"
              filter={() => 1} // disable built-in filter; we filter on the server
            >
              <CommandInput
                placeholder={t('search.placeholder')}
                value={q}
                onValueChange={setQ}
                autoFocus
              />
              <CommandList className="itam-scroll max-h-[60vh]">
                {!hasQuery ? (
                  <div className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                    <Search className="mx-auto mb-2 h-6 w-6 text-slate-300 dark:text-slate-600" />
                    พิมพ์เพื่อค้นหา...
                    <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      ค้นหาในอุปกรณ์ · ข้อมูลมาตรฐาน · การจดมิเตอร์ · ประวัติ · สาขา
                    </div>
                  </div>
                ) : showLoading ? (
                  <SearchResultSkeleton />
                ) : total === 0 ? (
                  <CommandEmpty>{t('search.empty')}: &quot;{debounced}&quot;</CommandEmpty>
                ) : (
                  <>
                    {results.devices.length > 0 && (
                      <CommandGroup
                        heading={t('search.group.devices')}
                        className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-slate-400 dark:[&_[cmdk-group-heading]]:text-slate-500"
                      >
                        {results.devices.map((d) => (
                          <CommandItem
                            key={`d-${d.id}`}
                            value={`device ${d.id} ${d.title}`}
                            onSelect={() => handleSelect('device', d.id)}
                            className="hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Package className={`${ICON_CLASSES} text-[#f97316]`} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                {d.title}
                              </div>
                              <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {d.subtitle}
                              </div>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-600" />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}

                    {results.master.length > 0 && (
                      <CommandGroup
                        heading={t('search.group.master')}
                        className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-slate-400 dark:[&_[cmdk-group-heading]]:text-slate-500"
                      >
                        {results.master.map((m) => (
                          <CommandItem
                            key={`m-${m.id}`}
                            value={`master ${m.id} ${m.title}`}
                            onSelect={() => handleSelect('master', m.id)}
                            className="hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Database className={`${ICON_CLASSES} text-[#0d9488]`} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                {m.title}
                              </div>
                              <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {m.subtitle}
                              </div>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-600" />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}

                    {results.meter.length > 0 && (
                      <CommandGroup
                        heading={t('search.group.meter')}
                        className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-slate-400 dark:[&_[cmdk-group-heading]]:text-slate-500"
                      >
                        {results.meter.map((m) => (
                          <CommandItem
                            key={`r-${m.id}`}
                            value={`meter ${m.id} ${m.title}`}
                            onSelect={() => handleSelect('meter', m.id, m.deviceId)}
                            className="hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Gauge className={`${ICON_CLASSES} text-[#f59e0b]`} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                {m.title}
                              </div>
                              <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {m.subtitle}
                              </div>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-600" />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}

                    {results.audit.length > 0 && (
                      <CommandGroup
                        heading={t('search.group.audit')}
                        className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-slate-400 dark:[&_[cmdk-group-heading]]:text-slate-500"
                      >
                        {results.audit.map((a) => (
                          <CommandItem
                            key={`a-${a.id}`}
                            value={`audit ${a.id} ${a.title}`}
                            onSelect={() => handleSelect('audit', a.id)}
                            className="hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <History className={`${ICON_CLASSES} text-slate-500 dark:text-slate-400`} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                {a.title}
                              </div>
                              <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {a.subtitle}
                              </div>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-600" />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}

                    {results.sites.length > 0 && (
                      <CommandGroup
                        heading={t('search.group.sites')}
                        className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-slate-400 dark:[&_[cmdk-group-heading]]:text-slate-500"
                      >
                        {results.sites.map((s) => (
                          <CommandItem
                            key={`s-${s.id}`}
                            value={`site ${s.id} ${s.title}`}
                            onSelect={() => handleSelect('site', s.id)}
                            className="hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Building2 className={`${ICON_CLASSES} text-[#0d9488]`} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                {s.title}
                              </div>
                              <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {s.subtitle}
                              </div>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-600" />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}

                    <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
                      พบ {total} ผลลัพธ์ · กด <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-800">↵</kbd> เพื่อเปิด
                    </div>
                  </>
                )}
              </CommandList>
            </Command>
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
