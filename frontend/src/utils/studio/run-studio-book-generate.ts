import { getStudioTemplate } from '@/constants/studio-templates'
import { estimateBookPlanPages } from '@/utils/studio/studio-book-plan'
import { STUDIO_BULK_MAX_BOOK_PAGES } from '@/utils/studio/studio-bulk-allocate'
import { runStudioGenerateOnce, type StudioWritePage } from '@/utils/studio/run-studio-generate'
import { bumpStudioGameTitle } from '@/utils/studio/studio-instance-pages'
import { collectStudioContentHashes } from '@/utils/studio/studio-content-history'
import { dispatchStudioGenerationDone } from '@/utils/studio/studio-events'
import { yieldToMainThread } from '@/utils/yield-to-main-thread'
import type {
  StudioBookGenerateRequest,
  StudioGenerateProgress,
  StudioGenerateResult,
} from '@/types/studio-template.types'
import type { CanvasStateStore } from '@/utils/canvas-state-store'

type MarginGuide = Parameters<typeof runStudioGenerateOnce>[0]['marginGuide']

/**
 * Generate a whole book in one run: iterate a mixed-template plan, letting each
 * game insert its own pages at a running cursor. Live canvas syncs once at the
 * end. A single game's failure is skipped, not fatal, so the book still lands.
 *
 * Content uniqueness starts from what the book already holds, not from an empty
 * set: a seller who builds a 60-page book in three sittings must not meet the
 * same puzzle in sitting three that sitting one already printed.
 */
export async function runStudioBookGenerate(options: {
  req: StudioBookGenerateRequest
  pageWidth: number
  pageHeight: number
  marginGuide: MarginGuide
  writePage: StudioWritePage
  canvasStateStore: CanvasStateStore
  signal: AbortSignal
  setError: (message: string | null) => void
  setProgress: (progress: StudioGenerateProgress) => void
  ownerKey?: string
  /** Per-account puzzle salt keying seed derivation (Card pack spec §4.1). */
  ownerSalt?: string
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
    setProgress,
    ownerKey,
    ownerSalt,
  } = options

  if (req.plan.length === 0) {
    setError('Add at least one game.')
    return null
  }

  const estimatedInsert = estimateBookPlanPages(req.plan)
  if (req.interiorPageCount + estimatedInsert > STUDIO_BULK_MAX_BOOK_PAGES) {
    setError(
      `This book needs too many pages (max ${STUDIO_BULK_MAX_BOOK_PAGES}). Reduce games.`,
    )
    return null
  }

  const total = req.plan.length
  const showTitle = req.showTitle
  let nextTitle = showTitle ? String(req.titleStart ?? '') : ''
  let pageCount = req.interiorPageCount
  let writeCursor = req.startPageIndex
  const allPageIndices: number[] = []
  let firstInstanceId: string | null = null
  let pagesAdded = 0
  let instancesCompleted = 0
  let instancesSkipped = 0
  let instancesDuplicated = 0
  const usedSeeds = new Set<number>()
  const usedFingerprints = collectStudioContentHashes(
    canvasStateStore,
    req.interiorPageCount,
  )
  // Per-game errors are collected but only surfaced if the whole book fails.
  let lastError: string | null = null
  const captureError = (message: string | null) => {
    if (message) lastError = message
  }

  const finish = (): StudioGenerateResult | null => {
    if (allPageIndices.length === 0) {
      if (lastError) setError(lastError)
      return null
    }
    const instanceId = firstInstanceId ?? 'studio-book'
    dispatchStudioGenerationDone({
      instanceId,
      pageIndices: allPageIndices,
      restoreLiveFromStore: true,
    })
    return {
      instanceId,
      pageIndices: allPageIndices,
      pagesAdded,
      instancesCompleted,
      instancesSkipped,
      instancesDuplicated,
    }
  }

  for (let i = 0; i < total; i++) {
    if (signal.aborted) return finish()

    const item = req.plan[i]!
    const def = getStudioTemplate(item.templateKey)
    if (!def) {
      instancesSkipped += 1
      setProgress({ completed: i + 1, total, countKind: 'instance' })
      continue
    }

    const isFirst = allPageIndices.length === 0
    const title = showTitle ? nextTitle : ''
    const config = { ...item.config, showTitle, title }

    const result = await runStudioGenerateOnce({
      req: {
        templateKey: item.templateKey,
        config,
        startPageIndex: writeCursor,
        mode: isFirst ? req.mode : 'insert',
        interiorPageCount: pageCount,
      },
      pageWidth,
      pageHeight,
      marginGuide,
      writePage,
      canvasStateStore,
      signal,
      setError: captureError,
      ownerKey,
      ownerSalt,
      usedSeeds,
      usedFingerprints,
      deferLiveSync: true,
    })

    if (signal.aborted) return finish()

    if (!result) {
      instancesSkipped += 1
      setProgress({ completed: i + 1, total, countKind: 'instance' })
      await yieldToMainThread()
      continue
    }

    if (!firstInstanceId) firstInstanceId = result.instanceId
    allPageIndices.push(...result.pageIndices)
    pagesAdded += result.pagesAdded
    pageCount += result.pagesAdded
    const maxIndex =
      result.pageIndices.length > 0 ? Math.max(...result.pageIndices) : writeCursor - 1
    writeCursor = Math.max(maxIndex + 1, writeCursor + result.pagesAdded)
    instancesCompleted += 1
    if (result.isDuplicate) instancesDuplicated += 1
    if (showTitle) nextTitle = bumpStudioGameTitle(nextTitle) ?? nextTitle

    setProgress({ completed: i + 1, total, countKind: 'instance' })
    await yieldToMainThread()
  }

  return finish()
}
