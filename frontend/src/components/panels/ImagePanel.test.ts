/**
 * @vitest-environment jsdom
 */
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AiGeneratedImage, AiImageDraft } from '@/types/projects.types'
import { PLACE_GENERATED_IMAGE_EVENT, type PlaceGeneratedImageEventDetail } from '@/utils/generated-image-placement-events'

const mocks = vi.hoisted(() => ({
  isEditingCover: false,
  placedUrls: new Set<string>() as ReadonlySet<string> | null,
  storedDraft: null as AiImageDraft | null,
  getDraft: vi.fn(),
  saveDraft: vi.fn(),
  generateCover: vi.fn(),
  generateInterior: vi.fn(),
  toast: vi.fn(),
  registerGeneratedImagesGetter: vi.fn(),
}))

vi.mock('@/api/projects.api', () => ({
  projectsApi: { getAiImageDraft: mocks.getDraft, saveAiImageDraft: mocks.saveDraft },
}))
vi.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ user: { plan: 'pro' } }) }))
vi.mock('@/utils/user-plan', () => ({
  isUserBookCoverAiLocked: () => false,
  isUserOnProPlan: () => true,
  isUserOnStandardTierPlan: () => true,
}))
vi.mock('@/context/CanvasSettingsContext', () => ({
  useCanvasSettings: () => ({
    bookCoverDimensions: { fullWidthInches: 12, spineWidthInches: 0.5, fullHeightInches: 9 },
    pageDimensions: { widthInches: 8.5, heightInches: 11 },
  }),
}))
vi.mock('@/context/EditorModeContext', () => ({
  useEditorMode: () => ({ isBookCoverMode: mocks.isEditingCover }),
}))
vi.mock('@/context/CanvasSaveContext', () => ({
  useCanvasSave: () => ({
    getPlacedImageUrls: () => mocks.placedUrls,
    registerGeneratedImagesGetter: mocks.registerGeneratedImagesGetter,
  }),
}))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }))
vi.mock('@/hooks/use-upload-image', () => ({
  useUploadImage: () => ({ isUploading: false, error: null, uploadImage: vi.fn(), reset: vi.fn() }),
}))
vi.mock('@/hooks/use-ai-image-generation', () => ({
  useAiImageGeneration: () => ({
    isGenerating: false,
    error: null,
    generateInteriorImages: mocks.generateInterior,
    resetError: vi.fn(),
  }),
}))
vi.mock('@/hooks/use-generate-cover', () => ({
  useGenerateCover: () => ({
    isGenerating: false,
    error: null,
    generateCover: mocks.generateCover,
    resetError: vi.fn(),
  }),
}))
vi.mock('@/components/panels/ai-cover-form/AIImageForm', async () => {
  const { createElement: h } = await import('react')
  return {
    AIImageForm: (props: {
      onGenerateCover: (payload: unknown) => void
      onGenerateInterior: (idea: string) => void
    }) =>
      h(
        'div',
        null,
        h('button', { onClick: () => props.onGenerateCover({ description: 'a lighthouse' }) }, 'stub generate cover'),
        h('button', { onClick: () => props.onGenerateInterior('a cat') }, 'stub generate page'),
      ),
  }
})

const { ImagePanel } = await import('@/components/panels/ImagePanel')

const baseDraft: AiImageDraft = {
  isBookCoverMode: true,
  idea: '',
  imageType: 'none',
  imageSize: 'square',
  cover: {
    description: '',
    imageType: 'none',
    title: { enabled: false, text: '', position: 'top' },
    subtitle: { enabled: false, text: '', position: 'top' },
    author: { enabled: false, text: '', position: 'bottom' },
  },
  generatedImages: [],
  generatedImageUrl: null,
  generatedImageIdea: null,
  generatedCoverImageUrl: null,
}

const coverImage = (name: string, withPreview = true): AiGeneratedImage => ({
  url: `https://s/${name}.png`,
  previewUrl: withPreview ? `https://s/${name}.webp` : null,
  idea: name,
  kind: 'cover',
})

let container: HTMLDivElement
let root: Root
let placeListener: ((event: Event) => void) | null = null

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function renderPanel(draft: Partial<AiImageDraft> | null): Promise<void> {
  mocks.getDraft.mockResolvedValue(draft ? { ...baseDraft, ...draft } : null)
  await act(async () => {
    root.render(createElement(ImagePanel))
  })
  await flush()
}

