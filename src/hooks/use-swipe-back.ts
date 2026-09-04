'use client'

/**
 * use-swipe-back.ts — React hook สำหรับ swipe gesture บนมือถือ
 *
 * ปัดขวา→ซ้าย (จากขอบซ้าย): เทียบเท่าการกดปุ่ม back → onBack()
 * ปัดซ้าย→ขวา (จากขอบขวา): เทียบเท่าการกดปุ่ม forward → onForward()
 *
 * ใช้ touch events (ไม่ใช่ pointer events) เพราะเป็น native mobile gesture
 *
 * Usage:
 *   const ref = useSwipeBack({ onBack: () => goBack() })
 *   <div ref={ref}>...</div>
 *
 *   // หรือ attach to window:
 *   useSwipeBack({ onBack: () => goBack() })  // no ref → attach to window
 */

import * as React from 'react'

interface SwipeOptions {
  onBack?: () => void
  onForward?: () => void
  /** ระยะขั้นต่ำ (px) ที่ต้องปัดเพื่อ trigger — default 50 */
  threshold?: number
  /** ระยะจากขอบซ้าย (px) ที่เริ่มต้น swipe — default 30 (เริ่มจากขอบ) */
  edgeThreshold?: number
  /** ระยะแนวตั้งสูงสุด (px) ที่ยังถือว่าเป็น horizontal swipe — default 80 */
  verticalThreshold?: number
}

export function useSwipeBack(
  options: SwipeOptions,
  ref?: React.RefObject<HTMLElement | null>,
) {
  const {
    onBack,
    onForward,
    threshold = 50,
    edgeThreshold = 30,
    verticalThreshold = 80,
  } = options

  const internalRef = React.useRef<HTMLElement | null>(null)
  const targetRef = ref ?? internalRef

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const target = targetRef?.current ?? window
    if (!target) return

    let startX = 0
    let startY = 0
    let startTime = 0
    let tracking = false

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      startX = touch.clientX
      startY = touch.clientY
      startTime = Date.now()
      // Only track if starts near an edge
      const w = window.innerWidth
      const isLeftEdge = startX <= edgeThreshold
      const isRightEdge = startX >= w - edgeThreshold
      tracking = isLeftEdge || isRightEdge
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      const touch = e.changedTouches[0]
      if (!touch) return
      const dx = touch.clientX - startX
      const dy = Math.abs(touch.clientY - startY)
      const dt = Date.now() - startTime

      // Must be mostly horizontal + within vertical threshold + fast enough
      if (dy > verticalThreshold) return
      if (dt > 600) return // too slow — probably scroll
      if (Math.abs(dx) < threshold) return

      // Swipe right (positive dx) from left edge → back
      if (dx > 0 && startX <= edgeThreshold) {
        onBack?.()
      }
      // Swipe left (negative dx) from right edge → forward
      if (dx < 0 && startX >= window.innerWidth - edgeThreshold) {
        onForward?.()
      }
    }

    target.addEventListener('touchstart', onTouchStart, { passive: true })
    target.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      target.removeEventListener('touchstart', onTouchStart)
      target.removeEventListener('touchend', onTouchEnd)
    }
  }, [onBack, onForward, threshold, edgeThreshold, verticalThreshold, targetRef])

  return internalRef
}
