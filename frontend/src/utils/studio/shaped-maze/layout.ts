import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { insetBox, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
import { mazeContentBox, mazeMetrics, type MazeMetrics } from '../maze/layout'
import type { SubjectDrawing } from '../stained-glass/subject-kit'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { sgVariantDrawing } from '../stained-glass/content'
import { smPageTooSmallMessage, smShapeById, smShapeVariants, type SmJourney, type SmLevel } from './content'
import { buildShapeMask, isInside, silhouetteBounds, type MaskQuality, type ShapeMask } from './mask'
import { outlineEdges, type ShapedOpening } from './generator'

/**
 * Everything a Shaped Maze page decides on the seller's behalf.
 *
 * As in the regular Maze, the number the page is built from is the corridor
 * width: walls, the key's route line, the Start / Finish captions and arrows
 * are all sized against it (`mazeMetrics`, shared with the Maze). What is new
 * is that the grid is not a rectangle: the level asks for a number of cells
 * across the shape's longer side, the corridor that gives is held inside the
 * level's band, and the shape's silhouette is laid over a grid of that size
 * (`mask.ts`). If the outline that comes out is not a faithful likeness,
 * narrower corridors (never below the level's floor) are tried before the
 * shape is given up for another.
 *
 * A caption band is kept above and below the shape, so an entrance at the
 * very top or exit at the very bottom always has room; an opening anywhere
 * else is only offered when its arrow and caption fit in open paper beside
 * the shape, clear of every wall.
 */

/** Breathing room between the safe area and anything the maze draws — as in the Maze. */
const FIELD_INSET = 8

/**
 * A faithful likeness, in numbers. The mask must overlap the drawing's
 * silhouette well (`iou`), keep nearly all of it in one piece (`keptShare`),
 * not be a plain block (`fill`), and not be a fringe of one-cell spurs
 * (`tipShare`). Tuned on the whole library: every shape clears these at the
 * sizes its level prints, and a rectangle-with-a-handle does not.
 */
export const SM_SHAPE_RULES = {
  minIou: 0.82,
  minKeptShare: 0.9,
  maxFill: 0.86,
  maxTipShare: 0.09,
  /** Cells across the shape's shorter side: fewer and it is a strip, not a shape. */
  minShortSide: 6,
  /** Cells across its longer side: fewer and the outline is too coarse to recognise. */
  minLongSide: 11,
} as const

/** Narrower corridors tried, as steps of this share, before a shape is given up. */
const CELL_STEP = 0.9

/** Paper kept between a caption or arrow and the nearest wall, beyond the wall's own ink. */
const CLEARANCE = 4

/** Caption boxes run this much wider than their measured text. */
const CAPTION_SLACK = 1.08

export const SM_START_WORD = 'START'
export const SM_FINISH_WORD = 'FINISH'

/** A caption's size: the bold word over the place name. */
export interface SmCaptionSize {
  width: number
  lineHeight: number
  height: number
}

/** Where one opening's arrow and caption sit, in page px. */
export interface SmOpeningPlacement {
  opening: ShapedOpening
  arrow: Box
  caption: Box
}

export interface SmPagePlan {
  cell: number
  metrics: MazeMetrics
  mask: ShapeMask
  quality: MaskQuality
  /** The grid's own box on the page: `cols × cell` by `rows × cell`. */
  grid: Box
  /** The box everything the maze draws stays inside. */
  field: Box
  start: SmCaptionSize
  finish: SmCaptionSize
  /** Outline edges with room for a Start caption, and their placement. */
  starts: SmOpeningPlacement[]
  /** Outline edges with room for a Finish caption, and their placement. */
  finishes: SmOpeningPlacement[]
}

/** The box the maze is drawn and centred in, below the heading. */
export function smDrawField(page: StudioConfigLayoutContext, config: StudioConfig, instruction: string): Box {
  const content = mazeContentBox(page)
  const header = measureHeaderHeight(config, instruction, content.width)
  return insetBox({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, FIELD_INSET)
}

export function captionSize(word: string, placeLabel: string, metrics: MazeMetrics, font: string, maxWidth: number): SmCaptionSize {
  const bold: FontSpec = { fontFamily: font, fontWeight: 700 }
  const plain: FontSpec = { fontFamily: font, fontWeight: 400 }
  // A little wider than measured: a place name that wraps to a second line
  // would run into the maze below it, and the box is centred, so the slack
  // costs nothing on the page.
  const measured = Math.max(
    hugTextBoxWidth(word, metrics.labelFont, maxWidth, bold),
    hugTextBoxWidth(placeLabel, metrics.labelFont, maxWidth, plain),
  )
  const width = Math.min(maxWidth, Math.ceil(measured * CAPTION_SLACK) + 4)
  const lineHeight = Math.ceil(fabricTextHeight(1, metrics.labelFont))
  return { width, lineHeight, height: lineHeight * 2 }
}

/** Height kept above and below the shape: caption, arrow and the gaps round them. */
function bandHeight(metrics: MazeMetrics, caption: SmCaptionSize): number {
  return caption.height + metrics.labelGap + metrics.arrowHeight + metrics.arrowGap + metrics.inkPad
}

/** Corridor widths to try for a shape, widest first, all inside the level's band. */
export function candidateCells(options: { drawing: SubjectDrawing; width: number; height: number; level: SmLevel }): number[] {
  const { drawing, width, height, level } = options
  const b = silhouetteBounds(drawing)
  const dw = b.maxX - b.minX
  const dh = b.maxY - b.minY
  if (dw <= 0 || dh <= 0 || width <= 0 || height <= 0) return []
  const fit = Math.min(width / dw, height / dh)
  const longSide = Math.max(dw, dh) * fit
  const first = Math.max(level.minPath, Math.min(level.maxPath, Math.floor(longSide / level.targetCells)))
  const cells: number[] = []
  for (let cell = first; cell >= level.minPath; cell = Math.floor(cell * CELL_STEP)) {
    cells.push(cell)
    if (cell === level.minPath) break
    if (Math.floor(cell * CELL_STEP) < level.minPath) {
      cells.push(level.minPath)
      break
    }
  }
  return cells
}

/** Why a mask is not a faithful, playable likeness of its shape — or null when it is. */
export function shapeFault(mask: ShapeMask, quality: MaskQuality, level: SmLevel): string | null {
  const rules = SM_SHAPE_RULES
  if (mask.count < level.minCells) return 'too few cells for this level'
  if (Math.min(mask.rows, mask.cols) < rules.minShortSide) return 'too thin'
  if (Math.max(mask.rows, mask.cols) < rules.minLongSide) return 'too coarse'
  if (quality.iou < rules.minIou) return 'outline drifts from the drawing'
  if (quality.keptShare < rules.minKeptShare) return 'part of the shape was lost'
  if (quality.fill > rules.maxFill) return 'reads as a rectangle'
  if (quality.tipShare > rules.maxTipShare) return 'too many spurs'
  return null
}

const boxesOverlap = (a: Box, b: Box, gap = 0): boolean =>
  a.left < b.left + b.width + gap && b.left < a.left + a.width + gap && a.top < b.top + b.height + gap && b.top < a.top + a.height + gap

/** Shortest distance between two boxes, 0 when they overlap. Corners measure true, not square. */
const boxDistance = (a: Box, b: Box): number =>
  Math.hypot(
    Math.max(0, b.left - (a.left + a.width), a.left - (b.left + b.width)),
    Math.max(0, b.top - (a.top + a.height), a.top - (b.top + b.height)),
  )

const within = (inner: Box, outer: Box): boolean =>
  inner.left >= outer.left - 0.5 &&
  inner.top >= outer.top - 0.5 &&
  inner.left + inner.width <= outer.left + outer.width + 0.5 &&
  inner.top + inner.height <= outer.top + outer.height + 0.5

/**
 * True when `box` comes within `reach` of any maze cell (`skip` aside). Cells
 * stand in for their ink: the outline straddles a cell's edge, so `reach`
 * includes half its weight.
 */
function touchesMaze(box: Box, mask: ShapeMask, grid: Box, cell: number, reach: number, skip?: ShapedOpening['cell']): boolean {
  const c0 = Math.max(0, Math.floor((box.left - reach - grid.left) / cell))
  const c1 = Math.min(mask.cols - 1, Math.floor((box.left + box.width + reach - grid.left) / cell))
  const r0 = Math.max(0, Math.floor((box.top - reach - grid.top) / cell))
  const r1 = Math.min(mask.rows - 1, Math.floor((box.top + box.height + reach - grid.top) / cell))
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!isInside(mask, r, c) || (skip && skip.r === r && skip.c === c)) continue
      const rect: Box = { left: grid.left + c * cell, top: grid.top + r * cell, width: cell, height: cell }
      if (boxDistance(box, rect) < reach) return true
    }
  }
  return false
}

