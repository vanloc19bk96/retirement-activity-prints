import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useAuthContext } from '@/context/AuthContext'
import { isUserStudioBookBuilderLocked } from '@/utils/user-plan'
import { useBook } from '@/context/BookContext'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { dispatchStudioGenerationDone } from '@/utils/studio/studio-events'
import {
  countStudioBulkTotal,
  validateStudioBulkJobs,
} from '@/utils/studio/studio-bulk'
import { getStudioTemplate } from '@/constants/studio-templates'
import { runStudioGenerateOnce } from '@/utils/studio/run-studio-generate'
import { collectStudioContentHashes } from '@/utils/studio/studio-content-history'
import { runStudioBulkGenerate } from '@/utils/studio/run-studio-bulk-generate'
import { runStudioBookGenerate } from '@/utils/studio/run-studio-book-generate'
import { resolveStudioOwnerKey } from '@/utils/studio/studio-owner-icon-pool'
import { yieldForUiPaint } from '@/utils/yield-for-ui-paint'
import { useStudioPageWriter } from './use-studio-page-writer'
import type {
  StudioBookGenerateRequest,
  StudioBulkGenerateRequest,
  StudioGenerateProgress,
  StudioGenerateRequest,
  StudioGenerateResult,
} from '@/types/studio-template.types'
import type { CanvasStateStore } from '@/utils/canvas-state-store'

export function useStudioGenerate(canvasStateStore: CanvasStateStore) {
  const { pageDimensions, marginGuide } = useCanvasSettings()
  const { user } = useAuthContext()
  const { bookId } = useBook()
  const ownerKey = useMemo(
    () => resolveStudioOwnerKey({ userId: user?.id, bookId }),
    [user?.id, bookId],
  )
  // Per-account puzzle salt (§4.1). Undefined for guests and for accounts that
  // predate the migration; seed derivation falls back to the owner key.
  const ownerSalt = user?.puzzle_salt ?? undefined
  const writePage = useStudioPageWriter({
    canvasStateStore,
    pageWidth: pageDimensions.widthPixels,
    pageHeight: pageDimensions.heightPixels,
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState<StudioGenerateProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const generate = useCallback(
    async (req: StudioGenerateRequest): Promise<StudioGenerateResult | null> => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      // Prefetch (AI) is one step; page layout/write is the second.
      const totalSteps = getStudioTemplate(req.templateKey)?.prefetch ? 2 : 1
      // Force dialog open + 0% to paint before long prefetch (same pattern as bulk/download).
      flushSync(() => {
        setIsGenerating(true)
        setProgress({ completed: 0, total: totalSteps, countKind: 'phase' })
        setError(null)
      })
      await yieldForUiPaint()
      try {
        const result = await runStudioGenerateOnce({
          req,
          pageWidth: pageDimensions.widthPixels,
          pageHeight: pageDimensions.heightPixels,
          marginGuide,
          writePage,
          canvasStateStore,
          signal: controller.signal,
          setError,
          ownerKey,
          ownerSalt,
          // A book filled one game at a time deserves the same protection as
          // one built in a single run: redraw when this sheet repeats a page
          // the book already holds.
          usedFingerprints: collectStudioContentHashes(
            canvasStateStore,
            req.interiorPageCount,
          ),
          setProgress,
        })
        if (!result || controller.signal.aborted) return null

        flushSync(() => {
          setProgress({ completed: totalSteps, total: totalSteps, countKind: 'phase' })
        })
        await yieldForUiPaint()

        dispatchStudioGenerationDone({
          instanceId: result.instanceId,
          pageIndices: result.pageIndices,
        })
        return result
      } catch (e) {
        if (abortRef.current?.signal.aborted) return null
        setError(e instanceof Error ? e.message : 'Generation failed')
        return null
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setIsGenerating(false)
        setProgress(null)
      }
    },
    [pageDimensions, marginGuide, writePage, canvasStateStore, ownerKey, ownerSalt],
  )

  const generateBulk = useCallback(
    async (req: StudioBulkGenerateRequest): Promise<StudioGenerateResult | null> => {
      const bulkError = validateStudioBulkJobs(req.jobs)
      if (bulkError) {
        setError(bulkError)
        return null
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const total = countStudioBulkTotal(req.jobs)
      // Force dialog open + 0% to paint before heavy sync work (same pattern as download).
      flushSync(() => {
        setIsGenerating(true)
        setProgress({ completed: 0, total, countKind: 'instance' })
        setError(null)
      })
      await yieldForUiPaint()

      try {
        return await runStudioBulkGenerate({
          req,
          pageWidth: pageDimensions.widthPixels,
          pageHeight: pageDimensions.heightPixels,
          marginGuide,
          writePage,
          canvasStateStore,
          signal: controller.signal,
          setError,
          setProgress,
          ownerKey,
          ownerSalt,
        })
      } catch (e) {
        if (abortRef.current?.signal.aborted) return null
        setError(e instanceof Error ? e.message : 'Generation failed')
        return null
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setIsGenerating(false)
        setProgress(null)
      }
    },
    [pageDimensions, marginGuide, writePage, canvasStateStore, ownerKey, ownerSalt],
  )

  const generateBook = useCallback(
    async (req: StudioBookGenerateRequest): Promise<StudioGenerateResult | null> => {
      if (isUserStudioBookBuilderLocked(user)) return null
      if (req.plan.length === 0) {
        setError('Add at least one game.')
        return null
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      // Force dialog open + 0% to paint before heavy sync work (same pattern as bulk).
      flushSync(() => {
        setIsGenerating(true)
        setProgress({ completed: 0, total: req.plan.length, countKind: 'instance' })
        setError(null)
      })
      await yieldForUiPaint()

      try {
        return await runStudioBookGenerate({
          req,
          pageWidth: pageDimensions.widthPixels,
          pageHeight: pageDimensions.heightPixels,
          marginGuide,
          writePage,
          canvasStateStore,
          signal: controller.signal,
          setError,
          setProgress,
          ownerKey,
          ownerSalt,
        })
      } catch (e) {
        if (abortRef.current?.signal.aborted) return null
        setError(e instanceof Error ? e.message : 'Generation failed')
        return null
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setIsGenerating(false)
        setProgress(null)
      }
    },
    [pageDimensions, marginGuide, writePage, canvasStateStore, ownerKey, ownerSalt, user],
  )

  return { generate, generateBulk, generateBook, cancel, isGenerating, progress, error }
}
