import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK } from '@/constants/studio.constants'
import { boxCenterX, columns, unionObjectBounds, type Box } from '../studio-layout'
import { buildGroup, buildText, type StudioTag } from '../studio-fabric-builders'
import {
  fabricTextHeight,
  hugTextBoxWidth,
  measureRunWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import { ptToPx } from '../retirement-word-search/layout'

/**
 * The numbered list that sits under the grid — clues on the puzzle page,
 * answers on the solution page.
 *
 * Every line is broken here rather than left to Fabric. A Textbox re-wraps
 * anything wider than its declared width, so a list laid out against estimated
 * widths can come back a line taller than the space reserved for it — which on
 * a printed page is a clue sitting on top of the one below it. Breaking with
 * the same metrics Fabric measures with, and then reserving exactly the lines
 * that came out, is what makes the band's height a fact rather than a hope.
 *
 * Both lists share this module on purpose. A solution page whose numbering,
 * column order or type disagrees with the puzzle page is the one fault a reader
 * cannot work around, because the page they check against is the page that is
 * wrong.
 */

/**
 * Large-print floor and ceiling for list text.
 *
 * KDP will print anything. An activity book sold to readers in their seventies
 * that sets its clues at nine point comes back as a one-star review about the
 * type, not about the puzzles. The ceiling is where two columns of prose stop
 * reading as a clue list and start reading as a poster.
 */
export const CLUE_MIN_SIZE = ptToPx(11)
export const CLUE_MAX_SIZE = ptToPx(14)

/** Leading inside one clue, and the air between two clues. */
export const CLUE_LINE_HEIGHT = 1.25
export const CLUE_BLOCK_GAP = 9
export const CLUE_COLUMN_GUTTER = 26

/**
 * Gap between two shrink-wrapped columns, as a share of their drawn width.
 *
 * Only ever widens `CLUE_COLUMN_GUTTER`, and only when the columns came in
 * under their measure. Two short answer columns set a hair apart read as one
 * ragged column; half their own width apart, they read as two.
 */
const COLUMN_GAP_RATIO = 0.5

/**
 * Lines one clue may take.
 *
 * Three-line clues are what turn a numbered list into a wall of prose, and in a
 * two-column layout they are also what makes the two columns end at visibly
 * different heights. The page therefore treats it as a ceiling on the *page*,
 * not on the writer: a clue that would take a third line is dropped from the
 * pool while substitutes remain, which is why the pool is over-requested.
 */
export const MAX_CLUE_LINES = 2

/**
 * The caption over the list, and the room it takes.
 *
 * A block of numbered sentences under a letter grid is not self-explanatory to
 * someone meeting this puzzle for the first time, and the audience for a
 * retirement activity book meets it for the first time most of the time. The
 * instruction at the top says what to do; this says which block to do it with,
 * at the moment the solver's eye leaves the grid.
 */
export const CLUES_CAPTION = 'Clues'
export const ANSWERS_CAPTION = 'Answers'
export const CAPTION_SIZE = ptToPx(12)
export const CAPTION_GAP = 10

/** Air between the grid and the list under it. */
export const GRID_LIST_GAP = 24

/**
 * Narrowest clue a two-column layout is worth having.
 *
 * Measured rather than guessed: a column is only usable if a clue of this many
 * characters still fits the lines the page allows one clue. Without the floor a
 * wide trim at a large type size splits into two columns that hold six words
 * each, and every clue in the book wraps twice.
 */
const MIN_CLUE_CHARS_PER_COLUMN = 34

/** Columns a list of prose is worth splitting into, before width is considered. */
const MAX_LIST_COLUMNS = 2

export function listFontSpec(font: string): FontSpec {
  return { fontFamily: font, fontWeight: 'normal' }
}

export function clueColumnWidth(bandWidth: number, columnCount: number): number {
  const count = Math.max(1, columnCount)
  return Math.max(1, (bandWidth - CLUE_COLUMN_GUTTER * (count - 1)) / count)
}

/** Height one list item occupies, excluding the gap under it. */
export function clueItemHeight(lines: number, fontSize: number): number {
  return Math.ceil(fabricTextHeight(lines, fontSize, CLUE_LINE_HEIGHT))
}

/** Room the caption claims above the list, or zero when it is switched off. */
export function captionHeight(captioned: boolean): number {
  return captioned ? CAPTION_SIZE + CAPTION_GAP : 0
}

/**
 * A clue shaped like the longest one the page could be handed.
 *
 * Built from `n` rather than real prose: `n` is close to the average advance of
 * a lower-case serif glyph, and a synthetic clue made of it pays for no spaces,
 * which is the pessimistic direction. The numbering and the letter count are
 * included because both print on the same line.
 */
export function worstClueLine(chars: number): string {
  return `14. ${'n'.repeat(Math.max(1, chars))} (9)`
}

/**
 * Columns this band can hold at this type size, at most `MAX_LIST_COLUMNS`.
 *
 * A second column halves the height of the block, which is height the grid
 * gets back — so it is tried first and given up only when a column that narrow
 * could not hold a clue worth printing.
 */
export function listColumnsFor(
  bandWidth: number,
  fontSize: number,
  spec: FontSpec,
  itemCount: number,
): number {
  const floor = measureRunWidth(worstClueLine(MIN_CLUE_CHARS_PER_COLUMN), fontSize, spec)
  for (let count = Math.min(MAX_LIST_COLUMNS, Math.max(1, itemCount)); count > 1; count--) {
    const wrapWidth = wrapSafeWidth(clueColumnWidth(bandWidth, count), spec)
    if (wrapWidth * MAX_CLUE_LINES >= floor) return count
  }
  return 1
}

/** Lines one line of copy takes in a column of `wrapWidth`. */
export function measureClueLines(
  text: string,
  fontSize: number,
  wrapWidth: number,
  spec: FontSpec,
): number {
  return wrapTextToWidth(text, fontSize, wrapWidth, spec).length
}

/**
 * Tallest a list of `itemCount` items can be at this size and column count.
 *
 * A genuine upper bound, not an average: every item is budgeted at the page's
 * own line ceiling, and no item that exceeds it ever reaches the page, because
 * `selectTriviaEntries` drops it first. That is what lets `layout.ts` size a
 * grid against a clue list that has not been written yet.
 */
export function reserveListHeight(options: {
  itemCount: number
  fontSize: number
  columnCount: number
  captioned: boolean
  linesPerItem?: number
}): number {
  const { itemCount, fontSize, columnCount, captioned } = options
  const linesPerItem = options.linesPerItem ?? MAX_CLUE_LINES
  const rows = Math.ceil(Math.max(1, itemCount) / Math.max(1, columnCount))
  const item = clueItemHeight(linesPerItem, fontSize)
  return rows * item + Math.max(0, rows - 1) * CLUE_BLOCK_GAP + captionHeight(captioned)
}

interface ListItem {
  /** Hard-wrapped, newline-joined — Fabric will not re-break it. */
  text: string
  lines: number
  height: number
  /** Width this item's longest line actually measures, plus Fabric's slack. */
  width: number
}

export interface TriviaListPlan {
  fontSize: number
  columnCount: number
  /** The measure lines were wrapped to — what a clue column may run to. */
  columnWidth: number
  /**
   * The measure the columns are *drawn* at: the widest line the list really
   * holds, never more than `columnWidth`.
   */
  drawWidth: number
  /** Space between drawn columns, opened up as the columns shrink-wrap. */
  gutter: number
  /** Items in printed order; `breaks[i]` is where column i+1 starts. */
  items: ListItem[]
  breaks: number[]
  captioned: boolean
  caption: string
  /** Height the drawn block occupies, caption included. */
  height: number
}

function planItems(
  lines: readonly string[],
  fontSize: number,
  columnWidth: number,
  spec: FontSpec,
): ListItem[] {
  const wrapWidth = wrapSafeWidth(columnWidth, spec)
  return lines.map((line) => {
    const wrapped = wrapTextToWidth(line, fontSize, wrapWidth, spec)
    const text = wrapped.join('\n')
    return {
      text,
      lines: wrapped.length,
      height: clueItemHeight(wrapped.length, fontSize),
      // Hugging the measured run, never past the column the lines were broken
      // to — so a box can only ever get narrower than the wrap measure, and
      // Fabric has no reason to re-break a line the plan already counted.
      width: hugTextBoxWidth(text, fontSize, columnWidth, spec),
    }
  })
}

/**
 * Split the items so the two columns end as close together as possible.
 *
 * Reading order stays top-to-bottom, left-to-right: a numbered list that runs
 * 1, 3, 5 down the left column is a list a reader has to decode before they can
 * use it. Balancing by measured height rather than by count is what keeps a
 * column of two-line clues from overhanging a column of one-line clues.
 */
function balanceColumns(items: ListItem[], columnCount: number): number[] {
  if (columnCount <= 1 || items.length <= 1) return []
  const stacked = items.map((item) => item.height + CLUE_BLOCK_GAP)
  const total = stacked.reduce((sum, height) => sum + height, 0)
  const breaks: number[] = []
  let used = 0
  let index = 0
  for (let column = 1; column < columnCount; column++) {
    const target = (total * column) / columnCount
    // Take items while the running total is closer to the target with them
    // than without — the split that minimises the taller column.
    while (
      index < items.length - (columnCount - column) &&
      Math.abs(used + stacked[index]! - target) < Math.abs(used - target)
    ) {
      used += stacked[index]!
      index += 1
    }
    breaks.push(index)
  }
  return breaks
}

function columnHeights(items: ListItem[], breaks: number[]): number[] {
  const bounds = [0, ...breaks, items.length]
  const heights: number[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const slice = items.slice(bounds[i]!, bounds[i + 1]!)
    const stacked = slice.reduce((sum, item) => sum + item.height, 0)
    heights.push(stacked + Math.max(0, slice.length - 1) * CLUE_BLOCK_GAP)
  }
  return heights
}

/**
 * Shrink-wrap the columns to the widest line the list really holds.
 *
 * A clue column is prose and fills its measure, so this changes almost nothing
 * for the puzzle page. An answer column is "1. KNITTING" — a third of the same
 * measure — and drawn at the full width it gives every answer a text box several
 * times wider than its own ink, sitting against the left edge of a half-page
 * column. That reads as a list that slid off to the left, which is exactly what
 * it is.
 *
 * As the columns narrow the gutter opens up to keep them from jamming together,
 * bounded so the block can never grow wider than the band it is centred in.
 *
 * The wrap slack survives the shrink. Lines were broken at `wrapSafeWidth` —
 * several percent inside the column — because our metrics and Fabric's own
 * grapheme path disagree by about that much. Hugging the widest measured line
 * hands that margin back, and a prose clue the plan counted as one line then
 * re-breaks on the canvas into a second line nobody reserved height for, which
 * prints on top of the clue below it. Carrying the same slack into the drawn
 * width costs the answer column a few pixels and costs the clue column nothing:
 * prose fills its measure, so the cap puts it back at the full column.
 */
function fitBlockWidths(
  items: readonly ListItem[],
  columnWidth: number,
  columnCount: number,
  bandWidth: number,
  spec: FontSpec,
): { drawWidth: number; gutter: number } {
  const widest = items.reduce((max, item) => Math.max(max, item.width), 0)
  const slack = Math.max(0, columnWidth - wrapSafeWidth(columnWidth, spec))
  const drawWidth = Math.max(1, Math.min(columnWidth, Math.ceil(widest + slack)))
  if (columnCount <= 1) return { drawWidth, gutter: 0 }

  const room = (bandWidth - drawWidth * columnCount) / (columnCount - 1)
  const gutter = Math.max(
    CLUE_COLUMN_GUTTER,
    Math.min(Math.round(drawWidth * COLUMN_GAP_RATIO), Math.floor(room)),
  )
  return { drawWidth, gutter }
}

function planAtSize(options: {
  lines: readonly string[]
  width: number
  fontSize: number
  spec: FontSpec
  caption: string
  captioned: boolean
}): TriviaListPlan {
  const { lines, width, fontSize, spec, caption, captioned } = options
  const columnCount = listColumnsFor(width, fontSize, spec, lines.length)
  const columnWidth = clueColumnWidth(width, columnCount)
  const items = planItems(lines, fontSize, columnWidth, spec)
  const breaks = balanceColumns(items, columnCount)
  const tallest = Math.max(...columnHeights(items, breaks))
  const { drawWidth, gutter } = fitBlockWidths(items, columnWidth, columnCount, width, spec)
  return {
    fontSize,
    columnCount,
    columnWidth,
    drawWidth,
    gutter,
    items,
    breaks,
    captioned,
    caption,
    height: tallest + captionHeight(captioned),
  }
}

/**
 * Largest large-print size at which the whole list fits `maxHeight`.
 *
 * Returns null when even the floor overflows. Null is not a failure to
 * apologise for: the caller answers it by printing one clue fewer, which is a
 * page a reader never notices, where setting the clues at ten point is a page
 * they review.
 */
export function planTriviaList(options: {
  lines: readonly string[]
  width: number
  maxHeight: number
  font: string
  preferredFontSize?: number
  minFontSize?: number
  caption?: string
}): TriviaListPlan | null {
  const { lines, width, maxHeight, font } = options
  if (lines.length === 0) return null
  const spec = listFontSpec(font)
  const caption = options.caption ?? ''
  const minSize = Math.max(1, options.minFontSize ?? CLUE_MIN_SIZE)
  const ceiling = Math.max(minSize, Math.round(options.preferredFontSize ?? CLUE_MAX_SIZE))

  for (let fontSize = ceiling; fontSize >= minSize; fontSize--) {
    // The caption is the cheapest thing to give up, so it is given up last:
    // every size is tried with it before any size is tried without.
    for (const captioned of caption ? [true, false] : [false]) {
      const plan = planAtSize({ lines, width, fontSize, spec, caption, captioned })
      if (plan.height <= maxHeight) return plan
    }
  }
  return null
}

/**
 * Paint a planned list at `area`, centred in the column.
 *
 * Each column is its own group so a seller can nudge one without the other,
 * and the caption stays ungrouped so it can be retyped or removed on the
 * canvas without ungrouping the clues.
 */
export function drawTriviaList(
  plan: TriviaListPlan,
  area: Box,
  font: string,
  tag: StudioTag,
): StudioFabricObject[] {
  const objects: StudioFabricObject[] = []
  const spec = listFontSpec(font)

  if (plan.captioned && plan.caption) {
    objects.push(
      buildText(
        {
          left: boxCenterX(area),
          top: area.top,
          text: plan.caption,
          fontFamily: font,
          fontSize: CAPTION_SIZE,
          fontWeight: 700,
          width: hugTextBoxWidth(plan.caption, CAPTION_SIZE, area.width, {
            ...spec,
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

  // Centred on the band, at the width the content actually needs — so the
  // block sits under the middle of the grid rather than against the margin,
  // and the caption above it is centred on the same axis.
  const blockWidth =
    plan.drawWidth * plan.columnCount + plan.gutter * (plan.columnCount - 1)
  const block: Box = {
    left: area.left + Math.max(0, Math.round((area.width - blockWidth) / 2)),
    top: area.top + captionHeight(plan.captioned),
    width: blockWidth,
    height: Math.max(1, area.height - captionHeight(plan.captioned)),
  }
  const columnBoxes = columns(block, plan.columnCount, plan.gutter)
  const bounds = [0, ...plan.breaks, plan.items.length]

  for (let column = 0; column < plan.columnCount; column++) {
    const box = columnBoxes[column]!
    const slice = plan.items.slice(bounds[column]!, bounds[column + 1]!)
    if (slice.length === 0) continue

    const parts: StudioFabricObject[] = []
    let top = box.top
    for (const item of slice) {
      parts.push(
        buildText(
          {
            left: box.left,
            top,
            text: item.text,
            fontFamily: font,
            fontSize: plan.fontSize,
            fontWeight: 'normal',
            width: plan.drawWidth,
            height: item.height,
            textAlign: 'left',
            originX: 'left',
            lineHeight: CLUE_LINE_HEIGHT,
            fill: STUDIO_INK,
          },
          tag,
          'prompt',
        ),
      )
      top += item.height + CLUE_BLOCK_GAP
    }

    const groupBounds = unionObjectBounds(parts)
    if (groupBounds) objects.push(buildGroup(parts, groupBounds, tag))
  }

  return objects
}
