import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioConfigValidationError,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import {
  contentBox,
  insetHorizontal,
  drawHeader,
  measureHeaderHeight,
} from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import type {
  MagicDifficulty,
  MagicNumberSet,
  MagicOrder,
  MagicPuzzle,
} from './types'
import { MAGIC_ORDERS } from './construct'
import { supportsMixed, supportsMultiply } from './values'
import { buildVariedPagePuzzles } from './page-puzzles'
import { cellForArea, drawSquare, layoutBlocks } from './draw'

export * from './generator'

const MIN_SQUARES = 1
const MAX_SQUARES = 4

/** 6×6 and 7×7 cells get cramped past two to a page. */
function maxSquaresPerPage(order: MagicOrder): number {
  return order >= 6 ? 2 : MAX_SQUARES
}

function parseOrder(raw: unknown): MagicOrder {
  const n = Number(raw)
  return (MAGIC_ORDERS as readonly number[]).includes(n) ? (n as MagicOrder) : 3
}

function parseDifficulty(raw: unknown): MagicDifficulty {
  const v = String(raw ?? 'easy')
  return v === 'medium' || v === 'hard' ? v : 'easy'
}

function parseNumberSet(config: StudioConfig): MagicNumberSet {
  const raw = config.numberSet
  if (raw === undefined) {
    // Pre-numberSet books stored a `nonNormal` toggle for “shift the range”.
    return config.nonNormal === true ? 'shifted' : 'normal'
  }
  const v = String(raw)
  if (v === 'shifted' || v === 'step' || v === 'mixed' || v === 'multiply') return v
  return 'normal'
}

function clampSquaresPerPage(raw: unknown, order: MagicOrder): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return Math.min(2, maxSquaresPerPage(order))
  return Math.min(maxSquaresPerPage(order), Math.max(MIN_SQUARES, Math.round(n)))
}