function button(name: string | RegExp): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find((candidate) => {
    const label = candidate.getAttribute('aria-label') ?? candidate.textContent ?? ''
    return typeof name === 'string' ? candidate.textContent === name : name.test(label)
  })
  if (!found) throw new Error(`no button ${String(name)}`)
  return found as HTMLButtonElement
}

function shownImage(): HTMLImageElement {
  return container.querySelector('img[alt]:not([alt=""])') as HTMLImageElement
}

async function click(target: HTMLElement): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await flush()
}

async function fire(target: HTMLElement, type: 'load' | 'error'): Promise<void> {
  await act(async () => {
    target.dispatchEvent(new Event(type))
  })
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  mocks.isEditingCover = false
  mocks.placedUrls = new Set()
  for (const mock of [mocks.getDraft, mocks.saveDraft, mocks.generateCover, mocks.generateInterior, mocks.toast]) {
    mock.mockReset()
  }
  mocks.saveDraft.mockResolvedValue(undefined)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  if (placeListener) window.removeEventListener(PLACE_GENERATED_IMAGE_EVENT, placeListener)
  placeListener = null
  vi.useRealTimers()
})

function answerPlacement(answer: (detail: PlaceGeneratedImageEventDetail) => void): void {
  placeListener = (event) => {
    const detail = (event as CustomEvent<PlaceGeneratedImageEventDetail>).detail
    detail.handled = true
    answer(detail)
  }
  window.addEventListener(PLACE_GENERATED_IMAGE_EVENT, placeListener)
}

describe('the AI image preview', () => {
  it('loads the light preview, says it is loading, and keeps the print file for dragging', async () => {
    await renderPanel({ generatedImages: [coverImage('a')], generatedCoverImageUrl: 'https://s/a.png' })

    expect(shownImage().getAttribute('src')).toBe('https://s/a.webp')
    expect(container.textContent).toContain('Loading preview')

    await fire(shownImage(), 'load')
    expect(container.textContent).not.toContain('Loading preview')

    const setData = vi.fn()
    const dragEvent = new Event('dragstart', { bubbles: true }) as Event & { dataTransfer: unknown }
    dragEvent.dataTransfer = { setData, types: [] }
    await act(async () => {
      button(/^Drag /).dispatchEvent(dragEvent)
    })
    expect(setData).toHaveBeenCalledWith('text/uri-list', 'https://s/a.png')
  })

  it('falls back to the print file, then shows an error with a retry', async () => {
    await renderPanel({ generatedImages: [coverImage('a')] })

    await fire(shownImage(), 'error')
    expect(shownImage().getAttribute('src')).toBe('https://s/a.png')

    await fire(shownImage(), 'error')
    expect(container.textContent).toContain('The preview could not load')

    await click(button('Try again'))
    expect(shownImage().getAttribute('src')).toBe('https://s/a.webp')
    expect(container.textContent).toContain('Loading preview')
  })

  it('shows the print file for an image generated before previews existed', async () => {
    await renderPanel({ generatedImages: [coverImage('old', false)] })

    expect(shownImage().getAttribute('src')).toBe('https://s/old.png')
  })
})

describe('placing from the panel', () => {
  it('offers Front, Back and Spine on the cover, and says the image is not on it yet', async () => {
    mocks.isEditingCover = true
    await renderPanel({ generatedImages: [coverImage('a')] })

    for (const label of ['Front', 'Back', 'Spine']) expect(button(label)).toBeTruthy()
    expect(container.textContent).toContain('not on your cover yet')
    expect(() => button('Place on current page')).toThrow()
  })

  it('offers the current page on interior pages', async () => {
    await renderPanel({ generatedImages: [coverImage('a')] })

    expect(button('Place on current page')).toBeTruthy()
    expect(container.textContent).toContain('not on your page yet')
    expect(() => button('Front')).toThrow()
  })

  it('sends the print file to the chosen part and reports success', async () => {
    mocks.isEditingCover = true
    await renderPanel({ generatedImages: [coverImage('a')] })
    const requests: Array<[string, string]> = []
    answerPlacement((detail) => {
      requests.push([detail.imageUrl, detail.target])
      detail.resolve({ placedOn: 'the back cover' })
    })

    await click(button('Back'))

    expect(requests).toEqual([['https://s/a.png', 'back']])
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Added to the back cover' }))
  })

  it('reports a failed placement, and the buttons work again', async () => {
    mocks.isEditingCover = true
    await renderPanel({ generatedImages: [coverImage('a')] })
    answerPlacement((detail) => detail.resolve({ error: 'The canvas is still loading.' }))

    await click(button('Front'))

    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Image not placed',
      description: 'The canvas is still loading.',
    })
    expect(button('Front').disabled).toBe(false)
  })

  it('stops warning once the image is in the book', async () => {
    mocks.placedUrls = new Set(['https://s/a.png'])
    await renderPanel({ generatedImages: [coverImage('a')] })

    await act(async () => {
      vi.advanceTimersByTime(500)
    })

    expect(container.textContent).toContain('This image is in your book')
    expect(container.textContent).not.toContain('not on your page yet')
  })
})

