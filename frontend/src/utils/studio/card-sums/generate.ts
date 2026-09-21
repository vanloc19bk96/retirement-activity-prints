import type {
  StudioConfig,
  StudioConfigValidationError,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK } from '@/constants/studio.constants'
import {
  CARD_SUMS_INSTRUCTIONS,
  CARD_SUMS_TARGET_LABELS,
  CARD_SUMS_VALUE_HINTS,
} from '@/constants/studio-phrasing'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  boxCenterX,
  contentBox,
  estimateTextBoxWidth,
  insetBox,
  rows as splitRows,
  splitLeft,
  splitTop,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { buildText } from '../studio-fabric-builders'
import {
  CARD_LABEL_FIGURE_GAP,
  CARD_LABEL_SIZE,
  cardTag,
  drawAnswerRing,
  drawCardPageHeader,
  drawWriteInSlots,
  ringArrangeGaps,
  ringInset,
  wrapCardFigure,
  writeInSlotsHeight,
} from '../_shared/card-page'
import {
  arrangeCards,
  CARD_ASPECT,
  cardWidthForSize,
  maxCardBands,
  maxCardsInField,
  renderCard,
  type CardSizeName,
  type CourtValueMode,
} from '../_shared/playing-card'
import {
  CanonicalLedger,
  STUDIO_ENTROPY_FLOOR_BITS,
  entropyFloorMessage,
  pickCardPageStyle,
  pickPhrase,
  poolForMode,
  resolveUniquePuzzle,
  studioCardRng,
} from '../_shared/uniqueness'
import {
  buildRowTotals,
  buildRunningLadder,
  buildTargetHunt,
  cardSumsCanonicalForm,
  cardSumsFigureEntropyBits,
  type CardSumsFigure,
  type CardSumsMode,
} from './build'
import { buildOperatorSign } from './operator-sign'

const TEMPLATE_KEY = 'card-sums'

/** Fixed print size — no user control; M clears the floor on every supported trim. */
const CARD_SIZE: CardSizeName = 'M'

interface TierPreset {
  rowCount: number
  cardsPerRow: number
  cardCount: number
  pickCount: number
  ladderLength: number
}

/**
 * Tier presets.
 *
 * The floors here are set by §4.5, not by taste: a six-card target hunt or a
 * four-card ladder reaches only ~2^30 and ~2^23, so even the warm-up tier draws
 * from ten cards up. Difficulty comes from how many cards the reader must
 * combine, not from how few are printed.
 */
const TIERS: Record<string, TierPreset> = {
  warmup: { rowCount: 4, cardsPerRow: 3, cardCount: 10, pickCount: 2, ladderLength: 8 },
  easy: { rowCount: 5, cardsPerRow: 3, cardCount: 10, pickCount: 3, ladderLength: 8 },
  medium: { rowCount: 5, cardsPerRow: 4, cardCount: 12, pickCount: 3, ladderLength: 10 },
  hard: { rowCount: 6, cardsPerRow: 4, cardCount: 12, pickCount: 4, ladderLength: 12 },
}

/** Below this a ladder cannot clear the §4.5 floor, however tight the trim. */
const MIN_LADDER_LENGTH = 8
/** Wide gaps so the plus/minus sign prints legibly between two cards. */
const LADDER_GAPS = { gapRatio: 0.5, rowGapRatio: 0.28 }

interface ResolvedConfig extends TierPreset {
  mode: CardSumsMode
  tier: string
  courtValue: CourtValueMode
  showValueKey: boolean
}

function parseMode(raw: unknown): CardSumsMode {
  return raw === 'targetHunt' || raw === 'runningLadder' ? raw : 'rowTotals'
}

function resolveConfig(config: StudioConfig): ResolvedConfig {
  const tier = String(config.tier ?? 'easy')
  const preset = TIERS[tier] ?? TIERS.easy
  return {
    ...preset,
    tier,
    mode: parseMode(config.mode),
    courtValue: config.courtValue === 'ten' ? 'ten' : 'face',
    showValueKey: config.showValueKey !== false,
  }
}

