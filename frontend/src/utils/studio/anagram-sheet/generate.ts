import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioConfigValidationError,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { AnagramResponse } from '@/types/studio-anagram.types'
import { createRng, deriveSeed, type StudioRng } from '../studio-rng'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  scrambleWord,
  loadAnagramIndex,
  hasUniqueAnagram,
  type AnagramIndex,
} from './scramble'
import {
  resolveWords,
  clampItemCount,
  parseSource,
  parseDifficulty,
  sanitizeAnagramWords,
  defaultTitleFor,
  themeSelectOptions,
  isCustomAiTheme,
  resolveCustomThemeText,
  CUSTOM_THEME_MAX_LENGTH,
} from './words'
import { drawAnagramItems, type AnagramItem } from './draw'
import { anagramPrefetch } from './prefetch'

const INSTRUCTION =
  'Rearrange the letters in each row to spell a word. Write your answer on the line'

function withDefaultTitle(config: StudioConfig): StudioConfig {
  const title = defaultTitleFor(config)
  if (!title) return config
  return { ...config, title }
}

function pairsFromRemote(
  remote: AnagramResponse | undefined,
): { word: string }[] | null {
  if (!remote?.items?.length) return null
  const out: { word: string }[] = []
  for (const p of remote.items) {
    const word = String(p.word ?? '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
    if (word.length < 3 || word.length > 10) continue
    out.push({ word })
  }
  return out.length ? out : null
}

/** Keep only words whose letter-set has one common answer; optionally top up from theme. */
function keepUniqueAnswers(
  pairs: { word: string }[],
  index: AnagramIndex,
  options: {
    itemCount: number
    allowTopUp: boolean
    config: StudioConfig
    rng: StudioRng
  },
): { word: string }[] {
  const { itemCount, allowTopUp, config, rng } = options
  const seen = new Set<string>()
  const unique: { word: string }[] = []
  for (const p of pairs) {
    const word = p.word.toUpperCase().replace(/[^A-Z]/g, '')
    if (!word || seen.has(word)) continue
    if (!hasUniqueAnagram(word, index)) continue
    seen.add(word)
    unique.push({ word })
    if (unique.length >= itemCount) return unique
  }

  if (!allowTopUp || unique.length >= itemCount) {
    return unique.slice(0, itemCount)
  }

  const fill = resolveWords(
    { ...config, source: 'theme', theme: config.theme ?? 'animals' },
    itemCount,
    rng,
  )
  for (const p of fill) {
    const word = p.word.toUpperCase().replace(/[^A-Z]/g, '')
    if (!word || seen.has(word)) continue
    if (!hasUniqueAnagram(word, index)) continue
    seen.add(word)
    unique.push({ word })
    if (unique.length >= itemCount) break
  }
  return unique.slice(0, itemCount)
}

export function validateAnagramConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  if (parseSource(config.source) === 'custom') {
    const words = sanitizeAnagramWords(config.words)
    if (words.length < 5) {
      return {
        field: 'words',
        message: 'Enter at least 5 words (3–10 letters, A–Z only).',
      }
    }
    return null
  }

  if (!isCustomAiTheme(config)) return null
  if (!resolveCustomThemeText(config)) {
    return {
      field: 'customThemeText',
      message: 'Enter a custom theme, or turn off Custom theme.',
    }
  }
  if (String(config.customThemeText ?? '').trim().length > CUSTOM_THEME_MAX_LENGTH) {
    return {
      field: 'customThemeText',
      message: `Keep the custom theme under ${CUSTOM_THEME_MAX_LENGTH} characters.`,
    }
  }
  return null
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const source = parseSource(config.source)
  const itemCount = clampItemCount(config.itemCount)
  const difficulty = parseDifficulty(config.difficulty)
  const font = String(config.fontFamily)
  const rng = createRng(ctx.seed)

  let pairs: { word: string }[]
  if (source === 'theme') {
    const fromRemote = pairsFromRemote(ctx.remoteData as AnagramResponse | undefined)
    pairs = fromRemote?.length
      ? fromRemote
      : resolveWords(config, itemCount, rng)
  } else {
    pairs = resolveWords(config, itemCount, rng)
  }

  // Theme (AI): only keep letter-sets with one common answer.
  // Custom: keep the author's words as-is (still no “also:” on the key).
  const index = loadAnagramIndex()
  if (source !== 'custom') {
    pairs = keepUniqueAnswers(pairs, index, {
      itemCount,
      allowTopUp: true,
      config,
      rng,
    })
  } else {
    pairs = pairs.slice(0, Math.max(pairs.length, 1))
  }

  if (pairs.length === 0) {
    throw new Error('anagram-sheet: no valid words to scramble')
  }

  const preferDerangement = difficulty === 'hard'
  const items: AnagramItem[] = pairs.map((p, i) => {
    const r = createRng(deriveSeed(ctx.seed, `anagram:${i}`))
    const { scrambled } = scrambleWord(p.word, index, r, {
      preferDerangement,
    })
    return {
      answer: p.word.toUpperCase().replace(/[^A-Z]/g, ''),
      scrambled,
    }
  })

  const pageConfig = withDefaultTitle(config)
  const tag: StudioTag = {
    templateKey: 'anagram-sheet',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const layout = { config: pageConfig, ctx, tag, items, font }
  const objects = layoutPage({ ...layout, instruction: INSTRUCTION })
  // No how-to on the key — taller body, grid re-centered; column header = Answer.
  const answerSourceObjects = layoutPage({
    ...layout,
    instruction: '',
    forAnswerKey: true,
  })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
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
  drawAnagramItems(objects, header.body, items, font, tag, { forAnswerKey })
  return objects
}

export const anagramSheetTemplate: StudioTemplateDefinition = {
  key: 'anagram-sheet',
  label: 'Anagram Sheet',
  category: 'word',
  description:
    'Unscramble the letters to spell each word. Pick a theme and let AI choose fresh words, or supply your own list. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  validateConfig: validateAnagramConfig,
  prefetch: async (config, signal) => {
    if (parseSource(config.source) !== 'theme') return undefined
    return anagramPrefetch(config, signal)
  },
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="8" fill="currentColor" font-family="monospace" letter-spacing="2">
      <text x="4" y="12">T G R E I</text><text x="4" y="24">A E G L E</text><text x="4" y="36">N L O I</text>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'source',
      label: 'Words from',
      type: 'select',
      default: 'theme',
      options: [
        { label: 'A theme', value: 'theme' },
        { label: 'My own words', value: 'custom' },
      ],
    },
    {
      key: 'customTheme',
      label: 'Custom theme',
      type: 'toggle',
      default: false,
      visibleWhen: (c) => c.source === 'theme',
      help: 'Turn on to type a theme; AI invents fresh words for it.',
    },
    {
      key: 'theme',
      label: 'Theme',
      type: 'select',
      default: 'animals',
      options: themeSelectOptions(),
      visibleWhen: (c) => c.source === 'theme' && c.customTheme !== true,
      help: 'AI generates words for this theme so each sheet stays fresh.',
    },
    {
      key: 'customThemeText',
      label: 'Your theme',
      type: 'text',
      default: 'things at the beach',
      max: CUSTOM_THEME_MAX_LENGTH,
      visibleWhen: (c) => c.source === 'theme' && c.customTheme === true,
      help: 'Short phrase for AI words (e.g. camping trip, bakery). Max 120 characters.',
    },
    {
      key: 'words',
      label: 'Your words (one per line)',
      type: 'wordList',
      default: [],
      visibleWhen: (c) => c.source === 'custom',
      help: 'Type the answer words, one per line. 3–10 letters each.',
    },
    {
      key: 'itemCount',
      label: 'Number of words',
      type: 'number',
      default: 12,
      min: 5,
      max: 24,
      step: 1,
      visibleWhen: (c) => c.source !== 'custom',
    },
    {
      key: 'difficulty',
      label: 'Word length',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Easy (short words)', value: 'easy' },
        { label: 'Medium', value: 'medium' },
        { label: 'Hard (longer words)', value: 'hard' },
      ],
    },
  ],
  generate,
}
