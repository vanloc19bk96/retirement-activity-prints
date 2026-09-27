import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_PAPER, STUDIO_RULE_MEDIUM, STUDIO_STROKE_HAIRLINE, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import type { Box } from '../studio-layout'
import { SM_ALIKE_WORD, SM_OPPOSITE_WORD, SM_TEMPLATE_KEY, smSignText, type SmDay, type SmLevel } from './content'
import {
  SM_FRAME,
  SM_LEGEND_ICON_GAP,
  SM_LEGEND_ITEM_GAP,
  SM_LEGEND_PAIR_WIDTH,
  SM_LEGEND_ROW_GAP,
  SM_LEGEND_SQUARE,
  SM_SYMBOL_OF_CELL,
  smBadgeFor,
  smLegendItemWidths,
  smLegendRowHeight,
  smLegendSpec,
  smLegendWidth,
  smLineHeight,
  smSignSpec,
  smSignWidth,
  smTextWidth,
  type SmPlan,
} from './layout'
import type { SmBuilt } from './puzzle'
import { SM_BLANK, SM_MOON, SM_NONE, SM_OPPOSITE, SM_SAME, SM_SUN } from './solver'

/**
 * A planned grid → one Fabric group: the day's sign, the pale gray behind
 * every printed square, the soft lines between squares, the black frame,
 * the signs (= and ×) each on a white disc over its line, the printed suns
 * and moons, the rest hidden for the answer page, and the legend.
 *
 * Black on white with one pale gray, so it prints the same on any interior.
 * A sun is a white disc ringed in black with eight black rays; a moon a
 * solid black crescent — told apart at a glance, even at arm's length, and
 * easy to copy with a pencil (a ring, a crescent). On the answer page a sun
 * or a moon stands in every square.
 */

/** Marks the objects a Sun & Moon page draws, for checks and the editor. */
export const SM_PART_KEY = 'smPart'

/** Behind every printed sun or moon: pale enough for any interior, dark enough to tell from the reader's squares. */
export const SM_GIVEN_TINT = '#E4E4E4'

const r2 = (n: number) => Math.round(n * 100) / 100

type Pt = readonly [number, number]
type Command = ['M' | 'L', number, number] | ['Z']

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [SM_PART_KEY]: name, ...extra } }
}

