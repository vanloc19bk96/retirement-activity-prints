import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BOOK_INTERIOR_TYPES_BY_BINDING,
  BOOK_PAPER_TYPES_BY_INTERIOR_TYPE,
  type BookBindingType,
  type BookReadingDirection,
} from '@/constants/book-information.constants'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { useToast } from '@/hooks/use-toast'
import { useProjectSettings } from '@/hooks/use-project-settings'
import { AMAZON_KDP_PAGE_SIZES, type PageSizeLabel } from '@/types/canvas-settings.types'
import type { ProjectBookInfo } from '@/types/projects.types'
import {
  clampBookCoverPageCount,
  isCompleteBookCoverPageCount,
  projectBookInfoEquals,
} from '@/utils/book-info'

const AUTO_APPLY_DELAY_MS = 800

function bookInfoFromState(
  bindingType: BookBindingType,
  interiorType: string,
  paperType: string,
  readingDirection: BookReadingDirection,
  trimBookSize: PageSizeLabel,
  pageCountInput: string,
): ProjectBookInfo {
  return {
    bindingType,
    interiorType,
    paperType,
    readingDirection,
    trimBookSize,
    pageCount: clampBookCoverPageCount(Number(pageCountInput)),
  }
}

function syncFormFromBookInfo(
  info: ProjectBookInfo,
  setters: {
    setAppliedSnapshot: (info: ProjectBookInfo) => void
    setBindingType: (value: BookBindingType) => void
    setInteriorType: (value: string) => void
    setPaperType: (value: string) => void
    setReadingDirection: (value: BookReadingDirection) => void
    setTrimBookSize: (value: PageSizeLabel) => void
    setPageCountInput: (value: string) => void
  },
): void {
  setters.setAppliedSnapshot(info)
  setters.setBindingType(info.bindingType)
  setters.setInteriorType(info.interiorType)
  setters.setPaperType(info.paperType)
  setters.setReadingDirection(info.readingDirection)
  setters.setTrimBookSize(info.trimBookSize)
  setters.setPageCountInput(String(info.pageCount))
}

