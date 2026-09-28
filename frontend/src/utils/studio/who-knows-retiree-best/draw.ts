import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_RULE_MEDIUM, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { buildGroup, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { toNonBreakingSpaces, unionObjectBounds, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import {
  PLAYER_LABEL,
  QUESTION_LINE_HEIGHT,
  SCOREBOARD_SCORE,
  SCOREBOARD_TITLE,
  SCORE_LABEL,
  SCORE_LINE_MIN,
  SCORE_TAIL,
  WINNER_LINE_MIN,
  WINNER_SHORT,
  BASELINE,
  answerLines,
  baselineToTop,
  boldSpec,
  plainSpec,
  questionTextHeight,
  rowBaseline,
  rowLineY,
  winnerLabel,
  type FittedWkbQuestion,
  type WkbPage,
  type WkbPlan,
  type WkbSheetKind,
} from './layout'

/** Stamped on every question number, with the question's number, so a block is traceable in the editor. */
export const WKB_QUESTION_KEY = 'whoKnowsBestQuestion'
/** Stamped alongside it: which sheet the block is on ("player-1"…, "answers"). */
export const WKB_SHEET_KEY = 'whoKnowsBestSheet'
/** Stamped on every tick box. */
export const WKB_BOX_KEY = 'whoKnowsBestBox'

interface DrawContext {
  objects: StudioFabricObject[]
  plan: WkbPlan
  font: string
  tag: StudioTag
  left: number
  sheet: string
  kind: WkbSheetKind
  who: string
}

/**
 * Draws whatever `draw` adds into a group of its own, pushed onto `ctx.objects`,
 * so a seller drags or deletes a question, a name line or the scoreboard whole
 * in the editor. A lone part is pushed as it is: a group of one only adds a
 * click. Nothing drawn, nothing pushed.
 */
function grouped(ctx: DrawContext, draw: (inner: DrawContext) => void) {
  const parts: StudioFabricObject[] = []
  draw({ ...ctx, objects: parts })
  if (parts.length === 1) {
    ctx.objects.push(parts[0]!)
    return
  }
  const bounds = unionObjectBounds(parts)
  if (bounds) ctx.objects.push(buildGroup(parts, bounds, ctx.tag, 'structure'))
}

/** A writing line: mid grey, so handwriting stands out on it. */
function rule(ctx: DrawContext, left: number, top: number, width: number) {
  ctx.objects.push(
    buildRect(
      {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(width),
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
 * A single line of text whose baseline sits at `baseline`. Spaces are locked
 * (as in the page title), so Fabric never breaks "Score:" from its line.
 */
function label(
  ctx: DrawContext,
  raw: string,
  left: number,
  baseline: number,
  options: { size: number; bold?: boolean; maxWidth: number },
) {
  const spec = options.bold ? boldSpec(ctx.font) : plainSpec(ctx.font)
  const text = toNonBreakingSpaces(raw)
  const width = hugTextBoxWidth(text, options.size, options.maxWidth, spec)
  ctx.objects.push(
    buildText(
      {
        left: Math.round(left),
        top: Math.round(baselineToTop(baseline, options.size)),
        text,
        width,
        fontFamily: ctx.font,
        fontSize: options.size,
        fontWeight: options.bold ? 700 : undefined,
        lineHeight: 1,
      },
      ctx.tag,
      'decoration',
    ),
  )
  return width
}

const labelWidth = (ctx: DrawContext, text: string, bold = false) =>
  hugTextBoxWidth(toNonBreakingSpaces(text), ctx.plan.metrics.font, Infinity, bold ? boldSpec(ctx.font) : plainSpec(ctx.font))

/** "Player: ____________", as one group: the label moves with its line. */
function drawName(ctx: DrawContext, top: number) {
  const { metrics, nameLineW, blockWidth } = ctx.plan
  grouped(ctx, (inner) => {
    const width = label(inner, PLAYER_LABEL, inner.left, rowBaseline(top, metrics), {
      size: metrics.font,
      bold: true,
      maxWidth: blockWidth,
    })
    rule(inner, inner.left + width + metrics.labelGap, rowLineY(top, metrics), nameLineW)
  })
}

/** "Score: ______ out of 12", where the player adds up their ticks; one group. */
function drawScore(ctx: DrawContext, top: number) {
  const { metrics, blockWidth } = ctx.plan
  const baseline = rowBaseline(top, metrics)
  grouped(ctx, (inner) => {
    const width = label(inner, SCORE_LABEL, inner.left, baseline, { size: metrics.font, bold: true, maxWidth: blockWidth })
    const lineLeft = inner.left + width + metrics.labelGap
    rule(inner, lineLeft, rowLineY(top, metrics), SCORE_LINE_MIN)
    label(inner, SCORE_TAIL, lineLeft + SCORE_LINE_MIN + metrics.labelGap, baseline, {
      size: metrics.font,
      maxWidth: blockWidth,
    })
  })
}

/**
 * One question: its number, the question (stamped so later runs can avoid
 * it), then the room its answer needs, and on a player's sheet a box to tick
 * beside the first answer line. Everything is set from the block's own top,
 * so no part of a question can land on another page.
 *
 * The question is one group, so it drags and deletes whole in the editor;
 * inside it the answer lines and the tick box are a group of their own, the
 * part a player writes and marks, so ungrouping a question never scatters them.
 */
function drawQuestion(ctx: DrawContext, question: FittedWkbQuestion, top: number) {
  const { metrics, numW, textWidth, boxLineRoom, lineRoom, shortLine } = ctx.plan
  const textLeft = ctx.left + numW
  grouped(ctx, (block) => {
    block.objects.push({
      ...buildText(
        {
          left: block.left,
          top: Math.round(top),
          text: `${question.number}.`,
          width: numW - metrics.numGap,
          fontFamily: block.font,
          fontSize: metrics.font,
          fontWeight: 700,
          lineHeight: QUESTION_LINE_HEIGHT,
          textAlign: 'right',
        },
        block.tag,
        'decoration',
      ),
      data: { [WKB_QUESTION_KEY]: question.number, [WKB_SHEET_KEY]: block.sheet },
    })
    // Pre-broken and set in a box exactly the measure it was broken to, so
    // Fabric has no reason to re-wrap it into a line the block did not reserve.
    block.objects.push({
      ...buildText(
        {
          left: textLeft,
          top: Math.round(top),
          text: question.lines.join('\n'),
          width: textWidth,
          fontFamily: block.font,
          fontSize: metrics.font,
          lineHeight: QUESTION_LINE_HEIGHT,
        },
        block.tag,
        'prompt',
      ),
      data: { [STUDIO_CONTENT_LABEL_KEY]: question.question },
    })

    grouped(block, (answer) => {
      const withBox = answer.kind === 'player'
      const full = withBox ? boxLineRoom : lineRoom
      const firstLine = top + questionTextHeight(answer.plan, question.lines.length) + metrics.pitch
      const count = answerLines(question.answer)
      for (let line = 0; line < count; line++) {
        const width = question.answer === 'word' ? shortLine : full
        rule(answer, textLeft, firstLine + line * metrics.pitch, width)
      }
      if (withBox) {
        const box = buildRect(
          {
            left: Math.round(textLeft + textWidth - metrics.box),
            top: Math.round(firstLine - metrics.box),
            width: metrics.box,
            height: metrics.box,
            rx: 2,
            ry: 2,
            stroke: STUDIO_INK,
            strokeWidth: STUDIO_STROKE_NORMAL,
          },
          answer.tag,
          'structure',
        )
        answer.objects.push({ ...box, data: { [WKB_BOX_KEY]: question.number } })
      }
    })
  })
}

/**
 * The scoreboard: a framed box with a row per player (a line for the name,
 * then "Score: ___") and a last row naming the winner — "Who knows Linda best? ____",
 * shortened to "Top scorer:" where the long form would crowd its line.
 *
 * The whole board is one group, and each row inside it a group of its own, so
 * a seller can drop a player's row without picking its three pieces apart.
 */
function drawScoreboard(ctx: DrawContext, top: number, height: number, players: number) {
  const { metrics, blockWidth } = ctx.plan
  grouped(ctx, (board) => {
    board.objects.push(
      buildRect(
        {
          left: board.left,
          top: Math.round(top),
          width: blockWidth,
          height: Math.round(height),
          rx: metrics.radius,
          ry: metrics.radius,
          stroke: STUDIO_INK,
          strokeWidth: STUDIO_STROKE_NORMAL,
        },
        board.tag,
        'structure',
      ),
    )
    const inner = board.left + metrics.pad
    const innerWidth = blockWidth - 2 * metrics.pad
    const titleTop = top + metrics.pad
    label(board, SCOREBOARD_TITLE, inner, titleTop + metrics.headFont * BASELINE, {
      size: metrics.headFont,
      bold: true,
      maxWidth: innerWidth,
    })

    const scoreW = labelWidth(board, SCOREBOARD_SCORE)
    const scoreLeft = inner + innerWidth - SCORE_LINE_MIN - metrics.labelGap - scoreW
    let rowTop = titleTop + fabricTextHeight(1, metrics.headFont)
    for (let player = 0; player < players; player++) {
      const baseline = rowBaseline(rowTop, metrics)
      const lineY = rowLineY(rowTop, metrics)
      grouped(board, (row) => {
        rule(row, inner, lineY, scoreLeft - metrics.font - inner)
        label(row, SCOREBOARD_SCORE, scoreLeft, baseline, { size: metrics.font, maxWidth: innerWidth })
        rule(row, scoreLeft + scoreW + metrics.labelGap, lineY, SCORE_LINE_MIN)
      })
      rowTop += metrics.rowH
    }
    const long = winnerLabel(board.who)
    const text = innerWidth - labelWidth(board, long, true) - metrics.labelGap >= WINNER_LINE_MIN ? long : WINNER_SHORT
    grouped(board, (row) => {
      const width = label(row, text, inner, rowBaseline(rowTop, metrics), {
        size: metrics.font,
        bold: true,
        maxWidth: innerWidth,
      })
      const lineLeft = inner + width + metrics.labelGap
      rule(row, lineLeft, rowLineY(rowTop, metrics), inner + innerWidth - lineLeft)
    })
  })
}

/**
 * Lay one page out in its body field, top down, exactly as the pagination
 * measured it: the same block shapes on every sheet, centred in the column.
 */
export function drawWkbPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: WkbPlan
    page: WkbPage
    font: string
    tag: StudioTag
    sheet: string
    kind: WkbSheetKind
    who: string
  },
): void {
  const { field, plan, page, font, tag, sheet, kind, who } = options
  const ctx: DrawContext = {
    objects,
    plan,
    font,
    tag,
    sheet,
    kind,
    who,
    left: Math.round(field.left + (field.width - plan.blockWidth) / 2),
  }
  for (const block of page.blocks) {
    const top = field.top + block.top
    if (block.kind === 'name') drawName(ctx, top)
    else if (block.kind === 'question') drawQuestion(ctx, block.question, top)
    else if (block.kind === 'score') drawScore(ctx, top)
    else drawScoreboard(ctx, top, block.height, block.players)
  }
}