export function cardSumsPageEntropyBits(config: StudioConfig): number {
  return cardSumsFigureEntropyBits(resolveConfig(config))
}

function validateConfig(config: StudioConfig): StudioConfigValidationError | null {
  const bits = cardSumsPageEntropyBits(config)
  if (bits >= STUDIO_ENTROPY_FLOOR_BITS) return null
  return {
    field: 'tier',
    message: entropyFloorMessage('Choose a longer difficulty.'),
  }
}

function drawRowTotals(options: {
  field: Box
  figure: Extract<CardSumsFigure, { mode: 'rowTotals' }>
  cardSize: CardSizeName
  affordance: ReturnType<typeof pickCardPageStyle>['answerAffordance']
  font: string
  tag: ReturnType<typeof cardTag>
}): StudioFabricObject[] {
  const { field, figure, cardSize, affordance, font, tag } = options
  const objects: StudioFabricObject[] = []
  const bands = splitRows(field, figure.rows.length, CARD_LABEL_SIZE * 0.4)

  figure.rows.forEach((row, index) => {
    const band = bands[index]
    // The total sits at the right of its row, where the reader's eye lands
    // after adding across.
    const [cardsBox, answerBox] = splitLeft(band, band.width * 0.72)
    const arrangement = arrangeCards({
      field: cardsBox,
      count: row.cards.length,
      cols: row.cards.length,
      maxCardWidth: cardWidthForSize(cardSize),
    })
    arrangement.slots.forEach((slot, i) => {
      objects.push(
        renderCard(row.cards[i], {
          left: slot.left,
          top: slot.top,
          width: slot.width,
          tag,
          role: 'prompt',
        }),
      )
    })
    objects.push(
      ...drawWriteInSlots({
        field: answerBox,
        slots: [{ answer: String(row.total), prefix: '=' }],
        affordance,
        cols: 1,
        font,
        tag,
      }),
    )
  })

  return objects
}

/** Strip above a target-hunt spread that carries the "Target: n" line. */
function targetStripHeight(): number {
  return Math.ceil(CARD_LABEL_SIZE * 1.6 + CARD_LABEL_FIGURE_GAP)
}

/**
 * The box a target-hunt spread actually arranges its cards in: the figure body
 * less the target strip, then inset to leave the answer rings room.
 *
 * Shared, because the card count, the reserved figure height and the drawing
 * pass have to ask the same question. Sizing the count against the un-inset
 * body is how a page came to choose a tenth card that the spread then had no
 * room to place, and `arrangeCards` refuses to shrink below the print floor.
 */
function targetHuntSpread(field: Box, cardWidth: number): Box {
  return insetBox(splitTop(field, targetStripHeight())[1], ringInset(cardWidth))
}

function drawTargetHunt(options: {
  field: Box
  figure: Extract<CardSumsFigure, { mode: 'targetHunt' }>
  cardSize: CardSizeName
  targetLabel: string
  font: string
  tag: ReturnType<typeof cardTag>
}): StudioFabricObject[] {
  const { field, figure, cardSize, targetLabel, font, tag } = options
  const objects: StudioFabricObject[] = []
  const targetSize = CARD_LABEL_SIZE * 1.6
  const [targetStrip] = splitTop(field, targetStripHeight())

  const text = `${targetLabel}: ${figure.target}`
  objects.push(
    buildText(
      {
        left: boxCenterX(targetStrip),
        top: targetStrip.top,
        text,
        width: estimateTextBoxWidth(text, targetSize, targetStrip.width),
        fontSize: targetSize,
        fontFamily: font,
        fontWeight: 700,
        textAlign: 'center',
        originX: 'center',
        fill: STUDIO_INK,
      },
      tag,
      'prompt',
    ),
  )

  const arrangement = arrangeCards({
    // Rings are ink too: leave them room inside the safe area, and keep
    // inter-card gutters at ring clearance so circled neighbours stay distinct.
    field: targetHuntSpread(field, cardWidthForSize(cardSize)),
    count: figure.cards.length,
    // The hunt is scanned, not read down a column, so a short last row centres.
    mode: 'spread',
    maxCardWidth: cardWidthForSize(cardSize),
    ...ringArrangeGaps(cardWidthForSize(cardSize)),
  })
  const answer = new Set(figure.answer)
  arrangement.slots.forEach((slot, index) => {
    objects.push(
      renderCard(figure.cards[index], {
        left: slot.left,
        top: slot.top,
        width: slot.width,
        tag,
        role: 'prompt',
      }),
    )
    if (!answer.has(index)) return
    objects.push(drawAnswerRing(slot, tag))
  })

  return objects
}

