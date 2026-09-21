import { afterEach, describe, expect, it, vi } from 'vitest'

import { yieldToMainThread } from '@/utils/yield-to-main-thread'

describe('yieldToMainThread', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves via MessageChannel without using scheduler.yield', async () => {
    const schedulerYield = vi.fn(() => new Promise<void>(() => undefined))
    vi.stubGlobal('scheduler', { yield: schedulerYield })

    await yieldToMainThread()

    expect(schedulerYield).not.toHaveBeenCalled()
  })

  it('falls back to setTimeout when MessageChannel is unavailable', async () => {
    vi.stubGlobal('MessageChannel', undefined)
    const setTimeoutSpy = vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(((handler: TimerHandler) => {
        if (typeof handler === 'function') handler()
        return 0
      }) as unknown as typeof setTimeout)

    await yieldToMainThread()

    expect(setTimeoutSpy).toHaveBeenCalled()
    setTimeoutSpy.mockRestore()
  })
})
