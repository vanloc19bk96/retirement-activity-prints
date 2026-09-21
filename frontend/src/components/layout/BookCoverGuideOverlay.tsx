import type { BookCoverZones, BookCoverDimensions } from '@/types/book-cover.types'
import type { ProjectBookInfo } from '@/types/projects.types'

interface BookCoverGuideOverlayProps {
  zones: BookCoverZones
  dimensions: BookCoverDimensions
  pageCount: number
  bookInfo: ProjectBookInfo | null
  zoom: number
  opacity: number
}

const COLORS = {
  bleed: '#f8ab8f',
  trim: '#000000',
  spineFold: '#0000ff',
  barcode: '#fff200',
  warning: '#cc0000',
} as const

const INCH_TO_MM = 25.4
const BARCODE_WIDTH_INCHES = 2
const BARCODE_HEIGHT_INCHES = 1.2

type Rect = { x: number; y: number; width: number; height: number }

const toMm = (inches: number) => (inches * INCH_TO_MM).toFixed(2)
const fontSize = (basePx: number, zoom: number) => {
  const clamped = Math.max(0.6, Math.min(zoom, 1.3))
  return Math.max(6, basePx * clamped)
}

const LEGEND_ENTRIES = [
  {
    label: 'Black Solid Line = Trim Size',
    desc: 'This is where your book will be cut to produce the final trim size.',
  },
  {
    label: 'Blue Dashed Line = Spine Fold',
    desc: 'Fold placement may vary slightly.',
  },
  {
    label: 'White Area = Live Area',
    desc: 'Position logos, text, and essential images in this area.',
  },
  {
    label: 'Red Area = Out of Live/Bleed',
    desc: 'Your background artwork must fill the red area. Do not place logos, text, or essential images in the red area. If your artwork does not meet these requirements, it may be rejected.',
  },
] as const

export function BookCoverGuideOverlay({
  zones,
  dimensions,
  pageCount,
  bookInfo,
  zoom,
  opacity,
}: BookCoverGuideOverlayProps): JSX.Element {
  const guideOpacity = Math.max(0, Math.min(1, opacity))
  const spineWidthInches = dimensions.spineWidthInches
  const spineInches = spineWidthInches.toFixed(3)
  const normalizedPageCount = Math.max(pageCount, 24)
  const { trimWidthInches: trimW, trimHeightInches: trimH } = dimensions
  const isRightToLeft = bookInfo?.readingDirection?.trim().toLowerCase() === 'right to left'
  const templateInfoZone = isRightToLeft ? zones.backCover : zones.frontCover
  const legendSafeArea = isRightToLeft ? zones.frontSafeArea : zones.backSafeArea

  return (
    <div
      // Render guide underneath Fabric objects in book-cover mode.
      className="pointer-events-none absolute inset-0 z-0"
      style={{ opacity: guideOpacity }}
      aria-hidden="true"
    >
      <BleedShading dimensions={dimensions} zoom={zoom} />
      <FullTemplateOutline dimensions={dimensions} zoom={zoom} />
      <TrimOutline zone={zones.backCover} zoom={zoom} skipBorder="right" />
      <TrimOutline zone={zones.frontCover} zoom={zoom} skipBorder="left" />
      <SpineFoldLines spine={zones.spine} zoom={zoom} fullHeight={dimensions.fullHeightPixels} />
      <BarcodeZone zone={zones.barcodeArea} zoom={zoom} />
      <BackCoverLegend safeArea={legendSafeArea} zoom={zoom} alignRight={isRightToLeft} />
      <FrontCoverInfo
        zone={templateInfoZone}
        zoom={zoom}
        trimW={trimW}
        trimH={trimH}
        fullW={dimensions.fullWidthInches}
        fullH={dimensions.fullHeightInches}
        spineInches={spineInches}
        spineWidthInches={spineWidthInches}
        pageCount={normalizedPageCount}
        bookInfo={bookInfo}
      />
      <CornerLabel
        zone={zones.backCover} zoom={zoom} position="bottom-left"
        title="Back Cover" sizeText={`${trimW}" x ${trimH}"`}
        sizeMm={`(${toMm(trimW)}mm x ${toMm(trimH)}mm)`}
      />
      <CornerLabel
        zone={zones.frontCover} zoom={zoom} position="bottom-right"
        title="Front Cover" sizeText={`${trimW}" x ${trimH}"`}
        sizeMm={`(${toMm(trimW)}mm x ${toMm(trimH)}mm)`}
      />
    </div>
  )
}

