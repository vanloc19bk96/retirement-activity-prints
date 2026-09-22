import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type {
  RetirementAnagramItem,
  RetirementAnagramResponse,
} from '@/types/studio-retirement-anagram.types'
import { STUDIO_BODY_SIZE } from '@/constants/studio.constants'
import { createRng, deriveSeed } from '../studio-rng'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { resolveRetirementTheme } from '../_shared/retirement-theme-config'
import {
  RETIREMENT_ANAGRAM_CONFIG_SCHEMA,
  instructionFor,
  validateRetirementAnagramConfig,
} from './config'
import {
  RETIREMENT_ANAGRAM_AI_EMPTY_MESSAGE,
  RETIREMENT_ANAGRAM_DEFAULT_TITLE,
  selectAiItems,
} from './content'
import { drawAnagramRows, type AnagramPuzzleItem } from './draw'
import { runAnagramKdpPreflight } from './kdp-preflight'
import {
  anagramBodyField,
  anagramContentBox,
  anagramPageLock,
  anagramWorstCasePlan,
  planAnagramPage,
  type AnagramPagePlan,
} from './layout'
import { parseAnagramLevel, type AnagramLevel } from './levels'
import { retirementAnagramPrefetch } from './prefetch'
import { isDictionaryWord, loadAnagramIndex, scrambleWord } from './scramble'
import { ANAGRAM_THEME_SALT } from './theme'

export { validateRetirementAnagramConfig }

const PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for an anagram page at this level. Pick a larger page in Settings, or a gentler level.'

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
  const header = drawHeader(anagramContentBox(ctx), config, tag, instructionFor(config))
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
 * Shuffle each answer into the letters the page prints.
 *
 * Every attempt is seeded from the sheet's own seed plus the row's position, so
 * row 3 is the same puzzle whether or not rows 1 and 2 were dropped for not
 * fitting the page — the alternative is a sheet that changes under a seller
 * when they pick a larger trim.
 *
 * A shuffle is rejected while it still reads as the answer, repeats a scramble
 * already on the page, or spells some other dictionary word: a solver handed
 * SILENT for LISTEN has been given a wrong answer in the prompt, and no clue
 * makes that fair.
 */
function buildPuzzleItems(
  items: readonly RetirementAnagramItem[],
  ctx: StudioGenerateContext,
  level: AnagramLevel,
): AnagramPuzzleItem[] {
  const index = loadAnagramIndex()
  const used = new Set<string>()

  return items.map((item, i) => {
    let chosen = item.answer
    let fallback = ''
    for (let attempt = 0; attempt < 24; attempt++) {
      const rng = createRng(deriveSeed(ctx.seed, `anagram:${i}:${attempt}`))
      const { scrambled } = scrambleWord(item.answer, index, rng, {
        preferDerangement: level.deranged,
      })
      if (scrambled === item.answer || used.has(scrambled)) continue
      // Keep the first usable shuffle in case every remaining one also spells
      // a word — an unused permutation always beats printing the answer.
      if (!fallback) fallback = scrambled
      if (isDictionaryWord(scrambled, index)) continue
      chosen = scrambled
      break
    }
    if (chosen === item.answer && fallback) chosen = fallback
    used.add(chosen)
    return { answer: item.answer, clue: item.clue, scrambled: chosen }
  })
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  plan: AnagramPagePlan
  items: readonly AnagramPuzzleItem[]
  font: string
  instruction: string
  level: AnagramLevel
}): StudioFabricObject[] {
  const { config, ctx, tag, plan, items, font, instruction, level } = options
  const header = drawHeader(anagramContentBox(ctx), config, tag, instruction)
  const objects = [...header.objects]
  drawAnagramRows(objects, {
    field: header.body,
    plan,
    items,
    font,
    tag,
    firstLetterGiven: level.firstLetterGiven,
  })
  return objects
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily)
  const level = parseAnagramLevel(config)
  const theme = resolveRetirementTheme(config, ctx.seed, ANAGRAM_THEME_SALT)
  const pageConfig = withThemeTitle(config, theme.label)
  const instruction = instructionFor(pageConfig)

  const tag: StudioTag = {
    templateKey: 'retirement-anagram',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const remote = ctx.remoteData as RetirementAnagramResponse | undefined
  const words = selectAiItems(remote?.items, { count: level.targetItems, level })
  if (words.length === 0) {
    return [errorPage(ctx, pageConfig, tag, RETIREMENT_ANAGRAM_AI_EMPTY_MESSAGE)]
  }

  // Measured against the heading and instruction this page will really carry,
  // so the count the form promised is the count the page prints — and so every
  // page of one book run holds the same number of words, whether its words came
  // back long or short.
  const promised = anagramWorstCasePlan({
    level,
    page: ctx,
    config: pageConfig,
    instruction,
    font,
  })
  if (!promised) {
    return [errorPage(ctx, pageConfig, tag, PAGE_TOO_SMALL_MESSAGE)]
  }

  // Pinned to the shape the promise measured, so every sheet of one run sets at
  // the same size in the same number of columns whatever its clues came back
  // like. Only the count may fall, and only if the real words need more room
  // than the worst case did.
  const plan = planAnagramPage({
    field: anagramBodyField(ctx, pageConfig, instruction),
    items: words,
    target: promised.itemCount,
    spec: { fontFamily: font },
    lock: anagramPageLock(promised),
  })
  if (!plan) {
    return [errorPage(ctx, pageConfig, tag, PAGE_TOO_SMALL_MESSAGE)]
  }

  const items = buildPuzzleItems(words.slice(0, plan.itemCount), ctx, level)

  const preflight = runAnagramKdpPreflight({ items, level, plan })
  if (!preflight.ok) {
    return [
      errorPage(
        ctx,
        pageConfig,
        tag,
        preflight.errors[0] ?? RETIREMENT_ANAGRAM_AI_EMPTY_MESSAGE,
      ),
    ]
  }

  const shared = { config: pageConfig, ctx, tag, plan, items, font, level }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({ ...shared, instruction }),
      // The solution is this same page with the words written onto the lines —
      // same scrambles, same clues, same slots — so a reader checking an answer
      // is looking at the row they just solved rather than a bare list.
      answerSourceObjects: layoutPage({ ...shared, instruction: '' }),
    },
  ]
}

export const retirementAnagramTemplate: StudioTemplateDefinition = {
  key: 'retirement-anagram',
  label: 'Anagrams',
  category: 'word',
  description:
    'Large-print retirement anagrams: pick a theme and a level, and the clue, letter size and number of words are sized for your page. Includes an answer page.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: RETIREMENT_ANAGRAM_DEFAULT_TITLE,
  validateConfig: validateRetirementAnagramConfig,
  prefetch: retirementAnagramPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="serif" font-size="8" fill="currentColor" letter-spacing="1.6">
      <text x="6" y="11">V E L T R A</text>
      <text x="6" y="29">D E N G R A</text>
    </g>
    <g font-family="sans-serif" font-size="4.5" fill="currentColor" opacity="0.6">
      <text x="6" y="18">Seeing new places</text>
      <text x="6" y="36">Where the roses grow</text>
    </g>
    <g stroke="currentColor" stroke-width="1" stroke-linecap="round">
      <path d="M6 21h4M12 21h4M18 21h4M24 21h4M30 21h4M36 21h4"/>
      <path d="M6 39h4M12 39h4M18 39h4M24 39h4M30 39h4M36 39h4"/>
    </g>
  </svg>`,
  configSchema: RETIREMENT_ANAGRAM_CONFIG_SCHEMA,
  generate,
}
