import type {
  StudioConfig,
  StudioConfigValidationError,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_INK_MUTED,
  STUDIO_RULE,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import {
  CARD_MEMORY_SPREAD_INSTRUCTIONS,
  CARD_MEMORY_STUDY_TIME_HINTS,
} from '@/constants/studio-phrasing'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  boxCenterX,
  contentBox,
  estimateTextBoxWidth,
  estimateWrappedLines,
  splitTop,
  type Box,
} from '../studio-layout'
import { buildLine, buildText, type StudioTag } from '../studio-fabric-builders'
import {
  CARD_LABEL_FIGURE_GAP,
  CARD_LABEL_SIZE,
  cardTag,
  drawCardPageHeader,
  wrapCardFigure,
} from '../_shared/card-page'
import {
  arrangeCards,
  bestColumnCount,
  cardWidthForSize,
  cardsFit,
  renderBlankCard,
  renderCard,
  type Card,
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
  buildCardMemoryFigure,
  cardMemoryCanonicalForm,
  cardMemoryFigureEntropyBits,
  type CardMemoryFigure,
} from './build'

const TEMPLATE_KEY = 'card-memory-spread'

/**
 * Studied cards per tier.
 *
 * Six cards would be the natural warm-up, but C(52,6) x 6! is only ~2^34 and
 * cannot clear the §4.5 floor on its own. Nine is the smallest spread that
 * stays safe, so the gentle tier is nine cards with a longer study cue rather
 * than fewer cards.
 */
const TIER_STUDIED: Record<string, number> = { easy: 9, medium: 12, hard: 16 }

/** Fixed print size — no user control; M clears the floor on every supported trim. */
const CARD_SIZE: CardSizeName = 'M'

interface ResolvedConfig {
  tier: string
  studiedCount: number
  showStudyTimeHint: boolean
}

function resolveConfig(config: StudioConfig): ResolvedConfig {
  const tier = String(config.tier ?? 'easy')
  const studiedCount = TIER_STUDIED[tier] ?? TIER_STUDIED.easy
  return {
    tier,
    studiedCount,
    showStudyTimeHint: config.showStudyTimeHint !== false,
  }
}

export function cardMemoryPageEntropyBits(config: StudioConfig): number {
  return cardMemoryFigureEntropyBits(resolveConfig(config))
}

function validateConfig(config: StudioConfig): StudioConfigValidationError | null {
  const bits = cardMemoryPageEntropyBits(config)
  if (bits >= STUDIO_ENTROPY_FLOOR_BITS) return null
  return {
    field: 'tier',
    message: entropyFloorMessage('Choose a larger spread.'),
  }
}

/**
 * Balanced column count for a spread of `count` cards.
 *
 * Shape used to be a user preference (wide / tall); it is fixed to the
 * size-maximising balanced layout so the page always prints the largest card.
 */
function columnsFor(field: Box, count: number): number {
  return bestColumnCount(field, count)
}

/** Largest studied count both pages can print at or above the print floor. */
function fitStudiedCount(options: {
  wanted: number
  studyField: Box
  recallField: Box
}): number {
  const { wanted, studyField, recallField } = options
  const maxWidth = cardWidthForSize(CARD_SIZE)
  for (let count = wanted; count > 6; count--) {
    const studyOk = cardsFit(studyField, count, maxWidth, {
      cols: columnsFor(studyField, count),
      mode: 'spread',
    })
    const recallOk = cardsFit(recallField, count, maxWidth, {
      cols: columnsFor(recallField, count),
      mode: 'spread',
    })
    if (studyOk && recallOk) return count
  }
  return 6
}

function drawSpread(options: {
  field: Box
  cards: readonly Card[]
  cols: number
  tag: StudioTag
}): StudioFabricObject[] {
  const { field, cards, cols, tag } = options
  const arrangement = arrangeCards({
    field,
    count: cards.length,
    cols,
    mode: 'spread',
    maxCardWidth: cardWidthForSize(CARD_SIZE),
  })

  return arrangement.slots.map((slot, index) =>
    renderCard(cards[index], {
      left: slot.left,
      top: slot.top,
      width: slot.width,
      tag,
      role: 'prompt',
    }),
  )
}

