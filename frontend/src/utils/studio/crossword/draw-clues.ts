import type { StudioFabricObject } from '@/types/studio-template.types'
import { unionObjectBounds, type Box } from '../studio-layout'
import { buildText, buildGroup, type StudioTag } from '../studio-fabric-builders'
import {
  hugTextBoxWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  CLUE_BLOCK_GAP,
  CLUE_COLUMN_GUTTER,
  CLUE_LINE_HEIGHT,
  CLUE_MIN_SIZE,
  CLUE_TITLE_GAP,
  clueBlockHeight,
  clueColumnWidth,
  clueTitleSize,
} from './layout'
import type { CrosswordEntry } from './types'

/**
 * ACROSS and DOWN, side by side under the grid.
 *
 * Every line is broken here rather than left to Fabric. A Textbox re-wraps
 * anything wider than its declared width, so a list laid out against estimated
 * widths can come back a line taller than the space reserved for it — which on
 * a printed page is a clue sitting on top of the one below it. Breaking with
 * the same metrics Fabric measures with, then reserving exactly the lines we
 * produced, is what makes the band's height a fact instead of a hope.
 */

/** The answer's length, as printed after the clue: "3. Big striped cat (5)". */
function formatClueLine(entry: CrosswordEntry): string {
  const clue = entry.clue
    // Drop any length hint the model wrote; ours is computed from the grid.
    .replace(/\s*\(\s*\d+\s*(letters?)?\s*\)\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
  return `${entry.number}. ${clue} (${entry.word.length})`
}

interface ClueItem {
  /** Hard-wrapped, newline-joined — Fabric will not re-break it. */
  text: string
  lines: number
  height: number
}

interface ClueColumnPlan {
  title: string
  items: ClueItem[]
  /** Height of heading plus every clue, before any gap compression. */
  height: number
}

export interface ClueListsPlan {
  fontSize: number
  titleSize: number
  columnWidth: number
  columns: ClueColumnPlan[]
  /** Height the drawn block will occupy. */
  height: number
  /** Space between clues after fitting — squeezed before type is shrunk. */
  blockGap: number
}

function planColumn(
  title: string,
  entries: CrosswordEntry[],
  fontSize: number,
  columnWidth: number,
  spec: FontSpec,
): ClueColumnPlan {
  const wrapWidth = wrapSafeWidth(columnWidth, spec)
  const items = entries.map((entry) => {
    const lines = wrapTextToWidth(formatClueLine(entry), fontSize, wrapWidth, spec)
    return {
      text: lines.join('\n'),
      lines: lines.length,
      height: clueBlockHeight(lines.length, fontSize) - CLUE_BLOCK_GAP,
    }
  })
  const stacked = items.reduce((sum, item) => sum + item.height, 0)
  const gaps = Math.max(0, items.length - 1) * CLUE_BLOCK_GAP
  return {
    title,
    items,
    height: clueTitleSize(fontSize) + CLUE_TITLE_GAP + stacked + gaps,
  }
}

function splitEntries(entries: CrosswordEntry[]): {
  across: CrosswordEntry[]
  down: CrosswordEntry[]
} {
  const byNumber = (a: CrosswordEntry, b: CrosswordEntry) => a.number - b.number
  return {
    across: entries.filter((e) => e.dir === 'across').sort(byNumber),
    down: entries.filter((e) => e.dir === 'down').sort(byNumber),
  }
}

/**
 * Largest large-print size at which both columns fit `maxHeight`.
 *
 * Gap compression comes first: taking two points off every clue to save the
 * same millimetres a tighter leading would save is the wrong trade on a page
 * sold for its type size. Only when the floor still overflows does the block
 * keep its floor size and compress, which the page plan has already made rare.
 */
export function planClueLists(options: {
  entries: CrosswordEntry[]
  width: number
  maxHeight: number
  font: string
  preferredFontSize: number
}): ClueListsPlan | null {
  const { entries, width, maxHeight, font, preferredFontSize } = options
  if (entries.length === 0) return null

  const spec: FontSpec = { fontFamily: font, fontWeight: 'normal' }
  const columnWidth = clueColumnWidth(width)
  const { across, down } = splitEntries(entries)
  const ceiling = Math.max(CLUE_MIN_SIZE, Math.round(preferredFontSize))

  let smallest: ClueListsPlan | null = null

  for (let fontSize = ceiling; fontSize >= CLUE_MIN_SIZE; fontSize--) {
    const columns = [
      planColumn('ACROSS', across, fontSize, columnWidth, spec),
      planColumn('DOWN', down, fontSize, columnWidth, spec),
    ].filter((column) => column.items.length > 0)
    if (columns.length === 0) return null

    const height = Math.max(...columns.map((column) => column.height))
    const plan: ClueListsPlan = {
      fontSize,
      titleSize: clueTitleSize(fontSize),
      columnWidth,
      columns,
      height,
      blockGap: CLUE_BLOCK_GAP,
    }
    if (height <= maxHeight) return plan
    smallest = plan
  }

  if (!smallest) return null

  // At the floor and still over: close the gaps between clues rather than drop
  // one or print below the large-print floor.
  const tallest = Math.max(...smallest.columns.map((column) => column.height))
  const overflow = tallest - maxHeight
  const gapCount = Math.max(
    1,
    ...smallest.columns.map((column) => Math.max(0, column.items.length - 1)),
  )
  const blockGap = Math.max(0, CLUE_BLOCK_GAP - Math.ceil(overflow / gapCount))
  const shrunk = CLUE_BLOCK_GAP - blockGap
  const columns = smallest.columns.map((column) => ({
    ...column,
    height: column.height - Math.max(0, column.items.length - 1) * shrunk,
  }))
  return {
    ...smallest,
    blockGap,
    columns,
    height: Math.max(...columns.map((column) => column.height)),
  }
}

function drawColumn(
  column: ClueColumnPlan,
  plan: ClueListsPlan,
  area: Box,
  font: string,
  tag: StudioTag,
): StudioFabricObject[] {
  const spec: FontSpec = { fontFamily: font, fontWeight: 700 }
  const objects: StudioFabricObject[] = [
    buildText(
      {
        left: area.left,
        top: area.top,
        text: column.title,
        fontFamily: font,
        fontSize: plan.titleSize,
        fontWeight: 700,
        width: hugTextBoxWidth(column.title, plan.titleSize, area.width, spec),
        textAlign: 'left',
        originX: 'left',
        lineHeight: 1,
      },
      tag,
      'decoration',
    ),
  ]

  let top = area.top + plan.titleSize + CLUE_TITLE_GAP
  for (const item of column.items) {
    objects.push(
      buildText(
        {
          left: area.left,
          top,
          text: item.text,
          fontFamily: font,
          fontSize: plan.fontSize,
          fontWeight: 'normal',
          width: plan.columnWidth,
          height: item.height,
          textAlign: 'left',
          originX: 'left',
          lineHeight: CLUE_LINE_HEIGHT,
        },
        tag,
        'prompt',
      ),
    )
    top += item.height + plan.blockGap
  }
  return objects
}

/**
 * Draw a planned clue block at `origin`, centred in the column.
 * Each list is its own group so a seller can nudge one without the other.
 */
export function drawClueLists(
  plan: ClueListsPlan,
  origin: Box,
  font: string,
  tag: StudioTag,
): StudioFabricObject[] {
  const blockWidth =
    plan.columns.length > 1
      ? plan.columnWidth * 2 + CLUE_COLUMN_GUTTER
      : plan.columnWidth
  const left = origin.left + Math.max(0, (origin.width - blockWidth) / 2)

  const groups: StudioFabricObject[] = []
  plan.columns.forEach((column, index) => {
    const area: Box = {
      left: left + index * (plan.columnWidth + CLUE_COLUMN_GUTTER),
      top: origin.top,
      width: plan.columnWidth,
      height: plan.height,
    }
    const objects = drawColumn(column, plan, area, font, tag)
    const bounds = unionObjectBounds(objects)
    if (!bounds) return
    groups.push(buildGroup(objects, bounds, tag))
  })
  return groups
}
