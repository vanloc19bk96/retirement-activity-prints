import {
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import {
  contentBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import type {
  StudioConfig,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import type { PairAnswerFormat } from '@/types/studio-pairs.types'

/** ≈50 mm blank — §6.2 */
export const MIN_BLANK_W = 142
/** ≈20 mm matching gutter — §6.2 */
export const MATCH_GUTTER = 57
/** ≈12 mm pair gutter — §6.1 */
export const PAIR_GUTTER = 34
/** ≈32 mm image cell — §6.5 */
export const MIN_IMAGE = 91

export const LARGE_PRINT = STUDIO_BODY_SIZE * 1.2
/** Multiple-choice uses a smaller face so 2×2 option labels stay on one line. */
export const MC_QUESTION_SIZE = 18
export const MC_OPTION_SIZE = 16
/** Rounded option / study cell height. */
export const MC_CELL_H = 40
/** Preferred linked-card row height (study / write-in / matching). */
export const STUDY_CELL_H = 48
/** Floor so 10 pairs still fit on default 6×9 without dropping rows. */
const MIN_CARD_CELL_H = 40
export const STUDY_FONT_SIZE = 22
const MIN_CARD_FONT_SIZE = 18
/** Band between the two cells on a linked row (circles + link). */
export const MC_CONNECTOR_W = 72
/** Gutter between MC option columns (no connector). */
export const MC_OPTION_GUTTER = 16
export const MC_CIRCLE_R = 5
/** Min / max gaps for linked-card rows (study / write-in / matching). */
const MIN_CARD_ROW_GAP = 8
const MAX_CARD_ROW_GAP = 20
/** Keep MC blocks from stretching so the last question stays inside the safe area. */
const MC_MIN_GAP = 6
const MC_MAX_GAP = 20
/** Bottom pad so strokes / group bounds stay inside the safe field. */
const FIELD_BOTTOM_PAD = 12
const MC_OPTION_ROW_GAP = 10
/** Space between the cue question and the option grid. */
export const MC_QUESTION_GAP = 16
/** 2 = comfortable 2×2; 4 = dense 1×4 row (needed for 10 pairs on 6×9). */
export type McOptionCols = 2 | 4
/** Shrink floors for 2×2 blocks. */
const MIN_MC_QUESTION_SIZE = 14
const MIN_MC_OPTION_SIZE = 11
const MIN_MC_CELL_H = 26
const MIN_MC_QUESTION_GAP = 6
const MIN_MC_OPTION_ROW_GAP = 4
/** Preferred / floor metrics for the dense 1×4 strip. */
const COMPACT_MC_QUESTION_SIZE = 14
const COMPACT_MC_OPTION_SIZE = 12
const COMPACT_MC_CELL_H = 30
const COMPACT_MC_QUESTION_GAP = 6
const MIN_COMPACT_MC_QUESTION_SIZE = 12
const MIN_COMPACT_MC_OPTION_SIZE = 10
const MIN_COMPACT_MC_CELL_H = 22
const MIN_COMPACT_MC_QUESTION_GAP = 4

export type PairPageRole = 'study' | 'recall'

export interface McLayout {
  questionSize: number
  optionSize: number
  questionGap: number
  cellH: number
  optionRowGap: number
  /** 2 → 2×2 grid; 4 → single row of four options. */
  optionCols: McOptionCols
}

export interface PairGeometry {
  rowY: number[]
  blockH: number
  /** Vertical gap between packed rows — drawers must use this, not a local constant. */
  gap: number
  fontSize: number
  count: number
  leftCol: Box
  rightCol: Box
  connectorX: number
  matchRightX: number
  blankX: number
  blankW: number
  imageSize: number
  field: Box
  /** Packed MC metrics (zeroed for non-MC layouts). */
  mc: McLayout
}

function rowsHeight(count: number, blockH: number, gap: number): number {
  return count * blockH + Math.max(0, count - 1) * gap
}

/**
 * Pack as many requested card rows as possible: shrink gap, then cell height,
 * and only then drop rows. Prefer keeping the configured pair count on 6×9.
 * `minBlock` stays at preferred when rows hold images (do not crush thumbnails).
 */
function packCardRows(
  usableH: number,
  pairCount: number,
  preferredBlock: number,
  minBlock: number,
): { count: number; blockH: number; gap: number } {
  let count = Math.min(10, Math.max(1, Math.floor(pairCount)))
  const floorBlock = Math.min(preferredBlock, Math.max(1, minBlock))

  while (count >= 1) {
    if (rowsHeight(count, preferredBlock, MIN_CARD_ROW_GAP) <= usableH) {
      const gapBudget = usableH - count * preferredBlock
      const rawGap =
        count <= 1 ? 0 : Math.max(MIN_CARD_ROW_GAP, gapBudget / Math.max(1, count - 1))
      return {
        count,
        blockH: preferredBlock,
        gap: Math.min(rawGap, MAX_CARD_ROW_GAP),
      }
    }

    if (
      floorBlock < preferredBlock &&
      rowsHeight(count, floorBlock, MIN_CARD_ROW_GAP) <= usableH
    ) {
      const blockH = Math.max(
        floorBlock,
        Math.min(
          preferredBlock,
          Math.floor((usableH - Math.max(0, count - 1) * MIN_CARD_ROW_GAP) / count),
        ),
      )
      const gapBudget = usableH - count * blockH
      const rawGap =
        count <= 1 ? 0 : Math.max(MIN_CARD_ROW_GAP, gapBudget / Math.max(1, count - 1))
      return {
        count,
        blockH,
        gap: Math.min(rawGap, MAX_CARD_ROW_GAP),
      }
    }

    count--
  }

  return { count: 1, blockH: preferredBlock, gap: MIN_CARD_ROW_GAP }
}

function headerConfig(config: StudioConfig, pageTitle: string): StudioConfig {
  const existing = String(config.title ?? '').trim()
  return existing ? config : { ...config, title: pageTitle }
}

export function resolvePairField(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  pageTitle: string,
  instruction: string,
): Box {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const cfg = headerConfig(config, pageTitle)
  const headerH = measureHeaderHeight(cfg, instruction, content.width)
  return {
    left: content.left,
    top: content.top + headerH,
    width: content.width,
    height: Math.max(1, content.height - headerH),
  }
}

export function studyInstruction(): string {
  return (
    'Study these pairs and try to remember which words go together. ' +
    'Picture the two things together. The sillier the picture, the better it sticks'
  )
}

export function recallInstruction(format: PairAnswerFormat): string {
  if (format === 'matching') {
    return 'Draw a line from each word on the left to the word it was paired with'
  }
  if (format === 'multiple-choice') {
    return 'Circle the word that went with each clue. Do not look back'
  }
  return 'Write the word that went with each one. Do not look back'
}

function optionRowsFor(cols: McOptionCols): number {
  return cols === 4 ? 1 : 2
}

export function mcBlockHeight(
  questionSize = MC_QUESTION_SIZE,
  questionGap = MC_QUESTION_GAP,
  cellH = MC_CELL_H,
  optionRowGap = MC_OPTION_ROW_GAP,
  optionCols: McOptionCols = 2,
): number {
  const rows = optionRowsFor(optionCols)
  return (
    questionSize +
    questionGap +
    rows * cellH +
    Math.max(0, rows - 1) * optionRowGap
  )
}

function preferredMcLayout(optionCols: McOptionCols): McLayout {
  if (optionCols === 4) {
    return {
      questionSize: COMPACT_MC_QUESTION_SIZE,
      optionSize: COMPACT_MC_OPTION_SIZE,
      questionGap: COMPACT_MC_QUESTION_GAP,
      cellH: COMPACT_MC_CELL_H,
      optionRowGap: 0,
      optionCols: 4,
    }
  }
  return {
    questionSize: MC_QUESTION_SIZE,
    optionSize: MC_OPTION_SIZE,
    questionGap: MC_QUESTION_GAP,
    cellH: MC_CELL_H,
    optionRowGap: MC_OPTION_ROW_GAP,
    optionCols: 2,
  }
}

function minMcLayout(optionCols: McOptionCols): McLayout {
  if (optionCols === 4) {
    return {
      questionSize: MIN_COMPACT_MC_QUESTION_SIZE,
      optionSize: MIN_COMPACT_MC_OPTION_SIZE,
      questionGap: MIN_COMPACT_MC_QUESTION_GAP,
      cellH: MIN_COMPACT_MC_CELL_H,
      optionRowGap: 0,
      optionCols: 4,
    }
  }
  return {
    questionSize: MIN_MC_QUESTION_SIZE,
    optionSize: MIN_MC_OPTION_SIZE,
    questionGap: MIN_MC_QUESTION_GAP,
    cellH: MIN_MC_CELL_H,
    optionRowGap: MIN_MC_OPTION_ROW_GAP,
    optionCols: 2,
  }
}

function layoutBlockHeight(layout: McLayout): number {
  return mcBlockHeight(
    layout.questionSize,
    layout.questionGap,
    layout.cellH,
    layout.optionRowGap,
    layout.optionCols,
  )
}

/** Split a packed MC block height into question / option metrics. */
export function resolveMcLayout(
  blockH: number,
  optionCols: McOptionCols = 2,
): McLayout {
  const preferred = preferredMcLayout(optionCols)
  const floor = minMcLayout(optionCols)
  const preferredH = layoutBlockHeight(preferred)
  if (blockH >= preferredH) return preferred

  const scale = Math.max(layoutBlockHeight(floor) / preferredH, blockH / preferredH)
  const questionSize = Math.max(
    floor.questionSize,
    Math.round(preferred.questionSize * scale),
  )
  const questionGap = Math.max(
    floor.questionGap,
    Math.round(preferred.questionGap * scale),
  )
  const optionRowGap =
    optionCols === 4
      ? 0
      : Math.max(floor.optionRowGap, Math.round(preferred.optionRowGap * scale))
  const rows = optionRowsFor(optionCols)
  const fixed = questionSize + questionGap + Math.max(0, rows - 1) * optionRowGap
  const cellH = Math.max(floor.cellH, Math.floor((blockH - fixed) / rows))
  const optionSize = Math.max(
    floor.optionSize,
    Math.min(
      preferred.optionSize,
      Math.round(preferred.optionSize * (cellH / preferred.cellH)),
    ),
  )
  return {
    questionSize,
    optionSize,
    questionGap,
    cellH,
    optionRowGap,
    optionCols,
  }
}

function packMcWithCols(
  usableH: number,
  count: number,
  optionCols: McOptionCols,
): { blockH: number; gap: number; mc: McLayout } | null {
  const preferred = preferredMcLayout(optionCols)
  const preferredH = layoutBlockHeight(preferred)
  const floorH = layoutBlockHeight(minMcLayout(optionCols))

  if (rowsHeight(count, preferredH, MC_MIN_GAP) <= usableH) {
    const gapBudget = usableH - count * preferredH
    const rawGap =
      count <= 1 ? 0 : Math.max(MC_MIN_GAP, gapBudget / Math.max(1, count - 1))
    return {
      blockH: preferredH,
      gap: Math.min(rawGap, MC_MAX_GAP),
      mc: preferred,
    }
  }

  if (rowsHeight(count, floorH, MC_MIN_GAP) > usableH) return null

  const packed = Math.max(
    floorH,
    Math.min(
      preferredH,
      Math.floor((usableH - Math.max(0, count - 1) * MC_MIN_GAP) / count),
    ),
  )
  const mc = resolveMcLayout(packed, optionCols)
  const blockH = layoutBlockHeight(mc)
  if (rowsHeight(count, blockH, MC_MIN_GAP) > usableH) return null

  const gapBudget = usableH - count * blockH
  const rawGap =
    count <= 1 ? 0 : Math.max(MC_MIN_GAP, gapBudget / Math.max(1, count - 1))
  return {
    blockH,
    gap: Math.min(rawGap, MC_MAX_GAP),
    mc,
  }
}

/**
 * Pack MC question blocks: shrink 2×2, then switch to a dense 1×4 strip,
 * and only then drop pairs — so max config (10) still fits on 6×9.
 */
function packMcRows(
  usableH: number,
  pairCount: number,
): { count: number; blockH: number; gap: number; mc: McLayout } {
  let count = Math.min(10, Math.max(1, Math.floor(pairCount)))

  while (count >= 1) {
    const grid = packMcWithCols(usableH, count, 2)
    if (grid) return { count, ...grid }

    const strip = packMcWithCols(usableH, count, 4)
    if (strip) return { count, ...strip }

    count--
  }

  const mc = preferredMcLayout(2)
  return {
    count: 1,
    blockH: layoutBlockHeight(mc),
    gap: MC_MIN_GAP,
    mc,
  }
}

function studyBlockHeight(hasImages: boolean): number {
  return Math.max(STUDY_CELL_H, hasImages ? MIN_IMAGE : 0)
}

function recallBlockHeight(
  format: PairAnswerFormat,
  hasImages: boolean,
): number {
  if (format === 'multiple-choice') return mcBlockHeight()
  if (format === 'matching' || format === 'write-in') return STUDY_CELL_H
  return Math.max(LARGE_PRINT * 1.4, hasImages ? MIN_IMAGE : 0)
}

const EMPTY_MC: McLayout = {
  questionSize: 0,
  optionSize: 0,
  questionGap: 0,
  cellH: 0,
  optionRowGap: 0,
  optionCols: 2,
}

/**
 * Page-local geometry. Study / write-in / matching use compact cards that
 * shrink before dropping pairs; MC shrinks 2×2 then falls back to a 1×4 strip.
 */
export function computePairGeometry(
  body: Box,
  pairCount: number,
  format: PairAnswerFormat,
  hasImages: boolean,
  pageRole: PairPageRole = 'recall',
): PairGeometry {
  const imageSize = hasImages ? MIN_IMAGE : 0
  const isMcRecall = pageRole === 'recall' && format === 'multiple-choice'
  const isCardLayout =
    pageRole === 'study' || format === 'matching' || format === 'write-in'
  const preferredBlock =
    pageRole === 'study'
      ? studyBlockHeight(hasImages)
      : recallBlockHeight(format, hasImages)
  const usableH = Math.max(1, body.height - FIELD_BOTTOM_PAD)

  let count: number
  let blockH: number
  let gap: number
  let mc: McLayout = EMPTY_MC

  if (isCardLayout) {
    const minBlock = hasImages ? preferredBlock : MIN_CARD_CELL_H
    ;({ count, blockH, gap } = packCardRows(
      usableH,
      pairCount,
      preferredBlock,
      minBlock,
    ))
  } else if (isMcRecall) {
    ;({ count, blockH, gap, mc } = packMcRows(usableH, pairCount))
  } else {
    count = Math.min(10, Math.max(1, Math.floor(pairCount)))
    blockH = preferredBlock
    while (count > 1) {
      if (rowsHeight(count, blockH, MC_MIN_GAP) <= usableH) break
      count--
    }
    const gapBudget = usableH - count * blockH
    const rawGap =
      count <= 1 ? 0 : Math.max(MC_MIN_GAP, gapBudget / Math.max(1, count - 1))
    gap = Math.min(rawGap, MC_MAX_GAP)
  }

  const fontSize = isMcRecall
    ? mc.questionSize
    : isCardLayout
      ? Math.max(
          MIN_CARD_FONT_SIZE,
          Math.min(
            STUDY_FONT_SIZE,
            Math.round(STUDY_FONT_SIZE * (blockH / STUDY_CELL_H)),
          ),
        )
      : LARGE_PRINT

  const field: Box = {
    left: body.left,
    top: body.top,
    width: body.width,
    height: Math.max(blockH, usableH),
  }

  const blockHTotal = rowsHeight(count, blockH, gap)
  const startTop = field.top + Math.max(0, (field.height - blockHTotal) / 2)

  const rowY: number[] = []
  for (let i = 0; i < count; i++) {
    rowY.push(Math.round(startTop + i * (blockH + gap)))
  }

  const colW = Math.floor((field.width - PAIR_GUTTER) / 2)
  const leftCol: Box = {
    left: field.left,
    top: field.top,
    width: colW,
    height: field.height,
  }
  const rightCol: Box = {
    left: field.left + colW + PAIR_GUTTER,
    top: field.top,
    width: colW,
    height: field.height,
  }
  const connectorX = Math.round(field.left + colW + PAIR_GUTTER / 2)

  const matchHalf = Math.floor((field.width - MATCH_GUTTER) / 2)
  const matchRightX = field.left + matchHalf + MATCH_GUTTER

  const cueW = Math.min(colW, Math.floor(field.width * 0.35))
  const blankX = field.left + cueW + 20
  const blankW = Math.max(MIN_BLANK_W, field.left + field.width - blankX)

  return {
    rowY,
    blockH,
    gap,
    fontSize,
    count,
    leftCol,
    rightCol,
    connectorX,
    matchRightX,
    blankX,
    blankW,
    imageSize,
    field,
    mc,
  }
}

export { headerConfig }
