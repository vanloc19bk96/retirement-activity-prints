import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng } from '../studio-rng'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import { type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { drawKenkenGrid } from './draw-grid'
import {
  buildCalcudokuPuzzle,
  type CalcudokuPuzzle,
  type KenkenDifficulty,
  type KenkenOperations,
  type KenkenSize,
} from './generator'

export {
  buildCalcudokuPuzzle,
  countSolutions,
  applyOp,
  generateLatinSquare,
  isLatinSquare,
  cageMatchesSolution,
} from './generator'
export type {
  CalcudokuPuzzle,
  Cage,
  KenkenDifficulty,
  KenkenOperations,
  KenkenSize,
  Op,
} from './generator'

function parseSize(raw: unknown): KenkenSize {
  if (raw === 4 || raw === 5 || raw === 6 || raw === 7 || raw === 9) return raw
  if (raw === '4' || raw === '5' || raw === '6' || raw === '7' || raw === '9') {
    return Number(raw) as KenkenSize
  }
  return 6
}

function parseDifficulty(raw: unknown): KenkenDifficulty {
  const v = String(raw ?? 'medium')
  if (v === 'easy' || v === 'medium' || v === 'hard') return v
  return 'medium'
}

function parseOperations(raw: unknown): KenkenOperations {
  return String(raw ?? 'all') === 'addmul' ? 'addmul' : 'all'
}

function instructionForSize(size: KenkenSize): string {
  return (
    `Fill each row and column with 1–${size} (no repeats). ` +
    'Numbers in each bold cage must make the target using the shown +, −, × or ÷'
  )
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzle: CalcudokuPuzzle
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, puzzle, instruction } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  return [
    ...header.objects,
    drawKenkenGrid({
      field: header.body,
      puzzle,
      tag,
    }),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const size = parseSize(config.size)
  const difficulty = parseDifficulty(config.difficulty)
  const operations = parseOperations(config.operations)
  const rng = createRng(ctx.seed)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const puzzle = buildCalcudokuPuzzle(size, difficulty, operations, rng)

  const tag: StudioTag = {
    templateKey: 'kenken',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const layout = { config, ctx, tag, puzzle }
  const objects = layoutPage({ ...layout, instruction: instructionForSize(size) })
  // No how-to on the key — taller body so the grid centers optically.
  const answerSourceObjects = layoutPage({ ...layout, instruction: '' })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const kenkenTemplate: StudioTemplateDefinition = {
  key: 'kenken',
  label: 'Math Cage',
  category: 'logic',
  description:
    'A math grid puzzle, also called Calcudoku. Fill rows and columns 1 to N with no repeats, so each bold cage hits its target using +, −, × or ÷. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor">
      <rect x="14" y="6" width="36" height="28" stroke-width="1.8"/>
      <path d="M32 6v28M14 20h36" stroke-width="1.8"/>
      <path d="M23 6v14M14 13h18M41 20v14M32 27h18" stroke-width="0.6"/>
    </g>
    <g font-size="5" fill="currentColor" font-family="sans-serif">
      <text x="16" y="12">6×</text><text x="34" y="12">2÷</text><text x="16" y="26">3+</text>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'size',
      label: 'Grid size',
      type: 'select',
      default: 6,
      options: [
        { label: '4×4 (easy)', value: 4 },
        { label: '5×5', value: 5 },
        { label: '6×6', value: 6 },
        { label: '7×7', value: 7 },
        { label: '9×9 (hard)', value: 9 },
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
      ],
    },
    {
      key: 'operations',
      label: 'Operations',
      type: 'select',
      default: 'all',
      options: [
        { label: 'Add & multiply only (gentler)', value: 'addmul' },
        { label: 'All four (+ − × ÷)', value: 'all' },
      ],
      help: 'Limit to addition and multiplication for younger or new solvers.',
    },
  ],
  generate,
}
