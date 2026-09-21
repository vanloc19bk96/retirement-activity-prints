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
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { NEXT_CARD_INSTRUCTIONS } from '@/constants/studio-phrasing'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  contentBox,
  rows as splitRows,
  type Box,
} from '../studio-layout'
import {
  buildGroup,
  buildLine,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  CARD_HAIRLINE,
  CARD_LABEL_SIZE,
  cardTag,
  drawAnswerRing,
  drawCardPageHeader,
  ringInset,
  wrapCardFigure,
} from '../_shared/card-page'
import {
  CARD_ASPECT,
  MIN_COMPACT_CARD_WIDTH,
  renderBlankCard,
  renderCardWriteLabel,
  renderCompactCard,
} from '../_shared/playing-card'
import {
  CanonicalLedger,
  STUDIO_ENTROPY_FLOOR_BITS,
  combineFigureEntropyBits,
  entropyFloorMessage,
  pickCardPageStyle,
  pickPhrase,
  poolForMode,
  resolveUniquePuzzle,
  studioCardRng,
} from '../_shared/uniqueness'
import {
  buildNextCardFigure,
  nextCardCanonicalForm,
  nextCardFigureEntropyBits,
  type NextCardFigure,
  type NextCardOptions,
} from './rules'

const TEMPLATE_KEY = 'next-card'

export type NextCardAnswerStyle = 'draw' | 'write' | 'multipleChoice'

/**
 * Figures a page must carry.
 *
 * One sequence reaches only about 2^13 — far below the §4.5 floor. Six figures
 * bring the page to roughly 2^65, which is why §6.5 calls this "exactly the
 * case §4.5 exists to catch". The floor is enforced, not suggested.
 */
export const NEXT_CARD_MIN_FIGURES = 6

const TIERS: Record<string, { prefixLengths: number[]; includeInterleave: boolean }> = {
  easy: { prefixLengths: [5, 6], includeInterleave: false },
  medium: { prefixLengths: [5, 6, 7], includeInterleave: false },
  hard: { prefixLengths: [6, 7], includeInterleave: true },
}

interface ResolvedConfig extends NextCardOptions {
  tier: string
  answerStyle: NextCardAnswerStyle
  figuresPerPage: number
}

function parseAnswerStyle(raw: unknown): NextCardAnswerStyle {
  return raw === 'write' || raw === 'multipleChoice' ? raw : 'draw'
}

function resolveConfig(config: StudioConfig): ResolvedConfig {
  const tier = String(config.tier ?? 'easy')
  const preset = TIERS[tier] ?? TIERS.easy
  const answerStyle = parseAnswerStyle(config.answerStyle)
  return {
    tier,
    answerStyle,
    prefixLengths: preset.prefixLengths,
    includeInterleave: preset.includeInterleave,
    // Two answers only make sense when the reader supplies them; a
    // multiple-choice strip asks for one card.
    answerCount:
      answerStyle === 'multipleChoice' ? 1 : Math.max(1, Math.min(2, Number(config.answerCount ?? 1))),
    choiceCount: answerStyle === 'multipleChoice' ? 3 : 0,
    figuresPerPage: Math.max(
      NEXT_CARD_MIN_FIGURES,
      Number(config.figuresPerPage ?? NEXT_CARD_MIN_FIGURES),
    ),
  }
}

export function nextCardPageEntropyBits(config: StudioConfig): number {
  const resolved = resolveConfig(config)
  return combineFigureEntropyBits(
    nextCardFigureEntropyBits(resolved),
    resolved.figuresPerPage,
  )
}

function validateConfig(config: StudioConfig): StudioConfigValidationError | null {
  const bits = nextCardPageEntropyBits(config)
  if (bits >= STUDIO_ENTROPY_FLOOR_BITS) return null
  return {
    field: 'figuresPerPage',
    message: entropyFloorMessage(
      `Print at least ${NEXT_CARD_MIN_FIGURES} sequences per page.`,
    ),
  }
}

