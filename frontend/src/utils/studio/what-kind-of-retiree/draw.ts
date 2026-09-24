import type { StudioFabricObject } from '@/types/studio-template.types'
import type { RetireeStyle } from '@/types/studio-retiree-quiz.types'
import {
  STUDIO_INK,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import { toNonBreakingSpaces, type Box } from '../studio-layout'
import { buildCircle, buildPolygon, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { FABRIC_FONT_SIZE_MULT, fabricTextHeight, hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import {
  RQ_LETTERS,
  RQ_RESULTS_HEADING,
  RQ_SCORING_HEADING,
  RQ_STYLES,
  RQ_STYLE_NAMES,
} from './content'
import type { FittedRqQuestion } from './fit'
import {
  LINE_HEIGHT,
  boldSpec,
  breakLines,
  gridHeight,
  italicSpec,
  questionBlockHeight,
  textHeight,
  type RqQuizPlan,
  type RqResultsPlan,
} from './layout'

interface DrawContext {
  objects: StudioFabricObject[]
  font: string
  tag: StudioTag
}

/** Top of a single glyph line centred in a band of `height`. */
const glyphTop = (top: number, height: number, size: number) =>
  Math.round(top + (height - size * FABRIC_FONT_SIZE_MULT) / 2)

function text(
  ctx: DrawContext,
  spec: Parameters<typeof buildText>[0],
  label?: string,
): void {
  const object = buildText({ fontFamily: ctx.font, ...spec }, ctx.tag, 'prompt')
  ctx.objects.push(label ? { ...object, data: { [STUDIO_CONTENT_LABEL_KEY]: label } } : object)
}

/** A one-line run centred on `centerX`, in a box that hugs it so Fabric never wraps it. */
function centredRun(
  ctx: DrawContext,
  run: string,
  centerX: number,
  top: number,
  size: number,
  options: { bold?: boolean; italic?: boolean; maxWidth: number },
): void {
  const spec = options.bold ? boldSpec(ctx.font) : options.italic ? italicSpec(ctx.font) : { fontFamily: ctx.font }
  const value = toNonBreakingSpaces(run)
  const width = hugTextBoxWidth(value, size, options.maxWidth, spec)
  text(ctx, {
    left: Math.round(centerX - width / 2),
    top,
    text: value,
    width,
    fontSize: size,
    fontWeight: options.bold ? 700 : undefined,
    fontStyle: options.italic ? 'italic' : undefined,
    lineHeight: 1,
    textAlign: 'center',
  })
}

/** Pre-broken lines, centred in `width`. */
function centredBlock(
  ctx: DrawContext,
  lines: readonly string[],
  left: number,
  top: number,
  width: number,
  size: number,
  italic = false,
): void {
  text(ctx, {
    left,
    top,
    text: lines.join('\n'),
    width,
    fontSize: size,
    fontStyle: italic ? 'italic' : undefined,
    lineHeight: LINE_HEIGHT,
    textAlign: 'center',
  })
}

function hairline(ctx: DrawContext, left: number, top: number, width: number, height: number, fill = STUDIO_RULE_MEDIUM) {
  ctx.objects.push(
    buildRect(
      { left, top, width, height, fill, stroke: 'transparent', strokeWidth: 0 },
      ctx.tag,
      'structure',
    ),
  )
}

/* ------------------------------------------------------------------ *
 * Style symbols — one shape per style, told apart by outline alone so a
 * black-and-white print never depends on colour.
 * ------------------------------------------------------------------ */

function starPoints(r: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.45
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    return { x: Math.round(radius * Math.cos(angle) * 100) / 100, y: Math.round(radius * Math.sin(angle) * 100) / 100 }
  })
}

export function drawSymbol(
  ctx: DrawContext,
  style: RetireeStyle,
  centerX: number,
  centerY: number,
  size: number,
): void {
  const r = size / 2
  const stroke = { stroke: STUDIO_INK, strokeWidth: STUDIO_STROKE_NORMAL, strokeUniform: true }
  if (style === 'social') {
    ctx.objects.push(buildCircle({ left: centerX, top: centerY, radius: r * 0.82, ...stroke }, ctx.tag, 'structure'))
    return
  }
  const points =
    style === 'explorer'
      ? starPoints(r)
      : style === 'tinkerer'
        ? [{ x: 0, y: -r }, { x: r * 0.8, y: 0 }, { x: 0, y: r }, { x: -r * 0.8, y: 0 }]
        : [{ x: -r * 0.72, y: -r * 0.72 }, { x: r * 0.72, y: -r * 0.72 }, { x: r * 0.72, y: r * 0.72 }, { x: -r * 0.72, y: r * 0.72 }]
  ctx.objects.push(
    buildPolygon({ left: centerX, top: centerY, points, strokeLineJoin: 'round', ...stroke }, ctx.tag, 'structure'),
  )
}

/* ------------------------------------------------------------------ *
 * Quiz pages
 * ------------------------------------------------------------------ */

function drawQuestion(
  ctx: DrawContext,
  plan: RqQuizPlan,
  question: FittedRqQuestion,
  number: number,
  left: number,
  top: number,
): void {
  const { metrics, questionWidth, answerWidth } = plan
  const size = metrics.font
  text(ctx, {
    left,
    top,
    text: `${number}.`,
    width: metrics.numberW,
    fontSize: size,
    fontWeight: 700,
    lineHeight: 1,
  })
  text(
    ctx,
    {
      left: left + metrics.numberW,
      top,
      text: question.questionLines.join('\n'),
      width: questionWidth,
      fontSize: size,
      fontWeight: 700,
      lineHeight: LINE_HEIGHT,
    },
    question.question,
  )

  let y = top + textHeight(question.questionLines.length, size) + metrics.questionGap
  const letterLeft = left + metrics.numberW
  question.answers.forEach((_, i) => {
    const lines = question.answerLines[i]!
    const rowTop = Math.round(y)
    text(ctx, {
      left: letterLeft,
      top: rowTop,
      text: RQ_LETTERS[i]!,
      width: metrics.letterW,
      fontSize: size,
      fontWeight: 700,
      lineHeight: 1,
      textAlign: 'center',
    })
    text(ctx, {
      left: letterLeft + metrics.letterW,
      top: rowTop,
      text: lines.join('\n'),
      width: answerWidth,
      fontSize: size,
      lineHeight: LINE_HEIGHT,
    })
    y += textHeight(lines.length, size) + metrics.rowGap
  })
}

/**
 * One quiz page: numbered questions stacked under the header, a light rule
 * between them, and a one-line cue at the foot of the page.
 *
 * Leftover height is spread between the blocks (up to one extra gap each), and
 * the stack starts just under the header with any remaining white below it —
 * centring it left a gap under the instruction that reads as a missing
 * question. The cue sits at the foot of the page whatever the stack's height,
 * so every quiz page ends in the same place.
 */
export function drawRqQuizPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: RqQuizPlan
    questions: readonly FittedRqQuestion[]
    firstNumber: number
    footer: string
    font: string
    tag: StudioTag
  },
): void {
  const { field, plan, questions, firstNumber, footer, font, tag } = options
  const ctx: DrawContext = { objects, font, tag }
  const { metrics } = plan
  if (questions.length === 0) return

  const heights = questions.map((q) =>
    questionBlockHeight(q.questionLines.length, q.answerLines.map((lines) => lines.length), metrics),
  )
  const usable = Math.max(0, field.height - plan.bottomGuard - plan.footerHeight)
  const content = heights.reduce((sum, h) => sum + h, 0)
  const gaps = questions.length - 1
  const slack = Math.max(0, usable - content - metrics.blockGap * gaps)
  const gap = metrics.blockGap + (gaps > 0 ? Math.min(slack / (gaps + 1), metrics.blockGap) : 0)
  const stack = content + gap * gaps
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)
  let top = Math.round(field.top + Math.min(Math.max(0, usable - stack), metrics.font * 0.8))

  questions.forEach((question, index) => {
    drawQuestion(ctx, plan, question, firstNumber + index, left, top)
    top += heights[index]!
    if (index < gaps) {
      hairline(ctx, left, Math.round(top + gap / 2), plan.blockWidth, 1)
      top += gap
    }
  })

  const footerLines = breakLines(footer, metrics.footerFont, plan.blockWidth, italicSpec(font))
  const footerTop = Math.round(
    field.top + field.height - plan.bottomGuard - textHeight(footerLines.length, metrics.footerFont),
  )
  centredBlock(ctx, footerLines, left, footerTop, plan.blockWidth, metrics.footerFont, true)
}

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

