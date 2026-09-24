import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_INK_MUTED, STUDIO_RULE_MEDIUM, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import type { Box } from '../studio-layout'
import { buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { fabricTextHeight, hugTextBoxWidth } from '../studio-text-metrics'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { OR_TEMPLATE_KEY, type PlacedRelic } from './content'
import {
  ALIAS_GAP,
  ALIAS_LINE_HEIGHT,
  ANSWER_INSET,
  ANSWER_LIFT,
  ANSWER_LINE_HEIGHT,
  BANK_FONT,
  BANK_GAP,
  BANK_LABEL_FONT,
  BANK_LINE_HEIGHT,
  BANK_PAD,
  CARD_PAD,
  CARD_RADIUS,
  NUMBER_FONT,
  PICTURE_TO_LINE,
  RULE_HEIGHT,
  breakAliases,
  breakAnswer,
  lineWidth,
  numberSpec,
  orColGap,
  orGridWidth,
  orRowGap,
  bankBlockHeight,
  packBank,
  type OrPagePlan,
} from './layout'
import { buildRelicPicture } from './picture'
import { orNumberLabel, type OrHouseStyle } from './style'
import { relicArtDrawing, variantKey } from './variants'

/**
 * `puzzle` — numbered pictures, each over an empty writing line, and the word
 * bank when the level has one.
 * `answers` — the same pictures under the same numbers, each answer written on
 * its line and its other accepted names beneath it, all hidden until the
 * answer page reveals them.
 */
export type OrDrawMode = 'puzzle' | 'answers'


/** Reduces a picture to one token when a page is fingerprinted for uniqueness: which drawing, which version. */
export const relicCanonicalKey = (drawing: string, version: string) => `${OR_TEMPLATE_KEY}:picture:${drawing}:${version}`

export interface OrCardBox {
  left: number
  top: number
  width: number
  height: number
}

/** Where every card sits, row by row, and where the word bank starts (puzzle page only). */
export function orCardBoxes(
  field: Box,
  plan: OrPagePlan,
  mode: OrDrawMode,
  hasBank: boolean,
): { cards: OrCardBox[]; bankTop: number } {
  const cardHeight = mode === 'answers' ? plan.answerCardHeight : plan.cardHeight
  const bank = mode === 'puzzle' && hasBank ? BANK_GAP + plan.bankHeight : 0
  const grid = plan.rows * cardHeight + (plan.rows - 1) * orRowGap
  const slack = Math.max(0, field.height - grid - bank)
  // Spare height opens the rows a little, then the block sits just above centre.
  const extra = plan.rows > 1 ? Math.min(slack / (plan.rows + 1), orRowGap) : 0
  const rowGap = orRowGap + extra
  const used = grid + extra * (plan.rows - 1) + bank
  const top = Math.round(field.top + Math.max(0, field.height - used) * 0.4)
  const width = orGridWidth(plan)
  const left = Math.round(field.left + (field.width - width) / 2)

  const cards: OrCardBox[] = []
  for (let r = 0; r < plan.rows; r++) {
    for (let c = 0; c < plan.columns; c++) {
      cards.push({
        left: left + c * (plan.cardWidth + orColGap),
        top: Math.round(top + r * (cardHeight + rowGap)),
        width: plan.cardWidth,
        height: cardHeight,
      })
    }
  }
  const gridBottom = top + plan.rows * cardHeight + (plan.rows - 1) * rowGap
  return { cards, bankTop: Math.round(gridBottom + BANK_GAP) }
}

/** Where the writing line of a card sits. */
export const cardRuleY = (card: OrCardBox, plan: OrPagePlan) =>
  card.top + CARD_PAD + plan.pictureHeight + PICTURE_TO_LINE + plan.writeRoom

function drawCard(
  objects: StudioFabricObject[],
  options: {
    item: PlacedRelic
    index: number
    card: OrCardBox
    plan: OrPagePlan
    font: string
    tag: StudioTag
    mode: OrDrawMode
    style: OrHouseStyle
  },
): void {
  const { item, index, card, plan, font, tag, mode, style } = options
  const { relic, drawing, variant } = item
  const version = variantKey(drawing, variant)
  const radius = style.frame === 'square' ? 0 : CARD_RADIUS

  objects.push(
    buildRect(
      {
        left: card.left,
        top: card.top,
        width: card.width,
        height: card.height,
        rx: radius,
        ry: radius,
        stroke: STUDIO_RULE_MEDIUM,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
      },
      tag,
      'structure',
    ),
  )

  objects.push(
    buildRelicPicture(
      relicArtDrawing(drawing, variant),
      {
        centerX: card.left + CARD_PAD + plan.pictureWidth / 2,
        centerY: card.top + CARD_PAD + plan.pictureHeight / 2,
        boxWidth: plan.pictureWidth,
        boxHeight: plan.pictureHeight,
        stroke: plan.stroke,
        fineStroke: plan.fineStroke,
      },
      tag,
      {
        // The object's identity, so a later page in the book can refuse it.
        [STUDIO_CONTENT_LABEL_KEY]: relic.id,
        // One token for the uniqueness fingerprint, not every curve in it.
        studioCanonicalKey: relicCanonicalKey(drawing, version),
        relicDrawing: drawing,
        relicVersion: version,
      },
    ),
  )

  const ruleY = cardRuleY(card, plan)
  const numberLeft = card.left + CARD_PAD
  const ruleLeft = numberLeft + plan.numberWidth
  const width = lineWidth(plan)
  const label = orNumberLabel(style.number, index)

  objects.push(
    buildText(
      {
        left: numberLeft,
        top: ruleY - ANSWER_LIFT,
        text: label,
        width: hugTextBoxWidth(label, NUMBER_FONT, plan.numberWidth, numberSpec(font)),
        fontFamily: font,
        fontSize: NUMBER_FONT,
        fontWeight: 700,
        originY: 'bottom',
        lineHeight: 1,
      },
      tag,
      // Not `decoration`: the numbers must survive onto the answer page.
      'prompt',
    ),
    buildRect(
      {
        left: ruleLeft,
        top: ruleY,
        width,
        height: RULE_HEIGHT,
        fill: STUDIO_INK,
        stroke: 'transparent',
        strokeWidth: 0,
      },
      tag,
      'structure',
    ),
  )

  if (mode !== 'answers') return

  objects.push(
    buildText(
      {
        left: ruleLeft + ANSWER_INSET,
        top: ruleY - ANSWER_LIFT,
        text: breakAnswer(relic.name, width - ANSWER_INSET, plan.answerFont, font).join('\n'),
        width: width - ANSWER_INSET,
        fontFamily: font,
        fontSize: plan.answerFont,
        fontWeight: 700,
        originY: 'bottom',
        lineHeight: ANSWER_LINE_HEIGHT,
      },
      tag,
      'answer',
    ),
  )

  const aliasLines = breakAliases(relic.aliases, width, plan.aliasFont, font)
  if (aliasLines.length > 0) {
    objects.push(
      buildText(
        {
          left: ruleLeft,
          top: ruleY + RULE_HEIGHT + ALIAS_GAP,
          text: aliasLines.join('\n'),
          width,
          fontFamily: font,
          fontSize: plan.aliasFont,
          fontStyle: 'italic',
          lineHeight: ALIAS_LINE_HEIGHT,
        },
        tag,
        'answer',
      ),
    )
  }
}

/** Every answer on the page, alphabetised so their order gives nothing away. */
export const bankNames = (items: readonly PlacedRelic[]) =>
  items.map((item) => item.relic.name).sort((a, b) => a.localeCompare(b))

function drawWordBank(
  objects: StudioFabricObject[],
  options: {
    items: readonly PlacedRelic[]
    plan: OrPagePlan
    field: Box
    top: number
    font: string
    tag: StudioTag
    label: string
    radius: number
  },
): void {
  const { items, plan, field, top, font, tag, label, radius } = options
  const width = Math.min(field.width, orGridWidth(plan))
  const left = Math.round(field.left + (field.width - width) / 2)
  const centerX = left + width / 2
  const lines = packBank(bankNames(items), width - BANK_PAD * 2, font)

  objects.push(
    buildRect(
      {
        left,
        top,
        width,
        // Hugs this page's words; the height the plan reserved for the longest
        // possible bank stays as white space below it.
        height: bankBlockHeight(lines.length),
        rx: radius,
        ry: radius,
        stroke: STUDIO_RULE_MEDIUM,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
      },
      tag,
      'structure',
    ),
    buildText(
      {
        left: centerX,
        top: top + BANK_PAD,
        text: label,
        width: width - BANK_PAD * 2,
        fontFamily: font,
        fontSize: BANK_LABEL_FONT,
        fontWeight: 700,
        charSpacing: 120,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
        lineHeight: 1,
      },
      tag,
      'prompt',
    ),
    buildText(
      {
        left: centerX,
        top: top + BANK_PAD + fabricTextHeight(1, BANK_LABEL_FONT) + Math.round(BANK_PAD * 0.6),
        text: lines.join('\n'),
        width: width - BANK_PAD * 2,
        fontFamily: font,
        fontSize: BANK_FONT,
        textAlign: 'center',
        originX: 'center',
        lineHeight: BANK_LINE_HEIGHT,
      },
      tag,
      'prompt',
    ),
  )
}

/**
 * Lay the cards (and, on the puzzle page, the word bank) out in the body field.
 *
 * The answer page sets every picture again under its own number, in the same
 * grid, so a reader checks each answer against the very picture they named.
 */
export function drawOrPage(
  objects: StudioFabricObject[],
  options: {
    field: Box
    plan: OrPagePlan
    items: readonly PlacedRelic[]
    wordBank: boolean
    font: string
    tag: StudioTag
    mode: OrDrawMode
    style: OrHouseStyle
  },
): void {
  const { field, plan, items, wordBank, font, tag, mode, style } = options
  const { cards, bankTop } = orCardBoxes(field, plan, mode, wordBank)
  items.forEach((item, index) => {
    const card = cards[index]
    if (card) drawCard(objects, { item, index, card, plan, font, tag, mode, style })
  })
  if (mode === 'puzzle' && wordBank) {
    const radius = style.frame === 'square' ? 0 : CARD_RADIUS
    drawWordBank(objects, { items, plan, field, top: bankTop, font, tag, label: style.bankLabel, radius })
  }
}