/**
 * Blank card + ruled write line — cues "jot A♠ here", not "redraw the face".
 */
function drawWriteInSlots(options: {
  field: Box
  count: number
  cols: number
  tag: StudioTag
}): StudioFabricObject[] {
  const { field, count, cols, tag } = options
  const arrangement = arrangeCards({
    field,
    count,
    cols,
    mode: 'spread',
    maxCardWidth: cardWidthForSize(CARD_SIZE),
  })

  return arrangement.slots.flatMap((slot) => {
    const blank = renderBlankCard({
      left: slot.left,
      top: slot.top,
      width: slot.width,
      tag,
      role: 'structure',
    })
    // Mid-card rule for handwriting; inset so it never kisses the border.
    const insetX = Math.max(6, Math.round(slot.width * 0.14))
    const lineY = Math.round(slot.top + slot.height * 0.62)
    const rule = buildLine(
      {
        x1: slot.left + insetX,
        y1: lineY,
        x2: slot.left + slot.width - insetX,
        y2: lineY,
        stroke: STUDIO_RULE,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
      },
      tag,
      'structure',
    )
    return [blank, rule]
  })
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const resolved = resolveConfig(config)
  const font = String(config.fontFamily)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const studyTag = cardTag(TEMPLATE_KEY, ctx, 'study')
  const recallTag = cardTag(TEMPLATE_KEY, ctx, 'recall')
  const styleRng = studioCardRng({ templateKey: TEMPLATE_KEY, config, ctx, stream: 'style' })
  const style = pickCardPageStyle({
    templateKey: TEMPLATE_KEY,
    rng: styleRng,
    variant: resolved.tier,
    axes: { cardSize: [CARD_SIZE], figuresPerPage: [1] },
  })

  const studyInstruction = pickPhrase({
    templateKey: TEMPLATE_KEY,
    poolName: 'instruction',
    mode: 'study',
    pool: poolForMode(CARD_MEMORY_SPREAD_INSTRUCTIONS, 'study'),
    rng: styleRng,
  })
  const recallInstruction = pickPhrase({
    templateKey: TEMPLATE_KEY,
    poolName: 'instruction',
    mode: 'recall',
    pool: poolForMode(CARD_MEMORY_SPREAD_INSTRUCTIONS, 'recall'),
    rng: styleRng,
  })

  const content = contentBox(ctx)
  const studyHeader = drawCardPageHeader({
    content,
    config,
    tag: studyTag,
    instruction: studyInstruction,
    placement: style.instructionPlacement,
    font,
  })

  const recallHeader = drawCardPageHeader({
    content,
    config,
    tag: recallTag,
    instruction: recallInstruction,
    placement: style.instructionPlacement,
    font,
  })

  // The study cue sits under the spread, where the reader looks last.
  // Text used to start at the strip top — flush with a full 16-card grid.
  const hintGap = resolved.showStudyTimeHint ? CARD_LABEL_FIGURE_GAP : 0
  let hintStrip: Box = { left: 0, top: 0, width: 0, height: 0 }
  let studyBody = studyHeader.body
  if (resolved.showStudyTimeHint) {
    // Reserve for the longest cue so a wrapped line cannot spill the safe edge.
    const hintSample = CARD_MEMORY_STUDY_TIME_HINTS.reduce((a, b) =>
      a.length >= b.length ? a : b,
    )
    const hintWidth = estimateTextBoxWidth(hintSample, CARD_LABEL_SIZE, studyHeader.body.width)
    const hintLines = estimateWrappedLines(hintSample, CARD_LABEL_SIZE, hintWidth)
    const hintTextH = Math.ceil(hintLines * CARD_LABEL_SIZE)
    const hintHeight = hintGap + hintTextH + Math.ceil(CARD_LABEL_SIZE * 0.25)
    ;[studyBody, hintStrip] = splitTop(
      studyHeader.body,
      studyHeader.body.height - hintHeight,
    )
  }
  const studyField = studyBody
  const recallField = recallHeader.body
  const studiedCount = fitStudiedCount({
    wanted: resolved.studiedCount,
    studyField,
    recallField,
  })

  const ledger = new CanonicalLedger()
  const { value: figure } = resolveUniquePuzzle<CardMemoryFigure>({
    templateKey: TEMPLATE_KEY,
    ledger,
    build: (attempt) => {
      const rng = studioCardRng({
        templateKey: TEMPLATE_KEY,
        config,
        ctx,
        stream: `figure:${attempt}`,
      })
      const built = buildCardMemoryFigure(rng, { studiedCount })
      return { value: built, canonicalForm: cardMemoryCanonicalForm(built) }
    },
  })
  const hash = cardMemoryCanonicalForm(figure)

  const studyCols = columnsFor(studyField, figure.studied.length)
  const studyObjects: StudioFabricObject[] = [
    ...studyHeader.objects,
    wrapCardFigure({
      objects: drawSpread({
        field: studyField,
        cards: figure.studied,
        cols: studyCols,
        tag: studyTag,
      }),
      templateKey: TEMPLATE_KEY,
      canonicalHash: hash,
      tag: studyTag,
    }),
  ]

  if (resolved.showStudyTimeHint) {
    const hint = pickPhrase({
      templateKey: TEMPLATE_KEY,
      poolName: 'studyTime',
      mode: 'default',
      pool: CARD_MEMORY_STUDY_TIME_HINTS,
      rng: styleRng,
    })
    studyObjects.push(
      buildText(
        {
          left: boxCenterX(hintStrip),
          top: hintStrip.top + hintGap,
          text: hint,
          width: estimateTextBoxWidth(hint, CARD_LABEL_SIZE, hintStrip.width),
          fontSize: CARD_LABEL_SIZE,
          fontFamily: font,
          textAlign: 'center',
          originX: 'center',
          fill: STUDIO_INK_MUTED,
        },
        studyTag,
        'decoration',
      ),
    )
  }

  const recallCols = columnsFor(recallField, figure.studied.length)
  const recallObjects: StudioFabricObject[] = [
    ...recallHeader.objects,
    wrapCardFigure({
      objects: drawWriteInSlots({
        field: recallField,
        count: figure.studied.length,
        cols: recallCols,
        tag: recallTag,
      }),
      templateKey: TEMPLATE_KEY,
      canonicalHash: `${hash}:recall`,
      tag: recallTag,
    }),
  ]

  return [
    { pageRole: 'study', objects: studyObjects },
    { pageRole: 'recall', objects: recallObjects },
  ]
}

