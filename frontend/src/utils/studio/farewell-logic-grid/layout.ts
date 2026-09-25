import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_STROKE_BOLD } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import {
  FABRIC_FONT_SIZE_MULT,
  fabricTextHeight,
  measureRunWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  LG_CATEGORIES,
  LG_NAMES,
  LG_PEOPLE_TITLE,
  LG_THEMES,
  lgCategory,
} from './content'
import type { LgLevel } from './levels'
import { scenarioText } from './puzzle'
import type { LgShape } from './solver'

/**
 * Everything a Farewell Party page decides on the seller's behalf.
 *
 * The grid is the page's anchor: a cell must take a pencilled X or dot, and
 * every label must print whole in type an older reader can scan. So cell size
 * and label size have floors no trim can talk the page under — a trim that
 * cannot hold the level's grid prints a smaller one instead.
 *
 * The clues and grid share one page when both fit at a comfortable size.
 * Otherwise the story and clues take the first page and the grid the next,
 * with any clues that did not fit set above the grid, rather than shrink
 * anything.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Clue type sizes tried, largest first; 14 pt is the floor. */
export const CLUE_FONTS = [18, 17, 16, 15, 14].map(ptToPx)
export const CLUE_FONT_MIN = ptToPx(14)
/** Clue sizes a single page may use before the planner splits the puzzle over two. */
export const ONE_PAGE_CLUE_FLOOR = ptToPx(15)
/** Largest clue type a puzzle may use when some clues sit on the grid page. */
const OVERFLOW_CLUE_MAX = ptToPx(16)
/** Grid labels, largest first. */
const LABEL_FONTS = [13, 12].map(ptToPx)
export const LABEL_FONT_MIN = ptToPx(12)
/** Category headings may step down a little further to fit over their block. */
const GROUP_TITLE_FONT_MIN = ptToPx(11)

/** A quarter inch: room for a pencilled X. */
export const CELL_MIN = Math.round(DPI * 0.25)
/** Smallest cell a one-page puzzle settles for. */
export const CELL_COMFORT = Math.round(DPI * 0.29)
const CELL_MAX = Math.round(DPI * 0.42)

export const TEXT_LINE_HEIGHT = 1.2
/** Past three lines a clue stops being quick to read. */
export const MAX_CLUE_LINES = 3

/** Least share of a typical puzzle's clue height a two-page plan must hold. */
const MIN_BUDGET_SHARE = 0.7

/** Clues a puzzle of this shape may need, used to choose between one page and two. */
const EXPECTED_CLUES: Record<string, number> = { '4x2': 6.5, '4x3': 8.5, '5x3': 10.5 }

export const textSpec = (font: string): FontSpec => ({ fontFamily: font })
export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const italicSpec = (font: string): FontSpec => ({ fontFamily: font, fontStyle: 'italic' })

/** Rows run people first, then the categories from last to second. */
export const rowGroups = (K: number) => [0, ...Array.from({ length: K - 1 }, (_, i) => K - i)]
/** Columns run the categories first to last. */
export const colGroups = (K: number) => Array.from({ length: K }, (_, i) => i + 1)

export interface LgTextMetrics {
  font: number
  numberW: number
  gap: number
  subtitleFont: number
  noteFont: number
}

export function lgTextMetrics(font: number): LgTextMetrics {
  return {
    font,
    numberW: Math.round(font * 1.7),
    gap: Math.round(font * 0.45),
    subtitleFont: Math.round(font * 1.15),
    noteFont: Math.max(CLUE_FONT_MIN - 2, Math.round(font * 0.85)),
  }
}

/** Labels a grid prints: its row labels, column labels and group headings. */
export interface LgGridLabels {
  rows: readonly string[]
  cols: readonly string[]
  titles: readonly string[]
}

export interface LgGridGeometry {
  shape: LgShape
  cell: number
  labelFont: number
  titleFont: number
  /** Left strip holding each row group's heading, set on its side. */
  stripW: number
  rowLabelW: number
  colTitleH: number
  colLabelH: number
  /** Breathing room between a label and its rule. */
  pad: number
  width: number
  height: number
}

/** Room outside the outermost rules for their own thickness. */
export const GRID_EDGE = Math.ceil(STUDIO_STROKE_BOLD / 2) + 1

/**
 * The grid these labels need at this cell and type size, or null when a label
 * or heading cannot print whole.
 */
