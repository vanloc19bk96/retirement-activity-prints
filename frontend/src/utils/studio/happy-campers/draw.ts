import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_INK,
  STUDIO_PAPER,
  STUDIO_RULE,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import type { Box } from '../studio-layout'
import { HC_TEMPLATE_KEY, hcSignText, type HcCampground, type HcLevel } from './content'
import {
  HC_LEGEND_ICON,
  HC_LEGEND_ICON_GAP,
  HC_LEGEND_ITEM_GAP,
  hcLegendSpec,
  hcLegendWidth,
  hcLegendWords,
  hcLineHeight,
  hcSignSpec,
  hcSignWidth,
  hcTextWidth,
  type HcPlan,
} from './layout'
import type { HcBuilt } from './puzzle'

/**
 * A planned grid → one Fabric group: the campground's sign, the numbers,
 * the grid with its trees, the tents hidden for the answer page, and the
 * legend.
 *
 * Black on white with soft gray fills, so it prints the same on any
 * interior. Kept plain for older eyes and hands: every tree is the same
 * round tree on a trunk, and a tent is just a triangle, so the mark the
 * reader pencils in is three strokes and can never be mistaken for a tree.
 * The tent is shown once, in the legend; on the answer page every tent is
 * drawn in its square.
 */

/** Marks the objects a Happy Campers page draws, for checks and the editor. */
export const HC_PART_KEY = 'hcPart'

/** The soft fill inside trees, as a Phosphor duotone icon has. */
const TREE_FILL = '#D6D6D6'
/** Share of a square a tree or tent fills. */
export const HC_ICON_OF_CELL = 0.78

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [HC_PART_KEY]: name, ...extra } }
}

/**
 * One filled, outlined path from shapes drawn in a unit square, placed in
 * `box`. Each shape is closed unless it is a two-point stroke.
 */