function drawRunningLadder(options: {
  field: Box
  figure: Extract<CardSumsFigure, { mode: 'runningLadder' }>
  cardSize: CardSizeName
  affordance: ReturnType<typeof pickCardPageStyle>['answerAffordance']
  font: string
  tag: ReturnType<typeof cardTag>
}): StudioFabricObject[] {
  const { field, figure, cardSize, affordance, font, tag } = options
  const objects: StudioFabricObject[] = []
  const [ladderField, answerBox] = splitTop(
    field,
    field.height - Math.ceil(CARD_LABEL_SIZE * 2.6),
  )

  // Wide gaps: the operator prints between two cards and has to be legible at
  // the same size as the corner indices.
  const arrangement = arrangeCards({
    field: ladderField,
    count: figure.cards.length,
    // A wrapped ladder row centres under the row above; the sign for the first
    // card of that row still prints in the row gap directly over it.
    mode: 'spread',
    ...LADDER_GAPS,
    maxCardWidth: cardWidthForSize(cardSize),
  })
  const rowGap = arrangement.cardWidth * LADDER_GAPS.rowGapRatio

  arrangement.slots.forEach((slot, index) => {
    objects.push(
      renderCard(figure.cards[index], {
        left: slot.left,
        top: slot.top,
        width: slot.width,
        tag,
        role: 'prompt',
      }),
    )
    if (index === 0) return
    const previous = arrangement.slots[index - 1]
    // Between two cards on the same row; for a card that wrapped, in the row
    // gap directly above it. Putting a wrapped sign to the *left* of the card
    // would hang it outside the safe area on a tight trim, and there is always
    // a row gap above a wrapped card because the first card carries no sign.
    const sameRow = previous.row === slot.row
    // ~1/5 card width — secondary to the ranks, still clear in the gap.
    const signSize = Math.round(slot.width * 0.2)
    const cx = sameRow
      ? (previous.left + previous.width + slot.left) / 2
      : slot.left + slot.width / 2
    const cy = sameRow ? slot.top + slot.height / 2 : slot.top - rowGap / 2
    objects.push(...buildOperatorSign(figure.signs[index], cx, cy, signSize, tag))
  })

  objects.push(
    ...drawWriteInSlots({
      field: answerBox,
      slots: [
        {
          answer: String(figure.runningTotals[figure.runningTotals.length - 1]),
          prefix: 'Final total  =',
        },
      ],
      affordance,
      cols: 1,
      font,
      tag,
    }),
  )

  return objects
}

function drawFigure(options: {
  field: Box
  figure: CardSumsFigure
  targetLabel: string
  affordance: ReturnType<typeof pickCardPageStyle>['answerAffordance']
  font: string
  tag: ReturnType<typeof cardTag>
}): StudioFabricObject[] {
  const { field, figure, targetLabel, affordance, font, tag } = options
  if (figure.mode === 'rowTotals') {
    return drawRowTotals({
      field,
      figure,
      cardSize: CARD_SIZE,
      affordance,
      font,
      tag,
    })
  }
  if (figure.mode === 'targetHunt') {
    return drawTargetHunt({
      field,
      figure,
      cardSize: CARD_SIZE,
      targetLabel,
      font,
      tag,
    })
  }
  return drawRunningLadder({
    field,
    figure,
    cardSize: CARD_SIZE,
    affordance,
    font,
    tag,
  })
}