const ROW_GAP_RATIO = 0.18
/** Vertical gutter between sequence bands — shared by size probe and layout. */
const FIGURE_ROW_GAP = CARD_LABEL_SIZE * 0.5

/** Tagged so tests can assert PDF-safe geometry (no Unicode arrow glyphs). */
export const NEXT_CARD_ARROW_SOURCE = 'next-card-arrow'

/**
 * One figure band inside `field` after splitting into `figureCount` rows.
 *
 * Card width must be sized from this height — not the full body. Using the
 * full field lets width-driven cards grow taller than a band, so neighbouring
 * sequences overlap (worst at 8-up on a wide trim).
 */
function figureBandBox(field: Box, figureCount: number): Box {
  const count = Math.max(1, figureCount)
  const height =
    (field.height - FIGURE_ROW_GAP * Math.max(0, count - 1)) / count
  return {
    left: field.left,
    top: field.top,
    width: field.width,
    height: Math.max(1, height),
  }
}

/**
 * Sequence separator as line art (shaft + two barbs), never a glyph.
 *
 * Catalog fonts have no `→`. On canvas the browser falls back to another face;
 * PDF/SVG outline export then substitutes or drops the character — editor and
 * download diverge. Same three-stroke group pattern as Follow the Route.
 */
function buildSequenceArrow(options: {
  left: number
  top: number
  width: number
  height: number
  tag: StudioTag
}): StudioFabricObject {
  const { left, top, width, height, tag } = options
  const cx = left + width / 2
  const cy = top + height / 2
  // Keep quieter than the cards — separator only, not a focal mark.
  const size = Math.min(width, height) * 0.36
  const half = size / 2
  const head = size * 0.36
  const strokeWidth = Math.max(STUDIO_STROKE_HAIRLINE, size * 0.08)
  const tip = { x: cx + half, y: cy }
  const tail = { x: cx - half, y: cy }
  const barb = (sign: number) => ({
    x: tip.x - head,
    y: tip.y + sign * head * 0.55,
  })
  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) =>
    buildLine(
      {
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        stroke: STUDIO_INK_MUTED,
        strokeWidth,
        strokeUniform: true,
        strokeLineCap: 'round',
      },
      tag,
      'structure',
    )
  const pad = strokeWidth
  const group = buildGroup(
    [stroke(tail, tip), stroke(tip, barb(1)), stroke(tip, barb(-1))],
    {
      left: cx - half - pad,
      top: cy - half - pad,
      width: size + pad * 2,
      height: size + pad * 2,
    },
    tag,
    'decoration',
  )
  return {
    ...group,
    data: {
      ...(group.data ?? {}),
      source: NEXT_CARD_ARROW_SOURCE,
    },
  }
}

/** Card width that fits `slotCount` cards across one figure's row. */
function rowCardWidth(row: Box, slotCount: number): number {
  const byWidth = row.width / (slotCount + (slotCount - 1) * ROW_GAP_RATIO)
  const byHeight = row.height * CARD_ASPECT
  return Math.min(byWidth, byHeight)
}

/** Slots a row can hold before the rank letter drops under 12pt. */
function maxRowSlots(row: Box): number {
  for (let slots = 14; slots > 2; slots--) {
    if (rowCardWidth(row, slots) >= MIN_COMPACT_CARD_WIDTH) return slots
  }
  return 2
}

/**
 * Prefix lengths that actually fit the row.
 *
 * A seven-card prefix plus an arrow plus three multiple-choice cards is eleven
 * slots, which on a 6x9 trim drops the compact card under its 12pt floor. The
 * tier asks for a length; the page decides which of them can be printed.
 */
/** Below four cards a run is too short to imply a rule fairly. */
const MIN_PREFIX_LENGTH = 4
/**
 * Absolute floor on a tight trim (5x8 + multiple-choice). Three cards still
 * imply a step; shorter than that is noise, not a puzzle.
 */
