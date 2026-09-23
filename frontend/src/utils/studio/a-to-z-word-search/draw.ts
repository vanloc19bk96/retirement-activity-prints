import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK } from '@/constants/studio.constants'
import { boxCenterX, toNonBreakingSpaces, unionObjectBounds, type Box } from '../studio-layout'
import { buildGroup, buildText, type StudioTag } from '../studio-fabric-builders'
import { hugTextBoxWidth, measureRunWidth, type FontSpec } from '../studio-text-metrics'
import { ptToPx } from '../retirement-word-search/layout'
import { ALPHABET, ATOZ_WORD_COUNT } from './content'

/**
 * The band under the grid: twenty-six letters on the puzzle page, and the same
 * twenty-six with their words on the solution page.
 *
 * Both are laid out by this module, at the same reading order and cell pitch,
 * because the two pages are read against each other. A solution whose letters
 * run in a different order from the puzzle's is a solution a reader has to
 * search rather than scan.
 *
 * Every cell is measured before anything is drawn, and every drawn run is a
 * single word with no spaces in it — a letter, and a word. Fabric re-wraps
 * anything wider than its textbox, and a band whose items could re-wrap is a
 * band that prints a second line where the page reserved none, on top of the
 * row below it.
 */

/**
 * Large-print floor and ceiling for the band.
 *
 * The floor is where an answer list stops being readable by the audience this
 * book is sold to; the ceiling is where it stops reading as a reference band and
 * starts competing with the grid above it. The bare alphabet sets larger than
 * the answer list, because on the puzzle page those letters *are* the word list
 * — they are what the solver's eye returns to after every find.
 */
export const ATOZ_LIST_MIN_SIZE = ptToPx(11)
export const ATOZ_LIST_MAX_SIZE = ptToPx(14)
export const ATOZ_LETTERS_MAX_SIZE = ptToPx(16)

/** Fabric paints a textbox taller than `fontSize`; keep caps off the row below. */
const ROW_HEIGHT_RATIO = 1.35
const ROW_GAP = 8
/**
 * Narrowest gap two columns may be packed to before the count is given up.
 *
 * The bare alphabet gets the smaller figure because its cells are single
 * capitals: at the answer list's gap, thirteen of them do not fit a 6 x 9 column
 * and the strip breaks into three rows of twelve, twelve and two. The drawn gap
 * is almost always wider than either number — `gutterFor` spreads the columns to
 * fill the band — so this only decides how hard a count is tried.
 */
const MIN_LETTER_GUTTER = 12
const MIN_ANSWER_GUTTER = 18
/** Air between the bold letter and the word it stands for. */
const LETTER_SLOT_GAP = 8

/**
 * How far the columns may be spread to fill the band.
 *
 * The bare alphabet is twenty-six narrow cells and reads as a rule ruled across
 * the page, so it is allowed to spread; an answer list is already wide and would
 * only come apart. Both are bounded by the band itself, so neither can grow past
 * the column it is centred in.
 */
const LETTER_SPREAD_RATIO = 2.5
const ANSWER_SPREAD_RATIO = 0.5

/**
 * Columns each band is worth splitting into.
 *
 * Thirteen is the alphabet in two even rows — the shape a reader recognises as
 * "the alphabet" rather than as a table. Five is as far as an answer list goes
 * before a column is too narrow for the longest word this lexicon holds.
 */
const LETTERS_MAX_COLUMNS = 13
const ANSWERS_MAX_COLUMNS = 5

/**
 * The caption over the band.
 *
 * A row of bare letters under a letter grid is not self-explanatory to someone
 * meeting this puzzle for the first time, and the audience for a retirement
 * activity book meets it for the first time most of the time. The instruction at
 * the top says what to do; this says which block to do it with, at the moment
 * the solver's eye leaves the grid. It is also the only thing left explaining the
 * puzzle when the instruction strip is switched off.
 */
export const ATOZ_LETTERS_CAPTION = 'Find a word beginning with each letter'
export const ATOZ_ANSWERS_CAPTION = 'Answers'
export const CAPTION_SIZE = ptToPx(12)
export const CAPTION_GAP = 10

/** Air between the grid and the band under it. */
export const GRID_LIST_GAP = 22

export type AtoZListMode = 'letters' | 'answers'

export interface AtoZListItem {
  letter: string
  /** Absent on the puzzle page, where only the letter prints. */
  word?: string
}

