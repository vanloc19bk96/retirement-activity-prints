/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Canvas, Rect, StaticCanvas } from 'fabric'

import type { CanvasExportPageSlot, CanvasExportSource } from '@/types/canvas-export-plan.types'
import {
  collectCanvasJsonImageUrls,
  describeCanvasLoadProblems,
  describeCanvases,
  describeExportImageFailure,
  probeImageUrl,
  removeImagesFromCanvasJson,
} from '@/utils/canvas-image-recovery'
import { CanvasStateStore, exportLiveFabricCanvasJson } from '@/utils/canvas-state-store'
import { runCanvasExport, type RunCanvasExportParams } from '@/utils/run-canvas-export'

vi.mock('@/utils/canvas-export-chunked-pdf', () => ({
  exportChunkedPdfFiles: vi.fn(),
  deliverPdfExportResult: vi.fn(),
}))

const STORAGE = 'https://db.example.com/storage/v1/object/public/bucket/images/u/upload'
const GOOD = `${STORAGE}/good.png`
const GONE = `${STORAGE}/gone.png`
const FLAKY = `${STORAGE}/flaky.png`

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const objectNotFound = (): Response => json(400, { statusCode: '404', error: 'not_found', message: 'Object not found' })

/** What the browser and the server say per URL. A `fetch` answer that throws is a network failure. */
let serverAnswers: Map<string, () => Response>

const answerFor = (url: string): Response => {
  const answer = serverAnswers.get(url)
  if (!answer) return new Response('png', { status: 200 })
  return answer()
}

/** jsdom loads no images: settle `img.src` from the same answers the server gives. */
function stubImageLoading(): void {
  const sources = new WeakMap<HTMLImageElement, string>()
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    get(this: HTMLImageElement) {
      return sources.get(this) ?? ''
    },
    set(this: HTMLImageElement, url: string) {
      sources.set(this, url)
      queueMicrotask(() => {
        let ok = false
        try {
          ok = answerFor(url).ok
        } catch {
          ok = false
        }
        if (ok) this.onload?.(new Event('load'))
        else this.onerror?.(new Event('error'))
      })
    },
  })
}

function imageObject(src: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'Image', version: '6.7.1', src, left: 10, top: 20, width: 40, height: 40, ...extra }
}

function textBlock(): object {
  return new Rect({ left: 1, top: 2, width: 30, height: 30, fill: '#123456' }).toObject()
}

function page(...objects: unknown[]): Record<string, unknown> {
  return { version: '6.7.1', objects, background: '#ffffff' }
}

function liveCanvas(): Canvas {
  const canvas = new Canvas(document.createElement('canvas'), { width: 200, height: 200 })
  // jsdom's drawImage rejects the stubbed images; these tests read objects, not pixels.
  canvas.requestRenderAll = () => undefined
  return canvas
}

/** Restore with the retry waits fast-forwarded. */
async function restoreRunningTimers(store: CanvasStateStore, index: number, canvas: Canvas) {
  const outcome = store.restore(index, canvas)
  await vi.runAllTimersAsync()
  return outcome
}

beforeEach(() => {
  serverAnswers = new Map()
  stubImageLoading()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => answerFor(url)))
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (HTMLImageElement.prototype as { src?: string }).src
})

