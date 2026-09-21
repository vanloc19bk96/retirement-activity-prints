/**
 * Drawing half of the move list. `move-list.ts` decides which rows a figure
 * prints and how much room they need; this file turns that plan into objects,
 * using the same em-based measurements so a block that measured as fitting is
 * drawn as fitting.
 */
import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { buildLine, buildText, type StudioTag } from '../studio-fabric-builders'
import { hugTextBoxWidth } from '../studio-text-metrics'
import type { Box } from '../studio-layout'
import { buildArrowGlyph, buildDotMarker } from './render'
import {
  ARROW_EM,
  GAP_EM,
  NOTE_SCALE,
  moveLineWidth,
  partitionMoveLines,
  type MoveLine,
  type MoveListMetrics,
} from './move-list'

function textAt(options: {
  x: number
  y: number
  text: string
  size: number
  font: string
  tag: StudioTag
  role: 'prompt' | 'answer' | 'decoration' | 'structure'
  fill?: string
  align?: 'left' | 'right'
}): StudioFabricObject {
  const { x, y, text, size, font, tag, role, fill, align = 'left' } = options
  return buildText(
    {
      left: x,
      top: y,
      text,
      width: hugTextBoxWidth(text, size, Infinity, { fontFamily: font }),
      fontSize: size,
      fontFamily: font,
      lineHeight: 1,
      fill: fill ?? STUDIO_INK,
      textAlign: align,
      originX: align === 'right' ? 'right' : 'left',
      originY: 'center',
    },
    tag,
    role,
  )
}

/** Draw one row; returns its objects. */
function drawMoveLine(options: {
  line: MoveLine
  box: Box
  centerY: number
  fontSize: number
  metrics: MoveListMetrics
  font: string
  tag: StudioTag
}): StudioFabricObject[] {
  const { line, box, centerY, fontSize, metrics, font, tag } = options
  const out: StudioFabricObject[] = []
  const arrowSize = fontSize * ARROW_EM
  const gap = fontSize * GAP_EM
  const noteSize = fontSize * NOTE_SCALE
  const gutter = line.ordinal ? metrics.gutter : 0
  let x = box.left + gutter

  if (line.kind === 'note') {
    if (line.answerText) {
      out.push(
        textAt({
          x,
          y: centerY,
          text: line.answerText,
          size: noteSize,
          font,
          tag,
          role: 'answer',
          fill: STUDIO_INK_MUTED,
        }),
      )
    }
    return out
  }

  if (line.ordinal) {
    out.push(
      textAt({
        x: box.left + metrics.gutter - gap,
        y: centerY,
        text: line.ordinal,
        size: fontSize,
        font,
        tag,
        // Never 'decoration': the answer-key builder drops decoration text set
        // at the instruction size, which the list type can land on exactly.
        role: 'prompt',
        align: 'right',
      }),
    )
  }

  if (line.dot) {
    out.push(
      buildDotMarker({
        center: { x: x + arrowSize / 2, y: centerY },
        radius: arrowSize * 0.35,
        tag,
      }),
    )
    x += arrowSize + gap
  } else if (line.dir) {
    out.push(
      buildArrowGlyph({
        center: { x: x + arrowSize / 2, y: centerY },
        size: arrowSize,
        dir: line.dir,
        tag,
      }),
    )
    x += arrowSize + gap
  }

  if (line.text) {
    out.push(
      textAt({ x, y: centerY, text: line.text, size: fontSize, font, tag, role: 'prompt' }),
    )
    x += hugTextBoxWidth(line.text, fontSize, Infinity, { fontFamily: font }) + gap
  }

  if (line.ruleEm > 0) {
    const ruleY = centerY + fontSize * 0.45
    out.push(
      buildLine(
        {
          x1: x,
          y1: ruleY,
          x2: x + line.ruleEm * fontSize,
          y2: ruleY,
          stroke: STUDIO_RULE,
          strokeWidth: STUDIO_STROKE_HAIRLINE,
          strokeUniform: true,
        },
        tag,
        'structure',
      ),
    )
  }

  if (line.answerText) {
    let answerX = x
    if (line.answerDir) {
      out.push(
        buildArrowGlyph({
          center: { x: answerX + arrowSize / 2, y: centerY },
          size: arrowSize,
          dir: line.answerDir,
          tag,
          role: 'answer',
        }),
      )
      answerX += arrowSize + gap
    }
    out.push(
      textAt({
        x: answerX,
        y: centerY,
        text: line.answerText,
        size: fontSize,
        font,
        tag,
        role: 'answer',
      }),
    )
  }
  return out
}

/** The whole move list, drawn from the top of `box` — steps/blanks in a
 * row×col grid; write-ins and notes centered under that grid. */
export function drawMoveList(options: {
  box: Box
  lines: readonly MoveLine[]
  fontSize: number
  metrics: MoveListMetrics
  font: string
  tag: StudioTag
}): StudioFabricObject[] {
  const { box, lines, fontSize, metrics, font, tag } = options
  const { head, cells, tail } = partitionMoveLines(lines)
  const out: StudioFabricObject[] = []
  let top = box.top

  const drawStack = (stack: readonly MoveLine[], center: boolean) => {
    stack.forEach((line, i) => {
      const lineW = moveLineWidth(line, fontSize, font, metrics.gutter)
      const left = center
        ? box.left + Math.max(0, (metrics.width - lineW) / 2)
        : box.left
      out.push(
        ...drawMoveLine({
          line,
          box: { left, top, width: center ? lineW : box.width, height: metrics.pitch },
          centerY: top + metrics.pitch * (i + 0.5),
          fontSize,
          metrics,
          font,
          tag,
        }),
      )
    })
    top += stack.length * metrics.pitch
  }

  drawStack(head, true)

  const cols = Math.max(1, metrics.cols)
  cells.forEach((line, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const cellBox: Box = {
      left: box.left + col * (metrics.cellWidth + metrics.colGap),
      top: top + row * metrics.pitch,
      width: metrics.cellWidth,
      height: metrics.pitch,
    }
    out.push(
      ...drawMoveLine({
        line,
        box: cellBox,
        centerY: cellBox.top + metrics.pitch / 2,
        fontSize,
        metrics,
        font,
        tag,
      }),
    )
  })
  top += metrics.rows * metrics.pitch

  drawStack(tail, true)
  return out
}
