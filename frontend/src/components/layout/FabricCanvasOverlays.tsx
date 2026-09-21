import type { BookCoverDimensions, BookCoverZones } from '@/types/book-cover.types'
import type { MarginGuide } from '@/types/canvas-settings.types'
import type { ProjectBookInfo } from '@/types/projects.types'

import { MarginGuideOverlay } from './MarginGuideOverlay'
import { BookCoverGuideOverlay } from './BookCoverGuideOverlay'
import { CanvasLoadingOverlay } from './CanvasLoadingOverlay'

type FabricCanvasOverlaysProps = {
  isBookCover: boolean
  isLeftPage: boolean
  zoom: number
  showVisualGuide: boolean
  marginGuide: MarginGuide
  bookCoverDimensions: BookCoverDimensions
  bookCoverZones: BookCoverZones
  bookCoverGuideOpacity: number
  bookCoverPageCount: number
  bookCoverInfo: ProjectBookInfo | null
  isDropTargetActive: boolean
  isLoading: boolean
  isRestorePending: boolean
}

/**
 * Renders all non-interactive canvas overlays (margin guides, book-cover
 * zones, drop-target ring, loading spinner) in the correct stacking order.
 * Kept separate from the canvas container so selection controls can be composed independently.
 */
export function FabricCanvasOverlays({
  isBookCover,
  isLeftPage,
  zoom,
  showVisualGuide,
  marginGuide,
  bookCoverDimensions,
  bookCoverZones,
  bookCoverGuideOpacity,
  bookCoverPageCount,
  bookCoverInfo,
  isDropTargetActive,
  isLoading,
  isRestorePending,
}: FabricCanvasOverlaysProps): JSX.Element {
  return (
    <>
      {showVisualGuide && !isBookCover && (
        <MarginGuideOverlay marginGuide={marginGuide} isLeftPage={isLeftPage} zoom={zoom} />
      )}
      {isBookCover && (
        <BookCoverGuideOverlay
          zones={bookCoverZones}
          dimensions={bookCoverDimensions}
          pageCount={bookCoverPageCount}
          bookInfo={bookCoverInfo}
          zoom={zoom}
          opacity={bookCoverGuideOpacity}
        />
      )}
      {isDropTargetActive && (
        <div
          className="pointer-events-none absolute inset-0 z-[100] rounded-[2px] ring-2 ring-sky-500 ring-offset-2 ring-offset-background"
          aria-hidden
        />
      )}
      {(isLoading || isRestorePending) && <CanvasLoadingOverlay />}
    </>
  )
}
