import { getStudioTemplate } from '@/constants/studio-templates'
import { addPagesAt } from '@/utils/editor-page-events'
import { dispatchCanvasThumbnailInvalidated } from '@/utils/canvas-thumbnail-events'
import {
  buildAnswerPage,
  harvestAnswers,
} from '@/utils/studio/studio-answer-key'
import { resetObjectCounter } from '@/utils/studio/studio-fabric-builders'
import { resolveStudioMarginForPage } from '@/utils/studio/studio-margin'
import {
  findStudioInstanceEndPageIndex,
  findStudioInstanceStartPageIndex,
  resolveStudioInstancePageSpan,
} from '@/utils/studio/studio-instance-pages'
import { yieldToMainThread } from '@/utils/yield-to-main-thread'
import { ensureFontFamilyLoaded } from '@/utils/font-loader'
import { clearStudioTextMetricsCache } from '@/utils/studio/studio-text-metrics'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_DEFAULT_FONT,
} from '@/constants/studio.constants'
import type {
  StudioConfig,
  StudioGenerateRequest,
  StudioGenerateResult,
  StudioGenerateProgress,
  StudioGenerateContext,
  StudioFabricObject,
  StudioPrefetchContext,
} from '@/types/studio-template.types'
import {
  collectReferencedFontFamiliesFromFabricCanvasJson,
  type CanvasStateStore,
} from '@/utils/canvas-state-store'
import {
  STUDIO_UNIQUE_CONTENT_ATTEMPTS,
  STUDIO_UNIQUE_CONTENT_REMOTE_ATTEMPTS,
  claimUniqueStudioOutputs,
} from '@/utils/studio/studio-unique-content'
import {
  collectStudioContentLabels,
  withStudioContentHash,
} from '@/utils/studio/studio-content-history'
import type { StudioWritePageOptions } from '@/utils/studio/studio-events'

export type StudioWritePage = (
  pageIndex: number,
  objects: StudioFabricObject[],
  mode: 'replace' | 'append',
  options?: StudioWritePageOptions,
) => void

type MarginGuide = Parameters<typeof resolveStudioMarginForPage>[0]['marginGuide']

/** Mirror verso/recto: same content width, different left inset. */
function shiftStudioObjects(objects: StudioFabricObject[], dx: number): StudioFabricObject[] {
  if (dx === 0) return objects
  return objects.map((obj) => {
    const next: StudioFabricObject = { ...obj, left: obj.left + dx }
    if (obj.x1 != null) next.x1 = obj.x1 + dx
    if (obj.x2 != null) next.x2 = obj.x2 + dx
    // Group children use center-relative coords — only shift the group itself.
    return next
  })
}

function answerInkForTemplate(templateKey: string): string {
  return STUDIO_ANSWER_INK_MONO_TEMPLATES.has(templateKey)
    ? STUDIO_ANSWER_INK_MONO
    : STUDIO_ANSWER_INK
}

const primedFontFamilies = new Set<string>()

/**
 * Get the page's own face in the browser before anything is measured with it.
 *
 * Generators break their own lines — a clue list, a crossword column, a maze
 * label — and then reserve exactly the height those lines came to. The widths
 * behind that decision come from `ctx.measureText`, which silently answers with
 * whatever face is available at the time: a Google font is fetched lazily, so
 * the first sheet a seller generates is planned on fallback metrics and drawn,
 * moments later, in the real face. Every line that fitted by a hair then
 * re-wraps on the canvas into a line nobody left room for, and it prints on top
 * of the next one.
 *
 * The cache is dropped as well as the face loaded, because a run that measured
 * against the fallback has already filed those widths under the real font's
 * name and would hand the same wrong numbers to every later sheet.
 *
 * Whether the load was needed is tracked here rather than asked of
 * `document.fonts.check`, which answers true for a family it has never heard
 * of — and before the stylesheet is appended, a Google font is exactly that.
 * The load itself is memoised per family, so this costs one await per family
 * per session.
 */
async function primeStudioTextMetrics(fontFamily: string): Promise<void> {
  if (primedFontFamilies.has(fontFamily)) return
  await ensureFontFamilyLoaded(fontFamily)
  primedFontFamilies.add(fontFamily)
  clearStudioTextMetricsCache()
}

