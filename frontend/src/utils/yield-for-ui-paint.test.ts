import { afterEach, describe, expect, it, vi } from 'vitest'

import { yieldForUiPaint } from '@/utils/yield-for-ui-paint'

describe('yieldForUiPaint', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('does not wait for requestAnimationFrame when the document is hidden', async () => {
    vi.stubGlobal('document', { hidden: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const requestAnimationFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)

    await yieldForUiPaint()

    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('resolves via watchdog if requestAnimationFrame never fires', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('document', {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
    vi.stubGlobal('requestAnimationFrame', vi.fn())

    const pending = yieldForUiPaint()
    await vi.advanceTimersByTimeAsync(48)

    await expect(pending).resolves.toBeUndefined()
  })

  it('settles immediately when the tab becomes hidden mid-wait', async () => {
    const listeners = new Map<string, EventListener>()
    const documentStub = {
      hidden: false,
      addEventListener: (type: string, listener: EventListener) => {
        listeners.set(type, listener)
      },
      removeEventListener: (type: string) => {
        listeners.delete(type)
      },
    }
    vi.stubGlobal('document', documentStub)
    vi.stubGlobal('requestAnimationFrame', vi.fn())

    const pending = yieldForUiPaint()
    documentStub.hidden = true
    listeners.get('visibilitychange')?.(new Event('visibilitychange'))

    await expect(pending).resolves.toBeUndefined()
  })
})
