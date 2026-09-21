import type {
  StudioConfig,
  StudioConfigValidationError,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import {
  CARDS_CHANGED_INSTRUCTIONS,
  CARDS_CHANGED_SPREAD_LABELS,
} from '@/constants/studio-phrasing'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  contentBox,
  insetBox,
  rows as splitRows,
  type Box,
} from '../studio-layout'
import {
  CARD_LABEL_SIZE,
  cardTag,
  centerObjectsInBox,
  drawAnswerRing,
  drawCardPageHeader,
  drawSectionLabel,
  ringArrangeGaps,
  ringInset,
  wrapCardFigure,
} from '../_shared/card-page'
import {
  arrangeCards,
  bestColumnCount,
  cardWidthForSize,
  maxCardsInField,
  renderCard,
  type CardSizeName,
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
  buildCardsChangedFigure,
  cardsChangedCanonicalForm,
  cardsChangedFigureEntropyBits,
  type CardChangeType,
  type CardCell,
  type CardsChangedFigure,
} from './build'

const TEMPLATE_KEY = 'cards-changed'

/** Fixed print size — no user control; M clears the floor on every supported trim. */
const CARD_SIZE: CardSizeName = 'M'

/**
 * Cards per spread and cells changed, per tier.
 *
 * Hard used to ask for 16, but two Before/After spreads plus ring-clearance
 * gutters cannot print 16 legible cards on ordinary trims — the layout clamped
 * to ~12 and the Difficulty label lied. Hard now matches what actually fits
 * (same n as Medium, more changes).
 */
const TIERS: Record<string, { cardCount: number; changeCount: number }> = {
  easy: { cardCount: 9, changeCount: 3 },
  medium: { cardCount: 12, changeCount: 3 },
  hard: { cardCount: 12, changeCount: 4 },
}

interface ResolvedConfig {
  tier: string
  cardCount: number
  changeCount: number
  changeTypes: CardChangeType[]
}

function parseChangeTypes(raw: unknown): CardChangeType[] {
  const list = Array.isArray(raw) ? raw : []
  // Rank is required and hidden in the UI. Alone it still sits under the
  // 48-bit floor on easy (~47.7), so when the user clears every optional kind
  // keep suit as the silent partner (same fair default as the entropy report).
  const extras = (['suit', 'swap'] as const).filter((type) => list.includes(type))
  return extras.length > 0 ? ['rank', ...extras] : ['rank', 'suit']
}

function resolveConfig(config: StudioConfig): ResolvedConfig {
  const tier = String(config.tier ?? 'easy')
  const preset = TIERS[tier] ?? TIERS.easy
  return { tier, ...preset, changeTypes: parseChangeTypes(config.changeTypes) }
}

export function cardsChangedPageEntropyBits(config: StudioConfig): number {
  const resolved = resolveConfig(config)
  return cardsChangedFigureEntropyBits({ ...resolved, cols: 3 })
}

function validateConfig(config: StudioConfig): StudioConfigValidationError | null {
  const bits = cardsChangedPageEntropyBits(config)
  if (bits >= STUDIO_ENTROPY_FLOOR_BITS) return null
  return {
    field: 'tier',
    message: entropyFloorMessage(
      'Choose a harder difficulty, or allow more kinds of change.',
    ),
  }
}