export interface AtoZListPlan {
  mode: AtoZListMode
  fontSize: number
  columnCount: number
  rowCount: number
  /** Width of one item cell — uniform, so words line up down every column. */
  cellWidth: number
  /** Width reserved for the bold letter before its word starts. */
  letterSlot: number
  gutter: number
  rowHeight: number
  /** Print order, row by row. */
  items: AtoZListItem[]
  captioned: boolean
  caption: string
  /** Height the drawn band occupies, caption included. */
  height: number
  /** Width the drawn band occupies — centred in the band it is given. */
  blockWidth: number
}

export function atoZWordSpec(font: string): FontSpec {
  return { fontFamily: font, fontWeight: 'normal' }
}

export function atoZLetterSpec(font: string): FontSpec {
  return { fontFamily: font, fontWeight: 700 }
}

export function captionHeight(captioned: boolean): number {
  return captioned ? CAPTION_SIZE + CAPTION_GAP : 0
}

export function atoZRowHeight(fontSize: number): number {
  return Math.ceil(fontSize * ROW_HEIGHT_RATIO)
}

/** Widest capital in this face — the slot every letter has to fit. */
function widestLetterWidth(fontSize: number, font: string): number {
  const spec = atoZLetterSpec(font)
  return ALPHABET.reduce(
    (max, letter) => Math.max(max, measureRunWidth(letter, fontSize, spec)),
    0,
  )
}

/**
 * Widest of `words`, as printed — measured, never counted.
 *
 * A letter count cannot answer this: nine capitals of one word are narrower than
 * seven of another, and the band's column count turns on the difference. The
 * callers hand it the widest word the lexicon could produce, so a band planned
 * here holds every draw the page can make.
 */
export function widestWordWidth(
  words: readonly string[],
  fontSize: number,
  font: string,
): number {
  const spec = atoZWordSpec(font)
  return Math.ceil(
    words.reduce(
      (max, word) => Math.max(max, measureRunWidth(word.toUpperCase(), fontSize, spec)),
      0,
    ),
  )
}

/** Width of one item cell. `wordWidth` of 0 plans the bare alphabet. */
export function atoZCellWidth(options: {
  fontSize: number
  font: string
  wordWidth: number
}): { cellWidth: number; letterSlot: number } {
  const { fontSize, font, wordWidth } = options
  const letterWidth = Math.ceil(widestLetterWidth(fontSize, font))
  if (wordWidth <= 0) return { cellWidth: letterWidth, letterSlot: letterWidth }
  const letterSlot = letterWidth + LETTER_SLOT_GAP
  return { cellWidth: letterSlot + wordWidth, letterSlot }
}

function maxColumnsFor(mode: AtoZListMode): number {
  return mode === 'letters' ? LETTERS_MAX_COLUMNS : ANSWERS_MAX_COLUMNS
}

function minGutterFor(mode: AtoZListMode): number {
  return mode === 'letters' ? MIN_LETTER_GUTTER : MIN_ANSWER_GUTTER
}

/**
 * True when `columnCount` leaves a last row worth printing.
 *
 * Twenty-six divides evenly by two and thirteen and by nothing else useful, so
 * some raggedness is unavoidable and a word bank lives with it. A stub is only a
 * problem when it is a *stub*: twelve letters, twelve letters, then two on a line
 * of their own does not read as the alphabet, it reads as a mistake.
 */
function lastRowIsWorthIt(columnCount: number, itemCount: number): boolean {
  const remainder = itemCount % columnCount
  return remainder === 0 || remainder * 2 >= columnCount
}

/**
 * Columns of `cellWidth` this band holds, or 0 when one cell will not fit.
 *
 * The alphabet strip also gives up a column or two to avoid a stub row, because
 * its height is never what the page is short of — the band it sits in was
 * reserved for the taller answer list. The answer list takes every column it can
 * get: a column there is a row saved, and a row saved is height the grid keeps.
 */
function columnsFor(
  bandWidth: number,
  cellWidth: number,
  mode: AtoZListMode,
  itemCount: number,
): number {
  if (cellWidth > bandWidth) return 0
  const gutter = minGutterFor(mode)
  const fits = Math.floor((bandWidth + gutter) / (cellWidth + gutter))
  const cap = Math.max(1, Math.min(fits, maxColumnsFor(mode), Math.max(1, itemCount)))
  if (mode !== 'letters') return cap
  for (let count = cap; count > 1; count--) {
    if (lastRowIsWorthIt(count, itemCount)) return count
  }
  return cap
}

