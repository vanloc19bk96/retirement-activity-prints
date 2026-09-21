import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE } from '@/constants/studio.constants'
import { buildGroup, type StudioTag } from '../studio-fabric-builders'
import { columns, rows, unionObjectBounds, type Box } from '../studio-layout'
import { COORD_BAND_RATIO, drawGridFigure } from './render'
import {
  measureMoveList,
  planMoveLines,
  type MoveLine,
  type MoveListMetrics,
} from './move-list'
import { drawMoveList } from './move-list-draw'
import type { FigureCount, Route, RouteSettings } from './types'

/** Space between figures. */
const FIGURE_GUTTER = 22
/** Vertical gap between a figure's grid and the move list under it. */
const BLOCK_GAP = 18

/**
 * Smallest square worth printing: below this the start dot and the shaded answer
 * stop resolving on cream KDP paper.
 */
const MIN_CELL = 15
/**
 * How much bigger a square must be than the type under it. A square is shaded
 * with a pencil, so it needs to out-measure a glyph by a clear margin; tying
 * the two 1:1 printed a grid that read as small as the words below it.
 */
const CELL_TO_TYPE = 1.4
/**
 * Floor for the move list. A trim this cramped has no comfortable layout left;
 * the fitter still prefers the largest type that fits, so it only lands here
 * when the page really is out of room.
 */
const ABS_MIN_LIST_FONT = 6
const MAX_LIST_FONT = STUDIO_BODY_SIZE

/** Squares below this print smaller than comfortable large print (~0.25 in). */
export const LARGE_PRINT_CELL = 24

/** Where each figure sits: one per page, stacked pairs, or a 2 x 2 block. */
export function figureSlots(field: Box, figures: FigureCount): Box[] {
  if (figures === 1) return [field]
  const bands = rows(field, 2, FIGURE_GUTTER)
  if (figures === 2) return bands
  return bands.flatMap((band) => columns(band, 2, FIGURE_GUTTER))
}

export interface FigurePlan {
  cell: number
  fontSize: number
  metrics: MoveListMetrics
  /** The squares only — the coordinate band is drawn around this. */
  gridBounds: Box
  listBox: Box
  /** True when grid + list do not both fit the slot at this type size. */
  overflows: boolean
}

/** Grid centered on top, move list centered under it — one stacked block. */
function composePlan(options: {
  avail: Box
  cell: number
  metrics: MoveListMetrics
  settings: RouteSettings
  route: Route
  fontSize: number
}): FigurePlan {
  const { avail, cell, metrics, settings, route, fontSize } = options
  const band = settings.showCoordLabels ? COORD_BAND_RATIO * cell : 0
  const gridW = route.gridCols * cell + band
  const gridH = route.gridRows * cell + band

  const blockWidth = Math.max(gridW, metrics.width)
  const blockHeight = gridH + BLOCK_GAP + metrics.height
  const blockLeft = avail.left + Math.max(0, (avail.width - gridW) / 2)
  const blockTop =
    avail.top + Math.max(0, (avail.height - blockHeight) / 2)

  const listBox: Box = {
    left: avail.left + Math.max(0, (avail.width - metrics.width) / 2),
    top: blockTop + gridH + BLOCK_GAP,
    width: metrics.width,
    height: metrics.height,
  }

  return {
    cell,
    fontSize,
    metrics,
    gridBounds: {
      left: Math.round(blockLeft + band),
      top: Math.round(blockTop + band),
      width: route.gridCols * cell,
      height: route.gridRows * cell,
    },
    listBox: { ...listBox, left: Math.round(listBox.left), top: Math.round(listBox.top) },
    overflows: blockWidth > avail.width || blockHeight > avail.height,
  }
}

/**
 * Largest type the move list can print while the squares keep pace with it.
 *
 * Grid and list stack in one centered column (list always under the grid).
 * For each candidate type size, size the squares to what remains above the
 * list, and stop at the first size whose squares still clear `CELL_TO_TYPE`.
 *
 * `maxCell` caps multi-grid pages. A single grid fills the slot — otherwise
 * the page looks sparse with a stamp-sized board under a short move list.
 */
export function planFigure(options: {
  slot: Box
  route: Route
  lines: readonly MoveLine[]
  settings: RouteSettings
  font: string
}): FigurePlan {
  const { slot, route, lines, settings, font } = options
  const unitsX = route.gridCols + (settings.showCoordLabels ? COORD_BAND_RATIO : 0)
  const unitsY = route.gridRows + (settings.showCoordLabels ? COORD_BAND_RATIO : 0)
  const fillSlot = settings.figures === 1

  let fitting: FigurePlan | null = null
  let smallest: FigurePlan | null = null
  for (let fontSize = MAX_LIST_FONT; fontSize >= ABS_MIN_LIST_FONT; fontSize--) {
    const metrics = measureMoveList(lines, fontSize, font, slot.width)
    const under = Math.min(
      slot.width / unitsX,
      (slot.height - metrics.height - BLOCK_GAP) / unitsY,
    )
    const budget = fillSlot ? under : Math.min(settings.maxCell, under)
    const cell = Math.max(1, Math.floor(budget))
    const plan = composePlan({
      avail: slot,
      cell,
      metrics,
      settings,
      route,
      fontSize,
    })
    if (cell >= Math.max(MIN_CELL, fontSize * CELL_TO_TYPE) && !plan.overflows) return plan
    // Nothing comfortable yet: remember the smallest type that still fits, which
    // is the one leaving the grid the most room.
    if (!plan.overflows) fitting = plan
    smallest = plan
  }
  return fitting ?? smallest!
}

/** One figure — grid and move list — as a single movable group. */
export function buildFigure(options: {
  slot: Box
  route: Route
  settings: RouteSettings
  font: string
  tag: StudioTag
}): StudioFabricObject | null {
  const { slot, route, settings, font, tag } = options
  const lines = planMoveLines(route, settings)
  const plan = planFigure({ slot, route, lines, settings, font })

  const parts: StudioFabricObject[] = [
    ...drawGridFigure({
      bounds: plan.gridBounds,
      cell: plan.cell,
      route,
      settings,
      font,
      tag,
    }),
    ...drawMoveList({
      box: plan.listBox,
      lines,
      fontSize: plan.fontSize,
      metrics: plan.metrics,
      font,
      tag,
    }),
  ]

  const bounds = unionObjectBounds(parts)
  if (!bounds) return null
  return buildGroup(parts, bounds, tag, 'structure')
}
