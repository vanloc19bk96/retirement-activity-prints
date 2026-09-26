import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { contentBox, estimateTextBoxWidth, measureHeaderHeight, type Box } from '../studio-layout'
import { PL_MYSTERY_PROMPT, plDesign, plInstruction, plLevelPictures, plLevelSpec, type PlDesign, type PlLevel } from './content'
import type { Clues } from './solver'

/**
 * Where everything on a Picture Logic page goes.
 *
 * The page is the puzzle: column clues stacked above the grid, row clues
 * to its left, the grid itself, and one write-in line under it. Squares
 * are as large as the trim allows (up to 0.45 in) and never below the
 * level's floor; clue numbers grow with them and never print below 12 pt.
 * Everything is sized from the picture's own clues, so a picture with
 * short clues gets bigger squares.
 */

const inch = (n: number) => n * DPI

/** Air between the heading and the puzzle, and round the panel's edge, canvas px. */
export const PL_HEADER_AIR = 12
export const PL_EDGE_AIR = 4

/** Largest square worth printing — past this a 10 × 10 is a poster. */
export const PL_MAX_CELL = inch(0.45)
/** Clue numbers: never below 12 pt, never above 18 pt. */
export const PL_CLUE_MIN = 16
export const PL_CLUE_MAX = 24
/** A clue number's share of its square. */
const CLUE_OF_CELL = 0.6
/** A clue number never fills more of its square than this. */
export const PL_CLUE_CELL_LIMIT = 0.8
/** Width of one digit, in ems (lining figures). */
export const PL_DIGIT_EM = 0.62

/** The write-in line: its words, their size and the line's shortest length. */
export const PL_MYSTERY_SIZE = 20
const MYSTERY_GAP = 20
const MYSTERY_LINE_MIN = inch(2.4)
const MYSTERY_LINE_GAP = 10
/** Stacked (prompt over line), the line sits this far under the prompt's top. */
const MYSTERY_STACK_STEP = PL_MYSTERY_SIZE * 1.9

/** The steps a square is shrunk by while fitting, canvas px. */
const CELL_STEP = 1

export interface PlMysteryPlan {
  /** The prompt's top-left corner and width, canvas px. */
  promptLeft: number
  promptTop: number
  promptWidth: number
  /** The line's ends and where it is ruled. */
  lineLeft: number
  lineRight: number
  baseline: number
  /** Top of the answer written on the line. */
  answerTop: number
  /** True when the prompt sits over the line rather than beside it. */
  stacked: boolean
  top: number
  height: number
}

export interface PlPlan {
  cell: number
  clueSize: number
  /** Room a one-digit row-clue number takes across; a two-digit one takes more (`plRowClueCenters`). */
  slotWidth: number
  /** Room each column-clue number takes down. */
  slotHeight: number
  /** Gap between the clues and the grid. */
  gap: number
  rowClueWidth: number
  colClueHeight: number
  grid: Box
  /** Clues, grid and write-in line together. */
  block: Box
  mystery: PlMysteryPlan
}

const maxLen = (lines: Clues['rows']) => lines.reduce((m, clue) => Math.max(m, Math.max(1, clue.length)), 1)
const hasTwoDigits = (lines: Clues['rows']) => lines.some((clue) => clue.some((n) => n >= 10))

/** Room one row-clue number takes across: a lane slot, or its own width and air if wider. */
export const plRowSlot = (n: number, clueSize: number, slotWidth: number) => Math.max(slotWidth, plNumberWidth(n, clueSize) + clueSize * 0.55)

/** The numbers a line prints: its runs, or "0" for a blank line. */
export const plLineNumbers = (clue: readonly number[]): readonly number[] => (clue.length > 0 ? clue : [0])

/** Each row-clue number's centre, measured leftward from the end of the lane (its right edge). */
export function plRowClueCenters(clue: readonly number[], clueSize: number, slotWidth: number): number[] {
  const numbers = plLineNumbers(clue)
  const out: number[] = new Array(numbers.length)
  let edge = 0
  for (let i = numbers.length - 1; i >= 0; i--) {
    const slot = plRowSlot(numbers[i]!, clueSize, slotWidth)
    out[i] = edge + slot / 2
    edge += slot
  }
  return out
}

/** Width of a row's clue run in its lane. */
export const plRowClueWidth = (clue: readonly number[], clueSize: number, slotWidth: number) =>
  plLineNumbers(clue).reduce((sum, n) => sum + plRowSlot(n, clueSize, slotWidth), 0)

