import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  insetBox,
  fitSquareGrid,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  unionObjectBounds,
  columns,
  rows,
  type Box,
} from '../studio-layout'
import {
  hugTextBoxWidth,
  measureRunWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  buildText,
  buildRect,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_INK,
  STUDIO_RULE_LIGHT,
  STUDIO_STROKE_NORMAL,
  STUDIO_BODY_SIZE,
} from '@/constants/studio.constants'
import type { Placement, WordSearchPuzzle } from '@/utils/puzzles/word-search-core'
import { wordBankColumnCount } from './config'

/** Room for capsule stroke past cell edges (esp. diagonals). */
const ANSWER_STROKE_PAD = 10
const LIST_GUTTER = 16
const LIST_LABEL_GAP = 10
/** Keep word-bank glyphs inside the safe box (ascent/descent + estimate slack). */
const LIST_EDGE_PAD = 12
const LIST_CELL_PAD_X = 6
const LIST_ROW_GAP = 6
/**
 * Fabric Textbox paints taller than `fontSize` (metrics / line box). Group
 * bounds that assume height === fontSize clip capitals like “H” on the last row.
 */
const WORD_BANK_TEXT_HEIGHT_RATIO = 1.35
const WORD_BANK_GROUP_PAD = 4
const WORD_BANK_LABEL = 'Words to find:'

/**
 * Largest font size (≤ preferred, ≥ minimum) whose real canvas-measured width
 * still fits `maxWidth` on one line. Falls back to `minimum` when even that
 * doesn't fit — still the best available, and the caller has already tried to
 * buy back room by shrinking the column count before reaching this floor.
 */
function fitWordFontSize(
  word: string,
  maxWidth: number,
  preferred: number,
  minimum: number,
  spec: FontSpec,
): number {
  for (let size = preferred; size > minimum; size--) {
    if (measureRunWidth(word, size, spec) <= maxWidth) return size
  }
  return minimum
}

function snapGridInField(
  field: Box,
  cell: number,
  size: number,
  verticalAlign: 'top' | 'center' = 'top',
) {
  const width = cell * size
  const height = cell * size
  const left = Math.round(field.left + (field.width - width) / 2)
  // Puzzle page: top under the instruction. Solution page: optical center in the body.
  const top =
    verticalAlign === 'center'
      ? Math.round(field.top + (field.height - height) / 2)
      : Math.round(field.top)
  const bounds: Box = { left, top, width, height }
  return {
    cell,
    bounds,
    cellBox: (r: number, c: number): Box => ({
      left: left + c * cell,
      top: top + r * cell,
      width: cell,
      height: cell,
    }),
  }
}

/** Hollow stadium outline through a placed word (transparent fill, rounded ends). */
function answerCapsuleThroughWord(
  grid: ReturnType<typeof snapGridInField>,
  placement: Placement,
  tag: StudioTag,
): StudioFabricObject {
  const start = grid.cellBox(placement.r, placement.c)
  const endR = placement.r + placement.dir.dr * (placement.word.length - 1)
  const endC = placement.c + placement.dir.dc * (placement.word.length - 1)
  const end = grid.cellBox(endR, endC)
  const x1 = boxCenterX(start)
  const y1 = boxCenterY(start)
  const x2 = boxCenterX(end)
  const y2 = boxCenterY(end)
  const dx = x2 - x1
  const dy = y2 - y1
  const span = Math.hypot(dx, dy)
  const capsuleH = Math.max(12, Math.round(grid.cell * 0.82))
  const capsuleW = Math.max(capsuleH, Math.round(span + grid.cell * 0.82))
  const radius = capsuleH / 2
  const angle = span > 0 ? (Math.atan2(dy, dx) * 180) / Math.PI : 0
  return buildRect(
    {
      left: (x1 + x2) / 2,
      top: (y1 + y2) / 2,
      width: capsuleW,
      height: capsuleH,
      rx: radius,
      ry: radius,
      angle,
      originX: 'center',
      originY: 'center',
      fill: 'transparent',
      stroke: STUDIO_INK,
      strokeWidth: STUDIO_STROKE_NORMAL,
    },
    tag,
    'answer',
  )
}

