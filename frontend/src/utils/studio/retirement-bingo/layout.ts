import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_STROKE_BOLD,
} from '@/constants/studio.constants'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import {
  fabricTextHeight,
  isExactMeasurement,
  measureRunWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  BINGO_MIN_THEME_POOL,
  BINGO_SIZE,
  retirementBingoPool,
  type RetirementBingoMoment,
} from './content'
import type { RetirementBingoTheme } from './themes'

/**
 * Everything a bingo page decides on the seller's behalf.
 *
 * A card is a row of B-I-N-G-O letters, a five-by-five grid, and a short
 * write-in line under it. The only sizes that matter are the square and the
 * type inside it, and neither is a question a seller can answer: the square is
 * whatever the trim allows once the heading is set, and the type is the largest
 * size at which the theme's moments still fit that square in three short lines.
 *
 * The type size is planned against the whole theme rather than against the 24
 * moments a card happens to draw, so every card in a book prints at one size. A
 * book whose squares change type size from page to page looks like a book whose
 * pages were made by different people.
 */

export function ptToPx(pt: number): number {
  return Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
}

/**
 * Smallest square, in inches.
 *
 * About where three short lines at ten point still leave air inside the rules.
 * A 5 x 8 interior lands just above it; anything smaller is refused rather than
 * printed as a grid of squinting.
 */
const CELL_MIN_INCHES = 0.7
/**
 * Largest square. Past an inch and a half an 8.5 x 11 card reads as a poster,
 * and the phrases float in white space instead of filling their squares.
 */
const CELL_MAX_INCHES = 1.5

export const CELL_MIN = Math.round(DPI * CELL_MIN_INCHES)
export const CELL_MAX = Math.round(DPI * CELL_MAX_INCHES)

/**
 * Phrase type floor. Ten point is the smallest a moment may print; the planner
 * reaches for it only on the smallest trims, and reports the size it chose.
 */
export const PHRASE_FONT_MIN = ptToPx(10)
/** Phrase type ceiling — generous, but a square is not a headline. */
const PHRASE_FONT_MAX = ptToPx(18)
/** Type against square: keeps big trims from setting a phrase as one huge word. */
const PHRASE_FONT_CELL_RATIO = 0.19
export const PHRASE_LINE_HEIGHT = 1.1
/** Four lines in a square is a paragraph. */
export const PHRASE_MAX_LINES = 3

/**
 * Share of the theme that must fit before a size is accepted.
 *
 * One stubborn phrase should not shrink every square in the book, so the few
 * that will not fit at a size are simply not dealt on that trim. The share is
 * kept high on purpose: set lower, the planner buys a point of type by quietly
 * retiring the same long-ish phrases on every trim, and the bank shrinks for no
 * reader's benefit.
 */
const PHRASE_FIT_SHARE = 0.97

/** Padding inside a square, against square size. */
const CELL_PAD_RATIO = 0.08
const CELL_PAD_MIN = 5

const LETTER_FONT_RATIO = 0.34
const LETTER_FONT_MAX = ptToPx(28)
const LETTER_GAP_RATIO = 0.08
const LETTER_GAP_MIN = 6

const FOOTER_FONT_RATIO = 0.14
const FOOTER_FONT_MIN = ptToPx(11)
const FOOTER_FONT_MAX = ptToPx(14)
const FOOTER_GAP_RATIO = 0.22
const FOOTER_GAP_MIN = 14

/**
 * Air kept under the write-in line. Without it the rule lands on the safe line,
 * and estimated glyph widths in planning versus real ones in the browser are
 * enough to push it across.
 */
const BOTTOM_GUARD_RATIO = 0.1
const BOTTOM_GUARD_MIN = 8

/** Share of the page's spare height set above the card rather than below it. */
const SLACK_ABOVE_SHARE = 1 / 3

/**
 * Words a line should not end on. "Went to a / concert" reads as two thoughts;
 * "Went to / a concert" reads as one.
 */
const DANGLING_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'my', 'by', 'and',
])
/** Cost of a dangling line end, in ems of extra line width. */
const DANGLING_PENALTY_EM = 1.5

export interface RetirementBingoMetrics {
  cell: number
  pad: number
  /** Width a phrase line may measure — the square's inside, less a safety margin. */
  fitWidth: number
  /** Textbox width — wider than any line so Fabric never re-wraps one. */
  textBoxWidth: number
  /** Height a phrase block may take inside a square. */
  maxTextHeight: number
  letterFont: number
  letterGap: number
  /** Height of the B-I-N-G-O row, gap to the grid included. */
  letterRow: number
  footerFont: number
  footerGap: number
  footerHeight: number
  bottomGuard: number
}

export interface RetirementBingoPagePlan {
  metrics: RetirementBingoMetrics
  phraseFont: number
  /** Theme moments that fit a square at `phraseFont` — the only ones dealt. */
  pool: RetirementBingoMoment[]
  /** Pre-broken lines for every moment in `pool`, keyed by its text. */
  lines: Map<string, string[]>
  /** Left/top of the grid and of the letters above it. */
  gridLeft: number
  gridTop: number
  gridSize: number
  letterTop: number
  footerTop: number
}

