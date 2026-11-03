/**
 * What to do when Fabric cannot load an image of a canvas. Only a server saying the file is gone
 * may take the image out of the page: a network or server failure says nothing about the file, and
 * removing it then would make the next save erase an image that is still fine.
 */
import type { CanvasExportPageSlot } from '@/types/canvas-export-plan.types'
import { describePages } from '@/utils/book-preflight'

export type ImageUrlStatus = 'available' | 'missing' | 'unavailable'

/** Waits between attempts when images fail to load but are not known to be gone. */
const CANVAS_LOAD_RETRY_DELAYS_MS = [500, 1500, 3000]
/** Long enough to read a message that names pages and says what to do next. */
export const CANVAS_IMAGE_PROBLEM_TOAST_MS = 10_000
const MAX_PAGES_NAMED_IN_MESSAGE = 12

const FABRIC_IMAGE_LOAD_ERROR = /\bError loading (\S+)/
const SUPABASE_STORAGE_OBJECT_PATH = '/storage/v1/object/'
/** Canvas-level image slots; every other image sits in an `objects` list. */
const CANVAS_IMAGE_SLOTS = ['backgroundImage', 'overlayImage'] as const

type JsonNode = Record<string, unknown>

const isJsonNode = (value: unknown): value is JsonNode =>
  value != null && typeof value === 'object' && !Array.isArray(value)

/** Fabric 7 serializes images as `Image`; older snapshots and templates say `image`. */
const imageSrcOf = (node: JsonNode): string | null =>
  String(node.type).toLowerCase() === 'image' && typeof node.src === 'string' ? node.src : null

/** Storage answers a missing object with HTTP 400 and the real status in the JSON body. */
async function isStorageObjectNotFound(response: Response): Promise<boolean> {
  if (response.status !== 400 && response.status !== 404) return false
  try {
    const body = (await response.json()) as { statusCode?: unknown; error?: unknown }
    // A missing bucket also says statusCode 404: that is a setup problem, not a lost file.
    return String(body.statusCode) === '404' && /^not[_ ]found$/i.test(String(body.error))
  } catch {
    return false
  }
}

export async function probeImageUrl(url: string): Promise<ImageUrlStatus> {
  let response: Response
  try {
    response = await fetch(url, { cache: 'no-store' })
  } catch {
    return 'unavailable'
  }
  if (response.ok) {
    void response.body?.cancel()
    return 'available'
  }
  // A gateway or proxy can answer 404 for a file that is fine, so storage must confirm it itself.
  if (url.includes(SUPABASE_STORAGE_OBJECT_PATH)) {
    return (await isStorageObjectNotFound(response)) ? 'missing' : 'unavailable'
  }
  return response.status === 404 || response.status === 410 ? 'missing' : 'unavailable'
}

/** Remote images Fabric has to fetch to load this canvas (data and blob URLs need no server). */
export function collectCanvasJsonImageUrls(canvasJson: unknown): string[] {
  const into = new Set<string>()
  const visit = (node: unknown): void => {
    if (!isJsonNode(node)) return
    const src = imageSrcOf(node)
    if (src && !/^(data|blob):/i.test(src)) into.add(src)
    if (Array.isArray(node.objects)) node.objects.forEach(visit)
    for (const slot of CANVAS_IMAGE_SLOTS) visit(node[slot])
  }
  visit(canvasJson)
  return Array.from(into)
}

/** A copy of `node` without the images at `urls`, including those nested in groups. */
export function removeImagesFromCanvasJson<T extends object>(node: T, urls: ReadonlySet<string>): T {
  const isRemoved = (value: unknown): boolean => {
    const src = isJsonNode(value) ? imageSrcOf(value) : null
    return src != null && urls.has(src)
  }
  const copy: JsonNode = { ...(node as JsonNode) }
  if (Array.isArray(copy.objects)) {
    copy.objects = copy.objects
      .filter((child) => !isRemoved(child))
      .map((child) => (isJsonNode(child) ? removeImagesFromCanvasJson(child, urls) : child))
  }
  for (const slot of CANVAS_IMAGE_SLOTS) {
    if (isRemoved(copy[slot])) delete copy[slot]
  }
  return copy as T
}

