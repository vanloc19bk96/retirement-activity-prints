import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { RiddleScrambleResponse } from '@/types/studio-riddle-scramble.types'
import { STUDIO_BODY_SIZE } from '@/constants/studio.constants'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { resolveRetirementTheme } from '../_shared/retirement-theme-config'
import {
  RIDDLE_SCRAMBLE_CONFIG_SCHEMA,
  instructionFor,
  validateRiddleScrambleConfig,
} from './config'
import {
  RIDDLE_SCRAMBLE_AI_EMPTY_MESSAGE,
  RIDDLE_SCRAMBLE_DEFAULT_TITLE,
  RIDDLE_SCRAMBLE_PAGE_TOO_SMALL_MESSAGE,
  RIDDLE_SCRAMBLE_UNSPELLABLE_MESSAGE,
  selectRiddles,
  selectWords,
} from './content'
import { buildRiddleScramblePuzzle, type RiddleScramblePuzzle } from './build'
import { drawRiddleScramblePage } from './draw'
import { runRiddleScrambleKdpPreflight } from './kdp-preflight'
import {
  planRiddleScramblePage,
  riddleScrambleBodyField,
  riddleScrambleContentBox,
  riddleScramblePageLock,
  riddleScrambleWorstCasePlan,
  type RiddleScramblePagePlan,
} from './layout'
import { parseRiddleScrambleLevel, type RiddleScrambleLevel } from './levels'
import { riddleScramblePrefetch } from './prefetch'
import { RIDDLE_SCRAMBLE_THEME_SALT } from './theme'

export { validateRiddleScrambleConfig }

/**
 * Blank heading falls back to the theme, so a seller sees what the page is.
 *
 * Only when the page is meant to carry a heading at all: turning "Page title"
 * off hands generate a blank title, and a blank title is not an invitation to
 * supply one.
 */
function withThemeTitle(config: StudioConfig, themeLabel: string): StudioConfig {
  if (config.showTitle === false) return config
  if (String(config.title ?? '').trim()) return config
  return themeLabel ? { ...config, title: themeLabel } : config
}

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(
    riddleScrambleContentBox(ctx),
    config,
    tag,
    instructionFor(config),
  )
  return {
    pageRole: 'single',
    objects: [
      ...header.objects,
      buildText(
        {
          left: boxCenterX(header.body),
          top: header.body.top + header.body.height * 0.35,
          text: message,
          fontFamily: String(config.fontFamily),
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

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: RiddleScramblePagePlan
  puzzle: RiddleScramblePuzzle
  font: string
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, puzzle, font, instruction } = options
  const header = drawHeader(riddleScrambleContentBox(ctx), config, tag, instruction)
  const objects = [...header.objects]
  drawRiddleScramblePage(objects, {
    field: header.body,
    plan,
    rows: puzzle.rows,
    answer: puzzle.answer,
    font,
    tag,
  })
  return objects
}

/**
 * Lay the page out at the shape the run was promised, or at whatever fits.
 *
 * The lock exists so every sheet of one book sets at the same size: the worst
 * case is measured once against the level and the trim, and the real pages are
 * pinned to it. The fallback exists because a lock is a promise about the
 * worst case, and a promise can be wrong at the edges — a clue of ordinary
 * length set in an unusually wide face can need a pixel the probe did not
 * reserve. One page a point smaller than its neighbours is a blemish; an error
 * page where a perfectly good puzzle should be is a refund.
 */
function planAtLockOrBelow(options: {
  ctx: StudioGenerateContext
  config: StudioConfig
  instruction: string
  font: string
  level: RiddleScrambleLevel
  puzzle: RiddleScramblePuzzle
}): RiddleScramblePagePlan | null {
  const { ctx, config, instruction, font, level, puzzle } = options
  const field = riddleScrambleBodyField(ctx, config, instruction)
  const items = puzzle.rows.map((row) => ({ word: row.word, clue: row.clue }))
  const shared = {
    field,
    items,
    riddle: puzzle.riddle,
    answerLetters: puzzle.answer.length,
    spec: { fontFamily: font },
  }

  // Measured against the heading and instruction this page will really carry,
  // so the shape the form promised is the shape the page prints.
  const promised = riddleScrambleWorstCasePlan({
    level,
    page: ctx,
    config,
    instruction,
    font,
  })
  if (!promised) return null

  return (
    planRiddleScramblePage({ ...shared, lock: riddleScramblePageLock(promised) }) ??
    planRiddleScramblePage(shared)
  )
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily)
  const level = parseRiddleScrambleLevel(config)
  const theme = resolveRetirementTheme(config, ctx.seed, RIDDLE_SCRAMBLE_THEME_SALT)
  const pageConfig = withThemeTitle(config, theme.label)
  const instruction = instructionFor(pageConfig)

  const tag: StudioTag = {
    templateKey: 'riddle-scramble',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const remote = ctx.remoteData as RiddleScrambleResponse | undefined
  const riddles = selectRiddles(remote?.riddles, level)
  const words = selectWords(remote?.words, { level })
  if (riddles.length === 0 || words.length < level.answerLetters) {
    return [errorPage(ctx, pageConfig, tag, RIDDLE_SCRAMBLE_AI_EMPTY_MESSAGE)]
  }

  // The chain is built before anything is measured, because its length decides
  // the page: one word per letter of whichever riddle the pool could spell.
  const puzzle = buildRiddleScramblePuzzle({ riddles, words, level, seed: ctx.seed })
  if (!puzzle) {
    return [errorPage(ctx, pageConfig, tag, RIDDLE_SCRAMBLE_UNSPELLABLE_MESSAGE)]
  }

  const plan = planAtLockOrBelow({
    ctx,
    config: pageConfig,
    instruction,
    font,
    level,
    puzzle,
  })
  if (!plan) {
    return [errorPage(ctx, pageConfig, tag, RIDDLE_SCRAMBLE_PAGE_TOO_SMALL_MESSAGE)]
  }

  const preflight = runRiddleScrambleKdpPreflight({ puzzle, level, plan })
  if (!preflight.ok) {
    return [
      errorPage(
        ctx,
        pageConfig,
        tag,
        preflight.errors[0] ?? RIDDLE_SCRAMBLE_AI_EMPTY_MESSAGE,
      ),
    ]
  }

  const shared = { config: pageConfig, ctx, tag, plan, puzzle, font }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, instruction }),
      // The solution is this same page with the words written onto the lines
      // and the riddle answered in its boxes — same scrambles, same clues,
      // same slots — so a reader checking their work is looking at the page
      // they solved rather than at a bare list.
      answerSourceObjects: layoutPage({ ...shared, instruction: '' }),
    },
  ]
}

