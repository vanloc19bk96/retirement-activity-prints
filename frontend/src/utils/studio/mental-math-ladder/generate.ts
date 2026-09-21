import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, deriveSeed } from '../studio-rng'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  buildChain,
  parseDifficulty,
  parseOperationSet,
  type MathChain,
} from './chain'
import { drawLadderGrid } from './draw'

/** Visible ladder lines including the starting number (start + operations). */
const MIN_STEPS = 2
/** Start + 6 operations — keeps the previous max mental load. */
const MAX_STEPS = 7
const MIN_ITEMS = 3
const MAX_ITEMS = 12
/** Start + 4 operations — same difficulty as the old default of 4 ops. */
const DEFAULT_STEPS = 5

function clampSteps(raw: unknown): number {
  const n = Math.round(Number(raw ?? DEFAULT_STEPS))
  if (!Number.isFinite(n)) return DEFAULT_STEPS
  return Math.min(MAX_STEPS, Math.max(MIN_STEPS, n))
}

function clampItemCount(raw: unknown): number {
  const n = Math.round(Number(raw ?? 6))
  if (!Number.isFinite(n)) return 6
  return Math.min(MAX_ITEMS, Math.max(MIN_ITEMS, n))
}

/** Config steps count the start line; chain builders want operation rungs only. */
function operationCount(ladderLines: number): number {
  return Math.max(1, ladderLines - 1)
}

function instructionFor(operations: number, showRunningBoxes: boolean): string {
  const head =
    `Start at the top number of each ladder and work down, doing all ${operations} ` +
    'steps in your head.'
  return showRunningBoxes
    ? `${head} Write the running total on the line beside every step`
    : `${head} Write only the final answer on the line at the bottom. No rough work`
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  chains: MathChain[]
  showRunningBoxes: boolean
  font: string
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, chains, showRunningBoxes, font, instruction } = options
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  objects.push(...header.objects)
  drawLadderGrid(objects, {
    field: header.body,
    chains,
    showRunningBoxes,
    font,
    digitFont: STUDIO_DIGIT_FONT,
    tag,
  })
  return objects
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const ladderLines = clampSteps(config.steps)
  const steps = operationCount(ladderLines)
  const itemCount = clampItemCount(config.itemCount)
  const difficulty = parseDifficulty(config.difficulty)
  const operationSet = parseOperationSet(config.operations)
  const showRunningBoxes = config.showRunningBoxes === true
  const font = String(config.fontFamily)
  // Totals are read as digit runs — PT Serif oldstyle figures sit unevenly.
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  // One page RNG, not a sub-seed per ladder, so each ladder can see the answers
  // already taken and steer clear of them.
  const rng = createRng(deriveSeed(ctx.seed, 'ladders'))
  const usedAnswers = new Set<number>()
  const usedStarts = new Set<number>()
  const chains: MathChain[] = []
  for (let i = 0; i < itemCount; i++) {
    const chain = buildChain({
      steps,
      difficulty,
      operationSet,
      rng,
      usedAnswers,
      usedStarts,
    })
    usedAnswers.add(chain.answer)
    usedStarts.add(chain.start)
    chains.push(chain)
  }

  const tag: StudioTag = {
    templateKey: 'mental-math-ladder',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const layout = { config, ctx, tag, chains, showRunningBoxes, font }
  const objects = layoutPage({
    ...layout,
    instruction: instructionFor(steps, showRunningBoxes),
  })
  // No how-to on the key — taller body so the grouped ladders center optically.
  const answerSourceObjects = layoutPage({ ...layout, instruction: '' })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const mentalMathLadderTemplate: StudioTemplateDefinition = {
  key: 'mental-math-ladder',
  label: 'Mental Math Ladder',
  category: 'logic',
  description:
    'Hold a running total in your head down a ladder of steps, then write only the final answer. Whole numbers throughout, never negative. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="monospace" font-size="7" fill="currentColor" text-anchor="middle">
      <text x="32" y="9">7</text><text x="32" y="18">+ 9</text><text x="32" y="27">&#215; 2</text>
    </g>
    <path d="M22 34h20" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </svg>`,
  configSchema: [
    {
      key: 'steps',
      label: 'Steps per ladder',
      type: 'number',
      default: DEFAULT_STEPS,
      min: MIN_STEPS,
      max: MAX_STEPS,
      step: 1,
      help:
        'Lines in each ladder, including the starting number. ' +
        '6 → start plus 5 operations. More lines = hold the total longer.',
    },
    {
      key: 'difficulty',
      label: 'Number size',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Easy (answer under 60)', value: 'easy' },
        { label: 'Medium (answer 61–250)', value: 'medium' },
        { label: 'Hard (answer 251–999)', value: 'hard' },
      ],
    },
    {
      key: 'operations',
      label: 'Operations',
      type: 'select',
      default: 'add-sub-mul',
      options: [
        { label: 'Add and subtract only', value: 'add-sub' },
        { label: 'Add, subtract, multiply', value: 'add-sub-mul' },
        { label: 'All (also divide, halves, percentages)', value: 'all' },
      ],
    },
    {
      key: 'itemCount',
      label: 'Ladders per page',
      type: 'number',
      default: 6,
      min: MIN_ITEMS,
      max: MAX_ITEMS,
      step: 1,
    },
    {
      key: 'showRunningBoxes',
      label: 'Line for each step',
      type: 'toggle',
      default: false,
      help: 'On: write the total after every step. Easier, but less working-memory work.',
    },
  ],
  generate,
}
