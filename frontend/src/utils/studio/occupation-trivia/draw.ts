import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import type { Box } from '../studio-layout'
import { buildCircle, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { FABRIC_FONT_SIZE_MULT } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { OT_LETTERS } from './content'
import { blockHeightOf, type FittedOtQuestion } from './fit'
import {
  TEXT_LINE_HEIGHT,
  choiceRowHeight,
  choiceRows,
  choiceTextOffset,
  itemNumber,
  keyAnswerRowHeight,
  keyEntryHeight,
  keyTextOffset,
  textHeight,
  type OtKeyPlan,
  type OtQuizPlan,
} from './layout'

interface DrawContext {
  objects: StudioFabricObject[]
  font: string
  tag: StudioTag
}

function text(
  ctx: DrawContext,
  spec: {
    left: number
    top: number
    text: string
    width: number
    fontSize: number
    fontWeight?: number
    fontStyle?: 'italic'
    textAlign?: 'center' | 'right'
    lineHeight?: number
  },
  role: 'prompt' | 'answer' | 'decoration' = 'prompt',
): StudioFabricObject {
  return buildText(
    {
      ...spec,
      fontFamily: ctx.font,
      fontWeight: spec.fontWeight ?? 400,
      lineHeight: spec.lineHeight ?? TEXT_LINE_HEIGHT,
    },
    ctx.tag,
    role,
  )
}

/** A thin rule between two questions or answers; structure without colour. */
function rule(ctx: DrawContext, left: number, width: number, top: number) {
  ctx.objects.push(
    buildRect(
      {
        left,
        top: Math.round(top),
        width,
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
 * A letter in its ring — the place the reader marks. The ring is a drawn
 * outline, so it prints crisp in black and white, and the letter is centred
 * on its glyph, not its box.
 */
function ringedLetter(
  ctx: DrawContext,
  options: {
    letter: string
    left: number
    top: number
    ringR: number
    letterFont: number
    stroke: number
    role: 'prompt' | 'answer'
  },
) {
  const { letter, left, top, ringR, letterFont, stroke, role } = options
  const centerX = Math.round(left + ringR)
  const centerY = Math.round(top + ringR)
  ctx.objects.push(
    buildCircle(
      {
        left: centerX,
        top: centerY,
        radius: ringR,
        stroke: STUDIO_INK,
        strokeWidth: stroke,
        strokeUniform: true,
      },
      ctx.tag,
      role === 'answer' ? 'answer' : 'decoration',
    ),
    text(
      ctx,
      {
        left: centerX - ringR,
        top: Math.round(centerY - (letterFont * FABRIC_FONT_SIZE_MULT) / 2),
        text: letter,
        width: 2 * ringR,
        fontSize: letterFont,
        fontWeight: 700,
        textAlign: 'center',
        lineHeight: 1,
      },
      role,
    ),
  )
}

/** Leftover height shared between the gaps of a stack — at most one more `cap` each. */
function spread(usable: number, content: number, gaps: number, cap: number): number {
  if (gaps <= 0) return 0
  return Math.min(Math.max(0, usable - content) / (gaps + 1), cap)
}

/** Where a stack starts: just under the header, any remaining white below it. */
function firstTop(field: Box, usable: number, stack: number, font: number): number {
  return Math.round(field.top + Math.min(Math.max(0, usable - stack), font * 0.8))
}

/**
 * One question: its number, its wording, and its four ringed choices — two by
 * two or one under another, as it was fitted. The wording carries the
 * question's label so a later pack in the book can refuse the same fact.
 */
function question(ctx: DrawContext, plan: OtQuizPlan, q: FittedOtQuestion, left: number, top: number) {
  const m = plan.metrics
  const textLeft = left + m.numberW
  // `prompt`, not `decoration`: nothing on a quiz page is dropped by accident.
  ctx.objects.push(
    text(ctx, { left, top, text: itemNumber(q.index), width: m.numberW, fontSize: m.font, fontWeight: 700 }),
    {
      ...text(ctx, { left: textLeft, top, text: q.questionLines.join('\n'), width: plan.textWidth, fontSize: m.font }),
      data: { [STUDIO_CONTENT_LABEL_KEY]: q.label },
    },
  )

  const rows = choiceRows(q.arrangement, q.choiceLines.map((lines) => lines.length))
  const rowTops: number[] = []
  let rowTop = top + textHeight(q.questionLines.length, m) + m.choiceGap
  for (const lines of rows) {
    rowTops.push(Math.round(rowTop))
    rowTop += choiceRowHeight(lines, m) + m.choiceRowGap
  }

  q.choices.forEach((_, i) => {
    const grid = q.arrangement === 'grid'
    const x = grid ? textLeft + (i % 2) * (plan.cellWidth + m.gutter) : textLeft
    const y = rowTops[grid ? Math.floor(i / 2) : i]!
    ringedLetter(ctx, {
      letter: OT_LETTERS[i]!,
      left: x,
      top: y,
      ringR: m.ringR,
      letterFont: m.letterFont,
      stroke: STUDIO_STROKE_HAIRLINE,
      role: 'prompt',
    })
    ctx.objects.push(
      text(ctx, {
        left: x + m.ringW,
        top: y + choiceTextOffset(m),
        text: q.choiceLines[i]!.join('\n'),
        width: grid ? plan.gridChoiceWidth : plan.listChoiceWidth,
        fontSize: m.font,
      }),
    )
  })
}

/**
 * One quiz page: its questions stacked down the body, light rules between
 * them, and a small italic line at the foot when the pack continues overleaf.
 *
 * Leftover height is spread between the questions (up to one extra gap each)
 * and the stack starts just under the header. The block is capped in width and
 * centred, so a letter page does not run questions six inches across. The
 * quiz page holds no answer at all, not even hidden.
 */
export function drawOtQuizPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: OtQuizPlan
    questions: readonly FittedOtQuestion[]
    footer: string
    font: string
    tag: StudioTag
  },
): void {
  const { field, plan, questions, footer, font, tag } = options
  if (questions.length === 0) return
  const ctx: DrawContext = { objects, font, tag }
  const m = plan.metrics
  const heights = questions.map((q) => blockHeightOf(q, plan))
  const usable = Math.max(0, field.height - plan.bottomGuard - plan.footerHeight)
  const content = heights.reduce((sum, h) => sum + h, 0) + (questions.length - 1) * m.itemGap
  const gaps = questions.length - 1
  const gap = m.itemGap + spread(usable, content, gaps, m.itemGap)
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)
  let top = firstTop(field, usable, content + (gap - m.itemGap) * gaps, m.font)

  questions.forEach((q, i) => {
    question(ctx, plan, q, left, top)
    top += heights[i]!
    if (i < gaps) {
      rule(ctx, left, plan.blockWidth, top + gap / 2)
      top = Math.round(top + gap)
    }
  })

  if (footer) {
    objects.push(
      text(
        ctx,
        {
          left,
          top: Math.round(field.top + field.height - plan.bottomGuard - m.footerFont * FABRIC_FONT_SIZE_MULT),
          text: footer,
          width: plan.blockWidth,
          fontSize: m.footerFont,
          fontStyle: 'italic',
          textAlign: 'right',
          lineHeight: 1,
        },
        'decoration',
      ),
    )
  }
}

/**
 * The answer page: every question's number, its right letter ringed, the
 * answer exactly as the quiz printed it, and the note in italic beneath. All
 * of it is drawn from the fitted records the quiz pages were drawn from, so the
 * key can only ever show the pack's own answers.
 */
export function drawOtKeyPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    key: OtKeyPlan
    questions: readonly FittedOtQuestion[]
    font: string
    tag: StudioTag
  },
): void {
  const { field, key, questions, font, tag } = options
  if (questions.length === 0) return
  const ctx: DrawContext = { objects, font, tag }
  const m = key.metrics
  const heights = key.entries.map((entry) => keyEntryHeight(entry, m))
  const usable = Math.max(0, field.height - key.bottomGuard)
  const content = heights.reduce((sum, h) => sum + h, 0) + (heights.length - 1) * m.entryGap
  const gaps = heights.length - 1
  const gap = m.entryGap + spread(usable, content, gaps, m.entryGap)
  const left = Math.round(field.left + (field.width - key.blockWidth) / 2)
  const answerLeft = left + m.numberW + m.ringW
  let top = firstTop(field, usable, content + (gap - m.entryGap) * gaps, m.font)

  questions.forEach((q, i) => {
    const entry = key.entries[i]!
    const lineTop = top + keyTextOffset(m)
    objects.push(text(ctx, { left, top: lineTop, text: itemNumber(q.index), width: m.numberW, fontSize: m.font, fontWeight: 700 }))
    ringedLetter(ctx, {
      letter: q.letter,
      left: left + m.numberW,
      top,
      ringR: m.ringR,
      letterFont: m.letterFont,
      stroke: STUDIO_STROKE_BOLD,
      role: 'answer',
    })
    objects.push(
      text(
        ctx,
        { left: answerLeft, top: lineTop, text: entry.answerLines.join('\n'), width: key.answerWidth, fontSize: m.font, fontWeight: 700 },
        'answer',
      ),
    )
    if (entry.noteLines.length > 0) {
      objects.push(
        text(
          ctx,
          {
            left: left + m.numberW,
            top: Math.round(top + keyAnswerRowHeight(entry.answerLines.length, m) + m.noteGap),
            text: entry.noteLines.join('\n'),
            width: key.noteWidth,
            fontSize: m.noteFont,
            fontStyle: 'italic',
          },
          'answer',
        ),
      )
    }
    top += heights[i]!
    if (i < gaps) {
      rule(ctx, left, key.blockWidth, top + gap / 2)
      top = Math.round(top + gap)
    }
  })
}
