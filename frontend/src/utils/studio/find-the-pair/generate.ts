/**
 * Find the Pair (Focus).
 *
 * Every other game in the Focus tab hands the reader the target: Symbol Hunt
 * says "find every star", Counting Streams says "count the diamonds", Change
 * Detection prints the before-grid to compare against. This one gives nothing.
 * To solve it the reader has to hold one figure's full description in working
 * memory while scanning the rest, and keep a moving record of what has been
 * ruled out — a working-memory-under-scan task rather than a cancellation task.
 *
 * Fully procedural: seeded RNG only, no network call, no language model, so
 * pages from this template carry no AI-content disclosure obligation at upload.
 *
 * The shared page furniture lives in `_shared/card-page.ts`. Nothing in the
 * part used here is card-specific — it is the Studio's puzzle-page header,
 * figure wrapper and answer ring, which the Card Games Pack happened to be the
 * first consumer of.
 */

import type {
  StudioConfig,
  StudioConfigLayoutContext,
  StudioConfigValidationError,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { FIND_THE_PAIR_INSTRUCTIONS } from '@/constants/studio-phrasing'
import { contentBox, measureHeaderHeight, type Box } from '../studio-layout'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { cardTag, drawCardPageHeader, wrapCardFigure } from '../_shared/card-page'
import {
  CanonicalLedger,
  STUDIO_ENTROPY_FLOOR_BITS,
  entropyFloorMessage,
  pickPhrase,
  poolForMode,
  resolveUniquePuzzle,
  studioPuzzleRng,
} from '../_shared/uniqueness'
import {
  buildFindThePairField,
  distinctFiguresNeeded,
  findThePairCanonicalForm,
  findThePairPageEntropyBits,
  printableSpace,
  type FindThePairField,
} from './build'
import { drawPairField, fitPairField, type PairFieldFit } from './draw'
import {
  FIND_THE_PAIR_TIERS,
  PAIR_COUNT_MAX,
  PAIR_COUNT_MIN,
  parsePairCount,
  parsePairTier,
  type FindThePairTier,
  type PairExtraAttribute,
} from './types'

const TEMPLATE_KEY = 'find-the-pair'

/**
 * Instruction placement is pinned rather than drawn from the page-style pool.
 *
 * The `aboveFigure` variant spends one more instruction gap than `underTitle`,
 * so a page that drew it would have a shorter body than the one the field was
 * measured against. On a large field that difference is the bottom row sitting
 * on the safe margin. The pool's twenty hand-written sentences carry the F3
 * variety this axis would have added, without putting the layout at risk.
 */
const INSTRUCTION_PLACEMENT = 'underTitle' as const

/** Every sentence this template can print, across both instruction pools. */
const INSTRUCTION_VARIANTS: readonly string[] = Object.values(
  FIND_THE_PAIR_INSTRUCTIONS,
).flat()

/**
 * The instruction the header band is *measured* against: whichever variant
 * builds the tallest header in this page's text column.
 *
 * Two things depend on getting this right. Measuring against the sentence the
 * page happened to draw would let a short one buy a taller body and therefore a
 * larger field, so two Hard pages in one book would print different-sized
 * figures — a difficulty change the seller never asked for. And measuring
 * against anything *shorter* than the tallest variant would let the header push
 * the field past the bottom safe margin, which is a print rejection rather than
 * a cosmetic problem.
 *
 * Picked by measured height, not by character count: a shorter sentence can
 * wrap to more lines than a longer one when the break lands badly.
 */
function measuringInstruction(config: StudioConfig, columnWidth: number): string {
  return INSTRUCTION_VARIANTS.reduce((tallest, text) =>
    measureHeaderHeight(config, text, columnWidth) >
    measureHeaderHeight(config, tallest, columnWidth)
      ? text
      : tallest,
  )
}

/** Count always varies; size stays off so figures stay easy to compare across the page. */
const DEFAULT_PAIR_EXTRAS: PairExtraAttribute[] = ['count']

interface ResolvedConfig {
  tierKey: string
  tier: FindThePairTier
  pairCount: number
  extras: PairExtraAttribute[]
}

function resolveConfig(config: StudioConfig): ResolvedConfig {
  const tierKey = parsePairTier(config.tier)
  return {
    tierKey,
    tier: FIND_THE_PAIR_TIERS[tierKey],
    pairCount: parsePairCount(config.pairCount),
    extras: DEFAULT_PAIR_EXTRAS,
  }
}

/** Body the lattice is drawn into — the header band is off the top. */
export function fieldBoxFor(config: StudioConfig, ctx: StudioGenerateContext): Box {
  const content = contentBox(ctx)
  const columnWidth = content.width - STUDIO_CONTENT_SAFE_INSET_X * 2
  return drawCardPageHeader({
    content,
    config,
    tag: cardTag(TEMPLATE_KEY, ctx),
    instruction: measuringInstruction(config, columnWidth),
    placement: INSTRUCTION_PLACEMENT,
    font: String(config.fontFamily ?? ''),
  }).body
}

function ctxFromLayout(layout: StudioConfigLayoutContext): StudioGenerateContext {
  return {
    pageWidth: layout.pageWidth,
    pageHeight: layout.pageHeight,
    margin: layout.margin,
    seed: 0,
    instanceId: 'fit-probe',
  }
}

/**
 * Pairs this field can actually hide.
 *
 * Four pairs on a sixteen-cell warm-up leaves half the page repeated, which
 * stops being a hunt and starts being a matching exercise — and it also
 * outruns the separation rule, so the twins end up adjacent. Cap at a quarter
 * of the cells.
 */
export function resolvePairCountMax(
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): number {
  const { tier } = resolveConfig(config)
  const fit = layout
    ? fitPairField(fieldBoxFor(config, ctxFromLayout(layout)), tier.cells)
    : null
  const cells = fit ? fit.cols * fit.rows : tier.cells
  return Math.max(PAIR_COUNT_MIN, Math.min(PAIR_COUNT_MAX, Math.floor(cells / 4)))
}

const entropyCache = new Map<string, number>()

export function findThePairEntropyBits(config: StudioConfig): number {
  const { tier, pairCount, extras } = resolveConfig(config)
  const key = `${tier.cells}:${tier.minDistance}:${tier.maxDistance}:${pairCount}:${extras.join(',')}`
  const cached = entropyCache.get(key)
  if (cached !== undefined) return cached

  // Measured on the tier's own field shape, squarest first — the shape the
  // page will use unless the trim forces a smaller one, and a smaller field
  // only ever has less to arrange, which `validateConfig` cannot see anyway.
  const cols = Math.max(3, Math.round(Math.sqrt(tier.cells)))
  const rows = Math.max(3, Math.round(tier.cells / cols))
  const bits = findThePairPageEntropyBits({ cols, rows, pairCount, extras, tier })
  entropyCache.set(key, bits)
  return bits
}

function validateConfig(config: StudioConfig): StudioConfigValidationError | null {
  const { tier, pairCount, extras } = resolveConfig(config)
  const space = printableSpace(extras)
  const needed = distinctFiguresNeeded(tier.cells, pairCount)

  if (space.length < needed) {
    return {
      field: 'tier',
      message:
        `This field needs ${needed} different pictures and these settings only make ` +
        `${space.length}. Choose a smaller field or fewer matching pairs.`,
    }
  }

  if (findThePairEntropyBits(config) < STUDIO_ENTROPY_FLOOR_BITS) {
    return {
      field: 'tier',
      message: entropyFloorMessage('Choose a larger field or fewer matching pairs.'),
    }
  }

  return null
}

/** Same lattice, recentred in a different body — used for the solution page. */
function recenterFit(fit: PairFieldFit, box: Box): PairFieldFit {
  return {
    ...fit,
    bounds: {
      left: Math.round(box.left + (box.width - fit.bounds.width) / 2),
      top: Math.round(box.top + (box.height - fit.bounds.height) / 2),
      width: fit.bounds.width,
      height: fit.bounds.height,
    },
  }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const resolved = resolveConfig(config)
  const font = String(config.fontFamily)
  const tag = cardTag(TEMPLATE_KEY, ctx)

  const styleRng = studioPuzzleRng({ templateKey: TEMPLATE_KEY, config, ctx, stream: 'style' })
  const mode = resolved.pairCount === 1 ? 'single' : 'multiple'
  const instruction = pickPhrase({
    templateKey: TEMPLATE_KEY,
    poolName: 'instruction',
    mode,
    pool: poolForMode(FIND_THE_PAIR_INSTRUCTIONS, mode),
    rng: styleRng,
  })

  const content = contentBox(ctx)
  const header = drawCardPageHeader({
    content,
    config,
    tag,
    instruction,
    placement: INSTRUCTION_PLACEMENT,
    font,
  })

  /**
   * The lattice is sized against the tallest header the pool can build, not the
   * one this page drew, then recentred in the body this page actually has.
   *
   * Sizing it against the drawn sentence would let a short variant buy a bigger
   * field, so two pages of the same tier would print different-sized figures —
   * a difficulty change the seller never asked for. Recentring afterwards is
   * safe in the other direction: this page's body is never shorter than the one
   * the field was measured in.
   */
  const measured = fitPairField(fieldBoxFor(config, ctx), resolved.tier.cells)
  const fit = measured ? recenterFit(measured, header.body) : null

  if (!fit) {
    // Nothing legible fits. Emit the header alone rather than a field of
    // figures too small to compare — a blank body is recoverable, an eye test
    // printed into a book is not.
    return [{ pageRole: 'single', objects: header.objects }]
  }

  const pairCount = Math.max(
    PAIR_COUNT_MIN,
    Math.min(resolved.pairCount, Math.floor((fit.cols * fit.rows) / 4)),
  )

  const ledger = new CanonicalLedger()
  const { value: field } = resolveUniquePuzzle<FindThePairField>({
    templateKey: TEMPLATE_KEY,
    ledger,
    build: (attempt, widen) => {
      const rng = studioPuzzleRng({
        templateKey: TEMPLATE_KEY,
        config,
        ctx,
        stream: `field:${attempt}`,
      })
      const built = buildFindThePairField(rng, {
        cols: fit.cols,
        rows: fit.rows,
        pairCount,
        extras: resolved.extras,
        // Widening opens the distance band, which is the parameter §4.3 asks a
        // stuck generator to move — it changes the page without changing what
        // the seller asked for.
        tier: widen
          ? { ...resolved.tier, minDistance: 1, maxDistance: 5, closeQuota: 0 }
          : resolved.tier,
      })
      return { value: built, canonicalForm: findThePairCanonicalForm(built) }
    },
  })

  const canonicalForm = findThePairCanonicalForm(field)

  const objects: StudioFabricObject[] = [
    ...header.objects,
    wrapCardFigure({
      objects: drawPairField({ fit, field, tag }),
      templateKey: TEMPLATE_KEY,
      canonicalHash: canonicalForm,
      tag,
    }),
  ]

  // The solution drops the how-to and recentres the same lattice in the taller
  // body. Same cell size, same arrangement — only the rings become visible.
  const answerHeader = drawCardPageHeader({
    content,
    config,
    tag,
    instruction: '',
    placement: INSTRUCTION_PLACEMENT,
    font,
  })
  const answerSourceObjects: StudioFabricObject[] = [
    ...answerHeader.objects,
    wrapCardFigure({
      objects: drawPairField({ fit: recenterFit(fit, answerHeader.body), field, tag }),
      templateKey: TEMPLATE_KEY,
      canonicalHash: canonicalForm,
      tag,
    }),
  ]

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const findThePairTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'Find the Pair',
  category: 'focus',
  description:
    'A field of small black-and-white figures in which every picture appears once — except one, which appears twice. Find the repeat and circle both copies. No target is given, so the reader has to hold a whole description in mind while scanning, which makes it an attention drill rather than a spotting exercise. Difficulty sets how close the other pictures sit to the pair. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="1.1" fill="none">
      <circle cx="12" cy="9" r="3.4"/>
      <rect x="24.6" y="5.6" width="6.8" height="6.8"/>
      <path d="M44 5.6l3.4 6.8h-6.8z"/>
      <path d="M56 5.6l3.4 3.4-3.4 3.4-3.4-3.4z"/>
      <rect x="8.6" y="17.6" width="6.8" height="6.8"/>
      <circle cx="28" cy="21" r="3.4" fill="currentColor"/>
      <path d="M44 17.6l3.4 3.4-3.4 3.4-3.4-3.4z"/>
      <circle cx="56" cy="21" r="3.4"/>
      <path d="M12 29.6l3.4 6.8h-6.8z"/>
      <circle cx="28" cy="33" r="3.4"/>
      <rect x="40.6" y="29.6" width="6.8" height="6.8" fill="currentColor"/>
      <circle cx="56" cy="33" r="3.4" fill="currentColor"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="22.4" y="15.4" width="11.2" height="11.2" rx="2.6"/>
      <rect x="50.4" y="27.4" width="11.2" height="11.2" rx="2.6"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'tier',
      label: 'Difficulty',
      type: 'select',
      default: 'easy',
      options: [
        { label: 'Warm-up — 16 pictures, easy to tell apart', value: 'warmup' },
        { label: 'Easy — 24 pictures', value: 'easy' },
        { label: 'Medium — 30 pictures, close near misses', value: 'medium' },
        { label: 'Hard — 36 pictures, very close near misses', value: 'hard' },
      ],
      help: 'Difficulty is how alike the other pictures are, not just how many there are. A tight page size may print a smaller field.',
    },
    {
      key: 'pairCount',
      label: 'Matching pairs to hide',
      type: 'number',
      default: 1,
      min: PAIR_COUNT_MIN,
      max: PAIR_COUNT_MAX,
      step: 1,
      maxWhen: resolvePairCountMax,
      helpWhen: (config, layout) => {
        const max = resolvePairCountMax(config, layout)
        return max <= PAIR_COUNT_MIN
          ? 'One pair is hidden on the page.'
          : `How many repeats to hide. Up to ${max} on this field — more than that and the page stops being a hunt.`
      },
      help: 'How many repeats to hide on the page.',
    },
  ],
  validateConfig,
  generate,
}