function buildInstruction(puzzle: MagicPuzzle, hideConstant: boolean): string {
  const multiply = puzzle.operation === 'multiply'
  const agree = multiply
    ? 'multiply to the same product.'
    : 'add up to the same total.'
  const constantHint = hideConstant
    ? ` Work out the ${multiply ? 'product' : 'total'} first. Every line must match it.`
    : ` The target for each square is shown above it.`
  const tip = multiply
    ? ' Tip: if a line has only one blank, divide the product by the other numbers'
    : ' Tip: if a line has only one blank, subtract the other numbers from the total'
  return (
    'Fill in the missing numbers so that every row, every column, and both diagonals ' +
    agree +
    constantHint +
    ` Use ${puzzle.bankSentence} once.` +
    tip
  )
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzles: MagicPuzzle[]
  hideConstant: boolean
  font: string
  instruction: string
  /** Size cells from this body (puzzle page); place/center in `instruction` body. */
  sizeInstruction?: string
}): StudioFabricObject[] {
  const {
    config,
    ctx,
    tag,
    puzzles,
    hideConstant,
    font,
    instruction,
    sizeInstruction,
  } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  const placeBlocks = layoutBlocks(header.body, puzzles.length)
  let sizeBlocks = placeBlocks
  if (sizeInstruction !== undefined) {
    const sizeHeaderH = measureHeaderHeight(config, sizeInstruction, content.width)
    sizeBlocks = layoutBlocks(
      {
        ...content,
        top: content.top + sizeHeaderH,
        height: Math.max(1, content.height - sizeHeaderH),
      },
      puzzles.length,
    )
  }
  return [
    ...header.objects,
    ...puzzles.map((puzzle, s) =>
      drawSquare({
        area: placeBlocks[s]!,
        puzzle,
        hideConstant,
        index: puzzles.length === 1 ? null : s + 1,
        font,
        tag,
        maxCell:
          sizeInstruction === undefined
            ? undefined
            : cellForArea(sizeBlocks[s]!, puzzle.order),
      }),
    ),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const order = parseOrder(config.order)
  const difficulty = parseDifficulty(config.difficulty)
  const numberSet = parseNumberSet(config)
  const hideConstant = config.hideConstant === true
  const perPage = clampSquaresPerPage(config.squaresPerPage ?? 2, order)
  const font = String(config.fontFamily)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const tag: StudioTag = {
    templateKey: 'magic-square',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  // Salted per seller so two books built from the same seed do not share
  // squares — the same KDP-uniqueness rule mirror-draw and nonogram follow.
  const puzzles = buildVariedPagePuzzles({
    order,
    difficulty,
    numberSet,
    hideConstant,
    perPage,
    seed: ctx.seed,
    ownerKey: ctx.ownerKey ?? 'anonymous',
  })

  const instruction = buildInstruction(puzzles[0]!, hideConstant)
  const layout = { config, ctx, tag, puzzles, hideConstant, font }
  const objects = layoutPage({ ...layout, instruction })
  // Same grid size as the puzzle page; only re-center in the taller key body.
  const answerSourceObjects = layoutPage({
    ...layout,
    instruction: '',
    sizeInstruction: instruction,
  })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

function validateConfig(config: StudioConfig): StudioConfigValidationError | null {
  const order = parseOrder(config.order)
  const numberSet = parseNumberSet(config)
  if (numberSet === 'multiply' && !supportsMultiply(order)) {
    return {
      field: 'numberSet',
      message: 'Same product only works on a 3×3 grid — pick another number set.',
    }
  }
  if (numberSet === 'mixed' && !supportsMixed(order)) {
    return {
      field: 'numberSet',
      message:
        'A 6×6 grid has no layer pair to hang a mixed bank on — pick another grid size or number set.',
    }
  }
  const requested = Number(config.squaresPerPage)
  const cap = maxSquaresPerPage(order)
  if (Number.isFinite(requested) && requested > cap) {
    return {
      field: 'squaresPerPage',
      message: `A ${order}×${order} grid fits at most ${cap} per page.`,
    }
  }
  return null
}

export const magicSquareTemplate: StudioTemplateDefinition = {
  key: 'magic-square',
  label: 'Magic Square',
  category: 'logic',
  description:
    'Fill in the missing numbers so every row, column and diagonal adds up to the same total. Grids from 3×3 to 7×7, with number banks that go well beyond the usual 1 to n². Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1"><rect x="18" y="4" width="28" height="28"/>
      <path d="M27.3 4v28M36.6 4v28M18 13.3h28M18 22.6h28"/></g>
    <g font-size="7" fill="currentColor" font-family="sans-serif" text-anchor="middle">
      <text x="22.5" y="11">2</text><text x="41.5" y="11">6</text><text x="32" y="21">5</text>
      <text x="22.5" y="30">4</text><text x="41.5" y="30">8</text></g>
  </svg>`,
  configSchema: [
    {
      key: 'order',
      label: 'Grid size',
      type: 'select',
      default: 3,
      options: [
        { label: '3×3 (easiest)', value: 3 },
        { label: '4×4', value: 4 },
        { label: '5×5', value: 5 },
        { label: '6×6', value: 6 },
        { label: '7×7 (biggest)', value: 7 },
      ],
      help: 'Bigger grids mean longer chains of adding. Each puzzle prints its own line total above the square.',
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'easy',
      options: [
        { label: 'Easy (few blanks)', value: 'easy' },
        { label: 'Medium', value: 'medium' },
        { label: 'Hard (many blanks)', value: 'hard' },
      ],
      help:
        'More blanks = harder, and never a guess: each one can be worked out from a single line. ' +
        'For a bigger jump in difficulty, raise the grid size or the number set.',
    },
    {
      key: 'numberSet',
      label: 'Numbers used',
      type: 'select',
      default: 'normal',
      options: [
        { label: '1 to n² (standard)', value: 'normal' },
        { label: 'Start higher (bigger sums)', value: 'shifted' },
        { label: 'Count by 2s–5s (heavier adding)', value: 'step' },
        { label: 'Mixed numbers (widest variety)', value: 'mixed' },
        { label: 'Same product, not sum (3×3)', value: 'multiply' },
      ],
      helpWhen: (config) => {
        const numberSet = parseNumberSet(config)
        if (numberSet === 'multiply') {
          return 'Same product on every line (3×3). Bulk runs cycle targets so pages stay distinct.'
        }
        if (numberSet === 'mixed') {
          return 'Free number bank — widest variety for long books. Not available on 6×6.'
        }
        return 'Changes how much arithmetic each line costs. The banner shows the real total.'
      },
    },
    {
      key: 'hideConstant',
      label: 'Hide the target',
      type: 'toggle',
      default: false,
      help:
        'Don’t print the total — the solver works it out. One line is always left ' +
        'complete so it can be read off the page.',
    },
    {
      key: 'squaresPerPage',
      label: 'Squares per page',
      type: 'number',
      default: 2,
      min: MIN_SQUARES,
      max: MAX_SQUARES,
      step: 1,
      maxWhen: (config) => maxSquaresPerPage(parseOrder(config.order)),
    },
  ],
  validateConfig,
  generate,
}
