'use client'

/**
 * useRealtimeUpdates — Polling-based update hook (replaces SSE).
 *
 * Previously this connected to /api/itam/events via EventSource (SSE).
 * SSE doesn't work on Vercel Hobby (60s function timeout) so we switched
 * to polling. The hook calls /api/itam/updates?since=<ts> every 60s
 * and invalidates the relevant TanStack Query caches.
 *
 * Returns:
 *   • status: 'polling' | 'closed'
 *   • lastEvent: the most recent RealtimeEvent | null
 *   • lastEventAt: epoch ms
 */

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth-store'

export type RealtimeStatus = 'polling' | 'closed'

export interface RealtimeEventPayload {
  type:
    | 'device-added'
    | 'device-updated'
    | 'device-deleted'
    | 'meter-reading'
    | 'work-order'
    | 'stock'
    | 'cycle'
    | 'audit'
  entity?: string
  id?: string
  ts?: number
}

interface RealtimeState {
  status: RealtimeStatus
  lastEvent: RealtimeEventPayload | null
  lastEventAt: number
}

const POLL_INTERVAL = 60_000 // 60 seconds

export function useRealtimeUpdates() {
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [state, setState] = React.useState<RealtimeState>({
    status: 'closed',
    lastEvent: null,
    lastEventAt: 0,
  })

  React.useEffect(() => {
    if (!isAuthenticated || !token) {
      setState((s) => ({ ...s, status: 'closed' }))
      return
    }

    let closed = false
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let lastTs = Date.now()

    setState((s) => ({ ...s, status: 'polling' }))

    async function poll() {
      if (closed || !token) return

      try {
        const res = await fetch(
          `/api/itam/updates?since=${lastTs}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!res.ok) return
        const data = await res.json()
        const events: RealtimeEventPayload[] = data.events ?? []

        if (events.length > 0) {
          const latest = events[events.length - 1]
          lastTs = latest.ts ?? Date.now()
          setState((s) => ({
            ...s,
            lastEvent: latest,
            lastEventAt: Date.now(),
          }))

          // Invalidate caches based on event types
          const types = new Set(events.map((e) => e.type))
          if (types.has('device-added') || types.has('device-updated') || types.has('device-deleted')) {
            qc.invalidateQueries({ queryKey: ['devices'] })
            qc.invalidateQueries({ queryKey: ['dashboard'] })
          }
          if (types.has('meter-reading')) {
            qc.invalidateQueries({ queryKey: ['meter'] })
            qc.invalidateQueries({ queryKey: ['devices'] })
          }
          if (types.has('work-order')) {
            qc.invalidateQueries({ queryKey: ['work-orders'] })
          }
          if (types.has('stock')) {
            qc.invalidateQueries({ queryKey: ['stock-items'] })
          }
          if (types.has('cycle')) {
            qc.invalidateQueries({ queryKey: ['active-cycle'] })
          }
          if (types.has('audit')) {
            qc.invalidateQueries({ queryKey: ['audit'] })
            qc.invalidateQueries({ queryKey: ['notifications'] })
          }
        }
      } catch {
        // Network error — try again next cycle
      }

      if (!closed) {
        pollTimer = setTimeout(poll, POLL_INTERVAL)
      }
    }

    poll()

    return () => {
      closed = true
      if (pollTimer) clearTimeout(pollTimer)
      setState((s) => ({ ...s, status: 'closed' }))
    }
  }, [isAuthenticated, token, qc])

  return state
}

/**
 * Singleton hook — keeps ONE polling loop alive for the whole app
 * (mounted once in `RealtimeProvider` at the AppShell level).
 *
 * Other components (e.g. the Sidebar status indicator) can read the
 * status without each opening their own polling loop.
 *
 * Implementation: a tiny external store backed by module-level state
 * updated by the single `useRealtimeUpdates()` instance inside
 * `RealtimeProvider`.
 */
const statusListeners = new Set<() => void>()
let statusSnapshot: RealtimeStatus = 'closed'

export function useRealtimeStatus(): RealtimeStatus {
  return React.useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb)
      return () => statusListeners.delete(cb)
    },
    () => statusSnapshot,
    () => 'closed' as RealtimeStatus,
  )
}

/**
 * Mount once at the app shell (wrap the authenticated app).
 *
 * Wires the single `useRealtimeUpdates()` polling loop into the
 * module-level external store so every `useRealtimeStatus()` subscriber
 * sees the same status without each running its own fetcher.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { status } = useRealtimeUpdates()
  React.useEffect(() => {
    if (status !== statusSnapshot) {
      statusSnapshot = status
      for (const cb of statusListeners) cb()
    }
  }, [status])
  return <>{children}</>
}
