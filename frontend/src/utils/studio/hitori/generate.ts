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
import { cellForField, drawHitoriGrid } from './draw-grid'
import {
  buildHitoriPuzzle,
  type HitoriDifficulty,
  type HitoriPuzzle,
  type HitoriSize,
} from './generator'

export {
  buildHitoriPuzzle,
  countHitoriSolutions,
  isForcedOnlySolvable,
  noWhiteDuplicates,
  noAdjacentShaded,
  whiteCellsConnected,
  isValidHitoriSolution,
} from './generator'
export type { HitoriDifficulty, HitoriPuzzle, HitoriSize, Shading } from './generator'

const INSTRUCTION =
  'Shade cells so that no number repeats in any row or column among the unshaded cells. ' +
  'Shaded cells may not touch each other left-right or up-down (diagonal is fine), and all ' +
  'unshaded cells must stay connected in one group. Tip: a number between two equal numbers ' +
  'is always safe to keep'

function parseSize(raw: unknown): HitoriSize {
  if (raw === 5 || raw === 6 || raw === 8 || raw === 10 || raw === 12) return raw
  if (
    raw === '5' ||
    raw === '6' ||
    raw === '8' ||
    raw === '10' ||
    raw === '12'
  ) {
    return Number(raw) as HitoriSize
  }
  return 8
}

function parseDifficulty(raw: unknown): HitoriDifficulty {
  const v = String(raw ?? 'medium')
  if (v === 'easy' || v === 'medium' || v === 'hard') return v
  return 'medium'
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzle: HitoriPuzzle
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
      puzzle.size,
    )
  }

  return [
    ...header.objects,
    drawHitoriGrid({
      field: header.body,
      puzzle,
      tag,
      maxCell,
    }),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const size = parseSize(config.size)
  const difficulty = parseDifficulty(config.difficulty)
  const rng = createRng(ctx.seed)
  // Grid digits use lining figures; prime so canvas remasure picks it up.
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const puzzle = buildHitoriPuzzle(size, difficulty, rng)

  const tag: StudioTag = {
    templateKey: 'hitori',
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

export const hitoriTemplate: StudioTemplateDefinition = {
  key: 'hitori',
  label: 'Hitori',
  category: 'logic',
  description:
    'A Japanese elimination puzzle. Shade cells until no number repeats in any row or column, keeping shaded cells apart and unshaded cells connected. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.7">
      <rect x="18" y="4" width="28" height="28"/>
      <path d="M25 4v28M32 4v28M39 4v28M18 11h28M18 18h28M18 25h28"/>
    </g>
    <g fill="currentColor"><rect x="25" y="4" width="7" height="7"/><rect x="39" y="18" width="7" height="7"/>
      <rect x="18" y="25" width="7" height="7"/></g>
    <g font-size="4" fill="currentColor" font-family="sans-serif" text-anchor="middle">
      <text x="21.5" y="9">2</text><text x="35.5" y="16">3</text><text x="42.5" y="9">1</text>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'size',
      label: 'Grid size',
      type: 'select',
      default: 8,
      options: [
        { label: '5×5 (quick)', value: 5 },
        { label: '6×6', value: 6 },
        { label: '8×8', value: 8 },
        { label: '10×10', value: 10 },
        { label: '12×12 (large)', value: 12 },
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
  ],
  generate,
}