function heading(ctx: DrawContext, plan: RqResultsPlan, run: string, left: number, top: number): number {
  const { metrics, blockWidth } = plan
  centredRun(ctx, run, left + blockWidth / 2, top, metrics.headingFont, { bold: true, maxWidth: blockWidth })
  return top + fabricTextHeight(1, metrics.headingFont) + metrics.headingGap
}

/**
 * The scoring grid: one row per question, one column per style, and in each
 * cell the letter that scores for that style. The reader rings the letter
 * they chose in every row, counts each column's rings into the box at its
 * foot, and the highest total is their style.
 *
 * Every row is read from the placed question itself — `styles[i]` is the
 * style of the answer printed beside `RQ_LETTERS[i]` — so the grid cannot
 * disagree with the question page.
 */
function drawGrid(
  ctx: DrawContext,
  plan: RqResultsPlan,
  questions: readonly FittedRqQuestion[],
  left: number,
  top: number,
): void {
  const m = plan.metrics
  const gridLeft = Math.round(left + (plan.blockWidth - m.gridW) / 2)
  const height = gridHeight(m, questions.length)
  const cellLeft = (column: number) => gridLeft + m.numberColW + column * m.cellW
  const cellCentre = (column: number) => cellLeft(column) + m.cellW / 2

  // Column rules first, rows over them, the frame last so it reads on top.
  for (let column = 1; column < RQ_STYLES.length; column++) {
    hairline(ctx, cellLeft(column), top, 1, height)
  }
  hairline(ctx, cellLeft(0) - 1, top, 2, height, STUDIO_INK)

  // Header: each style's symbol, and its name when the column can hold it whole.
  const pad = Math.round(m.font * 0.45)
  RQ_STYLES.forEach((style, column) => {
    drawSymbol(ctx, style, cellCentre(column), top + pad + m.symbolSize / 2, m.symbolSize)
    const lines = m.labels?.[style]
    if (lines) {
      text(ctx, {
        left: cellLeft(column) + 2,
        top: Math.round(top + pad + m.symbolSize + m.font * 0.3),
        text: lines.map(toNonBreakingSpaces).join('\n'),
        width: m.cellW - 4,
        fontSize: m.labelFont,
        fontWeight: 700,
        lineHeight: LINE_HEIGHT,
        textAlign: 'center',
      })
    }
  })
  hairline(ctx, gridLeft, top + m.headerH - 1, m.gridW, 2, STUDIO_INK)

  const numberCentre = gridLeft + m.numberColW / 2
  questions.forEach((question, row) => {
    const rowTop = top + m.headerH + row * m.rowH
    if (row > 0) hairline(ctx, gridLeft, rowTop, m.gridW, 1)
    centredRun(ctx, String(row + 1), numberCentre, glyphTop(rowTop, m.rowH, m.font), m.font, {
      bold: true,
      maxWidth: m.numberColW,
    })
    RQ_STYLES.forEach((style, column) => {
      const letter = RQ_LETTERS[question.styles.indexOf(style)]!
      centredRun(ctx, letter, cellCentre(column), glyphTop(rowTop, m.rowH, m.font), m.font, {
        maxWidth: m.cellW,
      })
    })
  })

  const totalTop = top + m.headerH + questions.length * m.rowH
  hairline(ctx, gridLeft, totalTop - 1, m.gridW, 2, STUDIO_INK)
  const labelSize = Math.round(m.font * 0.8)
  centredRun(ctx, 'Total', numberCentre, glyphTop(totalTop, m.totalRowH, labelSize), labelSize, {
    bold: true,
    maxWidth: m.numberColW,
  })
  const box = Math.round(m.totalRowH * 0.62)
  RQ_STYLES.forEach((_, column) => {
    ctx.objects.push(
      buildRect(
        {
          left: Math.round(cellCentre(column) - box / 2),
          top: Math.round(totalTop + (m.totalRowH - box) / 2),
          width: box,
          height: box,
          stroke: STUDIO_INK,
          strokeWidth: STUDIO_STROKE_NORMAL,
        },
        ctx.tag,
        'structure',
      ),
    )
  })

  ctx.objects.push(
    buildRect(
      { left: gridLeft, top, width: m.gridW, height, stroke: STUDIO_INK, strokeWidth: STUDIO_STROKE_NORMAL },
      ctx.tag,
      'structure',
    ),
  )
}

