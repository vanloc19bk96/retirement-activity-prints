import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_PAPER, STUDIO_RULE_MEDIUM, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import type { Box } from '../studio-layout'
import { PQ_LEGEND_SAMPLE, PQ_TEMPLATE_KEY, pqPatchWord, pqSampleWord, pqSignText, type PqLevel, type PqQuilt } from './content'
import {
  PQ_FRAME,
  PQ_LEGEND_ICON,
  PQ_LEGEND_ICON_GAP,
  PQ_LEGEND_ITEM_GAP,
  PQ_LEGEND_ROW_GAP,
  pqLegendItemWidths,
  pqLegendRowHeight,
  pqLegendSpec,
  pqLegendWidth,
  pqLineHeight,
  pqNumberSpec,
  pqSampleIconWidth,
  pqSignSpec,
  pqSignWidth,
  pqTextWidth,
  type PqPlan,
} from './layout'
import { pqPatchMap, type PqBuilt } from './puzzle'
import type { PqRect } from './solver'

/**
 * A planned quilt → one Fabric group: the quilt's label, the softly ruled
 * squares in a heavy binding, the numbers, the sewn quilt hidden for the
 * answer page, and the legend.
 *
 * The puzzle page is black on white — nothing on the quilt but the lines
 * and the numbers, so pencil lines read clearly. On the answer page every
 * patch is a plain fabric in one of four grays (no two patches that share a
 * side alike, no prints or stitching to muddy the page), sewn to its
 * neighbours with a heavy seam, and every number sits on a white button so
 * it reads over any fabric. Grays only, so it prints the same on any
 * interior.
 */

/** Marks the objects a Patchwork Quilt page draws, for checks and the editor. */
export const PQ_PART_KEY = 'pqPart'

/** The answer page's fabrics: four plain grays, far enough apart to tell side by side. */
export const PQ_FABRICS = [
  { name: 'white', fill: STUDIO_PAPER },
  { name: 'light', fill: '#E6E6E6' },
  { name: 'mid', fill: '#D2D2D2' },
  { name: 'deep', fill: '#BDBDBD' },
] as const

export type PqFabric = (typeof PQ_FABRICS)[number]['name']

/** The running stitch on the label's inner rule. */
const STITCH_DASH = [5, 4]

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [PQ_PART_KEY]: name, ...extra } }
}

/**
 * One path of polylines in canvas px, closed into filled shapes. Answer
 * paths start hidden; the answer key reveals them, keeping their fill and
 * inking their stroke.
 */
