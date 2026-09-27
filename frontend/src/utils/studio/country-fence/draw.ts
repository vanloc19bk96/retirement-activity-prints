import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import type { Box } from '../studio-layout'
import {
  FENCE_LEGEND_SAMPLE,
  FENCE_LEGEND_OPEN_SIDE,
  FENCE_LOOP_WORD,
  FENCE_SAMPLE_WORD,
  FENCE_TEMPLATE_KEY,
  fenceSignText,
  type FenceLevel,
  type FencePasture,
} from './content'
import {
  FENCE_LEGEND_ICON,
  FENCE_LEGEND_ICON_GAP,
  FENCE_LEGEND_ITEM_GAP,
  FENCE_LEGEND_ROW_GAP,
  fenceDigitSpec,
  fenceLegendItemWidths,
  fenceLegendRowHeight,
  fenceLegendSpec,
  fenceLegendWidth,
  fenceLineHeight,
  fenceSignSpec,
  fenceSignWidth,
  fenceTextWidth,
  type FencePlan,
} from './layout'
import type { FenceBuilt } from './puzzle'
import { FENCE_BLANK, fenceAnswerKey, fenceInside, fenceLoopOrder } from './solver'

/**
 * A planned field → one Fabric group: the pasture's name board, the posts,
 * the numbers, the finished fence hidden for the answer page, and the
 * legend.
 *
 * The puzzle page is black on white — bold posts and bold numbers and
 * nothing else, so a pencilled fence reads clearly. On the answer page the
 * loop becomes the pasture: the land inside washed a soft gray with a tuft
 * of grass in every square free of a number, the fence a heavy black rail
 * from post to post, and a square fence post on every post it passes. Black
 * and one gray only, so it prints the same on any interior.
 */

/** Marks the objects a Country Fence page draws, for checks and the editor. */
export const FENCE_PART_KEY = 'fencePart'

/** The pasture's wash: a soft gray, dark enough to print, light enough for black numbers over it. */
export const FENCE_MEADOW_FILL = '#DDDDDD'

/** A tuft of grass, as a share of a square: how wide and how tall. */
const TUFT_W = 0.34
const TUFT_H = 0.28

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [FENCE_PART_KEY]: name, ...extra } }
}

/**
 * One path of polylines in canvas px: filled closed shapes, or open strokes
 * with no fill. Answer paths start hidden; the answer key reveals them,
 * keeping their fill and inking their stroke.
 */
function pathOf(options: {
  lines: readonly (readonly Pt[])[]
  close: boolean
  fill: string
  strokeWidth: number
  tag: StudioTag
  role: StudioRole
  join?: 'round' | 'miter'
}): StudioFabricObject {
  const { lines, close, fill, strokeWidth, tag, role, join = 'round' } = options
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
    strokeLineCap: 'round',
    strokeLineJoin: join,
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    // The fence stays hidden on the puzzle page; the answer key reveals it.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

const circle = (cx: number, cy: number, r: number, steps = 16): Pt[] =>
  Array.from({ length: steps }, (_, k) => {
    const a = (k / steps) * Math.PI * 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  })

const square = (cx: number, cy: number, half: number): Pt[] => [
  [cx - half, cy - half],
  [cx + half, cy - half],
  [cx + half, cy + half],
  [cx - half, cy + half],
]

/* ------------------------------------------------------------------ *
 * Geometry on the page
 * ------------------------------------------------------------------ */

/** Where post `i` (of the field's (n+1) × (n+1)) sits on the page. */
export function fencePostPoint(plan: FencePlan, i: number): Pt {
  const N = plan.size + 1
  return [plan.grid.left + (i % N) * plan.cell, plan.grid.top + Math.floor(i / N) * plan.cell]
}

/** The fence as a closed polygon of post points, in order round the loop. */
export function fenceRing(plan: FencePlan, rails: readonly number[]): Pt[] {
  return (fenceLoopOrder(plan.size, rails) ?? []).map((i) => fencePostPoint(plan, i))
}

/**
 * Blades of a tuft: where each leaves the root and where its tip leans (as
 * shares of half the tuft's width), and how tall it stands (as a share of
 * the tuft's height).
 */
const BLADES: readonly (readonly [number, number, number])[] = [
  [-0.2, -1, 0.68],
  [0, -0.18, 1],
  [0.2, 1, 0.78],
]

/**
 * A tuft of grass: three blades rising from a root low in the square,
 * standing straight at the foot and bending outward toward the tip.
 */
export function fenceTuft(plan: FencePlan, row: number, col: number): Pt[][] {
  const { grid, cell } = plan
  const cx = grid.left + (col + 0.5) * cell
  const root = grid.top + (row + 0.5) * cell + (TUFT_H / 2) * cell
  const w = (TUFT_W / 2) * cell
  const h = TUFT_H * cell
  return BLADES.map(([foot, tip, tall]) =>
    Array.from({ length: 5 }, (_, k) => {
      const t = k / 4
      return [cx + w * (foot + (tip - foot) * t * t), root - h * tall * t] as const
    }),
  )
}

/* ------------------------------------------------------------------ *
 * Placement
 * ------------------------------------------------------------------ */

/** The name board's box for this pasture, centred over the field and kept on the panel. */
export function fenceSignBox(plan: FencePlan, pasture: FencePasture, font: string): Box {
  const width = Math.min(plan.signBand.width, fenceSignWidth(fenceSignText(pasture, plan.signLines), plan.signSize, font))
  const centre = plan.field.left + plan.field.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the board's words may set, centred on the board and kept inside its band. */
export function fenceSignTextRoom(plan: FencePlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the field and kept on the panel. */
export function fenceLegendBox(plan: FencePlan, font: string): Box {
  const width = fenceLegendWidth(font, plan.legendRows)
  const centre = plan.field.left + plan.field.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top: plan.legendTop, width, height: plan.legendHeight }
}

function digitText(options: {
  value: number
  cx: number
  cy: number
  size: number
  tag: StudioTag
  name: string
  extra: Record<string, unknown>
}): StudioFabricObject {
  const { value, cx, cy, size, tag, name, extra } = options
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
        fill: STUDIO_INK,
        width: Math.max(Math.ceil(size * 1.1), fenceTextWidth(text, size, fenceDigitSpec())),
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        // Fabric's default multiplier centres a lone glyph off its axis.
        lineHeight: 1,
        editable: false,
      },
      tag,
      'prompt',
    ),
    name,
    { n: value, ...extra },
  )
}

