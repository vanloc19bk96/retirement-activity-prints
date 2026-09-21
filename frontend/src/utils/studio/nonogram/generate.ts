import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, deriveSeed } from '../studio-rng'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import { type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { drawNonogramGrid } from './draw-grid'
import { buildNonogram } from './generator'
import type {
  NonogramDifficulty,
  NonogramPuzzle,
  NonogramSize,
  NonogramStyle,
} from './types'

export { buildNonogram } from './generator'
export {
  solveAndCount,
  solveForcedOnly,
  traceLineSolve,
  lineClue,
  columnOf,
  cluesFromBitmap,
  canonicalBitmapKey,
  NONOGRAM_FAMILIES,
  familiesForStyle,
  classifyDifficulty,
  difficultyScore,
  maxClueEntries,
  passesPrintQuality,
} from './generator'
export type {
  Bitmap,
  LineSolveTrace,
  NonogramDifficulty,
  NonogramMetrics,
  NonogramPuzzle,
  NonogramSize,
  NonogramStyle,
  SolveResult,
} from './generator'

function parseSize(raw: unknown): NonogramSize {
  const n = Number(raw)
  if (n === 5 || n === 10 || n === 15 || n === 20) return n
  return 10
}

function parseDifficulty(raw: unknown): NonogramDifficulty {
  const v = String(raw ?? 'medium')
  if (v === 'easy' || v === 'medium' || v === 'hard') return v
  return 'medium'
}

function parseStyle(raw: unknown): NonogramStyle {
  const v = String(raw ?? 'mixed')
  if (v === 'symmetric' || v === 'geometric' || v === 'organic') return v
  return 'mixed'
}

function instructionForSize(size: NonogramSize): string {
  return (
    `Shade cells on this ${size}×${size} grid to match the row and column clues. ` +
    'Each number is a block length in order, with gaps between blocks. Use logic only; mark empties with X'
  )
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzle: NonogramPuzzle
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, puzzle, instruction } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  return [
    ...header.objects,
    drawNonogramGrid({
      field: header.body,
      puzzle,
      tag,
    }),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const size = parseSize(config.size)
  const difficulty = parseDifficulty(config.difficulty)
  const style = parseStyle(config.style)
  // Salting the seed with the seller identity means two accounts that happen to
  // run the same settings never land on the same grids — the cross-account
  // duplicate risk that gets KDP listings flagged.
  const rng = createRng(deriveSeed(ctx.seed, `nonogram:${ctx.ownerKey ?? 'anonymous'}`))
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const puzzle = buildNonogram({ size, difficulty, style, rng })

  const tag: StudioTag = {
    templateKey: 'nonogram',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const layout = { config, ctx, tag, puzzle }
  const objects = layoutPage({ ...layout, instruction: instructionForSize(size) })
  // No how-to on the key — taller body so the grid centers optically.
  const answerSourceObjects = layoutPage({ ...layout, instruction: '' })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const nonogramTemplate: StudioTemplateDefinition = {
  key: 'nonogram',
  label: 'Nonogram',
  category: 'logic',
  description:
    'A grid logic puzzle, also called Picross. Use the number clues beside each row and column to work out which squares are filled. Solvable by logic alone, with no guessing. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.6">
      <rect x="20" y="5" width="30" height="30"/>
      <path d="M26 5v30M32 5v30M38 5v30M44 5v30M20 11h30M20 17h30M20 23h30M20 29h30"/>
    </g>
    <g fill="currentColor">
      <rect x="26" y="11" width="6" height="6"/><rect x="32" y="11" width="6" height="6"/>
      <rect x="32" y="17" width="6" height="6"/><rect x="38" y="17" width="6" height="6"/>
    </g>
    <g font-size="4" fill="currentColor" font-family="sans-serif" text-anchor="end">
      <text x="18" y="15">2</text><text x="18" y="21">2</text>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'size',
      label: 'Grid size',
      type: 'select',
      default: 10,
      options: [
        { label: '5×5 (quick)', value: 5 },
        { label: '10×10', value: 10 },
        { label: '15×15', value: 15 },
        { label: '20×20 (large)', value: 20 },
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
      help: 'Every puzzle can be solved by logic alone — no guessing needed at any level.',
    },
    {
      key: 'style',
      label: 'Pattern style',
      type: 'select',
      default: 'mixed',
      options: [
        { label: 'Mixed (widest variety)', value: 'mixed' },
        { label: 'Symmetric', value: 'symmetric' },
        { label: 'Geometric', value: 'geometric' },
        { label: 'Organic', value: 'organic' },
      ],
      help: 'Mixed keeps the pictures varied through a long book. Pick one style to give a chapter its own look.',
    },
  ],
  generate,
}
