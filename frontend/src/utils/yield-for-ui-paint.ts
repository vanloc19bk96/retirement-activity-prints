/**
 * Waits for the browser to paint pending DOM updates. Double rAF ensures layout
 * and paint have run after React commits (e.g. after flushSync).
 *
 * Background tabs pause `requestAnimationFrame` and throttle timers, so awaiting
 * rAF alone would freeze long jobs (download/export). Hidden documents skip rAF;
 * visible documents race rAF against a short watchdog and settle immediately on
 * `visibilitychange` if the tab is hidden mid-wait.
 */
const VISIBLE_TAB_RAF_WATCHDOG_MS = 48

function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden
}

function yieldViaMessageChannel(settle: () => void): void {
  if (typeof MessageChannel === 'function') {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => settle()
    channel.port2.postMessage(null)
    return
  }
  setTimeout(settle, 0)
}

export function yieldForUiPaint(): Promise<void> {
  return new Promise((resolve) => {
    let isSettled = false
    const cleanups: Array<() => void> = []

    const cleanup = (): void => {
      while (cleanups.length > 0) {
        cleanups.pop()?.()
      }
    }

    const settle = (): void => {
      if (isSettled) return
      isSettled = true
      cleanup()
      resolve()
    }

    if (isDocumentHidden()) {
      yieldViaMessageChannel(settle)
      return
    }

    const onVisibilityChange = (): void => {
      if (isDocumentHidden()) settle()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    cleanups.push(() => document.removeEventListener('visibilitychange', onVisibilityChange))

    const watchdogId = setTimeout(settle, VISIBLE_TAB_RAF_WATCHDOG_MS)
    cleanups.push(() => clearTimeout(watchdogId))

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        settle()
      })
    })
  })
}