describe('probeImageUrl', () => {
  it('reads a missing storage object from the body of its HTTP 400', async () => {
    serverAnswers.set(GONE, objectNotFound)
    expect(await probeImageUrl(GONE)).toBe('missing')
  })

  it.each<[string, () => Response]>([
    ['a missing bucket, which also says statusCode 404', () => json(400, { statusCode: '404', error: 'Bucket not found' })],
    ['an expired token', () => json(400, { statusCode: '400', error: 'InvalidJWT' })],
    ['a gateway 404 not from storage', () => json(404, { message: 'no Route matched with those values' })],
    ['a 400 that is not JSON', () => new Response('<html>bad</html>', { status: 400 })],
    ['a server error', () => new Response('', { status: 503 })],
    ['a rate limit', () => new Response('', { status: 429 })],
    ['a forbidden response', () => new Response('', { status: 403 })],
  ])('does not call %s missing', async (_label, answer) => {
    serverAnswers.set(GONE, answer)
    expect(await probeImageUrl(GONE)).toBe('unavailable')
  })

  it('does not call a network failure missing', async () => {
    serverAnswers.set(GONE, () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await probeImageUrl(GONE)).toBe('unavailable')
  })

  it('takes a plain 404 or 410 from another host at its word', async () => {
    serverAnswers.set('https://cdn.example.com/a.png', () => new Response('', { status: 404 }))
    serverAnswers.set('https://cdn.example.com/b.png', () => new Response('', { status: 410 }))
    expect(await probeImageUrl('https://cdn.example.com/a.png')).toBe('missing')
    expect(await probeImageUrl('https://cdn.example.com/b.png')).toBe('missing')
  })
})

describe('canvas JSON images', () => {
  const nested = page(
    imageObject(GONE),
    { type: 'Group', objects: [imageObject(GONE), imageObject(GOOD), textBlock()] },
    { type: 'image', src: FLAKY },
    imageObject('data:image/png;base64,AAAA'),
  )

  it('finds images in groups, in either type spelling, skipping inline data', () => {
    expect(collectCanvasJsonImageUrls(nested).sort()).toEqual([FLAKY, GONE, GOOD].sort())
    expect(collectCanvasJsonImageUrls({ objects: [], backgroundImage: imageObject(GOOD) })).toEqual([GOOD])
  })

  it('removes only the named images and leaves the input as it was', () => {
    const before = JSON.stringify(nested)
    const result = removeImagesFromCanvasJson(nested, new Set([GONE]))

    expect(collectCanvasJsonImageUrls(result).sort()).toEqual([FLAKY, GOOD].sort())
    expect((result.objects as unknown[]).length).toBe(3)
    expect(JSON.stringify(nested)).toBe(before)
  })

  it('removes a missing background image from the canvas itself', () => {
    const result = removeImagesFromCanvasJson({ objects: [], backgroundImage: imageObject(GONE) }, new Set([GONE]))
    expect(result).not.toHaveProperty('backgroundImage')
  })
})

