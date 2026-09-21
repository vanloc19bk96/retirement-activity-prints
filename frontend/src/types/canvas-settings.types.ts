/** Amazon KDP trim sizes — aligned with SettingsPanel book size options. */
export const AMAZON_KDP_PAGE_SIZES = [
  '5 x 8 in',
  '5.06 x 7.81 in',
  '5.25 x 8 in',
  '5.5 x 8.5 in',
  '6 x 9 in',
  '6.14 x 9.21 in',
  '6.69 x 9.61 in',
  '7 x 10 in',
  '7.44 x 9.69 in',
  '7.5 x 9.25 in',
  '8 x 10 in',
  '8.25 x 11 in',
  '8.5 x 11 in',
  '8.27 x 11.69 in',
] as const

export type PageSizeLabel = (typeof AMAZON_KDP_PAGE_SIZES)[number]

/** Default trim for new users — most common Amazon size for this book type. */
export const DEFAULT_PAGE_SIZE_LABEL: PageSizeLabel = '7.5 x 9.25 in'

/** Trim sizes selectable on Starter plan; others stay visible but disabled in UI. */
export const STARTER_ALLOWED_PAGE_SIZE_LABELS = [
  '7.5 x 9.25 in',
  '8.5 x 11 in',
  '8.25 x 11 in',
  '6 x 9 in',
  '5 x 8 in',
] as const satisfies readonly PageSizeLabel[]

export function isStarterAllowedPageSize(label: PageSizeLabel): boolean {
  return (STARTER_ALLOWED_PAGE_SIZE_LABELS as readonly PageSizeLabel[]).includes(label)
}

/** Starter: allowed sizes first (same order as STARTER_ALLOWED_PAGE_SIZE_LABELS), then the rest. */
export function getPageSizeLabelsForSelect(isStarterPlan: boolean): PageSizeLabel[] {
  if (!isStarterPlan) {
    return [...AMAZON_KDP_PAGE_SIZES]
  }
  const allowed = [...STARTER_ALLOWED_PAGE_SIZE_LABELS] as PageSizeLabel[]
  const allowedSet = new Set<PageSizeLabel>(allowed)
  const rest = AMAZON_KDP_PAGE_SIZES.filter((label) => !allowedSet.has(label))
  return [...allowed, ...rest]
}

export interface PageDimensions {
  widthInches: number
  heightInches: number
  widthPixels: number
  heightPixels: number
}

export interface MarginGuide {
  topPixels: number
  bottomPixels: number
  insidePixels: number
  outsidePixels: number
  bleedTopPixels: number
  bleedBottomPixels: number
  bleedOutsidePixels: number
}

export interface CanvasSettings {
  pageSizeLabel: PageSizeLabel
  pageDimensions: PageDimensions
  trimDimensions: PageDimensions
  showVisualGuide: boolean
  addBleed: boolean
  pageCount: number
  marginGuide: MarginGuide
  /** When true, images dropped on the book cover auto-fit to the front/back zone. */
  fitDroppedImagesToPage: boolean
  /** When true, studio solution pages sit after every game instead of after their own. */
  solutionsAtEnd: boolean
}

/** Logical editor/print-layout DPI (was 72; 96 improves on-screen text sharpness). */
export const DPI = 96
export const PDF_POINTS_PER_INCH = 72

// Amazon KDP bleed specifications
const BLEED_WIDTH_INCHES = 0.125
const BLEED_HEIGHT_INCHES = 0.25
const BLEED_TOP_BOTTOM_INCHES = 0.125

export function parsePageSizeLabel(label: PageSizeLabel): PageDimensions {
  const match = label.match(/^([\d.]+)\s*x\s*([\d.]+)\s*in$/)
  if (!match) {
    return {
      widthInches: 8.5,
      heightInches: 11,
      widthPixels: Math.round(8.5 * DPI),
      heightPixels: Math.round(11 * DPI),
    }
  }

  const widthInches = parseFloat(match[1])
  const heightInches = parseFloat(match[2])

  return {
    widthInches,
    heightInches,
    widthPixels: Math.round(widthInches * DPI),
    heightPixels: Math.round(heightInches * DPI),
  }
}

export function calculateDimensionsWithBleed(
  trimDimensions: PageDimensions,
  addBleed: boolean,
): PageDimensions {
  if (!addBleed) {
    return trimDimensions
  }

  const widthInches = trimDimensions.widthInches + BLEED_WIDTH_INCHES
  const heightInches = trimDimensions.heightInches + BLEED_HEIGHT_INCHES

  return {
    widthInches,
    heightInches,
    widthPixels: Math.round(widthInches * DPI),
    heightPixels: Math.round(heightInches * DPI),
  }
}

export function getInsideMarginInches(pageCount: number): number {
  if (pageCount <= 150) return 0.375
  if (pageCount <= 300) return 0.5
  if (pageCount <= 500) return 0.625
  if (pageCount <= 700) return 0.75
  return 0.875
}

export function getOutsideMarginInches(addBleed: boolean): number {
  return addBleed ? 0.375 : 0.25
}

export function calculateMarginGuide(pageCount: number, addBleed: boolean): MarginGuide {
  const insideMargin = getInsideMarginInches(pageCount)
  const outsideMargin = getOutsideMarginInches(addBleed)

  return {
    topPixels: Math.round(outsideMargin * DPI),
    bottomPixels: Math.round(outsideMargin * DPI),
    insidePixels: Math.round(insideMargin * DPI),
    outsidePixels: Math.round(outsideMargin * DPI),
    bleedTopPixels: addBleed ? Math.round(BLEED_TOP_BOTTOM_INCHES * DPI) : 0,
    bleedBottomPixels: addBleed ? Math.round(BLEED_TOP_BOTTOM_INCHES * DPI) : 0,
    bleedOutsidePixels: addBleed ? Math.round(BLEED_WIDTH_INCHES * DPI) : 0,
  }
}

export function getDefaultCanvasSettings(): CanvasSettings {
  const defaultLabel = DEFAULT_PAGE_SIZE_LABEL
  const trimDimensions = parsePageSizeLabel(defaultLabel)
  const defaultPageCount = 1
  const defaultAddBleed = false
  return {
    pageSizeLabel: defaultLabel,
    trimDimensions,
    pageDimensions: trimDimensions,
    showVisualGuide: true,
    addBleed: defaultAddBleed,
    pageCount: defaultPageCount,
    marginGuide: calculateMarginGuide(defaultPageCount, defaultAddBleed),
    fitDroppedImagesToPage: true,
    solutionsAtEnd: false,
  }
}
