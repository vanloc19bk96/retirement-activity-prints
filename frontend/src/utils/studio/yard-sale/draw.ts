import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_PAPER, STUDIO_RULE_MEDIUM, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildRect, buildText, nextObjectId, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import type { Box } from '../studio-layout'
import { YS_LEGEND_PAIR, YS_LEGEND_TWINS, YS_REPEAT_WORD, YS_TEMPLATE_KEY, YS_TOUCH_WORD, ysSignText, type YsLevel, type YsSale } from './content'
import {
  YS_FRAME,
  YS_LEGEND_ICON_GAP,
  YS_LEGEND_ITEM_GAP,
  YS_LEGEND_PAIR_WIDTH,
  YS_LEGEND_ROW_GAP,
  YS_LEGEND_SQUARE,
  YS_LEGEND_TWINS_WIDTH,
  ysDigitSpec,
  ysLegendItemWidths,
  ysLegendRowHeight,
  ysLegendSpec,
  ysLegendWidth,
  ysLineHeight,
  ysSignSpec,
  ysSignWidth,
  ysTextWidth,
  type YsPlan,
} from './layout'
import type { YsBuilt } from './puzzle'
import { YS_SHADED } from './solver'

/**
 * A planned grid → one Fabric group: the sale's sign, the soft lines
 * between squares, the black frame, a bold number in every square, the
 * shading of the answer hidden for the answer page, and the legend.
 *
 * Black on white with one mid gray, so it prints the same on any interior.
 * The reader shades with a pencil; the answer page shades the same squares
 * gray, with every number still readable through it, so a reader can check
 * their grid square by square.
 */

/** Marks the objects a Yard Sale page draws, for checks and the editor. */
export const YS_PART_KEY = 'ysPart'

/** A shaded square: dark enough to see at a glance on any interior, light enough to read its number through. */
export const YS_SHADE_FILL = '#B4B4B4'

/** The cross over the legend's two shaded squares side by side. */
const CROSS_STROKE = 3

const r2 = (n: number) => Math.round(n * 100) / 100

type Command = ['M' | 'L', number, number] | ['Z']

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [YS_PART_KEY]: name, ...extra } }
}

/** One path from move / line commands in page px, placed by the centre of its own geometry. */
function pathOf(options: { commands: readonly Command[]; fill: string; stroke: string; strokeWidth: number; tag: StudioTag; role: StudioRole }): StudioFabricObject {
  const { commands, fill, stroke, strokeWidth, tag, role } = options
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
    strokeLineCap: 'round',
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

/**
 * A shaded square, as a filled path: the answer key keeps a path's own fill
 * (a filled rectangle would be inked solid black and hide its number).
 */
function shadeOf(box: Box, tag: StudioTag, role: StudioRole, name: string, extra: Record<string, unknown>): StudioFabricObject {
  const { left, top, width, height } = box
  const commands: Command[] = [['M', left, top], ['L', left + width, top], ['L', left + width, top + height], ['L', left, top + height], ['Z']]
  return part(pathOf({ commands, fill: YS_SHADE_FILL, stroke: 'transparent', strokeWidth: 0, tag, role }), name, extra)
}

/** A number centred on a point, bold, in the digit face. */
function numberText(options: { value: number; cx: number; cy: number; size: number; tag: StudioTag; name: string; extra: Record<string, unknown> }): StudioFabricObject {
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
        width: Math.max(Math.ceil(size * 1.1), ysTextWidth(text, size, ysDigitSpec())),
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        // Fabric's default multiplier centres a lone line of digits off its axis.
        lineHeight: 1,
      },
      tag,
      'prompt',
    ),
    name,
    { n: value, ...extra },
  )
}

/* ------------------------------------------------------------------ *
 * Where things go
 * ------------------------------------------------------------------ */

/** The sign's box for this sale, centred over the grid and kept on the panel. */
export function ysSignBox(plan: YsPlan, sale: YsSale, font: string): Box {
  const width = Math.min(plan.signBand.width, ysSignWidth(ysSignText(sale, plan.signLines), plan.signSize, font))
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.signBand.left, Math.min(centre - width / 2, plan.signBand.left + plan.signBand.width - width))
  return { left: r2(left), top: plan.signBand.top, width, height: plan.signBand.height }
}

/** The widest the sign's words may set, centred on the sign and kept inside its band. */
export function ysSignTextRoom(plan: YsPlan, sign: Box): number {
  const centre = sign.left + sign.width / 2
  const band = plan.signBand
  return Math.floor(2 * Math.min(centre - band.left, band.left + band.width - centre))
}

