import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK, STUDIO_RULE_LIGHT, STUDIO_RULE_MEDIUM, STUDIO_STROKE_BOLD, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import { STUDIO_CANONICAL_KEY } from '../_shared/uniqueness'
import { buildGroup, buildPolygon, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { drawGridLines } from '../studio-grid-rules'
import type { Box } from '../studio-layout'
import { PA_CAPTION_PROMPT, PA_LEGEND_BLOCK, PA_LEGEND_LINES, PA_LEGEND_NUMBER, PA_TEMPLATE_KEY, type PaDesign, type PaLevel } from './content'
import {
  PA_CORNER_OUT,
  PA_EDGE,
  PA_FRAME_RADIUS,
  PA_FRAME_STROKE,
  PA_LEGEND_NUMBER_SIZE,
  PA_LEGEND_SQUARE,
  PA_LINE_WEIGHT,
  PA_NAME_SIZE,
  PA_PROMPT_SIZE,
  paDigitSpec,
  paTextSpec,
  paTextWidth,
  type PaLegendPlan,
  type PaPlan,
} from './layout'
import type { PaBuilt } from './puzzle'

/**
 * A planned grid → one Fabric group: the snapshot's border and album
 * corners, the grid, the numbers, the caption and its writing line, the
 * picture and its name hidden for the answer page, and the legend.
 *
 * Black on white with one mid gray, so it prints the same on any interior.
 * The picture is one black bar per run of shaded squares in a row, drawn
 * over the numbers: on the answer page the snapshot develops, clean and
 * solid, with the blank squares' numbers still showing round it.
 */

/** Marks the objects a Photo Album page draws, for checks and the editor. */
export const PA_PART_KEY = 'paPart'

const r2 = (n: number) => Math.round(n * 100) / 100

function part(obj: StudioFabricObject, name: string, extra: Record<string, unknown> = {}): StudioFabricObject {
  return { ...obj, data: { ...(obj.data ?? {}), [PA_PART_KEY]: name, ...extra } }
}

/** A filled bar (never a stroked rect: every edge the same weight). */
const bar = (box: Box, tag: StudioTag, fill = STUDIO_INK, role: 'structure' | 'answer' = 'structure') =>
  buildRect({ left: r2(box.left), top: r2(box.top), width: r2(box.width), height: r2(box.height), fill, stroke: 'transparent', strokeWidth: 0 }, tag, role)

/** A number centred in its square, in the digit face. */
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
        fontWeight: 400,
        fill: STUDIO_INK,
        width: Math.max(Math.ceil(size * 1.1), paTextWidth(text, size, paDigitSpec())),
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        // Fabric's default multiplier centres a lone line of digits off its axis.
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

/** One run of shaded squares in a row: `from` and `length` in squares. */
export interface PaRun {
  row: number
  from: number
  length: number
}

/** The picture as runs, row by row: one bar each on the answer page. */
export function paRuns(bitmap: readonly boolean[], size: number): PaRun[] {
  const runs: PaRun[] = []
  for (let row = 0; row < size; row++) {
    let c = 0
    while (c < size) {
      if (!bitmap[row * size + c]) {
        c++
        continue
      }
      const from = c
      while (c < size && bitmap[row * size + c]) c++
      runs.push({ row, from, length: c - from })
    }
  }
  return runs
}

/**
 * An album corner's three points, clockwise from its right angle, which
 * sits `PA_CORNER_OUT` past the snapshot's corner: `sx` and `sy` point the
 * legs back along the snapshot's edges (+1 right or down, −1 left or up).
 */
export function paCornerPoints(plan: PaPlan, corner: 0 | 1 | 2 | 3): { x: number; y: number }[] {
  const { frame, cornerLeg: leg } = plan
  const right = corner === 1 || corner === 2
  const bottom = corner >= 2
  const x = right ? frame.left + frame.width + PA_CORNER_OUT : frame.left - PA_CORNER_OUT
  const y = bottom ? frame.top + frame.height + PA_CORNER_OUT : frame.top - PA_CORNER_OUT
  const sx = right ? -1 : 1
  const sy = bottom ? -1 : 1
  return [
    { x: r2(x), y: r2(y) },
    { x: r2(x + sx * leg), y: r2(y) },
    { x: r2(x), y: r2(y + sy * leg) },
  ]
}

/** The legend's little block of nine: its left edge and the top of its middle row. */
function legendBlock(legend: PaLegendPlan, tag: StudioTag): StudioFabricObject[] {
  const { box } = legend
  const square = PA_LEGEND_SQUARE
  const left = box.left
  const top = Math.round(box.top + (box.height - square * 3) / 2)
  const out: StudioFabricObject[] = []
  PA_LEGEND_BLOCK.forEach((row, r) => {
    ;[...row].forEach((ch, c) => {
      if (ch === '#') out.push(part(bar({ left: left + c * square, top: top + r * square, width: square, height: square }, tag, STUDIO_RULE_LIGHT), 'legend-shade', { row: r, col: c }))
    })
  })
  for (const line of drawGridLines({ left, top, width: square * 3, height: square * 3 }, square, 3, 3, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE })) out.push(part(line, 'legend-rule'))
  out.push(part(bar({ left, top, width: square * 3, height: 2 }, tag), 'legend-edge'))
  out.push(part(bar({ left, top: top + square * 3 - 2, width: square * 3, height: 2 }, tag), 'legend-edge'))
  out.push(part(bar({ left, top, width: 2, height: square * 3 }, tag), 'legend-edge'))
  out.push(part(bar({ left: left + square * 3 - 2, top, width: 2, height: square * 3 }, tag), 'legend-edge'))
  out.push(numberText({ value: PA_LEGEND_NUMBER, cx: left + square * 1.5, cy: top + square * 1.5, size: PA_LEGEND_NUMBER_SIZE, tag, name: 'legend-number', extra: {} }))
  return out
}

