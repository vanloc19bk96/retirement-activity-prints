/**
 * Word Fit-In (Word).
 *
 * A crossword grid with the clues taken away and the answers handed over
 * instead. The reader works out where each word goes from its length and from
 * the letters where slots cross — so the puzzle tests visual matching and
 * working memory rather than vocabulary, and stays solvable for a reader whose
 * word-finding has declined. Sold on KDP as Fill-In, Fill-It-In or Kriss-Kross,
 * and it was the largest genre gap in this library.
 *
 * Where the bank comes from depends on the mode. A theme — a bundled preset or
 * a phrase typed into the custom-theme switch — asks the model for a list
 * written for that page, so a long book stops recycling the same eight hundred
 * words; numbers stays fully offline and procedural. Only the themed path
 * carries the AI-content disclosure at upload (§5.4) — and because a fill-in
 * prints no clues, neither mode can print a clue that is wrong. See `words.ts`
 * and `prefetch.ts`.
 *
 * Every printed grid is re-solved from its bank before it ships (`solver.ts`).
 * A page with two valid fillings has an answer key that is wrong for half its
 * readers, and that is the defect this template exists not to have.
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
import type { ThemeWordsResponse } from '@/types/studio-theme-words.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { WORD_FIT_INSTRUCTIONS } from '@/constants/studio-phrasing'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { contentBox, measureHeaderHeight, splitTop, type Box } from '../studio-layout'
import { cardTag, drawCardPageHeader, wrapCardFigure } from '../_shared/card-page'
import {
  STUDIO_ENTROPY_FLOOR_BITS,
  entropyFloorMessage,
  pickPhrase,
  poolForMode,
  studioPuzzleRng,
} from '../_shared/uniqueness'
import {
  resolveWordFitPuzzle,
  wordFitCanonicalForm,
  wordFitPageEntropyBits,
} from './build'
import { wordFitPrefetch } from './prefetch'
import {
  drawWordBank,
  drawWordFitGrid,
  estimateBankHeight,
  GRID_BANK_GAP,
  MIN_WORD_FIT_CELL,
  planWordBank,
  wordFitCellSize,
  type BankPlan,
} from './draw'
import {
  CUSTOM_THEME_MAX_LENGTH,
  drawSpreadWords,
  lengthLadder,
  listWordFitThemes,
  numberBank,
  resolveWordPool,
} from './words'
import {
  parseWordFitCount,
  parseWordFitMode,
  parseWordFitStarters,
  WORD_FIT_COUNT_DEFAULT,
  WORD_FIT_COUNT_MAX,
  WORD_FIT_COUNT_MIN,
  WORD_FIT_STARTERS_MAX,
  type WordFitMode,
  type WordFitPuzzle,
} from './types'

const TEMPLATE_KEY = 'word-fit'

/** Pinned so the instruction band stays under the title and does not steal body height from the grid. */
const INSTRUCTION_PLACEMENT = 'underTitle' as const

/**
 * Share of the body the grid may take before the bank is squeezed.
 *
 * The bank is not decoration — it is the entire clue set — so it gets a real
 * reservation rather than whatever the grid leaves behind.
 */
const MAX_GRID_SHARE = 0.68

const INSTRUCTION_VARIANTS: readonly string[] = Object.values(WORD_FIT_INSTRUCTIONS).flat()

function measuringInstruction(config: StudioConfig, columnWidth: number): string {
  return INSTRUCTION_VARIANTS.reduce((tallest, text) =>
    measureHeaderHeight(config, text, columnWidth) >
    measureHeaderHeight(config, tallest, columnWidth)
      ? text
      : tallest,
  )
}

interface ResolvedConfig {
  mode: WordFitMode
  /**
   * Bundled preset key — always real, so it can serve as the offline pool. A
   * typed custom theme steers only the fetch (`prefetch.ts`), never this.
   */
  themeKey: string
  wordCount: number
  starters: number
}

function resolveConfig(config: StudioConfig): ResolvedConfig {
  return {
    mode: parseWordFitMode(config.mode),
    themeKey: String(config.theme ?? 'animals'),
    wordCount: parseWordFitCount(config.wordCount),
    starters: parseWordFitStarters(config.starters),
  }
}

