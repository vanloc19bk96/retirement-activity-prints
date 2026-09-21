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
  splitTop,
  insetHorizontal,
  drawHeader,
} from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  parseStreamType,
  parseDifficulty,
  itemCountForDifficulty,
  buildSheet,
  validateDualTaskConfig,
  type Difficulty,
  type DualTaskSheet,
} from './streams'
import { drawMutedLine, drawItemGrid, drawAnswerStrip } from './draw'

export {
  buildSheet,
  makeStream,
  recomputeAnswer,
  itemCountForDifficulty,
  fallbackDifferent,
  itemsPerRowFor,
  validateDualTaskConfig,
  SAME_TASK_ERROR,
} from './streams'
export type { DualTaskSheet, DualItem, StreamType, Difficulty } from './streams'

const LEGEND_H = 36
const ANSWER_STRIP_H = 56

const INSTRUCTION =
  'Work along each row. Squares are Task A and circles are Task B, appearing in mixed order. ' +
  'Keep BOTH running totals in your head. Write each final answer at the bottom'

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  sheet: DualTaskSheet
  difficulty: Difficulty
  font: string
  instruction: string
  includeLegend: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, sheet, difficulty, font, instruction, includeLegend } = options
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  objects.push(...header.objects)

  let rest = header.body
  if (includeLegend) {
    const [legend, remaining] = splitTop(header.body, LEGEND_H)
    drawMutedLine(
      objects,
      legend,
      `Task A: ${sheet.taskALabel}     Task B: ${sheet.taskBLabel}`,
      font,
      tag,
    )
    rest = remaining
  }

  const [fieldArea, answerArea] = splitTop(
    rest,
    Math.max(80, rest.height - ANSWER_STRIP_H),
  )

  drawItemGrid(objects, fieldArea, sheet, difficulty, font, tag)
  drawAnswerStrip(objects, answerArea, sheet, font, tag)

  return objects
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const configError = validateDualTaskConfig(config)
  if (configError) throw new Error(configError.message)

  const taskA = parseStreamType(config.taskA, 'running-sum')
  const taskB = parseStreamType(config.taskB, 'running-count')

  const difficulty = parseDifficulty(config.streamDifficulty)
  const itemCount = itemCountForDifficulty(difficulty)
  const font = String(config.fontFamily)
  const rng = createRng(ctx.seed)
  // Numeric tokens / answers use Inter lining figures.
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const tag: StudioTag = {
    templateKey: 'dual-task-grid',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const sheet = buildSheet(taskA, taskB, itemCount, difficulty, rng)
  const layout = { config, ctx, tag, sheet, difficulty, font }
  const objects = layoutPage({ ...layout, instruction: INSTRUCTION, includeLegend: true })
  // No how-to / legend on the key — taller body so the grid centers optically.
  const answerSourceObjects = layoutPage({ ...layout, instruction: '', includeLegend: false })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const dualTaskGridTemplate: StudioTemplateDefinition = {
  key: 'dual-task-grid',
  label: 'Dual Task Grid',
  category: 'focus',
  description:
    'Work down a grid that mixes two jobs, squares for Task A and circles for Task B, holding both running totals in mind. Trains divided attention. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  validateConfig: validateDualTaskConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="4" y="8" width="12" height="12"/><circle cx="26" cy="14" r="6"/>
      <rect x="36" y="8" width="12" height="12"/><circle cx="56" cy="14" r="6"/>
      <rect x="4" y="26" width="12" height="12"/><circle cx="26" cy="32" r="6"/>
    </g>
    <g font-size="7" fill="currentColor" text-anchor="middle" font-family="sans-serif">
      <text x="10" y="17">4</text><text x="26" y="17">▲</text><text x="42" y="17">7</text>
      <text x="10" y="35">3</text><text x="26" y="35">●</text>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'taskA',
      label: 'Task A',
      type: 'select',
      default: 'running-sum',
      options: [
        { label: 'Add the numbers', value: 'running-sum' },
        { label: 'Count a symbol', value: 'running-count' },
        { label: 'Track up/down total', value: 'updown-track' },
        { label: 'Track odd/even', value: 'parity-track' },
        { label: 'Alternate add/subtract', value: 'alt-sign-sum' },
        { label: 'Count numbers over a cutoff', value: 'threshold-count' },
        { label: 'Count the vowels', value: 'vowel-count' },
      ],
    },
    {
      key: 'taskB',
      label: 'Task B',
      type: 'select',
      default: 'running-count',
      options: [
        { label: 'Count a symbol', value: 'running-count' },
        { label: 'Add the numbers', value: 'running-sum' },
        { label: 'Track up/down total', value: 'updown-track' },
        { label: 'Track odd/even', value: 'parity-track' },
        { label: 'Alternate add/subtract', value: 'alt-sign-sum' },
        { label: 'Count numbers over a cutoff', value: 'threshold-count' },
        { label: 'Count the vowels', value: 'vowel-count' },
      ],
      help: 'Pick a task different from Task A, because tracking two unlike tasks at once is the exercise.',
    },
    {
      key: 'streamDifficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'standard',
      options: [
        { label: 'Easy', value: 'easy' },
        { label: 'Standard', value: 'standard' },
        { label: 'Hard', value: 'hard' },
      ],
      help: 'Sets how alike the symbols look and how many are on the page (24, 40, or 60).',
    },
  ],
  generate,
}
