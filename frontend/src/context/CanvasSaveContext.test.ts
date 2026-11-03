/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { SaveCanvasesRequest } from '@/types/canvases.types'
import { CANVAS_LIVE_EVENT } from '@/utils/canvas-events'
import { FABRIC_HISTORY_CHANGED_EVENT } from '@/utils/fabric-canvas-history'

const { saveCanvasesBatch, toast } = vi.hoisted(() => ({
  saveCanvasesBatch: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/api/canvases.api', () => ({ canvasesApi: { saveCanvasesBatch } }))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }))

import { CanvasPayloadUnavailableError, CanvasSaveProvider, useCanvasSave } from './CanvasSaveContext'

const REFRESH_MS = 150
const AUTO_SAVE_MS = 4000
const RETRY_MS = 30000

const PAYLOAD: SaveCanvasesRequest = {
  canvases: [{ page_index: 0, canvas_type: 'interior', canvas_data: { objects: [] } }],
  interior_page_count: 1,
  referenced_supabase_image_public_urls: [],
}

type SaveContext = ReturnType<typeof useCanvasSave>

describe('CanvasSaveProvider auto-save', () => {
  let root: Root
  let saveContext: SaveContext
  let isDirty: boolean
  let getPayload: () => SaveCanvasesRequest
  let afterSave: Mock<(savedPayload: SaveCanvasesRequest) => void>

  const advance = async (ms: number): Promise<void> => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  const notifyEdit = async (): Promise<void> => {
    act(() => {
      window.dispatchEvent(new CustomEvent(CANVAS_LIVE_EVENT))
    })
    await advance(REFRESH_MS)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    saveCanvasesBatch.mockReset()
    saveCanvasesBatch.mockResolvedValue({ project_id: 'p', saved: [] })
    toast.mockReset()
    isDirty = false
    getPayload = () => PAYLOAD
    afterSave = vi.fn<(savedPayload: SaveCanvasesRequest) => void>(() => {
      isDirty = false
    })

    function Capture(): null {
      saveContext = useCanvasSave()
      return null
    }
    root = createRoot(document.createElement('div'))
    act(() => {
      root.render(createElement(CanvasSaveProvider, null, createElement(Capture)))
    })
    act(() => {
      saveContext.registerCanvasesPayloadGetter(() => getPayload())
      saveContext.registerAfterSaveCallback(afterSave)
      saveContext.registerHasUnsavedCheckGetter(() => isDirty)
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
  })

  it('saves quietly a few seconds after a change', async () => {
    isDirty = true
    await notifyEdit()
    expect(saveContext.hasUnsavedChanges).toBe(true)

    await advance(AUTO_SAVE_MS - 1)
    expect(saveCanvasesBatch).not.toHaveBeenCalled()

    await advance(1)
    expect(saveCanvasesBatch).toHaveBeenCalledTimes(1)
    expect(afterSave).toHaveBeenCalledWith(PAYLOAD)
    expect(saveContext.hasUnsavedChanges).toBe(false)
    expect(saveContext.lastSavedAt).not.toBeNull()
    expect(toast).not.toHaveBeenCalled()
  })

  it('does not wait for the user to stop editing', async () => {
    isDirty = true
    await notifyEdit()
    for (let elapsed = 0; elapsed <= AUTO_SAVE_MS; elapsed += REFRESH_MS) {
      await notifyEdit()
    }
    expect(saveCanvasesBatch).toHaveBeenCalledTimes(1)
  })

  it('reacts to an undo step, which is all a toolbar change produces', async () => {
    isDirty = true
    act(() => {
      window.dispatchEvent(new CustomEvent(FABRIC_HISTORY_CHANGED_EVENT))
    })
    await advance(REFRESH_MS + AUTO_SAVE_MS)
    expect(saveCanvasesBatch).toHaveBeenCalledTimes(1)
  })

  it('sends nothing while nothing is unsaved', async () => {
    await notifyEdit()
    await advance(AUTO_SAVE_MS * 3)
    expect(saveCanvasesBatch).not.toHaveBeenCalled()
  })

  it('stops if the change was undone before the timer fired', async () => {
    isDirty = true
    await notifyEdit()
    isDirty = false
    await advance(AUTO_SAVE_MS)
    expect(saveCanvasesBatch).not.toHaveBeenCalled()
  })

  it('saves a page count change that leaves no canvas dirty', async () => {
    isDirty = true
    getPayload = () => ({ ...PAYLOAD, canvases: [] })
    await notifyEdit()
    await advance(AUTO_SAVE_MS)
    expect(saveCanvasesBatch).toHaveBeenCalledTimes(1)
  })

  it('stays silent and retries soon while the project cannot be saved yet', async () => {
    isDirty = true
    getPayload = () => {
      throw new CanvasPayloadUnavailableError('The project is still loading.')
    }
    await notifyEdit()
    await advance(AUTO_SAVE_MS)
    expect(saveCanvasesBatch).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()

    getPayload = () => PAYLOAD
    await advance(AUTO_SAVE_MS)
    expect(saveCanvasesBatch).toHaveBeenCalledTimes(1)
  })

  it('toasts one failure, keeps the changes and retries until a save lands', async () => {
    isDirty = true
    saveCanvasesBatch.mockRejectedValue(new Error('Network down.'))
    await notifyEdit()

    await advance(AUTO_SAVE_MS)
    expect(saveCanvasesBatch).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][0].title).toBe('Auto-save failed')
    expect(saveContext.error).toBe('Network down.')
    expect(saveContext.hasUnsavedChanges).toBe(true)
    expect(afterSave).not.toHaveBeenCalled()

    await advance(RETRY_MS)
    expect(saveCanvasesBatch).toHaveBeenCalledTimes(2)
    expect(toast).toHaveBeenCalledTimes(1)

    saveCanvasesBatch.mockResolvedValue({ project_id: 'p', saved: [] })
    await advance(RETRY_MS)
    expect(saveCanvasesBatch).toHaveBeenCalledTimes(3)
    expect(saveContext.error).toBeNull()
    expect(saveContext.hasUnsavedChanges).toBe(false)
  })

  it('still toasts a manual save that fails', async () => {
    saveCanvasesBatch.mockRejectedValue(new Error('Network down.'))
    await act(async () => {
      await saveContext.saveCanvases().catch(() => undefined)
    })
    expect(toast.mock.calls[0][0].title).toBe('Save failed')
  })

  it('runs saves one at a time and builds each payload when its turn comes', async () => {
    let finishFirst: (value: unknown) => void = () => undefined
    saveCanvasesBatch.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
    const builtFor: number[] = []
    let edits = 1
    getPayload = () => {
      builtFor.push(edits)
      return PAYLOAD
    }

    let saves: Promise<unknown[]> = Promise.resolve([])
    await act(async () => {
      saves = Promise.all([saveContext.saveCanvases({ quiet: true }), saveContext.saveCanvases({ quiet: true })])
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(saveCanvasesBatch).toHaveBeenCalledTimes(1)

    edits = 2
    await act(async () => {
      finishFirst({ project_id: 'p', saved: [] })
      await saves
    })
    expect(saveCanvasesBatch).toHaveBeenCalledTimes(2)
    expect(builtFor).toEqual([1, 2])
  })

  it('holds the timer back while a save is on its way, then saves what is left', async () => {
    let finishSave: (value: unknown) => void = () => undefined
    saveCanvasesBatch.mockImplementationOnce(() => new Promise((resolve) => (finishSave = resolve)))
    isDirty = true
    afterSave.mockImplementation(() => undefined)
    await notifyEdit()
    await advance(AUTO_SAVE_MS)
    expect(saveCanvasesBatch).toHaveBeenCalledTimes(1)

    await notifyEdit()
    await advance(AUTO_SAVE_MS)
    expect(saveCanvasesBatch).toHaveBeenCalledTimes(1)

    await act(async () => {
      finishSave({ project_id: 'p', saved: [] })
      await vi.advanceTimersByTimeAsync(0)
    })
    await advance(AUTO_SAVE_MS)
    expect(saveCanvasesBatch).toHaveBeenCalledTimes(2)
  })

  describe('leaving the page', () => {
    const leave = (): boolean => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }

    it('warns about unsaved changes, and not otherwise', () => {
      expect(leave()).toBe(false)
      isDirty = true
      expect(leave()).toBe(true)
    })

    it('warns while a save is on its way', async () => {
      saveCanvasesBatch.mockImplementationOnce(() => new Promise(() => undefined))
      await act(async () => {
        void saveContext.saveCanvases({ quiet: true })
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(leave()).toBe(true)
    })
  })
})