export const cardMemorySpreadTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'Card Memory Spread',
  category: 'memory',
  tags: ['card'],
  description:
    'Study a spread of playing cards, turn the page, and write each one back as rank + suit (e.g. A♠). No redrawing — check yourself by turning back a page.',
  pageCount: 2,
  producesAnswerKey: false,
  showsCanvasEditHint: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.3">
      <rect x="4" y="5" width="11" height="15" rx="1.5"/>
      <rect x="18" y="5" width="11" height="15" rx="1.5"/>
      <rect x="4" y="23" width="11" height="15" rx="1.5"/>
      <rect x="18" y="23" width="11" height="15" rx="1.5" stroke-dasharray="2.5 2.5"/>
      <rect x="37" y="9" width="11" height="15" rx="1.5" stroke-dasharray="2.5 2.5"/>
      <rect x="50" y="16" width="11" height="15" rx="1.5" stroke-dasharray="2.5 2.5"/>
    </g>
    <g fill="currentColor">
      <path d="M9.5 10c1.3 1.9 2.4 2.5 2.4 3.6a1.7 1.7 0 0 1-2.4 1 1.7 1.7 0 0 1-2.4-1c0-1.1 1.1-1.7 2.4-3.6z"/>
      <path d="M23.5 11l2.2 2.7-2.2 2.7-2.2-2.7z"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'tier',
      label: 'Spread size',
      type: 'select',
      default: 'easy',
      options: [
        { label: 'Easy — 9 cards', value: 'easy' },
        { label: 'Medium — 12 cards', value: 'medium' },
        { label: 'Hard — 16 cards', value: 'hard' },
      ],
    },
    {
      key: 'showStudyTimeHint',
      label: 'Print a study-time cue',
      type: 'toggle',
      default: true,
      help: 'Adds a line under the spread suggesting how long to study before turning over.',
    },
  ],
  validateConfig,
  generate,
}