export function drawLetterGrid(
  puzzle: WordSearchPuzzle,
  field: Box,
  font: string,
  tag: StudioTag,
  verticalAlign: 'top' | 'center' = 'top',
  shadedCells?: ReadonlySet<string>,
  letterStyle?: { letterScale?: number; minLetterSize?: number; preferredFontSize?: number },
): StudioFabricObject {
  // Inset so answer stroke pads stay inside the safe field.
  const gridField = insetBox(field, ANSWER_STROKE_PAD)
  const floated = fitSquareGrid(gridField, puzzle.size, puzzle.size)
  const g = snapGridInField(gridField, floated.cell, puzzle.size, verticalAlign)
  const letterScale = letterStyle?.letterScale ?? 0.55
  const minLetterSize = letterStyle?.minLetterSize ?? 14
  const scaled = Math.max(minLetterSize, Math.floor(g.cell * letterScale))
  // Callers can ask for the classic word-search size. Stay inside the cell so
  // capitals do not collide with the grid lines.
  const maxFit = Math.max(minLetterSize, Math.floor(g.cell * 0.92))
  const fontSize = Math.min(maxFit, Math.max(scaled, letterStyle?.preferredFontSize ?? scaled))
  const parts: StudioFabricObject[] = []
  // Solution leftover letters share cells with word capsules. Paint those
  // glyphs first so the answer stroke stays on top of the message highlight.
  const capsulesOnTop = shadedCells != null

  const pushCapsules = () => {
    for (const placement of puzzle.placements) {
      parts.push(answerCapsuleThroughWord(g, placement, tag))
    }
  }

  if (!capsulesOnTop) pushCapsules()

  for (let r = 0; r < puzzle.size; r++) {
    for (let c = 0; c < puzzle.size; c++) {
      const cell = g.cellBox(r, c)
      const letter = puzzle.grid[r]![c]!
      // Shaped puzzles keep a square coordinate system but leave cells outside
      // the mask blank. Do not draw glyphs or shading in those cells.
      if (!letter) continue
      if (shadedCells?.has(`${r},${c}`)) {
        parts.push(
          buildRect(
            {
              left: cell.left + 1,
              top: cell.top + 1,
              width: cell.width - 2,
              height: cell.height - 2,
              fill: STUDIO_RULE_LIGHT,
              stroke: 'transparent',
              strokeWidth: 0,
            },
            tag,
            'structure',
          ),
        )
      }
      parts.push(
        buildText(
          {
            left: boxCenterX(cell),
            top: boxCenterY(cell),
            text: letter,
            fontFamily: font,
            fontSize,
            fontWeight: 'normal',
            width: estimateTextBoxWidth(letter, fontSize, cell.width),
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            lineHeight: 1,
          },
          tag,
          'prompt',
        ),
      )
    }
  }

  if (capsulesOnTop) pushCapsules()

  // Group on the snapped (already-centered) grid square + answer stroke pad.
  const pad = ANSWER_STROKE_PAD
  const groupBounds: Box = {
    left: g.bounds.left - pad,
    top: g.bounds.top - pad,
    width: g.bounds.width + pad * 2,
    height: g.bounds.height + pad * 2,
  }
  return buildGroup(parts, groupBounds, tag)
}

/** Same list fraction word search uses so a sister puzzle can match its bank. */
export function wordSearchListShare(wordCount: number): number {
  if (wordCount >= 16) return 0.34
  if (wordCount >= 10) return 0.3
  return 0.26
}

/** Shortest band that fits every word at `minFontSize` without rows overlapping. */
export function minimumWordListHeight(
  wordCount: number,
  minFontSize: number,
  textHeightRatio: number,
): number {
  const count = Math.max(1, wordCount)
  const columnCount = Math.min(wordBankColumnCount(count), count)
  const rowCount = Math.ceil(count / columnCount)
  const labelSize = Math.min(STUDIO_BODY_SIZE - 4, Math.max(14, minFontSize))
  const rowHeight = Math.ceil(minFontSize * textHeightRatio)
  const listBox = rowCount * rowHeight + Math.max(0, rowCount - 1) * LIST_ROW_GAP
  return listBox + labelSize + LIST_LABEL_GAP + LIST_EDGE_PAD * 2
}

interface BankColumnLayout {
  colCount: number
  colBoxes: Box[]
  rowBoxes: Box[]
  colInnerW: number
  wordSize: number
  wordBoxHeight: number
}

interface BankFitOptions {
  words: string[]
  listBox: Box
  minFontSize: number
  maxFontSize: number
  textHeightRatio: number
  spec: FontSpec
}