const MIN_PREFIX_LENGTH_TIGHT = 3

function fittingPrefixLengths(
  row: Box,
  wanted: readonly number[],
  answerSlots: number,
): number[] {
  const budget = maxRowSlots(row) - 1 - answerSlots
  const fitting = wanted.filter((length) => length <= budget)
  if (fitting.length > 0) return fitting
  if (budget >= MIN_PREFIX_LENGTH) return [Math.min(budget, Math.min(...wanted))]
  // A 5x8 multiple-choice row can land one slot under the fair floor after
  // ring clearance — print the longest run that still fits rather than fail.
  if (budget >= MIN_PREFIX_LENGTH_TIGHT) return [budget]
  throw new Error(
    `next-card: a ${Math.round(row.width)}x${Math.round(row.height)} row holds only ` +
      `${budget} sequence cards at the 12pt print floor. Print fewer sequences per page.`,
  )
}

function drawFigureRow(options: {
  row: Box
  figure: NextCardFigure
  answerStyle: NextCardAnswerStyle
  /** Page-uniform width — sized for the longest sequence on the sheet. */
  cardWidth: number
  tag: StudioTag
}): StudioFabricObject[] {
  const { row, figure, answerStyle, cardWidth, tag } = options
  const objects: StudioFabricObject[] = []
  // Prefix cards, a separator, then either blank answer slots or the choices.
  const answerSlots =
    answerStyle === 'multipleChoice' ? figure.choices.length : figure.answer.length
  const slotCount = figure.prefix.length + 1 + answerSlots
  const cardHeight = cardWidth / CARD_ASPECT
  const gap = cardWidth * ROW_GAP_RATIO
  const totalWidth = slotCount * cardWidth + (slotCount - 1) * gap
  const originX = row.left + (row.width - totalWidth) / 2
  const top = Math.round(row.top + (row.height - cardHeight) / 2)
  const xAt = (index: number) => Math.round(originX + index * (cardWidth + gap))

  figure.prefix.forEach((card, index) => {
    objects.push(
      renderCompactCard(card, {
        left: xAt(index),
        top,
        width: cardWidth,
        tag,
        role: 'prompt',
      }),
    )
  })

  // Path arrow — Unicode `→` diverges between editor font-fallback and PDF.
  objects.push(
    buildSequenceArrow({
      left: xAt(figure.prefix.length),
      top,
      width: cardWidth,
      height: cardHeight,
      tag,
    }),
  )

  const firstAnswerIndex = figure.prefix.length + 1

  if (answerStyle === 'multipleChoice') {
    figure.choices.forEach((card, index) => {
      const left = xAt(firstAnswerIndex + index)
      objects.push(
        renderCompactCard(card, { left, top, width: cardWidth, tag, role: 'prompt' }),
      )
      if (index !== figure.correctChoice) return
      objects.push(
        drawAnswerRing({ left, top, width: cardWidth, height: cardHeight }, tag),
      )
    })
    return objects
  }

  figure.answer.forEach((card, index) => {
    const left = xAt(firstAnswerIndex + index)
    if (answerStyle === 'draw') {
      objects.push(
        renderBlankCard({ left, top, width: cardWidth, tag, role: 'structure' }),
      )
      objects.push(
        renderCompactCard(card, { left, top, width: cardWidth, tag, role: 'answer' }),
      )
      return
    }
    // `write`: ruled line vertically centered with the cards; answer sits on it.
    // Rank letter + vector suit — Unicode ♠♥♦♣ diverge under PDF outline export.
    const midY = Math.round(top + cardHeight / 2)
    objects.push(
      buildLine(
        {
          x1: left,
          y1: midY,
          x2: left + cardWidth,
          y2: midY,
          stroke: STUDIO_INK_MUTED,
          strokeWidth: CARD_HAIRLINE,
        },
        tag,
        'structure',
      ),
    )
    const size = Math.max(CARD_LABEL_SIZE * 0.8, cardWidth * 0.34)
    objects.push(
      ...renderCardWriteLabel(card, {
        left,
        width: cardWidth,
        baseline: midY,
        fontSize: size,
        tag,
        role: 'answer',
      }),
    )
  })

  return objects
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

function insetRingRoom(body: Box, ringRoom: number): Box {
  return {
    left: body.left + ringRoom,
    top: body.top + ringRoom,
    width: Math.max(0, body.width - ringRoom * 2),
    height: Math.max(0, body.height - ringRoom * 2),
  }
}

/**
 * Lay figure rows into `body`.
 *
 * Puzzle pages stretch bands across the how-to body. Solution pages pack to
 * card height and center the stack — otherwise omitting the instruction leaves
 * a hole under the title while rows stay stuck where the puzzle put them.
 */
function drawFiguresInBody(options: {
  body: Box
  figures: readonly { figure: NextCardFigure; hash: string }[]
  answerStyle: NextCardAnswerStyle
  cardWidth: number
  ringRoom: number
  tag: StudioTag
  centerStack?: boolean
}): StudioFabricObject[] {
  const { body, figures, answerStyle, cardWidth, ringRoom, tag, centerStack } = options
  const field = insetRingRoom(body, ringRoom)
  const cardHeight = cardWidth / CARD_ASPECT
  const layoutField = centerStack
    ? packFieldInBody(
        field,
        figures.length * cardHeight +
          Math.max(0, figures.length - 1) * FIGURE_ROW_GAP,
      )
    : field
  const bands = splitRows(layoutField, figures.length, FIGURE_ROW_GAP)
  return figures.map(({ figure, hash }, index) =>
    wrapCardFigure({
      objects: drawFigureRow({
        row: bands[index],
        figure,
        answerStyle,
        cardWidth,
        tag,
      }),
      templateKey: TEMPLATE_KEY,
      canonicalHash: hash,
      tag,
    }),
  )
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
    variant: `${resolved.answerStyle}:${resolved.tier}`,
    axes: { cardSize: ['M'], figuresPerPage: [resolved.figuresPerPage] },
  })

  const instruction = pickPhrase({
    templateKey: TEMPLATE_KEY,
    poolName: 'instruction',
    mode: resolved.answerStyle,
    pool: poolForMode(NEXT_CARD_INSTRUCTIONS, resolved.answerStyle),
    rng: styleRng,
  })

  const content = contentBox(ctx)
  const header = drawCardPageHeader({
    content,
    config,
    tag,
    instruction,
    placement: style.instructionPlacement,
    font,
  })

  // Multiple choice rings one option — ring clearance on top of the shared
  // figure-edge inset. Draw/write use the shared inset alone (same air as
  // Card Sums / What Changed / Memory Spread).
  const ringRoom =
    resolved.answerStyle === 'multipleChoice'
      ? ringInset(MIN_COMPACT_CARD_WIDTH * 1.6)
      : 0
  const puzzleField = insetRingRoom(header.body, ringRoom)
  // Size cards for one band, not the whole body — see figureBandBox.
  const probeRow = figureBandBox(puzzleField, resolved.figuresPerPage)
  const answerSlots =
    resolved.answerStyle === 'multipleChoice' ? resolved.choiceCount : resolved.answerCount
  const prefixLengths = fittingPrefixLengths(
    probeRow,
    resolved.prefixLengths,
    answerSlots,
  )
  // One card size for every row — otherwise a 5-card prefix prints taller
  // cards than a 7-card prefix and the sheet looks uneven (worst on MC).
  const pageSlotCount = Math.max(...prefixLengths) + 1 + answerSlots
  const cardWidth = rowCardWidth(probeRow, pageSlotCount)
  const ledger = new CanonicalLedger()

  const figures: { figure: NextCardFigure; hash: string }[] = []
  for (let i = 0; i < resolved.figuresPerPage; i++) {
    const { value: figure, hash } = resolveUniquePuzzle<NextCardFigure>({
      templateKey: TEMPLATE_KEY,
      ledger,
      build: (attempt, widen) => {
        const rng = studioCardRng({
          templateKey: TEMPLATE_KEY,
          config,
          ctx,
          stream: `figure:${i}:${attempt}`,
        })
        const built = buildNextCardFigure(rng, {
          ...resolved,
          prefixLengths,
          // Widening opens the interleaved rules, which is a different region
          // of the pool rather than a redraw from the same corner.
          includeInterleave: widen ? true : resolved.includeInterleave,
        })
        if (!built) {
          throw new Error(
            'next-card: could not find a sequence with a single fair answer. ' +
              'Try a different difficulty.',
          )
        }
        return { value: built, canonicalForm: nextCardCanonicalForm(built) }
      },
    })
    figures.push({ figure, hash })
  }

  const objects: StudioFabricObject[] = [
    ...header.objects,
    ...drawFiguresInBody({
      body: header.body,
      figures,
      answerStyle: resolved.answerStyle,
      cardWidth,
      ringRoom,
      tag,
    }),
  ]

  // No how-to on the key — taller body. Pack rows to card height and center the
  // stack so omitting the instruction does not leave rows stuck mid-page.
  const answerHeader = drawCardPageHeader({
    content,
    config,
    tag,
    instruction: '',
    placement: style.instructionPlacement,
    font,
  })
  const answerSourceObjects: StudioFabricObject[] = [
    ...answerHeader.objects,
    ...drawFiguresInBody({
      body: answerHeader.body,
      figures,
      answerStyle: resolved.answerStyle,
      cardWidth,
      ringRoom,
      tag,
      centerStack: true,
    }),
  ]

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const nextCardTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'Next Card',
  category: 'logic',
  tags: ['card'],
  description:
    'Each row of playing cards follows a hidden rule — the rank climbs, the suit cycles, the colour alternates. Work out the rule and supply the card that comes next. Every sequence is checked against the whole rule pool, so the printed answer is the only fair one.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="3" y="11" width="11" height="16" rx="1.5"/>
      <rect x="16" y="11" width="11" height="16" rx="1.5"/>
      <rect x="29" y="11" width="11" height="16" rx="1.5"/>
      <rect x="50" y="11" width="11" height="16" rx="1.5" stroke-dasharray="2.5 2.5"/>
      <path d="M42 19h6M46 16.5l2.5 2.5-2.5 2.5"/>
    </g>
    <g fill="currentColor" font-size="8" font-family="sans-serif" text-anchor="middle">
      <text x="8.5" y="22">2</text><text x="21.5" y="22">4</text><text x="34.5" y="22">6</text>
      <text x="55.5" y="22">?</text>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'tier',
      label: 'Difficulty',
      type: 'select',
      default: 'easy',
      options: [
        { label: 'Easy — short runs, one rule at a time', value: 'easy' },
        { label: 'Medium — longer runs', value: 'medium' },
        { label: 'Hard — includes two rules interleaved', value: 'hard' },
      ],
    },
    {
      key: 'answerStyle',
      label: 'How the answer is given',
      type: 'select',
      default: 'draw',
      options: [
        { label: 'Draw the card in a blank outline', value: 'draw' },
        { label: 'Write the rank and suit on a line', value: 'write' },
        { label: 'Circle one of three choices', value: 'multipleChoice' },
      ],
    },
    {
      key: 'answerCount',
      label: 'Cards to supply',
      type: 'number',
      default: 1,
      values: [1, 2],
      help: 'Two makes it harder. Multiple choice always asks for one.',
      visibleWhen: (config) => config.answerStyle !== 'multipleChoice',
    },
    {
      key: 'figuresPerPage',
      label: 'Sequences per page',
      type: 'number',
      default: NEXT_CARD_MIN_FIGURES,
      values: [6, 7, 8],
      help: 'One sequence has few variations, so this page needs at least six to keep your book distinct from every other seller’s.',
    },
  ],
  validateConfig,
  generate,
}