export function lgGridGeometry(
  shape: LgShape,
  cell: number,
  labelFont: number,
  labels: LgGridLabels,
  font: string,
): LgGridGeometry | null {
  const { n, K } = shape
  // A column label is set on its side, one line thick, inside its cell.
  if (labelFont * FABRIC_FONT_SIZE_MULT > cell - 4) return null
  const pad = Math.round(labelFont * 0.45)
  const widest = (texts: readonly string[], spec: FontSpec, size: number) =>
    Math.max(0, ...texts.map((t) => measureRunWidth(t, size, spec)))

  const blockSpan = n * cell - 2 * pad
  let titleFont = labelFont
  while (titleFont > GROUP_TITLE_FONT_MIN && widest(labels.titles, boldSpec(font), titleFont) > blockSpan) {
    titleFont--
  }
  if (widest(labels.titles, boldSpec(font), titleFont) > blockSpan) return null

  const stripW = Math.round(titleFont * FABRIC_FONT_SIZE_MULT + 2 * pad)
  const rowLabelW = Math.ceil(widest(labels.rows, textSpec(font), labelFont) * 1.06 + 2 * pad)
  const colTitleH = Math.round(titleFont * FABRIC_FONT_SIZE_MULT + 2 * pad)
  const colLabelH = Math.ceil(widest(labels.cols, textSpec(font), labelFont) * 1.06 + 2 * pad)
  const cells = K * n * cell
  return {
    shape,
    cell,
    labelFont,
    titleFont,
    stripW,
    rowLabelW,
    colTitleH,
    colLabelH,
    pad,
    width: stripW + rowLabelW + cells + 2 * GRID_EDGE,
    height: colTitleH + colLabelH + cells + 2 * GRID_EDGE,
  }
}

let probeCache: { labels: LgGridLabels; scenarios: string[]; subtitles: string[]; clue: string } | null = null

/** The longest labels, stories and headings any puzzle can print — the plan's worst case. */
function probes() {
  if (probeCache) return probeCache
  const values = LG_CATEGORIES.flatMap((c) => c.values.map((v) => v.label))
  const titles = [LG_PEOPLE_TITLE, ...LG_CATEGORIES.map((c) => c.title)]
  const scenarios: string[] = []
  for (const theme of LG_THEMES) {
    const cats = theme.categories.map(lgCategory).sort((a, b) => b.scenario.length - a.scenario.length)
    for (const intro of theme.intros) {
      scenarios.push(scenarioText(intro, { n: 5, K: 3 }, cats.slice(0, 3)))
    }
  }
  probeCache = {
    labels: { rows: [...LG_NAMES, ...values], cols: values, titles },
    scenarios,
    subtitles: LG_THEMES.map((t) => t.name),
    // A clue of everyday length.
    clue: 'The person who brought the apple pie retired two months before Walter.',
  }
  return probeCache
}

export function wrapLines(text: string, width: number, size: number, spec: FontSpec): string[] {
  return wrapTextToWidth(text, size, wrapSafeWidth(width, spec), spec)
}

export const textBlockHeight = (lines: number, size: number) =>
  fabricTextHeight(lines, size, TEXT_LINE_HEIGHT)

export interface LgPagePlan {
  shape: LgShape
  /** Puzzle pages before the answer page. */
  pages: 1 | 2
  text: LgTextMetrics
  /** Width of the text column, right of the clue numbers. */
  textWidth: number
  /** Width of the whole text block (numbers included), centred on the page. */
  blockWidth: number
  cell: number
  labelFont: number
  /** Worst-case grid at this cell size. */
  grid: LgGridGeometry
  /** Height the title story (bold name and scenario) may take on page one. */
  storyHeight: number
  /** Clue height available on page one (after the story, and the footer note on two pages). */
  firstCapacity: number
  /** Clue height available above the grid on page two (0 on one page). */
  secondCapacity: number
  /** A footer note line on page one ("The grid is on the next page."). */
  footerHeight: number
}

/**
 * Air kept above the safe line. The editor draws its dashed guide inside the
 * safe box, so a rule or note set flush on the edge sits on the guide and
 * reads as crossing it; a pixel of clearance is not clearance.
 */
const BOTTOM_GUARD = Math.round(DPI * 0.12)

/** The safe printable column every page of this game lays out inside. */
export function lgContentBox(page: StudioConfigLayoutContext): Box {
  const box = insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
  return { ...box, height: Math.max(1, box.height - BOTTOM_GUARD) }
}

