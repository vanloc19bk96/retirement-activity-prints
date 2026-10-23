/**
 * Front / back cover design managed by the Front cover and Back cover panels.
 * Like the spine, the whole design is stored on every managed object
 * (`coverFaceDesign`) so it saves with the cover canvas.
 */

import type { ZoneRect } from './book-cover.types'

export type CoverFace = 'front' | 'back'

export type CoverFaceBackgroundMode = 'none' | 'color' | 'image'

export type CoverFaceTextRole = 'title' | 'subtitle' | 'author' | 'headline' | 'description'

export type CoverFaceRole = 'background' | 'background-image' | CoverFaceTextRole

/**
 * Where the text sits on the face:
 * - `classic`: title block at the top, author pinned to the bottom (front only).
 * - `top` / `center` / `bottom`: every line stacked together.
 */
export type CoverFaceArrangement = 'classic' | 'top' | 'center' | 'bottom'

export type CoverFaceTextAlign = 'left' | 'center' | 'right'

export interface CoverFaceDesign {
  backgroundMode: CoverFaceBackgroundMode
  backgroundColor: string
  /** Public URL of the uploaded image when `backgroundMode` is `image`. */
  backgroundImageUrl: string | null
  /** Front cover text. */
  title: string
  subtitle: string
  author: string
  /** Back cover text. */
  headline: string
  description: string
  arrangement: CoverFaceArrangement
  textAlign: CoverFaceTextAlign
  /** Font catalog values (`FONT_FAMILIES[].value`): title / headline vs. everything else. */
  titleFontFamily: string
  bodyFontFamily: string
  textColor: string
  titleBold: boolean
  /** Soft drop shadow that keeps text readable on photos. */
  textShadow: boolean
  /** Share of the default text size. */
  textScale: number
}

/**
 * Placement bookkeeping on each managed object. `placedLeft/Top` is where the
 * panel last put a text object; once the user drags it elsewhere, `manual`
 * keeps that spot as a share of the face so it survives page-count changes.
 */
export interface CoverFaceTag {
  face: CoverFace
  role: CoverFaceRole
  zone?: ZoneRect
  placedLeft?: number
  placedTop?: number
  manual?: { fx: number; fy: number } | null
}

export const COVER_FACE_TEXT_SCALE_MIN = 0.6
export const COVER_FACE_TEXT_SCALE_MAX = 1.4

export const COVER_FACE_TEXT_ROLES: Record<CoverFace, CoverFaceTextRole[]> = {
  front: ['title', 'subtitle', 'author'],
  back: ['headline', 'description'],
}

export const COVER_FACE_ARRANGEMENTS: Record<CoverFace, CoverFaceArrangement[]> = {
  front: ['classic', 'top', 'center', 'bottom'],
  back: ['top', 'center'],
}

const BASE_DESIGN: CoverFaceDesign = {
  backgroundMode: 'none',
  backgroundColor: '#1e3a5f',
  backgroundImageUrl: null,
  title: '',
  subtitle: '',
  author: '',
  headline: '',
  description: '',
  arrangement: 'classic',
  textAlign: 'center',
  titleFontFamily: 'Inter',
  bodyFontFamily: 'Inter',
  textColor: '#111111',
  titleBold: true,
  textShadow: false,
  textScale: 1,
}

export const DEFAULT_COVER_FACE_DESIGNS: Record<CoverFace, CoverFaceDesign> = {
  front: BASE_DESIGN,
  back: { ...BASE_DESIGN, arrangement: 'top', textAlign: 'left' },
}

export function hasCoverFaceText(face: CoverFace, design: CoverFaceDesign): boolean {
  return COVER_FACE_TEXT_ROLES[face].some((role) => design[role].trim().length > 0)
}

export function isCoverFaceDesignEmpty(face: CoverFace, design: CoverFaceDesign): boolean {
  return design.backgroundMode === 'none' && !hasCoverFaceText(face, design)
}
