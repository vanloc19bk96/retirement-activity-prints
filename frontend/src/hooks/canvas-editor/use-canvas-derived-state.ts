import { useEffect, useRef, useState } from 'react'
import type { Canvas } from 'fabric'

type Options = {
  /** Wait this long after the last render before reading; 0 reads once per animation frame. */
  delayMs?: number
}

/**
 * React state derived from a Fabric canvas. Every change the user can see ends in a render, so the
 * value is re-read on `after:render` (coalesced) instead of tracking each kind of edit; it only
 * updates when `isEqual` says the new reading differs.
 */
export function useCanvasDerivedState<T>(
  canvas: Canvas | null,
  read: (canvas: Canvas) => T,
  isEqual: (a: T, b: T) => boolean,
  emptyValue: T,
  options: Options = {},
): T {
  const [value, setValue] = useState<T>(emptyValue)
  const readRef = useRef(read)
  const isEqualRef = useRef(isEqual)
  readRef.current = read
  isEqualRef.current = isEqual
  const delayMs = options.delayMs ?? 0

  useEffect(() => {
    if (!canvas) {
      setValue(emptyValue)
      return
    }

    let frameId = 0
    let timerId: ReturnType<typeof setTimeout> | null = null
    const sync = (): void => {
      frameId = 0
      timerId = null
      const next = readRef.current(canvas)
      setValue((previous) => (isEqualRef.current(previous, next) ? previous : next))
    }
    const schedule = (): void => {
      if (delayMs > 0) {
        if (timerId !== null) clearTimeout(timerId)
        timerId = setTimeout(sync, delayMs)
        return
      }
      if (frameId === 0) frameId = window.requestAnimationFrame(sync)
    }

    sync()
    canvas.on('after:render', schedule)
    return () => {
      canvas.off('after:render', schedule)
      if (frameId !== 0) window.cancelAnimationFrame(frameId)
      if (timerId !== null) clearTimeout(timerId)
    }
    // `emptyValue` is a constant for each caller; re-subscribing on it would only add churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, delayMs])

  return value
}
