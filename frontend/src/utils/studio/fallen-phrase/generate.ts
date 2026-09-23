import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { FallenPhraseResponse } from '@/types/studio-fallen-phrase.types'
import { STUDIO_BODY_SIZE } from '@/constants/studio.constants'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { createRng } from '../studio-rng'
import { resolveRetirementTheme } from '../_shared/retirement-theme-config'
import {
  FALLEN_PHRASE_CONFIG_SCHEMA,
  instructionFor,
  validateFallenPhraseConfig,
} from './config'
import {
  FALLEN_PHRASE_AI_EMPTY_MESSAGE,
  FALLEN_PHRASE_DEFAULT_TITLE,
  FALLEN_PHRASE_PAGE_TOO_SMALL_MESSAGE,
  FALLEN_PHRASE_UNBUILDABLE_MESSAGE,
  selectAiPhrases,
} from './content'
import { buildFallenPhraseGrid, type FallenPhraseGrid } from './grid'
import { drawFallenPhrase } from './draw'
import { runFallenPhraseKdpPreflight } from './kdp-preflight'
import {
  fallenPhraseBodyField,
  fallenPhraseColumnCandidates,
  fallenPhraseContentBox,
  planFallenPhrasePage,
  type FallenPhrasePagePlan,
} from './layout'
import {
  parseFallenPhraseLevel,
  rowCandidatesFor,
  type FallenPhraseLevel,
} from './levels'
import { fallenPhrasePrefetch } from './prefetch'
import { FALLEN_PHRASE_THEME_SALT } from './theme'

export { validateFallenPhraseConfig }

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
    fallenPhraseContentBox(ctx),
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
  plan: FallenPhrasePagePlan
  grid: FallenPhraseGrid
  font: string
  instruction: string
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, grid, font, instruction, forAnswerKey } = options
  const header = drawHeader(fallenPhraseContentBox(ctx), config, tag, instruction)
  const objects = [...header.objects]
  drawFallenPhrase(objects, {
    field: header.body,
    plan,
    grid,
    font,
    tag,
    forAnswerKey,
  })
  return objects
}

interface BuiltPuzzle {
  grid: FallenPhraseGrid
  plan: FallenPhrasePagePlan
}

/**
 * The first saying this page can actually print.
 *
 * A candidate is only a candidate until three separate things have agreed:
 * it wraps into the level's rows at the grid width this trim allows, the boxes
 * and the letters under them fit at the writing floor, and the finished puzzle
 * passes preflight. A saying that fails any of them is dropped for the next
 * one rather than forced onto the page — a fallen phrase that cannot be
 * rebuilt is worse than no page at all, because it ships.
 */
