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
import { type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { cellForField, drawShikakuGrid } from './draw-grid'
import { buildShikakuPuzzle } from './generator'
import type { ShikakuDifficulty, ShikakuPuzzle } from './types'

export {
  buildShikakuPuzzle,
  countShikakuSolutions,
  isShikakuForcedSolvable,
  clueCandidates,
  randomPartition,
} from './generator'
export type {
  ShikakuClue,
  ShikakuDifficulty,
  ShikakuPuzzle,
  ShikakuRect,
} from './types'

const INSTRUCTION =
  'Divide the whole grid into rectangles by drawing along the grid lines. Every rectangle must ' +
  'contain exactly one number, and that number is how many squares the rectangle covers. Every ' +
  'square ends up inside exactly one rectangle. Tip: start with the numbers that can only be ' +
  'boxed in one way'

interface GridSize {
  rows: number
  cols: number
}

const SIZES: Record<string, GridSize> = {
  '6x6': { rows: 6, cols: 6 },
  '8x8': { rows: 8, cols: 8 },
  '10x10': { rows: 10, cols: 10 },
  '12x12': { rows: 12, cols: 12 },
  '10x14': { rows: 14, cols: 10 },
}

const DEFAULT_SIZE = '8x8'

function parseSize(raw: unknown): GridSize {
  return SIZES[String(raw ?? DEFAULT_SIZE)] ?? SIZES[DEFAULT_SIZE]!
}

function parseDifficulty(raw: unknown): ShikakuDifficulty {
  const v = String(raw ?? 'medium')
  if (v === 'easy' || v === 'medium' || v === 'hard') return v
  return 'medium'
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzle: ShikakuPuzzle
  instruction: string
  /** Size cells from this body (puzzle page); place/center in `instruction` body. */
  sizeInstruction?: string
}): StudioFabricObject[] {
  const { config, ctx, tag, puzzle, instruction, sizeInstruction } = options
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
      puzzle.rows,
      puzzle.cols,
    )
  }

  return [
    ...header.objects,
    drawShikakuGrid({ field: header.body, puzzle, tag, maxCell }),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const { rows, cols } = parseSize(config.size)
  const difficulty = parseDifficulty(config.difficulty)
  const rng = createRng(ctx.seed)
  // Clue numbers use lining figures; prime so canvas remeasure picks it up.
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const puzzle = buildShikakuPuzzle(rows, cols, difficulty, rng)

  const tag: StudioTag = {
    templateKey: 'shikaku',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const layout = { config, ctx, tag, puzzle }
  const objects = layoutPage({ ...layout, instruction: INSTRUCTION })
  // Same grid size as the puzzle page; only re-center in the taller key body.
  const answerSourceObjects = layoutPage({
    ...layout,
    instruction: '',
    sizeInstruction: INSTRUCTION,
  })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const shikakuTemplate: StudioTemplateDefinition = {
  key: 'shikaku',
  label: 'Shikaku',
  category: 'logic',
  description:
    'A Japanese dividing puzzle, also sold as Rectangles. Cut the grid into rectangles so each one holds a single number equal to its area. Every board has exactly one solution. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.55">
      <path d="M24 6v28M32 6v28M40 6v28M16 13h32M16 20h32M16 27h32"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.6">
      <rect x="16" y="6" width="32" height="28"/>
      <path d="M32 6v14M16 20h32M40 20v14"/>
    </g>
    <g font-size="5" fill="currentColor" font-family="sans-serif" text-anchor="middle">
      <text x="24" y="15">4</text><text x="40" y="15">4</text>
      <text x="28" y="29">6</text><text x="44" y="29">2</text>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'size',
      label: 'Grid size',
      type: 'select',
      default: DEFAULT_SIZE,
      options: [
        { label: '6×6 (quick)', value: '6x6' },
        { label: '8×8', value: '8x8' },
        { label: '10×10', value: '10x10' },
        { label: '12×12 (large)', value: '12x12' },
        { label: '10×14 (tall page)', value: '10x14' },
      ],
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Easy (small blocks, no guessing)', value: 'easy' },
        { label: 'Medium', value: 'medium' },
        { label: 'Hard (large blocks, deeper chains)', value: 'hard' },
      ],
    },
  ],
  generate,
}