/** The puzzle's panel inside what a heading left of the page (`body`, from `drawHeader`). */
export function plPanelInBody(body: Box, headed: boolean): Box {
  const top = body.top + (headed ? PL_HEADER_AIR : PL_EDGE_AIR)
  return {
    left: body.left + PL_EDGE_AIR,
    top,
    width: body.width - PL_EDGE_AIR * 2,
    height: body.top + body.height - PL_EDGE_AIR - top,
  }
}

/** Width of a clue number's run at a size. */
export const plNumberWidth = (n: number, size: number) => String(n).length * PL_DIGIT_EM * size

/** Width of the write-in prompt at its size. */
export const plPromptWidth = () => estimateTextBoxWidth(PL_MYSTERY_PROMPT, PL_MYSTERY_SIZE, inch(4))

/**
 * Room a picture's name needs on the line, bold. The estimate is for
 * regular weight; bold serif runs about a sixth wider.
 */
export const plNameWidth = (name: string) => Math.ceil(estimateTextBoxWidth(name, PL_MYSTERY_SIZE, Number.POSITIVE_INFINITY) * 1.18)

/** The line is long enough for any name at the level, so the line never gives the answer's length away. */
export const plMysteryLine = (names: readonly string[]) => Math.max(MYSTERY_LINE_MIN, ...names.map((n) => plNameWidth(n) + 16))

function planAt(design: Pick<PlDesign, 'clues' | 'width' | 'height'>, panel: Box, cell: number, line: number): PlPlan | null {
  const { clues, width, height } = design
  const clueSize = Math.min(PL_CLUE_MAX, Math.max(PL_CLUE_MIN, cell * CLUE_OF_CELL))
  if (clueSize > cell * PL_CLUE_CELL_LIMIT + 1e-6) return null
  // A two-digit column clue must sit inside its column with air either side.
  if (hasTwoDigits(clues.cols) && plNumberWidth(10, clueSize) > cell - 3) return null
  const slotWidth = Math.max(clueSize * 1.05, cell * 0.72)
  const slotHeight = Math.max(clueSize * 1.18, cell * 0.8)
  const gap = Math.max(6, clueSize * 0.4)
  const rowClueWidth = clues.rows.reduce((m, clue) => Math.max(m, plRowClueWidth(clue, clueSize, slotWidth)), 0)
  const colClueHeight = maxLen(clues.cols) * slotHeight

  const promptWidth = plPromptWidth()
  // Beside the line when the panel is wide enough, over it when not.
  const stacked = promptWidth + MYSTERY_LINE_GAP + line > panel.width
  const mysteryWidth = stacked ? Math.max(promptWidth, line) : promptWidth + MYSTERY_LINE_GAP + line
  const mysteryInner = stacked ? MYSTERY_STACK_STEP + PL_MYSTERY_SIZE * 1.4 : PL_MYSTERY_SIZE * 1.4
  const mysteryHeight = MYSTERY_GAP + mysteryInner

  const puzzleWidth = rowClueWidth + gap + width * cell
  const blockWidth = Math.max(puzzleWidth, mysteryWidth)
  const blockHeight = colClueHeight + gap + height * cell + mysteryHeight
  if (blockWidth > panel.width + 1e-6 || blockHeight > panel.height + 1e-6) return null

  // The grid is what the eye centres on: centre it, and let the row clues
  // take the room on its left — unless that would push them off the panel.
  const gridWidth = width * cell
  let gridLeft = panel.left + (panel.width - gridWidth) / 2
  gridLeft = Math.max(gridLeft, panel.left + rowClueWidth + gap)
  gridLeft = Math.min(gridLeft, panel.left + panel.width - gridWidth)
  const top = panel.top + Math.max(0, (panel.height - blockHeight) / 2) * 0.35
  const grid: Box = { left: gridLeft, top: top + colClueHeight + gap, width: gridWidth, height: height * cell }

  const mysteryTop = grid.top + grid.height + MYSTERY_GAP
  const centre = grid.left + grid.width / 2
  let startLeft = centre - mysteryWidth / 2
  startLeft = Math.max(panel.left, Math.min(startLeft, panel.left + panel.width - mysteryWidth))
  const lineTop = stacked ? mysteryTop + MYSTERY_STACK_STEP : mysteryTop
  const lineLeft = stacked ? startLeft + (mysteryWidth - line) / 2 : startLeft + promptWidth + MYSTERY_LINE_GAP
  const mystery: PlMysteryPlan = {
    promptLeft: stacked ? startLeft + (mysteryWidth - promptWidth) / 2 : startLeft,
    promptTop: mysteryTop,
    promptWidth,
    lineLeft,
    lineRight: lineLeft + line,
    baseline: lineTop + PL_MYSTERY_SIZE * 1.1,
    answerTop: lineTop - PL_MYSTERY_SIZE * 0.08,
    stacked,
    top: mysteryTop,
    height: mysteryInner,
  }

  const left = Math.min(grid.left - gap - rowClueWidth, startLeft)
  const right = Math.max(grid.left + grid.width, startLeft + mysteryWidth)
  const block: Box = { left, top, width: right - left, height: mysteryTop + mystery.height - top }
  return { cell, clueSize, slotWidth, slotHeight, gap, rowClueWidth, colClueHeight, grid, block, mystery }
}