export function buildPaPuzzle(options: {
  built: PaBuilt
  design: PaDesign
  plan: PaPlan
  level: PaLevel
  /** `picture|way|level|grid` — what the book remembers of this page. */
  label: string
  tag: StudioTag
  font: string
}): StudioFabricObject {
  const { built, design, plan, level, label, tag, font } = options
  const { puzzle, bitmap } = built
  const { grid, cell, frame, caption } = plan
  const n = puzzle.width
  const parts: StudioFabricObject[] = []

  // The snapshot's border: a white card with a fine black outline.
  parts.push(
    part(
      buildRect(
        { left: frame.left, top: frame.top, width: frame.width, height: frame.height, rx: PA_FRAME_RADIUS, ry: PA_FRAME_RADIUS, fill: 'transparent', stroke: STUDIO_INK, strokeWidth: PA_FRAME_STROKE },
        tag,
      ),
      'frame',
    ),
  )

  // Soft lines between every square, a little heavier every five, then the bold edge flush inside the grid.
  for (const line of drawGridLines(grid, cell, n, n, tag, { fill: STUDIO_RULE_MEDIUM, thickness: STUDIO_STROKE_HAIRLINE, boldThickness: STUDIO_STROKE_BOLD, boxCols: 5, boxRows: 5 })) parts.push(part(line, 'rule'))
  parts.push(part(bar({ left: grid.left, top: grid.top, width: grid.width, height: PA_EDGE }, tag), 'edge'))
  parts.push(part(bar({ left: grid.left, top: grid.top + grid.height - PA_EDGE, width: grid.width, height: PA_EDGE }, tag), 'edge'))
  parts.push(part(bar({ left: grid.left, top: grid.top, width: PA_EDGE, height: grid.height }, tag), 'edge'))
  parts.push(part(bar({ left: grid.left + grid.width - PA_EDGE, top: grid.top, width: PA_EDGE, height: grid.height }, tag), 'edge'))

  // Every printed number, centred in its square.
  puzzle.clues.forEach((value, i) => {
    if (value < 0) return
    const row = Math.floor(i / n)
    const col = i % n
    parts.push(numberText({ value, cx: grid.left + (col + 0.5) * cell, cy: grid.top + (row + 0.5) * cell, size: plan.digitSize, tag, name: 'clue', extra: { row, col } }))
  })

  // The picture, hidden until the answer page: one bar per run, over the numbers.
  for (const run of paRuns(bitmap, n)) {
    parts.push(
      part(
        { ...bar({ left: grid.left + run.from * cell, top: grid.top + run.row * cell, width: run.length * cell, height: cell }, tag, STUDIO_INK, 'answer'), visible: false },
        'answer',
        { row: run.row, from: run.from, length: run.length },
      ),
    )
  }

  // The album corners, holding the snapshot on the page.
  for (const corner of [0, 1, 2, 3] as const) {
    const points = paCornerPoints(plan, corner)
    const left = Math.min(...points.map((p) => p.x))
    const top = Math.min(...points.map((p) => p.y))
    const local = points.map((p) => ({ x: r2(p.x - left), y: r2(p.y - top) }))
    parts.push(part(buildPolygon({ left, top, points: local, fill: STUDIO_INK, stroke: 'transparent', strokeWidth: 0 }, tag), 'corner', { corner }))
  }

  // The caption: the question, a line to write on, and the answer waiting on it.
  const centre = grid.left + grid.width / 2
  const promptWidth = Math.min(grid.width, paTextWidth(PA_CAPTION_PROMPT, PA_PROMPT_SIZE, paTextSpec(font)))
  parts.push(
    part(
      buildText(
        { left: r2(centre), top: caption.promptTop, text: PA_CAPTION_PROMPT, fontFamily: font, fontSize: PA_PROMPT_SIZE, lineHeight: 1, width: promptWidth, textAlign: 'center', originX: 'center' },
        tag,
        'prompt',
      ),
      'caption-prompt',
    ),
  )
  parts.push(part(bar({ left: caption.lineLeft, top: caption.lineTop, width: caption.lineRight - caption.lineLeft, height: PA_LINE_WEIGHT }, tag), 'caption-line'))
  const name = design.picture.name
  parts.push(
    part(
      {
        ...buildText(
          {
            left: r2(centre),
            top: caption.nameTop,
            text: name,
            fontFamily: font,
            fontSize: PA_NAME_SIZE,
            fontWeight: 700,
            lineHeight: 1,
            width: Math.min(caption.lineRight - caption.lineLeft, paTextWidth(name, PA_NAME_SIZE, paTextSpec(font, 700))),
            textAlign: 'center',
            originX: 'center',
            editable: false,
          },
          tag,
          'answer',
        ),
        visible: false,
      },
      'caption-answer',
    ),
  )

  // The legend: one worked block of nine, and what its number means (left off on a page too tight for it).
  const { legend } = plan
  if (legend) {
    parts.push(...legendBlock(legend, tag))
    parts.push(
      part(
        buildText(
          {
            left: legend.textLeft,
            top: legend.textTop,
            text: PA_LEGEND_LINES.join('\n'),
            fontFamily: font,
            fontSize: legend.size,
            lineHeight: 1,
            width: Math.max(...PA_LEGEND_LINES.map((line) => paTextWidth(line, legend.size, paTextSpec(font)))),
          },
          tag,
          'prompt',
        ),
        'legend-text',
      ),
    )
  }

  const group = buildGroup(parts, plan.block, tag, 'prompt')
  return {
    ...group,
    data: {
      source: PA_TEMPLATE_KEY,
      [PA_PART_KEY]: 'puzzle',
      picture: name,
      level,
      size: `${n}x${n}`,
      numbers: puzzle.clues.filter((v) => v >= 0).length,
      [STUDIO_CONTENT_LABEL_KEY]: label,
      // The same numbers in the same places, turned or mirrored, are the same puzzle wherever they sit.
      [STUDIO_CANONICAL_KEY]: `${PA_TEMPLATE_KEY}:${built.signature}`,
    },
  }
}

