/**
 * The numbered move list under each grid: which rows a figure prints, and what
 * they measure. Drawing lives in `move-list-draw.ts`.
 */
import { hugTextBoxWidth } from '../studio-text-metrics'
import {
  END_SQUARE_LABEL,
  endCoordinate,
  sampleRouteSteps,
  stepHasArrow,
  stepText,
} from './answer'
import type { Dir, Route, RouteSettings } from './types'

/** Line pitch, ordinal gutter and arrow box, all as multiples of the font size. */
export const PITCH_EM = 1.75
export const ORDINAL_EM = 1.4
export const ARROW_EM = 1
export const GAP_EM = 0.35
/** Horizontal gap between direction cells in the multi-column grid. */
export const COL_GAP_EM = 1.25
/** Cap so a wide page does not print nine stamp-sized moves in one row. */
export const MAX_MOVE_COLS = 4
/** Smaller type for optional note rows under the move list. */
export const NOTE_SCALE = 0.8
/** Write-in rule lengths: a coordinate is short, a whole move is not. */
const END_RULE_EM = 3.6
const MOVE_RULE_EM = 6

export type MoveLineKind = 'caption' | 'step' | 'blank' | 'end-box' | 'note'

/**
 * One printed row of the move list. Modes differ only in which rows they emit,
 * so measuring, fitting and drawing stay mode-agnostic.
 */
export interface MoveLine {
  kind: MoveLineKind
  /** Printed ordinal ("1."), or null for caption / affordance rows. */
  ordinal: string | null
  /** Arrow drawn before the text, when the instruction style asks for one. */
  dir: Dir | null
  /** A dot stands in for the start marker on the grid (gentle tiers). */
  dot: boolean
  text: string
  /** Write-in rule after the text, in ems. 0 = none. */
  ruleEm: number
  /** Revealed on the answer key only. */
  answerText: string | null
  answerDir: Dir | null
}

const emptyLine = (kind: MoveLineKind): MoveLine => ({
  kind,
  ordinal: null,
  dir: null,
  dot: false,
  text: '',
  ruleEm: 0,
  answerText: null,
  answerDir: null,
})

/**
 * The rows this figure prints (§7.5–7.6):
 * Mode A/B list the moves; Mode B adds a write-in box; Mode C prints one blank
 * per sample step (same count as the key fills). Start guidance is in the page
 * instruction, not in this list.
 */
export function planMoveLines(route: Route, settings: RouteSettings): MoveLine[] {
  const { instructionStyle: style, mode } = settings
  const withArrow = stepHasArrow(style)
  const lines: MoveLine[] = []

  if (mode === 'route') {
    // One blank per sample move — Expert is 9 blanks for 9 steps, never 4
    // empties with only two key slots filled.
    const sample = sampleRouteSteps(route)
    sample.forEach((step, i) => {
      lines.push({
        ...emptyLine('blank'),
        ordinal: `${i + 1}.`,
        ruleEm: MOVE_RULE_EM,
        answerText: stepText(step, style),
        answerDir: withArrow ? step.dir : null,
      })
    })
    return lines
  }

  route.steps.forEach((step, i) => {
    lines.push({
      ...emptyLine('step'),
      ordinal: `${i + 1}.`,
      dir: withArrow ? step.dir : null,
      text: stepText(step, style),
    })
  })

  if (mode === 'coordinate') {
    lines.push({
      ...emptyLine('end-box'),
      text: END_SQUARE_LABEL,
      ruleEm: END_RULE_EM,
      answerText: endCoordinate(route),
    })
  }
  return lines
}

/** Steps / blanks flow into a row×col grid; captions and write-ins stay full width. */
export function isMoveGridLine(line: MoveLine): boolean {
  return line.kind === 'step' || line.kind === 'blank'
}

export interface MoveListPartition {
  head: MoveLine[]
  cells: MoveLine[]
  tail: MoveLine[]
}

/** Caption → steps/blanks → end-box/note. Modes always emit lines in this order. */
export function partitionMoveLines(lines: readonly MoveLine[]): MoveListPartition {
  let i = 0
  const head: MoveLine[] = []
  while (i < lines.length && !isMoveGridLine(lines[i]!)) {
    head.push(lines[i]!)
    i++
  }
  const cells: MoveLine[] = []
  while (i < lines.length && isMoveGridLine(lines[i]!)) {
    cells.push(lines[i]!)
    i++
  }
  return { head, cells, tail: lines.slice(i) }
}

