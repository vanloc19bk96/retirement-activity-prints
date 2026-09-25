import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { contentBox, measureHeaderHeight, type Box } from '../studio-layout'
import { hugTextBoxWidth } from '../studio-text-metrics'
import type { Bounds } from '../stained-glass/geometry'
import { cbnInstructionOptions, cbnLevelSpec, type CbnKeyStyle, type CbnLevel } from './content'
import { CBN_COLORS, CBN_MAX_COLORS, cbnColor, type CbnColorId } from './palette'

/**
 * Where the scene and its color key go on the page.
 *
 * The heading and the one-line instruction first; then the scene, taking
 * every inch the page can spare; then the key, a single tidy box along the
 * bottom. The key is sized before the scene is drawn, for the most entries a
 * page can have (eight), so a page with six never leaves the scene short —
 * the smaller key simply sits centred in its band.
 */

/** Air between the safe area (or the heading) and the frame, canvas px. */
export const CBN_EDGE_AIR = 6
/** Extra air under the instruction, so the frame does not crowd it. */
export const CBN_HEADER_AIR = 10
/** Air between the scene and the key. */
export const CBN_KEY_GAP = 14

/** The smallest scene worth printing. */
export const CBN_MIN_PANEL_WIDTH = Math.round(3.2 * DPI)
export const CBN_MIN_PANEL_HEIGHT = Math.round(3.2 * DPI)

/**
 * The key's proportions, canvas px. Numbers and names in the key print at
 * about 11 pt, a touch larger than the numbers in the scene, so the key is
 * the easiest thing on the page to read — and compact enough that eight
 * colors fit in three columns on a 6 x 9 page.
 */
export const CBN_KEY = {
  badge: 24,
  digit: 15,
  swatchW: 26,
  swatchH: 17,
  name: 15,
  row: 32,
  gap: 6,
  pad: 10,
  caption: 15,
  captionH: 22,
  stroke: 1.5,
} as const

export const CBN_KEY_CAPTION = 'Color Key'

export interface CbnKeyEntryBox {
  color: CbnColorId
  n: number
  /** Top-left of the entry's row cell, canvas px. */
  left: number
  top: number
}

export interface CbnKeyLayout {
  box: Box
  cols: number
  rows: number
  swatch: boolean
  colWidth: number
  entries: CbnKeyEntryBox[]
}

const nameWidth = (name: string, fontFamily: string) =>
  hugTextBoxWidth(name, CBN_KEY.name, Number.POSITIVE_INFINITY, { fontFamily })

function entryWidth(nameW: number, swatch: boolean): number {
  const { badge, gap, swatchW } = CBN_KEY
  return badge + gap + (swatch ? swatchW + gap : 0) + nameW + gap * 2
}

/** Columns, rows and whether the try-it boxes fit, for `count` entries in `width`. */
function keyGrid(width: number, count: number, nameW: number, keyStyle: CbnKeyStyle) {
  const inner = width - CBN_KEY.pad * 2
  // Filled swatches are the point of the color key, so they are never dropped;
  // the empty try-it boxes give way before the names get cramped.
  const options = keyStyle === 'swatches' ? [true] : [true, false]
  for (const swatch of options) {
    const w = entryWidth(nameW, swatch)
    for (let cols = Math.min(4, count); cols >= 2; cols--) {
      if (cols * w > inner) continue
      const rows = Math.ceil(count / cols)
      // Balance the rows: seven entries print 4 + 3, six print 3 + 3.
      return { cols: Math.ceil(count / rows), rows, swatch, entryW: w }
    }
  }
  return { cols: 1, rows: count, swatch: keyStyle === 'swatches', entryW: entryWidth(nameW, keyStyle === 'swatches') }
}

const keyHeight = (rows: number) => CBN_KEY.pad * 2 + CBN_KEY.captionH + rows * CBN_KEY.row

/** The band the key needs at most: eight entries of the longest name. */
export function cbnKeyReserve(width: number, fontFamily: string, keyStyle: CbnKeyStyle): number {
  const longest = Math.max(...CBN_COLORS.map((c) => nameWidth(c.name, fontFamily)))
  return keyHeight(keyGrid(width, CBN_MAX_COLORS, longest, keyStyle).rows)
}

