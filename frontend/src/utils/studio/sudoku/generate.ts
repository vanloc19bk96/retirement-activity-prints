import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng } from '../studio-rng'
import {
  contentBox,
  insetHorizontal,
  drawHeader,
  rows,
  boxCenterX,
  estimateTextBoxWidth,
  type Box,
} from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DEFAULT_FONT,
  STUDIO_DIGIT_FONT,
  STUDIO_INK_MUTED,
  STUDIO_SECTION_GAP,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { parsePrintStyle } from '../crossword/config'
import {
  instructionFor,
  parseDifficulty,
  parsePuzzlesPerPage,
  parseSize,
  SUDOKU_CONFIG_SCHEMA,
} from './config'
import { generateRatedPuzzles, type RetirementSudokuPuzzle } from './puzzle'
import { drawSudokuGrid } from './draw'

export {
  BOX_DIMS,
  generateSolvedGrid,
  carvePuzzle,
  countSolutions,
  isFullyValid,
  isValidPlacement,
  givensMatchSolution,
} from './solver'
export type { SudokuSize } from './solver'
export { ratePuzzle, isSolvableWith } from './rate'
export type { SudokuDifficulty } from './rate'
export {
  generateRatedPuzzle,
  generateRatedPuzzles,
  hashSudokuGrid,
  preflightSudoku,
  clueCount,
  matchesRequestedDifficulty,
} from './puzzle'
export type { RetirementSudokuPuzzle } from './puzzle'
export {
  parseSize,
  parseDifficulty,
  parsePuzzlesPerPage,
  instructionFor,
  minDigitPx,
} from './config'

const PUZZLE_INDEX_SIZE = 22
const PUZZLE_INDEX_GAP = 8

function drawIndexedGrid(options: {
  field: Box
  index: number
  count: number
  puzzle: RetirementSudokuPuzzle
  tag: StudioTag
  printStyle: ReturnType<typeof parsePrintStyle>
  pageWidth: number
  font: string
}): StudioFabricObject[] {
  const { field, index, count, puzzle, tag, printStyle, pageWidth, font } = options
  let gridField = field
  const objects: StudioFabricObject[] = []
  if (count > 1) {
    const stripH = PUZZLE_INDEX_SIZE + PUZZLE_INDEX_GAP
    const label = String(index + 1)
    objects.push(
      buildText(
        {
          left: boxCenterX(field),
          top: field.top,
          text: label,
          fontFamily: font,
          fontSize: PUZZLE_INDEX_SIZE,
          fontWeight: 'normal',
          fill: STUDIO_INK_MUTED,
          width: estimateTextBoxWidth(label, PUZZLE_INDEX_SIZE, field.width),
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'decoration',
      ),
    )
    gridField = {
      ...field,
      top: field.top + stripH,
      height: Math.max(1, field.height - stripH),
    }
  }
  objects.push(
    drawSudokuGrid({
      field: gridField,
      puzzle,
      tag,
      printStyle,
      pageWidth,
    }),
  )
  return objects
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const size = parseSize(config.size)
  const difficulty = parseDifficulty(config.difficulty)
  const printStyle = parsePrintStyle(config.printStyle)
  const count = parsePuzzlesPerPage(config.puzzlesPerPage, size, printStyle)
  const rng = createRng(ctx.seed)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const puzzles = generateRatedPuzzles(count, size, difficulty, rng)
  const tag: StudioTag = {
    templateKey: 'sudoku',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instructionFor(size))
  const fields = count === 2 ? rows(header.body, 2, STUDIO_SECTION_GAP) : [header.body]
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)

  const objects: StudioFabricObject[] = [...header.objects]
  puzzles.forEach((puzzle, index) => {
    objects.push(
      ...drawIndexedGrid({
        field: fields[index] ?? header.body,
        index,
        count,
        puzzle,
        tag,
        printStyle,
        pageWidth: ctx.pageWidth,
        font,
      }),
    )
  })

  return [{ pageRole: 'single', objects }]
}

export const sudokuTemplate: StudioTemplateDefinition = {
  key: 'sudoku',
  label: 'Sudoku',
  category: 'logic',
  description:
    'Classic number Sudoku in large print. Fill every row, column and box so each digit appears once. 6×6 or 9×9, Relaxed / Classic / Challenge, each with exactly one solution and an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" transform="translate(17 5)">
      <rect x="0" y="0" width="30" height="30" stroke-width="1.6"/>
      <path d="M10 0v30M20 0v30M0 10h30M0 20h30" stroke-width="1"/>
    </g>
    <g font-size="8" fill="currentColor" font-family="sans-serif" text-anchor="middle" dominant-baseline="central">
      <text x="22" y="10">5</text>
      <text x="32" y="20">7</text>
      <text x="42" y="30">2</text>
    </g>
  </svg>`,
  configSchema: SUDOKU_CONFIG_SCHEMA,
  generate,
}