/** How large a pool this setting draws from — the dominant entropy term. */
export function wordFitPoolSize(config: StudioConfig): number {
  const resolved = resolveConfig(config)
  if (resolved.mode === 'numbers') {
    // Digit strings are generated, not drawn from a list: a bank of `n` entries
    // whose lengths come from the ladder has 9 * 10^(len-1) choices each.
    return lengthLadder(resolved.wordCount).reduce(
      (total, length) => total + 9 * 10 ** (length - 1),
      0,
    )
  }
  return resolveWordPool({ themeKey: resolved.themeKey }).length
}

export function wordFitEntropyBits(config: StudioConfig): number {
  const { wordCount } = resolveConfig(config)
  return wordFitPageEntropyBits({ poolSize: wordFitPoolSize(config), wordCount })
}

function validateConfig(config: StudioConfig): StudioConfigValidationError | null {
  // The custom-theme switch feeds the fetch a free-text phrase; keep it short
  // enough that the model gets a theme, not a paragraph.
  if (
    config.customTheme === true &&
    String(config.customThemeText ?? '').trim().length > CUSTOM_THEME_MAX_LENGTH
  ) {
    return {
      field: 'customThemeText',
      message: `Keep the custom theme under ${CUSTOM_THEME_MAX_LENGTH} characters.`,
    }
  }

  // The pool a themed or numbers page draws from is not the seller's to size,
  // so the entropy floor is the guard that stays.
  if (wordFitEntropyBits(config) < STUDIO_ENTROPY_FLOOR_BITS) {
    return {
      field: 'wordCount',
      message: entropyFloorMessage('Use more words, or switch to a built-in theme.'),
    }
  }

  return null
}

