import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import { createRng } from '../studio-rng'
import { drawHeader } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { SUDOKU_CONFIG_SCHEMA, instructionFor } from './config'
import { parseSudokuLevel } from './levels'
import { sudokuContentBox } from './layout'
import { generateLevelPuzzle } from './puzzle'
import { drawSudokuGrid } from './draw'

/**
 * One puzzle per page, always.
 *
 * Two grids on a sheet halves the cell size, and a Sudoku whose digits an
 * older reader has to squint at is a Sudoku they put down. The page budget
 * that buys is the right trade for the audience this book is sold to.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parseSudokuLevel(config)
  const rng = createRng(ctx.seed)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const puzzle = generateLevelPuzzle(level, rng)
  const tag: StudioTag = {
    templateKey: 'sudoku',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const header = drawHeader(sudokuContentBox(ctx), config, tag, instructionFor(level.size))
  return [
    {
      pageRole: 'single',
      objects: [
        ...header.objects,
        drawSudokuGrid({ field: header.body, puzzle, tag, pageWidth: ctx.pageWidth }),
      ],
    },
  ]
}

export const sudokuTemplate: StudioTemplateDefinition = {
  key: 'sudoku',
  label: 'Sudoku',
  category: 'logic',
  description:
    'Large-print number Sudoku, one puzzle to a page. Pick a level and every page prints a grid with exactly one solution, plus its own answer page.',
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
