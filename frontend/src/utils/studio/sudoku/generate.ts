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
  unionObjectBounds,
  estimateTextBoxWidth,
  type Box,
} from '../studio-layout'
import { buildText, buildGroup, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines, snapGridInField } from '../studio-grid-rules'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  BOX_DIMS,
  type SudokuSize,
  generateSolvedGrid,
  carvePuzzle,
} from './solver'

export {
  BOX_DIMS,
  generateSolvedGrid,
  carvePuzzle,
  countSolutions,
  isFullyValid,
  isValidPlacement,
} from './solver'
export type { SudokuSize } from './solver'

const CLUE_TARGETS: Record<SudokuSize, Record<string, number>> = {
  9: { easy: 42, medium: 34, hard: 28, expert: 24 },
  6: { easy: 20, medium: 16, hard: 13, expert: 11 },
  4: { easy: 10, medium: 8, hard: 7, expert: 6 },
}

function parseSize(raw: unknown): SudokuSize {
  if (raw === 4 || raw === 6 || raw === 9) return raw
  if (raw === '4' || raw === '6' || raw === '9') return Number(raw) as SudokuSize
  return 9
}

function drawSudokuGrid(options: {
  field: Box
  size: number
  boxW: number
  boxH: number
  puzzle: number[][]
  solved: number[][]
  tag: StudioTag
}): StudioFabricObject {
  const { field, size, boxW, boxH, puzzle, solved, tag } = options
  const g = snapGridInField(field, size, size)
  // Same mid-gray hairlines as Grid Copy; bold only on Sudoku box bands.
  const parts: StudioFabricObject[] = [
    ...drawGridLines(g.bounds, g.cell, size, size, tag, {
      boxCols: boxW,
      boxRows: boxH,
    }),
  ]

  const fontSize = Math.round(g.cell * 0.55)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = g.cellBox(r, c)
      const digitOpts = {
        left: Math.round(cell.left + cell.width / 2),
        top: Math.round(cell.top + cell.height / 2),
        fontFamily: STUDIO_DIGIT_FONT,
        fontSize,
        fontWeight: 'normal' as const,
        textAlign: 'center' as const,
        originX: 'center' as const,
        originY: 'center' as const,
      }
      if (puzzle[r][c] !== 0) {
        const text = String(puzzle[r][c])
        parts.push(
          buildText(
            {
              ...digitOpts,
              text,
              width: estimateTextBoxWidth(text, fontSize, cell.width),
            },
            tag,
            'prompt',
          ),
        )
      }
      // Every cell gets a hidden answer so the key is a full solved grid.
      const answer = String(solved[r][c])
      parts.push(
        buildText(
          {
            ...digitOpts,
            text: answer,
            width: estimateTextBoxWidth(answer, fontSize, cell.width),
          },
          tag,
          'answer',
        ),
      )
    }
  }

  const groupBounds = unionObjectBounds(parts) ?? g.bounds
  return buildGroup(parts, groupBounds, tag)
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const size = parseSize(config.size)
  const difficulty = String(config.difficulty ?? 'medium')
  const rng = createRng(ctx.seed)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const [boxW, boxH] = BOX_DIMS[size]
  const solved = generateSolvedGrid(size, rng)
  const targetClues = CLUE_TARGETS[size][difficulty] ?? CLUE_TARGETS[size].medium
  const puzzle = carvePuzzle(solved, targetClues, size, rng)

  const tag: StudioTag = {
    templateKey: 'sudoku',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(
    content,
    config,
    tag,
    `Fill this ${size}×${size} grid so every row, column, and ${boxW}×${boxH} box contains the numbers 1–${size} exactly once`,
  )
  objects.push(...header.objects)

  // Center the square grid in the full remaining body below the header.
  objects.push(
    drawSudokuGrid({
      field: header.body,
      size,
      boxW,
      boxH,
      puzzle,
      solved,
      tag,
    }),
  )

  return [{ pageRole: 'single', objects }]
}

export const sudokuTemplate: StudioTemplateDefinition = {
  key: 'sudoku',
  label: 'Sudoku',
  category: 'logic',
  description:
    'The classic number placement puzzle. Fill every row, column and box so each digit appears once. Sizes 9×9, 6×6 and 4×4, each verified to have exactly one solution. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  // 3×3 only — readable at card size; digits centered in cells.
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
  configSchema: [
    {
      key: 'size',
      label: 'Grid size',
      type: 'select',
      default: 9,
      options: [
        { label: '9×9 (classic)', value: 9 },
        { label: '6×6 (easier, 2×3 boxes)', value: 6 },
        { label: '4×4 (beginner, 2×2 boxes)', value: 4 },
      ],
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Easy', value: 'easy' },
        { label: 'Medium', value: 'medium' },
        { label: 'Hard', value: 'hard' },
        { label: 'Expert', value: 'expert' },
      ],
    },
  ],
  generate,
}
