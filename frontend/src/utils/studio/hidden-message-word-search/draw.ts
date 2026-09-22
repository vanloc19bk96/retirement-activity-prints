import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  toNonBreakingSpaces,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import {
  hugTextBoxWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  buildGroup,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_BODY_SIZE,
  STUDIO_INK,
} from '@/constants/studio.constants'
import {
  drawLetterGrid,
  drawWordList,
  minimumWordListHeight,
} from '../retirement-word-search/draw'
import type { RetirementPrintStyle } from './content'
import type { HiddenMessagePuzzle } from './place'

const STACK_GAP = 12
/** Wide enough for senior handwriting (not cramped squares). */
const SLOT_EM = 1.45
const RULE_RATIO = 0.9
/** Hairline write-in rule — filled bar, not a stroked rect. */
const RULE_HEIGHT = 1
const WORD_GAP_RATIO = 0.55
/** Flatter than cryptogram — only a write-in rule, no cipher code below. */
const LINE_H_RATIO = 1.7
/** Amazon KDP large-print floor for body / puzzle letters (~14 pt). */
const KDP_LARGE_PRINT_MIN = 14
const KDP_LARGE_PRINT_GRID_MIN = 16
const LARGE_PRINT_LETTER_SCALE = 0.68
const STANDARD_LETTER_SCALE = 0.55
/** Matches retirement word search: pad so answer strokes stay inside the grid band. */
const GRID_BAND_PAD = 20

function asWordSearch(puzzle: HiddenMessagePuzzle) {
  return {
    grid: puzzle.grid,
    placements: puzzle.placements,
    size: puzzle.size,
    words: puzzle.words,
    displays: puzzle.displays,
  }
}

function leftoverSet(puzzle: HiddenMessagePuzzle): Set<string> {
  return new Set(puzzle.leftoverCells.map((cell) => `${cell.r},${cell.c}`))
}

function alphabeticalDisplays(puzzle: HiddenMessagePuzzle): string[] {
  return [...puzzle.displays].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
}

function messageWords(display: string): string[] {
  return display
    .split(' ')
    .map((word) => word.toUpperCase().replace(/[^A-Z]/g, ''))
    .filter(Boolean)
}

function wrapWordLines(words: string[], slotW: number, wordGap: number, areaWidth: number): string[][] {
  const lines: string[][] = []
  let current: string[] = []
  let width = 0
  for (const word of words) {
    const wordW = word.length * slotW
    const next = current.length === 0 ? wordW : width + wordGap + wordW
    if (current.length > 0 && next > areaWidth) {
      lines.push(current)
      current = [word]
      width = wordW
      continue
    }
    current.push(word)
    width = next
  }
  if (current.length > 0) lines.push(current)
  return lines
}

function linePixelWidth(words: string[], slotW: number, wordGap: number): number {
  let width = 0
  for (let i = 0; i < words.length; i++) {
    width += words[i]!.length * slotW
    if (i < words.length - 1) width += wordGap
  }
  return width
}

interface MessageLayout {
  slotW: number
  wordGap: number
  lineH: number
  lines: string[][]
  height: number
  fontSize: number
}

function slotBounds(printStyle: RetirementPrintStyle): { min: number; max: number } {
  if (printStyle === 'large-print') return { min: 28, max: 44 }
  return { min: 20, max: 36 }
}

function fitMessageLayout(
  area: Box,
  words: string[],
  printStyle: RetirementPrintStyle,
): MessageLayout {
  const { min: minSlot, max: maxSlot } = slotBounds(printStyle)
  const maxByWidth = Math.floor(area.width / Math.max(1, words[0]?.length ?? 8))
  const start = Math.min(maxSlot, Math.max(minSlot, maxByWidth, Math.floor(STUDIO_BODY_SIZE * SLOT_EM)))
  const answerFloor = printStyle === 'large-print' ? KDP_LARGE_PRINT_MIN : 12

  for (let slotW = start; slotW >= minSlot; slotW -= 1) {
    const wordGap = Math.round(slotW * WORD_GAP_RATIO)
    const lines = wrapWordLines(words, slotW, wordGap, area.width)
    const lineH = Math.max(Math.round(slotW * LINE_H_RATIO), minSlot + 8)
    const height = lines.length * lineH
    if (height <= area.height) {
      return {
        slotW,
        wordGap,
        lineH,
        lines,
        height,
        fontSize: Math.max(answerFloor, Math.floor(slotW * 0.62)),
      }
    }
  }

  const slotW = minSlot
  const wordGap = Math.round(slotW * WORD_GAP_RATIO)
  const lines = wrapWordLines(words, slotW, wordGap, area.width)
  const lineH = Math.max(Math.round(slotW * LINE_H_RATIO), minSlot + 8)
  return {
    slotW,
    wordGap,
    lineH,
    lines,
    height: lines.length * lineH,
    fontSize: Math.max(answerFloor, Math.floor(slotW * 0.62)),
  }
}

