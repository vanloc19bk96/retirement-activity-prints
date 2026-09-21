import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  insetBox,
  fitSquareGrid,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  unionObjectBounds,
  columns,
  rows,
  type Box,
} from '../studio-layout'
import {
  buildText,
  buildRect,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_INK,
  STUDIO_STROKE_NORMAL,
  STUDIO_BODY_SIZE,
} from '@/constants/studio.constants'
import type { Placement, WordSearchPuzzle } from '@/utils/puzzles/word-search-core'

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

function drawLetterGrid(
  puzzle: WordSearchPuzzle,
  field: Box,
  font: string,
  tag: StudioTag,
  verticalAlign: 'top' | 'center' = 'top',
): StudioFabricObject {
  // Inset so answer stroke pads stay inside the safe field.
  const gridField = insetBox(field, ANSWER_STROKE_PAD)
  const floated = fitSquareGrid(gridField, puzzle.size, puzzle.size)
  const g = snapGridInField(gridField, floated.cell, puzzle.size, verticalAlign)
  const fontSize = Math.max(14, Math.floor(g.cell * 0.55))
  const parts: StudioFabricObject[] = []

  for (const placement of puzzle.placements) {
    parts.push(answerCapsuleThroughWord(g, placement, tag))
  }

  for (let r = 0; r < puzzle.size; r++) {
    for (let c = 0; c < puzzle.size; c++) {
      const cell = g.cellBox(r, c)
      const letter = puzzle.grid[r]![c]!
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

function colCountForWords(wordCount: number): number {
  if (wordCount <= 8) return 2
  if (wordCount <= 14) return 3
  return 4
}

function drawWordList(
  words: string[],
  area: Box,
  font: string,
  tag: StudioTag,
): StudioFabricObject[] {
  const objects: StudioFabricObject[] = []
  const safe: Box = {
    left: area.left + LIST_EDGE_PAD,
    top: area.top + LIST_EDGE_PAD,
    width: Math.max(0, area.width - LIST_EDGE_PAD * 2),
    height: Math.max(0, area.height - LIST_EDGE_PAD * 2),
  }
  if (safe.width < 24 || safe.height < 24) return objects

  const labelSize = Math.max(14, Math.min(STUDIO_BODY_SIZE - 4, Math.floor(safe.height * 0.22)))
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

  const colCount = Math.min(colCountForWords(displayWords.length), displayWords.length)
  const rowsPerCol = Math.ceil(displayWords.length / colCount)
  // Equal columns across the safe band — no shrink-wrap past the edges.
  const colBoxes = columns(listBox, colCount, LIST_GUTTER)
  const rowBoxes = rows(listBox, rowsPerCol, LIST_ROW_GAP)
  const colInnerW = Math.max(8, colBoxes[0]!.width - LIST_CELL_PAD_X * 2)
  const rowInnerH = Math.max(8, rowBoxes[0]!.height)
  // Font must leave room for Fabric’s taller-than-fontSize textbox metrics.
  const rowFitSize = Math.max(
    10,
    Math.min(
      STUDIO_BODY_SIZE - 2,
      Math.floor(rowInnerH / WORD_BANK_TEXT_HEIGHT_RATIO),
    ),
  )
  // Longest bank word must fit its column on one line — never wrap or clip.
  const wordSize = displayWords.reduce(
    (size, word) => Math.min(size, fitFontSizeToWidth(word, colInnerW, rowFitSize, 9)),
    rowFitSize,
  )
  const wordBoxHeight = Math.ceil(wordSize * WORD_BANK_TEXT_HEIGHT_RATIO)

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
          width: estimateTextBoxWidth(word, wordSize, cell.width),
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
}): StudioFabricObject[] {
  const { field, puzzle, font, tag, forAnswerKey = false } = options

  if (forAnswerKey) {
    return [drawLetterGrid(puzzle, field, font, tag, 'center')]
  }

  const gap = 12
  // Dense banks need more list height so long words stay inside the safe area.
  const listShare =
    puzzle.words.length >= 16 ? 0.34 : puzzle.words.length >= 10 ? 0.3 : 0.26
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
    drawLetterGrid(puzzle, gridArea, font, tag, 'top'),
    ...drawWordList(bankWords, listArea, font, tag),
  ]
}