describe('CanvasStateStore.restore', () => {
  it('leaves a page with working images untouched', async () => {
    const store = new CanvasStateStore()
    const original = page(imageObject(GOOD))
    store.preload(0, original)

    const outcome = await restoreRunningTimers(store, 0, liveCanvas())

    expect(outcome).toBe('restored')
    expect(collectCanvasJsonImageUrls(store.getSerialized(0))).toEqual([GOOD])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('drops only a lost image, keeps the rest, and leaves the page dirty for the next save', async () => {
    serverAnswers.set(GONE, objectNotFound)
    const store = new CanvasStateStore()
    store.preload(-1, page(imageObject(GOOD), imageObject(GONE), textBlock()))
    const canvas = liveCanvas()

    const outcome = await restoreRunningTimers(store, -1, canvas)
    store.markFabricLiveTrusted(-1)

    expect(outcome).toBe('images-removed')
    expect(canvas.getObjects().map((obj) => obj.type)).toEqual(['image', 'rect'])
    expect(collectCanvasJsonImageUrls(store.getSerialized(-1))).toEqual([GOOD])
    expect(collectCanvasJsonImageUrls(exportLiveFabricCanvasJson(canvas))).toEqual([GOOD])
    expect(store.isDirty(-1, exportLiveFabricCanvasJson(canvas))).toBe(true)
    // A later add reaches the screen: the failed load must not leave rendering switched off.
    expect(canvas.renderOnAddRemove).toBe(true)
  })

  it('keeps the removal dirty through hydration settle and baseline reconcile, until it is saved', async () => {
    serverAnswers.set(GONE, objectNotFound)
    const store = new CanvasStateStore()
    store.preload(0, page(imageObject(GOOD), imageObject(GONE)))
    store.markPendingFabricBaselineReconcile(0)
    const canvas = liveCanvas()

    await restoreRunningTimers(store, 0, canvas)
    store.markFabricLiveTrusted(0)
    expect(store.reconcileFabricBaselineIfPending(0, canvas)).toBe(false)

    const liveJson = exportLiveFabricCanvasJson(canvas)
    store.markHydrated(0, liveJson)
    expect(store.isDirty(0, liveJson)).toBe(true)

    store.markSavedAndTrackFabricReconcile(0, liveJson)
    expect(store.isDirty(0, liveJson)).toBe(false)
  })

  it('removes a lost image nested in a group', async () => {
    serverAnswers.set(GONE, objectNotFound)
    const store = new CanvasStateStore()
    store.preload(0, page({ type: 'Group', objects: [imageObject(GONE), new Rect({ width: 5, height: 5 }).toObject()] }))

    expect(await restoreRunningTimers(store, 0, liveCanvas())).toBe('images-removed')
    expect(collectCanvasJsonImageUrls(store.getSerialized(0))).toEqual([])
  })

  it.each<[string, () => Response]>([
    ['the network is down', () => {
      throw new TypeError('Failed to fetch')
    }],
    ['the server answers 503', () => new Response('', { status: 503 })],
    ['the bucket is reported missing', () => json(400, { statusCode: '404', error: 'Bucket not found' })],
  ])('never removes an image or trusts the canvas while %s', async (_label, answer) => {
    serverAnswers.set(FLAKY, answer)
    const store = new CanvasStateStore()
    const original = page(imageObject(FLAKY), imageObject(GOOD))
    store.preload(3, original)
    const snapshot = store.getSerialized(3)
    const canvas = liveCanvas()

    const outcome = await restoreRunningTimers(store, 3, canvas)

    expect(outcome).toBe('failed')
    expect(store.getSerialized(3)).toBe(snapshot)
    expect(collectCanvasJsonImageUrls(store.getSerialized(3)).sort()).toEqual([FLAKY, GOOD].sort())
    // Save reads the snapshot: the page stays clean, so nothing overwrites the saved one.
    expect(store.isFabricLiveTrusted(3)).toBe(false)
    expect(store.isDirty(3, store.getSerialized(3)!)).toBe(false)
    // Whatever the empty canvas holds cannot reach the store either.
    store.save(3, canvas)
    expect(store.getSerialized(3)).toBe(snapshot)
    expect(canvas.renderOnAddRemove).toBe(true)
  })

  it('retries before giving up, and recovers when the image comes back', async () => {
    let attempts = 0
    serverAnswers.set(FLAKY, () => {
      attempts += 1
      if (attempts <= 3) return new Response('', { status: 503 })
      return new Response('png', { status: 200 })
    })
    const store = new CanvasStateStore()
    store.preload(0, page(imageObject(FLAKY)))
    const canvas = liveCanvas()

    expect(await restoreRunningTimers(store, 0, canvas)).toBe('restored')
    expect(canvas.getObjects()).toHaveLength(1)
    expect(collectCanvasJsonImageUrls(store.getSerialized(0))).toEqual([FLAKY])
    expect(canvas.renderOnAddRemove).toBe(true)
  })

  it('does not remove a confirmed loss while another image is still unreachable', async () => {
    serverAnswers.set(GONE, objectNotFound)
    serverAnswers.set(FLAKY, () => new Response('', { status: 502 }))
    const store = new CanvasStateStore()
    store.preload(0, page(imageObject(GONE), imageObject(FLAKY)))

    expect(await restoreRunningTimers(store, 0, liveCanvas())).toBe('failed')
    expect(collectCanvasJsonImageUrls(store.getSerialized(0)).sort()).toEqual([FLAKY, GONE].sort())
  })

  it('does not write a removal over a snapshot replaced while images were probed', async () => {
    serverAnswers.set(GONE, objectNotFound)
    const store = new CanvasStateStore()
    store.preload(0, page(imageObject(GONE)))
    const newer = page(imageObject(GOOD))

    const pending = store.restore(0, liveCanvas())
    store.setSerialized(0, newer)
    await vi.runAllTimersAsync()

    expect(await pending).toBe('images-removed')
    expect(collectCanvasJsonImageUrls(store.getSerialized(0))).toEqual([GOOD])
  })

  it('does not retry a failure that has nothing to do with images', async () => {
    const store = new CanvasStateStore()
    store.preload(0, page({ type: 'NoSuchFabricClass' }))

    expect(await store.restore(0, liveCanvas())).toBe('failed')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('messages', () => {
  it('names the cover and the pages, 1-based', () => {
    expect(describeCanvases([-1])).toBe('the cover')
    expect(describeCanvases([3])).toBe('page 4')
    expect(describeCanvases([8, -1, 3])).toBe('the cover and pages 4 and 9')
  })

  it('gives one message per kind of problem and both when both happened', () => {
    expect(describeCanvasLoadProblems({ removed: [3], failed: [] }).description).toContain('removed from page 4')
    expect(describeCanvasLoadProblems({ removed: [], failed: [-1] }).description).toContain('Images on the cover')
    const both = describeCanvasLoadProblems({ removed: [3], failed: [-1] }).description
    expect(both).toContain('removed from page 4')
    expect(both).toContain('Images on the cover')
  })
})

describe('export errors', () => {
  const fabricError = (url: string): Error => new Error(`fabric: Error loading ${url}`)
  const cover: CanvasExportPageSlot = { canvas_type: 'cover', page_index: 0 }
  const page12: CanvasExportPageSlot = { canvas_type: 'interior', page_index: 11 }

  it('names the cover and says the image is gone when storage confirms it', async () => {
    serverAnswers.set(GONE, objectNotFound)
    const error = await describeExportImageFailure(fabricError(GONE), cover)
    expect(error?.message).toContain('An image on the cover no longer exists')
    expect(error?.message).not.toContain('fabric:')
    expect(error?.message).not.toContain(GONE)
  })

  it('names the page and asks to try again when the failure may be temporary', async () => {
    serverAnswers.set(FLAKY, () => new Response('', { status: 503 }))
    const error = await describeExportImageFailure(fabricError(FLAKY), page12)
    expect(error?.message).toContain('An image on page 12 could not be loaded')
    expect(error?.message).toContain('Check your connection')
  })

  it('leaves other errors alone', async () => {
    expect(await describeExportImageFailure(new Error('out of memory'), page12)).toBeNull()
  })

  it('runCanvasExport reports the slot being rendered when Fabric fails on it', async () => {
    serverAnswers.set(GONE, objectNotFound)
    const { exportChunkedPdfFiles } = await import('@/utils/canvas-export-chunked-pdf')
    const source: CanvasExportSource = {
      slots: [page12, cover],
      resolveItem: async (slot) => ({ ...slot, canvas_data: {} }),
    }
    vi.mocked(exportChunkedPdfFiles).mockImplementation(async ({ source: tracked }) => {
      await tracked.resolveItem(cover)
      throw fabricError(GONE)
    })

    await expect(
      runCanvasExport({ format: 'pdf', source } as unknown as RunCanvasExportParams),
    ).rejects.toThrow('An image on the cover no longer exists')
  })

  it('a real Fabric image failure carries the URL these messages rely on', async () => {
    serverAnswers.set(GONE, objectNotFound)
    const canvas = new StaticCanvas(document.createElement('canvas'), { width: 50, height: 50 })
    const caught = await canvas.loadFromJSON(page(imageObject(GONE))).catch((error: unknown) => error)
    expect((await describeExportImageFailure(caught, page12))?.message).toContain('page 12')
    canvas.dispose()
  })
})