/** Midpoint of an opening's edge, in page px. */
export function openingPoint(opening: ShapedOpening, grid: Box, cell: number): { x: number; y: number } {
  const x0 = grid.left + opening.cell.c * cell
  const y0 = grid.top + opening.cell.r * cell
  if (opening.dir === 0) return { x: x0 + cell / 2, y: y0 }
  if (opening.dir === 2) return { x: x0 + cell / 2, y: y0 + cell }
  if (opening.dir === 3) return { x: x0, y: y0 + cell / 2 }
  return { x: x0 + cell, y: y0 + cell / 2 }
}

/**
 * Arrow and caption for one opening, or null when the page has no clean room
 * for them there. The arrow sits just outside the gap; the caption sits just
 * beyond the arrow, slid along the outline (never away from its arrow) to
 * stay on the page.
 */
function placeOpening(options: {
  opening: ShapedOpening
  size: SmCaptionSize
  mask: ShapeMask
  grid: Box
  field: Box
  metrics: MazeMetrics
}): SmOpeningPlacement | null {
  const { opening, size, mask, grid, field, metrics } = options
  const { cell, arrowWidth, arrowHeight, arrowGap, labelGap, inkPad } = metrics
  const at = openingPoint(opening, grid, cell)
  const near = inkPad + arrowGap
  const far = near + arrowHeight + labelGap
  const clampX = (x: number) => Math.min(Math.max(x, field.left), field.left + field.width - size.width)
  const clampY = (y: number) => Math.min(Math.max(y, field.top), field.top + field.height - size.height)

  let arrow: Box
  let caption: Box
  switch (opening.dir) {
    case 0:
      arrow = { left: at.x - arrowWidth / 2, top: at.y - near - arrowHeight, width: arrowWidth, height: arrowHeight }
      caption = { left: clampX(at.x - size.width / 2), top: at.y - far - size.height, width: size.width, height: size.height }
      break
    case 2:
      arrow = { left: at.x - arrowWidth / 2, top: at.y + near, width: arrowWidth, height: arrowHeight }
      caption = { left: clampX(at.x - size.width / 2), top: at.y + far, width: size.width, height: size.height }
      break
    case 3:
      arrow = { left: at.x - near - arrowHeight, top: at.y - arrowWidth / 2, width: arrowHeight, height: arrowWidth }
      caption = { left: at.x - far - size.width, top: clampY(at.y - size.height / 2), width: size.width, height: size.height }
      break
    default:
      arrow = { left: at.x + near, top: at.y - arrowWidth / 2, width: arrowHeight, height: arrowWidth }
      caption = { left: at.x + far, top: clampY(at.y - size.height / 2), width: size.width, height: size.height }
  }
  if (!within(arrow, field) || !within(caption, field)) return null
  // The arrow sits in the mouth of its own opening, so that one cell is not an
  // obstacle to it; every other wall is kept at arm's length, a caption further.
  if (touchesMaze(arrow, mask, grid, cell, inkPad + CLEARANCE, opening.cell)) return null
  if (touchesMaze(caption, mask, grid, cell, inkPad + Math.max(CLEARANCE, labelGap))) return null
  return { opening, arrow, caption }
}