export async function runStudioGenerateOnce(options: {
  req: StudioGenerateRequest
  pageWidth: number
  pageHeight: number
  marginGuide: MarginGuide
  writePage: StudioWritePage
  canvasStateStore: CanvasStateStore
  signal: AbortSignal
  setError: (message: string | null) => void
  /** Per-seller identity for owner-scoped icon pools (KDP uniqueness). */
  ownerKey?: string
  /** Per-account puzzle salt keying seed derivation (Card pack spec §4.1). */
  ownerSalt?: string
  /** When set (bulk runs), each call gets a seed not already in this set. */
  usedSeeds?: Set<number>
  /**
   * Content digests this book must not repeat. Seeded from the pages already
   * in the book, then grown as the run writes more, so uniqueness spans runs
   * and not just the current batch.
   */
  usedFingerprints?: Set<string>
  /**
   * Bulk: persist to the store only. Live Fabric + mid-run thumbs catch up
   * after `studio:generation-done`.
   */
  deferLiveSync?: boolean
  /**
   * Bulk: caller already reserved blank pages at `req.startPageIndex`.
   * Write with replace; top up only when this sheet needs more than `reservedPageCount`.
   */
  skipPageAllocation?: boolean
  /** Pages reserved for this sheet when `skipPageAllocation` is set. */
  reservedPageCount?: number
  /** Single-run progress (prefetch → layout). Bulk owns its own counters. */
  setProgress?: (progress: StudioGenerateProgress) => void
}): Promise<StudioGenerateResult | null> {
  const {
    req,
    pageWidth,
    pageHeight,
    marginGuide,
    writePage,
    canvasStateStore,
    signal,
    setError,
    ownerKey,
    ownerSalt,
    usedSeeds,
    usedFingerprints,
    deferLiveSync = false,
    skipPageAllocation = false,
    reservedPageCount = 0,
    setProgress,
  } = options
  const writeOpts: StudioWritePageOptions | undefined = deferLiveSync
    ? { syncLive: false }
    : undefined

  const def = getStudioTemplate(req.templateKey)
  if (!def) {
    setError(`Unknown template: ${req.templateKey}`)
    return null
  }

  await primeStudioTextMetrics(String(req.config.fontFamily ?? STUDIO_DEFAULT_FONT))
  if (signal.aborted) return null

  const firstMargin = resolveStudioMarginForPage({
    pageIndex: req.startPageIndex,
    pageWidth,
    pageHeight,
    marginGuide,
  })

  // Read lazily and afresh per attempt: a bulk run writes pages between calls.
  const prefetchContext: StudioPrefetchContext = {
    bookContentLabels: (templateKey) =>
      collectStudioContentLabels(canvasStateStore, req.interiorPageCount, templateKey),
  }

  // Seed-invariant sheets never vary by seed — fingerprint retries
  // would exhaust and skip every duplicate instance in a book/bulk run.
  const claimed = await claimUniqueStudioOutputs({
    usedSeeds,
    usedFingerprints: def.seedInvariant ? undefined : usedFingerprints,
    // Each remote attempt is a paid call against a per-minute quota.
    maxAttempts: def.prefetch
      ? STUDIO_UNIQUE_CONTENT_REMOTE_ATTEMPTS
      : STUDIO_UNIQUE_CONTENT_ATTEMPTS,
    namespace: def.key,
    isAborted: () => signal.aborted,
    build: async (seed) => {
      if (signal.aborted) return 'aborted'
      const attemptConfig: StudioConfig = { ...req.config, seed }

      let remoteData: unknown
      if (def.prefetch) {
        try {
          remoteData = await def.prefetch(attemptConfig, signal, prefetchContext)
          // Prefetch is the slow half of AI templates — advance bar before layout.
          setProgress?.({ completed: 1, total: 2, countKind: 'phase' })
        } catch (e) {
          if (signal.aborted) return 'aborted'
          setError(e instanceof Error ? e.message : 'Content generation failed')
          return 'error'
        }
      }

      if (signal.aborted) return 'aborted'

      const configError = def.validateConfig?.(attemptConfig) ?? null
      if (configError) {
        setError(configError.message)
        return 'error'
      }

      const attemptInstanceId = `${def.key}-${req.startPageIndex}-${seed}`
      const ctx: StudioGenerateContext = {
        pageWidth,
        pageHeight,
        margin: firstMargin,
        seed,
        instanceId: attemptInstanceId,
        ownerKey,
        ownerSalt,
        remoteData,
      }

      resetObjectCounter()
      return def.generate(attemptConfig, ctx)
    },
  })

  if (!claimed.ok) {
    if (claimed.reason === 'exhausted') {
      setError('Could not generate a unique puzzle. Try fewer pages or different settings.')
    }
    return null
  }

  const { seed, outputs, fingerprint: contentHash, duplicate: isDuplicate } = claimed
  const instanceId = `${def.key}-${req.startPageIndex}-${seed}`

  const generatedFonts = collectReferencedFontFamiliesFromFabricCanvasJson({
    objects: outputs.flatMap((out) => out.objects),
  })
  await Promise.all(generatedFonts.map((fontFamily) => ensureFontFamilyLoaded(fontFamily)))
  if (signal.aborted) return null

  // producesAnswerKey templates always get a solution page — no form toggle.
  const wantsKey = def.producesAnswerKey
  const answerInk = answerInkForTemplate(def.key)
  const keyAfter = wantsKey
    ? outputs.map(
        (out) =>
          harvestAnswers(out.answerSourceObjects ?? out.objects).length > 0,
      )
    : outputs.map(() => false)
  const keyCount = keyAfter.filter(Boolean).length
  const totalPages = outputs.length + keyCount

  let pagesAdded = 0
  let instanceSpan = 1
  let toInsert = 0
  if (skipPageAllocation) {
    // Pool may be short when this sheet needs more pages than the learned stride.
    toInsert = Math.max(0, totalPages - Math.max(0, reservedPageCount))
    if (toInsert > 0) {
      addPagesAt(req.startPageIndex + reservedPageCount, toInsert)
      pagesAdded = toInsert
    }
  } else if (req.mode === 'insert') {
    addPagesAt(req.startPageIndex, totalPages)
    pagesAdded = totalPages
  } else {
    // Only reuse pages of THIS instance (puzzle ± existing key). Never steal the next game.
    instanceSpan = resolveStudioInstancePageSpan({
      store: canvasStateStore,
      startPageIndex: req.startPageIndex,
      interiorPageCount: req.interiorPageCount,
    })
    toInsert = Math.max(0, totalPages - instanceSpan)
    if (toInsert > 0) {
      addPagesAt(req.startPageIndex + instanceSpan, toInsert)
      pagesAdded = toInsert
    }
  }
  // Page inserts remount Fabric rows asynchronously — yield so live writes land
  // on the post-insert canvases instead of stacking onto pre-shift instances.
  if (pagesAdded > 0) {
    await yieldToMainThread()
  }

  const pageIndices: number[] = []
  let cursor = req.startPageIndex
  outputs.forEach((out, i) => {
    const pageIndex = cursor++
    const pageMargin = resolveStudioMarginForPage({
      pageIndex,
      pageWidth,
      pageHeight,
      marginGuide,
    })
    const dx = pageMargin.left - firstMargin.left
    const objects = withStudioContentHash(shiftStudioObjects(out.objects, dx), contentHash)
    // Always replace: insert mode already added blank pages. Append onto a live
    // canvas that still holds pre-shift content (React remount lags) stacks glyphs.
    writePage(pageIndex, objects, 'replace', writeOpts)
    if (!deferLiveSync) {
      dispatchCanvasThumbnailInvalidated(pageIndex)
    }
    pageIndices.push(pageIndex)

    if (!keyAfter[i]) return
    const keyPageIndex = cursor++
    const keyMargin = resolveStudioMarginForPage({
      pageIndex: keyPageIndex,
      pageWidth,
      pageHeight,
      marginGuide,
    })
    const answerObjects = withStudioContentHash(
      shiftStudioObjects(
        buildAnswerPage(out.answerSourceObjects ?? out.objects, answerInk, {
          // The key page re-titles "Game N" as "Solution Game N"; it has to fit
          // the same column, which is tight on small trims (5 x 8 is ~252pt).
          contentWidth: pageWidth - keyMargin.left - keyMargin.right,
        }),
        keyMargin.left - firstMargin.left,
      ),
      contentHash,
    )
    writePage(keyPageIndex, answerObjects, 'replace', writeOpts)
    if (!deferLiveSync) {
      dispatchCanvasThumbnailInvalidated(keyPageIndex)
    }
    pageIndices.push(keyPageIndex)
  })

  const pageCountAfterAll = req.interiorPageCount + pagesAdded
  const instanceStart = findStudioInstanceStartPageIndex(
    canvasStateStore,
    pageCountAfterAll,
    instanceId,
  )
  const instanceEnd = findStudioInstanceEndPageIndex(
    canvasStateStore,
    pageCountAfterAll,
    instanceId,
  )
  const resolvedPageIndices =
    instanceStart >= 0 && instanceEnd >= instanceStart
      ? Array.from(
          { length: instanceEnd - instanceStart + 1 },
          (_, i) => instanceStart + i,
        )
      : pageIndices

  return { instanceId, pageIndices: resolvedPageIndices, pagesAdded, isDuplicate }
}
