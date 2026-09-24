import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_RULE_MEDIUM, STUDIO_STROKE_BOLD } from '@/constants/studio.constants'
import type { Box } from '../studio-layout'
import { buildCircle, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { FABRIC_FONT_SIZE_MULT, measureRunWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { PC_LETTERS, formatPrice } from './content'
import type { FittedPcQuestion } from './fit'
import {
  TEXT_LINE_HEIGHT,
  answerBlockHeight,
  boldSpec,
  itemNumber,
  optionsHeight,
  questionBlockHeight,
  textHeight,
  type PcPagePlan,
} from './layout'

/**
 * `puzzle` — numbered questions, each with its four lettered prices.
 * `answers` — the same questions and prices, the right letter ringed and the
 * fact behind it written beneath.
 */
export type PcDrawMode = 'puzzle' | 'answers'

interface DrawContext {
  objects: StudioFabricObject[]
  plan: PcPagePlan
  font: string
  tag: StudioTag
}

function number(ctx: DrawContext, index: number, left: number, top: number) {
  const { metrics } = ctx.plan
  ctx.objects.push(
    buildText(
      {
        left,
        top,
        text: itemNumber(index),
        width: metrics.numberW,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        fontWeight: 700,
        lineHeight: TEXT_LINE_HEIGHT,
      },
      ctx.tag,
      // Not `decoration`: the answer key drops decoration set at the
      // instruction size, and the numbers must survive onto the key.
      'prompt',
    ),
  )
}

/**
 * The question, pre-broken and set in a box exactly the measure it was broken
 * to. It carries its fact's identity (`series@year`) as a content label, so a
 * later page in the book can refuse the same item and year, however worded.
 */
function question(ctx: DrawContext, q: FittedPcQuestion, left: number, top: number) {
  const { metrics, textWidth } = ctx.plan
  ctx.objects.push({
    ...buildText(
      {
        left,
        top,
        text: q.questionLines.join('\n'),
        width: textWidth,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        lineHeight: TEXT_LINE_HEIGHT,
      },
      ctx.tag,
      'prompt',
    ),
    data: { [STUDIO_CONTENT_LABEL_KEY]: q.fact.key },
  })
}

/** Where choice `i` sits — its letter's top-left corner — and its cell's width. */
function choiceAt(plan: PcPagePlan, i: number, left: number, top: number) {
  const { metrics, textWidth, columns } = plan
  const cellW = Math.floor(textWidth / columns)
  const rowPitch = textHeight(1, metrics) + metrics.optionRowGap
  return {
    x: left + (i % columns) * cellW,
    y: Math.round(top + Math.floor(i / columns) * rowPitch),
    cellW,
  }
}

/**
 * Four lettered prices, cheapest first — four across, or two by two on a
 * narrow column. The letter is bold so a reader can ring it; the puzzle page
 * marks none of them, not even hidden.
 */
function choices(ctx: DrawContext, q: FittedPcQuestion, left: number, top: number) {
  const { metrics } = ctx.plan
  q.options.forEach((cents, i) => {
    const { x, y, cellW } = choiceAt(ctx.plan, i, left, top)
    ctx.objects.push(
      buildText(
        {
          left: x,
          top: y,
          text: PC_LETTERS[i]!,
          width: metrics.letterW,
          fontFamily: ctx.font,
          fontSize: metrics.font,
          fontWeight: 700,
          lineHeight: 1,
        },
        ctx.tag,
        'prompt',
      ),
      buildText(
        {
          left: x + metrics.letterW,
          top: y,
          text: formatPrice(cents, q.dollars),
          width: cellW - metrics.letterW,
          fontFamily: ctx.font,
          fontSize: metrics.font,
          lineHeight: 1,
        },
        ctx.tag,
        'prompt',
      ),
    )
  })
}

/**
 * The ring round the right letter — the mark the reader was asked to make.
 * Centred on the letter's own glyph, not its box, and kept inside the letter
 * column so it never touches the price beside it.
 */
function ring(ctx: DrawContext, q: FittedPcQuestion, left: number, top: number) {
  const { metrics } = ctx.plan
  const { x, y } = choiceAt(ctx.plan, q.correct, left, top)
  const glyphW = measureRunWidth(PC_LETTERS[q.correct]!, metrics.font, boldSpec(ctx.font))
  ctx.objects.push(
    buildCircle(
      {
        left: Math.round(x + glyphW / 2),
        top: Math.round(y + (metrics.font * FABRIC_FONT_SIZE_MULT) / 2),
        radius: metrics.ringR,
        stroke: STUDIO_INK,
        strokeWidth: STUDIO_STROKE_BOLD,
        strokeUniform: true,
      },
      ctx.tag,
      'answer',
    ),
  )
}

/** What the right price was and whose figure it is, in italic under the prices. */
function explanation(ctx: DrawContext, q: FittedPcQuestion, left: number, top: number) {
  const { metrics, textWidth } = ctx.plan
  ctx.objects.push(
    buildText(
      {
        left,
        top,
        text: q.answerLines.join('\n'),
        width: textWidth,
        fontFamily: ctx.font,
        fontSize: metrics.explanationFont,
        fontStyle: 'italic',
        lineHeight: TEXT_LINE_HEIGHT,
      },
      ctx.tag,
      // The key reveals it in its own ink; the puzzle page never holds it.
      'answer',
    ),
  )
}

function rule(ctx: DrawContext, left: number, top: number) {
  ctx.objects.push(
    buildRect(
      {
        left,
        top: Math.round(top),
        width: ctx.plan.blockWidth,
        height: 1,
        fill: STUDIO_RULE_MEDIUM,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      ctx.tag,
      'decoration',
    ),
  )
}

/**
 * Lay the questions (or their answers) out in the body field.
 *
 * Leftover height is spread between the blocks (up to one extra gap each), and
 * the stack starts just under the header with any remaining white below it.
 * Blocks are capped in width and centred, so a letter page does not run
 * questions six inches across. A light rule halfway down each gap keeps two
 * questions apart without relying on colour.
 *
 * The answer page sets each question exactly as the puzzle did, so a reader
 * checks the ring against the very choice they marked.
 */
export function drawPcPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: PcPagePlan
    questions: readonly FittedPcQuestion[]
    font: string
    tag: StudioTag
    mode: PcDrawMode
  },
): void {
  const { field, plan, questions, font, tag, mode } = options
  if (questions.length === 0) return
  const ctx: DrawContext = { objects, plan, font, tag }
  const { metrics } = plan
  const answers = mode === 'answers'

  const heights = questions.map((q) =>
    answers
      ? answerBlockHeight(q.questionLines.length, q.answerLines.length, plan.columns, metrics)
      : questionBlockHeight(q.questionLines.length, plan.columns, metrics),
  )
  const baseGap = answers ? metrics.answerGap : metrics.itemGap
  const usable = Math.max(0, field.height - plan.bottomGuard)
  const content = heights.reduce((sum, h) => sum + h, 0)
  const gaps = questions.length - 1
  const slack = Math.max(0, usable - content - baseGap * gaps)
  const gap = baseGap + (gaps > 0 ? Math.min(slack / (gaps + 1), baseGap) : 0)
  const stack = content + gap * gaps
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)
  const textLeft = left + metrics.numberW
  let top = Math.round(field.top + Math.min(Math.max(0, usable - stack), metrics.font * 0.8))

  questions.forEach((q, index) => {
    number(ctx, index, left, top)
    question(ctx, q, textLeft, top)
    const optionsTop = top + textHeight(q.questionLines.length, metrics) + metrics.optionGap
    choices(ctx, q, textLeft, optionsTop)
    if (answers) {
      ring(ctx, q, textLeft, optionsTop)
      const explanationTop = optionsTop + optionsHeight(plan.columns, metrics) + metrics.explanationGap
      explanation(ctx, q, textLeft, Math.round(explanationTop))
    }
    top += heights[index]!
    if (index < gaps) {
      rule(ctx, left, top + gap / 2)
      top += gap
    }
    top = Math.round(top)
  })
}
