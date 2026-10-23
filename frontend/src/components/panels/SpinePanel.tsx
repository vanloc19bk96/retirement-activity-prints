import { BookOpen, Loader2, Trash2 } from 'lucide-react'

import { CoverBackgroundSection } from '@/components/panels/cover-design/CoverBackgroundSection'
import { SpineTextSection } from '@/components/panels/spine/SpineTextSection'
import { Button } from '@/components/ui/button'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { useCoverFaceDesign } from '@/hooks/use-cover-face-design'
import { useSpineDesign } from '@/hooks/use-spine-design'
import { canShowSpineText } from '@/types/book-cover.types'
import { isSpineDesignEmpty } from '@/types/book-cover-spine.types'
import { dispatchOpenEditorPanel } from '@/utils/editor-panel-navigation'

const MM_PER_INCH = 25.4

function SpineInfoCard({
  spineWidthInches,
  pageCount,
  paperType,
}: {
  spineWidthInches: number
  pageCount: number
  paperType: string
}): JSX.Element {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">Spine width</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {spineWidthInches.toFixed(3)}"{' '}
          <span className="text-xs font-normal text-muted-foreground">
            ({(spineWidthInches * MM_PER_INCH).toFixed(2)} mm)
          </span>
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {pageCount} pages · {paperType}
      </p>
      <button
        type="button"
        onClick={() => dispatchOpenEditorPanel('bookInfo')}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-control-accent)] hover:underline"
      >
        <BookOpen className="h-3 w-3" aria-hidden />
        Change page count or paper
      </button>
    </div>
  )
}

export function SpinePanel({ isOpen }: { isOpen: boolean }): JSX.Element {
  const { bookCoverDimensions, projectBookInfo } = useCanvasSettings()
  const {
    design,
    palette,
    isCoverReady,
    isLoaded,
    updateDesign,
    setTextColor,
    refreshPalette,
    removeDesign,
  } = useSpineDesign(isOpen)

  // Lets the spine reuse the title and author already typed for the front cover.
  const front = useCoverFaceDesign('front', isOpen)
  const frontTitle = front.design.title.trim().replace(/\s+/g, ' ')
  const frontAuthor = front.design.author.trim()
  const canCopyFromFront =
    front.isLoaded &&
    (frontTitle.length > 0 || frontAuthor.length > 0) &&
    (design.title !== frontTitle || design.author !== frontAuthor)

  const pageCount = projectBookInfo.pageCount
  const canHaveText = canShowSpineText(pageCount, projectBookInfo)

  return (
    <div className="flex h-full flex-col">
      {/* Scrollbar sits in the sidebar padding so it never covers the controls. */}
      <div className="-mr-3 flex-1 space-y-5 overflow-y-auto pb-2 pr-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Spine</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Design the spine of your book. Changes show on the cover right away.
          </p>
        </div>

        <SpineInfoCard
          spineWidthInches={bookCoverDimensions.spineWidthInches}
          pageCount={pageCount}
          paperType={projectBookInfo.paperType}
        />

        {!isLoaded ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {isCoverReady ? 'Reading the spine…' : 'Waiting for the cover to load…'}
          </div>
        ) : (
          <>
            <hr className="border-border" />
            <CoverBackgroundSection
              name="Spine"
              description="Fills the spine between the two fold lines, including the bleed."
              imageHint="The image is cropped to fill the spine. Tall images or textures work best. JPG, PNG or WEBP."
              thumbnail="strip"
              value={design}
              palette={palette}
              onChange={updateDesign}
              onRefreshPalette={refreshPalette}
            />
            <hr className="border-border" />
            <SpineTextSection
              design={design}
              palette={palette}
              pageCount={pageCount}
              canHaveText={canHaveText}
              onChange={updateDesign}
              onTextColorChange={setTextColor}
              onCopyFromFront={
                canCopyFromFront
                  ? () => updateDesign({ title: frontTitle, author: frontAuthor })
                  : undefined
              }
            />
            {canHaveText && (
              <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                Spine text stays inside the spine's safe area, clear of both fold lines. You can still
                click it on the cover to edit, but changing a setting here centers it again.
              </div>
            )}
          </>
        )}
      </div>

      {isLoaded && (
        <div className="mt-4 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={isSpineDesignEmpty(design)}
            onClick={removeDesign}
          >
            <Trash2 className="size-4" aria-hidden />
            Clear spine
          </Button>
        </div>
      )}
    </div>
  )
}
