import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioConfigLayoutContext,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import {
  contentBox,
  insetHorizontal,
  drawHeader,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import { type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  drawItemStack,
  estimateCell,
  fitItemCount,
  MARK_CELL_FLOOR,
  TRIPLE_CELL_FLOOR,
} from './draw'
import { buildMatrixItems } from './variety'
import type { Difficulty, MatrixItem } from './types'

export {
  assembleCells,
  boardId,
  boardSignature,
  buildBoard,
  limitsFor,
  partitionSignature,
  planId,
  randomLatinSquare,
  valueIndexAt,
  vetBoard,
} from './board'
export { solveBoard, solveChannel, solveChannels } from './solver'
export { buildOptions, isDistinguishable } from './distractors'
export { shapeOutline, fitUnit, sizeContrast, PITCH_LIMIT, SIZE_FACTOR } from './shapes'
export { buildMatrixItems } from './variety'
export * from './types'

const MIN_ITEM = 1
const MAX_ITEM = 2
const DEFAULT_ITEM = 2

const INSTRUCTION =
  'Every row and every column of the grid follows a rule. Work out what belongs in the empty ' +
  'square, then circle the piece underneath that completes the pattern'

function parseDifficulty(raw: unknown): Difficulty {
  if (raw === 'easy' || raw === 'hard') return raw
  return 'medium'
}

function parseOptionCount(raw: unknown): number {
  return Number(raw) === 4 ? 4 : 6
}

function clampItemCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_ITEM
  return Math.min(MAX_ITEM, Math.max(MIN_ITEM, Math.round(n)))
}

/** Body the item stack is drawn into — the header is off the top. */
function metricsFieldFor(config: StudioConfig, ctx: StudioGenerateContext): Box {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const headerH = measureHeaderHeight(config, INSTRUCTION, content.width)
  return {
    ...content,
    top: content.top + headerH,
    height: Math.max(1, content.height - headerH),
  }
}

/**
 * Puzzles this page can hold at a legible grid size. The page title and
 * instruction strip shorten the body, so the schema max is resolved the same
 * way `generate` packs — the form never offers a count the sheet then drops.
 */
export function resolveItemCountMax(
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): number {
  if (!layout) return MAX_ITEM
  const field = metricsFieldFor(config, {
    pageWidth: layout.pageWidth,
    pageHeight: layout.pageHeight,
    margin: layout.margin,
    seed: 0,
    instanceId: 'item-count-max',
  })
  return fitItemCount({
    bodyHeight: field.height,
    requested: MAX_ITEM,
    floor: MIN_ITEM,
  })
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  items: MatrixItem[]
  font: string
  instruction: string
  revealBlank: boolean
  metricsField: Box
}): StudioFabricObject[] {
  const { config, ctx, tag, items, font, instruction, revealBlank, metricsField } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  const objects: StudioFabricObject[] = [...header.objects]
  drawItemStack(objects, header.body, items, font, revealBlank, tag, metricsField)
  return objects
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const difficulty = parseDifficulty(config.difficulty)
  const optionCount = parseOptionCount(config.optionCount)
  const font = String(config.fontFamily)

  const tag: StudioTag = {
    templateKey: 'matrix-reasoning',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  // Sized from the puzzle page so the solution keeps identical artwork even
  // though its body is taller without the how-to.
  const metricsField = metricsFieldFor(config, ctx)

  const itemCount = fitItemCount({
    bodyHeight: metricsField.height,
    requested: clampItemCount(Number(config.itemCount ?? DEFAULT_ITEM)),
    floor: MIN_ITEM,
  })

  /**
   * The page tells the puzzle what it can afford, not the other way round.
   *
   * Three shapes in one cell, or a mark struck inside one, is a legible rule on
   * a letter-size sheet and a smudge on a 5×8 one — so the trim decides which
   * channels the board may use at all, rather than the artwork shrinking to fit
   * them in.
   */
  const cell = estimateCell({
    bodyWidth: metricsField.width,
    bodyHeight: metricsField.height,
    itemCount,
    optionCount,
  })

  const items = buildMatrixItems({
    itemCount,
    optionCount,
    difficulty,
    seed: ctx.seed,
    ownerKey: ctx.ownerKey,
    allowTriples: cell >= TRIPLE_CELL_FLOOR,
    allowMarks: cell >= MARK_CELL_FLOOR,
  })

  const layout = { config, ctx, tag, items, font, metricsField }
  const objects = layoutPage({ ...layout, instruction: INSTRUCTION, revealBlank: false })
  const answerSourceObjects = layoutPage({ ...layout, instruction: '', revealBlank: true })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const matrixReasoningTemplate: StudioTemplateDefinition = {
  key: 'matrix-reasoning',
  label: 'Matrix Reasoning',
  category: 'logic',
  description:
    'The classic non-verbal reasoning puzzle, also printed as Find the Missing Piece. Figures in a 3×3 grid follow hidden rules across rows and columns — shapes distributed one per line, paint or inner marks combined from the cells beside them, quantities that add up — and the reader picks the piece that fits the blank square. Every grid is solved back from its own eight visible cells before it prints, so each page has exactly one defensible answer. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.6">
      <path d="M27 5v30M37 5v30M17 15h30M17 25h30"/>
    </g>
    <rect x="17" y="5" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <g stroke="currentColor" stroke-width="0.8">
      <circle cx="22" cy="10" r="2.8" fill="none"/>
      <rect x="29" y="7.2" width="5.6" height="5.6" fill="none"/>
      <path d="M42 7.2l2.8 5.6h-5.6z" fill="none"/>
      <circle cx="22" cy="20" r="2.8" fill="currentColor" opacity="0.4"/>
      <rect x="29" y="17.2" width="5.6" height="5.6" fill="currentColor" opacity="0.4"/>
      <path d="M42 17.2l2.8 5.6h-5.6z" fill="currentColor" opacity="0.4"/>
      <circle cx="22" cy="30" r="2.8" fill="currentColor"/>
      <rect x="29" y="27.2" width="5.6" height="5.6" fill="currentColor"/>
    </g>
    <g font-size="8" fill="currentColor" font-family="sans-serif" text-anchor="middle">
      <text x="42" y="33">?</text>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Easy (two rules, straight bands)', value: 'easy' },
        { label: 'Medium (adds distribution rules)', value: 'medium' },
        { label: 'Hard (three rules, combining and adding)', value: 'hard' },
      ],
    },
    {
      key: 'itemCount',
      label: 'Puzzles per page',
      type: 'number',
      default: DEFAULT_ITEM,
      min: MIN_ITEM,
      max: MAX_ITEM,
      step: 1,
      maxWhen: resolveItemCountMax,
      helpWhen: (config, layout) => {
        const max = resolveItemCountMax(config, layout)
        return max >= MAX_ITEM
          ? 'How many puzzles on the page.'
          : `Max ${max} for this page size and header so every grid stays easy to read.`
      },
      help: 'How many puzzles on the page.',
    },
    {
      key: 'optionCount',
      label: 'Answer choices',
      type: 'select',
      default: 6,
      options: [
        { label: '4 choices', value: 4 },
        { label: '6 choices (harder to guess)', value: 6 },
      ],
    },
  ],
  generate,
}
