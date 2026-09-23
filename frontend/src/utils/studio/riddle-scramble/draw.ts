import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import {
  buildGroup,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import { toNonBreakingSpaces, unionObjectBounds, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth } from '../studio-text-metrics'
import type { RiddleScrambleRow } from './build'
import {
  answerNumberGap,
  RIDDLE_LINE_HEIGHT,
  RULE_HEIGHT,
  RULE_RATIO,
  spacedLetters,
  spacedRunWidth,
  type RiddleScrambleMetrics,
  type RiddleScramblePagePlan,
} from './layout'

/** Letter written on a slot, against slot pitch. Air either side of the glyph. */
const ANSWER_LETTER_RATIO = 0.7
/** Lift of a written letter off its rule, so the glyph does not sit on the ink. */
const ANSWER_LIFT_RATIO = 0.08
/** The marked box is a shade wider than a rule, so it reads as a container. */
const MARK_BOX_SHARE = 0.92
/** Rounded corners — a hard square reads as a form field, not a puzzle. */
const MARK_BOX_RADIUS_RATIO = 0.12

/**
 * One row of slots: a rule per letter, and the word written above them.
 *
 * One slot is a box instead of a rule. That box is the whole mechanism of the
 * page — the letter a solver writes in it is one letter of the riddle's answer
 * — so it is drawn as a container a letter goes *into* rather than as emphasis
 * on a letter that happens to be there.
 *
 * The word is drawn either way: every letter is a hidden `answer`, which is
 * what lets the editor reveal a single sheet in place without regenerating it,
 * and what makes the solution page a picture of this same page with the words
 * written in.
 */
function drawWordSlots(
  objects: StudioFabricObject[],
  options: {
    bandLeft: number
    ruleY: number
    row: RiddleScrambleRow
    metrics: RiddleScrambleMetrics
    font: string
    tag: StudioTag
  },
): void {
  const { bandLeft, ruleY, row, metrics, font, tag } = options
  const { slotW, writeRoom } = metrics
  const ruleW = Math.round(slotW * RULE_RATIO)
  const boxW = Math.round(slotW * MARK_BOX_SHARE)
  const letterSize = Math.max(1, Math.round(slotW * ANSWER_LETTER_RATIO))
  const lift = Math.round(slotW * ANSWER_LIFT_RATIO)

  for (let i = 0; i < row.word.length; i++) {
    const slotLeft = bandLeft + i * slotW
    const centerX = slotLeft + slotW / 2
    const marked = i === row.markIndex

    if (marked) {
      objects.push(
        buildRect(
          {
            left: Math.round(centerX - boxW / 2),
            top: ruleY + RULE_HEIGHT - writeRoom,
            width: boxW,
            height: writeRoom,
            rx: Math.round(slotW * MARK_BOX_RADIUS_RATIO),
            ry: Math.round(slotW * MARK_BOX_RADIUS_RATIO),
            fill: 'transparent',
            stroke: STUDIO_INK,
            strokeWidth: STUDIO_STROKE_HAIRLINE,
          },
          tag,
          'structure',
        ),
      )
    } else {
      objects.push(
        buildRect(
          {
            left: Math.round(centerX - ruleW / 2),
            top: ruleY,
            width: ruleW,
            height: RULE_HEIGHT,
            fill: STUDIO_INK,
            stroke: 'transparent',
            strokeWidth: 0,
          },
          tag,
          'structure',
        ),
      )
    }

    const letter = row.word[i]!
    objects.push(
      buildText(
        {
          left: centerX,
          top: ruleY - lift,
          text: letter,
          width: hugTextBoxWidth(letter, letterSize, slotW, { fontFamily: font }),
          fontFamily: font,
          fontSize: letterSize,
          fill: STUDIO_INK,
          textAlign: 'center',
          originX: 'center',
          originY: 'bottom',
          lineHeight: 1,
        },
        tag,
        'answer',
      ),
    )
  }
}

function buildWordRowGroup(options: {
  row: RiddleScrambleRow
  clue: string
  clueWidth: number
  index: number
  /** Left edge of the column, where the row number sits. */
  left: number
  plan: RiddleScramblePagePlan
  top: number
  font: string
  tag: StudioTag
}): StudioFabricObject | null {
  const { row, clue, clueWidth, index, left, plan, top, font, tag } = options
  const { metrics, bandWidth, rowHeight } = plan
  const spec = { fontFamily: font }
  const bandLeft = left + metrics.indexW
  const parts: StudioFabricObject[] = []

  // The number sits on the scrambled letters rather than at the top of the row,
  // so a reader's eye runs "1. — letters" as one line and the clue reads as a
  // note underneath it. It is also the number the riddle's answer boxes carry,
  // which is how the page explains its own chain without a second sentence.
  const label = `${index + 1}.`
  parts.push(
    buildText(
      {
        left,
        top: top + fabricTextHeight(1, metrics.scrambleFont) / 2,
        text: label,
        width: hugTextBoxWidth(label, metrics.indexFont, metrics.indexW, spec),
        fontFamily: font,
        fontSize: metrics.indexFont,
        fill: STUDIO_INK_MUTED,
        originY: 'center',
        lineHeight: 1,
      },
      tag,
      'prompt',
    ),
  )

  const scramble = spacedLetters(row.scrambled)
  parts.push(
    buildText(
      {
        left: bandLeft,
        top,
        text: scramble,
        width: spacedRunWidth(row.scrambled, metrics.scrambleFont, bandWidth, spec),
        fontFamily: font,
        fontSize: metrics.scrambleFont,
        fill: STUDIO_INK,
        fontWeight: 700,
        lineHeight: 1,
      },
      tag,
      'prompt',
    ),
  )

  // Spaces are locked and the box is measured from the run, so Fabric has no
  // reason to break a clue onto a second line the row did not reserve.
  parts.push(
    buildText(
      {
        left: bandLeft,
        top: top + fabricTextHeight(1, metrics.scrambleFont) + metrics.clueGap,
        text: clue,
        width: clueWidth,
        fontFamily: font,
        fontSize: metrics.clueFont,
        fill: STUDIO_INK_MUTED,
        lineHeight: 1,
      },
      tag,
      'prompt',
    ),
  )

  drawWordSlots(parts, {
    bandLeft,
    ruleY: top + rowHeight - RULE_HEIGHT,
    row,
    metrics,
    font,
    tag,
  })

  const bounds = unionObjectBounds(parts)
  if (!bounds) return null
  return buildGroup(parts, bounds, tag, 'structure')
}

/**
 * The numbered boxes the riddle's answer is written into, as one block.
 *
 * Box 3 carries a small 3 because the letter that belongs in it came out of
 * word 3. The squares and those numbers are one group so a nudge moves the
 * strip together; the letters sit in the same group so a reveal stays seated
 * in the box it was written for.
 */
function buildAnswerFillGroup(options: {
  originX: number
  top: number
  answer: string
  metrics: RiddleScrambleMetrics
  font: string
  tag: StudioTag
}): StudioFabricObject | null {
  const { originX, top, answer, metrics, font, tag } = options
  const spec = { fontFamily: font }
  const letterSize = Math.max(1, Math.round(metrics.answerPitch * ANSWER_LETTER_RATIO))
  const numberTop = top + metrics.answerBoxH + answerNumberGap(metrics)
  const radius = Math.round(metrics.answerPitch * MARK_BOX_RADIUS_RATIO)
  const parts: StudioFabricObject[] = []

  for (let i = 0; i < answer.length; i++) {
    const slotCenter = originX + i * metrics.answerPitch + metrics.answerPitch / 2
    parts.push(
      buildRect(
        {
          left: Math.round(slotCenter - metrics.answerBoxW / 2),
          top,
          width: metrics.answerBoxW,
          height: metrics.answerBoxH,
          rx: radius,
          ry: radius,
          fill: 'transparent',
          stroke: STUDIO_INK,
          strokeWidth: STUDIO_STROKE_HAIRLINE,
        },
        tag,
        'structure',
      ),
    )

    const letter = answer[i]!
    parts.push(
      buildText(
        {
          left: slotCenter,
          top: top + metrics.answerBoxH / 2,
          text: letter,
          width: hugTextBoxWidth(letter, letterSize, metrics.answerBoxW, spec),
          fontFamily: font,
          fontSize: letterSize,
          fill: STUDIO_INK,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          lineHeight: 1,
        },
        tag,
        'answer',
      ),
    )

    const label = `${i + 1}`
    parts.push(
      buildText(
        {
          left: slotCenter,
          top: numberTop,
          text: label,
          width: hugTextBoxWidth(label, metrics.answerNumberFont, metrics.answerPitch, spec),
          fontFamily: font,
          fontSize: metrics.answerNumberFont,
          fill: STUDIO_INK_MUTED,
          textAlign: 'center',
          originX: 'center',
          lineHeight: 1,
        },
        tag,
        'prompt',
      ),
    )
  }

  const bounds = unionObjectBounds(parts)
  if (!bounds) return null
  return buildGroup(parts, bounds, tag, 'structure')
}

/**
 * The riddle, and the numbered boxes its answer is written into.
 *
 * The boxes themselves are one group.
 */
function drawRiddleBand(options: {
  area: Box
  plan: RiddleScramblePagePlan
  answer: string
  font: string
  tag: StudioTag
}): StudioFabricObject[] {
  const { area, plan, answer, font, tag } = options
  const { metrics } = plan
  const band = plan.riddle
  const objects: StudioFabricObject[] = []
  const centerX = area.left + area.width / 2

  let cursor = area.top + band.leadGap

  // Pre-broken to the measure and set in a box of that measure — not hugged to
  // the glyph run, which throws away the wrap pad and lets Fabric re-break the
  // last word onto a third line the band never reserved.
  const text = band.lines.map(toNonBreakingSpaces).join('\n')
  objects.push(
    buildText(
      {
        left: centerX,
        top: cursor,
        text,
        width: band.measure,
        fontFamily: font,
        fontSize: metrics.riddleFont,
        fill: STUDIO_INK,
        textAlign: 'center',
        originX: 'center',
        lineHeight: RIDDLE_LINE_HEIGHT,
      },
      tag,
      'prompt',
    ),
  )
  cursor += band.riddleHeight + band.riddleGap

  const fill = buildAnswerFillGroup({
    originX: centerX - band.answerWidth / 2,
    top: cursor,
    answer,
    metrics,
    font,
    tag,
  })
  if (fill) objects.push(fill)

  return objects
}

export interface DrawRiddleScrambleOptions {
  field: Box
  plan: RiddleScramblePagePlan
  rows: readonly RiddleScrambleRow[]
  answer: string
  font: string
  tag: StudioTag
}

/**
 * Lay the page out in the body column: words above, riddle below.
 *
 * Leftover height is spread between the word rows before the block is centred,
 * up to one gutter each. Centring alone leaves a page of four short words as a
 * clump in the middle with a hand's width of white above and below it;
 * spreading first is what makes a printed page look composed. The riddle band
 * keeps its own internal spacing either way — it is one object to the eye, and
 * stretching the gap between a question and the boxes that answer it is the
 * one place on this page where air reads as a mistake.
 *
 * The word rows are centred on their *drawn* width rather than filling the
 * column. A row is a block — letters, clue, slots — often two thirds as wide
 * as the page measure, and anchoring that block to the left margin is what
 * makes a sheet look as though it slipped off the page.
 */
export function drawRiddleScramblePage(
  objects: StudioFabricObject[],
  options: DrawRiddleScrambleOptions,
): void {
  const { field, plan, rows, answer, font, tag } = options
  const { metrics, rowHeight, rowCount } = plan
  if (rowCount === 0) return

  const usableHeight = Math.max(0, field.height - plan.bottomGuard)
  const content = rowHeight * rowCount + plan.riddle.height
  const gaps = Math.max(0, rowCount - 1)
  const slack = Math.max(0, usableHeight - content - metrics.gutter * gaps)
  const spread = gaps > 0 ? Math.min(slack / (gaps + 1), metrics.gutter) : 0
  const gutter = metrics.gutter + spread
  const stackH = content + gutter * gaps
  const stackTop = field.top + Math.max(0, (usableHeight - stackH) / 2)

  const originX = field.left + Math.max(0, (field.width - plan.columnWidth) / 2)

  for (let i = 0; i < rowCount; i++) {
    const row = rows[i]
    const rowPlan = plan.rows[i]
    if (!row || !rowPlan) continue
    const group = buildWordRowGroup({
      row,
      clue: rowPlan.clue,
      clueWidth: rowPlan.clueWidth,
      index: i,
      left: originX,
      plan,
      top: stackTop + i * (rowHeight + gutter),
      font,
      tag,
    })
    if (group) objects.push(group)
  }

  objects.push(
    ...drawRiddleBand({
      area: {
        ...field,
        top: stackTop + rowCount * rowHeight + gutter * gaps,
        height: plan.riddle.height,
      },
      plan,
      answer,
      font,
      tag,
    }),
  )
}
