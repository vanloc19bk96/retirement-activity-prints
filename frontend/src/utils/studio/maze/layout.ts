import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  contentBox,
  insetBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import { fabricTextHeight } from '../studio-text-metrics'
import type { MazeLevel } from './levels'

/**
 * Everything a maze page decides on the seller's behalf.
 *
 * One number governs the sheet, and it is not a cell count: it is how wide a
 * corridor has to be for a hand to draw a line down it. Walls, the route on the
 * key, the Start and Finish labels and the arrows into the openings are all
 * sized against that width, and the grid is however many corridors of that
 * width the trim can hold.
 *
 * Having it the other way round is what let the old form promise a twenty-six
 * column maze on a 5 x 8 paperback and then print corridors an eighth of an
 * inch wide. A cell count cannot see the page; a corridor width cannot help
 * but see it.
 *
 * The form reports what came out (`mazePrintNote`) and generate lays out
 * against the same plan, so the note and the printed page cannot disagree.
 */

export function ptToPx(pt: number): number {
  return Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
}

/**
 * Breathing room between the safe area and anything the maze draws.
 *
 * Small, because the label bands above and below already hold the grid clear of
 * the heading and the page number, and every pixel spent here is a pixel the
 * corridors do not get. It exists so a wall bar never lands *on* the safe line,
 * which reads as a trimming fault rather than as a border.
 */
const FIELD_INSET = 8

/**
 * Wall weight against corridor width.
 *
 * Walls are the thing being read. Too thin and a 300 dpi press renders them
 * grey and broken; too thick and they eat the corridor they are supposed to
 * bound. Rounded from the corridor so a wide gentle maze prints a confident
 * line and a dense one stays legible without closing up.
 */
const WALL_RATIO = 0.085
const WALL_MIN = 2
const WALL_MAX = 4

/** The outer frame is heavier than the corridors, so the two gaps in it read as gaps. */
const BORDER_EXTRA = 2
const BORDER_MAX = 6

/**
 * Solution weight against corridor width.
 *
 * Heavier than the walls on purpose: on the key the route is the content and
 * the maze is the context. Capped so it never fills the corridor it traces —
 * a reader has to see which side of a wall the line ran.
 */
const ROUTE_RATIO = 0.14
const ROUTE_MIN = 2
const ROUTE_MAX = 5

/**
 * Start / Finish captions.
 *
 * Held at large-print sizes for the same reason the rest of the catalogue is:
 * the labels are the only words on the page, and a reader who cannot find
 * which end to start at has no way into the puzzle.
 */
const LABEL_MIN_FONT = ptToPx(13)
const LABEL_MAX_FONT = ptToPx(17)
const LABEL_RATIO = 0.55

/** Arrow into the opening: a wayfinding mark, sized from the gap it points at. */
const ARROW_WIDTH_RATIO = 0.5
const ARROW_HEIGHT_RATIO = 0.38
const ARROW_MIN_WIDTH = 9
const ARROW_MIN_HEIGHT = 7

const LABEL_GAP_RATIO = 0.18
const ARROW_GAP_RATIO = 0.12
const LABEL_GAP_MIN = 4
const ARROW_GAP_MIN = 3

export interface MazeMetrics {
  /** Corridor width — the pitch from one wall centre to the next. */
  cell: number
  wallWidth: number
  borderWidth: number
  /** Half the outer frame, which straddles the grid line and reaches outside it. */
  inkPad: number
  routeWidth: number
  labelFont: number
  labelGap: number
  arrowWidth: number
  arrowHeight: number
  arrowGap: number
  /** Caption plus arrow plus their gaps — reserved above and below the grid. */
  labelBand: number
}

export function mazeMetrics(cell: number): MazeMetrics {
  const wallWidth = Math.max(WALL_MIN, Math.min(WALL_MAX, Math.round(cell * WALL_RATIO)))
  const borderWidth = Math.min(BORDER_MAX, wallWidth + BORDER_EXTRA)
  const labelFont = Math.max(
    LABEL_MIN_FONT,
    Math.min(LABEL_MAX_FONT, Math.round(cell * LABEL_RATIO)),
  )
  const labelGap = Math.max(LABEL_GAP_MIN, Math.round(cell * LABEL_GAP_RATIO))
  const arrowGap = Math.max(ARROW_GAP_MIN, Math.round(cell * ARROW_GAP_RATIO))
  const arrowHeight = Math.max(ARROW_MIN_HEIGHT, Math.round(cell * ARROW_HEIGHT_RATIO))
  const arrowWidth = Math.max(ARROW_MIN_WIDTH, Math.round(cell * ARROW_WIDTH_RATIO))

  return {
    cell,
    wallWidth,
    borderWidth,
    inkPad: Math.ceil(borderWidth / 2),
    routeWidth: Math.max(
      ROUTE_MIN,
      Math.min(ROUTE_MAX, Math.round(cell * ROUTE_RATIO)),
    ),
    labelFont,
    labelGap,
    arrowWidth,
    arrowHeight,
    arrowGap,
    labelBand:
      Math.ceil(fabricTextHeight(1, labelFont)) + labelGap + arrowHeight + arrowGap,
  }
}