/** Heading, the three steps, the grid and the tie rule. Returns the bottom edge. */
export function drawRqScoring(
  objects: StudioFabricObject[],
  options: {
    plan: RqResultsPlan
    questions: readonly FittedRqQuestion[]
    left: number
    top: number
    font: string
    tag: StudioTag
  },
): number {
  const { plan, questions, left, font, tag } = options
  const ctx: DrawContext = { objects, font, tag }
  const m = plan.metrics
  let y = heading(ctx, plan, RQ_SCORING_HEADING, left, options.top)

  plan.scoring.steps.forEach((lines, index) => {
    text(ctx, { left, top: Math.round(y), text: `${index + 1}.`, width: m.stepNumberW, fontSize: m.font, fontWeight: 700, lineHeight: 1 })
    text(ctx, {
      left: left + m.stepNumberW,
      top: Math.round(y),
      text: lines.join('\n'),
      width: plan.blockWidth - m.stepNumberW,
      fontSize: m.font,
      lineHeight: LINE_HEIGHT,
    })
    y += textHeight(lines.length, m.font) + (index < plan.scoring.steps.length - 1 ? m.stepGap : 0)
  })

  y += m.gridGap
  drawGrid(ctx, plan, questions, left, Math.round(y))
  y += gridHeight(m, questions.length) + m.tieGap
  centredBlock(ctx, plan.scoring.tie, left, Math.round(y), plan.blockWidth, m.font, true)
  return y + textHeight(plan.scoring.tie.length, m.font)
}