/** Gutter that spreads `columnCount` cells across the band, within bounds. */
function gutterFor(
  bandWidth: number,
  cellWidth: number,
  columnCount: number,
  mode: AtoZListMode,
): number {
  if (columnCount <= 1) return 0
  const spread = Math.floor((bandWidth - cellWidth * columnCount) / (columnCount - 1))
  const ratio = mode === 'letters' ? LETTER_SPREAD_RATIO : ANSWER_SPREAD_RATIO
  return Math.max(minGutterFor(mode), Math.min(spread, Math.round(cellWidth * ratio)))
}

function bandHeight(rowCount: number, fontSize: number, captioned: boolean): number {
  const rows = Math.max(1, rowCount)
  return (
    rows * atoZRowHeight(fontSize) +
    Math.max(0, rows - 1) * ROW_GAP +
    captionHeight(captioned)
  )
}

/**
 * Shortest the band can ever be, for the widest word this page could draw.
 *
 * This is what `layout.ts` subtracts from the page before it sizes the grid, so
 * it has to be a floor for *both* pages. It is measured from the answer list
 * because the answer list is always the taller of the two — twenty-six words in
 * a handful of columns against twenty-six letters in thirteen. Null means one
 * answer cell is wider than the whole band, and the page says so rather than
 * printing a list that runs off the margin.
 *
 * The caption is *not* included, and that is a deliberate trade. Reserving its
 * twenty-six pixels up front costs a 6 x 9 interior — the trim most of these
 * books are sold in — its entire puzzle: the grid lands one pixel per cell under
 * the large-print pitch and the page refuses. So the floor is measured without
 * it, and the answer list drops its own caption on the tightest trims to make
 * room. A solution page headed "Solution Game 4" whose block of answers carries
 * no second label is a page nobody notices; no puzzle at all on a 6 x 9 is a
 * game half this library's sellers cannot use. Preflight reports the drop as a
 * warning, and the puzzle page's own caption is never given up — it is the only
 * thing on that page explaining what the letters are for.
 */
export function minAtoZBandHeight(options: {
  bandWidth: number
  font: string
  worstWords: readonly string[]
}): number | null {
  const { bandWidth, font, worstWords } = options
  const { cellWidth } = atoZCellWidth({
    fontSize: ATOZ_LIST_MIN_SIZE,
    font,
    wordWidth: widestWordWidth(worstWords, ATOZ_LIST_MIN_SIZE, font),
  })
  const columnCount = columnsFor(bandWidth, cellWidth, 'answers', ATOZ_WORD_COUNT)
  if (columnCount === 0) return null
  return bandHeight(Math.ceil(ATOZ_WORD_COUNT / columnCount), ATOZ_LIST_MIN_SIZE, false)
}

function planAtSize(options: {
  items: readonly AtoZListItem[]
  mode: AtoZListMode
  bandWidth: number
  fontSize: number
  font: string
  caption: string
  captioned: boolean
}): AtoZListPlan | null {
  const { items, mode, bandWidth, fontSize, font, caption, captioned } = options
  const words =
    mode === 'answers'
      ? items.map((item) => item.word ?? '').filter(Boolean)
      : []
  const { cellWidth, letterSlot } = atoZCellWidth({
    fontSize,
    font,
    wordWidth: widestWordWidth(words, fontSize, font),
  })
  const columnCount = columnsFor(bandWidth, cellWidth, mode, items.length)
  if (columnCount === 0) return null
  const rowCount = Math.ceil(items.length / columnCount)
  const gutter = gutterFor(bandWidth, cellWidth, columnCount, mode)
  return {
    mode,
    fontSize,
    columnCount,
    rowCount,
    cellWidth,
    letterSlot,
    gutter,
    rowHeight: atoZRowHeight(fontSize),
    items: [...items],
    captioned,
    caption,
    height: bandHeight(rowCount, fontSize, captioned),
    blockWidth: cellWidth * columnCount + gutter * (columnCount - 1),
  }
}

/**
 * Largest large-print size at which the whole band fits `maxHeight`.
 *
 * Null when even the floor overflows, which the caller answers by refusing the
 * page rather than by setting the answers at nine point. Item count is not a
 * lever here the way a word bank's is: this puzzle is the alphabet, so it is
 * twenty-six items or it is a different puzzle.
 */
