import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_INK_MUTED } from '@/constants/studio.constants'
import {
  buildGroup,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import { unionObjectBounds, type Box } from '../studio-layout'
import { fabricTextHeight, hugTextBoxWidth } from '../studio-text-metrics'
import {
  CLUE_LINE_HEIGHT,
  RULE_HEIGHT,
  RULE_RATIO,
  spacedLetters,
  spacedRunWidth,
  type AnagramMetrics,
  type AnagramPagePlan,
} from './layout'

/** One printed row: the letters as shuffled, the clue, and the answer beneath. */
export interface AnagramPuzzleItem {
  answer: string
  clue: string
  scrambled: string
}

/** Letter written on a slot, against slot pitch. Air either side of the glyph. */
const ANSWER_LETTER_RATIO = 0.74
/** Lift of a written letter off its rule, so the glyph does not sit on the ink. */
const ANSWER_LIFT_RATIO = 0.1

/**
 * One row of slots: a rule per letter, and the answer written above them.
 *
 * The answer is drawn either way. The first letter prints when the level gives
 * it away — it is part of the puzzle — and every other letter is a hidden
 * `answer`, which is what lets the editor reveal a single sheet in place
 * without regenerating it, and what makes the solution page a picture of this
 * same page with the words written in.
 */
function drawAnswerSlots(
  objects: StudioFabricObject[],
  options: {
    bandLeft: number
    ruleY: number
    item: AnagramPuzzleItem
    metrics: AnagramMetrics
    font: string
    tag: StudioTag
    firstLetterGiven: boolean
  },
): void {
  const { bandLeft, ruleY, item, metrics, font, tag, firstLetterGiven } = options
  const { slotW } = metrics
  const ruleW = Math.round(slotW * RULE_RATIO)
  const letterSize = Math.max(1, Math.round(slotW * ANSWER_LETTER_RATIO))
  const lift = Math.round(slotW * ANSWER_LIFT_RATIO)

  for (let i = 0; i < item.answer.length; i++) {
    const slotLeft = bandLeft + i * slotW
    const centerX = slotLeft + slotW / 2
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

    const letter = item.answer[i]!
    const isGiven = firstLetterGiven && i === 0
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
        isGiven ? 'prompt' : 'answer',
      ),
    )
  }
}

function buildRowGroup(options: {
  item: AnagramPuzzleItem
  clueLines: readonly string[]
  index: number
  /** Left edge of this row's column, where the row number sits. */
  left: number
  plan: AnagramPagePlan
  top: number
  font: string
  tag: StudioTag
  firstLetterGiven: boolean
}): StudioFabricObject | null {
  const { item, clueLines, index, left, plan, top, font, tag, firstLetterGiven } =
    options
  const { metrics, bandWidth, rowHeight } = plan
  const spec = { fontFamily: font }
  const bandLeft = left + metrics.indexW
  const parts: StudioFabricObject[] = []

  // The number sits on the scrambled letters rather than at the top of the row,
  // so a reader's eye runs "1. — letters" as one line and the clue reads as a
  // note underneath it.
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

  const scramble = spacedLetters(item.scrambled)
  parts.push(
    buildText(
      {
        left: bandLeft,
        top,
        text: scramble,
        width: spacedRunWidth(item.scrambled, metrics.scrambleFont, bandWidth, spec),
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

  // Pre-broken to the column and set in a box wider than the breaks, so Fabric
  // has no reason to re-wrap the clue into a line the row did not reserve.
  parts.push(
    buildText(
      {
        left: bandLeft,
        top: top + fabricTextHeight(1, metrics.scrambleFont) + metrics.clueGap,
        text: clueLines.join('\n'),
        width: bandWidth,
        fontFamily: font,
        fontSize: metrics.clueFont,
        fill: STUDIO_INK_MUTED,
        lineHeight: CLUE_LINE_HEIGHT,
      },
      tag,
      'prompt',
    ),
  )

  drawAnswerSlots(parts, {
    bandLeft,
    ruleY: top + rowHeight - RULE_HEIGHT,
    item,
    metrics,
    font,
    tag,
    firstLetterGiven,
  })

  const bounds = unionObjectBounds(parts)
  if (!bounds) return null
  return buildGroup(parts, bounds, tag, 'structure')
}

export interface DrawAnagramOptions {
  field: Box
  plan: AnagramPagePlan
  items: readonly AnagramPuzzleItem[]
  font: string
  tag: StudioTag
  firstLetterGiven: boolean
}

/**
 * Lay the rows out in the body column.
 *
 * Two things happen here that a plain top-left stack does not do.
 *
 * Leftover height is spread between the rows before the block is centred, up to
 * one gutter each. Centring alone leaves a page of six short words as a clump
 * in the middle with a hand's width of white above and below it; spreading
 * first is what makes a printed page look composed.
 *
 * And the columns are centred on their *drawn* width rather than filling the
 * band. A row is a block — letters, clue, slots — perhaps two thirds as wide as
 * the page measure, and anchoring that block to the left margin is what made
 * the old sheet look as though it had slipped off the page.
 *
 * Numbering runs down a column before moving across, so a solver reads 1, 2, 3
 * in the order a hand moves down the page.
 */
export function drawAnagramRows(
  objects: StudioFabricObject[],
  options: DrawAnagramOptions,
): void {
  const { field, plan, items, font, tag, firstLetterGiven } = options
  const { metrics, rowHeight, itemCount, columns, rowsPerColumn } = plan
  if (itemCount === 0) return

  const usableHeight = Math.max(0, field.height - plan.bottomGuard)
  const content = rowHeight * rowsPerColumn
  const gaps = Math.max(0, rowsPerColumn - 1)
  const slack = Math.max(0, usableHeight - content - metrics.gutter * gaps)
  const spread = gaps > 0 ? Math.min(slack / (gaps + 1), metrics.gutter) : 0
  const gutter = metrics.gutter + spread
  const stackH = content + gutter * gaps
  const stackTop = field.top + Math.max(0, (usableHeight - stackH) / 2)

  const totalWidth =
    plan.columnWidth * columns + plan.columnGutter * Math.max(0, columns - 1)
  const originX = field.left + Math.max(0, (field.width - totalWidth) / 2)

  for (let i = 0; i < itemCount; i++) {
    const item = items[i]
    if (!item) continue
    const column = Math.floor(i / rowsPerColumn)
    const rowInColumn = i % rowsPerColumn
    const group = buildRowGroup({
      item,
      clueLines: plan.rows[i]?.clueLines ?? [item.clue],
      index: i,
      left: originX + column * (plan.columnWidth + plan.columnGutter),
      plan,
      top: stackTop + rowInColumn * (rowHeight + gutter),
      font,
      tag,
      firstLetterGiven,
    })
    if (group) objects.push(group)
  }
}