/**
 * Heading, each style's symbol, name and write-up, and the just-for-fun line.
 * `extraGap` is added after every write-up, to spread a page's leftover white
 * between them rather than pool it at the foot.
 */
export function drawRqWriteUps(
  objects: StudioFabricObject[],
  options: { plan: RqResultsPlan; left: number; top: number; font: string; tag: StudioTag; extraGap?: number },
): number {
  const { plan, left, font, tag, extraGap = 0 } = options
  const ctx: DrawContext = { objects, font, tag }
  const m = plan.metrics
  const nameLeft = left + m.symbolColW
  const nameWidth = plan.blockWidth - m.symbolColW
  let y = heading(ctx, plan, RQ_RESULTS_HEADING, left, options.top)

  RQ_STYLES.forEach((style) => {
    const nameH = fabricTextHeight(1, m.nameFont)
    drawSymbol(ctx, style, left + m.symbolColW / 2 - m.font * 0.2, Math.round(y + nameH / 2), m.symbolSize)
    const name = toNonBreakingSpaces(RQ_STYLE_NAMES[style])
    text(ctx, {
      left: nameLeft,
      top: Math.round(y),
      text: name,
      width: hugTextBoxWidth(name, m.nameFont, nameWidth, boldSpec(font)),
      fontSize: m.nameFont,
      fontWeight: 700,
      lineHeight: 1,
    })
    y += nameH + m.descriptionGap
    const lines = plan.writeUps.descriptions[style]
    text(ctx, {
      left,
      top: Math.round(y),
      text: lines.join('\n'),
      width: plan.blockWidth,
      fontSize: m.font,
      lineHeight: LINE_HEIGHT,
    })
    y += textHeight(lines.length, m.font) + m.styleGap + extraGap
  })

  centredBlock(ctx, plan.writeUps.fun, left, Math.round(y), plan.blockWidth, m.funFont, true)
  return y + textHeight(plan.writeUps.fun.length, m.funFont)
}