function iconPath(options: {
  shapes: readonly (readonly Pt[])[]
  open?: readonly (readonly Pt[])[]
  box: Box
  fill: string
  strokeWidth: number
  tag: StudioTag
  role: StudioRole
}): StudioFabricObject {
  const { shapes, open = [], box, fill, strokeWidth, tag, role } = options
  const path: (string | number)[][] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (line: readonly Pt[], closed: boolean) => {
    line.forEach(([u, v], i) => {
      const x = r2(box.left + u * box.width)
      const y = r2(box.top + v * box.height)
      path.push([i === 0 ? 'M' : 'L', x, y])
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })
    if (closed) path.push(['Z'])
  }
  shapes.forEach((shape) => add(shape, true))
  open.forEach((line) => add(line, false))
  return {
    type: 'path',
    path,
    // A path is placed by the centre of its own geometry (Fabric's pathOffset).
    left: r2((minX + maxX) / 2),
    top: r2((minY + maxY) / 2),
    width: r2(maxX - minX),
    height: r2(maxY - minY),
    originX: 'center',
    originY: 'center',
    fill,
    stroke: STUDIO_INK,
    strokeWidth,
    strokeUniform: true,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    // Tents stay hidden on the puzzle page; the answer key reveals them.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

/* ------------------------------------------------------------------ *
 * The drawings, in a unit square
 * ------------------------------------------------------------------ */

/** A plain round tree: a circle on a short trunk. */
const CROWN: readonly Pt[] = Array.from({ length: 48 }, (_, k) => {
  const a = (k / 48) * Math.PI * 2
  return [0.5 + 0.36 * Math.cos(a), 0.41 + 0.36 * Math.sin(a)] as const
})

const TRUNK: readonly Pt[] = [
  [0.43, 0.6],
  [0.57, 0.6],
  [0.57, 0.99],
  [0.43, 0.99],
]

/** A tent is a plain triangle: the easiest mark to pencil in a square. */
const TENT: readonly Pt[] = [
  [0.08, 0.9],
  [0.5, 0.1],
  [0.92, 0.9],
]

function treeParts(box: Box, tag: StudioTag, name: string, extra: Record<string, unknown>): StudioFabricObject[] {
  // Trunk first, so the crown covers its top.
  return [
    part(iconPath({ shapes: [TRUNK], box, fill: TREE_FILL, strokeWidth: STUDIO_STROKE_HAIRLINE, tag, role: 'prompt' }), 'trunk'),
    part(iconPath({ shapes: [CROWN], box, fill: TREE_FILL, strokeWidth: STUDIO_STROKE_HAIRLINE, tag, role: 'prompt' }), name, extra),
  ]
}

function tentPart(box: Box, tag: StudioTag, role: StudioRole, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return part(iconPath({ shapes: [TENT], box, fill: STUDIO_PAPER, strokeWidth: STUDIO_STROKE_NORMAL, tag, role }), name, extra)
}

const iconBox = (cx: number, cy: number, side: number): Box => ({ left: cx - side / 2, top: cy - side / 2, width: side, height: side })

/* ------------------------------------------------------------------ *
 * The puzzle
 * ------------------------------------------------------------------ */

function countNumber(n: number, x: number, y: number, size: number, tag: StudioTag, line: string): StudioFabricObject {
  return part(
    buildText(
      {
        left: r2(x),
        top: r2(y),
        text: String(n),
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize: size,
        fontWeight: 700,
        width: Math.ceil(size * 1.1),
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        // Fabric's default multiplier centres a lone glyph off its axis.
        lineHeight: 1,
      },
      tag,
      'prompt',
    ),
    'count',
    { line, n },
  )
}

/** The sign's box for this campground, centred over the grid and kept on the panel. */
export function hcSignBox(plan: HcPlan, campground: HcCampground, font: string): Box {
  const width = Math.min(plan.signBand.width, hcSignWidth(hcSignText(campground, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the sign's words may set, centred on the sign and kept inside its band. */
export function hcSignTextRoom(plan: HcPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the grid and kept on the panel. */
export function hcLegendBox(plan: HcPlan, tents: number, font: string): Box {
  const width = hcLegendWidth(tents, font)
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top: plan.legendTop, width, height: plan.legendHeight }
}

export function buildHcPuzzle(options: {
  built: HcBuilt
  plan: HcPlan
  campground: HcCampground
  level: HcLevel
  /** `campground|level|grid` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, campground, level, label, tag, font } = options
  const { puzzle, tents } = built
  const { grid, cell, countSize, countGap, rowCountWidth, colCountHeight } = plan
  const parts: StudioFabricObject[] = []

  // The sign: a double-ruled board with the campground's name.
  const sign = hcSignBox(plan, campground, font)
  parts.push(part(buildRect({ ...sign, rx: 10, ry: 10, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 2 }, tag), 'sign'))
  parts.push(
    part(
      buildRect(
        { left: sign.left + 4, top: sign.top + 4, width: sign.width - 8, height: sign.height - 8, rx: 7, ry: 7, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1 },
        tag,
      ),
      'sign',
    ),
  )
  const signText = hcSignText(campground, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - hcLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the sign's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping onto
          // the numbers below.
          width: Math.max(hcTextWidth(signText, plan.signSize, hcSignSpec(font)), hcSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The grid: medium rules inside, a heavy frame round the field.
  for (const bar of drawGridLines(grid, cell, plan.size, plan.size, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE })) {
    parts.push(part(bar, 'rule'))
  }
  parts.push(
    part(
      buildRect({ left: grid.left, top: grid.top, width: grid.width, height: grid.height, fill: 'transparent', stroke: STUDIO_RULE, strokeWidth: STUDIO_STROKE_BOLD }, tag),
      'frame',
    ),
  )

  // Trees, given; tents, hidden until the answer page.
  const side = cell * HC_ICON_OF_CELL
  for (let i = 0; i < puzzle.rows * puzzle.cols; i++) {
    const r = Math.floor(i / puzzle.cols)
    const c = i % puzzle.cols
    const box = iconBox(grid.left + (c + 0.5) * cell, grid.top + (r + 0.5) * cell, side)
    if (puzzle.trees[i]) parts.push(...treeParts(box, tag, 'tree', { row: r, col: c }))
    else if (tents[i]) parts.push(tentPart(box, tag, 'answer', 'tent', { row: r, col: c }))
  }

  // The numbers: rows to the left, columns above.
  puzzle.rowCounts.forEach((n, r) => {
    parts.push(countNumber(n, grid.left - countGap - rowCountWidth / 2, grid.top + (r + 0.5) * cell, countSize, tag, `r${r}`))
  })
  puzzle.colCounts.forEach((n, c) => {
    parts.push(countNumber(n, grid.left + (c + 0.5) * cell, grid.top - countGap - colCountHeight / 2, countSize, tag, `c${c}`))
  })

  // The legend: the tree they are given, the tent they draw, how many.
  const tentCount = tents.filter(Boolean).length
  const legend = hcLegendBox(plan, tentCount, font)
  const [treeWord, tentWord] = hcLegendWords(tentCount)
  const midY = legend.top + legend.height / 2
  const textTop = midY - hcLineHeight(plan.legendSize) / 2
  let x = legend.left
  parts.push(...treeParts(iconBox(x + HC_LEGEND_ICON / 2, midY, HC_LEGEND_ICON), tag, 'legend-tree', {}))
  x += HC_LEGEND_ICON + HC_LEGEND_ICON_GAP
  const treeWidth = hcTextWidth(treeWord, plan.legendSize, hcLegendSpec(font))
  parts.push(part(buildText({ left: r2(x), top: r2(textTop), text: treeWord, fontFamily: font, fontSize: plan.legendSize, lineHeight: 1, width: treeWidth }, tag, 'prompt'), 'legend-text'))
  x += treeWidth + HC_LEGEND_ITEM_GAP
  parts.push(tentPart(iconBox(x + HC_LEGEND_ICON / 2, midY, HC_LEGEND_ICON), tag, 'prompt', 'legend-tent'))
  x += HC_LEGEND_ICON + HC_LEGEND_ICON_GAP
  const tentWidth = hcTextWidth(tentWord, plan.legendSize, hcLegendSpec(font))
  parts.push(
    part(buildText({ left: r2(x), top: r2(textTop), text: tentWord, fontFamily: font, fontSize: plan.legendSize, lineHeight: 1, width: tentWidth }, tag, 'prompt'), 'legend-text', { tents: tentCount }),
  )

  const top = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const left = Math.min(sign.left, legend.left, grid.left - countGap - rowCountWidth)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, grid.left + grid.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: HC_TEMPLATE_KEY,
      [HC_PART_KEY]: 'puzzle',
      campground: campground.name,
      level,
      size: `${puzzle.cols}x${puzzle.rows}`,
      tents: tentCount,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same grid, however it is turned, is the same puzzle wherever it sits.
      [STUDIO_CANONICAL_KEY]: `${HC_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