/** Lay the key out for these colors inside `band` (the reserved strip under the scene). */
export function cbnKeyLayout(band: Box, legend: readonly CbnColorId[], fontFamily: string, keyStyle: CbnKeyStyle): CbnKeyLayout {
  const nameW = Math.max(...legend.map((id) => nameWidth(cbnColor(id).name, fontFamily)))
  const grid = keyGrid(band.width, legend.length, nameW, keyStyle)
  const inner = band.width - CBN_KEY.pad * 2
  // Columns spread across the key, but not so far that an entry's name drifts from its number.
  const colWidth = Math.min(inner / grid.cols, grid.entryW * 1.6)
  const height = keyHeight(grid.rows)
  const box: Box = { left: band.left, top: band.top + Math.max(0, (band.height - height) / 2), width: band.width, height }
  const gridLeft = box.left + CBN_KEY.pad + (inner - colWidth * grid.cols) / 2
  const entries = legend.map((color, i) => {
    const row = Math.floor(i / grid.cols)
    // A short last row is centred under the full ones.
    const inRow = row === grid.rows - 1 ? legend.length - row * grid.cols : grid.cols
    const col = i % grid.cols
    const rowLeft = gridLeft + ((grid.cols - inRow) * colWidth) / 2
    return {
      color,
      n: i + 1,
      left: rowLeft + col * colWidth + (colWidth - grid.entryW) / 2 + CBN_KEY.gap,
      top: box.top + CBN_KEY.pad + CBN_KEY.captionH + row * CBN_KEY.row,
    }
  })
  return { box, cols: grid.cols, rows: grid.rows, swatch: grid.swatch, colWidth, entries }
}

export interface CbnPageLayout {
  panel: Box
  /** The strip reserved for the key. */
  keyBand: Box
}

/**
 * The scene's box and the key's band inside what a heading left of the page
 * (`body`, from `drawHeader`). `headed` says whether anything was printed
 * above it.
 */
export function cbnLayoutInBody(body: Box, headed: boolean, fontFamily: string, keyStyle: CbnKeyStyle): CbnPageLayout {
  const top = body.top + (headed ? CBN_HEADER_AIR : CBN_EDGE_AIR)
  const width = body.width - CBN_EDGE_AIR * 2
  const left = body.left + CBN_EDGE_AIR
  const reserve = cbnKeyReserve(width, fontFamily, keyStyle)
  const bottom = body.top + body.height - CBN_EDGE_AIR
  const panelH = bottom - reserve - CBN_KEY_GAP - top
  return {
    panel: { left, top, width, height: panelH },
    keyBand: { left, top: bottom - reserve, width, height: reserve },
  }
}

export const cbnPanelFits = (b: Box) => b.width >= CBN_MIN_PANEL_WIDTH && b.height >= CBN_MIN_PANEL_HEIGHT

export const boxToBounds = (b: Box): Bounds => ({ minX: b.left, minY: b.top, maxX: b.left + b.width, maxY: b.top + b.height })

/** The layout on a page, measured without drawing (for the form). */
export function cbnLayoutFor(page: StudioConfigLayoutContext, config: StudioConfig, instruction: string, keyStyle: CbnKeyStyle): CbnPageLayout {
  const body = contentBox(page)
  const header = measureHeaderHeight(config, instruction, body.width)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  return cbnLayoutInBody({ ...body, top: body.top + header, height: body.height - header }, header > 0, font, keyStyle)
}

/** The level's help line: what this level prints on the page size in Settings. */
export function cbnPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: CbnLevel; keyStyle: CbnKeyStyle }): string {
  const { page, config, level, keyStyle } = options
  const spec = cbnLevelSpec(level)
  const pt = (px: number) => Math.round(((px * 72) / DPI) * 2) / 2
  const numbers = `Numbers print at ${pt(spec.rules.numberSize)} pt`
  if (!page) return `${numbers}.`
  const texts = cbnInstructionOptions(config)
  const panels = (texts.length > 0 ? texts : ['']).map((text) => cbnLayoutFor(page, config, text, keyStyle).panel)
  const worst = panels.reduce((a, b) => (b.height < a.height ? b : a))
  if (!cbnPanelFits(worst)) return 'This page size is too small for a Color by Number scene — choose a larger one in Settings.'
  const inches = (px: number) => (px / DPI).toFixed(1)
  return `${numbers}; the scene is about ${inches(worst.width)} × ${inches(worst.height)} in, with a 6–8 color key below.`
}
