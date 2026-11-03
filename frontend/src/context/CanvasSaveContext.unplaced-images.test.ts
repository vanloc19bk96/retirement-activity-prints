/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AiGeneratedImage } from '@/types/projects.types'

const mocks = vi.hoisted(() => ({ toast: vi.fn(), save: vi.fn() }))

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }))
vi.mock('@/hooks/use-canvas-saves', () => ({
  useCanvasSaves: () => ({ isSaving: false, error: null, saveCanvases: mocks.save }),
}))

const { CanvasSaveProvider, useCanvasSave } = await import('@/context/CanvasSaveContext')

const image = (name: string): AiGeneratedImage => ({
  url: `https://s/${name}.png`,
  previewUrl: null,
  idea: null,
  kind: 'cover',
})

const EMPTY_PAYLOAD = { canvases: [], interior_page_count: 1 }

let context: ReturnType<typeof useCanvasSave>
let root: Root

function Capture(): null {
  context = useCanvasSave()
  return null
}

beforeEach(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mocks.toast.mockReset()
  mocks.save.mockReset()
  mocks.save.mockResolvedValue(undefined)
  root = createRoot(document.createElement('div'))
  await act(async () => {
    root.render(createElement(CanvasSaveProvider, null, createElement(Capture)))
  })
  context.registerCanvasesPayloadGetter(() => EMPTY_PAYLOAD as never)
  context.registerHasUnsavedCheckGetter(() => false)
})

afterEach(async () => {
  await act(async () => root.unmount())
})

describe('Save with no canvas changes', () => {
  it('reminds about a generated image that is on no canvas', async () => {
    context.registerGeneratedImagesGetter(() => [image('waiting'), image('placed')])
    context.registerPlacedImageUrlsGetter(() => new Set(['https://s/placed.png']))

    await act(async () => {
      await context.saveCanvases()
    })

    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'AI image not placed yet' }))
  })

  it('says Nothing to save when every generated image is placed', async () => {
    context.registerGeneratedImagesGetter(() => [image('placed')])
    context.registerPlacedImageUrlsGetter(() => new Set(['https://s/placed.png']))

    await act(async () => {
      await context.saveCanvases()
    })

    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nothing to save' }))
  })

  it('says Nothing to save when it cannot tell what the canvases use', async () => {
    context.registerGeneratedImagesGetter(() => [image('waiting')])
    context.registerPlacedImageUrlsGetter(() => null)

    await act(async () => {
      await context.saveCanvases()
    })

    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nothing to save' }))
  })

  it('stays silent for an auto-save', async () => {
    context.registerGeneratedImagesGetter(() => [image('waiting')])
    context.registerPlacedImageUrlsGetter(() => new Set())

    await act(async () => {
      await context.saveCanvases({ auto: true })
    })

    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('saves as usual when a canvas did change', async () => {
    context.registerCanvasesPayloadGetter(
      () => ({ canvases: [{ page_index: 0, canvas_type: 'cover', canvas_data: {} }], interior_page_count: 1 }) as never,
    )
    context.registerGeneratedImagesGetter(() => [image('waiting')])
    context.registerPlacedImageUrlsGetter(() => new Set())

    await act(async () => {
      await context.saveCanvases()
    })

    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith({ title: 'Canvases saved' })
  })
})
