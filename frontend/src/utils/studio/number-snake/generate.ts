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
  measureHeaderHeight,
} from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  buildSnakePuzzle,
  type SnakeAdjacency,
  type SnakeDifficulty,
  type SnakePuzzle,
  type SnakeSize,
} from './generator'
import { cellForField, drawSnakePuzzle } from './draw'

export {
  buildSnakePuzzle,
  generateHamiltonianPath,
  carveClues,
  countSnakeSolutions,
  targetClueCount,
  usesEachNumberOnce,
  consecutiveAlwaysAdjacent,
  areAdjacent,
  invertSolution,
} from './generator'
export type {
  SnakeAdjacency,
  SnakeDifficulty,
  SnakeSize,
  SnakePuzzle,
  SnakeCell,
} from './generator'

function parseSize(raw: unknown): SnakeSize {
  const n = Number(raw ?? 7)
  if (n === 5 || n === 6 || n === 7 || n === 8 || n === 9 || n === 10) return n
  return 7
}

function parseVariant(raw: unknown): SnakeAdjacency {
  return String(raw ?? 'diagonal') === 'orthogonal' ? 'orthogonal' : 'diagonal'
}

function parseDifficulty(raw: unknown): SnakeDifficulty {
  const v = String(raw ?? 'medium')
  if (v === 'easy' || v === 'medium' || v === 'hard') return v
  return 'medium'
}

function buildInstruction(n: number, variant: SnakeAdjacency): string {
  const adjText =
    variant === 'orthogonal'
      ? 'up, down, or sideways (not diagonally)'
      : 'up, down, sideways, or diagonally'
  return (
    `Fill in the missing numbers from 1 to ${n} so that each number touches the next one: ` +
    `${adjText}. The numbers form one continuous path. The start (1) and end (${n}) are circled. ` +
    `Tip: find where the next number can only go one place`
  )
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzle: SnakePuzzle
  showPathOnKey: boolean
  instruction: string
  /** Size cells from this body (puzzle page); place/center in `instruction` body. */
  sizeInstruction?: string
}): StudioFabricObject[] {
  const { config, ctx, tag, puzzle, showPathOnKey, instruction, sizeInstruction } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)

  let maxCell: number | undefined
  if (sizeInstruction !== undefined) {
    const sizeHeaderH = measureHeaderHeight(config, sizeInstruction, content.width)
    maxCell = cellForField(
      {
        ...content,
        top: content.top + sizeHeaderH,
        height: Math.max(1, content.height - sizeHeaderH),
      },
      puzzle.cols,
      puzzle.rows,
    )
  }

  return [
    ...header.objects,
    drawSnakePuzzle({
      field: header.body,
      puzzle,
      showPathOnKey,
      tag,
      maxCell,
    }),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const size = parseSize(config.size)
  const variant = parseVariant(config.variant)
  const difficulty = parseDifficulty(config.difficulty)
  const showPathOnKey = config.showPathOnKey !== false
  const rng = createRng(ctx.seed)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  const n = size * size

  const puzzle = buildSnakePuzzle(size, size, variant, difficulty, rng)

  const tag: StudioTag = {
    templateKey: 'number-snake',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const instruction = buildInstruction(n, variant)
  const layout = { config, ctx, tag, puzzle, showPathOnKey }
  const objects = layoutPage({ ...layout, instruction })
  // Same grid size as the puzzle page; only re-center in the taller key body.
  const answerSourceObjects = layoutPage({
    ...layout,
    instruction: '',
    sizeInstruction: instruction,
  })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const numberSnakeTemplate: StudioTemplateDefinition = {
  key: 'number-snake',
  label: 'Number Snake',
  category: 'logic',
  description:
    'Fill the grid from 1 to N so consecutive numbers always touch, tracing one continuous path. Diagonal moves (Hidato) or straight moves only (Numbrix). Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.7">
      <rect x="18" y="4" width="28" height="28"/><path d="M27.3 4v28M36.6 4v28M18 13.3h28M18 22.6h28"/>
    </g>
    <g stroke="currentColor" stroke-width="1.2" fill="none">
      <path d="M22.5 9L32 9L41.5 18L22.5 18L22.5 27L41.5 27"/>
    </g>
    <g font-size="5" fill="currentColor" font-family="sans-serif" text-anchor="middle">
      <text x="22.5" y="11">1</text><text x="41.5" y="29">9</text></g>
  </svg>`,
  configSchema: [
    {
      key: 'size',
      label: 'Grid size',
      type: 'select',
      default: 7,
      options: [
        { label: '5×5 (quick)', value: 5 },
        { label: '6×6', value: 6 },
        { label: '7×7', value: 7 },
        { label: '8×8', value: 8 },
        { label: '9×9', value: 9 },
        { label: '10×10 (large)', value: 10 },
      ],
    },
    {
      key: 'variant',
      label: 'Movement',
      type: 'select',
      default: 'diagonal',
      options: [
        { label: 'Diagonal (Hidato, 8 directions)', value: 'diagonal' },
        { label: 'Orthogonal (Numbrix, 4 directions)', value: 'orthogonal' },
      ],
      help: 'Diagonal allows corner steps; orthogonal is tighter.',
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Easy (more clues)', value: 'easy' },
        { label: 'Medium', value: 'medium' },
        { label: 'Hard (few clues)', value: 'hard' },
      ],
    },
    {
      key: 'showPathOnKey',
      label: 'Draw the path on the answer key',
      type: 'toggle',
      default: true,
      help: 'The answer key also traces the snake line through the numbers.',
    },
  ],
  generate,
}
