import { getStudioTemplate } from '@/constants/studio-templates'
import { addPagesAt, removePagesAt } from '@/utils/editor-page-events'
import {
  expandStudioBulkJobs,
  mergeStudioBulkConfig,
  validateStudioBulkJobs,
} from '@/utils/studio/studio-bulk'
import {
  estimateStudioBulkInsertPages,
  estimateStudioInstancePageCount,
  STUDIO_BULK_MAX_BOOK_PAGES,
} from '@/utils/studio/studio-bulk-allocate'
import { runStudioGenerateOnce, type StudioWritePage } from '@/utils/studio/run-studio-generate'
import {
  bumpStudioGameTitle,
  findStudioInstanceEndPageIndex,
  resolveStudioInstancePageSpan,
} from '@/utils/studio/studio-instance-pages'
import { collectStudioContentHashes } from '@/utils/studio/studio-content-history'
import { dispatchStudioGenerationDone } from '@/utils/studio/studio-events'
import { yieldToMainThread } from '@/utils/yield-to-main-thread'
import type {
  StudioBulkGenerateRequest,
  StudioGenerateProgress,
  StudioGenerateResult,
} from '@/types/studio-template.types'
import type { CanvasStateStore } from '@/utils/canvas-state-store'

type MarginGuide = Parameters<typeof runStudioGenerateOnce>[0]['marginGuide']

export async function runStudioBulkGenerate(options: {
  req: StudioBulkGenerateRequest
  pageWidth: number
  pageHeight: number
  marginGuide: MarginGuide
  writePage: StudioWritePage
  canvasStateStore: CanvasStateStore
  signal: AbortSignal
  setError: (message: string | null) => void
  setProgress: (progress: StudioGenerateProgress) => void
  /** Per-seller identity for owner-scoped icon pools (KDP uniqueness). */
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

  const bulkError = validateStudioBulkJobs(req.jobs)
  if (bulkError) {
    setError(bulkError)
    return null
  }

  const def = getStudioTemplate(req.templateKey)
  if (!def) {
    setError(`Unknown template: ${req.templateKey}`)
    return null
  }

  const variants = expandStudioBulkJobs(req.jobs)
  const estimatedPer = estimateStudioInstancePageCount(def)
  const firstReusable =
    req.mode === 'replace'
      ? resolveStudioInstancePageSpan({
          store: canvasStateStore,
          startPageIndex: req.startPageIndex,
          interiorPageCount: req.interiorPageCount,
        })
      : 0
  const estimatedInsert = estimateStudioBulkInsertPages({
    instanceCount: variants.length,
    pagesPerInstance: estimatedPer,
    mode: req.mode,
    firstInstanceReusablePages: firstReusable,
  })
  if (req.interiorPageCount + estimatedInsert > STUDIO_BULK_MAX_BOOK_PAGES) {
    setError(
      `This bulk run needs too many pages (max ${STUDIO_BULK_MAX_BOOK_PAGES}). Reduce quantity.`,
    )
    return null
  }

  const showTitle = req.sharedConfig.showTitle === true
  let nextTitle = showTitle ? String(req.sharedConfig.title ?? '') : ''
  let pageCount = req.interiorPageCount
  const allPageIndices: number[] = []
  let firstInstanceId: string | null = null
  let pagesAdded = 0
  let instancesCompleted = 0
  let instancesDuplicated = 0
  const usedSeeds = new Set<number>()
  // Seeded from the book so a second bulk run cannot reprint the first one.
  const usedFingerprints = collectStudioContentHashes(
    canvasStateStore,
    req.interiorPageCount,
  )

  let writeCursor = req.startPageIndex
  let poolEnd = req.startPageIndex

  const trimUnusedPool = async (): Promise<void> => {
    const unused = poolEnd - writeCursor
    if (unused <= 0) return
    removePagesAt(writeCursor, unused)
    pagesAdded = Math.max(0, pagesAdded - unused)
    pageCount = Math.max(writeCursor, pageCount - unused)
    poolEnd = writeCursor
    await yieldToMainThread()
  }

  const finish = async (): Promise<StudioGenerateResult | null> => {
    await trimUnusedPool()
    if (allPageIndices.length === 0) return null
    const instanceId = firstInstanceId ?? `${req.templateKey}-bulk`
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
      instancesDuplicated,
    }
  }

  const ensurePoolEnd = async (neededEnd: number): Promise<boolean> => {
    if (neededEnd <= poolEnd) return true
    const toAdd = neededEnd - poolEnd
    if (pageCount + toAdd > STUDIO_BULK_MAX_BOOK_PAGES) {
      setError(
        `This bulk run needs too many pages (max ${STUDIO_BULK_MAX_BOOK_PAGES}). Reduce quantity.`,
      )
      return false
    }
    addPagesAt(poolEnd, toAdd)
    pagesAdded += toAdd
    pageCount += toAdd
    poolEnd += toAdd
    await yieldToMainThread()
    return true
  }

  for (let i = 0; i < variants.length; i++) {
    if (signal.aborted) return finish()

    const title = showTitle ? nextTitle : ''
    const config = mergeStudioBulkConfig(req.sharedConfig, {
      ...variants[i],
      title,
      showTitle,
    })

    const isFirst = i === 0
    const reservedForSheet = isFirst ? 0 : Math.max(0, poolEnd - writeCursor)

    const result = await runStudioGenerateOnce({
      req: {
        templateKey: req.templateKey,
        config,
        startPageIndex: writeCursor,
        mode: isFirst ? req.mode : 'replace',
        interiorPageCount: pageCount,
      },
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
      deferLiveSync: true,
      skipPageAllocation: !isFirst,
      reservedPageCount: reservedForSheet,
    })

    if (!result || signal.aborted) return finish()

    if (!firstInstanceId) firstInstanceId = result.instanceId
    allPageIndices.push(...result.pageIndices)
    instancesCompleted += 1
    if (result.isDuplicate) instancesDuplicated += 1

    if (isFirst) {
      pagesAdded += result.pagesAdded
      pageCount += result.pagesAdded
      const instanceEnd = findStudioInstanceEndPageIndex(
        canvasStateStore,
        pageCount,
        result.instanceId,
      )
      const maxIndex = Math.max(...result.pageIndices)
      writeCursor =
        instanceEnd >= 0 ? instanceEnd + 1 : Math.max(maxIndex + 1, pageCount)
      poolEnd = writeCursor

      const remaining = variants.length - 1
      if (remaining > 0) {
        const pagesPer = result.pageIndices.length
        if (!(await ensurePoolEnd(writeCursor + pagesPer * remaining))) {
          return finish()
        }
      }
    } else {
      pagesAdded += result.pagesAdded
      pageCount += result.pagesAdded
      poolEnd += result.pagesAdded
      writeCursor += result.pageIndices.length
    }

    if (showTitle) {
      nextTitle = bumpStudioGameTitle(nextTitle) ?? nextTitle
    }

    setProgress({ completed: i + 1, total: variants.length, countKind: 'instance' })
    await yieldToMainThread()
  }

  return finish()
}
