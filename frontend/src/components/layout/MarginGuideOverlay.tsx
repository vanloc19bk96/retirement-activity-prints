import type { MarginGuide } from '@/types/canvas-settings.types'

interface MarginGuideOverlayProps {
  marginGuide: MarginGuide
  isLeftPage: boolean
  zoom: number
}

export function MarginGuideOverlay({
  marginGuide,
  isLeftPage,
  zoom,
}: MarginGuideOverlayProps): JSX.Element {
  const {
    topPixels,
    bottomPixels,
    insidePixels,
    outsidePixels,
    bleedTopPixels,
    bleedBottomPixels,
    bleedOutsidePixels,
  } = marginGuide

  const safeTop = (bleedTopPixels + topPixels) * zoom
  const safeBottom = (bleedBottomPixels + bottomPixels) * zoom
  const safeLeft = (isLeftPage ? bleedOutsidePixels + outsidePixels : insidePixels) * zoom
  const safeRight = (isLeftPage ? insidePixels : bleedOutsidePixels + outsidePixels) * zoom

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2]"
      aria-hidden="true"
    >
      {/* An outline, not a border: a border paints over the safe area's own
          edge, so content set flush on it looked like it printed past it. */}
      <div
        className="absolute"
        style={{
          top: safeTop,
          left: safeLeft,
          right: safeRight,
          bottom: safeBottom,
          outline: '2px dashed #ef4444',
        }}
      />
    </div>
  )
}
