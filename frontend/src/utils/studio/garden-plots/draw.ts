import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_PAPER, STUDIO_RULE_MEDIUM, STUDIO_STROKE_HAIRLINE, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import type { Box } from '../studio-layout'
import { GP_TEMPLATE_KEY, gpSignText, type GpGarden, type GpLevel } from './content'
import {
  GP_FLOWER_OF_CELL,
  GP_LEGEND_ICON,
  GP_LEGEND_ICON_GAP,
  GP_LEGEND_ITEM_GAP,
  GP_LEGEND_ROW_GAP,
  GP_WALL,
  gpLegendItemWidths,
  gpLegendRowHeight,
  gpLegendSpec,
  gpLegendWidth,
  gpLegendWords,
  gpLineHeight,
  gpSignSpec,
  gpSignWidth,
  gpTextWidth,
  type GpPlan,
} from './layout'
import type { GpBuilt } from './puzzle'

/**
 * A planned garden → one Fabric group: the garden's sign, the beds (each
 * softly tinted, no two neighbours alike), the soft rules between squares,
 * the heavy walls round every bed, the flowers hidden for the answer page,
 * and the legend.
 *
 * Black on white with light gray tints, so it prints the same on any
 * interior. The walls carry the puzzle — the tints only help the eye find a
 * bed — so a garden still reads if the grays print pale. The flower the
 * reader plants is shown once, in the legend; on the answer page a flower
 * blooms in every planted square.
 */

/** Marks the objects a Garden Plots page draws, for checks and the editor. */
export const GP_PART_KEY = 'gpPart'

/**
 * The bed tints: white and three light grays, far enough apart to tell
 * side by side and light enough for pencil marks to read on the darkest.
 */
export const GP_TINTS = ['#FFFFFF', '#DEDEDE', '#EEEEEE', '#CCCCCC'] as const

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [GP_PART_KEY]: name, ...extra } }
}

/** One filled, outlined path of closed shapes drawn in a unit square, placed in `box`. */
function shapePath(options: { shapes: readonly (readonly Pt[])[]; box: Box; fill: string; strokeWidth: number; tag: StudioTag; role: StudioRole }): StudioFabricObject {
  const { shapes, box, fill, strokeWidth, tag, role } = options
  const path: (string | number)[][] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const shape of shapes) {
    shape.forEach(([u, v], i) => {
      const x = r2(box.left + u * box.width)
      const y = r2(box.top + v * box.height)
      path.push([i === 0 ? 'M' : 'L', x, y])
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })
    path.push(['Z'])
  }
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
    // Flowers stay hidden on the puzzle page; the answer key reveals them.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

/* ------------------------------------------------------------------ *
 * The flower, in a unit square
 * ------------------------------------------------------------------ */

const ellipse = (cx: number, cy: number, rx: number, ry: number, turn: number, steps = 28): Pt[] =>
  Array.from({ length: steps }, (_, k) => {
    const a = (k / steps) * Math.PI * 2
    const x = rx * Math.cos(a)
    const y = ry * Math.sin(a)
    return [cx + x * Math.cos(turn) - y * Math.sin(turn), cy + x * Math.sin(turn) + y * Math.cos(turn)] as const
  })

/** Five round petals, one pointing straight up. */
const PETALS: readonly (readonly Pt[])[] = Array.from({ length: 5 }, (_, k) => {
  const turn = -Math.PI / 2 + (k * 2 * Math.PI) / 5
  return ellipse(0.5 + 0.25 * Math.cos(turn), 0.5 + 0.25 * Math.sin(turn), 0.2, 0.135, turn)
})
const HEART: readonly Pt[] = ellipse(0.5, 0.5, 0.13, 0.13, 0)

/** A flower: white petals round a solid heart. */
function flowerParts(box: Box, tag: StudioTag, role: StudioRole, name: string, extra: Record<string, unknown> = {}): StudioFabricObject[] {
  const weight = box.width >= 36 ? STUDIO_STROKE_NORMAL : STUDIO_STROKE_HAIRLINE
  return [
    part(shapePath({ shapes: PETALS, box, fill: STUDIO_PAPER, strokeWidth: weight, tag, role }), name, extra),
    part(shapePath({ shapes: [HEART], box, fill: STUDIO_INK, strokeWidth: weight, tag, role }), `${name}-heart`, extra),
  ]
}

const iconBox = (cx: number, cy: number, side: number): Box => ({ left: cx - side / 2, top: cy - side / 2, width: side, height: side })

/* ------------------------------------------------------------------ *
 * The beds
 * ------------------------------------------------------------------ */

/**
 * A tint for every bed, no two beds that share a side alike. Four always
 * do (a garden is a map); the search tries beds with the most neighbours
 * first and backs up when it paints itself into a corner.
 */