/** The body the header leaves, measured against the tallest instruction. */
function bodyBoxFor(config: StudioConfig, ctx: StudioGenerateContext): Box {
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

/**
 * Entries this trim can carry.
 *
 * A longer bank needs a taller band and a denser grid at the same time, and the
 * narrow trims run out first — so the ceiling is a property of the page, not a
 * fixed number. Keeping the form honest here is what stops it offering a count
 * the sheet would then quietly step back down from.
 */
export function resolveWordCountMax(
  _config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): number {
  if (!layout) return WORD_FIT_COUNT_DEFAULT
  // Measured against the three supported trims, not estimated: these are the
  // counts whose grid still clears the handwriting floor once the bank has
  // taken its band.
  const shortSide = Math.min(layout.pageWidth, layout.pageHeight)
  if (shortSide <= 500) return 10
  if (shortSide <= 600) return 12
  return WORD_FIT_COUNT_MAX
}

/**
 * Largest lattice the page can print, from its width alone.
 *
 * Width is the hard ceiling — no bank can buy the grid more columns — and it is
 * the only dimension known before there is a bank to measure. Deliberately
 * generous: folding a *guessed* bank height in here caps the lattice below what
 * the packer needs, and every failed pack costs another full interlocking run,
 * which is the most expensive thing on the page.
 */
function widthLatticeCap(body: Box): number {
  return Math.max(5, Math.floor((body.width - 8) / MIN_WORD_FIT_CELL))
}

interface LaidOutPage {
  puzzle: WordFitPuzzle
  plan: BankPlan
  gridField: Box
  bankField: Box
}

/**
 * Build a puzzle and place it, or report that this word count will not fit.
 *
 * One pack in the ordinary case. The bank is planned from the real puzzle, the
 * grid takes what is left up to `MAX_GRID_SHARE`, and only if the cells come
 * out under the handwriting floor is a second, tighter lattice packed — this
 * time against a cap derived from the band the bank actually left, rather than
 * from a guess.
 */
function layOutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  resolved: ResolvedConfig
  pool: readonly string[]
  wordCount: number
}): LaidOutPage | null {
  const { config, ctx, resolved, pool, wordCount } = options
  const body = bodyBoxFor(config, ctx)

  const build = (maxSize: number, salt: string): LaidOutPage | null => {
    const puzzle = resolveWordFitPuzzle({
      mode: resolved.mode,
      wordCount,
      starters: resolved.starters,
      maxSize,
      drawBank: (attempt) => {
        const rng = studioPuzzleRng({
          templateKey: TEMPLATE_KEY,
          config,
          ctx,
          stream: `bank:${wordCount}:${salt}:${attempt}`,
        })
        const words =
          resolved.mode === 'numbers'
            ? numberBank(rng, wordCount, lengthLadder(wordCount))
            : drawSpreadWords(rng, pool, wordCount)
        return { rng, words }
      },
    })
    if (!puzzle) return null

    const plan = planWordBank({ fieldWidth: body.width, puzzle })
    // A square lattice is never taller than it is wide, so height past the body
    // width buys the grid nothing and is better left to the bank.
    const gridShare = Math.min(
      body.height * MAX_GRID_SHARE,
      body.width,
      Math.max(0, body.height - plan.height - GRID_BANK_GAP),
    )
    const [gridField, rest] = splitTop(body, Math.max(0, gridShare))
    const [, bankField] = splitTop(rest, GRID_BANK_GAP)
    return { puzzle, plan, gridField, bankField }
  }

  const fits = (page: LaidOutPage | null): boolean =>
    page !== null && wordFitCellSize(page.gridField, page.puzzle) >= MIN_WORD_FIT_CELL

  const first = build(widthLatticeCap(body), 'a')
  if (fits(first)) return first

  const heightCap = first
    ? Math.floor((first.gridField.height - 8) / MIN_WORD_FIT_CELL)
    : Math.floor(
        (Math.min(body.height * MAX_GRID_SHARE, body.width) -
          estimateBankHeight(wordCount) -
          GRID_BANK_GAP) /
          MIN_WORD_FIT_CELL,
      )
  const cap = Math.max(5, Math.min(widthLatticeCap(body), heightCap))
  const second = build(cap, 'b')
  return fits(second) ? second : null
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const resolved = resolveConfig(config)
  const font = String(config.fontFamily)
  const tag = cardTag(TEMPLATE_KEY, ctx)
  if (resolved.mode === 'numbers') void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const remote = ctx.remoteData as ThemeWordsResponse | undefined
  const pool = resolveWordPool({
    themeKey: resolved.themeKey,
    remoteWords: remote?.items,
  })

  const content = contentBox(ctx)

  /**
   * Step the word count down rather than print a page with no puzzle on it.
   *
   * `resolveWordCountMax` already stops the form asking for more than a trim
   * can hold, so this is the safety net under an unusual page — a very short
   * trim, a long title, a hand-set margin. Ten entries the reader can actually
   * write into beats twelve that did not fit.
   */
  let laidOut: LaidOutPage | null = null
  for (
    let wordCount = resolved.wordCount;
    wordCount >= WORD_FIT_COUNT_MIN && !laidOut;
    wordCount -= 2
  ) {
    laidOut = layOutPage({ config, ctx, resolved, pool, wordCount })
  }

  const styleRng = studioPuzzleRng({ templateKey: TEMPLATE_KEY, config, ctx, stream: 'style' })

  if (!laidOut) {
    // No single-solution grid this page can print legibly. The header alone is
    // a recoverable page; a grid too small to write in, or one whose key is
    // only one of several right answers, is a defect in a printed book.
    const header = drawCardPageHeader({
      content,
      config,
      tag,
      instruction: '',
      placement: INSTRUCTION_PLACEMENT,
      font,
    })
    return [{ pageRole: 'single', objects: header.objects }]
  }

  const { puzzle, plan, gridField, bankField } = laidOut
  const numbers = resolved.mode === 'numbers'
  const mode = `${numbers ? 'numbers' : 'words'}${puzzle.starters.length > 0 ? 'WithStarter' : ''}`
  const instruction = pickPhrase({
    templateKey: TEMPLATE_KEY,
    poolName: 'instruction',
    mode,
    pool: poolForMode(WORD_FIT_INSTRUCTIONS, mode),
    rng: styleRng,
  })

  const header = drawCardPageHeader({
    content,
    config,
    tag,
    instruction,
    placement: INSTRUCTION_PLACEMENT,
    font,
  })

  const grid = drawWordFitGrid({ field: gridField, puzzle, font, tag, vAlign: 'top' })!
  const bank = drawWordBank({ field: bankField, plan, puzzle, font, tag })
  const canonicalForm = wordFitCanonicalForm(puzzle)

  const objects: StudioFabricObject[] = [
    ...header.objects,
    wrapCardFigure({
      objects: [grid.object, ...(bank ? [bank] : [])],
      templateKey: TEMPLATE_KEY,
      canonicalHash: canonicalForm,
      tag,
    }),
  ]

  /**
   * The solution is the filled grid, centred in the full body. The bank is not
   * reprinted: every entry on it appears in the grid above, so printing it
   * again only invites the reader to re-solve the puzzle on the answer page.
   */
  const answerHeader = drawCardPageHeader({
    content,
    config,
    tag,
    instruction: '',
    placement: INSTRUCTION_PLACEMENT,
    font,
  })
  const answerGrid = drawWordFitGrid({
    field: answerHeader.body,
    puzzle,
    font,
    tag,
    vAlign: 'center',
  })
  const answerSourceObjects: StudioFabricObject[] = answerGrid
    ? [
        ...answerHeader.objects,
        wrapCardFigure({
          objects: [answerGrid.object],
          templateKey: TEMPLATE_KEY,
          canonicalHash: canonicalForm,
          tag,
        }),
      ]
    : objects

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const wordFitTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'Word Fit-In',
  category: 'word',
  description:
    'A crossword grid with no clues. Every word on the list beside it fits one place and one place only — work out where from its length and from the letters where words cross. Also sold as Fill-In or Kriss-Kross, and a large-print favourite because it stays solvable when clues no longer are. Pick a theme — a preset or one you type in — and the list is written fresh for every page, or switch to numbers for a page that needs no reading at all. Every grid is re-solved from its own word list before it prints, so the answer key is the only right answer. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  prefetch: wordFitPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.1">
      <rect x="6" y="4" width="8" height="8"/>
      <rect x="14" y="4" width="8" height="8"/>
      <rect x="22" y="4" width="8" height="8"/>
      <rect x="30" y="4" width="8" height="8"/>
      <rect x="22" y="12" width="8" height="8"/>
      <rect x="22" y="20" width="8" height="8"/>
      <rect x="30" y="20" width="8" height="8"/>
      <rect x="38" y="20" width="8" height="8"/>
      <rect x="14" y="20" width="8" height="8"/>
    </g>
    <g font-size="7" fill="currentColor" font-family="serif" text-anchor="middle">
      <text x="10" y="10.6">F</text>
      <text x="18" y="10.6">I</text>
      <text x="26" y="10.6">T</text>
    </g>
    <g stroke="currentColor" stroke-width="1.1">
      <path d="M6 33h10M6 37h14M46 33h12M46 37h9"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'mode',
      label: 'Fill the grid with',
      type: 'select',
      default: 'themed',
      options: [
        { label: 'Words from a theme', value: 'themed' },
        { label: 'Numbers (no reading needed)', value: 'numbers' },
      ],
    },
    {
      key: 'customTheme',
      label: 'Custom theme',
      type: 'toggle',
      default: false,
      visibleWhen: (config) => parseWordFitMode(config.mode) === 'themed',
      help: 'Turn on to type your own theme; AI writes a fresh word list for it every page.',
    },
    {
      key: 'theme',
      label: 'Theme',
      type: 'select',
      default: 'animals',
      options: listWordFitThemes().map((theme) => ({
        label: theme.label,
        value: theme.key,
      })),
      visibleWhen: (config) =>
        parseWordFitMode(config.mode) === 'themed' && config.customTheme !== true,
      help: 'Written fresh for every page, so a long book never repeats the same words.',
    },
    {
      key: 'customThemeText',
      label: 'Your theme',
      type: 'text',
      default: '',
      max: CUSTOM_THEME_MAX_LENGTH,
      placeholder: 'tools in a garden shed',
      visibleWhen: (config) =>
        parseWordFitMode(config.mode) === 'themed' && config.customTheme === true,
      help: `Short phrase the word list is written from (e.g. camping trip, bakery). Leave blank to fall back to the preset theme. Max ${CUSTOM_THEME_MAX_LENGTH} characters.`,
    },
    {
      key: 'wordCount',
      label: 'Words in the grid',
      type: 'number',
      default: WORD_FIT_COUNT_DEFAULT,
      min: WORD_FIT_COUNT_MIN,
      max: WORD_FIT_COUNT_MAX,
      step: 1,
      maxWhen: resolveWordCountMax,
      helpWhen: (config, layout) => {
        const max = resolveWordCountMax(config, layout)
        return max >= WORD_FIT_COUNT_MAX
          ? 'How many entries the grid holds.'
          : `Up to ${max} on this page size, so the grid and the list both stay large-print.`
      },
    },
    {
      key: 'starters',
      label: 'Entries filled in to start',
      type: 'number',
      default: 1,
      min: 0,
      max: WORD_FIT_STARTERS_MAX,
      step: 1,
      help: 'A starter gives the reader a foothold. Set 1 or more and the generator adds another only if a grid would otherwise have more than one right answer; set 0 and the grid always prints bare.',
    },
  ],
  validateConfig,
  generate,
}
