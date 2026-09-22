import type { StudioFabricObject } from '@/types/studio-template.types'
import type { MissingVowelsItem } from '@/types/studio-missing-vowels.types'
import { STUDIO_INK, STUDIO_INK_MUTED } from '@/constants/studio.constants'
import {
  buildGroup,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import { unionObjectBounds, type Box } from '../studio-layout'
import { hugTextBoxWidth } from '../studio-text-metrics'
import { toSlots } from './mask'
import {
  CLUE_LINE_HEIGHT,
  RULE_HEIGHT,
  RULE_RATIO,
  type MissingVowelsMetrics,
  type MissingVowelsPagePlan,
} from './layout'

/**
 * One row of slots: the consonants printed, a rule under every missing vowel,
 * and the vowel itself drawn in place but hidden.
 *
 * Drawing the answer into the slot rather than onto a separate line is what
 * makes the two pages agree. The puzzle page and the solution page are one
 * layout: the key is this page with its blanks filled, at the exact positions
 * the blanks were, so a reader checking an answer is looking at the row they
 * just solved. It is also what lets the editor reveal a single sheet in place
 * without regenerating it.
 *
 * Every glyph — printed or written — sits on one baseline, lifted just off the
 * rules. A consonant floating at a different height from the vowel beside it is
 * the difference between a word and a ransom note.
 */
function drawSlots(
  objects: StudioFabricObject[],
  options: {
    bandLeft: number
    baselineY: number
    answer: string
    metrics: MissingVowelsMetrics
    font: string
    tag: StudioTag
  },
): void {
  const { bandLeft, baselineY, answer, metrics, font, tag } = options
  const { slotW, wordGapW, letterFont, letterLift } = metrics
  const ruleW = Math.round(slotW * RULE_RATIO)
  const spec = { fontFamily: font }
  let x = bandLeft

  for (const slot of toSlots(answer)) {
    // A word break is air. No rule under it, or a reader counts it as a blank
    // and looks for a letter that was never removed.
    if (slot.gap) {
      x += wordGapW
      continue
    }
    const centerX = x + slotW / 2

    if (slot.blank) {
      objects.push(
        buildRect(
          {
            left: Math.round(centerX - ruleW / 2),
            top: baselineY,
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

    objects.push(
      buildText(
        {
          left: centerX,
          top: baselineY - letterLift,
          text: slot.letter,
          width: hugTextBoxWidth(slot.letter, letterFont, slotW, spec),
          fontFamily: font,
          fontSize: letterFont,
          fill: STUDIO_INK,
          textAlign: 'center',
          originX: 'center',
          originY: 'bottom',
          lineHeight: 1,
        },
        tag,
        // Consonants are the puzzle; the vowels are the answer and stay hidden
        // until the key reveals them in their own slots.
        slot.blank ? 'answer' : 'prompt',
      ),
    )
    x += slotW
  }
}

function buildRowGroup(options: {
  item: MissingVowelsItem
  clueLines: readonly string[]
  index: number
  /** Left edge of this row's column, where the row number sits. */
  left: number
  plan: MissingVowelsPagePlan
  top: number
  font: string
  tag: StudioTag
}): StudioFabricObject | null {
  const { item, clueLines, index, left, plan, top, font, tag } = options
  const { metrics, bandWidth } = plan
  const spec = { fontFamily: font }
  const bandLeft = left + metrics.indexW
  const baselineY = top + metrics.writeRoom
  const parts: StudioFabricObject[] = []

  // The number sits on the letter row rather than at the top of the block, so a
  // reader's eye runs "1. — letters" as one line and the clue reads as a note
  // underneath it.
  const label = `${index + 1}.`
  parts.push(
    buildText(
      {
        left,
        top: baselineY - metrics.letterFont / 2,
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

  drawSlots(parts, {
    bandLeft,
    baselineY,
    answer: item.answer,
    metrics,
    font,
    tag,
  })

  // Pre-broken to the column and set in a box wider than the breaks, so Fabric
  // has no reason to re-wrap the clue into a line the row did not reserve.
  parts.push(
    buildText(
      {
        left: bandLeft,
        top: baselineY + RULE_HEIGHT + metrics.clueGap,
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

  const bounds = unionObjectBounds(parts)
  if (!bounds) return null
  return buildGroup(parts, bounds, tag, 'structure')
}

export interface DrawMissingVowelsOptions {
  field: Box
  plan: MissingVowelsPagePlan
  items: readonly MissingVowelsItem[]
  font: string
  tag: StudioTag
}

/**
 * Lay the rows out in the body column.
 *
 * Two things happen here that a plain top-left stack does not do.
 *
 * Leftover height is spread between the rows before the block is centred, up to
 * one gutter each. Centring alone leaves a page of six short rows as a clump in
 * the middle with a hand's width of white above and below it; spreading first
 * is what makes a printed page look composed.
 *
 * And the columns are centred on their *drawn* width rather than filling the
 * band. A row is a block — number, letters, clue — often only two thirds as
 * wide as the page measure, and anchoring that block to the left margin is what
 * makes a sheet look as though it slipped off the page.
 *
 * Numbering runs down a column before moving across, so a solver reads 1, 2, 3
 * in the order a hand moves down the page.
 */
export function drawMissingVowelsRows(
  objects: StudioFabricObject[],
  options: DrawMissingVowelsOptions,
): void {
  const { field, plan, items, font, tag } = options
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
    })
    if (group) objects.push(group)
  }
}
