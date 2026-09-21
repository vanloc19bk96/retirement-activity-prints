import { createContext, useContext, useState, useCallback, useMemo, useEffect, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import type {
  CanvasSettings,
  PageSizeLabel,
  PageDimensions,
  MarginGuide,
} from '@/types/canvas-settings.types'
import {
  getDefaultCanvasSettings,
  parsePageSizeLabel,
  calculateDimensionsWithBleed,
  calculateMarginGuide,
} from '@/types/canvas-settings.types'
import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'
import {
  calculateBookCoverDimensions,
  calculateBookCoverZones,
} from '@/types/book-cover.types'
import type { ProjectBookInfo, ProjectSettings } from '@/types/projects.types'
import { useProjectSettingsSync } from '@/hooks/use-project-settings-sync'
import { KDP_MIN_PAGE_COUNT } from '@/constants/book-information.constants'
import { DEFAULT_PROJECT_BOOK_INFO, createDefaultProjectBookInfo, normalizeProjectBookInfo } from '@/utils/book-info'

interface ApplySettingsOptions {
  pageSizeLabel: PageSizeLabel
  addBleed: boolean
  showVisualGuide: boolean
  solutionsAtEnd: boolean
}

interface CanvasSettingsContextValue {
  isProjectSettingsLoading: boolean
  settings: CanvasSettings
  applySettings: (options: ApplySettingsOptions) => void
  setPageCount: (count: number) => void
  pageDimensions: PageDimensions
  marginGuide: MarginGuide
  bookCoverDimensions: BookCoverDimensions
  bookCoverZones: BookCoverZones
  projectBookInfo: ProjectBookInfo
  setProjectBookInfo: (bookInfo: ProjectBookInfo) => void
}

const CanvasSettingsContext = createContext<CanvasSettingsContextValue | null>(null)

interface CanvasSettingsProviderProps {
  children: ReactNode
}

export function CanvasSettingsProvider({ children }: CanvasSettingsProviderProps): JSX.Element {
  const [settings, setSettings] = useState<CanvasSettings>(getDefaultCanvasSettings)
  const [projectBookInfo, setProjectBookInfo] = useState<ProjectBookInfo>(DEFAULT_PROJECT_BOOK_INFO)

  const defaultProjectSettings: ProjectSettings = {
    pageSizeLabel: settings.pageSizeLabel,
    addBleed: settings.addBleed,
    showVisualGuide: settings.showVisualGuide,
    solutionsAtEnd: settings.solutionsAtEnd,
  }

  const { error: projectSettingsError, isLoading: isProjectSettingsLoading, projectSettings } = useProjectSettingsSync(defaultProjectSettings)

  useLayoutEffect(() => {
    if (!projectSettings) return

    setSettings((prev) => {
      const trimDimensions = parsePageSizeLabel(projectSettings.pageSizeLabel)
      const pageDimensions = calculateDimensionsWithBleed(trimDimensions, projectSettings.addBleed)
      const marginGuide = calculateMarginGuide(prev.pageCount, projectSettings.addBleed)

      return {
        ...prev,
        pageSizeLabel: projectSettings.pageSizeLabel,
        trimDimensions,
        pageDimensions,
        addBleed: projectSettings.addBleed,
        showVisualGuide: projectSettings.showVisualGuide,
        // An API that predates the option omits it.
        solutionsAtEnd: projectSettings.solutionsAtEnd === true,
        marginGuide,
      }
    })

    setProjectBookInfo(
      normalizeProjectBookInfo(
        projectSettings.bookInfo,
        createDefaultProjectBookInfo(projectSettings.pageSizeLabel, KDP_MIN_PAGE_COUNT),
      ),
    )
  }, [projectSettings])

  useEffect(() => {
    if (!projectSettingsError) return
    // Non-blocking: app still works with local default settings.
    // eslint-disable-next-line no-console
    console.error('project_settings_load_failed', projectSettingsError)
  }, [projectSettingsError])

  const applySettings = useCallback(
    ({
      pageSizeLabel,
      addBleed,
      showVisualGuide,
      solutionsAtEnd,
    }: ApplySettingsOptions): void => {
      setSettings((prev) => {
        const trimDimensions = parsePageSizeLabel(pageSizeLabel)
        const pageDimensions = calculateDimensionsWithBleed(trimDimensions, addBleed)
        const marginGuide = calculateMarginGuide(prev.pageCount, addBleed)

        return {
          ...prev,
          pageSizeLabel,
          trimDimensions,
          pageDimensions,
          addBleed,
          showVisualGuide,
          solutionsAtEnd,
          marginGuide,
        }
      })
    },
    [],
  )

  const setPageCount = useCallback((count: number): void => {
    setSettings((prev) => {
      const marginGuide = calculateMarginGuide(count, prev.addBleed)
      return { ...prev, pageCount: count, marginGuide }
    })
  }, [])

  const coverTrimDimensions = useMemo(
    () => parsePageSizeLabel(projectBookInfo.trimBookSize),
    [projectBookInfo.trimBookSize],
  )

  const bookCoverDimensions = useMemo(
    () =>
      calculateBookCoverDimensions(
        coverTrimDimensions,
        projectBookInfo.pageCount,
        projectBookInfo,
      ),
    [coverTrimDimensions, projectBookInfo],
  )

  const bookCoverZones = useMemo(
    () => calculateBookCoverZones(bookCoverDimensions),
    [bookCoverDimensions],
  )

  const value = useMemo<CanvasSettingsContextValue>(
    () => ({
      isProjectSettingsLoading,
      settings,
      applySettings,
      setPageCount,
      pageDimensions: settings.pageDimensions,
      marginGuide: settings.marginGuide,
      bookCoverDimensions,
      bookCoverZones,
      projectBookInfo,
      setProjectBookInfo,
    }),
    [
      isProjectSettingsLoading,
      settings,
      applySettings,
      setPageCount,
      bookCoverDimensions,
      bookCoverZones,
      projectBookInfo,
    ],
  )

  return (
    <CanvasSettingsContext.Provider value={value}>
      {children}
    </CanvasSettingsContext.Provider>
  )
}

export function useCanvasSettings(): CanvasSettingsContextValue {
  const context = useContext(CanvasSettingsContext)
  if (!context) {
    throw new Error('useCanvasSettings must be used within a CanvasSettingsProvider')
  }
  return context
}
