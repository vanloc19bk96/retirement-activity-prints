import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioConfigValidationError,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, deriveSeed } from '../studio-rng'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import type { CryptogramResponse } from '@/types/studio-cryptogram.types'
import { buildCipher } from './cipher'
import {
  CUSTOM_THEME_MAX_LENGTH,
  defaultTitleFor,
  isCustomAiTheme,
  MAX_PUZZLES,
  MIN_PUZZLES,
  minCustomQuotes,
  parseSource,
  puzzleCountFor,
  resolveAiQuotes,
  resolveCustomThemeText,
  resolveQuotes,
  sanitizeQuotes,
  themeSelectOptions,
} from './content'
import { drawCryptograms, type CryptogramPuzzle } from './draw'
import { cryptogramPrefetch } from './prefetch'

const INSTRUCTION =
  'Every letter below stands for one letter of the alphabet, the same letter ' +
  'for the same letter each time. Write the letters on the lines to uncover the saying. ' +
  'No letter stands for itself'

export function validateCryptogramConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
  if (parseSource(config.source) === 'custom') {
    const lines = Array.isArray(config.quotes)
      ? config.quotes.map((line) => String(line).trim()).filter(Boolean)
      : String(config.quotes ?? '')
          .split(/\n/)
          .map((line) => line.trim())
          .filter(Boolean)
    if (lines.length > MAX_PUZZLES) {
      return {
        field: 'quotes',
        message: `Use at most ${MAX_PUZZLES} sayings (one per line).`,
      }
    }
    if (sanitizeQuotes(config.quotes).length >= minCustomQuotes()) return null
    return {
      field: 'quotes',
      message: 'Enter at least one saying of 12–78 letters (A–Z only).',
    }
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

function withDefaultTitle(config: StudioConfig): StudioConfig {
  const title = defaultTitleFor(config)
  return title ? { ...config, title } : config
}

function quotesFor(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  count: number,
): string[] {
  const rng = createRng(ctx.seed)
  if (parseSource(config.source) === 'custom') {
    return resolveQuotes(config, count, rng)
  }

  const remote = ctx.remoteData as CryptogramResponse | undefined
  return resolveAiQuotes({ remote: remote?.items, config, count, rng })
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  puzzles: CryptogramPuzzle[]
  font: string
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, puzzles, font, instruction } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  const objects = [...header.objects]
  drawCryptograms(objects, {
    field: header.body,
    puzzles,
    font,
    codeFont: STUDIO_DIGIT_FONT,
    tag,
  })
  return objects
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const puzzleCount = puzzleCountFor(config)
  const font = String(config.fontFamily)
  // Codes and written letters must share one even advance width.
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const quotes = quotesFor(config, ctx, puzzleCount)
  if (quotes.length === 0) {
    throw new Error('cryptogram: no usable sayings for this configuration')
  }

  const puzzles: CryptogramPuzzle[] = quotes.map((plain, i) => {
    // Per-puzzle sub-seed: each saying gets its own alphabet, as in a real book.
    const rng = createRng(deriveSeed(ctx.seed, `cipher:${i}`))
    return {
      plain,
      cipher: buildCipher(rng),
    }
  })

  const pageConfig = withDefaultTitle(config)
  const tag: StudioTag = {
    templateKey: 'cryptogram',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const layout = { config: pageConfig, ctx, tag, puzzles, font }
  const objects = layoutPage({ ...layout, instruction: INSTRUCTION })
  // No how-to on the key — taller body, puzzle groups re-centered.
  const answerSourceObjects = layoutPage({ ...layout, instruction: '' })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const cryptogramTemplate: StudioTemplateDefinition = {
  key: 'cryptogram',
  label: 'Cryptogram',
  category: 'word',
  description:
    'Crack a coded saying in which every letter stands for a different one, and no letter ever stands for itself. Pick a theme for AI-written sayings or bring your own. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  validateConfig: validateCryptogramConfig,
  prefetch: async (config, signal) => {
    if (parseSource(config.source) !== 'theme') return undefined
    return cryptogramPrefetch(config, signal)
  },
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="1">
      <path d="M6 16h7M16 16h7M26 16h7M40 16h7M50 16h7"/>
      <path d="M6 30h7M16 30h7M26 30h7M36 30h7M46 30h7"/>
    </g>
    <g font-family="monospace" font-size="6" fill="currentColor" text-anchor="middle">
      <text x="9.5" y="24">Q</text><text x="19.5" y="24">M</text><text x="29.5" y="24">B</text>
      <text x="43.5" y="24">X</text><text x="53.5" y="24">K</text>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'source',
      label: 'Content',
      type: 'select',
      default: 'theme',
      options: [
        { label: 'A theme', value: 'theme' },
        { label: 'My own sayings', value: 'custom' },
      ],
    },
    {
      key: 'customTheme',
      label: 'Custom theme',
      type: 'toggle',
      default: false,
      visibleWhen: (c) => c.source === 'theme',
      help: 'Turn on to type a theme; AI invents fresh sayings for it.',
    },
    {
      key: 'theme',
      label: 'Theme',
      type: 'select',
      default: 'proverbs',
      options: themeSelectOptions(),
      visibleWhen: (c) => c.source === 'theme' && c.customTheme !== true,
      help: 'AI generates sayings for this theme so each sheet stays fresh.',
    },
    {
      key: 'customThemeText',
      label: 'Your theme',
      type: 'text',
      default: 'everyday wisdom',
      max: CUSTOM_THEME_MAX_LENGTH,
      visibleWhen: (c) => c.source === 'theme' && c.customTheme === true,
      help: 'Short phrase for AI sayings (e.g. patience, country garden). Max 120 characters.',
    },
    {
      key: 'quotes',
      label: 'Your sayings (one per line)',
      type: 'wordList',
      default: [],
      visibleWhen: (c) => c.source === 'custom',
      placeholder:
        'PRACTICE MAKES PERFECT\nKNOWLEDGE IS POWER\nA KIND WORD GOES A LONG WAY',
      help: 'One puzzle per line, in the order you type them. Letters and spaces only, 12 to 78 letters per line, up to 4 sayings.',
    },
    {
      key: 'length',
      label: 'Saying length',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Short (quick win)', value: 'short' },
        { label: 'Medium', value: 'medium' },
        { label: 'Long (more letters to crack)', value: 'long' },
      ],
      visibleWhen: (c) => c.source !== 'custom',
    },
    {
      key: 'puzzleCount',
      label: 'Puzzles per page',
      type: 'number',
      default: 2,
      min: MIN_PUZZLES,
      max: MAX_PUZZLES,
      step: 1,
      visibleWhen: (c) => c.source !== 'custom',
    },
  ],
  generate,
}
