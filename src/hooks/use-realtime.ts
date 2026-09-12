'use client'

/**
 * use-realtime.ts — Hook for connecting to the SSE realtime endpoint.
 *
 * Connects to /api/realtime/sse (Server-Sent Events via Next.js API route).
 * Falls back gracefully if connection fails: returns null kpi and isConnected=false,
 * app still works via existing polling.
 */
import { useEffect, useState, useRef, useCallback } from 'react'

export interface RealtimeKpi {
  devices: number
  workOrders: number
  pendingWO: number
  lowStock: number
  warrantyExpiring: number
  recentActivities: Array<{
    action: string
    entity: string
    summary: string
    actor: string
    createdAt: number
  }>
}

export interface RealtimeEvent {
  count: number
  delta: number
}

export interface RealtimeState {
  kpi: RealtimeKpi | null
  lastUpdate: number | null
  isConnected: boolean
  lastDeviceCreated: RealtimeEvent | null
  lastWorkOrderCreated: RealtimeEvent | null
  lastMeterRecorded: RealtimeEvent | null
}

export function useRealtime(): RealtimeState {
  const [kpi, setKpi] = useState<RealtimeKpi | null>(null)
  const [lastUpdate, setLastUpdate] = useState<number | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [lastDeviceCreated, setLastDeviceCreated] = useState<RealtimeEvent | null>(null)
  const [lastWorkOrderCreated, setLastWorkOrderCreated] = useState<RealtimeEvent | null>(null)
  const [lastMeterRecorded, setLastMeterRecorded] = useState<RealtimeEvent | null>(null)
  const prevCountsRef = useRef<{ devices: number; workOrders: number; meterReadings: number }>({ devices: 0, workOrders: 0, meterReadings: 0 })
  const esRef = useRef<EventSource | null>(null)

  const handleKpi = useCallback((data: RealtimeKpi) => {
    setKpi(data)
    setLastUpdate(Date.now())

    // Detect changes by comparing with previous counts
    const prev = prevCountsRef.current
    if (data.devices > prev.devices) {
      setLastDeviceCreated({ count: data.devices, delta: data.devices - prev.devices })
    }
    if (data.workOrders > prev.workOrders) {
      setLastWorkOrderCreated({ count: data.workOrders, delta: data.workOrders - prev.workOrders })
    }
    // meterReadings not in KPI, but we can infer from recentActivities
    prevCountsRef.current = { devices: data.devices, workOrders: data.workOrders, meterReadings: prev.meterReadings }
  }, [])

  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      try {
        const es = new EventSource('/api/realtime/sse')
        esRef.current = es

        es.onopen = () => {
          setIsConnected(true)
          console.log('[realtime] SSE connected')
        }

        es.addEventListener('kpi', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data) as RealtimeKpi
            handleKpi(data)
          } catch (err) {
            console.warn('[realtime] parse error:', err)
          }
        })

        es.onerror = () => {
          setIsConnected(false)
          console.warn('[realtime] SSE error — will retry in 5s')
          es.close()
          // Auto-retry after 5 seconds
          retryTimer = setTimeout(connect, 5000)
        }
      } catch (err) {
        console.warn('[realtime] EventSource init failed:', err)
        setIsConnected(false)
        retryTimer = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      if (retryTimer) clearTimeout(retryTimer)
      if (esRef.current) {
        esRef.current.close()
        esRef.current = null
      }
    }
  }, [handleKpi])

  return { kpi, lastUpdate, isConnected, lastDeviceCreated, lastWorkOrderCreated, lastMeterRecorded }
}