export function retirementBingoMetrics(
  cell: number,
  spec: FontSpec = {},
): RetirementBingoMetrics {
  const pad = Math.max(CELL_PAD_MIN, Math.round(cell * CELL_PAD_RATIO))
  const inner = cell - pad * 2
  const safety = isExactMeasurement(spec) ? 2 : Math.max(3, Math.round(inner * 0.06))
  const letterFont = Math.min(LETTER_FONT_MAX, Math.round(cell * LETTER_FONT_RATIO))
  const letterGap = Math.max(LETTER_GAP_MIN, Math.round(cell * LETTER_GAP_RATIO))
  const footerFont = Math.min(
    FOOTER_FONT_MAX,
    Math.max(FOOTER_FONT_MIN, Math.round(cell * FOOTER_FONT_RATIO)),
  )
  return {
    cell,
    pad,
    fitWidth: Math.max(1, inner - safety),
    // Centred in the square, clear of the bold outer rule on the edge squares.
    textBoxWidth: cell - STUDIO_STROKE_BOLD * 2,
    maxTextHeight: inner,
    letterFont,
    letterGap,
    letterRow: Math.ceil(fabricTextHeight(1, letterFont, 1)) + letterGap,
    footerFont,
    footerGap: Math.max(FOOTER_GAP_MIN, Math.round(cell * FOOTER_GAP_RATIO)),
    footerHeight: Math.ceil(fabricTextHeight(1, footerFont, 1)),
    bottomGuard: Math.max(BOTTOM_GUARD_MIN, Math.round(cell * BOTTOM_GUARD_RATIO)),
  }
}

/** Letters row + grid + write-in line, top to bottom. */
function blockHeight(metrics: RetirementBingoMetrics): number {
  return (
    metrics.letterRow +
    metrics.cell * BINGO_SIZE +
    metrics.footerGap +
    metrics.footerHeight
  )
}

/** The safe printable column every bingo page lays out inside. */
export function retirementBingoContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function retirementBingoBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = retirementBingoContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/** Every way to cut `words` into `parts` runs, in order. */
function* splits(words: readonly string[], parts: number): Generator<string[]> {
  if (parts === 1) {
    yield [words.join(' ')]
    return
  }
  for (let cut = 1; cut <= words.length - parts + 1; cut++) {
    const head = words.slice(0, cut).join(' ')
    for (const rest of splits(words.slice(cut), parts - 1)) yield [head, ...rest]
  }
}

/**
 * A phrase broken into the fewest lines that fit, as evenly as possible.
 *
 * Greedy wrapping fills the first line and leaves a word stranded on the last —
 * "Took the long way / home" — which in a square reads as a mistake. Phrases
 * here are five words at most, so every break is simply tried: fewest lines
 * first, and among those the one whose longest line is shortest, with a line
 * ending on "a" or "the" counted as if it were an em and a half wider.
 *
 * Returns null when no break fits: a word wider than the square, or more lines
 * than a square holds. Words are never split mid-word — a hyphen the reader did
 * not expect is worse than the phrase not being dealt on this trim.
 */
export function wrapBingoPhrase(
  text: string,
  fontSize: number,
  maxWidth: number,
  spec: FontSpec = {},
  maxLines: number = PHRASE_MAX_LINES,
): string[] | null {
  const words = text.split(' ').filter(Boolean)
  if (words.length === 0) return null
  const width = new Map<string, number>()
  const measure = (line: string): number => {
    let w = width.get(line)
    if (w === undefined) {
      w = measureRunWidth(line, fontSize, spec)
      width.set(line, w)
    }
    return w
  }

  for (let lineCount = 1; lineCount <= Math.min(maxLines, words.length); lineCount++) {
    let best: string[] | null = null
    let bestScore = Number.POSITIVE_INFINITY
    for (const candidate of splits(words, lineCount)) {
      const widest = Math.max(...candidate.map(measure))
      if (widest > maxWidth) continue
      // "Browsed / a / bookshop": a line that is only "a" is not a break, it
      // is a phrase that does not fit.
      if (candidate.some((line) => DANGLING_WORDS.has(line.toLowerCase()))) continue
      const dangling = candidate
        .slice(0, -1)
        .filter((line) => DANGLING_WORDS.has(line.slice(line.lastIndexOf(' ') + 1).toLowerCase()))
        .length
      const score = widest + dangling * DANGLING_PENALTY_EM * fontSize
      if (score < bestScore) {
        best = candidate
        bestScore = score
      }
    }
    if (best) return best
  }
  return null
}

/** Height of a phrase block, the way Fabric will set it. */
export function phraseBlockHeight(lineCount: number, fontSize: number): number {
  return fabricTextHeight(lineCount, fontSize, PHRASE_LINE_HEIGHT)
}

