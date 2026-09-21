import { DPI, type PageDimensions } from './canvas-settings.types'
import type { ProjectBookInfo } from './projects.types'
import { DEFAULT_PROJECT_BOOK_INFO } from '@/utils/book-info'

const SPINE_FACTOR_BLACK_WHITE_WHITE_PAPER = 0.002252
const SPINE_FACTOR_BLACK_WHITE_CREAM_PAPER = 0.0025
const COVER_BLEED_INCHES = 0.125
// Cover safe margin: 0.125" from trim edges on 3 outer sides (top, bottom, outside)
// The spine side has NO safe margin — spine is a fold line, not a cut line.
const COVER_SAFE_MARGIN_INCHES = 0.125
const BARCODE_WIDTH_INCHES = 2
const BARCODE_HEIGHT_INCHES = 1.2
const BARCODE_PADDING_INCHES = 0.25

// Minimum spine width to safely place spine text.
const MIN_SPINE_WIDTH_FOR_TEXT_INCHES = 0.0625
const MIN_PAGE_COUNT_FOR_SPINE = 24

export interface BookCoverDimensions {
  fullWidthInches: number
  fullHeightInches: number
  fullWidthPixels: number
  fullHeightPixels: number
  spineWidthInches: number
  spineWidthPixels: number
  bleedPixels: number
  safeMarginPixels: number
  trimWidthInches: number
  trimHeightInches: number
}

export interface BookCoverZones {
  bleed: ZoneRect
  backCover: ZoneRect
  spine: ZoneRect
  frontCover: ZoneRect
  backSafeArea: ZoneRect
  frontSafeArea: ZoneRect
  spineSafeArea: ZoneRect
  barcodeArea: ZoneRect
}

export interface ZoneRect {
  x: number
  y: number
  width: number
  height: number
}

function resolveSpineFactor(bookInfo?: ProjectBookInfo | null): number {
  const paperType = (bookInfo ?? DEFAULT_PROJECT_BOOK_INFO).paperType.trim().toLowerCase()
  return paperType === 'cream paper'
    ? SPINE_FACTOR_BLACK_WHITE_CREAM_PAPER
    : SPINE_FACTOR_BLACK_WHITE_WHITE_PAPER
}

export function calculateSpineWidth(pageCount: number, bookInfo?: ProjectBookInfo | null): number {
  const normalizedPageCount = Math.max(
    Number.isFinite(pageCount) ? Math.floor(pageCount) : 0,
    MIN_PAGE_COUNT_FOR_SPINE,
  )
  return normalizedPageCount * resolveSpineFactor(bookInfo)
}

export function canShowSpineText(pageCount: number, bookInfo?: ProjectBookInfo | null): boolean {
  return calculateSpineWidth(pageCount, bookInfo) >= MIN_SPINE_WIDTH_FOR_TEXT_INCHES
}

export function calculateBookCoverDimensions(
  trimDimensions: PageDimensions,
  pageCount: number,
  bookInfo?: ProjectBookInfo | null,
): BookCoverDimensions {
  const spineWidthInches = calculateSpineWidth(pageCount, bookInfo)
  const bleed = COVER_BLEED_INCHES

  const fullWidthInches = bleed + trimDimensions.widthInches + spineWidthInches + trimDimensions.widthInches + bleed
  const fullHeightInches = bleed + trimDimensions.heightInches + bleed

  return {
    fullWidthInches,
    fullHeightInches,
    fullWidthPixels: Math.round(fullWidthInches * DPI),
    fullHeightPixels: Math.round(fullHeightInches * DPI),
    spineWidthInches,
    spineWidthPixels: Math.round(spineWidthInches * DPI),
    bleedPixels: Math.round(bleed * DPI),
    safeMarginPixels: Math.round(COVER_SAFE_MARGIN_INCHES * DPI),
    trimWidthInches: trimDimensions.widthInches,
    trimHeightInches: trimDimensions.heightInches,
  }
}

/**
 * Pixel-based zone rectangles for all visual guide areas.
 * All values are in canvas pixels (at DPI), not zoomed.
 */
export function calculateBookCoverZones(dims: BookCoverDimensions): BookCoverZones {
  const { bleedPixels, safeMarginPixels, spineWidthPixels } = dims
  const trimWidthPixels = Math.round(dims.trimWidthInches * DPI)
  const trimHeightPixels = Math.round(dims.trimHeightInches * DPI)

  const bleed: ZoneRect = {
    x: 0,
    y: 0,
    width: dims.fullWidthPixels,
    height: dims.fullHeightPixels,
  }

  const backCover: ZoneRect = {
    x: bleedPixels,
    y: bleedPixels,
    width: trimWidthPixels,
    height: trimHeightPixels,
  }

  const spine: ZoneRect = {
    x: bleedPixels + trimWidthPixels,
    y: bleedPixels,
    width: spineWidthPixels,
    height: trimHeightPixels,
  }

  const frontCover: ZoneRect = {
    x: bleedPixels + trimWidthPixels + spineWidthPixels,
    y: bleedPixels,
    width: trimWidthPixels,
    height: trimHeightPixels,
  }

  // Back cover: safe margin on left (outside), top, bottom — NOT on right (spine side)
  const backSafeArea: ZoneRect = {
    x: bleedPixels + safeMarginPixels,
    y: bleedPixels + safeMarginPixels,
    width: trimWidthPixels - safeMarginPixels,
    height: trimHeightPixels - safeMarginPixels * 2,
  }

  // Front cover: safe margin on right (outside), top, bottom — NOT on left (spine side)
  const frontSafeArea: ZoneRect = {
    x: bleedPixels + trimWidthPixels + spineWidthPixels,
    y: bleedPixels + safeMarginPixels,
    width: trimWidthPixels - safeMarginPixels,
    height: trimHeightPixels - safeMarginPixels * 2,
  }

  // Spine safe area: 0.0625" inset from each spine edge
  const spineInset = Math.round(COVER_SAFE_MARGIN_INCHES * 0.5 * DPI)
  const spineSafeArea: ZoneRect = {
    x: spine.x + spineInset,
    y: bleedPixels + safeMarginPixels,
    width: Math.max(0, spineWidthPixels - spineInset * 2),
    height: trimHeightPixels - safeMarginPixels * 2,
  }

  // Barcode: 2" x 1.2", bottom-right of back cover, with 0.25" padding from trim edges
  const barcodeWidthPixels = Math.round(BARCODE_WIDTH_INCHES * DPI)
  const barcodeHeightPixels = Math.round(BARCODE_HEIGHT_INCHES * DPI)
  const barcodePaddingPixels = Math.round(BARCODE_PADDING_INCHES * DPI)
  const barcodeArea: ZoneRect = {
    x: bleedPixels + trimWidthPixels - barcodeWidthPixels - barcodePaddingPixels,
    y: bleedPixels + trimHeightPixels - barcodeHeightPixels - barcodePaddingPixels,
    width: barcodeWidthPixels,
    height: barcodeHeightPixels,
  }

  return {
    bleed,
    backCover,
    spine,
    frontCover,
    backSafeArea,
    frontSafeArea,
    spineSafeArea,
    barcodeArea,
  }
}
