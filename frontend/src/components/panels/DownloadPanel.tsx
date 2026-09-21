import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { DownloadFormatTabs } from '@/components/panels/download-format-tabs'
import { DownloadProgressDialog } from '@/components/panels/download-progress-dialog'
import { getPlanLockedTooltip } from '@/constants/plan-lock-tooltips'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuthContext } from '@/context/AuthContext'
import { useCanvasExport } from '@/context/CanvasExportContext'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { useCanvasDownload } from '@/hooks/use-canvas-download'
import { useDownloadPageSelection } from '@/hooks/use-download-page-selection'
import { getDownloadQuotaNote, useDownloadQuota } from '@/hooks/use-download-quota'
import { useToast } from '@/hooks/use-toast'
import { isUserOnProPlan } from '@/utils/user-plan'
import { PRO_ONLY_DOWNLOAD_FORMATS, LARGE_DOWNLOAD_PAGE_THRESHOLD, type DownloadFormat } from '@/types/canvas-download.types'

const COVER_ALLOWED_PLANS = new Set(['standard', 'premium', 'pro'])

export function DownloadPanel(): JSX.Element {
  const { user } = useAuthContext()
  const { settings, pageDimensions, bookCoverDimensions, marginGuide } = useCanvasSettings()
  const { toast } = useToast()
  const { createExportSource } = useCanvasExport()
  const { quota, isLoading: isQuotaLoading, canDownload, quotaLabel, planLabel, consumeQuota } =
    useDownloadQuota(user)

  const normalizedPlan = user?.plan?.trim().toLowerCase() ?? null
  const isProLocked = !isUserOnProPlan(user)
  const isBookCoverLocked = user !== null && !COVER_ALLOWED_PLANS.has(normalizedPlan ?? '')

  const [format, setFormat] = useState<DownloadFormat>('png')
  const [shouldDownloadBookCover, setShouldDownloadBookCover] = useState(false)

  const notifyEmptySelection = useCallback(() => {
    toast({ title: 'At least one page', description: 'Please keep at least one page selected.' })
  }, [toast])

  const {
    pageList,
    selectedPageIndices,
    safePageCount,
    isAllSelected,
    isSomeSelected,
    toggleSelectAll,
    togglePage,
  } = useDownloadPageSelection({ pageCount: settings.pageCount, onEmptySelectionBlocked: notifyEmptySelection })

  const download = useCanvasDownload({
    createExportSource,
    pageDimensions,
    bookCoverDimensions,
    marginGuide,
    consumeQuota,
    notify: toast,
  })

  useEffect(() => {
    if (isBookCoverLocked) setShouldDownloadBookCover(false)
  }, [isBookCoverLocked])

  useEffect(() => {
    if (isProLocked && PRO_ONLY_DOWNLOAD_FORMATS.has(format)) setFormat('png')
  }, [format, isProLocked])

  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (selectAllCheckboxRef.current) selectAllCheckboxRef.current.indeterminate = isSomeSelected
  }, [isSomeSelected])

  const isCoverIncluded = shouldDownloadBookCover && !isBookCoverLocked
  const selectedItemsCount = selectedPageIndices.length + (isCoverIncluded ? 1 : 0)
  const shouldShowLargeExportNotice = selectedItemsCount >= LARGE_DOWNLOAD_PAGE_THRESHOLD

  const handleDownload = useCallback((): void => {
    if (isProLocked && PRO_ONLY_DOWNLOAD_FORMATS.has(format)) return
    if (!canDownload) {
      toast({
        title: 'Monthly download limit reached',
        description: `Your ${planLabel} plan allows ${quota?.monthly_download_limit ?? 0} downloads per month. Upgrade for more.`,
      })
      return
    }

    void download.startDownload({ format, interiorPageIndices: selectedPageIndices, includeCover: isCoverIncluded })
  }, [canDownload, download, format, isCoverIncluded, isProLocked, planLabel, quota, selectedPageIndices, toast])

  return (
    <TooltipProvider delayDuration={120}>
      <section className="w-full space-y-5 rounded-lg border border-border bg-card p-4">
        <header className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Download</h3>
          <p className="text-xs text-muted-foreground">
            Export your canvases as images, or as editable vectors (PDF, SVG, PPT).
          </p>
          {user && (
            <div className="space-y-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span>
                  Monthly downloads ({planLabel}):{' '}
                  <span className="font-medium text-foreground">{isQuotaLoading ? '…' : quotaLabel}</span>
                </span>
                {!canDownload && !isQuotaLoading && (
                  <span className="font-medium text-destructive">Limit reached</span>
                )}
              </div>
              {!isQuotaLoading && quota && (
                <p className="text-[10px] leading-relaxed text-muted-foreground">{getDownloadQuotaNote(quota)}</p>
              )}
            </div>
          )}
        </header>

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Format</p>
          <DownloadFormatTabs format={format} isProLocked={isProLocked} onSelect={setFormat} />
        </div>

        <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">Page size</span>
            <span className="text-muted-foreground">{settings.pageSizeLabel}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">Bleed</span>
            <span className="text-muted-foreground">{settings.addBleed ? 'Enabled' : 'Disabled'}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Note: Page size / bleed are applied from{' '}
            <span className="font-medium text-foreground">Settings</span>. Changes inside the Canvas Settings panel
            will affect your export.
          </p>
        </div>

        <div
          className={`flex items-center justify-between rounded-md border border-border bg-background px-2 py-1 ${
            isBookCoverLocked ? 'opacity-60' : ''
          }`}
          title={isBookCoverLocked ? getPlanLockedTooltip('Book cover download', 'standard') : undefined}
        >
          <label
            className={`flex items-center gap-2 text-xs text-foreground ${
              isBookCoverLocked ? 'cursor-not-allowed' : 'cursor-pointer'
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary disabled:cursor-not-allowed"
              aria-label="Download book cover"
              disabled={isBookCoverLocked}
              checked={isCoverIncluded}
              onChange={(event) => setShouldDownloadBookCover(event.target.checked)}
            />
            Download book cover
          </label>
          <span className="text-[11px] text-muted-foreground">
            {isBookCoverLocked ? 'Standard' : isCoverIncluded ? 'Included' : 'Excluded'}
          </span>
        </div>

        {safePageCount > 1 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-foreground">Pages to download</p>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  ref={selectAllCheckboxRef}
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-primary"
                  aria-label="Select all pages"
                  checked={isAllSelected}
                  onChange={(event) => toggleSelectAll(event.target.checked)}
                />
                Select all
              </label>
            </div>

            <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border bg-background p-2">
              {pageList.map((pageIndex) => (
                <label
                  key={pageIndex}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-accent"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-primary"
                      aria-label={`Select page ${pageIndex + 1}`}
                      checked={selectedPageIndices.includes(pageIndex)}
                      onChange={(event) => togglePage(pageIndex, event.target.checked)}
                    />
                    <span className="text-xs font-medium text-foreground">Page {pageIndex + 1}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">Interior</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Selected items: <span className="font-medium text-foreground">{selectedItemsCount}</span> /{' '}
          {safePageCount + (isCoverIncluded ? 1 : 0)}
        </p>

        {shouldShowLargeExportNotice && (
          <p
            role="note"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400"
          >
            Large export selected ({selectedItemsCount} pages). You can switch tabs; the export
            keeps running in the background (browsers may throttle it slightly).
          </p>
        )}

        <Button
          type="button"
          className="w-full"
          onClick={handleDownload}
          disabled={selectedItemsCount < 1 || download.isDownloading || isQuotaLoading || !canDownload}
          title={!canDownload ? 'Monthly download limit reached for your plan' : undefined}
        >
          {download.isDownloading
            ? 'Preparing download...'
            : !canDownload
              ? 'Monthly limit reached'
              : 'Download'}
        </Button>

        <DownloadProgressDialog
          open={download.isDialogOpen}
          onOpenChange={download.setDialogOpen}
          isDownloading={download.isDownloading}
          status={download.status}
          progress={download.progress}
          currentLabel={download.currentLabel}
          onClose={download.closeDialog}
        />
      </section>
    </TooltipProvider>
  )
}