/** Lines for every moment that fits a square at this size. */
function fitPool(
  pool: readonly RetirementBingoMoment[],
  metrics: RetirementBingoMetrics,
  fontSize: number,
  spec: FontSpec,
): Map<string, string[]> {
  const fitted = new Map<string, string[]>()
  for (const moment of pool) {
    const lines = wrapBingoPhrase(moment.text, fontSize, metrics.fitWidth, spec)
    if (!lines) continue
    if (phraseBlockHeight(lines.length, fontSize) > metrics.maxTextHeight) continue
    fitted.set(moment.text, lines)
  }
  return fitted
}

/**
 * The largest square the page holds, and the largest type that square takes.
 *
 * Square first: it is bounded by the column width and by the height left under
 * the heading, and a bigger square helps every phrase at once. Type second: the
 * largest size at which nine in ten of the theme's moments fit, never below the
 * floor. The few that do not fit are left out of this trim's deck rather than
 * printed small.
 *
 * Returns null when the square would fall below its floor, or when too few
 * moments fit even at the smallest type to keep cards in a book different from
 * each other — the form says so before generate is ever pressed.
 */
export function planRetirementBingoPage(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  theme: RetirementBingoTheme
  instruction: string
  font: string
}): RetirementBingoPagePlan | null {
  const { page, config, theme, instruction, font } = options
  const spec: FontSpec = { fontFamily: font }
  const themePool = retirementBingoPool(theme)
  if (themePool.length < BINGO_MIN_THEME_POOL) return null

  const field = retirementBingoBodyField(page, config, instruction)
  const widest = Math.min(CELL_MAX, Math.floor(field.width / BINGO_SIZE))

  let metrics: RetirementBingoMetrics | null = null
  for (let cell = widest; cell >= CELL_MIN; cell--) {
    const candidate = retirementBingoMetrics(cell, spec)
    if (blockHeight(candidate) <= field.height - candidate.bottomGuard) {
      metrics = candidate
      break
    }
  }
  if (!metrics) return null

  const fontMax = Math.max(
    PHRASE_FONT_MIN,
    Math.min(PHRASE_FONT_MAX, Math.round(metrics.cell * PHRASE_FONT_CELL_RATIO)),
  )
  let chosen: { fontSize: number; lines: Map<string, string[]> } | null = null
  for (let fontSize = fontMax; fontSize >= PHRASE_FONT_MIN; fontSize--) {
    const lines = fitPool(themePool, metrics, fontSize, spec)
    const enough = lines.size >= BINGO_MIN_THEME_POOL
    if (enough && lines.size >= themePool.length * PHRASE_FIT_SHARE) {
      chosen = { fontSize, lines }
      break
    }
    if (fontSize === PHRASE_FONT_MIN && enough) chosen = { fontSize, lines }
  }
  if (!chosen) return null

  // Spare height goes mostly below the card. Centred, a width-bound card
  // floats away from its own instructions; a third above keeps the two reading
  // as one block while the page still looks set rather than top-loaded.
  const gridSize = metrics.cell * BINGO_SIZE
  const usable = field.height - metrics.bottomGuard
  const slack = Math.max(0, usable - blockHeight(metrics))
  const blockTop = field.top + Math.floor(slack * SLACK_ABOVE_SHARE)
  const gridLeft = Math.round(field.left + (field.width - gridSize) / 2)
  const gridTop = blockTop + metrics.letterRow

  return {
    metrics,
    phraseFont: chosen.fontSize,
    pool: themePool.filter((moment) => chosen.lines.has(moment.text)),
    lines: chosen.lines,
    gridLeft,
    gridTop,
    gridSize,
    letterTop: blockTop,
    footerTop: gridTop + gridSize + metrics.footerGap,
  }
}

function inches(px: number): string {
  return `${Math.round((px / DPI) * 100) / 100} in`
}

/** What this theme prints on the page size currently set in Settings. */
export function retirementBingoPrintNote(options: {
  theme: RetirementBingoTheme
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
}): string {
  const { theme, page, config, instruction, font } = options
  const deck = retirementBingoPool(theme).length

  if (!page) {
    return (
      `One 5 x 5 card a page, 24 moments drawn from ${deck}, with a free NAP ` +
      'square in the middle. No answer page is needed.'
    )
  }

  const plan = planRetirementBingoPage({ page, config, theme, instruction, font })
  if (!plan) {
    return (
      'This page size is too small for a bingo card — the squares would print ' +
      'below a comfortable reading size. Choose a larger page in Settings.'
    )
  }

  const pt = Math.round((plan.phraseFont * PDF_POINTS_PER_INCH) / DPI)
  return (
    `One card a page: ${inches(plan.metrics.cell)} squares, moments at ${pt} pt. ` +
    `Each card draws 24 of ${plan.pool.length} moments, so cards in a book stay ` +
    'different. No answer page is needed.'
  )
}
