'use client'

/**
 * combobox.tsx — reusable searchable combobox.
 *
 * Pattern: Popover + Command, supports BOTH selecting from a list AND typing
 * free-form text (the value is just a string — the parent owns it). Useful
 * for fields backed by MasterItem, AppSetting, or any list of suggestions
 * where the user should also be able to type a brand-new value.
 *
 * Usage:
 *   <Combobox
 *     items={[{ value: 'HP', label: 'Hewlett Packard' }]}
 *     value={form.brand}
 *     onChange={(v) => setForm({ ...form, brand: v })}
 *     placeholder="เลือกหรือพิมพ์..."
 *   />
 *
 * Optional props:
 *   - icon:       small lucide icon rendered left of the input (e.g. ScanLine)
 *   - groupLabel: render a sticky group header above the options
 *   - emptyText:  text shown when no options match (default "ไม่พบรายการ")
 *   - inputId:    id for the underlying input (used for barcode focus chaining)
 *   - inputRef:   ref forwarded to the underlying input
 *   - autoFocus:  focus the input on mount
 *   - onKeyDown:  extra keydown handler (Enter is NOT swallowed by default
 *                 when the popover is closed — the parent can use it to move
 *                 focus to the next field via document.getElementById)
 */

import * as React from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

export interface ComboboxItem {
  value: string
  label: string
}

export interface ComboboxProps {
  items: ComboboxItem[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
  emptyText?: string
  groupLabel?: string
  icon?: React.ReactNode
  inputId?: string
  inputRef?: React.Ref<HTMLInputElement>
  autoFocus?: boolean
  disabled?: boolean
  className?: string
  /** When true (default), the popover opens on input focus. */
  openOnFocus?: boolean
  /** Pass-through for special key handling (e.g. Enter → next field). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export function Combobox({
  items,
  value,
  onChange,
  placeholder = 'เลือกหรือพิมพ์...',
  emptyText = 'ไม่พบรายการ',
  groupLabel,
  icon,
  inputId,
  inputRef,
  autoFocus,
  disabled,
  className,
  openOnFocus = true,
  onKeyDown,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const internalRef = React.useRef<HTMLInputElement>(null)
  const ref = inputRef ?? internalRef

  // Items filtered by the user's typed query — case-insensitive substring
  // match on either the label or the value. Falls back to the full list when
  // the query is empty so the dropdown always shows something useful.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.value.toLowerCase().includes(q),
    )
  }, [items, query])

  // Keep the input query in sync with the controlled value so typing in the
  // input both filters the dropdown AND updates the parent's form state.
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    onChange(v)
  }

  function handleFocus() {
    if (openOnFocus && items.length > 0) setOpen(true)
  }

  function handleBlur() {
    // Delay close so click on a CommandItem has time to fire first.
    setTimeout(() => setOpen(false), 150)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    // Only forward Enter when the popover is closed (so the parent can move
    // focus to the next field for barcode workflows). When the popover is
    // open, Command handles arrow/Enter internally.
    if (e.key === 'Enter' && !open) {
      onKeyDown?.(e)
    }
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            {icon && (
              <span className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-slate-400">
                {icon}
              </span>
            )}
            <Input
              id={inputId}
              ref={ref}
              type="text"
              role="combobox"
              aria-expanded={open}
              value={value}
              onChange={handleInputChange}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              autoFocus={autoFocus}
              className={`${icon ? 'pl-8' : ''} pr-8 dark:bg-slate-800 dark:border-slate-700`}
              autoComplete="off"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setOpen((o) => !o)}
              aria-label="เปิดรายการ"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0 dark:border-slate-700 dark:bg-slate-900"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <div className="flex items-center border-b px-3 dark:border-slate-700">
              <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="ค้นหา..."
                className="h-8"
              />
            </div>
            <CommandList className="itam-scroll max-h-60">
              <CommandEmpty>{emptyText}</CommandEmpty>
              {groupLabel ? (
                <CommandGroup heading={groupLabel}>
                  {filtered.map((it) => (
                    <CommandItem
                      key={it.value}
                      value={it.value}
                      onSelect={() => {
                        onChange(it.value)
                        setQuery('')
                        setOpen(false)
                      }}
                      className="hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Check
                        className={`mr-2 h-3.5 w-3.5 ${
                          value === it.value ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <span className="flex-1 truncate text-sm">{it.label}</span>
                      {it.value !== it.label && (
                        <span className="ml-2 font-mono text-[10px] text-slate-400">
                          {it.value}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : (
                <CommandGroup>
                  {filtered.map((it) => (
                    <CommandItem
                      key={it.value}
                      value={it.value}
                      onSelect={() => {
                        onChange(it.value)
                        setQuery('')
                        setOpen(false)
                      }}
                      className="hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Check
                        className={`mr-2 h-3.5 w-3.5 ${
                          value === it.value ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                      <span className="flex-1 truncate text-sm">{it.label}</span>
                      {it.value !== it.label && (
                        <span className="ml-2 font-mono text-[10px] text-slate-400">
                          {it.value}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