export interface MazePagePlan {
  cols: number
  rows: number
  metrics: MazeMetrics
  /** Drawn size of the whole maze block, captions and frame included. */
  blockWidth: number
  blockHeight: number
  /** True when the trim held the maze down to the level's smallest grid. */
  reducedByPage: boolean
}

/** The safe printable column every maze page lays out inside. */
export function mazeContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function mazeBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = mazeContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/** The box the maze block is drawn and centred in. */
export function mazeDrawField(body: Box): Box {
  return insetBox(body, FIELD_INSET)
}

function planFor(field: Box, level: MazeLevel, cell: number): MazePagePlan | null {
  const metrics = mazeMetrics(cell)
  const gridWidth = field.width - metrics.inkPad * 2
  const gridHeight = field.height - metrics.labelBand * 2 - metrics.inkPad * 2
  if (gridWidth <= 0 || gridHeight <= 0) return null

  const cols = Math.min(level.maxCols, Math.floor(gridWidth / cell))
  const rows = Math.min(level.maxRows, Math.floor(gridHeight / cell))
  if (cols < level.minCols || rows < level.minRows) return null

  return {
    cols,
    rows,
    metrics,
    blockWidth: cols * cell + metrics.inkPad * 2,
    blockHeight: rows * cell + metrics.inkPad * 2 + metrics.labelBand * 2,
    // At the floor the page is the thing deciding, not the level, and the form
    // should say which lever moves it.
    reducedByPage: cols <= level.minCols || rows <= level.minRows,
  }
}

/**
 * The widest corridors this trim can hold at this level.
 *
 * Walked from the ceiling down, so the first plan that fits is the roomiest
 * one — corridor width is the whole point of the ladder, and a maze that could
 * have printed at a third of an inch has no business printing at a quarter.
 * More cells is what a larger trim buys, not smaller ones.
 *
 * Returns null when even the narrowest corridors leave too few cells for a
 * maze: a 5 x 8 trim with a deep heading and a three-line instruction. The form
 * says so before Generate is ever pressed.
 */
export function planMazePage(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  level: MazeLevel
}): MazePagePlan | null {
  const { page, config, instruction, level } = options
  const field = mazeDrawField(mazeBodyField(page, config, instruction))
  for (let cell = level.maxPath; cell >= level.minPath; cell--) {
    const plan = planFor(field, level, cell)
    if (plan) return plan
  }
  return null
}

/**
 * Where the maze block sits in the body column.
 *
 * Centred, because a maze is the only thing on its page: there is no word bank
 * below it to weigh the stack down, and a block pushed up under the heading
 * leaves a hand's depth of white paper at the foot of a printed sheet. The same
 * call places the puzzle and the key, so the two pages print the maze at the
 * same size in the same place and a reader can hold one against the other.
 */
export function mazeBlockBox(body: Box, plan: MazePagePlan): Box {
  const field = mazeDrawField(body)
  return {
    left: Math.round(field.left + (field.width - plan.blockWidth) / 2),
    top: Math.round(field.top + (field.height - plan.blockHeight) / 2),
    width: plan.blockWidth,
    height: plan.blockHeight,
  }
}

/** Corridor width as the form says it: inches, to the hundredth. */
export function pathWidthLabel(cell: number): string {
  return `${(cell / DPI).toFixed(2)} in`
}

/** What this level prints on the page size currently set in Settings. */
export function mazePrintNote(options: {
  level: MazeLevel
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
}): string {
  const { level, page, config, instruction } = options
  if (!page) {
    return 'One maze a page, with exactly one way through, plus a matching answer page.'
  }

  const plan = planMazePage({ page, config, instruction, level })
  if (!plan) {
    return (
      'This page size is too small for a maze at this level — ' +
      'choose a larger one in Settings, or a gentler level.'
    )
  }

  const note =
    `A ${plan.cols} × ${plan.rows} maze, paths ${pathWidthLabel(plan.metrics.cell)} wide, ` +
    'one way through, plus a matching answer page.'
  // Say what the page gives, then what to change if they want more. A maze held
  // to the level's smallest grid is not a fault to apologise for — it is the
  // trim doing its job, and the only useful reply is the lever.
  return plan.reducedByPage
    ? `${note} A larger page size in Settings fits a bigger maze.`
    : note
}
