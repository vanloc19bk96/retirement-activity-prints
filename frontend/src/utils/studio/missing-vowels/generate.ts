import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type {
  MissingVowelsItem,
  MissingVowelsResponse,
} from '@/types/studio-missing-vowels.types'
import { STUDIO_BODY_SIZE } from '@/constants/studio.constants'
import { createRng } from '../studio-rng'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { resolveRetirementTheme } from '../_shared/retirement-theme-config'
import {
  MISSING_VOWELS_CONFIG_SCHEMA,
  instructionFor,
  validateMissingVowelsConfig,
} from './config'
import {
  MISSING_VOWELS_AI_EMPTY_MESSAGE,
  MISSING_VOWELS_DEFAULT_TITLE,
  selectAiItems,
} from './content'
import { drawMissingVowelsRows } from './draw'
import { runMissingVowelsKdpPreflight } from './kdp-preflight'
import {
  missingVowelsBodyField,
  missingVowelsContentBox,
  missingVowelsPageLock,
  missingVowelsWorstCasePlan,
  planMissingVowelsPage,
  type MissingVowelsPagePlan,
} from './layout'
import { parseMissingVowelsLevel, type MissingVowelsLevel } from './levels'
import { missingVowelsPrefetch } from './prefetch'
import { MISSING_VOWELS_THEME_SALT } from './theme'

export { validateMissingVowelsConfig }

const PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a missing-vowels page at this level. Pick a larger page in Settings, or a gentler level.'

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
    missingVowelsContentBox(ctx),
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

/**
 * Put the rows in a seeded order.
 *
 * The pool comes back in whatever order the writer produced it, which tends to
 * run short words first and long ones last — a page that starts easy and ends
 * hard down one column, and a book whose pages all sort the same way. Shuffling
 * from the sheet's own seed fixes both, and keeps the page identical on a
 * redraw.
 */
function orderItems(
  items: readonly MissingVowelsItem[],
  ctx: StudioGenerateContext,
): MissingVowelsItem[] {
  return createRng(ctx.seed).shuffle([...items])
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: MissingVowelsPagePlan
  items: readonly MissingVowelsItem[]
  font: string
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, items, font, instruction } = options
  const header = drawHeader(missingVowelsContentBox(ctx), config, tag, instruction)
  const objects = [...header.objects]
  drawMissingVowelsRows(objects, { field: header.body, plan, items, font, tag })
  return objects
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily)
  const level: MissingVowelsLevel = parseMissingVowelsLevel(config)
  const theme = resolveRetirementTheme(config, ctx.seed, MISSING_VOWELS_THEME_SALT)
  const pageConfig = withThemeTitle(config, theme.label)
  const instruction = instructionFor(pageConfig)

  const tag: StudioTag = {
    templateKey: 'missing-vowels',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const remote = ctx.remoteData as MissingVowelsResponse | undefined
  const selected = selectAiItems(remote?.items, { count: level.targetItems, level })
  if (selected.length === 0) {
    return [errorPage(ctx, pageConfig, tag, MISSING_VOWELS_AI_EMPTY_MESSAGE)]
  }

  // Measured against the heading and instruction this page will really carry,
  // so the count the form promised is the count the page prints — and so every
  // page of one book run holds the same number of puzzles, whether its words
  // came back long or short.
  const promised = missingVowelsWorstCasePlan({
    level,
    page: ctx,
    config: pageConfig,
    instruction,
    font,
  })
  if (!promised) {
    return [errorPage(ctx, pageConfig, tag, PAGE_TOO_SMALL_MESSAGE)]
  }

  const items = orderItems(selected, ctx)

  // Pinned to the shape the promise measured, so every sheet of one run sets at
  // the same size in the same number of columns whatever its words came back
  // like. Only the count may fall, and only if the real rows need more room
  // than the worst case did.
  const plan = planMissingVowelsPage({
    field: missingVowelsBodyField(ctx, pageConfig, instruction),
    items,
    target: promised.itemCount,
    spec: { fontFamily: font },
    lock: missingVowelsPageLock(promised),
  })
  if (!plan) {
    return [errorPage(ctx, pageConfig, tag, PAGE_TOO_SMALL_MESSAGE)]
  }

  const printed = items.slice(0, plan.itemCount)

  const preflight = runMissingVowelsKdpPreflight({ items: printed, level, plan })
  if (!preflight.ok) {
    return [
      errorPage(
        ctx,
        pageConfig,
        tag,
        preflight.errors[0] ?? MISSING_VOWELS_AI_EMPTY_MESSAGE,
      ),
    ]
  }

  const shared = { config: pageConfig, ctx, tag, plan, items: printed, font }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, instruction }),
      // The solution is this same page with the vowels written into the blanks
      // they belong in — same consonants, same clues, same rules — so a reader
      // checking an answer is looking at the row they just solved rather than a
      // bare list of words.
      answerSourceObjects: layoutPage({ ...shared, instruction: '' }),
    },
  ]
}

export const missingVowelsTemplate: StudioTemplateDefinition = {
  key: 'missing-vowels',
  label: 'Missing Vowels',
  category: 'word',
  description:
    'Large-print missing vowels: pick a theme and a level, and the clue, letter size and number of puzzles are sized for your page. Includes an answer page.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: MISSING_VOWELS_DEFAULT_TITLE,
  validateConfig: validateMissingVowelsConfig,
  prefetch: missingVowelsPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="8" fill="currentColor" letter-spacing="2.4">
      <text x="6" y="13">G RD N NG</text>
      <text x="6" y="31">S NS T</text>
    </g>
    <g font-family="sans-serif" font-size="4.5" fill="currentColor" opacity="0.6">
      <text x="6" y="20">Where the roses grow</text>
      <text x="6" y="38">The sky at the end of day</text>
    </g>
    <g stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
      <path d="M13 15h4M27 15h4M38 15h4M11 33h4M25 33h4"/>
    </g>
  </svg>`,
  configSchema: MISSING_VOWELS_CONFIG_SCHEMA,
  generate,
}
