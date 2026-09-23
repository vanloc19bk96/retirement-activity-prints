import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { createRng } from '../studio-rng'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { MAZE_CONFIG_SCHEMA } from './config'
import { drawMaze } from './draw'
import { buildMaze, type MazePuzzle } from './generator'
import { runMazeKdpPreflight } from './kdp-preflight'
import {
  mazeBlockBox,
  mazeContentBox,
  planMazePage,
  type MazePagePlan,
} from './layout'
import { mazeInstruction, parseMazeLevel, type MazeLevel } from './levels'

const PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a maze at this level. Pick a larger page in Settings, or a gentler level.'

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  instruction: string,
  message: string,
): StudioPageOutput {
  const header = drawHeader(mazeContentBox(ctx), config, tag, instruction)
  return {
    pageRole: 'single',
    objects: [
      ...header.objects,
      buildText(
        {
          left: boxCenterX(header.body),
          top: header.body.top + header.body.height * 0.35,
          text: message,
          fontFamily: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
          fontSize: STUDIO_BODY_SIZE - 4,
          width: header.body.width * 0.85,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
    ],
  }
}

/**
 * One page, drawn around whatever heading it is asked to carry.
 *
 * The plan is passed in rather than re-derived, so the key prints the maze at
 * the size the puzzle page set. Dropping the instruction gives the key a taller
 * body; `mazeBlockBox` re-centres the same block in it, which is what lets a
 * reader lay the two pages side by side and see the same maze twice.
 */
function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: MazePagePlan
  puzzle: MazePuzzle
  font: string
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, puzzle, font, instruction } = options
  const header = drawHeader(mazeContentBox(ctx), config, tag, instruction)
  return [
    ...header.objects,
    drawMaze({
      block: mazeBlockBox(header.body, plan),
      puzzle,
      plan,
      font,
      tag,
    }),
  ]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level: MazeLevel = parseMazeLevel(config)
  const instruction = mazeInstruction(config)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)

  const tag: StudioTag = {
    templateKey: 'maze',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const fail = (message: string) => [errorPage(ctx, config, tag, instruction, message)]

  // Measured against the heading and instruction this page will really carry,
  // so the maze the form promised is the maze that prints.
  const plan = planMazePage({ page: ctx, config, instruction, level })
  if (!plan) return fail(PAGE_TOO_SMALL_MESSAGE)

  const puzzle = buildMaze({
    rows: plan.rows,
    cols: plan.cols,
    profile: level.profile,
    rng: createRng(ctx.seed),
  })

  const preflight = runMazeKdpPreflight({ puzzle, plan, level })
  if (!preflight.ok) return fail(preflight.errors[0] ?? PAGE_TOO_SMALL_MESSAGE)

  const shared = { config, ctx, tag, plan, puzzle, font }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, instruction }),
      // The solution is the same maze with the route drawn through it. The
      // instruction goes: a reader looking at the key has already been told
      // the rules, and the line needs the room more than the sentence does.
      answerSourceObjects: layoutPage({ ...shared, instruction: '' }),
    },
  ]
}

export const mazeTemplate: StudioTemplateDefinition = {
  key: 'maze',
  label: 'Maze',
  category: 'spatial',
  description:
    'A large-print maze with exactly one way through. Pick a level and the path width, grid size and wall weight are sized for your page. Includes an answer page tracing the route.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square">
      <path d="M8 8h12M32 8h24M8 32h36M8 8v24M56 8v24"/>
      <path d="M20 20v12M32 20h24M44 8v12"/>
    </g>
  </svg>`,
  configSchema: MAZE_CONFIG_SCHEMA,
  generate,
}