/** One writing line per letter; visible gaps between words. */
function drawMessageWritingLines(options: {
  area: Box
  words: string[]
  letters: string
  font: string
  tag: StudioTag
  printStyle: RetirementPrintStyle
}): StudioFabricObject[] {
  const { area, words, letters, font, tag, printStyle } = options
  if (words.length === 0 || area.height < 16) return []

  const layout = fitMessageLayout(area, words, printStyle)
  const top = area.top + Math.max(0, (area.height - layout.height) / 2)
  const rules: StudioFabricObject[] = []
  const answers: StudioFabricObject[] = []
  let letterIndex = 0

  layout.lines.forEach((line, row) => {
    const width = linePixelWidth(line, layout.slotW, layout.wordGap)
    let cursor = area.left + Math.max(0, (area.width - width) / 2)
    const lineTop = top + row * layout.lineH
    const ruleY = Math.round(lineTop + layout.lineH * 0.72)
    const answerY = Math.round(lineTop + layout.lineH * 0.38)

    for (let w = 0; w < line.length; w++) {
      const word = line[w]!
      for (const letter of word) {
        const centerX = cursor + layout.slotW / 2
        const ruleW = Math.round(layout.slotW * RULE_RATIO)
        rules.push(
          buildRect(
            {
              left: Math.round(centerX - ruleW / 2),
              top: ruleY,
              width: ruleW,
              height: RULE_HEIGHT,
              fill: STUDIO_INK,
              stroke: 'transparent',
              strokeWidth: 0,
            },
            tag,
            'structure',
          ),
        )
        const answer = letters[letterIndex] ?? letter
        letterIndex += 1
        answers.push(
          buildText(
            {
              left: centerX,
              top: answerY,
              text: answer,
              fontFamily: font,
              fontSize: layout.fontSize,
              width: estimateTextBoxWidth(answer, layout.fontSize, layout.slotW),
              textAlign: 'center',
              originX: 'center',
              originY: 'center',
              lineHeight: 1,
            },
            tag,
            'answer',
          ),
        )
        cursor += layout.slotW
      }
      if (w < line.length - 1) cursor += layout.wordGap
    }
  })

  const bounds = unionObjectBounds(rules)
  if (!bounds) return answers
  return [buildGroup(rules, bounds, tag, 'structure'), ...answers]
}

function fitSayingLine(options: {
  text: string
  font: string
  maxWidth: number
  preferred: number
  minimum: number
}): { text: string; fontSize: number; width: number } {
  const saying = options.text.trim()
  const spec: FontSpec = { fontFamily: options.font, fontWeight: 'normal' }
  const maxWidth = Math.max(1, options.maxWidth)
  const locked = toNonBreakingSpaces(saying)
  const lineWidth = (value: string, size: number) =>
    hugTextBoxWidth(value, size, Number.POSITIVE_INFINITY, spec)

  let fontSize = options.preferred
  while (fontSize > options.minimum && lineWidth(locked, fontSize) > maxWidth) {
    fontSize -= 1
  }

  const body =
    lineWidth(locked, fontSize) <= maxWidth
      ? locked
      : wrapTextToWidth(saying, fontSize, maxWidth, spec)
          .map(toNonBreakingSpaces)
          .join('\n')

  return {
    text: body,
    fontSize,
    width: hugTextBoxWidth(body, fontSize, maxWidth, spec),
  }
}

function drawMessageText(options: {
  area: Box
  text: string
  font: string
  tag: StudioTag
  printStyle: RetirementPrintStyle
}): StudioFabricObject {
  const { area, text, font, tag, printStyle } = options
  const floor = printStyle === 'large-print' ? KDP_LARGE_PRINT_MIN : 14
  const preferred = Math.max(floor, Math.min(STUDIO_BODY_SIZE, Math.floor(area.height * 0.55)))
  // Caps run wider than estimateTextBoxWidth; hugging the measured run (and
  // locking spaces) keeps the saying on one line when the band still has room.
  const fitted = fitSayingLine({
    text,
    font,
    maxWidth: area.width,
    preferred,
    minimum: floor,
  })
  return buildText(
    {
      left: boxCenterX(area),
      top: boxCenterY(area),
      text: fitted.text,
      fontFamily: font,
      fontSize: fitted.fontSize,
      fontWeight: 'normal',
      width: fitted.width,
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      lineHeight: 1,
    },
    tag,
    'answer',
  )
}

/** Same list share word search uses for this grid size, so letter size can match. */
function classicListShare(gridSize: number, printStyle: RetirementPrintStyle): number {
  if (printStyle === 'standard' || gridSize >= 13) return 0.34
  return 0.3
}

/** Letter size a classic word search would paint for this field and grid. */
function classicLetterSize(
  field: Box,
  gridSize: number,
  printStyle: RetirementPrintStyle,
): number {
  const gridShare = Math.max(
    0,
    Math.min(field.height * (1 - classicListShare(gridSize, printStyle)) - STACK_GAP, field.width),
  )
  const inner = Math.max(0, Math.min(field.width, gridShare) - GRID_BAND_PAD)
  const cell = Math.floor(inner / Math.max(1, gridSize))
  const scale = printStyle === 'large-print' ? LARGE_PRINT_LETTER_SCALE : STANDARD_LETTER_SCALE
  const min = printStyle === 'large-print' ? KDP_LARGE_PRINT_GRID_MIN : 14
  return Math.max(min, Math.floor(Math.max(0, cell) * scale))
}