function imageUrlOfLoadError(caught: unknown): string | null {
  if (!(caught instanceof Error)) return null
  return caught.message.match(FABRIC_IMAGE_LOAD_ERROR)?.[1] ?? null
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Run `load` on `canvasJson`. When an image fails, images the server confirms are gone are removed
 * and the rest of the page is loaded; anything else is retried, then rethrown with nothing removed
 * from what the caller holds. Only `json` of the result may replace the caller's snapshot.
 */
export async function loadCanvasJsonRecoveringImages<T extends object>(
  canvasJson: T,
  load: (json: T) => Promise<unknown>,
): Promise<{ json: T; removedImageUrls: string[] }> {
  const retryDelays = [...CANVAS_LOAD_RETRY_DELAYS_MS]
  const removed = new Set<string>()
  let json = canvasJson

  for (;;) {
    try {
      await load(json)
      return { json, removedImageUrls: Array.from(removed) }
    } catch (caught) {
      if (imageUrlOfLoadError(caught) == null) throw caught

      const urls = collectCanvasJsonImageUrls(json)
      const statuses = await Promise.all(urls.map(probeImageUrl))
      const missing = urls.filter((_, index) => statuses[index] === 'missing')
      if (missing.length > 0) {
        for (const url of missing) removed.add(url)
        json = removeImagesFromCanvasJson(json, new Set(missing))
        continue
      }

      const delay = retryDelays.shift()
      if (delay === undefined) throw caught
      await wait(delay)
    }
  }
}

/** "the cover", "page 4", "the cover and pages 4 and 9" (canvas index -1 is the cover). */
export function describeCanvases(canvasIndexes: Iterable<number>): string {
  const indexes = Array.from(canvasIndexes)
  const pages = indexes.filter((index) => index >= 0).sort((a, b) => a - b)
  const namedPages = pages.length > 0 ? describePages(pages, MAX_PAGES_NAMED_IN_MESSAGE) : ''
  if (!indexes.includes(-1)) return namedPages
  return namedPages ? `the cover and ${namedPages}` : 'the cover'
}

export function describeCanvasLoadProblems({
  removed,
  failed,
}: {
  removed: Iterable<number>
  failed: Iterable<number>
}): { title: string; description: string } {
  const removedFrom = describeCanvases(removed)
  const failedOn = describeCanvases(failed)
  const removedText = `An image file no longer exists, so it was removed from ${removedFrom}. Add it again if you still need it.`
  const failedText = `Images on ${failedOn} could not be reached, so nothing there was changed. Check your connection, then press Try again on the page.`
  if (removedFrom && failedOn) {
    return { title: 'Some pages need attention', description: `${removedText} ${failedText}` }
  }
  if (failedOn) return { title: 'Could not load images', description: failedText }
  return { title: 'Image missing', description: removedText }
}

/** The error to show for a failed export when `caught` is Fabric failing to load an image of `slot`. */
export async function describeExportImageFailure(
  caught: unknown,
  slot: CanvasExportPageSlot,
): Promise<Error | null> {
  const url = imageUrlOfLoadError(caught)
  if (url == null) return null
  const where = describeCanvases([slot.canvas_type === 'cover' ? -1 : slot.page_index])
  if ((await probeImageUrl(url)) === 'missing') {
    return new Error(
      `An image on ${where} no longer exists, so the export stopped. Open ${where} in the editor to remove it, add the image again if you need it, then export again. No download was counted.`,
    )
  }
  return new Error(
    `An image on ${where} could not be loaded, so the export stopped. Check your connection and export again. No download was counted.`,
  )
}
