/**
 * Spine design managed by the Spine panel. The whole design is stored on every
 * spine object (`spineDesign`) so it saves with the cover canvas and survives a
 * reload or a page-count change without a separate settings record.
 */

export type SpineBackgroundMode = 'none' | 'color' | 'image'

/** Reading direction of spine text. US/UK books read top to bottom. */
export type SpineTextDirection = 'top-to-bottom' | 'bottom-to-top'

/**
 * - `centered`: title and author run together, centered on the spine.
 * - `split`: title centered in the upper part, author pinned to the reading end.
 */
export type SpineTextLayout = 'centered' | 'split'

export type SpineRole = 'background' | 'background-image' | 'title' | 'author' | 'publisher'

export type SpineTextRole = Extract<SpineRole, 'title' | 'author' | 'publisher'>

export interface SpineDesign {
  backgroundMode: SpineBackgroundMode
  backgroundColor: string
  /** Public URL of the uploaded spine image when `backgroundMode` is `image`. */
  backgroundImageUrl: string | null
  title: string
  author: string
  publisher: string
  layout: SpineTextLayout
  direction: SpineTextDirection
  /** Value from the font catalog (`FONT_FAMILIES[].value`). */
  fontFamily: string
  textColor: string
  titleBold: boolean
  /** 0.5 – 1: share of the largest size that still fits the spine. */
  textScale: number
}

export const SPINE_TEXT_SCALE_MIN = 0.5
export const SPINE_TEXT_SCALE_MAX = 1

export const DEFAULT_SPINE_DESIGN: SpineDesign = {
  backgroundMode: 'none',
  backgroundColor: '#1e3a5f',
  backgroundImageUrl: null,
  title: '',
  author: '',
  publisher: '',
  layout: 'split',
  direction: 'top-to-bottom',
  fontFamily: 'Inter',
  textColor: '#111111',
  titleBold: true,
  textScale: 1,
}

export function hasSpineText(design: SpineDesign): boolean {
  return [design.title, design.author, design.publisher].some((value) => value.trim().length > 0)
}

export function isSpineDesignEmpty(design: SpineDesign): boolean {
  return design.backgroundMode === 'none' && !hasSpineText(design)
}
