import { useCallback, useEffect, useRef, useState } from 'react'

const TICK_MS = 80
const CREEP_STEP = 0.45
const CATCH_UP_FACTOR = 0.22

/**
 * Smooths coarse export milestones into a continuously moving bar. Real callbacks
 * set a monotonic target; the ticker creeps toward it and slightly ahead while
 * heavy synchronous work (e.g. svg2pdf) blocks the main thread between yields.
 */
export function useDownloadProgressAnimation() {
  const [displayProgress, setDisplayProgress] = useState(0)
  const targetRef = useRef(0)
  const isRunningRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopAnimation = useCallback(() => {
    isRunningRef.current = false
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startAnimation = useCallback(() => {
    stopAnimation()
    targetRef.current = 0
    setDisplayProgress(0)
    isRunningRef.current = true

    intervalRef.current = setInterval(() => {
      setDisplayProgress((current) => {
        if (!isRunningRef.current) return current

        const target = targetRef.current
        if (current >= target) return current

        const step = Math.max(CREEP_STEP, (target - current) * CATCH_UP_FACTOR)
        return Math.min(target, current + step)
      })
    }, TICK_MS)
  }, [stopAnimation])

  const reportProgress = useCallback((percent: number) => {
    const clamped = Math.max(0, Math.min(100, percent))
    if (clamped <= targetRef.current) return

    targetRef.current = clamped
    // Never move the bar backward — prevents 13→15→13 flicker when milestones arrive
    // slower than the smooth creep between yields.
    setDisplayProgress((current) => Math.max(current, clamped))
  }, [])

  const finishProgress = useCallback(() => {
    targetRef.current = 100
    setDisplayProgress(100)
    stopAnimation()
  }, [stopAnimation])

  useEffect(() => () => stopAnimation(), [stopAnimation])

  return {
    displayProgress,
    startAnimation,
    stopAnimation,
    reportProgress,
    finishProgress,
  }
}
