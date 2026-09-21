import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { RetirementAnagramResponse } from '@/types/studio-retirement-anagram.types'
import { createRng, deriveSeed } from '../studio-rng'
import { boxCenterX, contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import {
  loadAnagramIndex,
  scrambleWord,
} from '../anagram-sheet/scramble'
import { drawAnagramItems, type AnagramItem } from '../anagram-sheet/draw'
import {
  RETIREMENT_ANAGRAM_CONFIG_SCHEMA,
  validateRetirementAnagramConfig,
} from './config'
import {
  RETIREMENT_ANAGRAM_AI_EMPTY_MESSAGE,
  RETIREMENT_ANAGRAM_DEFAULT_TITLE,
  RETIREMENT_ANAGRAM_INSTRUCTION,
  clampItemCount,
  defaultTitleFor,
  parseDifficulty,
  selectAiWords,
} from './content'
import { retirementAnagramPrefetch } from './prefetch'

export { validateRetirementAnagramConfig }

const TABLE_HEADERS = {
  scrambleHeader: 'Scrambled Word',
  answerHeader: 'Your Answer',
  answerKeyHeader: 'Answer',
} as const

function withDefaultTitle(config: StudioConfig): StudioConfig {
  const title = defaultTitleFor(config)
  return title ? { ...config, title } : config
}

function errorPage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  tag: StudioTag,
  message: string,
): StudioPageOutput {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, RETIREMENT_ANAGRAM_INSTRUCTION)
  const fontSize = STUDIO_BODY_SIZE - 4
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
          fontSize,
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

function buildItems(
  words: string[],
  ctx: StudioGenerateContext,
  preferDerangement: boolean,
): AnagramItem[] {
  const index = loadAnagramIndex()
  const usedScrambles = new Set<string>()
  return words.map((word, i) => {
    let scrambled = word
    for (let attempt = 0; attempt < 8; attempt++) {
      const rng = createRng(deriveSeed(ctx.seed, `anagram:${i}:${attempt}`))
      const result = scrambleWord(word, index, rng, { preferDerangement })
      scrambled = result.scrambled
      if (scrambled !== word && !usedScrambles.has(scrambled)) break
    }
    usedScrambles.add(scrambled)
    return { answer: word, scrambled }
  })
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  items: AnagramItem[]
  font: string
  instruction: string
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, items, font, instruction, forAnswerKey = false } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  const objects = [...header.objects]
  drawAnagramItems(objects, header.body, items, font, tag, {
    forAnswerKey,
    ...TABLE_HEADERS,
  })
  return objects
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const itemCount = clampItemCount(config.itemCount)
  const difficulty = parseDifficulty(config.difficulty)
  const font = String(config.fontFamily)
  const pageConfig = withDefaultTitle(config)
  const tag: StudioTag = {
    templateKey: 'retirement-anagram',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const remote = ctx.remoteData as RetirementAnagramResponse | undefined
  const words = selectAiWords(remote?.items, { count: itemCount, difficulty })
  if (words.length < itemCount) {
    return [errorPage(ctx, pageConfig, tag, RETIREMENT_ANAGRAM_AI_EMPTY_MESSAGE)]
  }

  const items = buildItems(words, ctx, difficulty === 'hard')
  const layout = { config: pageConfig, ctx, tag, items, font }
  const objects = layoutPage({ ...layout, instruction: RETIREMENT_ANAGRAM_INSTRUCTION })
  const answerSourceObjects = layoutPage({
    ...layout,
    instruction: '',
    forAnswerKey: true,
  })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const retirementAnagramTemplate: StudioTemplateDefinition = {
  key: 'retirement-anagram',
  label: 'Retirement Anagrams',
  category: 'word',
  description:
    'Unscramble retirement-themed words. AI invents a fresh list for any topic. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: RETIREMENT_ANAGRAM_DEFAULT_TITLE,
  validateConfig: validateRetirementAnagramConfig,
  prefetch: retirementAnagramPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="7" fill="currentColor" font-family="monospace" letter-spacing="1">
      <text x="4" y="12">VELTRA</text><text x="40" y="12">____</text>
      <text x="4" y="24">DENGAR</text><text x="40" y="24">____</text>
      <text x="4" y="36">SIONPEN</text><text x="40" y="36">____</text>
    </g>
  </svg>`,
  configSchema: RETIREMENT_ANAGRAM_CONFIG_SCHEMA,
  generate,
}