/**
 * Natural height of the figure at Medium card size — not the full body.
 *
 * Stretching rows into a tall no-instruction body made the solution group sit
 * on (or past) the safe-area guide. Pack first, then center that pack in the body.
 */
function preferredFigureHeight(field: Box, figure: CardSumsFigure): number {
  const cardW = cardWidthForSize(CARD_SIZE)
  const cardH = cardW / CARD_ASPECT
  if (figure.mode === 'rowTotals') {
    const gap = CARD_LABEL_SIZE * 0.4
    const bandH = Math.max(cardH * 1.25, writeInSlotsHeight(1, 1))
    const n = figure.rows.length
    return n * bandH + Math.max(0, n - 1) * gap
  }
  if (figure.mode === 'targetHunt') {
    const ring = ringInset(cardW)
    const spread = targetHuntSpread(field, cardW)
    const arranged = arrangeCards({
      field: {
        ...spread,
        width: Math.max(cardW, spread.width),
        height: Math.max(cardH, spread.height),
      },
      count: figure.cards.length,
      mode: 'spread',
      maxCardWidth: cardW,
      ...ringArrangeGaps(cardW),
    })
    return targetStripHeight() + arranged.bounds.height + ring * 2
  }
  const answerH = Math.ceil(CARD_LABEL_SIZE * 2.6)
  const arranged = arrangeCards({
    field: {
      left: 0,
      top: 0,
      width: field.width,
      height: Math.max(cardH * 2, field.height - answerH),
    },
    count: figure.cards.length,
    mode: 'spread',
    ...LADDER_GAPS,
    maxCardWidth: cardW,
  })
  // Signs sit in the row gap; a little pad keeps their AABB inside the pack.
  return arranged.bounds.height + answerH + cardW * LADDER_GAPS.rowGapRatio
}

/** Center a naturally-sized pack inside `body`, never taller than the body. */
function packFieldInBody(body: Box, preferredHeight: number): Box {
  const height = Math.min(body.height, Math.max(1, Math.ceil(preferredHeight)))
  return {
    left: body.left,
    width: body.width,
    top: Math.round(body.top + (body.height - height) / 2),
    height,
  }
}

