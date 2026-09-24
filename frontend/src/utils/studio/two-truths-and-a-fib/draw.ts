import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_BOLD,
} from '@/constants/studio.constants'
import { toNonBreakingSpaces, type Box } from '../studio-layout'
import { buildCircle, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { FABRIC_FONT_SIZE_MULT, hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { TTF_LETTERS } from './content'
import type { FittedTtfSet } from './fit'
import {
  EXPLANATION_LINE_HEIGHT,
  STATEMENT_LINE_HEIGHT,
  answerBlockHeight,
  boldSpec,
  puzzleBlockHeight,
  setHeading,
  statementHeight,
  titleHeight,
  type TtfPagePlan,
} from './layout'

/**
 * `puzzle` — headings, lettered statements, the fib's ring hidden.
 * `answers` — the same blocks with the ring shown and the correction beneath.
 */
export type TtfDrawMode = 'puzzle' | 'answers'

interface DrawContext {
  objects: StudioFabricObject[]
  plan: TtfPagePlan
  font: string
  tag: StudioTag
  mode: TtfDrawMode
}

/** Middle of a line's letters, not of its line box. */
const letterMid = (top: number, fontSize: number) => top + (fontSize * FABRIC_FONT_SIZE_MULT) / 2

function heading(ctx: DrawContext, set: FittedTtfSet, index: number, left: number, top: number) {
  const { metrics, blockWidth } = ctx.plan
  const text = toNonBreakingSpaces(setHeading(index, set.title))
  ctx.objects.push({
    ...buildText(
      {
        left,
        top,
        text,
        width: hugTextBoxWidth(text, metrics.titleFont, blockWidth, boldSpec(ctx.font)),
        fontFamily: ctx.font,
        fontSize: metrics.titleFont,
        fontWeight: 700,
        lineHeight: 1,
      },
      ctx.tag,
      'prompt',
    ),
    data: { [STUDIO_CONTENT_LABEL_KEY]: set.title },
  })
}

/**
 * One row: the letter the reader circles, and the statement beside it,
 * pre-broken and set in a box exactly the measure it was broken to, so Fabric
 * has no reason to re-wrap it into a line the set did not reserve.
 */
function row(ctx: DrawContext, letter: string, lines: string[], statement: string, left: number, top: number) {
  const { metrics, textWidth } = ctx.plan
  ctx.objects.push(
    buildText(
      {
        left,
        top,
        text: letter,
        width: metrics.letterW,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        fontWeight: 700,
        lineHeight: 1,
        textAlign: 'center',
      },
      ctx.tag,
      // Not `decoration`: the answer key drops decoration set at the
      // instruction size, which is exactly this game's 15 pt floor.
      'prompt',
    ),
  )
  ctx.objects.push({
    ...buildText(
      {
        left: left + metrics.letterW,
        top,
        text: lines.join('\n'),
        width: textWidth,
        fontFamily: ctx.font,
        fontSize: metrics.font,
        lineHeight: STATEMENT_LINE_HEIGHT,
      },
      ctx.tag,
      'prompt',
    ),
    data: { [STUDIO_CONTENT_LABEL_KEY]: statement },
  })
}

/**
 * The ring round the fib's letter — the mark the reader was asked to make.
 * Drawn on both pages as an answer: hidden on the puzzle, so the editor can
 * reveal a sheet in place, and shown in black on the answer page. It stays
 * inside the letter column, clear of the statement text.
 */
function ring(ctx: DrawContext, left: number, top: number) {
  const { metrics } = ctx.plan
  ctx.objects.push(
    buildCircle(
      {
        left: left + metrics.letterW / 2,
        top: letterMid(top, metrics.font),
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

function explanation(ctx: DrawContext, set: FittedTtfSet, left: number, top: number) {
  const { metrics, textWidth } = ctx.plan
  ctx.objects.push(
    buildText(
      {
        left,
        top,
        text: set.explanationLines.join('\n'),
        width: textWidth,
        fontFamily: ctx.font,
        fontSize: metrics.explanationFont,
        fontStyle: 'italic',
        lineHeight: EXPLANATION_LINE_HEIGHT,
      },
      ctx.tag,
      'answer',
    ),
  )
}

function blockHeight(ctx: DrawContext, set: FittedTtfSet): number {
  const rows = set.lines.map((lines) => lines.length)
  return ctx.mode === 'answers'
    ? answerBlockHeight(rows, set.explanationLines.length, ctx.plan.metrics)
    : puzzleBlockHeight(rows, ctx.plan.metrics)
}

function drawBlock(ctx: DrawContext, set: FittedTtfSet, index: number, left: number, top: number) {
  const { metrics } = ctx.plan
  heading(ctx, set, index, left, top)
  let y = top + titleHeight(metrics) + metrics.titleGap
  set.statements.forEach((statement, r) => {
    const lines = set.lines[r]!
    row(ctx, TTF_LETTERS[r]!, lines, statement, left, Math.round(y))
    if (r === set.fibIndex) ring(ctx, left, Math.round(y))
    y += statementHeight(lines.length, metrics) + metrics.rowGap
  })
  if (ctx.mode === 'answers') {
    const explanationTop = y - metrics.rowGap + metrics.explanationGap
    explanation(ctx, set, left + metrics.letterW, Math.round(explanationTop))
  }
}

/**
 * Lay the sets out in the body field.
 *
 * Leftover height is spread between the blocks (up to one extra gap each), and
 * the stack starts just under the header with any remaining white below it —
 * centring the whole stack left a hand's width of paper between the
 * instruction and the first set, which reads as a missing puzzle. Blocks are
 * capped in width and centred, so a letter page does not run statements six
 * inches across. A light rule halfway down each gap keeps two sets apart
 * without relying on colour.
 */
export function drawTtfPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: TtfPagePlan
    sets: readonly FittedTtfSet[]
    font: string
    tag: StudioTag
    mode: TtfDrawMode
  },
): void {
  const { field, plan, sets, font, tag, mode } = options
  if (sets.length === 0) return
  const ctx: DrawContext = { objects, plan, font, tag, mode }
  const { metrics } = plan

  const heights = sets.map((set) => blockHeight(ctx, set))
  const usable = Math.max(0, field.height - plan.bottomGuard)
  const content = heights.reduce((sum, h) => sum + h, 0)
  const gaps = sets.length - 1
  const slack = Math.max(0, usable - content - metrics.blockGap * gaps)
  const gap = metrics.blockGap + (gaps > 0 ? Math.min(slack / (gaps + 1), metrics.blockGap) : 0)
  const stack = content + gap * gaps
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)
  let top = Math.round(field.top + Math.min(Math.max(0, usable - stack), metrics.font * 0.8))

  sets.forEach((set, index) => {
    drawBlock(ctx, set, index, left, top)
    top += heights[index]!
    if (index < gaps) {
      objects.push(
        buildRect(
          {
            left,
            top: Math.round(top + gap / 2),
            width: plan.blockWidth,
            height: 1,
            fill: STUDIO_RULE_MEDIUM,
            stroke: 'transparent',
            strokeWidth: 0,
          },
          tag,
          'decoration',
        ),
      )
      top += gap
    }
  })
}