export function planAtoZList(options: {
  items: readonly AtoZListItem[]
  mode: AtoZListMode
  bandWidth: number
  maxHeight: number
  font: string
  caption?: string
  maxFontSize?: number
  minFontSize?: number
}): AtoZListPlan | null {
  const { items, mode, bandWidth, maxHeight, font } = options
  if (items.length === 0) return null
  const caption = options.caption ?? ''
  const minSize = Math.max(1, options.minFontSize ?? ATOZ_LIST_MIN_SIZE)
  const ceiling = Math.max(
    minSize,
    Math.round(
      options.maxFontSize ??
        (mode === 'letters' ? ATOZ_LETTERS_MAX_SIZE : ATOZ_LIST_MAX_SIZE),
    ),
  )

  for (let fontSize = ceiling; fontSize >= minSize; fontSize--) {
    // The caption is the cheapest thing to give up, so it is given up last:
    // every size is tried with it before any size is tried without.
    for (const captioned of caption ? [true, false] : [false]) {
      const plan = planAtSize({
        items,
        mode,
        bandWidth,
        fontSize,
        font,
        caption,
        captioned,
      })
      if (plan && plan.height <= maxHeight) return plan
    }
  }
  return null
}

/**
 * Paint a planned band at `area`, centred in the column.
 *
 * One group per row, so a seller can nudge a row on the canvas without taking
 * the whole band apart, and the caption stays ungrouped so it can be retyped or
 * removed without ungrouping anything.
 */
export function drawAtoZList(
  plan: AtoZListPlan,
  area: Box,
  font: string,
  tag: StudioTag,
): StudioFabricObject[] {
  const objects: StudioFabricObject[] = []
  const letterSpec = atoZLetterSpec(font)
  const wordSpec = atoZWordSpec(font)

  if (plan.captioned && plan.caption) {
    objects.push(
      buildText(
        {
          left: boxCenterX(area),
          top: area.top,
          text: toNonBreakingSpaces(plan.caption),
          fontFamily: font,
          fontSize: CAPTION_SIZE,
          fontWeight: 700,
          width: hugTextBoxWidth(plan.caption, CAPTION_SIZE, area.width, {
            ...wordSpec,
            fontWeight: 700,
          }),
          textAlign: 'center',
          originX: 'center',
          lineHeight: 1,
          fill: STUDIO_INK,
        },
        tag,
        'decoration',
      ),
    )
  }

  const left = area.left + Math.max(0, Math.round((area.width - plan.blockWidth) / 2))
  let top = area.top + captionHeight(plan.captioned)

  for (let row = 0; row < plan.rowCount; row++) {
    const slice = plan.items.slice(row * plan.columnCount, (row + 1) * plan.columnCount)
    if (slice.length === 0) continue

    const parts: StudioFabricObject[] = []
    slice.forEach((item, column) => {
      const cellLeft = left + column * (plan.cellWidth + plan.gutter)
      parts.push(
        buildText(
          {
            left: cellLeft,
            top,
            text: item.letter,
            fontFamily: font,
            fontSize: plan.fontSize,
            fontWeight: 700,
            width: hugTextBoxWidth(item.letter, plan.fontSize, plan.cellWidth, letterSpec),
            height: plan.rowHeight,
            textAlign: 'left',
            originX: 'left',
            lineHeight: 1,
            fill: STUDIO_INK,
          },
          tag,
          // The alphabet is this puzzle's word list, so the letters are prompt
          // copy on the puzzle page and the labels their answers hang off on
          // the solution page.
          'prompt',
        ),
      )
      if (!item.word) return
      const word = item.word.toUpperCase()
      parts.push(
        buildText(
          {
            left: cellLeft + plan.letterSlot,
            top,
            text: word,
            fontFamily: font,
            fontSize: plan.fontSize,
            fontWeight: 'normal',
            width: hugTextBoxWidth(
              word,
              plan.fontSize,
              Math.max(1, plan.cellWidth - plan.letterSlot),
              wordSpec,
            ),
            height: plan.rowHeight,
            textAlign: 'left',
            originX: 'left',
            lineHeight: 1,
            fill: STUDIO_INK,
          },
          tag,
          'prompt',
        ),
      )
    })

    const bounds = unionObjectBounds(parts)
    if (bounds) objects.push(buildGroup(parts, bounds, tag))
    top += plan.rowHeight + ROW_GAP
  }

  return objects
}