/** Body left under the header, with or without the instruction line. */
export function lgBodyField(page: StudioConfigLayoutContext, config: StudioConfig, instruction: string): Box {
  const content = lgContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return { ...content, top: content.top + headerHeight, height: Math.max(1, content.height - headerHeight) }
}

/** Text blocks wider than this run clues further across a letter page than an eye tracks. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6)

/** The note closing page one, with clear space above it. */
export const footerHeight = (text: LgTextMetrics) =>
  Math.round(textBlockHeight(1, text.noteFont) + text.font * 0.9)

/** Height of one clue of `lines` lines, with the gap that follows it. */
export const clueSlotHeight = (lines: number, text: LgTextMetrics) =>
  Math.round(textBlockHeight(lines, text.font) + text.gap)

/** The bold scene name and the story beneath it, measured. */
export function storyLines(subtitle: string, scenario: string, blockWidth: number, font: string, text: LgTextMetrics) {
  return {
    subtitle: wrapLines(subtitle, blockWidth, text.subtitleFont, boldSpec(font)),
    scenario: wrapLines(scenario, blockWidth, text.font, textSpec(font)),
  }
}

/** The story block, from the top of the scene name to where the first clue starts. */
export function storyHeight(lines: { subtitle: readonly string[]; scenario: readonly string[] }, text: LgTextMetrics): number {
  return Math.round(
    textBlockHeight(lines.subtitle.length, text.subtitleFont) +
      text.gap +
      textBlockHeight(lines.scenario.length, text.font) +
      STORY_AFTER * text.font,
  )
}

/** Space between the story and the first clue, in clue-font ems. */
export const STORY_AFTER = 1.1

/** Largest grid for these labels, between `minCell` and `maxCell`, that fits the box. */
export function fitGrid(options: {
  shape: LgShape
  labels: LgGridLabels
  labelFont: number
  font: string
  width: number
  height: number
  minCell: number
  maxCell?: number
}): LgGridGeometry | null {
  const { shape, labels, labelFont, font, width, height, minCell, maxCell = CELL_MAX } = options
  for (let cell = maxCell; cell >= minCell; cell--) {
    const grid = lgGridGeometry(shape, cell, labelFont, labels, font)
    if (grid && grid.width <= width && grid.height <= height) return grid
  }
  return null
}

/** The smallest worst-case grid a plan accepts — leaving the clues every pixel it can. */
function smallestGrid(shape: LgShape, labelFont: number, font: string, width: number, height: number, minCell: number) {
  for (let cell = minCell; cell <= CELL_MAX; cell++) {
    const grid = lgGridGeometry(shape, cell, labelFont, probes().labels, font)
    if (!grid) continue
    return grid.width <= width && grid.height <= height ? grid : null
  }
  return null
}

/**
 * The roomiest page this trim gives the level.
 *
 * Shapes are tried largest first, and for each shape three layouts in turn:
 *
 * 1. Everything on one page, clues at 15 pt or more, squares at least 0.29 in.
 * 2. The story and every clue on page one, the grid on page two.
 * 3. As 2, with clues that miss page one set above the grid.
 *
 * Within a layout the largest clue type that works wins. A plan reserves the
 * smallest grid it accepts, so the clue budget is as generous as it can be;
 * the page then grows the grid into whatever room the real clues leave.
 */