/* ------------------------------------------------------------------ *
 * The legend's icons
 * ------------------------------------------------------------------ */

/** The sample square: posts on its corners, its fenced sides drawn, its number in the middle. */
function legendSample(box: Box, legendSize: number, tag: StudioTag): StudioFabricObject[] {
  const inset = 4
  const x0 = box.left + inset
  const y0 = box.top + inset
  const x1 = box.left + box.width - inset
  const y1 = box.top + box.height - inset
  const corners: Pt[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
  // Side j runs from corner j to corner j + 1 (top, right, bottom, left): the fence runs round from the corner after the open side.
  const run = [1, 2, 3, 4].map((k) => corners[(FENCE_LEGEND_OPEN_SIDE + k) % 4]!)
  return [
    part(pathOf({ lines: [run], close: false, fill: 'transparent', strokeWidth: 3, tag, role: 'prompt' }), 'legend-fence', { sample: FENCE_LEGEND_SAMPLE }),
    part(pathOf({ lines: corners.map(([x, y]) => circle(x, y, 2.5, 12)), close: true, fill: STUDIO_INK, strokeWidth: 0, tag, role: 'prompt' }), 'legend-posts'),
    digitText({ value: FENCE_LEGEND_SAMPLE, cx: box.left + box.width / 2, cy: box.top + box.height / 2, size: legendSize, tag, name: 'legend-number', extra: {} }),
  ]
}

/** A little closed fence: a loop round two squares, a square post at every post. */
function legendLoop(box: Box, tag: StudioTag): StudioFabricObject[] {
  const inset = 4
  const x0 = box.left + inset
  const x2 = box.left + box.width - inset
  const x1 = (x0 + x2) / 2
  const midY = box.top + box.height / 2
  const half = (x2 - x0) / 4
  const y0 = midY - half
  const y1 = midY + half
  const ring: Pt[] = [
    [x0, y0],
    [x1, y0],
    [x2, y0],
    [x2, y1],
    [x1, y1],
    [x0, y1],
  ]
  return [
    part(pathOf({ lines: [ring], close: true, fill: 'transparent', strokeWidth: 3, tag, role: 'prompt', join: 'miter' }), 'legend-fence', { loop: true }),
    part(pathOf({ lines: ring.map(([x, y]) => square(x, y, 3)), close: true, fill: STUDIO_INK, strokeWidth: 0, tag, role: 'prompt' }), 'legend-posts'),
  ]
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

export function buildFencePuzzle(options: {
  built: FenceBuilt
  plan: FencePlan
  pasture: FencePasture
  level: FenceLevel
  /** `pasture|level|field` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, pasture, level, label, tag, font } = options
  const { puzzle, rails } = built
  const { grid, cell } = plan
  const n = puzzle.size
  const N = n + 1
  const parts: StudioFabricObject[] = []

  // The name board: a double-ruled board with the pasture's name.
  const sign = fenceSignBox(plan, pasture, font)
  parts.push(part(buildRect({ ...sign, rx: 10, ry: 10, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 2 }, tag), 'sign'))
  parts.push(
    part(
      buildRect({ left: sign.left + 5, top: sign.top + 5, width: sign.width - 10, height: sign.height - 10, rx: 6, ry: 6, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1 }, tag),
      'sign',
    ),
  )
  const signText = fenceSignText(pasture, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - fenceLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the board's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(fenceTextWidth(signText, plan.signSize, fenceSignSpec(font)), fenceSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The pasture, hidden until the answer page: the land inside washed gray, a tuft of grass in every square free of a number.
  const ring = fenceRing(plan, rails)
  parts.push(part(pathOf({ lines: [ring], close: true, fill: FENCE_MEADOW_FILL, strokeWidth: 0, tag, role: 'answer', join: 'miter' }), 'pasture'))
  const inside = fenceInside(n, rails)
  for (let s = 0; s < n * n; s++) {
    if (!inside[s] || puzzle.clues[s] !== FENCE_BLANK) continue
    const row = Math.floor(s / n)
    const col = s % n
    parts.push(part(pathOf({ lines: fenceTuft(plan, row, col), close: false, fill: 'transparent', strokeWidth: STUDIO_STROKE_HAIRLINE, tag, role: 'answer' }), 'tuft', { row, col }))
  }

  // The posts, a row at a time.
  for (let r = 0; r < N; r++) {
    const dots = Array.from({ length: N }, (_, c) => circle(grid.left + c * cell, grid.top + r * cell, plan.dot))
    parts.push(part(pathOf({ lines: dots, close: true, fill: STUDIO_INK, strokeWidth: 0, tag, role: 'prompt' }), 'dots', { row: r, dots: N }))
  }

  // The fence, hidden until the answer page: a heavy rail post to post, a square post wherever it passes.
  parts.push(part(pathOf({ lines: [ring], close: true, fill: 'transparent', strokeWidth: plan.rail, tag, role: 'answer', join: 'miter' }), 'fence', { rails: fenceAnswerKey(rails) }))
  parts.push(
    part(pathOf({ lines: ring.map(([x, y]) => square(x, y, plan.post / 2)), close: true, fill: STUDIO_INK, strokeWidth: 0, tag, role: 'answer' }), 'posts', { posts: ring.length }),
  )

  // The numbers, bold in the middle of their squares, over the pasture.
  for (let s = 0; s < n * n; s++) {
    const value = puzzle.clues[s]!
    if (value === FENCE_BLANK) continue
    const row = Math.floor(s / n)
    const col = s % n
    parts.push(digitText({ value, cx: grid.left + (col + 0.5) * cell, cy: grid.top + (row + 0.5) * cell, size: plan.digitSize, tag, name: 'number', extra: { row, col } }))
  }

  // The legend: a sample square and what its number counts, then a little closed fence.
  const legend = fenceLegendBox(plan, font)
  const [sampleItem] = fenceLegendItemWidths(font)
  const rowHeight = fenceLegendRowHeight()
  const rowMid = (row: number) => legend.top + row * (rowHeight + FENCE_LEGEND_ROW_GAP) + rowHeight / 2
  const words = (text: string, x: number, midY: number, extra: Record<string, unknown>) =>
    part(
      buildText(
        { left: r2(x), top: r2(midY - fenceLineHeight(plan.legendSize) / 2), text, fontFamily: font, fontSize: plan.legendSize, lineHeight: 1, width: fenceTextWidth(text, plan.legendSize, fenceLegendSpec(font)) },
        tag,
        'prompt',
      ),
      'legend-text',
      extra,
    )
  const icon = FENCE_LEGEND_ICON
  let x = legend.left
  let midY = rowMid(0)
  parts.push(...legendSample({ left: x, top: midY - icon / 2, width: icon, height: icon }, plan.legendSize, tag))
  parts.push(words(FENCE_SAMPLE_WORD, x + icon + FENCE_LEGEND_ICON_GAP, midY, { entry: 'sample' }))
  if (plan.legendRows === 1) x += sampleItem + FENCE_LEGEND_ITEM_GAP
  else midY = rowMid(1)
  parts.push(...legendLoop({ left: x, top: midY - icon / 2, width: icon, height: icon }, tag))
  parts.push(words(FENCE_LOOP_WORD, x + icon + FENCE_LEGEND_ICON_GAP, midY, { entry: 'loop' }))

  const top = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const left = Math.min(sign.left, legend.left, plan.field.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, plan.field.left + plan.field.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: FENCE_TEMPLATE_KEY,
      [FENCE_PART_KEY]: 'puzzle',
      pasture: pasture.name,
      level,
      size: `${n}x${n}`,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same numbers, however the field is turned, are the same puzzle wherever they sit.
      [STUDIO_CANONICAL_KEY]: `${FENCE_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}

