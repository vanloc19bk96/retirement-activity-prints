import { BookOpen, Copy, Loader2, ScanBarcode, Trash2 } from 'lucide-react'

import { CoverBackgroundSection } from '@/components/panels/cover-design/CoverBackgroundSection'
import { CoverFaceTextSection } from '@/components/panels/cover-design/CoverFaceTextSection'
import { Button } from '@/components/ui/button'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { useCoverFaceDesign } from '@/hooks/use-cover-face-design'
import {
  isCoverFaceDesignEmpty,
  type CoverFace,
  type CoverFaceDesign,
} from '@/types/book-cover-face.types'
import { dispatchOpenEditorPanel } from '@/utils/editor-panel-navigation'

const FACE_COPY: Record<CoverFace, { title: string; description: string; name: string }> = {
  front: {
    title: 'Front cover',
    description: 'Add a background and your title. Changes show on the cover right away.',
    name: 'Front cover',
  },
  back: {
    title: 'Back cover',
    description: 'Add a background and a short description that sells your book.',
    name: 'Back cover',
  },
}

/** What "Match front cover" copies to the back: the look, not the words. */
function frontLookPatch(front: CoverFaceDesign): Partial<CoverFaceDesign> {
  return {
    backgroundMode: front.backgroundMode,
    backgroundColor: front.backgroundColor,
    backgroundImageUrl: front.backgroundImageUrl,
    titleFontFamily: front.titleFontFamily,
    bodyFontFamily: front.bodyFontFamily,
    textColor: front.textColor,
    titleBold: front.titleBold,
    textShadow: front.textShadow,
  }
}

function FaceInfoCard({ face }: { face: CoverFace }): JSX.Element {
  const { bookCoverDimensions } = useCanvasSettings()
  if (face === 'back') {
    return (
      <div className="flex gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <ScanBarcode className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <p className="leading-relaxed">
          KDP prints the barcode in the box at the bottom right. Text from this panel always stays
          above it.
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">Trim size</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {bookCoverDimensions.trimWidthInches}" × {bookCoverDimensions.trimHeightInches}"
        </span>
      </div>
      <button
        type="button"
        onClick={() => dispatchOpenEditorPanel('bookInfo')}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-control-accent)] hover:underline"
      >
        <BookOpen className="h-3 w-3" aria-hidden />
        Change trim size or page count
      </button>
    </div>
  )
}

export function CoverFacePanel({ face, isOpen }: { face: CoverFace; isOpen: boolean }): JSX.Element {
  const {
    design,
    palette,
    isCoverReady,
    isLoaded,
    hasManualPositions,
    updateDesign,
    setTextColor,
    resetPositions,
    refreshPalette,
    removeDesign,
  } = useCoverFaceDesign(face, isOpen)
  // The back panel offers to match the front's look.
  const front = useCoverFaceDesign('front', face === 'back' && isOpen)
  const canMatchFront =
    face === 'back' && front.isLoaded && !isCoverFaceDesignEmpty('front', front.design)
  const copy = FACE_COPY[face]

  return (
    <div className="flex h-full flex-col">
      {/* Scrollbar sits in the sidebar padding so it never covers the controls. */}
      <div className="-mr-3 flex-1 space-y-5 overflow-y-auto pb-2 pr-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{copy.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{copy.description}</p>
        </div>

        <FaceInfoCard face={face} />

        {!isLoaded ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {isCoverReady ? 'Reading the cover…' : 'Waiting for the cover to load…'}
          </div>
        ) : (
          <>
            {canMatchFront && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                onClick={() => updateDesign(frontLookPatch(front.design))}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Match front cover background and fonts
              </Button>
            )}
            <hr className="border-border" />
            <CoverBackgroundSection
              name={copy.name}
              description={
                face === 'front'
                  ? 'Fills the front cover out to the bleed. Art you add stays on top of it.'
                  : 'Fills the back cover out to the bleed. Art you add stays on top of it.'
              }
              imageHint="The image is cropped to fill the cover, bleed included. JPG, PNG or WEBP at 300 DPI print best."
              thumbnail="page"
              value={design}
              palette={palette}
              onChange={updateDesign}
              onRefreshPalette={refreshPalette}
            />
            <hr className="border-border" />
            <CoverFaceTextSection
              face={face}
              design={design}
              palette={palette}
              hasManualPositions={hasManualPositions}
              onChange={updateDesign}
              onTextColorChange={setTextColor}
              onResetPositions={resetPositions}
            />
          </>
        )}
      </div>

      {isLoaded && (
        <div className="mt-4 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={isCoverFaceDesignEmpty(face, design)}
            onClick={removeDesign}
          >
            <Trash2 className="size-4" aria-hidden />
            Clear {face === 'front' ? 'front' : 'back'} cover
          </Button>
        </div>
      )}
    </div>
  )
}