export function gpBedTints(size: number, beds: readonly number[]): number[] {
  const near: Set<number>[] = Array.from({ length: size }, () => new Set<number>())
  for (let i = 0; i < size * size; i++) {
    const r = Math.floor(i / size)
    const c = i % size
    for (const j of [c + 1 < size ? i + 1 : -1, r + 1 < size ? i + size : -1]) {
      if (j < 0 || beds[i] === beds[j]) continue
      near[beds[i]!]!.add(beds[j]!)
      near[beds[j]!]!.add(beds[i]!)
    }
  }
  const order = Array.from({ length: size }, (_, k) => k).sort((a, b) => near[b]!.size - near[a]!.size || a - b)
  const tint = new Array<number>(size).fill(-1)
  const paint = (n: number): boolean => {
    if (n === order.length) return true
    const bed = order[n]!
    for (let t = 0; t < GP_TINTS.length; t++) {
      if ([...near[bed]!].some((o) => tint[o] === t)) continue
      tint[bed] = t
      if (paint(n + 1)) return true
    }
    tint[bed] = -1
    return false
  }
  paint(0)
  return tint.map((t) => Math.max(0, t))
}

/** A wall: a filled bar, so every wall prints the same weight. */
function wallBar(box: Box, tag: StudioTag, extra: Record<string, unknown>): StudioFabricObject {
  return part(buildRect({ left: r2(box.left), top: r2(box.top), width: r2(box.width), height: r2(box.height), fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag), 'wall', extra)
}

/**
 * Every wall the garden needs, as runs of squares: along each grid line,
 * the stretches where the squares either side are in different beds. The
 * frame is four walls of its own.
 */
export function gpWallRuns(size: number, beds: readonly number[]): { across: [number, number, number][]; down: [number, number, number][] } {
  // [line, from, to]: a vertical wall on column line `line` from row `from` to row `to` (exclusive), and so on.
  const down: [number, number, number][] = []
  const across: [number, number, number][] = []
  for (let line = 1; line < size; line++) {
    let start = -1
    for (let k = 0; k <= size; k++) {
      const wall = k < size && beds[k * size + line - 1] !== beds[k * size + line]
      if (wall && start < 0) start = k
      if (!wall && start >= 0) {
        down.push([line, start, k])
        start = -1
      }
    }
    start = -1
    for (let k = 0; k <= size; k++) {
      const wall = k < size && beds[(line - 1) * size + k] !== beds[line * size + k]
      if (wall && start < 0) start = k
      if (!wall && start >= 0) {
        across.push([line, start, k])
        start = -1
      }
    }
  }
  return { across, down }
}

/** The sign's box for this garden, centred over the grid and kept on the panel. */
export function gpSignBox(plan: GpPlan, garden: GpGarden, font: string): Box {
  const width = Math.min(plan.signBand.width, gpSignWidth(gpSignText(garden, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the sign's words may set, centred on the sign and kept inside its band. */
export function gpSignTextRoom(plan: GpPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the grid and kept on the panel. */
export function gpLegendBox(plan: GpPlan, font: string): Box {
  const width = gpLegendWidth(plan.size, font, plan.legendRows)
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top: plan.legendTop, width, height: plan.legendHeight }
}

export function buildGpPuzzle(options: {
  built: GpBuilt
  plan: GpPlan
  garden: GpGarden
  level: GpLevel
  /** `garden|level|beds` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, garden, level, label, tag, font } = options
  const { puzzle, flowers } = built
  const { grid, cell, size } = plan
  const n = puzzle.size
  const parts: StudioFabricObject[] = []

  // The sign: a double-ruled board with the garden's name.
  const sign = gpSignBox(plan, garden, font)
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
  const signText = gpSignText(garden, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - gpLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the sign's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(gpTextWidth(signText, plan.signSize, gpSignSpec(font)), gpSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The beds' tints: one band per run of a bed's squares along a row.
  const tints = gpBedTints(n, puzzle.beds)
  for (let r = 0; r < n; r++) {
    let start = 0
    for (let c = 1; c <= n; c++) {
      if (c < n && puzzle.beds[r * n + c] === puzzle.beds[r * n + start]) continue
      const bed = puzzle.beds[r * n + start]!
      const fill = GP_TINTS[tints[bed]!]!
      if (fill !== STUDIO_PAPER) {
        parts.push(
          part(
            buildRect({ left: grid.left + start * cell, top: grid.top + r * cell, width: (c - start) * cell, height: cell, fill, stroke: 'transparent', strokeWidth: 0 }, tag),
            'tint',
            { bed, row: r, from: start, to: c },
          ),
        )
      }
      start = c
    }
  }

  // Soft rules between every square.
  for (const bar of drawGridLines(grid, cell, size, size, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE })) {
    parts.push(part(bar, 'rule'))
  }

  // Heavy walls round every bed, each reaching half its weight past its ends so corners meet square.
  const w = GP_WALL
  const clampX = (x: number) => Math.min(Math.max(x, grid.left), grid.left + grid.width)
  const clampY = (y: number) => Math.min(Math.max(y, grid.top), grid.top + grid.height)
  const { across, down } = gpWallRuns(n, puzzle.beds)
  for (const [line, from, to] of down) {
    const x = grid.left + line * cell - w / 2
    const top = clampY(grid.top + from * cell - w / 2)
    const bottom = clampY(grid.top + to * cell + w / 2)
    parts.push(wallBar({ left: x, top, width: w, height: bottom - top }, tag, { line: `c${line}`, from, to }))
  }
  for (const [line, from, to] of across) {
    const y = grid.top + line * cell - w / 2
    const left = clampX(grid.left + from * cell - w / 2)
    const right = clampX(grid.left + to * cell + w / 2)
    parts.push(wallBar({ left, top: y, width: right - left, height: w }, tag, { line: `r${line}`, from, to }))
  }
  // The frame, flush inside the garden's edge.
  parts.push(wallBar({ left: grid.left, top: grid.top, width: grid.width, height: w }, tag, { line: 'frame' }))
  parts.push(wallBar({ left: grid.left, top: grid.top + grid.height - w, width: grid.width, height: w }, tag, { line: 'frame' }))
  parts.push(wallBar({ left: grid.left, top: grid.top, width: w, height: grid.height }, tag, { line: 'frame' }))
  parts.push(wallBar({ left: grid.left + grid.width - w, top: grid.top, width: w, height: grid.height }, tag, { line: 'frame' }))

  // Flowers, hidden until the answer page.
  const side = cell * GP_FLOWER_OF_CELL
  for (const i of flowers) {
    const row = Math.floor(i / n)
    const col = i % n
    const box = iconBox(grid.left + (col + 0.5) * cell, grid.top + (row + 0.5) * cell, side)
    parts.push(...flowerParts(box, tag, 'answer', 'flower', { row, col, bed: puzzle.beds[i] }))
  }

  // The legend: a bed they are given (and how many), the flower they plant.
  const legend = gpLegendBox(plan, font)
  const [bedWord, flowerWord] = gpLegendWords(n)
  const [bedItem] = gpLegendItemWidths(n, font)
  const rowHeight = gpLegendRowHeight()
  const rowMid = (row: number) => legend.top + row * (rowHeight + GP_LEGEND_ROW_GAP) + rowHeight / 2
  const words = (text: string, x: number, midY: number, extra: Record<string, unknown> = {}) =>
    part(
      buildText(
        { left: r2(x), top: r2(midY - gpLineHeight(plan.legendSize) / 2), text, fontFamily: font, fontSize: plan.legendSize, lineHeight: 1, width: gpTextWidth(text, plan.legendSize, gpLegendSpec(font)) },
        tag,
        'prompt',
      ),
      'legend-text',
      extra,
    )

  const icon = GP_LEGEND_ICON
  let x = legend.left
  let midY = rowMid(0)
  // A bed: a tinted patch of four squares in a heavy wall.
  const patch = icon - 4
  const patchLeft = x + 2
  const patchTop = midY - patch / 2
  parts.push(part(buildRect({ left: patchLeft, top: patchTop, width: patch, height: patch, fill: GP_TINTS[1], stroke: 'transparent', strokeWidth: 0 }, tag), 'legend-bed'))
  parts.push(part(buildRect({ left: patchLeft + patch / 2 - 0.5, top: patchTop, width: 1, height: patch, fill: STUDIO_RULE_MEDIUM, stroke: 'transparent', strokeWidth: 0 }, tag), 'legend-bed-rule'))
  parts.push(part(buildRect({ left: patchLeft, top: patchTop + patch / 2 - 0.5, width: patch, height: 1, fill: STUDIO_RULE_MEDIUM, stroke: 'transparent', strokeWidth: 0 }, tag), 'legend-bed-rule'))
  parts.push(part(buildRect({ left: patchLeft, top: patchTop, width: patch, height: patch, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 3 }, tag), 'legend-bed-wall'))
  parts.push(words(bedWord, x + icon + GP_LEGEND_ICON_GAP, midY, { beds: n }))

  if (plan.legendRows === 1) x += bedItem + GP_LEGEND_ITEM_GAP
  else midY = rowMid(1)
  parts.push(...flowerParts(iconBox(x + icon / 2, midY, icon), tag, 'prompt', 'legend-flower'))
  parts.push(words(flowerWord, x + icon + GP_LEGEND_ICON_GAP, midY, { flowers: n }))

  const top = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const left = Math.min(sign.left, legend.left, grid.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, grid.left + grid.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: GP_TEMPLATE_KEY,
      [GP_PART_KEY]: 'puzzle',
      garden: garden.name,
      level,
      size: `${n}x${n}`,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same garden, however it is turned, is the same puzzle wherever it sits.
      [STUDIO_CANONICAL_KEY]: `${GP_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