function BleedShading({ dimensions, zoom }: { dimensions: BookCoverDimensions; zoom: number }) {
  const b = dimensions.bleedPixels
  const w = dimensions.fullWidthPixels
  const h = dimensions.fullHeightPixels
  const bg = { backgroundColor: COLORS.bleed }
  const bleedBoundary = `1px solid ${COLORS.bleed}`

  return (
    <>
      <div className="absolute" style={{ left: 0, top: 0, width: w * zoom, height: b * zoom, ...bg }} />
      <div className="absolute" style={{ left: 0, top: (h - b) * zoom, width: w * zoom, height: b * zoom, ...bg }} />
      <div className="absolute" style={{ left: 0, top: b * zoom, width: b * zoom, height: (h - b * 2) * zoom, ...bg }} />
      <div className="absolute" style={{ left: (w - b) * zoom, top: b * zoom, width: b * zoom, height: (h - b * 2) * zoom, ...bg }} />
      <div
        className="absolute"
        style={{ left: 0, top: b * zoom, width: w * zoom, height: 0, borderTop: bleedBoundary }}
      />
      <div
        className="absolute"
        style={{ left: 0, top: (h - b) * zoom, width: w * zoom, height: 0, borderTop: bleedBoundary }}
      />
      <div
        className="absolute"
        style={{ left: b * zoom, top: 0, width: 0, height: h * zoom, borderLeft: bleedBoundary }}
      />
      <div
        className="absolute"
        style={{ left: (w - b) * zoom, top: 0, width: 0, height: h * zoom, borderLeft: bleedBoundary }}
      />
    </>
  )
}

function FullTemplateOutline({ dimensions, zoom }: { dimensions: BookCoverDimensions; zoom: number }) {
  return (
    <div
      className="absolute"
      style={{
        left: 0,
        top: 0,
        width: dimensions.fullWidthPixels * zoom,
        height: dimensions.fullHeightPixels * zoom,
        border: `1px solid ${COLORS.trim}`,
      }}
    />
  )
}

function TrimOutline({ zone, zoom, skipBorder }: {
  zone: Rect; zoom: number; skipBorder?: 'left' | 'right'
}) {
  return (
    <div
      className="absolute"
      style={{
        left: zone.x * zoom,
        top: zone.y * zoom,
        width: zone.width * zoom,
        height: zone.height * zoom,
        border: `1px solid ${COLORS.trim}`,
        ...(skipBorder === 'left' && { borderLeft: 'none' }),
        ...(skipBorder === 'right' && { borderRight: 'none' }),
      }}
    />
  )
}

function SpineFoldLines({ spine, zoom, fullHeight }: { spine: Rect; zoom: number; fullHeight: number }) {
  const h = fullHeight * zoom
  const dashedBorder = `1.5px dashed ${COLORS.spineFold}`

  return (
    <>
      <div className="absolute" style={{ left: spine.x * zoom, top: 0, width: 0, height: h, borderLeft: dashedBorder }} />
      <div className="absolute" style={{ left: (spine.x + spine.width) * zoom, top: 0, width: 0, height: h, borderLeft: dashedBorder }} />
    </>
  )
}

function BarcodeZone({ zone, zoom }: { zone: Rect; zoom: number }) {
  const fs = (px: number) => fontSize(px, zoom)

  return (
    <div
      className="absolute flex flex-col items-center justify-center"
      style={{
        left: zone.x * zoom,
        top: zone.y * zoom,
        width: zone.width * zoom,
        height: zone.height * zoom,
        backgroundColor: COLORS.barcode,
      }}
    >
      <span className="text-center font-bold leading-tight text-black" style={{ fontSize: fs(9) }}>
        Barcode
      </span>
      <span className="text-center font-bold leading-tight text-black" style={{ fontSize: fs(8) }}>
        Location &amp; Size
      </span>
      <span className="text-center font-bold leading-tight text-black" style={{ fontSize: fs(8) }}>
        {BARCODE_WIDTH_INCHES.toFixed(3)}&quot; x {BARCODE_HEIGHT_INCHES.toFixed(3)}&quot;
      </span>
      <span className="text-center font-bold leading-tight text-black" style={{ fontSize: fs(7) }}>
        ({toMm(BARCODE_WIDTH_INCHES)}mm x {toMm(BARCODE_HEIGHT_INCHES)}mm)
      </span>
    </div>
  )
}