export function planLgPage(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  instruction: string
  font: string
  level: LgLevel
}): LgPagePlan | null {
  const { page, config, instruction, font, level } = options
  const first = lgBodyField(page, config, instruction)
  const second = lgBodyField(page, config, '')
  const blockWidth = Math.min(first.width, BLOCK_MAX_WIDTH)

  const measure = (size: number) => {
    const text = lgTextMetrics(size)
    const textWidth = blockWidth - text.numberW
    const typical = clueSlotHeight(wrapLines(probes().clue, textWidth, size, textSpec(font)).length, text)
    const lines = (texts: readonly string[], at: number, spec: FontSpec) =>
      Math.max(...texts.map((t) => wrapLines(t, blockWidth, at, spec).length))
    const story = storyHeight(
      {
        subtitle: Array(lines(probes().subtitles, text.subtitleFont, boldSpec(font))).fill(''),
        scenario: Array(lines(probes().scenarios, size, textSpec(font))).fill(''),
      },
      text,
    )
    return { text, textWidth, typical, story, worstClue: clueSlotHeight(MAX_CLUE_LINES, text) }
  }

  for (const shape of level.shapes) {
    const expected = EXPECTED_CLUES[`${shape.n}x${shape.K}`] ?? 10
    const planned = (
      m: ReturnType<typeof measure>,
      pages: 1 | 2,
      grid: LgGridGeometry,
      firstCapacity: number,
      secondCapacity: number,
      footerHeight: number,
    ): LgPagePlan => ({
      shape,
      pages,
      text: m.text,
      textWidth: m.textWidth,
      blockWidth,
      cell: grid.cell,
      labelFont: grid.labelFont,
      grid,
      storyHeight: m.story,
      firstCapacity,
      secondCapacity,
      footerHeight,
    })

    for (const size of CLUE_FONTS) {
      if (size < ONE_PAGE_CLUE_FLOOR) continue
      const m = measure(size)
      // A little over a typical puzzle, so an ordinary draw is rarely refused.
      const need = Math.round(expected * m.typical * 1.1)
      for (const labelFont of LABEL_FONTS) {
        const grid = smallestGrid(shape, labelFont, font, first.width, first.height - m.story - need - m.text.font, CELL_COMFORT)
        if (grid) return planned(m, 1, grid, first.height - m.story - grid.height - m.text.font, 0, 0)
      }
    }

    for (const overflowAllowed of [false, true]) {
      // Large type is for pages that keep every clue together; a puzzle that
      // must spill onto the grid page stays at 16 pt or below to spill less.
      for (const size of CLUE_FONTS.filter((s) => !overflowAllowed || s <= OVERFLOW_CLUE_MAX)) {
        const m = measure(size)
        const need = Math.round(expected * m.typical * 1.1)
        const footer = footerHeight(m.text)
        const firstRoom = first.height - m.story - footer
        if (firstRoom < m.worstClue) continue
        // Every clue on page one needs no spare: nothing has to move whole.
        if (!overflowAllowed && need > firstRoom) continue
        const overflow = overflowAllowed ? Math.max(0, need - (firstRoom - m.worstClue)) : 0
        for (const labelFont of LABEL_FONTS) {
          // Clues that miss page one go above the grid, so keep room for them.
          // A narrow trim that cannot keep all of it holds the builder to
          // shorter clue sets instead.
          const gridRoom = second.height - (overflow > 0 ? overflow + m.text.font : 0)
          const grid =
            smallestGrid(shape, labelFont, font, second.width, gridRoom, CELL_MIN) ??
            smallestGrid(shape, labelFont, font, second.width, second.height, CELL_MIN)
          if (!grid) continue
          const secondCapacity = overflowAllowed ? Math.max(0, second.height - grid.height - m.text.font) : 0
          if (firstRoom - m.worstClue + secondCapacity < need * MIN_BUDGET_SHARE) continue
          return planned(m, 2, grid, firstRoom, secondCapacity, footer)
        }
      }
    }
  }
  return null
}

/**
 * Clue height a puzzle may use under this plan. On two pages a clue that does
 * not fit the bottom of page one moves whole to page two, so page one can
 * strand up to one clue's height.
 */
export function clueBudget(plan: LgPagePlan): number {
  if (plan.pages === 1 || plan.secondCapacity === 0) return plan.firstCapacity
  return plan.firstCapacity - clueSlotHeight(MAX_CLUE_LINES, plan.text) + plan.secondCapacity
}

const inches = (px: number) => (Math.round((px / DPI) * 100) / 100).toFixed(2)

/** What a page prints on the trim currently in Settings. */
export function lgPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  instruction: string
  font: string
  level: LgLevel
}): string {
  const { page, level } = options
  const shapeText = (shape: LgShape) =>
    `${shape.n === 4 ? 'Four' : 'Five'} people and ${shape.K === 2 ? 'two' : 'three'} categories`
  if (!page) return `${shapeText(level.shapes[0]!)}, one clear answer, plus an answer page.`
  const plan = planLgPage({ ...options, page })
  if (!plan) return 'This page size is too small for a logic grid — choose a larger one in Settings.'
  const layout =
    plan.pages === 1
      ? 'clues and grid on one page'
      : 'clues on one page and the grid on the next (one page when the clues are short)'
  return `${shapeText(plan.shape)}: ${layout}, ${pxToPt(plan.text.font)} pt clues, grid squares at least ${inches(plan.cell)} in, plus an answer page.`
}