export function useBookInfoForm() {
  const { settings, projectBookInfo, setProjectBookInfo, isProjectSettingsLoaded } = useCanvasSettings()
  const { saveSettings, isSaving } = useProjectSettings()
  const { toast } = useToast()

  const [appliedSnapshot, setAppliedSnapshot] = useState<ProjectBookInfo>(projectBookInfo)
  const [bindingType, setBindingType] = useState<BookBindingType>(projectBookInfo.bindingType)
  const [interiorType, setInteriorType] = useState(projectBookInfo.interiorType)
  const [paperType, setPaperType] = useState(projectBookInfo.paperType)
  const [readingDirection, setReadingDirection] = useState<BookReadingDirection>(
    projectBookInfo.readingDirection,
  )
  const [trimBookSize, setTrimBookSize] = useState<PageSizeLabel>(projectBookInfo.trimBookSize)
  const [pageCountInput, setPageCountInput] = useState(String(projectBookInfo.pageCount))

  useEffect(() => {
    syncFormFromBookInfo(projectBookInfo, {
      setAppliedSnapshot,
      setBindingType,
      setInteriorType,
      setPaperType,
      setReadingDirection,
      setTrimBookSize,
      setPageCountInput,
    })
  }, [projectBookInfo])

  const interiorOptions = useMemo(
    () => BOOK_INTERIOR_TYPES_BY_BINDING[bindingType],
    [bindingType],
  )
  const paperOptions = useMemo(
    () => BOOK_PAPER_TYPES_BY_INTERIOR_TYPE[interiorType] ?? ['White paper'],
    [interiorType],
  )
  const trimSizeOptions = useMemo(
    () =>
      AMAZON_KDP_PAGE_SIZES.map((label) => ({
        value: label,
        label,
      })),
    [],
  )

  useEffect(() => {
    if (!interiorOptions.includes(interiorType)) {
      setInteriorType(interiorOptions[0])
    }
  }, [interiorOptions, interiorType])

  useEffect(() => {
    if (!paperOptions.includes(paperType)) {
      setPaperType(paperOptions[0])
    }
  }, [paperOptions, paperType])

  const currentFormInfo = useMemo(
    () =>
      bookInfoFromState(
        bindingType,
        interiorType,
        paperType,
        readingDirection,
        trimBookSize,
        pageCountInput,
      ),
    [bindingType, interiorType, paperType, readingDirection, trimBookSize, pageCountInput],
  )

  const hasChanges = useMemo(
    () => !projectBookInfoEquals(currentFormInfo, appliedSnapshot),
    [appliedSnapshot, currentFormInfo],
  )

  const handlePageCountBlur = useCallback(() => {
    setPageCountInput(String(clampBookCoverPageCount(Number(pageCountInput))))
  }, [pageCountInput])

  const handleApply = useCallback(async () => {
    if (!isProjectSettingsLoaded) return
    const normalized = bookInfoFromState(
      bindingType,
      interiorType,
      paperType,
      readingDirection,
      trimBookSize,
      String(clampBookCoverPageCount(Number(pageCountInput))),
    )
    setPageCountInput(String(normalized.pageCount))

    try {
      const nextSettings = {
        pageSizeLabel: settings.pageSizeLabel,
        addBleed: settings.addBleed,
        showVisualGuide: settings.showVisualGuide,
        solutionsAtEnd: settings.solutionsAtEnd,
        solutionsPerPage: settings.solutionsPerPage,
        bookInfo: normalized,
      }
      await saveSettings(nextSettings)
      setProjectBookInfo(normalized)
      syncFormFromBookInfo(normalized, {
        setAppliedSnapshot,
        setBindingType,
        setInteriorType,
        setPaperType,
        setReadingDirection,
        setTrimBookSize,
        setPageCountInput,
      })
      toast({
        title: 'Book information applied',
        description: 'Cover dimensions have been updated from your book settings.',
      })
    } catch (err) {
      toast({
        title: 'Save failed',
        description:
          err instanceof Error ? err.message : 'Could not save book cover information.',
        variant: 'destructive',
      })
    }
  }, [
    bindingType,
    interiorType,
    isProjectSettingsLoaded,
    pageCountInput,
    paperType,
    readingDirection,
    saveSettings,
    setProjectBookInfo,
    settings.addBleed,
    settings.pageSizeLabel,
    settings.showVisualGuide,
    settings.solutionsAtEnd,
    settings.solutionsPerPage,
    toast,
    trimBookSize,
  ])

  // A page count typed and left, or followed by the sidebar's Save, must still be there on
  // the next visit. A failed save is not retried until the form changes again.
  const handleApplyRef = useRef(handleApply)
  handleApplyRef.current = handleApply
  const lastAutoApplyRef = useRef<ProjectBookInfo | null>(null)
  useEffect(() => {
    if (!isProjectSettingsLoaded || !hasChanges || isSaving) return
    if (!isCompleteBookCoverPageCount(pageCountInput)) return
    if (lastAutoApplyRef.current && projectBookInfoEquals(lastAutoApplyRef.current, currentFormInfo)) return
    const timer = window.setTimeout(() => {
      lastAutoApplyRef.current = currentFormInfo
      void handleApplyRef.current()
    }, AUTO_APPLY_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [currentFormInfo, hasChanges, isProjectSettingsLoaded, isSaving, pageCountInput])

  return {
    bindingType,
    setBindingType,
    interiorType,
    setInteriorType,
    paperType,
    setPaperType,
    readingDirection,
    setReadingDirection,
    trimBookSize,
    setTrimBookSize,
    pageCountInput,
    setPageCountInput,
    interiorOptions,
    paperOptions,
    trimSizeOptions,
    hasChanges,
    isSaving,
    isProjectSettingsLoaded,
    handlePageCountBlur,
    handleApply,
  }
}
