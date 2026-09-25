import type { StudioFabricObject } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_INK } from '@/constants/studio.constants'
import type { Box } from '../studio-layout'
import { isValidComposition } from './composition'
import { isValidSgVariant, sgDesignEntry, sgDesignKey, type SgBookEntry, type SgDesign } from './content'
import { SG_FLOOR, SG_MIN_SUBJECT_INCHES, SG_MIN_SUBJECT_SHARE, type SgInk, type SgMosaic } from './mosaic'
import { SG_ALL_INK_WEIGHTS } from './style'
import { sgSubjectById } from './subjects'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

/** A page with fewer regions is a sketch, not a mosaic; more is a chore. */
const MIN_REGIONS = 24
const MAX_REGIONS = 420
/**
 * Share of the panel covered by ink. Line art prints around 4–12%; above
 * this the page is turning into black mass (lines too crowded to color
 * between), below it the page is nearly blank.
 */
const MAX_INK_SHARE = 0.2
const MIN_INK_SHARE = 0.02

/**
 * The last gate before a page is accepted.
 *
 * The mosaic has already been printed to a grid and every region measured
 * (`mosaic.ts`); this re-proves the result against the page as a whole: the
 * subject is a real, valid version of a real subject, big enough to be the
 * picture; every region clears the coloring floor; the panel is a mosaic and
 * not a sketch or a thicket; the book does not already print this exact page.
 * Any failure sends the page back to be rebuilt, never into the book.
 */
export function runSgKdpPreflight(options: {
  design: SgDesign
  mosaic: SgMosaic
  book?: readonly SgBookEntry[]
}): KdpPreflightResult {
  const { design, mosaic, book = [] } = options
  const errors: string[] = []

  const known = sgSubjectById(design.subject.id)
  if (!known || known !== design.subject) errors.push('The page shows a subject that is not in the library.')
  else if (!isValidSgVariant(design.subject, design.variant)) errors.push(`“${design.subject.name}” is not a version its drawing has.`)
  if (!isValidComposition(design.composition)) errors.push('The page uses a window or border the page cannot print.')

  const panelW = mosaic.panel.maxX - mosaic.panel.minX
  const panelH = mosaic.panel.maxY - mosaic.panel.minY
  const subjW = mosaic.subject.maxX - mosaic.subject.minX
  const subjH = mosaic.subject.maxY - mosaic.subject.minY
  if (Math.max(subjW / panelW, subjH / panelH) < SG_MIN_SUBJECT_SHARE || Math.max(subjW, subjH) < SG_MIN_SUBJECT_INCHES * DPI) {
    errors.push(`“${design.subject.name}” prints too small to be the picture.`)
  }
  if (
    mosaic.subject.minX < mosaic.panel.minX ||
    mosaic.subject.minY < mosaic.panel.minY ||
    mosaic.subject.maxX > mosaic.panel.maxX ||
    mosaic.subject.maxY > mosaic.panel.maxY
  ) {
    errors.push(`“${design.subject.name}” runs outside its window.`)
  }

  if (mosaic.regions < MIN_REGIONS) errors.push('The design has too few pieces to be a mosaic.')
  if (mosaic.regions > MAX_REGIONS) errors.push('The design has too many pieces to color comfortably.')
  if (mosaic.narrowest < SG_FLOOR.minWidth || mosaic.smallest < SG_FLOOR.minArea) errors.push('A piece of glass is too small to color.')
  if (mosaic.inkShare > MAX_INK_SHARE) errors.push('The lines are too crowded to color between.')
  if (mosaic.inkShare < MIN_INK_SHARE) errors.push('The design is nearly blank.')

  // Style aside: the same design in another pen is still the same page.
  const key = sgDesignKey(sgDesignEntry(design))
  if (book.some((entry) => sgDesignKey(entry) === key)) errors.push('This book already has this exact design.')

  return { ok: errors.length === 0, errors }
}

/**
 * The page as drawn: every mark inside the box it was given, every stroke
 * black at one of the panel's print weights (the book's pen when `ink` is
 * given, else any pen a book may use), no fill anywhere (no grey, no solid
 * black), and no text inside the art — a stray letter in a coloring page is a
 * defect a reader notices at once.
 */
export function checkSgDrawnPanel(panel: StudioFabricObject, box: Box, ink?: Readonly<Record<SgInk, number>>): string[] {
  const weights: ReadonlySet<number> = ink ? new Set(Object.values(ink)) : SG_ALL_INK_WEIGHTS
  const errors: string[] = []
  if (panel.type !== 'group' || !panel.objects?.length) return ['The panel was not drawn.']
  const cx = panel.left + (panel.width ?? 0) / 2
  const cy = panel.top + (panel.height ?? 0) / 2
  for (const child of panel.objects) {
    if (child.type !== 'path' || !child.path?.length) {
      errors.push('The panel holds something other than line art.')
      continue
    }
    if (child.stroke !== STUDIO_INK) errors.push('A line in the panel is not black.')
    if (child.fill && child.fill !== 'transparent') errors.push('A piece of the panel is filled in.')
    if (!weights.has(child.strokeWidth ?? 0)) errors.push('A line in the panel is not at a print weight.')
    const half = (child.strokeWidth ?? 0) / 2
    for (const command of child.path) {
      const x = Number(command[1])
      const y = Number(command[2])
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        errors.push('The panel has a broken line.')
        break
      }
      if (x - half < box.left - 0.5 || x + half > box.left + box.width + 0.5 || y - half < box.top - 0.5 || y + half > box.top + box.height + 0.5) {
        errors.push('A line runs outside the panel.')
        break
      }
    }
  }
  // Children are stored relative to the group centre; that centre must be the box's.
  if (Math.abs(cx - (box.left + box.width / 2)) > 0.5 || Math.abs(cy - (box.top + box.height / 2)) > 0.5) {
    errors.push('The panel is not where it was laid out.')
  }
  return [...new Set(errors)]
}