function BackCoverLegend({
  safeArea,
  zoom,
  alignRight = false,
}: {
  safeArea: Rect
  zoom: number
  alignRight?: boolean
}) {
  const fs = (px: number) => fontSize(px, zoom)
  const pad = 12 * Math.max(0.6, Math.min(zoom, 1.3))

  return (
    <div
      className="absolute overflow-hidden"
      style={{
        left: safeArea.x * zoom + pad,
        top: safeArea.y * zoom + pad,
        width: safeArea.width * zoom - pad * 2,
        maxHeight: safeArea.height * zoom * 0.8,
        textAlign: alignRight ? 'right' : 'left',
      }}
    >
      {LEGEND_ENTRIES.map(({ label, desc }) => (
        <div key={label} style={{ marginBottom: fs(5) }}>
          <div style={{ fontSize: fs(10), fontWeight: 700, color: '#000' }}>{label}</div>
          <div style={{ fontSize: fs(7), color: '#444', lineHeight: 1.3 }}>{desc}</div>
        </div>
      ))}
      <div style={{ marginTop: fs(6) }}>
        <div style={{ fontSize: fs(10), fontWeight: 700, color: COLORS.warning }}>
          REMOVE THIS TEMPLATE LAYER FROM FINAL ARTWORK.
        </div>
        <div style={{ fontSize: fs(7), color: '#444', lineHeight: 1.3 }}>
          Whatever is visible in your digital artwork will also be visible in your printed artwork.
        </div>
      </div>
    </div>
  )
}

function FrontCoverInfo({
  zone, zoom, trimW, trimH, fullW, fullH, spineInches, spineWidthInches, pageCount, bookInfo,
}: {
  zone: Rect; zoom: number
  trimW: number; trimH: number; fullW: number; fullH: number
  spineInches: string
  spineWidthInches: number
  pageCount: number
  bookInfo: ProjectBookInfo | null
}) {
  const fs = (px: number) => fontSize(px, zoom)
  const centerX = (zone.x + zone.width / 2) * zoom
  const startY = (zone.y + zone.height * 0.12) * zoom
  const bindingLabel = bookInfo?.bindingType?.trim() || 'paperback'
  const interiorTypeLabel = bookInfo?.interiorType?.trim() || 'Black & White'
  const paperTypeLabel = bookInfo?.paperType?.trim() || 'White paper'
  const readingDirectionLabel = bookInfo?.readingDirection?.trim() || 'Left to right'

  return (
    <div
      className="absolute text-center"
      style={{ left: centerX, top: startY, transform: 'translateX(-50%)', color: '#000' }}
    >
      <div style={{ fontSize: fs(14), fontWeight: 700 }}>
        {bindingLabel.charAt(0).toUpperCase() + bindingLabel.slice(1)} Book
      </div>
      <div style={{ fontSize: fs(11), fontWeight: 600, marginBottom: fs(14) }}>
        Cover Template - {readingDirectionLabel}
      </div>

      <div style={{ fontSize: fs(13), fontWeight: 700 }}>
        {trimW}&quot; x {trimH}&quot; Book
      </div>
      <div style={{ fontSize: fs(9), marginBottom: fs(12) }}>
        ({toMm(trimW)}mm x {toMm(trimH)}mm)
      </div>

      <div style={{ fontSize: fs(12), fontWeight: 700 }}>
        {fullW.toFixed(3)}&quot; x {fullH.toFixed(3)}&quot; Overall Dimensions
      </div>
      <div style={{ fontSize: fs(9), marginBottom: fs(12) }}>
        ({toMm(fullW)}mm x {toMm(fullH)}mm)
      </div>

      <div style={{ fontSize: fs(12), fontWeight: 700 }}>
        {spineInches}&quot; Spine Width
      </div>
      <div style={{ fontSize: fs(9), marginBottom: fs(14) }}>
        ({toMm(spineWidthInches)}mm)
      </div>

      <div style={{ fontSize: fs(12), fontWeight: 700, lineHeight: 1.6 }}>
        {interiorTypeLabel}
        <br />
        {pageCount} Pages
        <br />
        {paperTypeLabel}
      </div>
    </div>
  )
}

function CornerLabel({ zone, zoom, position, title, sizeText, sizeMm }: {
  zone: Rect; zoom: number
  position: 'bottom-left' | 'bottom-right'
  title: string; sizeText: string; sizeMm: string
}) {
  const fs = (px: number) => fontSize(px, zoom)
  const pad = 8 * Math.max(0.6, Math.min(zoom, 1.3))
  const isLeft = position === 'bottom-left'
  const [word1, word2] = title.split(' ')

  const x = isLeft ? zone.x * zoom + pad : (zone.x + zone.width) * zoom - pad
  const y = (zone.y + zone.height) * zoom - pad

  return (
    <div
      className="absolute"
      style={{
        left: x,
        top: y,
        transform: isLeft ? 'translateY(-100%)' : 'translate(-100%, -100%)',
        textAlign: isLeft ? 'left' : 'right',
        color: '#000',
      }}
    >
      <div style={{ fontSize: fs(7), fontWeight: 600, lineHeight: 1.3 }}>{word1}</div>
      <div style={{ fontSize: fs(7), fontWeight: 600, lineHeight: 1.3 }}>{word2}</div>
      <div style={{ fontSize: fs(7), lineHeight: 1.3, whiteSpace: 'nowrap' }}>{sizeText} {sizeMm}</div>
    </div>
  )
}