/** Where the legend runs: centred under the grid and kept on the panel. */
export function ysLegendBox(plan: YsPlan, font: string): Box {
  const width = ysLegendWidth(font, plan.legendRows)
  const centre = plan.grid.left + plan.grid.width / 2
  const left = Math.max(plan.block.left, Math.min(centre - width / 2, plan.block.left + plan.block.width - width))
  return { left: r2(left), top: plan.legendTop, width, height: plan.legendHeight }
}

/* ------------------------------------------------------------------ *
 * The legend
 * ------------------------------------------------------------------ */

/**
 * A row of little squares with a number in each (or none), framed, with
 * fine lines between them; the squares listed in `shaded` are shaded.
 */
function legendSquares(options: { left: number; midY: number; values: readonly (number | null)[]; shaded: readonly number[]; size: number; tag: StudioTag; entry: string }): StudioFabricObject[] {
  const { left, midY, values, shaded, size, tag, entry } = options
  const square = YS_LEGEND_SQUARE
  const top = midY - square / 2
  const out: StudioFabricObject[] = []
  for (const k of shaded) out.push(shadeOf({ left: left + k * square, top, width: square, height: square }, tag, 'prompt', 'legend-shade', { entry, k }))
  out.push(part(buildRect({ left, top, width: square * values.length, height: square, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1.5 }, tag), 'legend-frame', { entry }))
  for (let k = 1; k < values.length; k++) {
    // Soft gray as in the grid, but black between two shaded squares, where gray would not show.
    const fill = shaded.includes(k - 1) && shaded.includes(k) ? STUDIO_INK : STUDIO_RULE_MEDIUM
    out.push(part(buildRect({ left: left + k * square - 0.75, top, width: 1.5, height: square, fill, stroke: 'transparent', strokeWidth: 0 }, tag), 'legend-rule', { entry }))
  }
  values.forEach((value, k) => {
    if (value !== null) out.push(numberText({ value, cx: left + (k + 0.5) * square, cy: midY, size, tag, name: 'legend-number', extra: { entry, k } }))
  })
  return out
}

/**
 * A bold cross on the line between the legend's two shaded squares — this
 * may not be — on a white disc that parts the line, so the cross reads on
 * its own and the line above and below still shows two squares.
 */