export interface MoveListMetrics {
  width: number
  height: number
  pitch: number
  /** Shared left column holding the ordinals (0 when no row has one). */
  gutter: number
  /** Columns in the step/blank grid (1 when the list is a single stack). */
  cols: number
  rows: number
  /** Width of one step/blank cell, including its ordinal gutter. */
  cellWidth: number
  colGap: number
}

function measureLineWidth(
  line: MoveLine,
  fontSize: number,
  font: string,
  gutter: number,
): number {
  const spec = { fontFamily: font }
  const arrowSpan = fontSize * (ARROW_EM + GAP_EM)
  const noteSize = fontSize * NOTE_SCALE
  const size = line.kind === 'note' ? noteSize : fontSize
  const lineGutter = line.ordinal ? gutter : 0
  const lead = line.dir || line.dot ? arrowSpan : 0
  const text = line.text ? hugTextBoxWidth(line.text, size, Infinity, spec) : 0
  const answerLead = line.answerDir ? arrowSpan : 0
  const answer = line.answerText
    ? answerLead + hugTextBoxWidth(line.answerText, size, Infinity, spec)
    : 0
  // The rule and the answer share the same column — the wider one wins.
  const tail = Math.max(line.ruleEm * fontSize, line.kind === 'note' ? 0 : answer)
  const gap = text > 0 && tail > 0 ? fontSize * GAP_EM : 0
  const note = line.kind === 'note' ? answer : 0
  return Math.max(lineGutter + lead + text + gap + tail, lineGutter + note)
}

/** Width of one printed move-list row (used to center write-ins under the grid). */
export function moveLineWidth(
  line: MoveLine,
  fontSize: number,
  font: string,
  gutter: number,
): number {
  return measureLineWidth(line, fontSize, font, gutter)
}

/**
 * How many columns the step grid should use under `maxWidth`.
 * Picks the widest fit that still divides `cellCount` evenly, so the last row
 * is never short (5 moves under 3 cols → 1×5, not 3+2).
 */
export function moveGridCols(cellCount: number, cellWidth: number, colGap: number, maxWidth: number): number {
  if (cellCount <= 1) return 1
  const maxFit =
    !Number.isFinite(maxWidth) || maxWidth <= 0
      ? Math.min(MAX_MOVE_COLS, cellCount >= 4 ? 2 : cellCount)
      : Math.max(
          1,
          Math.min(MAX_MOVE_COLS, cellCount, Math.floor((maxWidth + colGap) / (cellWidth + colGap))),
        )
  for (let cols = maxFit; cols >= 1; cols--) {
    if (cellCount % cols === 0) return cols
  }
  return 1
}

/**
 * Space the list needs at `fontSize`. Steps/blanks pack into a row×col grid under
 * `maxWidth`; caption and write-in rows stay full-width above/below.
 * Every width the drawing code uses is derived here, so a block that measures as
 * fitting is drawn as fitting.
 */
export function measureMoveList(
  lines: readonly MoveLine[],
  fontSize: number,
  font: string,
  maxWidth = Infinity,
): MoveListMetrics {
  const gutter = lines.some((line) => line.ordinal) ? fontSize * ORDINAL_EM : 0
  const pitch = fontSize * PITCH_EM
  const colGap = fontSize * COL_GAP_EM
  const { head, cells, tail } = partitionMoveLines(lines)

  const rawCellW = cells.reduce(
    (widest, line) => Math.max(widest, measureLineWidth(line, fontSize, font, gutter)),
    0,
  )
  const cellWidth = Math.max(1, Math.ceil(rawCellW))
  const cols = moveGridCols(cells.length, cellWidth, colGap, maxWidth)
  const rows = cells.length > 0 ? Math.ceil(cells.length / cols) : 0
  const gridW = cells.length > 0 ? cols * cellWidth + (cols - 1) * colGap : 0

  let fullW = 0
  for (const line of [...head, ...tail]) {
    fullW = Math.max(fullW, measureLineWidth(line, fontSize, font, gutter))
  }

  const height = Math.ceil((head.length + tail.length + rows) * pitch)
  return {
    width: Math.ceil(Math.max(gridW, fullW)),
    height,
    pitch,
    gutter,
    cols,
    rows,
    cellWidth,
    colGap,
  }
}