/** True when two openings' captions and arrows can share the page without touching. */
export function placementsClear(a: SmOpeningPlacement, b: SmOpeningPlacement, gap: number): boolean {
  if (a.opening.cell.r === b.opening.cell.r && a.opening.cell.c === b.opening.cell.c) return false
  return (
    !boxesOverlap(a.caption, b.caption, gap) &&
    !boxesOverlap(a.caption, b.arrow, gap) &&
    !boxesOverlap(a.arrow, b.caption, gap) &&
    !boxesOverlap(a.arrow, b.arrow, gap)
  )
}

/**
 * The page for one shape: the widest corridors at which its silhouette is a
 * faithful likeness, the grid centred between the caption bands, and every
 * outline edge with room for a Start or a Finish.
 *
 * Returns null — and the page tries another shape — when no corridor width in
 * the level's band gives a good likeness, or the shape leaves nowhere to put
 * the captions.
 */
export function planSmPage(options: {
  drawing: SubjectDrawing
  field: Box
  level: SmLevel
  journey: SmJourney
  font: string
}): SmPagePlan | null {
  const { drawing, field, level, journey, font } = options
  // Sized once at the widest corridor, which gives the biggest caption band;
  // narrower corridors only shrink it, so the shape box is never over-promised.
  const probe = mazeMetrics(level.maxPath)
  const probeBand = bandHeight(probe, captionSize(SM_FINISH_WORD, journey.finish.label, probe, font, field.width))
  const cells = candidateCells({
    drawing,
    width: field.width - probe.inkPad * 2,
    height: field.height - probeBand * 2,
    level,
  })

  for (const cell of cells) {
    const metrics = mazeMetrics(cell)
    const start = captionSize(SM_START_WORD, journey.start.label, metrics, font, field.width)
    const finish = captionSize(SM_FINISH_WORD, journey.finish.label, metrics, font, field.width)
    const band = Math.max(bandHeight(metrics, start), bandHeight(metrics, finish))
    const width = field.width - metrics.inkPad * 2
    const height = field.height - band * 2
    const built = buildShapeMask({ drawing, width, height, cell })
    if (!built) continue
    if (shapeFault(built.mask, built.quality, level)) continue

    const { mask, quality } = built
    const grid: Box = {
      left: Math.round(field.left + (field.width - mask.cols * cell) / 2),
      top: Math.round(field.top + (field.height - mask.rows * cell) / 2),
      width: mask.cols * cell,
      height: mask.rows * cell,
    }
    const edges = outlineEdges(mask)
    const place = (size: SmCaptionSize) =>
      edges
        .map((opening) => placeOpening({ opening, size, mask, grid, field, metrics }))
        .filter((p): p is SmOpeningPlacement => p !== null)
    const starts = place(start)
    const finishes = place(finish)
    if (starts.length === 0 || finishes.length === 0) continue
    return { cell, metrics, mask, quality, grid, field, start, finish, starts, finishes }
  }
  return null
}