describe('the list of generated images', () => {
  it('keeps the earlier image when another is generated, and saves both', async () => {
    await renderPanel(null)
    mocks.generateCover
      .mockResolvedValueOnce({ imageUrl: 'https://s/1.png', previewUrl: 'https://s/1.webp', generationId: 'g' })
      .mockResolvedValueOnce({ imageUrl: 'https://s/2.png', previewUrl: 'https://s/2.webp', generationId: 'g' })
    await click(button(/^AI/))

    await click(button('stub generate cover'))
    await click(button('stub generate cover'))
    await act(async () => {
      vi.advanceTimersByTime(700)
    })

    const saved = mocks.saveDraft.mock.calls.at(-1)![0] as AiImageDraft
    expect(saved.generatedImages.map((image) => image.url)).toEqual(['https://s/2.png', 'https://s/1.png'])
    expect(saved.generatedImages[1]!.previewUrl).toBe('https://s/1.webp')
    expect(saved.generatedCoverImageUrl).toBe('https://s/2.png')
    expect(shownImage().getAttribute('src')).toBe('https://s/2.webp')
  })

  it('brings back an earlier image when its thumbnail is chosen, and remembers the choice', async () => {
    await renderPanel({
      generatedImages: [coverImage('new'), coverImage('old')],
      generatedCoverImageUrl: 'https://s/new.png',
    })
    expect(shownImage().getAttribute('src')).toBe('https://s/new.webp')

    await click(button(/^Show old/))
    await act(async () => {
      vi.advanceTimersByTime(700)
    })

    expect(shownImage().getAttribute('src')).toBe('https://s/old.webp')
    const saved = mocks.saveDraft.mock.calls.at(-1)![0] as AiImageDraft
    expect(saved.generatedCoverImageUrl).toBe('https://s/old.png')
    expect(saved.generatedImages).toHaveLength(2)
  })

  it('reopens on the image shown last time', async () => {
    await renderPanel({
      generatedImages: [coverImage('new'), coverImage('old')],
      generatedCoverImageUrl: 'https://s/old.png',
    })

    expect(shownImage().getAttribute('src')).toBe('https://s/old.webp')
  })

  it('hands the list to the save context for the Save reminder', async () => {
    await renderPanel({ generatedImages: [coverImage('a')] })

    const getter = mocks.registerGeneratedImagesGetter.mock.calls.at(-1)![0] as () => AiGeneratedImage[]
    expect(getter().map((image) => image.url)).toEqual(['https://s/a.png'])
  })
})

describe('a draft that fails to load or save', () => {
  it('tries reading again, and saves nothing until it has read', async () => {
    mocks.getDraft.mockRejectedValueOnce(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      root.render(createElement(ImagePanel))
    })
    await flush()
    expect(mocks.saveDraft).not.toHaveBeenCalled()

    mocks.getDraft.mockResolvedValue({ ...baseDraft, generatedImages: [coverImage('kept')] })
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    await flush()

    expect(mocks.getDraft).toHaveBeenCalledTimes(2)
    expect(shownImage().getAttribute('src')).toBe('https://s/kept.webp')
    expect(mocks.saveDraft).not.toHaveBeenCalled()
  })

  it('tries saving a new image again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await renderPanel(null)
    mocks.generateCover.mockResolvedValue({ imageUrl: 'https://s/1.png', previewUrl: null, generationId: 'g' })
    mocks.saveDraft.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    await click(button(/^AI/))
    await click(button('stub generate cover'))

    await act(async () => {
      vi.advanceTimersByTime(700)
    })
    await flush()
    expect(mocks.saveDraft).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    await flush()
    await act(async () => {
      vi.advanceTimersByTime(700)
    })
    await flush()

    expect(mocks.saveDraft).toHaveBeenCalledTimes(2)
    expect((mocks.saveDraft.mock.calls[1]![0] as AiImageDraft).generatedImages[0]!.url).toBe('https://s/1.png')
  })
})