function legendCross(cx: number, cy: number, tag: StudioTag): StudioFabricObject[] {
  const radius = Math.round(YS_LEGEND_SQUARE * 0.3)
  const arm = Math.round(radius * 0.6)
  const disc: Command[] = Array.from({ length: 36 }, (_, k) => {
    const a = (k / 36) * Math.PI * 2
    return [k === 0 ? 'M' : 'L', cx + radius * Math.cos(a), cy + radius * Math.sin(a)] as Command
  })
  disc.push(['Z'])
  return [
    part(pathOf({ commands: disc, fill: STUDIO_PAPER, stroke: 'transparent', strokeWidth: 0, tag, role: 'prompt' }), 'legend-cross-disc', { entry: 'touch' }),
    part(
      pathOf({
        commands: [
          ['M', cx - arm, cy - arm],
          ['L', cx + arm, cy + arm],
          ['M', cx + arm, cy - arm],
          ['L', cx - arm, cy + arm],
        ],
        fill: 'transparent',
        stroke: STUDIO_INK,
        strokeWidth: CROSS_STROKE,
        tag,
        role: 'prompt',
      }),
      'legend-cross',
      { entry: 'touch' },
    ),
  ]
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

export function buildYsPuzzle(options: {
  built: YsBuilt
  plan: YsPlan
  sale: YsSale
  level: YsLevel
  /** `sale|level|grid` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, plan, sale, level, label, tag, font } = options
  const { puzzle, shade } = built
  const { grid, cell } = plan
  const n = puzzle.size
  const parts: StudioFabricObject[] = []

  // The sign: a double-ruled board with the sale's name.
  const sign = ysSignBox(plan, sale, font)
  parts.push(part(buildRect({ ...sign, rx: 10, ry: 10, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 2 }, tag), 'sign'))
  parts.push(
    part(
      buildRect({ left: sign.left + 5, top: sign.top + 5, width: sign.width - 10, height: sign.height - 10, rx: 6, ry: 6, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: 1 }, tag),
      'sign',
    ),
  )
  const signText = ysSignText(sale, plan.signLines)
  parts.push(
    part(
      buildText(
        {
          left: r2(sign.left + sign.width / 2),
          top: r2(sign.top + (sign.height - ysLineHeight(plan.signSize, plan.signLines)) / 2),
          text: signText,
          fontFamily: font,
          fontSize: plan.signSize,
          fontWeight: 700,
          lineHeight: 1,
          // As wide as the band allows round the board's centre: the name is
          // centred either way, and a font that sets a little wider than
          // measured runs past the board's padding instead of wrapping.
          width: Math.max(ysTextWidth(signText, plan.signSize, ysSignSpec(font)), ysSignTextRoom(plan, sign)),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
      'sign-text',
    ),
  )

  // The answer's shading, hidden until the answer page, under the lines and the numbers.
  for (let i = 0; i < n * n; i++) {
    if (shade[i] !== YS_SHADED) continue
    const row = Math.floor(i / n)
    const col = i % n
    parts.push(shadeOf({ left: grid.left + col * cell, top: grid.top + row * cell, width: cell, height: cell }, tag, 'answer', 'answer-shade', { row, col }))
  }

  // Soft lines between every square, then the black frame flush inside the grid's edge.
  for (const bar of drawGridLines(grid, cell, n, n, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE })) parts.push(part(bar, 'rule'))
  const frame = (box: Box) => part(buildRect({ ...box, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag), 'frame')
  parts.push(frame({ left: grid.left, top: grid.top, width: grid.width, height: YS_FRAME }))
  parts.push(frame({ left: grid.left, top: grid.top + grid.height - YS_FRAME, width: grid.width, height: YS_FRAME }))
  parts.push(frame({ left: grid.left, top: grid.top, width: YS_FRAME, height: grid.height }))
  parts.push(frame({ left: grid.left + grid.width - YS_FRAME, top: grid.top, width: YS_FRAME, height: grid.height }))

  // A bold number in every square.
  for (let i = 0; i < n * n; i++) {
    const row = Math.floor(i / n)
    const col = i % n
    parts.push(numberText({ value: puzzle.numbers[i]!, cx: grid.left + (col + 0.5) * cell, cy: grid.top + (row + 0.5) * cell, size: plan.digitSize, tag, name: 'number', extra: { row, col } }))
  }

  // The legend: 4 4 with one 4 shaded, then two shaded side by side, crossed out.
  const legend = ysLegendBox(plan, font)
  const [repeatItem] = ysLegendItemWidths(font)
  const rowHeight = ysLegendRowHeight()
  const rowMid = (row: number) => legend.top + row * (rowHeight + YS_LEGEND_ROW_GAP) + rowHeight / 2
  const words = (text: string, x: number, midY: number, entry: string) =>
    part(
      buildText(
        { left: r2(x), top: r2(midY - ysLineHeight(plan.legendSize) / 2), text, fontFamily: font, fontSize: plan.legendSize, lineHeight: 1, width: ysTextWidth(text, plan.legendSize, ysLegendSpec(font)) },
        tag,
        'prompt',
      ),
      'legend-text',
      { entry },
    )
  let x = legend.left
  let midY = rowMid(0)
  parts.push(...legendSquares({ left: x, midY, values: YS_LEGEND_PAIR, shaded: [0], size: plan.legendSize, tag, entry: 'repeat' }))
  parts.push(words(YS_REPEAT_WORD, x + YS_LEGEND_PAIR_WIDTH + YS_LEGEND_ICON_GAP, midY, 'repeat'))
  if (plan.legendRows === 1) x += repeatItem + YS_LEGEND_ITEM_GAP
  else midY = rowMid(1)
  parts.push(...legendSquares({ left: x, midY, values: YS_LEGEND_TWINS, shaded: [0, 1], size: plan.legendSize, tag, entry: 'touch' }))
  parts.push(...legendCross(x + YS_LEGEND_SQUARE, midY, tag))
  parts.push(words(YS_TOUCH_WORD, x + YS_LEGEND_TWINS_WIDTH + YS_LEGEND_ICON_GAP, midY, 'touch'))

  const top = plan.block.top
  const bottom = plan.legendTop + plan.legendHeight
  const left = Math.min(sign.left, legend.left, grid.left)
  const right = Math.max(sign.left + sign.width, legend.left + legend.width, grid.left + grid.width)
  const group = buildGroup(parts, { left, top, width: right - left, height: bottom - top }, tag, 'prompt')
  return {
    ...group,
    data: {
      source: YS_TEMPLATE_KEY,
      [YS_PART_KEY]: 'puzzle',
      sale: sale.name,
      level,
      size: `${n}x${n}`,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same grid turned, mirrored or with its numbers renamed is the same puzzle wherever it sits.
      [STUDIO_CANONICAL_KEY]: `${YS_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}
