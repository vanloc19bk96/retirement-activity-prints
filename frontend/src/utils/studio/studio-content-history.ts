import type { StudioFabricObject } from '@/types/studio-template.types'
import type { CanvasStateStore } from '@/utils/canvas-state-store'

/**
 * What this book has already printed.
 *
 * Uniqueness used to live for exactly one run: a 20-game build knew its own 20
 * sheets and nothing else. A seller who filled a 60-page book across three
 * builds — or added one game at a time from the Single tab — could land the
 * same puzzle twice and only find out in the proof copy.
 *
 * Every generated instance stamps `studioContentHash` on its objects, and that
 * field is persisted with the page. Reading it back is how a new run inherits
 * the whole book's history instead of starting blind.
 */

type StoredCanvasJson = { objects?: unknown[] }

/** Stamp the instance digest on the objects about to be written to a page. */
export function withStudioContentHash(
  objects: StudioFabricObject[],
  contentHash: string,
): StudioFabricObject[] {
  if (!contentHash) return objects
  return objects.map((obj) => ({ ...obj, studioContentHash: contentHash }))
}

/**
 * Content digests already present in the book's interior pages.
 *
 * Top-level objects only: the stamp is applied to everything a generator
 * writes to a page, so descending into groups would find nothing new.
 */
export function collectStudioContentHashes(
  store: CanvasStateStore,
  pageCount: number,
): Set<string> {
  const hashes = new Set<string>()
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const json = store.getSerialized(pageIndex) as StoredCanvasJson | null
    const objects = Array.isArray(json?.objects) ? json.objects : []
    for (const raw of objects) {
      if (!raw || typeof raw !== 'object') continue
      const hash = (raw as StudioFabricObject).studioContentHash
      if (typeof hash === 'string' && hash) hashes.add(hash)
    }
  }
  return hashes
}

/** Fabric `data` key a generator stamps with one printed item's plain text. */
export const STUDIO_CONTENT_LABEL_KEY = 'studioContentLabel'

/** Most labels a single scan returns — several hundred questions' worth. */
const MAX_BOOK_CONTENT_LABELS = 400

/**
 * Plain-text labels a template stamped on the book's pages, in page order.
 *
 * The content hash above only catches a whole sheet printed twice. AI games
 * that write prose need the finer grain — the same question on page 3 and page
 * 41 under a different sheet — so their generators stamp each printed item's
 * text as `data.studioContentLabel`, and their prefetch reads it back here.
 * Top-level objects only, like the hash scan. Capped from the end, so a very
 * long book keeps its most recent pages in view.
 */
export function collectStudioContentLabels(
  store: CanvasStateStore,
  pageCount: number,
  templateKey: string,
): string[] {
  const labels: string[] = []
  const seen = new Set<string>()
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const json = store.getSerialized(pageIndex) as StoredCanvasJson | null
    const objects = Array.isArray(json?.objects) ? json.objects : []
    for (const raw of objects) {
      if (!raw || typeof raw !== 'object') continue
      const obj = raw as StudioFabricObject
      if (obj.studioTemplateKey !== templateKey) continue
      const label = obj.data?.[STUDIO_CONTENT_LABEL_KEY]
      if (typeof label !== 'string' || !label.trim() || seen.has(label)) continue
      seen.add(label)
      labels.push(label)
    }
  }
  return labels.slice(-MAX_BOOK_CONTENT_LABELS)
}