function pathOf(options: {
  lines: readonly (readonly Pt[])[]
  close: boolean
  fill: string
  strokeWidth: number
  tag: StudioTag
  role: StudioRole
}): StudioFabricObject {
  const { lines, close, fill, strokeWidth, tag, role } = options
  const path: (string | number)[][] = []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const line of lines) {
    line.forEach(([px, py], i) => {
      const x = r2(px)
      const y = r2(py)
      path.push([i === 0 ? 'M' : 'L', x, y])
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    })
    if (close) path.push(['Z'])
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
    strokeLineCap: close ? 'round' : 'butt',
    strokeLineJoin: 'round',
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    // The sewn quilt stays hidden on the puzzle page; the answer key reveals it.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

const boxCorners = (b: Box): Pt[] => [
  [b.left, b.top],
  [b.left + b.width, b.top],
  [b.left + b.width, b.top + b.height],
  [b.left, b.top + b.height],
]

const circle = (cx: number, cy: number, r: number, steps = 20): Pt[] =>
  Array.from({ length: steps }, (_, k) => {
    const a = (k / steps) * Math.PI * 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  })

/* ------------------------------------------------------------------ *
 * The patches
 * ------------------------------------------------------------------ */

/**
 * A fabric for every patch, no two patches that share a side alike. Four
 * always do (a quilt is a map); the search tries patches with the most
 * neighbours first and backs up when it paints itself into a corner.
 */
export function pqPatchFabrics(size: number, patches: readonly PqRect[]): number[] {
  const map = pqPatchMap(size, patches)
  const near: Set<number>[] = patches.map(() => new Set<number>())
  for (let i = 0; i < size * size; i++) {
    const r = Math.floor(i / size)
    const c = i % size
    for (const j of [c + 1 < size ? i + 1 : -1, r + 1 < size ? i + size : -1]) {
      if (j < 0 || map[i] === map[j]) continue
      near[map[i]!]!.add(map[j]!)
      near[map[j]!]!.add(map[i]!)
    }
  }
  const order = patches.map((_, k) => k).sort((a, b) => near[b]!.size - near[a]!.size || a - b)
  const fabric = new Array<number>(patches.length).fill(-1)
  let budget = 20000
  const paint = (n: number): boolean => {
    if (n === order.length) return true
    const k = order[n]!
    // Start from a different fabric each patch, so the quilt mixes all four.
    for (let t0 = 0; t0 < PQ_FABRICS.length; t0++) {
      if (--budget < 0) return false
      const t = (t0 + k) % PQ_FABRICS.length
      if ([...near[k]!].some((o) => fabric[o] === t)) continue
      fabric[k] = t
      if (paint(n + 1)) return true
    }
    fabric[k] = -1
    return false
  }
  paint(0)
  return fabric.map((t) => Math.max(0, t))
}

/**
 * Every seam the quilt needs, as runs of squares: along each grid line, the
 * stretches where the squares either side are in different patches. The
 * binding round the quilt is drawn on its own.
 */
export function pqSeamRuns(size: number, patchOf: readonly number[]): { across: [number, number, number][]; down: [number, number, number][] } {
  // [line, from, to]: a vertical seam on column line `line` from row `from` to row `to` (exclusive), and so on.
  const down: [number, number, number][] = []
  const across: [number, number, number][] = []
  for (let line = 1; line < size; line++) {
    let start = -1
    for (let k = 0; k <= size; k++) {
      const seam = k < size && patchOf[k * size + line - 1] !== patchOf[k * size + line]
      if (seam && start < 0) start = k
      if (!seam && start >= 0) {
        down.push([line, start, k])
        start = -1
      }
    }
    start = -1
    for (let k = 0; k <= size; k++) {
      const seam = k < size && patchOf[(line - 1) * size + k] !== patchOf[line * size + k]
      if (seam && start < 0) start = k
      if (!seam && start >= 0) {
        across.push([line, start, k])
        start = -1
      }
    }
  }
  return { across, down }
}

/** A patch's box on the page. */
function patchBox(plan: PqPlan, rect: PqRect): Box {
  return {
    left: plan.grid.left + rect.col * plan.cell,
    top: plan.grid.top + rect.row * plan.cell,
    width: rect.width * plan.cell,
    height: rect.height * plan.cell,
  }
}

/** The white button under a number on the answer page: round the number, never past its square. */
export function pqButtonRadius(value: number, numberSize: number, cell: number): number {
  const wide = String(value).length > 1
  return Math.min(cell * 0.42, numberSize * (wide ? 0.86 : 0.68))
}

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

/** The label's box for this quilt, centred over the grid and kept on the panel. */
export function pqSignBox(plan: PqPlan, quilt: PqQuilt, font: string): Box {
  const width = Math.min(plan.signBand.width, pqSignWidth(pqSignText(quilt, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the label's words may set, centred on the label and kept inside its band. */
export function pqSignTextRoom(plan: PqPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the grid and kept on the panel. */
export function pqLegendBox(plan: PqPlan, font: string): Box {
  const width = pqLegendWidth(plan.size, font, plan.legendRows)
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top: plan.legendTop, width, height: plan.legendHeight }
}

function numberText(value: number, cx: number, cy: number, size: number, tag: StudioTag, name: string, extra: Record<string, unknown>): StudioFabricObject {
  const text = String(value)
  return part(
    buildText(
      {
        left: r2(cx),
        top: r2(cy),
        text,
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize: size,
        fontWeight: 700,
        width: Math.max(Math.ceil(size * 1.1), pqTextWidth(text, size, pqNumberSpec())),
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        // Fabric's default multiplier centres a lone glyph off its axis.
        lineHeight: 1,
      },
      tag,
      'prompt',
    ),
    name,
    { n: value, ...extra },
  )
}

export function buildPqPuzzle(options: {
  built: PqBuilt
  plan: PqPlan
  quilt: PqQuilt
  level: PqLevel
  /** `quilt|level|numbers` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, quilt, level, label, tag, font } = options
  const { puzzle, patches } = built
  const { grid, cell, size, numberSize } = plan
  const n = puzzle.size
  const parts: StudioFabricObject[] = []

  // The label: a double-ruled board with the quilt's name, its inner rule a running stitch.
  const sign = pqSignBox(plan, quilt, font)
  parts.push(part(buildRect({ ...sign, rx: 10, ry: 10, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 2 }, tag), 'sign'))
  parts.push(
    part(
      buildRect(
        {
          left: sign.left + 5,
          top: sign.top + 5,
          width: sign.width - 10,
          height: sign.height - 10,
          rx: 6,
          ry: 6,
          fill: 'transparent',
          stroke: STUDIO_INK,
          strokeWidth: 1,
          strokeDashArray: STITCH_DASH,
        },
        tag,
      ),
      'sign',
    ),
  )
  const signText = pqSignText(quilt, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - pqLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the label's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(pqTextWidth(signText, plan.signSize, pqSignSpec(font)), pqSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // Soft rules between every square.
  for (const bar of drawGridLines(grid, cell, size, size, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE })) parts.push(part(bar, 'rule'))

  // The sewn quilt, hidden until the answer page: a plain gray fabric on every patch.
  const fabrics = pqPatchFabrics(n, patches)
  patches.forEach((rect, k) => {
    const box = patchBox(plan, rect)
    const fabric = PQ_FABRICS[fabrics[k]!]!
    const at = { patch: k, row: rect.row, col: rect.col, height: rect.height, width: rect.width }
    parts.push(part(pathOf({ lines: [boxCorners(box)], close: true, fill: fabric.fill, strokeWidth: 0, tag, role: 'answer' }), 'fabric', { ...at, fabric: fabric.name }))
  })

  // Heavy seams between patches, each reaching half its weight past its ends so corners meet square.
  const w = PQ_FRAME
  const clampX = (x: number) => Math.min(Math.max(x, grid.left), grid.left + grid.width)
  const clampY = (y: number) => Math.min(Math.max(y, grid.top), grid.top + grid.height)
  const seam = (box: Box, extra: Record<string, unknown>) =>
    part(pathOf({ lines: [boxCorners(box)], close: true, fill: STUDIO_INK, strokeWidth: 0, tag, role: 'answer' }), 'seam', extra)
  const { across, down } = pqSeamRuns(n, pqPatchMap(n, patches))
  for (const [line, from, to] of down) {
    const top = clampY(grid.top + from * cell - w / 2)
    const bottom = clampY(grid.top + to * cell + w / 2)
    parts.push(seam({ left: grid.left + line * cell - w / 2, top, width: w, height: bottom - top }, { line: `c${line}`, from, to }))
  }
  for (const [line, from, to] of across) {
    const left = clampX(grid.left + from * cell - w / 2)
    const right = clampX(grid.left + to * cell + w / 2)
    parts.push(seam({ left, top: grid.top + line * cell - w / 2, width: right - left, height: w }, { line: `r${line}`, from, to }))
  }

  // The binding, flush inside the quilt's edge.
  const binding = (box: Box) => part(buildRect({ ...box, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag), 'frame')
  parts.push(binding({ left: grid.left, top: grid.top, width: grid.width, height: w }))
  parts.push(binding({ left: grid.left, top: grid.top + grid.height - w, width: grid.width, height: w }))
  parts.push(binding({ left: grid.left, top: grid.top, width: w, height: grid.height }))
  parts.push(binding({ left: grid.left + grid.width - w, top: grid.top, width: w, height: grid.height }))

  // The numbers, each on a white button that only the answer page shows.
  for (const clue of puzzle.clues) {
    const row = Math.floor(clue.at / n)
    const col = clue.at % n
    const cx = grid.left + (col + 0.5) * cell
    const cy = grid.top + (row + 0.5) * cell
    const r = pqButtonRadius(clue.size, numberSize, cell)
    parts.push(part(pathOf({ lines: [circle(cx, cy, r, 28)], close: true, fill: STUDIO_PAPER, strokeWidth: STUDIO_STROKE_HAIRLINE, tag, role: 'answer' }), 'button', { row, col }))
    parts.push(numberText(clue.size, cx, cy, numberSize, tag, 'number', { row, col }))
  }

  // The legend: a sample patch and what its number means, then a swatch and how many patches there are.
  const legend = pqLegendBox(plan, font)
  const [sampleItem] = pqLegendItemWidths(n, font)
  const rowHeight = pqLegendRowHeight()
  const rowMid = (row: number) => legend.top + row * (rowHeight + PQ_LEGEND_ROW_GAP) + rowHeight / 2
  const words = (text: string, x: number, midY: number, extra: Record<string, unknown>) =>
    part(
      buildText(
        { left: r2(x), top: r2(midY - pqLineHeight(plan.legendSize) / 2), text, fontFamily: font, fontSize: plan.legendSize, lineHeight: 1, width: pqTextWidth(text, plan.legendSize, pqLegendSpec(font)) },
        tag,
        'prompt',
      ),
      'legend-text',
      extra,
    )

  const icon = PQ_LEGEND_ICON
  let x = legend.left
  let midY = rowMid(0)
  // A sample patch: squares in a row, a soft rule between them, a heavy seam round them, the number in the first.
  const sampleWidth = pqSampleIconWidth()
  const sampleTop = midY - icon / 2
  for (let k = 1; k < PQ_LEGEND_SAMPLE; k++) {
    parts.push(part(buildRect({ left: x + k * icon - 0.5, top: sampleTop, width: 1, height: icon, fill: STUDIO_RULE_MEDIUM, stroke: 'transparent', strokeWidth: 0 }, tag), 'legend-sample-rule'))
  }
  parts.push(part(buildRect({ left: x, top: sampleTop, width: sampleWidth, height: icon, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 3 }, tag), 'legend-sample'))
  parts.push(numberText(PQ_LEGEND_SAMPLE, x + icon / 2, midY, plan.legendSize, tag, 'legend-number', {}))
  parts.push(words(pqSampleWord(PQ_LEGEND_SAMPLE), x + sampleWidth + PQ_LEGEND_ICON_GAP, midY, { sample: PQ_LEGEND_SAMPLE }))

  if (plan.legendRows === 1) x += sampleItem + PQ_LEGEND_ITEM_GAP
  else midY = rowMid(1)
  // A swatch: a plain gray patch in a heavy seam.
  const swatch: Box = { left: x + 1.5, top: midY - icon / 2 + 1.5, width: icon - 3, height: icon - 3 }
  parts.push(part(buildRect({ ...swatch, fill: PQ_FABRICS[2].fill, stroke: STUDIO_INK, strokeWidth: 3 }, tag), 'legend-swatch'))
  parts.push(words(pqPatchWord(patches.length), x + icon + PQ_LEGEND_ICON_GAP, midY, { patches: patches.length }))

  const top = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const left = Math.min(sign.left, legend.left, grid.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, grid.left + grid.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: PQ_TEMPLATE_KEY,
      [PQ_PART_KEY]: 'puzzle',
      quilt: quilt.name,
      level,
      size: `${n}x${n}`,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same numbers, however the quilt is turned, are the same puzzle wherever they sit.
      [STUDIO_CANONICAL_KEY]: `${PQ_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
