'use client'

/**
 * useRealtimeUpdates — SSE subscription hook.
 *
 * Connects to /api/itam/events?token=<jwt> via EventSource. On every event
 * it calls `qc.invalidateQueries({ queryKey: [...] })` so the relevant
 * TanStack Query cache refetches — i.e. the new data appears instantly
 * without the user clicking refresh.
 *
 * Connection lifecycle:
 *   • Open when the user is authenticated.
 *   • Reconnect automatically (EventSource native — backs off 3s).
 *   • Close on unmount or logout.
 *
 * Returns:
 *   • status: 'connecting' | 'open' | 'closed'
 *   • lastEvent: the most recent RealtimeEvent | null
 *   • lastEventAt: epoch ms
 */

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth-store'

export type RealtimeStatus = 'connecting' | 'open' | 'closed'

export interface RealtimeEventPayload {
  type:
    | 'device-added'
    | 'device-updated'
    | 'device-deleted'
    | 'device-transferred'
    | 'meter-written'
    | 'dashboard-changed'
    | 'notification-sent'
    | 'hello'
  assetNo?: string
  site?: string | null
  payload?: Record<string, unknown>
  ts: number
}

interface State {
  status: RealtimeStatus
  lastEvent: RealtimeEventPayload | null
  lastEventAt: number | null
}

const RECONNECT_DELAY_MS = 3000

export function useRealtimeUpdates(): State {
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [state, setState] = React.useState<State>({
    status: 'closed',
    lastEvent: null,
    lastEventAt: null,
  })

  // Ref-use so the onmessage handler always sees the latest token without
  // having to re-create the EventSource on every token change.
  const tokenRef = React.useRef<string | null>(token)
  React.useEffect(() => {
    tokenRef.current = token
  }, [token])

  React.useEffect(() => {
    if (!isAuthenticated || !token) {
      setState((s) => ({ ...s, status: 'closed' }))
      return
    }
    let es: EventSource | null = null
    let closed = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      if (closed) return
      const t = tokenRef.current
      if (!t) return
      setState((s) => ({ ...s, status: 'connecting' }))
      try {
        es = new EventSource(`/api/itam/events?token=${encodeURIComponent(t)}`)
      } catch {
        scheduleReconnect()
        return
      }
      es.onopen = () => {
        if (!closed) setState((s) => ({ ...s, status: 'open' }))
      }
      es.onerror = () => {
        // EventSource auto-reconnects, but if the browser gives up we'll
        // close + try again after a short delay.
        if (closed) return
        setState((s) => ({ ...s, status: 'connecting' }))
        try {
          es?.close()
        } catch {
          /* ignore */
        }
        scheduleReconnect()
      }

      const handle = (e: MessageEvent) => {
        if (closed) return
        let parsed: RealtimeEventPayload | null = null
        try {
          parsed = JSON.parse(e.data) as RealtimeEventPayload
        } catch {
          return
        }
        setState((s) => ({
          status: 'open',
          lastEvent: parsed,
          lastEventAt: Date.now(),
        }))

        // ── Invalidate the right caches based on event type ──────────────
        // Be liberal with invalidation — TanStack Query dedupes concurrent
        // refetches of the same key, and staleTime: 30s in providers.tsx
        // means most redundant invalidations are no-ops anyway.
        const type = parsed?.type
        if (!type) return

        // All device-list views should refresh on any device mutation.
        if (
          type === 'device-added' ||
          type === 'device-updated' ||
          type === 'device-deleted' ||
          type === 'device-transferred'
        ) {
          qc.invalidateQueries({ queryKey: ['itam-devices'] })
          qc.invalidateQueries({ queryKey: ['itam-device'] })
          qc.invalidateQueries({ queryKey: ['itam-dashboard'] })
          qc.invalidateQueries({ queryKey: ['active-cycle'] })
        }
        if (type === 'meter-written') {
          qc.invalidateQueries({ queryKey: ['itam-meter'] })
          qc.invalidateQueries({ queryKey: ['itam-meter-readings'] })
          qc.invalidateQueries({ queryKey: ['unread-meters'] })
          qc.invalidateQueries({ queryKey: ['itam-dashboard'] })
          qc.invalidateQueries({ queryKey: ['paper-analytics'] })
          qc.invalidateQueries({ queryKey: ['itam-paper-analytics'] })
        }
        if (type === 'device-transferred') {
          qc.invalidateQueries({ queryKey: ['location-history'] })
        }
        if (type === 'notification-sent') {
          qc.invalidateQueries({ queryKey: ['notifications'] })
        }
      }

      // EventSource dispatches a named event for each SSE `event:` line;
      // also handle the implicit `message` event as a fallback.
      const eventTypes = [
        'hello',
        'device-added',
        'device-updated',
        'device-deleted',
        'device-transferred',
        'meter-written',
        'dashboard-changed',
        'notification-sent',
      ]
      es.onmessage = handle
      for (const t of eventTypes) {
        es.addEventListener(t, handle as EventListener)
      }
    }

    function scheduleReconnect() {
      if (closed) return
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
    }

    connect()

    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      try {
        es?.close()
      } catch {
        /* ignore */
      }
      es = null
    }
  }, [isAuthenticated, token])

  return state
}

/**
 * Singleton hook — keeps ONE EventSource connection alive for the whole app
 * (mount it once at the AppShell level). Other components can read the
 * status from the internal module state without each opening their own SSE.
 *
 * Implementation: a tiny external store backed by a module-level state
 * updated by a single useRealtimeUpdates() instance.
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

/** Mount once at the app shell — wires useRealtimeUpdates into the store. */
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
