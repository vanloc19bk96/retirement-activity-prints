import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { PopoverSelect } from '@/components/ui/popover-select'
import { useToast } from '../../hooks/use-toast'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { useProjectSettings } from '@/hooks/use-project-settings'
import type { ProjectSettings } from '@/types/projects.types'
import {
  AMAZON_KDP_PAGE_SIZES,
  DEFAULT_PAGE_SIZE_LABEL,
  type PageSizeLabel,
  calculateDimensionsWithBleed,
  getInsideMarginInches,
  getOutsideMarginInches,
  parsePageSizeLabel,
} from '@/types/canvas-settings.types'
import { useAuthContext } from '@/context/AuthContext'
import { isUserOnStarterPlan } from '@/utils/user-plan'
import { projectsApi } from '@/api/projects.api'
import type { PageSizeOption } from '@/types/projects.types'
import { dispatchStudioArrangeSolutions } from '@/utils/studio/studio-events'
import { toStudioSolutionPlacement } from '@/utils/studio/studio-solution-placement'

export function SettingPanel(): JSX.Element {
  const { user } = useAuthContext()
  const isStarterPlan = isUserOnStarterPlan(user)

  const { settings, applySettings, projectBookInfo } = useCanvasSettings()
  const { toast } = useToast()
  const { isSaving, saveSettings } = useProjectSettings()

  const [pageSizeOptions, setPageSizeOptions] = useState<PageSizeOption[] | null>(null)
  const [pageSizeOptionsError, setPageSizeOptionsError] = useState<string | null>(null)

  const [selectedPageSize, setSelectedPageSize] = useState<PageSizeLabel>(settings.pageSizeLabel)
  const [selectedAddBleed, setSelectedAddBleed] = useState(settings.addBleed)
  const [selectedShowVisualGuide, setSelectedShowVisualGuide] = useState(settings.showVisualGuide)
  const [selectedSolutionsAtEnd, setSelectedSolutionsAtEnd] = useState(settings.solutionsAtEnd)

  const selectablePageSizeLabels = useMemo(
    () => new Set<string>(AMAZON_KDP_PAGE_SIZES),
    [],
  )

  useEffect(() => {
    const nextPageSize = selectablePageSizeLabels.has(settings.pageSizeLabel)
      ? settings.pageSizeLabel
      : DEFAULT_PAGE_SIZE_LABEL
    setSelectedPageSize(nextPageSize)
    setSelectedAddBleed(settings.addBleed)
    setSelectedShowVisualGuide(settings.showVisualGuide)
    setSelectedSolutionsAtEnd(settings.solutionsAtEnd)
  }, [
    selectablePageSizeLabels,
    settings.pageSizeLabel,
    settings.addBleed,
    settings.showVisualGuide,
    settings.solutionsAtEnd,
  ])

  const hasPendingChanges =
    selectedPageSize !== settings.pageSizeLabel ||
    selectedAddBleed !== settings.addBleed ||
    selectedShowVisualGuide !== settings.showVisualGuide ||
    selectedSolutionsAtEnd !== settings.solutionsAtEnd

  const previewTrimDimensions = parsePageSizeLabel(selectedPageSize)
  const previewDimensions = calculateDimensionsWithBleed(previewTrimDimensions, selectedAddBleed)
  const previewInsideMargin = getInsideMarginInches(settings.pageCount)
  const previewOutsideMargin = getOutsideMarginInches(selectedAddBleed)

  const sortedPageSizeOptions = useMemo(() => {
    const fallbackLabel = selectablePageSizeLabels.has(settings.pageSizeLabel)
      ? settings.pageSizeLabel
      : DEFAULT_PAGE_SIZE_LABEL
    const fallback: PageSizeOption[] = [
      {
        label: fallbackLabel,
        min_plan: 'Starter',
        sort_order: 0,
        is_locked: false,
      },
    ]
    const options = (pageSizeOptions ?? fallback).filter((option) =>
      selectablePageSizeLabels.has(option.label),
    )
    return [...options].sort((a, b) => {
      const aLocked = Boolean(a.is_locked)
      const bLocked = Boolean(b.is_locked)
      if (aLocked !== bLocked) return aLocked ? 1 : -1
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return a.label.localeCompare(b.label)
    })
  }, [pageSizeOptions, selectablePageSizeLabels, settings.pageSizeLabel])

  const pageSizeSelectOptions = useMemo(
    () =>
      sortedPageSizeOptions.map((option) => ({
        value: option.label,
        label: option.label,
        disabled: Boolean(option.is_locked),
      })),
    [sortedPageSizeOptions],
  )

  useEffect(() => {
    let cancelled = false

    async function loadOptions(): Promise<void> {
      setPageSizeOptionsError(null)
      try {
        const result = await projectsApi.getPageSizeOptions()
        if (!cancelled) setPageSizeOptions(result.options)
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Failed to load page sizes'
        if (!cancelled) setPageSizeOptionsError(message)
      }
    }

    void loadOptions()

    return () => {
      cancelled = true
    }
  }, [])

  function handleSelectPageSize(sizeLabel: string): void {
    setSelectedPageSize(sizeLabel as PageSizeLabel)
  }

  function handleAddBleedChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setSelectedAddBleed(event.target.checked)
  }

  function handleShowVisualGuideChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setSelectedShowVisualGuide(event.target.checked)
  }

  function handleSolutionsAtEndChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setSelectedSolutionsAtEnd(event.target.checked)
  }

  function buildNextSettings(): ProjectSettings {
    return {
      pageSizeLabel: selectedPageSize,
      addBleed: selectedAddBleed,
      showVisualGuide: selectedShowVisualGuide,
      solutionsAtEnd: selectedSolutionsAtEnd,
      bookInfo: projectBookInfo,
    }
  }

  async function handleApplySettings(): Promise<void> {
    const nextSettings = buildNextSettings()
    const hasSolutionPlacementChanged = nextSettings.solutionsAtEnd !== settings.solutionsAtEnd

    try {
      await saveSettings(nextSettings)
      applySettings(nextSettings)
      if (hasSolutionPlacementChanged) {
        dispatchStudioArrangeSolutions({
          placement: toStudioSolutionPlacement(nextSettings.solutionsAtEnd),
        })
      }

      const bleedText = selectedAddBleed ? ' (with bleed)' : ''
      toast({
        title: 'Settings saved',
        description: `Canvas size: ${previewDimensions.widthInches} × ${previewDimensions.heightInches} in${bleedText}`,
      })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to save settings'
      toast({
        title: 'Save failed',
        description: message,
      })
    }
  }

  return (
    <section className="flex w-full flex-col rounded-lg border border-border bg-card">
      <div className="space-y-5 p-4 pb-2">
        <header className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Canvas Settings</h3>
          <p className="text-xs text-muted-foreground">Choose Amazon KDP standard size and print options.</p>
        </header>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Canvas page size</p>
          <PopoverSelect
            id="canvas-page-size"
            value={selectedPageSize}
            onChange={handleSelectPageSize}
            options={pageSizeSelectOptions}
            ariaLabel="Canvas page size"
            title={
              isStarterPlan
                ? 'Starter: only 8.5×11, 8.25×11, 7.5×9.25, 6×9, and 5×8 trim sizes are selectable'
                : undefined
            }
            className={isStarterPlan ? 'text-muted-foreground' : undefined}
          />
          <p
            role="note"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-700 dark:text-amber-400"
          >
            7.5 × 9.25 in is the most common size for this type of book on Amazon. Smaller sizes can
            make the pages harder to read.
          </p>
          {pageSizeOptionsError && (
            <p className="text-xs text-destructive">Failed to load page sizes: {pageSizeOptionsError}</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="space-y-2 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                aria-label="Add bleed"
                checked={selectedAddBleed}
                onChange={handleAddBleedChange}
              />
              Add bleed
            </label>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Amazon KDP Standards</p>
              <p className="font-medium text-foreground">Bleed (for full-page content):</p>
              <p>• Width: +0.125&quot; (outside edge only)</p>
              <p>• Height: +0.25&quot; (top + bottom)</p>
              <p className="pt-1 font-medium text-foreground">Margins:</p>
              <p>• Top/Bottom/Outside: 0.25&quot; (no bleed) or 0.375&quot; (with bleed)</p>
              <p>• Inside (gutter): 0.375&quot; - 0.875&quot; based on page count</p>
              <p className="pt-1">Example: 8.5×11&quot; → 8.625×11.25&quot; with bleed</p>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                aria-label="Show visual guide"
                checked={selectedShowVisualGuide}
                onChange={handleShowVisualGuideChange}
              />
              Show visual guide
            </label>
            <p className="text-xs text-muted-foreground">
              Display Amazon KDP margin guides on canvas (safe area).
            </p>
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                aria-label="Put solutions at the end of the book"
                checked={selectedSolutionsAtEnd}
                onChange={handleSolutionsAtEndChange}
              />
              Put solutions at the end of the book
            </label>
            <p className="text-xs text-muted-foreground">
              Studio solution pages are grouped after all games instead of right after each
              game. Applies to pages already in the book and to new games.
            </p>
          </div>

        </div>

        <div className="space-y-3">
          <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Trim size:</span>
              <span className="text-muted-foreground">
                {previewTrimDimensions.widthInches} × {previewTrimDimensions.heightInches} in
              </span>
            </div>
            {selectedAddBleed && (
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">With bleed:</span>
                <span className="text-muted-foreground">
                  {previewDimensions.widthInches.toFixed(3)} × {previewDimensions.heightInches.toFixed(2)} in
                </span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
              <span className="font-medium text-foreground">Canvas size:</span>
              <span className="font-medium text-foreground">
                {previewDimensions.widthInches} × {previewDimensions.heightInches} in
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Page count:</span>
              <span className="text-muted-foreground">{settings.pageCount} pages</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Inside margin:</span>
              <span className="text-muted-foreground">{previewInsideMargin} in</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Outside margin:</span>
              <span className="text-muted-foreground">{previewOutsideMargin} in</span>
            </div>
          </div>
        </div>
      </div>

      <footer className="sticky bottom-0 z-10 rounded-b-lg border-t border-border bg-[var(--color-card)] p-4 pt-3">
        <Button
          type="button"
          className="w-full disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground"
          onClick={handleApplySettings}
          disabled={!hasPendingChanges || isSaving}
        >
          {isSaving ? 'Saving...' : 'Apply'}
        </Button>
      </footer>
    </section>
  )
}