function buildFirstPrintable(options: {
  phrases: readonly string[]
  colCandidates: readonly number[]
  rowCandidates: readonly number[]
  field: { left: number; top: number; width: number; height: number }
  level: FallenPhraseLevel
  seed: number
}): { puzzle: BuiltPuzzle | null; firstError: string | null } {
  const { phrases, colCandidates, rowCandidates, field, level, seed } = options
  let firstError: string | null = null

  for (const phrase of phrases) {
    const grid = buildFallenPhraseGrid({
      phrase,
      colCandidates,
      rowCandidates,
      targetRows: level.rows,
      preferredCols: level.preferredCols,
      seed,
    })
    if (!grid) continue

    const plan = planFallenPhrasePage({
      field,
      cols: grid.cols,
      rowCount: grid.rows.length,
      bankRows: grid.maxColumnLetters,
    })
    if (!plan) continue

    const preflight = runFallenPhraseKdpPreflight({
      grid,
      length: level.length,
      metrics: plan.metrics,
    })
    if (!preflight.ok) {
      firstError ??= preflight.errors[0] ?? null
      continue
    }
    return { puzzle: { grid, plan }, firstError }
  }
  return { puzzle: null, firstError }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily)
  const level = parseFallenPhraseLevel(config)
  const theme = resolveRetirementTheme(config, ctx.seed, FALLEN_PHRASE_THEME_SALT)
  const pageConfig = withThemeTitle(config, theme.label)
  const instruction = instructionFor(pageConfig)

  const tag: StudioTag = {
    templateKey: 'fallen-phrase',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const remote = ctx.remoteData as FallenPhraseResponse | undefined
  const phrases = selectAiPhrases(remote?.items, { count: 1, length: level.length })
  if (phrases.length === 0) {
    return [errorPage(ctx, pageConfig, tag, FALLEN_PHRASE_AI_EMPTY_MESSAGE)]
  }

  const field = fallenPhraseBodyField(ctx, pageConfig, instruction)
  const colCandidates = fallenPhraseColumnCandidates(field, level)
  if (colCandidates.length === 0) {
    return [errorPage(ctx, pageConfig, tag, FALLEN_PHRASE_PAGE_TOO_SMALL_MESSAGE)]
  }

  // Start the search somewhere different on every sheet. Without this, a book
  // run handed one cached pool would open every page with the same saying —
  // the pool is fetched per page, but a cache hit, a retry or a repeated theme
  // all end in the same list arriving twice.
  const order = createRng(ctx.seed).shuffle(phrases)

  const { puzzle, firstError } = buildFirstPrintable({
    phrases: order,
    colCandidates,
    rowCandidates: rowCandidatesFor(level),
    field,
    level,
    seed: ctx.seed,
  })
  if (!puzzle) {
    return [
      errorPage(ctx, pageConfig, tag, firstError ?? FALLEN_PHRASE_UNBUILDABLE_MESSAGE),
    ]
  }

  const shared = { config: pageConfig, ctx, tag, font, ...puzzle }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, instruction }),
      // The solution is this same grid with the letters written in and the
      // saying named underneath — the page they solved, not a bare list. The
      // fallen letters go: on a solved grid they are twenty-odd glyphs with
      // nothing left to say.
      answerSourceObjects: layoutPage({
        ...shared,
        instruction: '',
        forAnswerKey: true,
      }),
    },
  ]
}

export const fallenPhraseTemplate: StudioTemplateDefinition = {
  key: 'fallen-phrase',
  label: 'Fallen Phrase',
  category: 'word',
  description:
    'A large-print quotefall: the letters of a retirement saying have dropped out of the grid and lie jumbled under their own column. Put each one back in its column and the saying reappears. Includes an answer page.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: FALLEN_PHRASE_DEFAULT_TITLE,
  prefetch: fallenPhrasePrefetch,
  validateConfig: validateFallenPhraseConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.1">
      <rect x="6" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/>
      <rect x="20" y="4" width="7" height="7"/><rect x="34" y="4" width="7" height="7"/>
      <rect x="41" y="4" width="7" height="7"/><rect x="48" y="4" width="7" height="7"/>
      <rect x="6" y="11" width="7" height="7"/><rect x="13" y="11" width="7" height="7"/>
      <rect x="27" y="11" width="7" height="7"/><rect x="34" y="11" width="7" height="7"/>
      <rect x="41" y="11" width="7" height="7"/><rect x="48" y="11" width="7" height="7"/>
    </g>
    <g fill="currentColor" font-family="serif" font-size="7" text-anchor="middle">
      <text x="9.5" y="27">R</text><text x="16.5" y="27">E</text><text x="23.5" y="27">T</text>
      <text x="37.5" y="27">D</text><text x="44.5" y="27">A</text><text x="51.5" y="27">Y</text>
      <text x="9.5" y="36">S</text><text x="16.5" y="36">N</text><text x="30.5" y="36">O</text>
      <text x="37.5" y="36">W</text><text x="44.5" y="36">I</text><text x="51.5" y="36">M</text>
    </g>
  </svg>`,
  configSchema: FALLEN_PHRASE_CONFIG_SCHEMA,
  generate,
}