/** The largest squares this picture's clues allow in the panel, or null when even the level's floor will not fit. */
export function planPlPage(design: Pick<PlDesign, 'clues' | 'width' | 'height'>, panel: Box, level: PlLevel): PlPlan | null {
  const floor = Math.ceil(plLevelSpec(level).minCell)
  const line = plMysteryLine(plLevelPictures(level).map((p) => p.name))
  // Whole pixels, so every rule lands on the same grid.
  for (let cell = Math.floor(PL_MAX_CELL); cell >= floor; cell -= CELL_STEP) {
    const plan = planAt(design, panel, cell, line)
    if (plan) return plan
  }
  return null
}

/** The level's pictures that cannot print on this panel at the level's large print. */
export function plUnfitPictures(level: PlLevel, panel: Box): Set<string> {
  const out = new Set<string>()
  for (const picture of plLevelPictures(level)) {
    if (!planPlPage(plDesign(picture, false), panel, level)) out.add(picture.id)
  }
  return out
}

/**
 * A warning when this trim prints so few of the level's pictures that a
 * book of them would repeat; null when at least half fit (or none do — the
 * help line already says the page is too small).
 */
export function plFitWarning(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: PlLevel }): string | null {
  const { page, config, level } = options
  if (!page) return null
  const count = plLevelPictures(level).length
  const fitting = count - plUnfitPictures(level, plPanelFor(page, config)).size
  if (fitting === 0 || fitting * 2 >= count) return null
  return `Only ${fitting} of ${count} pictures fit this page size, so pages will repeat them. Choose a larger page, or the level below.`
}

/** The panel on a page, measured without drawing (for the form). */
export function plPanelFor(page: StudioConfigLayoutContext, config: StudioConfig): Box {
  const body = contentBox(page)
  const header = measureHeaderHeight(config, plInstruction(config), body.width)
  return plPanelInBody({ ...body, top: body.top + header, height: body.height - header }, header > 0)
}

/**
 * The level's help line: what the level's pictures print as on the page
 * size in Settings — the smallest square and number any of them needs, or
 * that the trim is too small.
 */
export function plPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: PlLevel }): string {
  const { page, config, level } = options
  const spec = plLevelSpec(level)
  const count = plLevelPictures(level).length
  const lead = `${count} hand-drawn pictures, each proven to solve one line at a time — no guessing.`
  if (!page) return lead
  const panel = plPanelFor(page, config)
  let smallest: PlPlan | null = null
  let fitting = 0
  for (const picture of plLevelPictures(level)) {
    const plan = planPlPage(plDesign(picture, false), panel, level)
    if (!plan) continue
    fitting++
    if (!smallest || plan.cell < smallest.cell) smallest = plan
  }
  if (!smallest) return `This page size is too small for ${spec.gridLabel} squares at large print — choose a larger page in Settings or an easier level.`
  const inches = (smallest.cell / DPI).toFixed(2)
  const pt = Math.round(((smallest.clueSize * 72) / DPI) * 2) / 2
  const sizes = `Squares print at ${inches} in or larger, numbers at ${pt} pt or larger.`
  if (fitting < count) {
    return `${fitting} of ${count} pictures fit this page size at large print (the rest need a larger page), each proven to solve one line at a time — no guessing. ${sizes}`
  }
  return `${lead} ${sizes}`
}