/**
 * Grid band whose cells hold `fontSize` at the word-search fill (`letterScale`),
 * so the gap between capitals matches a classic word search — not a packed cell.
 */
function gridBandForFont(
  fontSize: number,
  gridSize: number,
  fieldWidth: number,
  letterScale: number,
): number {
  const cell = Math.max(1, Math.ceil(fontSize / letterScale))
  return Math.min(fieldWidth, cell * gridSize + GRID_BAND_PAD)
}

function measureMessageBand(
  fieldWidth: number,
  words: string[],
  maxHeight: number,
  printStyle: RetirementPrintStyle,
): number {
  const probe: Box = { left: 0, top: 0, width: fieldWidth, height: maxHeight }
  return fitMessageLayout(probe, words, printStyle).height
}

export function drawHiddenMessagePuzzle(options: {
  field: Box
  puzzle: HiddenMessagePuzzle
  font: string
  tag: StudioTag
  forAnswerKey?: boolean
  printStyle?: RetirementPrintStyle
}): StudioFabricObject[] {
  const {
    field,
    puzzle,
    font,
    tag,
    forAnswerKey = false,
    printStyle = 'large-print',
  } = options
  const core = asWordSearch(puzzle)
  const letterScale = printStyle === 'large-print' ? LARGE_PRINT_LETTER_SCALE : STANDARD_LETTER_SCALE
  const minLetterSize = printStyle === 'large-print' ? KDP_LARGE_PRINT_GRID_MIN : 14
  const bankMinFont = printStyle === 'large-print' ? KDP_LARGE_PRINT_MIN : 11
  const classicSize = classicLetterSize(field, puzzle.size, printStyle)
  // Font follows the cell at the word-search fill. Do not pass a larger
  // preferred size — that packs capitals up to 92% of a short cell.
  const letterStyle = { letterScale, minLetterSize }

  if (forAnswerKey) {
    const gap = STACK_GAP
    const msgShare = printStyle === 'large-print' ? 0.14 : 0.12
    const msgH = Math.max(printStyle === 'large-print' ? 40 : 32, field.height * msgShare)
    const gridArea: Box = {
      left: field.left,
      top: field.top,
      width: field.width,
      height: Math.max(0, field.height - msgH - gap),
    }
    const msgArea: Box = {
      left: field.left,
      top: gridArea.top + gridArea.height + gap,
      width: field.width,
      height: msgH,
    }
    return [
      drawLetterGrid(core, gridArea, font, tag, 'center', leftoverSet(puzzle), letterStyle),
      drawMessageText({ area: msgArea, text: puzzle.messageDisplay, font, tag, printStyle }),
    ]
  }

  const words = messageWords(puzzle.messageDisplay)
  const gap = STACK_GAP
  // Cap the write-in band so the grid / word bank keep large-print room.
  const maxMsgShare = printStyle === 'large-print' ? 0.16 : 0.14
  const maxMsgH = Math.max(48, Math.floor(field.height * maxMsgShare))
  const msgH = Math.min(maxMsgH, measureMessageBand(field.width, words, maxMsgH, printStyle))
  const room = Math.max(0, field.height - msgH - gap * 2)
  // Grow the grid until capitals sit at the word-search fill. The bank keeps
  // only the height it needs so those cells can open up.
  const bankTextRatio = 1
  const minList = minimumWordListHeight(puzzle.words.length, bankMinFont, bankTextRatio)
  const minGrid = gridBandForFont(classicSize, puzzle.size, field.width, letterScale)
  const gridH = Math.min(field.width, minGrid, Math.max(0, room - minList))
  const listH = Math.max(0, room - gridH)
  const stackTop = field.top

  const gridArea: Box = { left: field.left, top: stackTop, width: field.width, height: gridH }
  const listArea: Box = {
    left: field.left,
    top: stackTop + gridH + gap,
    width: field.width,
    height: listH,
  }
  const msgArea: Box = {
    left: field.left,
    top: listArea.top + listH + gap,
    width: field.width,
    height: msgH,
  }

  return [
    drawLetterGrid(core, gridArea, font, tag, 'center', undefined, letterStyle),
    ...drawWordList(alphabeticalDisplays(puzzle), listArea, font, tag, {
      minFontSize: bankMinFont,
      // All-caps bank; the line box is already one em, so the row can use the full height.
      textHeightRatio: bankTextRatio,
      // The grid keeps its classic-word-search fill, so the bank band is short.
      // Fit the column count to that band so words fill it instead of shrinking
      // every entry to the KDP floor.
      maximizeFont: true,
    }),
    ...drawMessageWritingLines({
      area: msgArea,
      words,
      letters: puzzle.messageLetters,
      font,
      tag,
      printStyle,
    }),
  ]
}