/** One path from move / line commands in page px, placed by the centre of its own geometry. */
function pathOf(options: { commands: readonly Command[]; fill: string; stroke: string; strokeWidth: number; tag: StudioTag; role: StudioRole; cap?: 'round' | 'butt' }): StudioFabricObject {
  const { commands, fill, stroke, strokeWidth, tag, role, cap = 'round' } = options
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const path = commands.map((c) => {
    if (c[0] === 'Z') return ['Z']
    const x = r2(c[1])
    const y = r2(c[2])
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    return [c[0], x, y]
  })
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
    stroke,
    strokeWidth,
    strokeUniform: true,
    strokeLineCap: cap,
    strokeLineJoin: 'round',
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    // Answers stay hidden on the puzzle page; the answer key reveals them.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

/** Closed shapes drawn in a unit square, placed in `box`, as path commands. */
function shapeCommands(shapes: readonly (readonly Pt[])[], box: Box): Command[] {
  const out: Command[] = []
  for (const shape of shapes) {
    shape.forEach(([u, v], i) => out.push([i === 0 ? 'M' : 'L', box.left + u * box.width, box.top + v * box.height]))
    out.push(['Z'])
  }
  return out
}

/* ------------------------------------------------------------------ *
 * The sun and the moon, in a unit square
 * ------------------------------------------------------------------ */

const circle = (cx: number, cy: number, r: number, steps = 36): Pt[] =>
  Array.from({ length: steps }, (_, k) => {
    const a = (k / steps) * Math.PI * 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  })

/** The sun's disc. */
const SUN_DISC: readonly Pt[] = circle(0.5, 0.5, 0.27)
/** Eight short rays, one straight up: [inner end, outer end], kept inside the box with their round caps. */
const SUN_RAYS: readonly (readonly [Pt, Pt])[] = Array.from({ length: 8 }, (_, k) => {
  const a = -Math.PI / 2 + (k * Math.PI) / 4
  const at = (r: number): Pt => [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]
  return [at(0.37), at(0.46)] as const
})

/** Points round a circle from one angle to another, the way that passes `via`. */
function arc(cx: number, cy: number, r: number, from: number, to: number, via: number, steps: number): Pt[] {
  const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  let sweep = norm(to - from)
  // Counter-clockwise does not pass `via`: go the other way round.
  if (norm(via - from) > sweep) sweep -= 2 * Math.PI
  return Array.from({ length: steps + 1 }, (_, k) => {
    const a = from + (sweep * k) / steps
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const
  })
}

/**
 * The moon: a disc with a smaller one taken out of its upper right, leaving
 * a fat crescent that opens towards the top right corner.
 */
const MOON: readonly Pt[] = (() => {
  const R = 0.42
  const r = 0.36
  const d = 0.22
  const turn = (-40 * Math.PI) / 180
  const ux = Math.cos(turn)
  const uy = Math.sin(turn)
  const [ax, ay] = [0.5, 0.5]
  const [bx, by] = [ax + d * ux, ay + d * uy]
  // Where the two circles cross.
  const along = (R * R - r * r + d * d) / (2 * d)
  const h = Math.sqrt(R * R - along * along)
  const p1: Pt = [ax + along * ux - h * uy, ay + along * uy + h * ux]
  const p2: Pt = [ax + along * ux + h * uy, ay + along * uy - h * ux]
  const away = Math.atan2(-uy, -ux)
  const outer = arc(ax, ay, R, Math.atan2(p1[1] - ay, p1[0] - ax), Math.atan2(p2[1] - ay, p2[0] - ax), away, 40)
  const inner = arc(bx, by, r, Math.atan2(p2[1] - by, p2[0] - bx), Math.atan2(p1[1] - by, p1[0] - bx), away, 32)
  return [...outer, ...inner.slice(1, -1)]
})()

const iconBox = (cx: number, cy: number, side: number): Box => ({ left: cx - side / 2, top: cy - side / 2, width: side, height: side })

/** A sun or a moon in `box`: a sun is its disc and its rays, a moon one crescent. */
function symbolParts(options: { value: number; box: Box; tag: StudioTag; role: StudioRole; name: string; extra?: Record<string, unknown> }): StudioFabricObject[] {
  const { value, box, tag, role, name, extra = {} } = options
  // Heavy enough that a ringed sun weighs about what a solid moon does on the page.
  const weight = Math.max(STUDIO_STROKE_NORMAL, Math.round(box.width * 0.07 * 2) / 2)
  if (value === SM_SUN) {
    const place = ([u, v]: Pt): [number, number] => [box.left + u * box.width, box.top + v * box.height]
    const rays: Command[] = SUN_RAYS.flatMap(([from, to]) => [['M', ...place(from)], ['L', ...place(to)]] as Command[])
    const rayWeight = Math.max(STUDIO_STROKE_NORMAL, Math.round(box.width * 0.09 * 2) / 2)
    return [
      part(pathOf({ commands: shapeCommands([SUN_DISC], box), fill: STUDIO_PAPER, stroke: STUDIO_INK, strokeWidth: weight, tag, role }), `${name}-sun`, extra),
      part(pathOf({ commands: rays, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: rayWeight, tag, role }), `${name}-rays`, extra),
    ]
  }
  return [part(pathOf({ commands: shapeCommands([MOON], box), fill: STUDIO_INK, stroke: STUDIO_INK, strokeWidth: 1, tag, role }), `${name}-moon`, extra)]
}

/**
 * A sign on a line: a white disc that breaks the line, and on it = (two
 * short bars) or × (two crossed bars), upright wherever it sits.
 */
function signParts(options: { sign: number; cx: number; cy: number; radius: number; tag: StudioTag; name: string; extra?: Record<string, unknown> }): StudioFabricObject[] {
  const { sign, cx, cy, radius, tag, name, extra = {} } = options
  const weight = Math.max(2, Math.round(radius * 0.24 * 2) / 2)
  const disc = part(
    pathOf({ commands: shapeCommands([circle(0.5, 0.5, 0.5)], iconBox(cx, cy, radius * 2)), fill: STUDIO_PAPER, stroke: 'transparent', strokeWidth: 0, tag, role: 'prompt' }),
    `${name}-disc`,
    extra,
  )
  // As large as the disc allows: the disc only has to part the line round it.
  const arm = radius * 0.7
  const cross = radius * 0.55
  const commands: Command[] =
    sign === SM_SAME
      ? [
          ['M', cx - arm, cy - radius * 0.32],
          ['L', cx + arm, cy - radius * 0.32],
          ['M', cx - arm, cy + radius * 0.32],
          ['L', cx + arm, cy + radius * 0.32],
        ]
      : [
          ['M', cx - cross, cy - cross],
          ['L', cx + cross, cy + cross],
          ['M', cx + cross, cy - cross],
          ['L', cx - cross, cy + cross],
        ]
  const mark = part(pathOf({ commands, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: weight, tag, role: 'prompt', cap: 'butt' }), name, {
    ...extra,
    sign: sign === SM_SAME ? 'same' : 'opposite',
  })
  return [disc, mark]
}

/* ------------------------------------------------------------------ *
 * Where things go
 * ------------------------------------------------------------------ */

/** The sign's box for this day, centred over the grid and kept on the panel. */
export function smSignBox(plan: SmPlan, day: SmDay, font: string): Box {
  const width = Math.min(plan.signBand.width, smSignWidth(smSignText(day, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the sign's words may set, centred on the sign and kept inside its band. */
export function smSignTextRoom(plan: SmPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the grid and kept on the panel. */
export function smLegendBox(plan: SmPlan, font: string): Box {
  const width = smLegendWidth(font, plan.legendRows)
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top: plan.legendTop, width, height: plan.legendHeight }
}

/** Every sign on the grid: [row, col, 'across' (to the right) or 'down' (below), the sign]. */
export function smSignsOf(built: SmBuilt): [number, number, 'across' | 'down', number][] {
  const { puzzle } = built
  const n = puzzle.size
  const out: [number, number, 'across' | 'down', number][] = []
  for (let i = 0; i < n * n; i++) {
    const row = Math.floor(i / n)
    const col = i % n
    if (puzzle.across[i] !== SM_NONE) out.push([row, col, 'across', puzzle.across[i]!])
    if (puzzle.down[i] !== SM_NONE) out.push([row, col, 'down', puzzle.down[i]!])
  }
  return out
}

/** Where a sign's disc sits: on the line between its two squares, half way along. */
export function smSignCentre(plan: SmPlan, row: number, col: number, dir: 'across' | 'down'): [number, number] {
  const { grid, cell } = plan
  return dir === 'across' ? [grid.left + (col + 1) * cell, grid.top + (row + 0.5) * cell] : [grid.left + (col + 0.5) * cell, grid.top + (row + 1) * cell]
}

/* ------------------------------------------------------------------ *
 * The legend
 * ------------------------------------------------------------------ */

/** Two little squares side by side, joined by a sign, with a sun or a moon in each. */
function legendPair(options: { left: number; midY: number; sign: number; values: [number, number]; tag: StudioTag; entry: string }): StudioFabricObject[] {
  const { left, midY, sign, values, tag, entry } = options
  const square = SM_LEGEND_SQUARE
  const top = midY - square / 2
  const out: StudioFabricObject[] = [
    part(buildRect({ left, top, width: SM_LEGEND_PAIR_WIDTH, height: square, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1.5 }, tag), 'legend-frame', { entry }),
    part(buildRect({ left: left + square - 0.75, top, width: 1.5, height: square, fill: STUDIO_RULE_MEDIUM, stroke: 'transparent', strokeWidth: 0 }, tag), 'legend-rule', { entry }),
  ]
  values.forEach((value, k) => {
    const box = iconBox(left + (k + 0.5) * square, midY, Math.round(square * SM_SYMBOL_OF_CELL))
    out.push(...symbolParts({ value, box, tag, role: 'prompt', name: 'legend', extra: { entry } }))
  })
  out.push(...signParts({ sign, cx: left + square, cy: midY, radius: smBadgeFor(square), tag, name: 'legend-sign', extra: { entry } }))
  return out
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

export function buildSmPuzzle(options: {
  built: SmBuilt
  plan: SmPlan
  day: SmDay
  level: SmLevel
  /** `day|level|grid` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, day, level, label, tag, font } = options
  const { puzzle, answer } = built
  const { grid, cell } = plan
  const n = puzzle.size
  const parts: StudioFabricObject[] = []

  // The sign: a double-ruled board with the day's name.
  const sign = smSignBox(plan, day, font)
  parts.push(part(buildRect({ ...sign, rx: 10, ry: 10, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 2 }, tag), 'sign'))
  parts.push(
    part(
      buildRect({ left: sign.left + 5, top: sign.top + 5, width: sign.width - 10, height: sign.height - 10, rx: 6, ry: 6, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1 }, tag),
      'sign',
    ),
  )
  const signText = smSignText(day, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - smLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the board's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(smTextWidth(signText, plan.signSize, smSignSpec(font)), smSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // Pale gray behind every printed square, under the lines.
  for (let i = 0; i < n * n; i++) {
    if (puzzle.givens[i] === SM_BLANK) continue
    const row = Math.floor(i / n)
    const col = i % n
    parts.push(
      part(buildRect({ left: grid.left + col * cell, top: grid.top + row * cell, width: cell, height: cell, fill: SM_GIVEN_TINT, stroke: 'transparent', strokeWidth: 0 }, tag), 'given-tint', {
        row,
        col,
      }),
    )
  }

  // Soft lines between every square, then the black frame flush inside the grid's edge.
  for (const bar of drawGridLines(grid, cell, n, n, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE })) parts.push(part(bar, 'rule'))
  const frame = (box: Box) => part(buildRect({ ...box, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag), 'frame')
  parts.push(frame({ left: grid.left, top: grid.top, width: grid.width, height: SM_FRAME }))
  parts.push(frame({ left: grid.left, top: grid.top + grid.height - SM_FRAME, width: grid.width, height: SM_FRAME }))
  parts.push(frame({ left: grid.left, top: grid.top, width: SM_FRAME, height: grid.height }))
  parts.push(frame({ left: grid.left + grid.width - SM_FRAME, top: grid.top, width: SM_FRAME, height: grid.height }))

  // The signs, each on a white disc over its line.
  for (const [row, col, dir, value] of smSignsOf(built)) {
    const [cx, cy] = smSignCentre(plan, row, col, dir)
    parts.push(...signParts({ sign: value, cx, cy, radius: plan.badge, tag, name: 'sign-mark', extra: { row, col, dir } }))
  }

  // The printed suns and moons, and the rest hidden until the answer page.
  for (let i = 0; i < n * n; i++) {
    const row = Math.floor(i / n)
    const col = i % n
    const given = puzzle.givens[i] !== SM_BLANK
    const box = iconBox(grid.left + (col + 0.5) * cell, grid.top + (row + 0.5) * cell, plan.symbol)
    parts.push(...symbolParts({ value: answer[i]!, box, tag, role: given ? 'prompt' : 'answer', name: given ? 'given' : 'answer', extra: { row, col } }))
  }

  // The legend: = between two suns, × between a sun and a moon.
  const legend = smLegendBox(plan, font)
  const [alikeItem] = smLegendItemWidths(font)
  const rowHeight = smLegendRowHeight()
  const rowMid = (row: number) => legend.top + row * (rowHeight + SM_LEGEND_ROW_GAP) + rowHeight / 2
  const words = (text: string, x: number, midY: number, entry: string) =>
    part(
      buildText(
        { left: r2(x), top: r2(midY - smLineHeight(plan.legendSize) / 2), text, fontFamily: font, fontSize: plan.legendSize, lineHeight: 1, width: smTextWidth(text, plan.legendSize, smLegendSpec(font)) },
        tag,
        'prompt',
      ),
      'legend-text',
      { entry },
    )
  let x = legend.left
  let midY = rowMid(0)
  parts.push(...legendPair({ left: x, midY, sign: SM_SAME, values: [SM_SUN, SM_SUN], tag, entry: 'alike' }))
  parts.push(words(SM_ALIKE_WORD, x + SM_LEGEND_PAIR_WIDTH + SM_LEGEND_ICON_GAP, midY, 'alike'))
  if (plan.legendRows === 1) x += alikeItem + SM_LEGEND_ITEM_GAP
  else midY = rowMid(1)
  parts.push(...legendPair({ left: x, midY, sign: SM_OPPOSITE, values: [SM_SUN, SM_MOON], tag, entry: 'opposite' }))
  parts.push(words(SM_OPPOSITE_WORD, x + SM_LEGEND_PAIR_WIDTH + SM_LEGEND_ICON_GAP, midY, 'opposite'))

  const top = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const left = Math.min(sign.left, legend.left, grid.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, grid.left + grid.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: SM_TEMPLATE_KEY,
      [SM_PART_KEY]: 'puzzle',
      day: day.name,
      level,
      size: `${n}x${n}`,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same grid turned, mirrored or with suns and moons swapped is the same puzzle wherever it sits.
      [STUDIO_CANONICAL_KEY]: `${SM_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