export const riddleScrambleTemplate: StudioTemplateDefinition = {
  key: 'riddle-scramble',
  label: 'Riddle Scramble',
  category: 'word',
  description:
    'Large-print retirement word scramble with a twist: one letter of every answer is boxed, and read in order they answer a pun riddle at the foot of the page. Includes an answer page.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: RIDDLE_SCRAMBLE_DEFAULT_TITLE,
  validateConfig: validateRiddleScrambleConfig,
  prefetch: riddleScramblePrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="currentColor" font-family="serif" font-size="6.5" text-anchor="middle">
      <text x="14" y="6">K</text><text x="26" y="6">L</text><text x="38" y="6">A</text><text x="50" y="6">W</text>
      <text x="14" y="16.2">D</text><text x="26" y="16.2">A</text><text x="38" y="16.2">E</text><text x="50" y="16.2">R</text>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round">
      <path d="M11 11.6h6M35 11.6h6M47 11.6h6"/>
      <rect x="23" y="8.4" width="6" height="3.2" rx="0.7"/>
      <path d="M11 21.8h6M23 21.8h6M47 21.8h6"/>
      <rect x="35" y="18.6" width="6" height="3.2" rx="0.7"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.15">
      <rect x="10.7" y="25.4" width="6.6" height="6.6" rx="1"/>
      <rect x="22.7" y="25.4" width="6.6" height="6.6" rx="1"/>
      <rect x="34.7" y="25.4" width="6.6" height="6.6" rx="1"/>
      <rect x="46.7" y="25.4" width="6.6" height="6.6" rx="1"/>
    </g>
    <g fill="currentColor" font-family="sans-serif" font-size="4.4" text-anchor="middle" opacity="0.72">
      <text x="14" y="36.4">1</text><text x="26" y="36.4">2</text><text x="38" y="36.4">3</text><text x="50" y="36.4">4</text>
    </g>
  </svg>`,
  configSchema: RIDDLE_SCRAMBLE_CONFIG_SCHEMA,
  generate,
}
