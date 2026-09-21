import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_BODY_SIZE,
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE_LIGHT,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import {
  buildCircle,
  buildGroup,
  buildLine,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  estimateTextBoxWidth,
  insetBox,
  rows,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import type { FoldItem } from './distractors'
import type { Cell, Fold, Region } from './fold'

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

const INDEX_W = 24
const LABEL_H = 18
/** Space between option tile bottom and letter / answer ring. */
const LABEL_GAP = 6
/** Stroke halo below the letter band — without this Fabric clips the answer pill. */
const ANSWER_RING_OUTSET = STUDIO_STROKE_NORMAL
const TILE_GUTTER = 7
const BAND_GAP = 18
const ROW_GUTTER = 14
const CREASE_DASH = [4, 3]
const ARROW_HEAD = 4
const MIN_FONT = 8
/**
 * Keep option letters / answer rings off the red safe-area guide. Fitting and
 * drawing both use this inset so a dense page drops an item instead of hugging
 * the margin.
 */
const FIELD_EDGE_PAD = 16
/**
 * Smallest printable grid cell. Punched holes are drawn at ~half a cell, so
 * below this the dots stop resolving on cream KDP paper. Item count is fitted
 * to this floor rather than clamped, which is what keeps rows inside the
 * bottom margin on the small trims (5 x 8, 5.5 x 8.5).
 */
const MIN_CELL_PX = 7
const HOLE_RADIUS_RATIO = 0.28

/** Body minus breathing room so ink never sits flush on the safe edge. */
function layoutField(field: Box): Box {
  return insetBox(field, FIELD_EDGE_PAD)
}

interface SheetTileOptions {
  tile: Box
  gridSize: number
  region: Region
  holes: readonly Cell[]
  fold?: Fold
  tag: StudioTag
}

/** Shaft + chevron head as one movable group. */
function buildArrow(
  from: { x: number; y: number },
  to: { x: number; y: number },
  tag: StudioTag,
): StudioFabricObject | null {
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    buildLine(
      { x1, y1, x2, y2, stroke: STUDIO_INK, strokeWidth: STUDIO_STROKE_HAIRLINE },
      tag,
      'decoration',
    )
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const parts = [
    line(from.x, from.y, to.x, to.y),
    line(to.x, to.y, to.x - (ux + uy) * ARROW_HEAD, to.y - (uy - ux) * ARROW_HEAD),
    line(to.x, to.y, to.x - (ux - uy) * ARROW_HEAD, to.y - (uy + ux) * ARROW_HEAD),
  ]
  const bounds = unionObjectBounds(parts)
  if (!bounds) return null
  return buildGroup(parts, bounds, tag, 'decoration')
}

/**
 * One sheet diagram as a single group: outline, crease, fold arrow, and holes.
 */
function buildSheetTile(options: SheetTileOptions): StudioFabricObject | null {
  const { tile, gridSize, region, holes, fold, tag } = options
  const side = Math.min(tile.width, tile.height)
  const scale = side / gridSize
  const originX = tile.left + (tile.width - side) / 2
  const originY = tile.top + (tile.height - side) / 2

  const rect: Box = {
    left: originX + region.x * scale,
    top: originY + region.y * scale,
    width: region.w * scale,
    height: region.h * scale,
  }
  const parts: StudioFabricObject[] = [
    buildRect(
      {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        fill: 'transparent',
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      tag,
      'structure',
    ),
  ]

  if (fold) {
    const alongX = fold.axis === 'v'
    const creaseAt = (alongX ? originX : originY) + fold.line * scale
    const lo = alongX ? rect.left : rect.top
    const hi = alongX ? rect.left + rect.width : rect.top + rect.height

    const creaseEnds = alongX
      ? { x1: creaseAt, y1: rect.top, x2: creaseAt, y2: rect.top + rect.height }
      : { x1: rect.left, y1: creaseAt, x2: rect.left + rect.width, y2: creaseAt }
    parts.push(
      buildLine(
        {
          ...creaseEnds,
          stroke: STUDIO_INK_MUTED,
          strokeWidth: STUDIO_STROKE_HAIRLINE,
          strokeDashArray: CREASE_DASH,
        },
        tag,
        'structure',
      ),
    )

    // The arrow starts on the flap that lifts and ends where it lands, mirrored
    // across the crease. Creases are off-centre, so a fixed-length arrow drawn
    // from the sheet centre would point the wrong way on lopsided folds.
    const flapCentre = fold.keep === 'low' ? (creaseAt + hi) / 2 : (lo + creaseAt) / 2
    const landing = 2 * creaseAt - flapCentre
    const cross = alongX ? rect.top + rect.height / 2 : rect.left + rect.width / 2
    const from = alongX ? { x: flapCentre, y: cross } : { x: cross, y: flapCentre }
    const to = alongX ? { x: landing, y: cross } : { x: cross, y: landing }
    const arrow = buildArrow(from, to, tag)
    if (arrow) parts.push(arrow)
  }

  const radius = Math.max(1.5, Math.min(scale * HOLE_RADIUS_RATIO, 6))
  for (const hole of holes) {
    parts.push(
      buildCircle(
        {
          left: originX + (hole.c + 0.5) * scale,
          top: originY + (hole.r + 0.5) * scale,
          radius,
          fill: STUDIO_INK,
          stroke: STUDIO_INK,
          strokeWidth: 0,
        },
        tag,
        'structure',
      ),
    )
  }

  const bounds = unionObjectBounds(parts)
  if (!bounds) return null
  return buildGroup(parts, bounds, tag, 'structure')
}

function drawOptionLabel(
  objects: StudioFabricObject[],
  options: {
    tile: Box
    labelTop: number
    letter: string
    isCorrect: boolean
    font: string
    tag: StudioTag
  },
): void {
  const { tile, labelTop, letter, isCorrect, font, tag } = options
  const centerX = tile.left + tile.width / 2
  const centerY = labelTop + LABEL_H / 2
  const fontSize = Math.max(MIN_FONT, Math.min(STUDIO_BODY_SIZE * 0.6, LABEL_H * 0.7))

  objects.push(
    buildText(
      {
        left: centerX,
        top: centerY,
        text: letter,
        width: estimateTextBoxWidth(letter, fontSize, tile.width),
        fontFamily: font,
        fontSize,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )
  if (!isCorrect) return

  const ringH = Math.min(LABEL_H, fontSize + 6)
  objects.push(
    buildRect(
      {
        left: centerX,
        top: centerY,
        width: Math.min(tile.width, ringH * 1.5),
        height: ringH,
        rx: ringH / 2,
        ry: ringH / 2,
        originX: 'center',
        originY: 'center',
        fill: 'transparent',
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_NORMAL,
      },
      tag,
      'answer',
    ),
  )
}

interface RowPlan {
  tileSide: number
  /** Left edge of the `1)` / `2)` label — packed with the game, not pinned to the row. */
  indexLeft: number
  sequenceLeft: number
  optionsLeft: number
  blockTop: number
  optionsTop: number
  labelTop: number
  /** Set only when both bands share a single line. */
  dividerX: number | null
}

/**
 * Fold steps and answer choices sit on one line when the row is wide, and stack
 * into two lines when that buys bigger tiles — hole dots must stay readable in print.
 *
 * Index + game pack as one unit, then that unit is centered in the row. Centering
 * the game alone inside `(row − INDEX_W)` left a void after `1)` whenever tiles
 * were height-limited (e.g. 4 items × 3 folds).
 */
function planRow(options: {
  row: Box
  stageCount: number
  optionCount: number
}): RowPlan {
  const { row, stageCount, optionCount } = options
  const contentW = row.width - INDEX_W
  const bandWidth = (count: number, tile: number) =>
    count * tile + TILE_GUTTER * (count - 1)
  const totalTiles = stageCount + optionCount

  // Include answer-ring stroke so the last row's pill is not clipped by the group.
  const labelStack = LABEL_GAP + LABEL_H + ANSWER_RING_OUTSET
  const inlineTile = Math.min(
    (contentW - TILE_GUTTER * (totalTiles - 2) - BAND_GAP) / totalTiles,
    row.height - labelStack,
  )
  const stackedTile = Math.min(
    (contentW - TILE_GUTTER * (stageCount - 1)) / stageCount,
    (contentW - TILE_GUTTER * (optionCount - 1)) / optionCount,
    (row.height - labelStack - BAND_GAP) / 2,
  )
  const isStacked = stackedTile > inlineTile
  // Never floor this: both candidates are derived from the row box, so the
  // winner always fits. Clamping up to a minimum is what used to push the last
  // row past the bottom margin. `fitFoldItemCount` enforces legibility instead.
  const tileSide = Math.max(1, isStacked ? stackedTile : inlineTile)

  const sequenceW = bandWidth(stageCount, tileSide)
  const optionsW = bandWidth(optionCount, tileSide)
  const gameW = isStacked
    ? Math.max(sequenceW, optionsW)
    : sequenceW + BAND_GAP + optionsW
  const packedW = INDEX_W + gameW
  const packedLeft = row.left + Math.max(0, (row.width - packedW) / 2)
  const gameLeft = packedLeft + INDEX_W
  const bandLeft = (bandW: number) => gameLeft + Math.max(0, (gameW - bandW) / 2)

  const blockH = isStacked
    ? tileSide * 2 + BAND_GAP + labelStack
    : tileSide + labelStack
  const blockTop = row.top + Math.max(0, (row.height - blockH) / 2)

  if (isStacked) {
    const optionsTop = blockTop + tileSide + BAND_GAP
    return {
      tileSide,
      indexLeft: packedLeft,
      sequenceLeft: bandLeft(sequenceW),
      optionsLeft: bandLeft(optionsW),
      blockTop,
      optionsTop,
      labelTop: optionsTop + tileSide + LABEL_GAP,
      dividerX: null,
    }
  }

  return {
    tileSide,
    indexLeft: packedLeft,
    sequenceLeft: gameLeft,
    optionsLeft: gameLeft + sequenceW + BAND_GAP,
    blockTop,
    optionsTop: blockTop,
    labelTop: blockTop + tileSide + LABEL_GAP,
    dividerX: Math.round(gameLeft + sequenceW + BAND_GAP / 2),
  }
}

interface RowOptions {
  row: Box
  item: FoldItem
  index: number
  font: string
  tag: StudioTag
}

/** One item: each sheet grouped, folds band grouped, then the whole question. */
function buildFoldingRow(options: RowOptions): StudioFabricObject | null {
  const { row, item, index, font, tag } = options
  const { puzzle } = item
  const stageCount = puzzle.stages.length
  const plan = planRow({ row, stageCount, optionCount: item.options.length })
  const { tileSide } = plan
  const tileOf = (slot: number, bandLeft: number, top: number): Box => ({
    left: bandLeft + slot * (tileSide + TILE_GUTTER),
    top,
    width: tileSide,
    height: tileSide,
  })

  const label = `${index})`
  const labelSize = Math.max(MIN_FONT, Math.min(STUDIO_BODY_SIZE * 0.6, INDEX_W * 0.55))
  const indexLabel = buildText(
    {
      left: plan.indexLeft,
      top: plan.blockTop + tileSide / 2,
      text: label,
      width: estimateTextBoxWidth(label, labelSize, INDEX_W),
      fontFamily: font,
      fontSize: labelSize,
      fill: STUDIO_INK_MUTED,
      originY: 'center',
    },
    tag,
    'decoration',
  )

  const foldParts: StudioFabricObject[] = []
  puzzle.stages.forEach((region, i) => {
    const isFinal = i === stageCount - 1
    const sheet = buildSheetTile({
      tile: tileOf(i, plan.sequenceLeft, plan.blockTop),
      gridSize: puzzle.gridSize,
      region,
      holes: isFinal ? puzzle.punches : [],
      fold: isFinal ? undefined : puzzle.folds[i],
      tag,
    })
    if (sheet) foldParts.push(sheet)
  })
  const foldBounds = unionObjectBounds(foldParts)
  if (!foldBounds) return null
  const foldsGroup = buildGroup(foldParts, foldBounds, tag, 'structure')

  const questionParts: StudioFabricObject[] = [indexLabel, foldsGroup]
  if (plan.dividerX !== null) {
    questionParts.push(
      buildLine(
        {
          x1: plan.dividerX,
          y1: plan.blockTop,
          x2: plan.dividerX,
          y2: plan.blockTop + tileSide,
          stroke: STUDIO_RULE_LIGHT,
          strokeWidth: STUDIO_STROKE_HAIRLINE,
        },
        tag,
        'decoration',
      ),
    )
  }

  item.options.forEach((holes, i) => {
    const tile = tileOf(i, plan.optionsLeft, plan.optionsTop)
    const sheet = buildSheetTile({
      tile,
      gridSize: puzzle.gridSize,
      region: { x: 0, y: 0, w: puzzle.gridSize, h: puzzle.gridSize },
      holes,
      tag,
    })
    if (sheet) questionParts.push(sheet)
    drawOptionLabel(questionParts, {
      tile,
      labelTop: plan.labelTop,
      letter: OPTION_LETTERS[i] ?? '?',
      isCorrect: i === item.correctIndex,
      font,
      tag,
    })
  })

  const questionBounds = unionObjectBounds(questionParts)
  if (!questionBounds) return null
  return buildGroup(questionParts, questionBounds, tag, 'structure')
}

function tileSideFor(
  field: Box,
  count: number,
  stageCount: number,
  optionCount: number,
): number {
  const row = rows(layoutField(field), count, ROW_GUTTER)[0]
  if (!row || row.height <= 0) return 0
  return planRow({ row, stageCount, optionCount }).tileSide
}

/**
 * Largest item count (<= `desired`) whose sheet cells still clear MIN_CELL_PX
 * inside `field`. Rows shrink to fit the field, so packing more items never
 * overflows the page — it just shrinks the holes past the point of printing.
 */
function fitFoldItemCount(options: {
  field: Box
  desired: number
  gridSize: number
  stageCount: number
  optionCount: number
}): number {
  const { field, desired, gridSize, stageCount, optionCount } = options
  const minTile = gridSize * MIN_CELL_PX
  for (let count = Math.max(1, desired); count > 1; count--) {
    if (tileSideFor(field, count, stageCount, optionCount) >= minTile) return count
  }
  return 1
}

/**
 * Picks the grid and item count this page can actually print.
 *
 * The requested grid wins where it can — it is what gives the template its
 * content space. But a page carrying a single puzzle is poor value in a book, so
 * a grid that cannot seat `minItems` legibly steps down rather than shipping one
 * item; on a 5 x 8 trim the option band is under 180pt wide, which a 6 x 6 sheet
 * cannot fill at a printable dot size. Only when no grid seats `minItems` does
 * the page fall back to a single, comfortably large item.
 */
export function fitFoldLayout(options: {
  field: Box
  desiredItems: number
  desiredGrid: number
  minGrid: number
  minItems: number
  stageCount: number
  optionCount: number
}): { gridSize: number; itemCount: number } {
  const { field, desiredItems, desiredGrid, minGrid, minItems, stageCount, optionCount } =
    options
  const fitAt = (gridSize: number) => {
    const itemCount = fitFoldItemCount({
      field,
      desired: desiredItems,
      gridSize,
      stageCount,
      optionCount,
    })
    const legible =
      tileSideFor(field, itemCount, stageCount, optionCount) >= gridSize * MIN_CELL_PX
    return { gridSize, itemCount, legible }
  }

  const fits = []
  for (let gridSize = desiredGrid; gridSize >= minGrid; gridSize--) {
    const fit = fitAt(gridSize)
    if (fit.legible && fit.itemCount >= Math.min(minItems, desiredItems)) return fit
    fits.push(fit)
  }
  const fallback = fits.find((fit) => fit.legible)
  return fallback ?? { gridSize: minGrid, itemCount: 1 }
}

/** Centered vertical stack of fold items — one movable page group. */
export function drawFoldingItems(
  objects: StudioFabricObject[],
  options: { field: Box; items: FoldItem[]; font: string; tag: StudioTag },
): void {
  const { field, items, font, tag } = options
  if (items.length === 0) return
  const usable = layoutField(field)
  const rowBoxes = rows(usable, items.length, ROW_GUTTER)
  const questionGroups: StudioFabricObject[] = []
  items.forEach((item, i) => {
    const row = rowBoxes[i]
    // A field too short to hold a row would place tiles below it — print nothing
    // rather than push ink past the bottom margin.
    if (!row || row.height <= 0) return
    const question = buildFoldingRow({ row, item, index: i + 1, font, tag })
    if (question) questionGroups.push(question)
  })
  const gridBounds = unionObjectBounds(questionGroups)
  if (!gridBounds) return
  // Shrink-wrap then re-center. Never shrink the group below content size —
  // Fabric clips children to the group box and would cut the answer pill.
  let left = usable.left + Math.max(0, (usable.width - gridBounds.width) / 2)
  let top = usable.top + Math.max(0, (usable.height - gridBounds.height) / 2)
  left = Math.min(left, usable.left + usable.width - gridBounds.width)
  top = Math.min(top, usable.top + usable.height - gridBounds.height)
  left = Math.max(usable.left, left)
  top = Math.max(usable.top, top)
  const centered: Box = {
    left,
    top,
    width: gridBounds.width,
    height: gridBounds.height,
  }
  const dx = centered.left - gridBounds.left
  const dy = centered.top - gridBounds.top
  const placed =
    dx === 0 && dy === 0
      ? questionGroups
      : questionGroups.map((group) => ({
          ...group,
          left: (group.left ?? 0) + dx,
          top: (group.top ?? 0) + dy,
        }))
  objects.push(buildGroup(placed, centered, tag, 'structure'))
}
