import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { contentBox, measureHeaderHeight, type Box } from '../studio-layout'
import type { Bounds } from './geometry'
import { sgInstructionOptions, sgLevelSpec, type SgLevel } from './content'

/**
 * Where the panel goes on the page.
 *
 * The coloring is the page, so the panel takes everything the safe area
 * leaves once the heading and the one-line instruction are set: no captions,
 * no footers. A hair of air keeps the frame's heavy outline off the safe
 * line, where it would read as a trimming fault, and a slim even margin
 * (`SG_PANEL_INSET`) lets the window breathe on the paper.
 */

/** Air between the safe area (or the heading) and the frame, canvas px. */
export const SG_EDGE_AIR = 6
/** Extra air under the instruction, so the frame does not crowd it. */
export const SG_HEADER_AIR = 10

/**
 * White margin around the window, as a share of the panel's shorter side.
 * The same on all four sides, so the window sits centered in an even frame
 * of paper instead of running edge to edge.
 */
export const SG_PANEL_INSET = 0.03

/** The smallest panel worth printing; anything less is a thumbnail, not a coloring page. */
export const SG_MIN_PANEL_WIDTH = Math.round(3.2 * DPI)
export const SG_MIN_PANEL_HEIGHT = Math.round(3.8 * DPI)

/**
 * The panel's box inside what a heading left of the page (`body`, from
 * `drawHeader`). `headed` says whether anything was printed above it.
 */
export function sgPanelInBody(body: Box, headed: boolean): Box {
  const top = body.top + (headed ? SG_HEADER_AIR : SG_EDGE_AIR)
  const width = body.width - SG_EDGE_AIR * 2
  const height = body.top + body.height - SG_EDGE_AIR - top
  // On a small trim the margin gives way before the panel drops below print size.
  const inset = Math.max(
    0,
    Math.min(
      Math.min(width, height) * SG_PANEL_INSET,
      (width - SG_MIN_PANEL_WIDTH) / 2,
      (height - SG_MIN_PANEL_HEIGHT) / 2,
    ),
  )
  return {
    left: body.left + SG_EDGE_AIR + inset,
    top: top + inset,
    width: width - inset * 2,
    height: height - inset * 2,
  }
}

/** The panel's box on a page, measured without drawing (for the form). */
export function sgPanelBox(page: StudioConfigLayoutContext, config: StudioConfig, instruction: string): Box {
  const body = contentBox(page)
  const header = measureHeaderHeight(config, instruction, body.width)
  return sgPanelInBody({ ...body, top: body.top + header, height: body.height - header }, header > 0)
}

export const boxToBounds = (b: Box): Bounds => ({ minX: b.left, minY: b.top, maxX: b.left + b.width, maxY: b.top + b.height })

export const panelFits = (b: Box) => b.width >= SG_MIN_PANEL_WIDTH && b.height >= SG_MIN_PANEL_HEIGHT

/**
 * The panel for the tallest instruction this config could print, so the
 * form's note holds for every seller's phrasing.
 */
function worstPanel(page: StudioConfigLayoutContext, config: StudioConfig): Box {
  const options = sgInstructionOptions(config)
  const boxes = (options.length > 0 ? options : ['']).map((text) => sgPanelBox(page, config, text))
  return boxes.reduce((a, b) => (b.height < a.height ? b : a))
}

/**
 * About how many pieces a level prints on this page: the background's cells
 * plus the subject's own. Calibrated against generated pages; a guide for the
 * form, not a promise, so it is given as a round range.
 */
export function sgPieceEstimate(panel: Box, level: SgLevel): [number, number] {
  const cell = sgLevelSpec(level).detail.cell
  const cells = (panel.width * panel.height) / (cell * cell * 1.15)
  const mid = cells + 14
  const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5)
  return [round5(mid * 0.8), round5(mid * 1.2)]
}

/** The level's help line: what this level prints on the page size in Settings. */
export function sgPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: SgLevel }): string {
  const { page, config, level } = options
  if (!page) return ''
  const panel = worstPanel(page, config)
  if (!panelFits(panel)) return 'This page size is too small for a stained-glass design — choose a larger one in Settings.'
  const [low, high] = sgPieceEstimate(panel, level)
  return `About ${low}–${high} pieces to color on this page size.`
}
