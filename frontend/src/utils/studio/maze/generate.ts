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
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { buildMaze, type MazeDifficulty, type MazePuzzle } from './generator'
import { cellForMazeField, drawMaze, mazeGridField } from './draw'

export {
  buildMaze,
  carveMaze,
  solveMaze,
  isPerfectMaze,
  countDeadEnds,
  hasWall,
} from './generator'
export type { MazeCell, MazeGrid, MazePuzzle, MazeDifficulty } from './generator'

/** Column counts per size preset. Rows follow the page shape. */
const SIZE_COLS: Record<string, number> = {
  small: 12,
  medium: 16,
  large: 20,
  xlarge: 26,
}

/** Rows stay within these multiples of the column count, whatever the page shape. */
const MIN_ROW_RATIO = 0.8
const MAX_ROW_RATIO = 2

function parseCols(raw: unknown): number {
  return SIZE_COLS[String(raw ?? 'medium')] ?? SIZE_COLS.medium!
}

function parseDifficulty(raw: unknown): MazeDifficulty {
  const value = String(raw ?? 'medium')
  if (value === 'easy' || value === 'medium' || value === 'hard') return value
  return 'medium'
}

/**
 * Row count for square cells that fill the page: the column count fixes the
 * cell size, then rows are however many of those cells the field is tall enough
 * to hold. Clamped so an unusual page shape cannot produce a sliver of a maze.
 */
export function rowsForField(cols: number, fieldWidth: number, fieldHeight: number): number {
  if (fieldWidth <= 0 || fieldHeight <= 0) return cols
  const cell = Math.max(1, Math.floor(fieldWidth / cols))
  return Math.max(
    Math.round(cols * MIN_ROW_RATIO),
    Math.min(Math.round(cols * MAX_ROW_RATIO), Math.floor(fieldHeight / cell)),
  )
}

const INSTRUCTION =
  'Find your way from Start to Finish. Draw a line through the open paths. ' +
  'Do not cross any walls. There is exactly one way through'

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzle: MazePuzzle
  showLabels: boolean
  font: string
  instruction: string
  /** Size cells from this body (puzzle page); place/center in `instruction` body. */
  sizeInstruction?: string
}): StudioFabricObject[] {
  const { config, ctx, tag, puzzle, showLabels, font, instruction, sizeInstruction } =
    options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)

  let maxCell: number | undefined
  if (sizeInstruction !== undefined) {
    const sizeHeaderH = measureHeaderHeight(config, sizeInstruction, content.width)
    maxCell = cellForMazeField(
      {
        ...content,
        top: content.top + sizeHeaderH,
        height: Math.max(1, content.height - sizeHeaderH),
      },
      puzzle.cols,
      puzzle.rows,
      showLabels,
    )
  }

  return [
    ...header.objects,
    drawMaze({
      field: header.body,
      puzzle,
      showLabels,
      font,
      tag,
      maxCell,
    }),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const cols = parseCols(config.size)
  const difficulty = parseDifficulty(config.difficulty)
  const showLabels = config.showLabels !== false
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const rng = createRng(ctx.seed)

  const tag: StudioTag = {
    templateKey: 'maze',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const puzzleBody = drawHeader(content, config, tag, INSTRUCTION).body
  const gridArea = mazeGridField(puzzleBody, showLabels)
  const rows = rowsForField(cols, gridArea.width, gridArea.height)
  const puzzle = buildMaze(rows, cols, difficulty, rng)

  const layout = { config, ctx, tag, puzzle, showLabels, font }
  const objects = layoutPage({ ...layout, instruction: INSTRUCTION })
  // Same maze size as the puzzle page; re-center in the taller key body.
  const answerSourceObjects = layoutPage({
    ...layout,
    instruction: '',
    sizeInstruction: INSTRUCTION,
  })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const mazeTemplate: StudioTemplateDefinition = {
  key: 'maze',
  label: 'Maze',
  category: 'spatial',
  description:
    'A pencil maze with one entrance, one exit and exactly one way through. Difficulty sets how twisty the route is and how long the solution runs. Includes an answer key tracing the path.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square" stroke-linejoin="miter">
      <path d="M18 7V34H36"/>
      <path d="M45 34V7H27"/>
      <path d="M27 7v9M27 16h18M36 7v18M27 16v9"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'size',
      label: 'Maze size',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Small (wide paths)', value: 'small' },
        { label: 'Medium', value: 'medium' },
        { label: 'Large', value: 'large' },
        { label: 'Extra large (fine paths)', value: 'xlarge' },
      ],
      help: 'Larger mazes use smaller cells. Small suits shaky hands and thick pens.',
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Easy (long straight corridors)', value: 'easy' },
        { label: 'Medium', value: 'medium' },
        { label: 'Hard (twisty, long route)', value: 'hard' },
      ],
    },
    {
      key: 'showLabels',
      label: 'Show Start / Finish labels',
      type: 'toggle',
      default: true,
      help: 'Labels mark the Start and Finish openings.',
    },
  ],
  generate,
}