function drawSpread(options: {
  field: Box
  cells: readonly CardCell[]
  cols: number
  cardSize: CardSizeName
  /** Draws a hidden ring on each true cell — the answer key. */
  ringed?: readonly boolean[]
  tag: ReturnType<typeof cardTag>
}): StudioFabricObject[] {
  // `field` is already ring-inset by the caller: measuring the fit against one
  // field and drawing into a smaller one is how a page ends up asking for more
  // cards than it can print. Gaps stay at ring clearance so circled neighbours
  // never merge into one blob on the answer key.
  const { field, cells, cols, cardSize, ringed, tag } = options
  const arrangement = arrangeCards({
    field,
    count: cells.length,
    cols,
    // `spread`, not `grid`: a wrapped last row centres under the full rows
    // instead of hanging off the left rail. Before and After share one count
    // and one column shape, so card i stays card i across the two spreads.
    mode: 'spread',
    maxCardWidth: cardWidthForSize(cardSize),
    ...ringArrangeGaps(cardWidthForSize(cardSize)),
  })
  const objects: StudioFabricObject[] = []

  arrangement.slots.forEach((slot, index) => {
    const cell = cells[index]
    objects.push(
      renderCard(cell.card, {
        left: slot.left,
        top: slot.top,
        width: slot.width,
        tag,
        role: 'prompt',
      }),
    )
    if (!ringed?.[index]) return
    objects.push(drawAnswerRing(slot, tag))
  })

  return objects
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
    variant: resolved.tier,
    axes: { cardSize: [CARD_SIZE], figuresPerPage: [1] },
  })

  const instruction = pickPhrase({
    templateKey: TEMPLATE_KEY,
    poolName: 'instruction',
    mode: 'default',
    pool: poolForMode(CARDS_CHANGED_INSTRUCTIONS, 'default'),
    rng: styleRng,
  })
  const labels = styleRng.pick(CARDS_CHANGED_SPREAD_LABELS)

  const content = contentBox(ctx)
  const header = drawCardPageHeader({
    content,
    config,
    tag,
    instruction,
    placement: style.instructionPlacement,
    font,
  })

  // Band gap used to match a full label height; that ate the room the
  // label-to-figure clearance needs on a 5x8. Keep the split modest.
  const [beforeBand, afterBand] = splitRows(
    header.body,
    2,
    Math.ceil(CARD_LABEL_SIZE * 0.35),
  )
  const beforeLabel = drawSectionLabel(beforeBand, labels.before, font, tag)
  const afterLabel = drawSectionLabel(afterBand, labels.after, font, tag)

  // Both spreads share one grid, so both must fit the tighter band — and the
  // After spread carries answer rings, so the shared field is ring-inset and
  // gaps never close below ring clearance (merged rings fail print QA).
  // Side air comes from CARD_FIGURE_EDGE_INSET in drawCardPageHeader — same as
  // the rest of the card pack.
  const cardW = cardWidthForSize(CARD_SIZE)
  const ringGaps = ringArrangeGaps(cardW)
  const ring = ringInset(cardW)
  const beforeField = insetBox(beforeLabel.body, ring)
  const afterField = insetBox(afterLabel.body, ring)
  const spreadField =
    beforeField.height <= afterField.height ? beforeField : afterField
  const fitted = maxCardsInField(spreadField, cardW, resolved.cardCount, ringGaps)
  // Never ask for more cards than the field can print.
  const cardCount = Math.min(resolved.cardCount, Math.max(fitted, 1))
  const cols = bestColumnCount(
    spreadField,
    cardCount,
    ringGaps.gapRatio,
    ringGaps.rowGapRatio,
  )
  const changeCount = Math.max(1, Math.min(resolved.changeCount, cardCount - 1))

  const ledger = new CanonicalLedger()
  const { value: figure } = resolveUniquePuzzle<CardsChangedFigure>({
    templateKey: TEMPLATE_KEY,
    ledger,
    build: (attempt, widen) => {
      const rng = studioCardRng({
        templateKey: TEMPLATE_KEY,
        config,
        ctx,
        stream: `figure:${attempt}`,
      })
      const built = buildCardsChangedFigure(rng, {
        cardCount,
        changeCount: widen ? Math.min(cardCount - 1, changeCount + 1) : changeCount,
        changeTypes: resolved.changeTypes,
        cols,
      })
      return { value: built, canonicalForm: cardsChangedCanonicalForm(built) }
    },
  })
  const hash = cardsChangedCanonicalForm(figure)

  const beforeObjects = [
    ...beforeLabel.objects,
    ...drawSpread({
      field: beforeField,
      cells: figure.before,
      cols,
      cardSize: CARD_SIZE,
      tag,
    }),
  ]
  const afterObjects = [
    ...afterLabel.objects,
    ...drawSpread({
      field: afterField,
      cells: figure.after,
      cols,
      cardSize: CARD_SIZE,
      ringed: figure.changed,
      tag,
    }),
  ]

  const objects: StudioFabricObject[] = [
    ...header.objects,
    wrapCardFigure({
      objects: [...beforeObjects, ...afterObjects],
      templateKey: TEMPLATE_KEY,
      canonicalHash: hash,
      tag,
    }),
  ]

  // The solution shows the After spread with its rings; reprinting Before there
  // only invites the reader to re-solve the puzzle on the answer page. Re-fit
  // into the full body (no how-to, no "After" label) so the key is optically
  // centered — reusing the puzzle-page After band would leave it stuck in the
  // lower half.
  const answerHeader = drawCardPageHeader({
    content,
    config,
    tag,
    instruction: '',
    placement: style.instructionPlacement,
    font,
  })
  const answerField = insetBox(answerHeader.body, ring)
  // Rings stick past card slots; recenter the full pack so a lopsided change
  // set does not leave the solution grid optically off-center in the body.
  const answerSpread = centerObjectsInBox(
    drawSpread({
      field: answerField,
      cells: figure.after,
      cols,
      cardSize: CARD_SIZE,
      ringed: figure.changed,
      tag,
    }),
    answerField,
  )
  const answerSourceObjects: StudioFabricObject[] = [
    ...answerHeader.objects,
    wrapCardFigure({
      objects: answerSpread,
      templateKey: TEMPLATE_KEY,
      canonicalHash: hash,
      tag,
    }),
  ]

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const cardsChangedTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'What Changed?',
  category: 'memory',
  tags: ['card'],
  description:
    'Two spreads of playing cards, Before and After. A few cards have swapped rank, swapped suit or changed places — circle every one. Answer key included.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="5" y="4" width="12" height="14" rx="1.5"/>
      <rect x="20" y="4" width="12" height="14" rx="1.5"/>
      <rect x="35" y="4" width="12" height="14" rx="1.5"/>
      <rect x="5" y="22" width="12" height="14" rx="1.5"/>
      <rect x="20" y="22" width="12" height="14" rx="1.5"/>
      <rect x="35" y="22" width="12" height="14" rx="1.5"/>
      <rect x="18" y="20" width="16" height="18" rx="3" stroke-width="1.8"/>
    </g>
    <g fill="currentColor">
      <path d="M11 8c1.4 2 2.6 2.7 2.6 4a1.8 1.8 0 0 1-2.6 1.1A1.8 1.8 0 0 1 8.4 12c0-1.3 1.2-2 2.6-4z"/>
      <path d="M26 26l2.4 3-2.4 3-2.4-3z"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'tier',
      label: 'Difficulty',
      type: 'select',
      default: 'easy',
      options: [
        { label: 'Easy — 9 cards, 3 changes', value: 'easy' },
        { label: 'Medium — 12 cards, 3 changes', value: 'medium' },
        { label: 'Hard — 12 cards, 4 changes', value: 'hard' },
      ],
      help: 'Hard keeps the same spread size as Medium but marks more changes. A tight page may still print fewer cards.',
    },
    {
      key: 'changeTypes',
      label: 'Extra kinds of change',
      type: 'multiSelect',
      // Rank is always on (not listed). Suit on by default matches the fair
      // first-book mix from the entropy report.
      default: ['suit'],
      options: [
        { label: 'Suit changes', value: 'suit' },
        { label: 'Two cards swap places', value: 'swap' },
      ],
      help: 'Rank changes are always included. Adding suit changes and swaps makes it harder.',
    },
  ],
  validateConfig,
  generate,
}
