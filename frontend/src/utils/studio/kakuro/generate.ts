import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, type StudioRng } from '../studio-rng'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import { type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { drawKakuroGrid } from './draw-grid'
import {
  loadTopologies,
  type KakuroSizeBucket,
  type KakuroTopology,
} from './topologies'
import { generatePuzzle, type KakuroPuzzle } from './solver'

export {
  extractRuns,
  fillGrid,
  countSolutions,
  generatePuzzle,
  indexClueSumsByCell,
} from './solver'
export type { KakuroRun, KakuroPuzzle, ClueSums } from './solver'
export { loadTopologies } from './topologies'
export type { KakuroTopology, KakuroSizeBucket } from './topologies'

const DIFFICULTY_TO_BUCKET: Record<string, KakuroSizeBucket> = {
  easy: 'small',
  medium: 'medium',
  hard: 'large',
}

const INSTRUCTION =
  'Fill the white cells with digits 1–9 so each run adds up to its clue. ' +
  'The number in the top-right of a clue cell is the sum going across; ' +
  'the number in the bottom-left is the sum going down. No digit repeats within a run. ' +
  'Some puzzles include a few starter digits'

/** Slight pull toward the instruction — still mostly centered in the body. */
export const KAKURO_INSTRUCTION_GRID_LIFT = 40

function parseDifficulty(raw: unknown): KakuroSizeBucket {
  return DIFFICULTY_TO_BUCKET[String(raw ?? 'easy')] ?? 'small'
}

function generateUniquePuzzle(
  candidates: KakuroTopology[],
  rng: StudioRng,
): { topology: KakuroTopology; puzzle: KakuroPuzzle } {
  const order = rng.shuffle(candidates)
  const errors: string[] = []
  for (const topology of order) {
    try {
      return { topology, puzzle: generatePuzzle(topology, rng, 24) }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  throw new Error(
    `Could not generate a uniquely-solvable Kakuro from ${candidates.length} topologies. ` +
      errors.slice(0, 3).join('; '),
  )
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  topology: KakuroTopology
  puzzle: KakuroPuzzle
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, topology, puzzle, instruction } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  // Trim bottom of the field so centering sits a touch closer to the how-to.
  const field = instruction
    ? {
        ...header.body,
        height: Math.max(0, header.body.height - KAKURO_INSTRUCTION_GRID_LIFT),
      }
    : header.body
  return [
    ...header.objects,
    drawKakuroGrid({
      field,
      topology,
      puzzle,
      tag,
    }),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const bucket = parseDifficulty(config.difficulty)
  const rng = createRng(ctx.seed)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const { topology, puzzle } = generateUniquePuzzle(loadTopologies(bucket), rng)

  const tag: StudioTag = {
    templateKey: 'kakuro',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const layout = { config, ctx, tag, topology, puzzle }
  const objects = layoutPage({ ...layout, instruction: INSTRUCTION })
  // No how-to on the key — taller body so the grid centers optically.
  const answerSourceObjects = layoutPage({ ...layout, instruction: '' })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const kakuroTemplate: StudioTemplateDefinition = {
  key: 'kakuro',
  label: 'Cross Sums',
  category: 'logic',
  description:
    'A number crossword puzzle. Fill each run with digits that add up to its clue, never repeating a digit inside a run. One solution, reachable by logic. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="0.8">
      <rect x="12" y="10" width="10" height="10" fill="currentColor"/>
      <rect x="22" y="10" width="10" height="10" fill="currentColor"/>
      <path d="M22 10l10 10" stroke="white"/>
      <rect x="32" y="10" width="10" height="10" fill="none"/>
      <rect x="42" y="10" width="10" height="10" fill="none"/>
      <rect x="22" y="20" width="10" height="10" fill="none"/>
      <rect x="32" y="20" width="10" height="10" fill="none"/>
    </g>
    <g font-size="4" fill="white" font-family="sans-serif"><text x="27" y="14">16</text><text x="24" y="18">4</text></g>
  </svg>`,
  configSchema: [
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'easy',
      options: [
        { label: 'Easy (smaller grid)', value: 'easy' },
        { label: 'Medium', value: 'medium' },
        { label: 'Hard (larger grid)', value: 'hard' },
      ],
      help: 'Larger grids with longer runs are harder.',
    },
  ],
  generate,
}