/** Lay the bank into `colCount` equal columns and fit one font size to every word. */
function buildBankColumnLayout(options: BankFitOptions & { colCount: number }): BankColumnLayout {
  const { words, listBox, colCount, minFontSize, maxFontSize, textHeightRatio, spec } = options
  const rowsPerCol = Math.ceil(words.length / colCount)
  // Equal columns across the safe band — no shrink-wrap past the edges.
  const colBoxes = columns(listBox, colCount, LIST_GUTTER)
  const rowBoxes = rows(listBox, rowsPerCol, LIST_ROW_GAP)
  const colInnerW = Math.max(8, colBoxes[0]!.width - LIST_CELL_PAD_X * 2)
  const rowInnerH = Math.max(8, rowBoxes[0]!.height)
  // Font must leave room for Fabric’s taller-than-fontSize textbox metrics.
  const rowFitSize = Math.max(
    minFontSize,
    Math.min(maxFontSize, Math.floor(rowInnerH / textHeightRatio)),
  )
  // Longest bank word must fit its column on one line — never wrap or clip.
  const wordSize = words.reduce(
    (size, word) => Math.min(size, fitWordFontSize(word, colInnerW, rowFitSize, minFontSize, spec)),
    rowFitSize,
  )
  return {
    colCount,
    colBoxes,
    rowBoxes,
    colInnerW,
    wordSize,
    wordBoxHeight: Math.ceil(wordSize * textHeightRatio),
  }
}

/** Widest bank run at the readable floor — a column narrower than this soft-wraps. */
function widestBankRun(words: string[], minFontSize: number, spec: FontSpec): number {
  return words.reduce((max, word) => Math.max(max, measureRunWidth(word, minFontSize, spec)), 0)
}

/**
 * Default bank: start at `wordBankColumnCount`, then give up columns (down to 1)
 * until the widest entry provably fits one line at the readable floor.
 */
function fitBankColumns(options: BankFitOptions): BankColumnLayout {
  const { words, listBox, minFontSize, spec } = options
  const widest = widestBankRun(words, minFontSize, spec)
  let colCount = Math.min(wordBankColumnCount(words.length), words.length)
  // wordBankColumnCount only looks at word count. A long word/phrase can still
  // be wider than one line once split across that many columns — Fabric then
  // soft-wraps it. Give up columns until the widest entry provably fits.
  while (colCount > 1) {
    const tryColBoxes = columns(listBox, colCount, LIST_GUTTER)
    const tryColInnerW = Math.max(8, tryColBoxes[0]!.width - LIST_CELL_PAD_X * 2)
    if (widest <= tryColInnerW) break
    colCount -= 1
  }
  return buildBankColumnLayout({ ...options, colCount })
}

/**
 * Large-print bank: pick the column count that yields the largest readable font
 * for the band height, so a short band does not force every word to the floor.
 * Only considers counts where the widest word still fits one line.
 */
function maximizeBankColumns(options: BankFitOptions): BankColumnLayout {
  const { words, listBox, minFontSize, spec } = options
  const widest = widestBankRun(words, minFontSize, spec)
  let maxCol = 1
  for (let colCount = 1; colCount <= words.length; colCount++) {
    const colBoxes = columns(listBox, colCount, LIST_GUTTER)
    const colInnerW = Math.max(8, colBoxes[0]!.width - LIST_CELL_PAD_X * 2)
    if (colInnerW < widest) break
    maxCol = colCount
  }
  let best = buildBankColumnLayout({ ...options, colCount: 1 })
  for (let colCount = 2; colCount <= maxCol; colCount++) {
    const candidate = buildBankColumnLayout({ ...options, colCount })
    // Bigger font wins; ties keep the earlier (fewer-column) balanced layout.
    if (candidate.wordSize > best.wordSize) best = candidate
  }
  return best
}

