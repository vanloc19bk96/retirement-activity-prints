import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { contentBox, measureHeaderHeight, type Box } from '../studio-layout'
import { sdInstructionOptions, type SdGroupChoice, type SdLevel } from './content'
import { SD_MARK_OVERHANG } from './differences'

/**
 * Where the two pictures go.
 *
 * One above the other, the same size, with clear paper between them: the
 * page reads at a glance as "the same picture twice". Each picture takes as
 * much of the page as it can (never wider than twice its height, nor
 * narrower than 1.3 times it, so a scene is never a sliver), and keeps room
 * round its frame for an answer ring that runs a little past it. Under the
 * pair on the puzzle page, a row of tick circles — one per difference — so
 * the count is on the page even with the instruction turned off.
 */

const inch = (n: number) => n * DPI

/** Paper between the two pictures (answer rings may reach into it from both). */
export const SD_PANEL_GAP = inch(0.32)
/** Air under the heading. */
export const SD_HEADER_AIR = 8
/** The tick row under the puzzle: its height, and the air above it. */
export const SD_TALLY_H = inch(0.3)
export const SD_TALLY_AIR = inch(0.14)
/** A picture's shape bounds (width over height). */
export const SD_MAX_ASPECT = 2
export const SD_MIN_ASPECT = 1.3
/** The smallest picture worth printing: every scene part and ring must still read. */
export const SD_MIN_PANEL_W = inch(3)
export const SD_MIN_PANEL_H = inch(1.9)

export interface SdPanelSize {
  w: number
  h: number
}

/** The size both pictures print at, for a body box under a heading; null when the page is too small. */
export function sdPanelSize(body: Box, headed: boolean): SdPanelSize | null {
  const top = headed ? SD_HEADER_AIR : 0
  const availW = body.width - SD_MARK_OVERHANG * 2
  const availH = body.height - top - SD_TALLY_AIR - SD_TALLY_H - SD_PANEL_GAP - SD_MARK_OVERHANG * 2
  let h = availH / 2
  let w = Math.min(availW, h * SD_MAX_ASPECT)
  if (w / h < SD_MIN_ASPECT) h = w / SD_MIN_ASPECT
  w = Math.floor(w)
  h = Math.floor(h)
  if (w < SD_MIN_PANEL_W || h < SD_MIN_PANEL_H) return null
  return { w, h }
}

export interface SdPageLayout {
  /** The top and bottom pictures' panels (inside their frames). */
  top: Box
  bottom: Box
  /** The tick row (puzzle page) or legend area (answer page). */
  foot: Box
}

/**
 * The two panels, a fixed size, placed in a body box: centred across, and
 * the whole block (pictures and foot) centred down the body. `foot` is how
 * much the block keeps under the pictures.
 */
export function sdPlacePanels(body: Box, size: SdPanelSize, headed: boolean, foot: number): SdPageLayout {
  const top = body.top + (headed ? SD_HEADER_AIR : 0)
  const room = body.top + body.height - top
  const block = SD_MARK_OVERHANG * 2 + size.h * 2 + SD_PANEL_GAP + foot
  const y0 = top + Math.max(0, (room - block) / 2) + SD_MARK_OVERHANG
  const left = body.left + (body.width - size.w) / 2
  const upper: Box = { left, top: y0, width: size.w, height: size.h }
  const lower: Box = { left, top: y0 + size.h + SD_PANEL_GAP, width: size.w, height: size.h }
  const footTop = lower.top + size.h + SD_MARK_OVERHANG
  return { top: upper, bottom: lower, foot: { left: body.left, top: footTop, width: body.width, height: body.top + body.height - footTop } }
}

/** The panel size on a page, measured without drawing (for the form), at the widest instruction. */
export function sdPanelFor(page: StudioConfigLayoutContext, config: StudioConfig): SdPanelSize | null {
  const body = contentBox(page)
  const texts = sdInstructionOptions(config)
  const sizes = (texts.length > 0 ? texts : ['']).map((text) => {
    const header = measureHeaderHeight(config, text, body.width)
    return sdPanelSize({ ...body, top: body.top + header, height: body.height - header }, header > 0)
  })
  if (sizes.some((s) => !s)) return null
  return sizes.reduce((a, b) => (b!.h < a!.h ? b : a))!
}

/** Pictures shorter than this are small: a room scene holds fewer fair, well-spaced changes. */
export const SD_SMALL_PANEL_H = inch(2.7)

/**
 * A soft warning when this page size and choice ask more of a picture than
 * it can reliably give: small pictures of rooms hold fewer separate changes,
 * and ten fair ones need room anywhere.
 */
export function sdCrowdedWarning(size: SdPanelSize | null, group: SdGroupChoice, level: SdLevel): string | null {
  if (!size || size.h >= SD_SMALL_PANEL_H) return null
  if (level === 'relaxed') return null
  if (level === 'challenging' || group === 'home') {
    return 'The pictures print small on this page size, so some pages may not fit this many fair differences. Relaxed, a mix of scenes, or a larger page works best.'
  }
  return null
}

/** The level's help line: what the pictures print at on the page size in Settings. */
export function sdPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; minExtent: number }): string {
  const { page, config, minExtent } = options
  const change = `Every difference is at least ${minExtent.toFixed(2).replace(/0$/, '')} in across and circled on the answer page`
  if (!page) return `${change}.`
  const size = sdPanelFor(page, config)
  if (!size) return 'This page size is too small for two pictures to compare — choose a larger one in Settings.'
  const inches = (px: number) => (px / DPI).toFixed(1)
  return `Each picture prints ${inches(size.w)} × ${inches(size.h)} in. ${change}.`
}