/**
 * Shapes the page-size check tries: wide, tall and square, the spread of the
 * library. Journeys with long place names, so the captions are not flattered.
 */
const PROBE_SHAPES = ['teapot', 'motorhome', 'lighthouse', 'coffee-mug', 'garden-shed', 'butterfly'] as const
const PROBE_JOURNEY: SmJourney = {
  start: { label: 'Conference Call', phrase: 'the Conference Call' },
  finish: { label: 'Scenic Overlook', phrase: 'the Scenic Overlook' },
}
/** Probe shapes that must fit for the page to count as big enough. */
const PROBE_NEEDED = 2
const probeCache = new Map<string, boolean>()

/**
 * Whether this page can hold shaped mazes at this level: most of a spread of
 * reference shapes must plan cleanly on it. Measured rather than estimated,
 * because what decides it is how real outlines land on this grid. Checked
 * before any page is dealt, so a trim that is simply too small says so — and
 * says which lever moves it — instead of failing shape by shape.
 */
export function smPageFits(field: Box, level: SmLevel, font = STUDIO_DEFAULT_FONT): boolean {
  const key = [level.id, Math.round(field.width), Math.round(field.height), font].join('|')
  const cached = probeCache.get(key)
  if (cached !== undefined) return cached
  let fits = 0
  for (const id of PROBE_SHAPES) {
    const shape = smShapeById(id)
    if (!shape) continue
    const drawing = sgVariantDrawing(shape.subject, smShapeVariants(shape)[0]!)
    if (planSmPage({ drawing, field, level, journey: PROBE_JOURNEY, font })) fits++
  }
  const ok = fits >= PROBE_NEEDED
  if (probeCache.size > 200) probeCache.clear()
  probeCache.set(key, ok)
  return ok
}

/** Corridor width as the form says it: inches, to the hundredth. */
const inchesLabel = (px: number) => `${(px / DPI).toFixed(2)}`

/** What this level prints on the page size currently set in Settings. */
export function smPrintNote(options: {
  level: SmLevel
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
}): string {
  const { level, page, config } = options
  const base = 'Every page is a different retirement shape with its own Start and Finish, one way through, plus a matching answer page.'
  if (!page) return base
  // A typical one-line instruction: the page measures its own when it is drawn.
  const field = smDrawField(page, config, 'Find your way from the Office to the Beach.')
  if (!smPageFits(field, level, String(config.fontFamily ?? STUDIO_DEFAULT_FONT))) {
    return smPageTooSmallMessage(level)
  }
  return `Paths ${inchesLabel(level.minPath)}–${inchesLabel(level.maxPath)} in wide. ${base}`
}