export function drawWordList(
  words: string[],
  area: Box,
  font: string,
  tag: StudioTag,
  options?: {
    minFontSize?: number
    textHeightRatio?: number
    maxFontSize?: number
    /** Large-print banks: fit the column count to the band so words fill the height. */
    maximizeFont?: boolean
  },
): StudioFabricObject[] {
  const objects: StudioFabricObject[] = []
  const minFontSize = options?.minFontSize ?? 11
  const textHeightRatio = options?.textHeightRatio ?? WORD_BANK_TEXT_HEIGHT_RATIO
  const maxFontSize = options?.maxFontSize ?? STUDIO_BODY_SIZE - 2
  const safe: Box = {
    left: area.left + LIST_EDGE_PAD,
    top: area.top + LIST_EDGE_PAD,
    width: Math.max(0, area.width - LIST_EDGE_PAD * 2),
    height: Math.max(0, area.height - LIST_EDGE_PAD * 2),
  }
  if (safe.width < 24 || safe.height < 24) return objects

  const labelSize = Math.max(
    Math.max(14, minFontSize),
    Math.min(STUDIO_BODY_SIZE - 4, Math.floor(safe.height * 0.22)),
  )
  // Label stays ungrouped so it can be edited/moved independently.
  objects.push(
    buildText(
      {
        left: boxCenterX(safe),
        top: safe.top,
        text: WORD_BANK_LABEL,
        fontFamily: font,
        fontSize: labelSize,
        fontWeight: 'normal',
        width: estimateTextBoxWidth(WORD_BANK_LABEL, labelSize, safe.width),
        textAlign: 'center',
        originX: 'center',
      },
      tag,
      'decoration',
    ),
  )

  const listTop = safe.top + labelSize + LIST_LABEL_GAP
  const listBox: Box = {
    left: safe.left,
    top: listTop,
    width: safe.width,
    height: Math.max(0, safe.top + safe.height - listTop),
  }

  const displayWords = words
  if (displayWords.length === 0 || listBox.height < 12) return objects

  // Fabric wraps a Textbox against its *actual* rendered glyph width, which the
  // hand-rolled per-char estimate above only approximates. A word the estimate
  // says fits can still be measured wider by the real font and get soft-wrapped
  // onto a second line, so column/font fitting below uses real canvas metrics.
  const spec: FontSpec = { fontFamily: font, fontWeight: 'normal' }

  const { colCount, colBoxes, rowBoxes, colInnerW, wordSize, wordBoxHeight } = (
    options?.maximizeFont ? maximizeBankColumns : fitBankColumns
  )({ words: displayWords, listBox, minFontSize, maxFontSize, textHeightRatio, spec })

  const wordParts: StudioFabricObject[] = []
  for (let i = 0; i < displayWords.length; i++) {
    const col = i % colCount
    const row = Math.floor(i / colCount)
    const cell = {
      left: colBoxes[col]!.left + LIST_CELL_PAD_X,
      top: rowBoxes[row]!.top,
      width: colInnerW,
      height: rowBoxes[row]!.height,
    }
    const word = displayWords[i]!
    wordParts.push(
      buildText(
        {
          left: boxCenterX(cell),
          top: boxCenterY(cell),
          text: word,
          fontFamily: font,
          fontSize: wordSize,
          fontWeight: 'normal',
          width: hugTextBoxWidth(word, wordSize, cell.width, spec),
          height: wordBoxHeight,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          lineHeight: 1,
        },
        tag,
        'prompt',
      ),
    )
  }

  const bounds = unionObjectBounds(wordParts)
  if (bounds) {
    const pad = WORD_BANK_GROUP_PAD
    objects.push(
      buildGroup(
        wordParts,
        {
          left: bounds.left - pad,
          top: bounds.top - pad,
          width: bounds.width + pad * 2,
          height: bounds.height + pad * 2,
        },
        tag,
      ),
    )
  }
  return objects
}

export function drawWordSearchPuzzle(options: {
  field: Box
  puzzle: WordSearchPuzzle
  font: string
  tag: StudioTag
  /** Solution page: grid only, optically centered in the body. */
  forAnswerKey?: boolean
  printStyle?: 'large-print' | 'standard'
}): StudioFabricObject[] {
  const { field, puzzle, font, tag, forAnswerKey = false, printStyle = 'large-print' } = options
  const letterStyle =
    printStyle === 'large-print'
      ? { letterScale: 0.68, minLetterSize: 16 }
      : { letterScale: 0.55, minLetterSize: 14 }
  const bankMinFont = printStyle === 'large-print' ? 14 : 11

  if (forAnswerKey) {
    return [drawLetterGrid(puzzle, field, font, tag, 'center', undefined, letterStyle)]
  }

  const gap = 12
  // Dense banks need more list height so long words stay inside the safe area.
  const listShare = wordSearchListShare(puzzle.words.length)
  const gridShare = Math.min(field.height * (1 - listShare) - gap, field.width)
  const gridArea: Box = {
    left: field.left,
    top: field.top,
    width: field.width,
    height: Math.max(0, gridShare),
  }
  const listArea: Box = {
    left: field.left,
    top: field.top + gridShare + gap,
    width: field.width,
    height: Math.max(0, field.height - gridShare - gap),
  }

  // Pack to top of body so the grid sits close under the instruction.
  const bankWords =
    puzzle.displays.length === puzzle.words.length ? puzzle.displays : puzzle.words

  return [
    drawLetterGrid(puzzle, gridArea, font, tag, 'top', undefined, letterStyle),
    ...drawWordList(
      [...bankWords].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
      listArea,
      font,
      tag,
      { minFontSize: bankMinFont },
    ),
  ]
}
