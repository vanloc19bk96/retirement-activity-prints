import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, type StudioRng } from '../studio-rng'
import { drawHeader, boxCenterX } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_BODY_SIZE, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { buildCrossword, numberEntries } from './construct'
import { numberingValid, readEntry } from './validate'
import {
  CROSSWORD_CONFIG_SCHEMA,
  instructionFor,
  validateCrosswordConfig,
} from './config'
import { parseCrosswordLevel } from './levels'
import { resolveCrosswordTheme } from './theme'
import { crosswordContentBox, crosswordPagePlan, type CrosswordPagePlan } from './layout'
import { selectCrosswordCandidates } from './candidate-selector'
import { drawCrosswordPuzzle } from './draw'
import { crosswordPrefetch, CROSSWORD_AI_EMPTY_MESSAGE } from './prefetch'
import type { CrosswordBuild, CrosswordEntry, CrosswordPair } from './types'

const BUILD_ERROR_MESSAGE =
  'Could not interlock these answers into a grid. Try again, or pick a broader retirement theme.'

/** Blank heading falls back to the theme, so a seller sees what the page is. */
function withThemeTitle(config: StudioConfig, themeLabel: string): StudioConfig {
  if (String(config.title ?? '').trim()) return config
  return themeLabel ? { ...config, title: themeLabel } : config
}

/**
 * Every clue in the list must read back off the grid, and the numbers on the
 * grid must run 1..N with no gaps. Both are cheap to check and catastrophic to
 * print wrong: a solver who fills in 7 Across correctly and finds it clashing
 * with 4 Down has no way to tell which half of the book is at fault.
 */
function buildIsSound(built: CrosswordBuild, entries: CrosswordEntry[]): boolean {
  if (entries.some((entry) => readEntry(built.grid, entry) !== entry.word)) return false
  return numberingValid(entries, built.grid)
}

interface SoundBuild {
  built: CrosswordBuild
  entries: CrosswordEntry[]
}

/**
 * Pack the answers, accepting one fewer than asked for before giving up.
 *
 * A single stubborn answer should cost the page that answer, not the page.
 */
function buildSoundCrossword(options: {
  pairs: CrosswordPair[]
  rng: StudioRng
  maxSize: number
  target: number
  minAcceptable: number
}): SoundBuild | null {
  const { pairs, rng, maxSize, target, minAcceptable } = options
  let best: SoundBuild | null = null
  const remember = (candidate: SoundBuild): void => {
    if (!best || candidate.entries.length > best.entries.length) best = candidate
  }
  const bestSoFar = (): SoundBuild | null => best

  for (const placeCount of [target, target - 1]) {
    if (placeCount < minAcceptable) continue
    for (let attempt = 0; attempt < 6; attempt++) {
      const built = buildCrossword(pairs, maxSize, rng, placeCount)
      if (!built) continue
      const entries = numberEntries(built.entries, built.grid, built.size)
      if (!buildIsSound(built, entries)) continue
      if (entries.length >= placeCount) return { built, entries }
      remember({ built, entries })
    }
    const current = bestSoFar()
    if (current && current.entries.length >= placeCount) return current
  }

  const final = bestSoFar()
  return final && final.entries.length >= minAcceptable ? final : null
}

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const header = drawHeader(crosswordContentBox(ctx), config, tag, instructionFor(config))
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

function layoutCrosswordPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: CrosswordPagePlan
  build: SoundBuild
  font: string
  instruction: string
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, build, font, instruction, forAnswerKey } = options
  const header = drawHeader(crosswordContentBox(ctx), config, tag, instruction)
  const drawn = drawCrosswordPuzzle({
    field: header.body,
    built: build.built,
    entries: build.entries,
    font,
    tag,
    plan,
    forAnswerKey,
  })
  return [...header.objects, ...drawn.objects]
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  const rng = createRng(ctx.seed ^ 0x9e3779b9)
  const level = parseCrosswordLevel(config)
  const theme = resolveCrosswordTheme(config, ctx.seed)
  const pageConfig = withThemeTitle(config, theme.label)
  const instruction = instructionFor(config)

  const tag: StudioTag = {
    templateKey: 'crossword',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  // Measured against the heading this page will really carry, so the answer
  // count the form promised is the answer count the page prints.
  const plan = crosswordPagePlan({
    page: ctx,
    config: pageConfig,
    instruction,
    level,
  })

  const remote = ctx.remoteData as CrosswordPair[] | undefined
  if (!remote?.length) {
    return [errorPage(ctx, pageConfig, tag, CROSSWORD_AI_EMPTY_MESSAGE)]
  }

  const pairs = selectCrosswordCandidates(remote, plan.answerCount)
  if (pairs.length < 4) {
    return [errorPage(ctx, pageConfig, tag, CROSSWORD_AI_EMPTY_MESSAGE)]
  }

  const minAcceptable = Math.max(
    4,
    Math.min(plan.answerCount, level.minAnswers, plan.answerCount - 1),
  )
  const build = buildSoundCrossword({
    pairs,
    rng,
    maxSize: plan.maxGridSide,
    target: plan.answerCount,
    minAcceptable,
  })
  if (!build) {
    return [errorPage(ctx, pageConfig, tag, BUILD_ERROR_MESSAGE)]
  }

  const layout = { config: pageConfig, ctx, tag, plan, build, font }
  return [
    {
      pageRole: 'single',
      objects: layoutCrosswordPage({ ...layout, instruction }),
      answerSourceObjects: layoutCrosswordPage({
        ...layout,
        instruction: '',
        forAnswerKey: true,
      }),
    },
  ]
}

export const crosswordTemplate: StudioTemplateDefinition = {
  key: 'crossword',
  label: 'Crossword',
  category: 'word',
  description:
    'A large-print retirement crossword: pick a theme and a level, and the grid, clue type and answer count are sized for your page. Includes an answer page.',
  pageCount: 1,
  producesAnswerKey: true,
  prefetch: crosswordPrefetch,
  validateConfig: validateCrosswordConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1">
      <path d="M12 4h24v8h8v8h-8v8H20v-8h-8v-8h8z"/>
      <path d="M20 4v28M28 4v28M36 12v16M12 12h32M12 20h32M20 28h24"/>
    </g>
    <g font-size="4" fill="currentColor" font-family="sans-serif">
      <text x="13" y="9">1</text><text x="21" y="9">2</text><text x="29" y="9">3</text>
    </g>
  </svg>`,
  configSchema: CROSSWORD_CONFIG_SCHEMA,
  generate,
}