/** Shrink-wrap drawn parts and re-center in `field` (integer snap, then recenter). */
function centerFigureObjects(objects: StudioFabricObject[], field: Box): StudioFabricObject[] {
  const bounds = unionObjectBounds(objects)
  if (!bounds) return objects
  const dx = Math.round(field.left + (field.width - bounds.width) / 2 - bounds.left)
  const dy = Math.round(field.top + (field.height - bounds.height) / 2 - bounds.top)
  if (dx === 0 && dy === 0) return objects
  return objects.map((obj) => {
    const next: StudioFabricObject = { ...obj }
    if (typeof next.left === 'number') next.left += dx
    if (typeof next.top === 'number') next.top += dy
    // Center-origin lines keep x1/y1 relative to left/top — do not shift again.
    if (obj.type === 'line' && obj.originX === 'center') return next
    if (typeof next.x1 === 'number') next.x1 += dx
    if (typeof next.x2 === 'number') next.x2 += dx
    if (typeof next.y1 === 'number') next.y1 += dy
    if (typeof next.y2 === 'number') next.y2 += dy
    return next
  })
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const resolved = resolveConfig(config)
  const font = String(config.fontFamily)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const tag = cardTag(TEMPLATE_KEY, ctx)
  const styleRng = studioCardRng({ templateKey: TEMPLATE_KEY, config, ctx, stream: 'style' })
  const style = pickCardPageStyle({
    templateKey: TEMPLATE_KEY,
    rng: styleRng,
    variant: `${resolved.mode}:${resolved.tier}`,
    axes: { cardSize: [CARD_SIZE], figuresPerPage: [1] },
  })

  const task = pickPhrase({
    templateKey: TEMPLATE_KEY,
    poolName: 'instruction',
    mode: resolved.mode,
    pool: poolForMode(CARD_SUMS_INSTRUCTIONS, resolved.mode),
    rng: styleRng,
  })
  // Value chart lives in the how-to as a sentence — not a separate legend block.
  const instruction = resolved.showValueKey
    ? `${task} ${pickPhrase({
        templateKey: TEMPLATE_KEY,
        poolName: 'valueHint',
        mode: resolved.courtValue,
        pool: poolForMode(CARD_SUMS_VALUE_HINTS, resolved.courtValue),
        rng: styleRng,
      })}`
    : task

  const content = contentBox(ctx)
  const header = drawCardPageHeader({
    content,
    config,
    tag,
    instruction,
    placement: style.instructionPlacement,
    font,
  })
  const body = header.body

  // Row counts and lengths are the template's difficulty dial; how much a
  // seller's trim can hold is not. Clamp before building so the figure and the
  // layout always agree, and never below the floor a mode needs to stay unique.
  const maxWidth = cardWidthForSize(CARD_SIZE)
  const rowCount = Math.max(
    3,
    Math.min(resolved.rowCount, maxCardBands(body, CARD_LABEL_SIZE * 0.4, resolved.rowCount)),
  )
  const rowField = { ...body, height: body.height / rowCount }
  const cardsPerRow = Math.max(
    2,
    Math.min(
      resolved.cardsPerRow,
      maxCardsInField(
        { ...rowField, width: rowField.width * 0.72 },
        maxWidth,
        resolved.cardsPerRow,
      ),
    ),
  )
  const cardCount = Math.max(
    6,
    Math.min(
      resolved.cardCount,
      maxCardsInField(
        targetHuntSpread(body, maxWidth),
        maxWidth,
        resolved.cardCount,
        ringArrangeGaps(maxWidth),
      ),
    ),
  )
  const pickCount = Math.max(2, Math.min(resolved.pickCount, cardCount - 1))
  const ladderField = { ...body, height: body.height - CARD_LABEL_SIZE * 2.6 }
  const ladderLength = Math.max(
    MIN_LADDER_LENGTH,
    Math.min(
      resolved.ladderLength,
      maxCardsInField(ladderField, maxWidth, resolved.ladderLength, LADDER_GAPS),
    ),
  )

  const ledger = new CanonicalLedger()
  const { value: figure } = resolveUniquePuzzle<CardSumsFigure>({
    templateKey: TEMPLATE_KEY,
    ledger,
    build: (attempt, widen) => {
      const rng = studioCardRng({
        templateKey: TEMPLATE_KEY,
        config,
        ctx,
        stream: `figure:${attempt}`,
      })
      let built: CardSumsFigure
      if (resolved.mode === 'rowTotals') {
        built = buildRowTotals(rng, {
          rowCount,
          cardsPerRow: widen ? Math.max(2, cardsPerRow - 1) : cardsPerRow,
          courtValue: resolved.courtValue,
        })
      } else if (resolved.mode === 'targetHunt') {
        const hunt = buildTargetHunt(rng, {
          cardCount,
          pickCount: widen ? Math.max(2, pickCount - 1) : pickCount,
          courtValue: resolved.courtValue,
        })
        if (!hunt) {
          throw new Error(
            'card-sums: no spread with a single subset reaching the target. ' +
              'Lower the difficulty or use row totals.',
          )
        }
        built = hunt
      } else {
        built = buildRunningLadder(rng, {
          length: ladderLength,
          courtValue: resolved.courtValue,
        })
      }
      return { value: built, canonicalForm: cardSumsCanonicalForm(built) }
    },
  })

  const hash = cardSumsCanonicalForm(figure)
  const targetLabel = pickPhrase({
    templateKey: TEMPLATE_KEY,
    poolName: 'target',
    mode: resolved.mode,
    pool: CARD_SUMS_TARGET_LABELS,
    rng: styleRng,
  })
  const figureOptions = {
    figure,
    targetLabel,
    affordance: style.answerAffordance,
    font,
    tag,
  }

  const puzzlePack = packFieldInBody(body, preferredFigureHeight(body, figure))
  const objects: StudioFabricObject[] = [
    ...header.objects,
    wrapCardFigure({
      objects: centerFigureObjects(
        drawFigure({ field: puzzlePack, ...figureOptions }),
        puzzlePack,
      ),
      templateKey: TEMPLATE_KEY,
      canonicalHash: hash,
      tag,
    }),
  ]

  // Solution page: no how-to — pack at card size and center in the taller body
  // so the group does not stretch onto the safe-area guides.
  const answerHeader = drawCardPageHeader({
    content,
    config,
    tag,
    instruction: '',
    placement: style.instructionPlacement,
    font,
  })
  const answerPack = packFieldInBody(
    answerHeader.body,
    preferredFigureHeight(answerHeader.body, figure),
  )
  const answerSourceObjects: StudioFabricObject[] = [
    ...answerHeader.objects,
    wrapCardFigure({
      objects: centerFigureObjects(
        drawFigure({ field: answerPack, ...figureOptions }),
        answerPack,
      ),
      templateKey: TEMPLATE_KEY,
      canonicalHash: hash,
      tag,
    }),
  ]

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const cardSumsTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'Card Sums',
  category: 'logic',
  tags: ['card'],
  description:
    'Mental arithmetic on playing cards. Add up each row, hunt for the cards that make a target total, or follow a plus-and-minus ladder to its final figure. Values are explained in the instructions. Answer key included.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.3">
      <rect x="4" y="6" width="13" height="18" rx="1.6"/>
      <rect x="21" y="6" width="13" height="18" rx="1.6"/>
      <rect x="38" y="6" width="13" height="18" rx="1.6"/>
      <path d="M54 15h7M57.5 11.5v7" stroke-width="1.6"/>
      <path d="M8 31h48" stroke-width="1.1"/>
    </g>
    <g fill="currentColor">
      <path d="M10.5 11c1.5 2.2 2.8 3 2.8 4.3a2 2 0 0 1-2.8 1.2 2 2 0 0 1-2.8-1.2c0-1.3 1.3-2.1 2.8-4.3z"/>
      <path d="M27.5 12l2.6 3.2-2.6 3.2-2.6-3.2z"/>
      <path d="M44.5 11c1.5 2.2 2.8 3 2.8 4.3a2 2 0 0 1-2.8 1.2 2 2 0 0 1-2.8-1.2c0-1.3 1.3-2.1 2.8-4.3z"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'mode',
      label: 'Puzzle type',
      type: 'select',
      default: 'rowTotals',
      options: [
        { label: 'Row totals — add up each row', value: 'rowTotals' },
        { label: 'Target hunt — circle the cards that make the total', value: 'targetHunt' },
        { label: 'Running ladder — follow the plus and minus signs', value: 'runningLadder' },
      ],
    },
    {
      key: 'tier',
      label: 'Difficulty',
      type: 'select',
      default: 'easy',
      options: [
        { label: 'Warm-up', value: 'warmup' },
        { label: 'Easy', value: 'easy' },
        { label: 'Medium', value: 'medium' },
        { label: 'Hard', value: 'hard' },
      ],
    },
    {
      key: 'courtValue',
      label: 'Jack, Queen and King count as',
      type: 'select',
      default: 'face',
      options: [
        { label: '11, 12 and 13', value: 'face' },
        { label: '10 each (gentler)', value: 'ten' },
      ],
    },
    {
      key: 'showValueKey',
      label: 'Explain card values in the instructions',
      type: 'toggle',
      default: true,
      help: 'Adds a plain sentence (Ace is 1, Jack is 11…) to the how-to so the reader never has to remember the chart.',
    },
  ],
  validateConfig,
  generate,
}
