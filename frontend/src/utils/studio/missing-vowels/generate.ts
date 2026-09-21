import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioConfigValidationError,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { MissingVowelsResponse } from '@/types/studio-missing-vowels.types'
import { createRng } from '../studio-rng'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { promptWithBlanks } from './disemvowel'
import {
  resolveContent,
  clampItemCount,
  parseDifficulty,
  sanitizeMvItems,
  defaultTitleFor,
  themeDisplayLabel,
  themeSelectOptions,
  isCustomAiTheme,
  resolveCustomThemeText,
  CUSTOM_THEME_MAX_LENGTH,
} from './content'
import { drawMvItems, type MvItem } from './draw'
import { missingVowelsPrefetch } from './prefetch'

function instructionFor(includeY: boolean, themeLabel: string): string {
  const vowelList = includeY ? 'A, E, I, O, U, and Y' : 'A, E, I, O, U'
  const themeNote = themeLabel ? `. The theme is ${themeLabel}` : ''
  return (
    `Each row is a word with blanks where vowels (${vowelList}) belong. ` +
    `Write the missing vowels on the blanks${themeNote}`
  )
}

function withDefaultTitle(config: StudioConfig): StudioConfig {
  const title = defaultTitleFor(config)
  if (!title) return config
  return { ...config, title }
}

function itemsFromRemote(remote: MissingVowelsResponse | undefined): string[] | null {
  if (!remote?.items?.length) return null
  // AI is words-only — drop any phrase lines the model may return.
  const cleaned = sanitizeMvItems(remote.items, false)
  return cleaned.length ? cleaned : null
}

export function validateMissingVowelsConfig(
  config: StudioConfig,
): StudioConfigValidationError | null {
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
  const itemCount = clampItemCount(config.itemCount)
  const difficulty = parseDifficulty(config.difficulty)
  const includeY = difficulty === 'hard'
  const font = String(config.fontFamily)
  const rng = createRng(ctx.seed)

  const fromRemote = itemsFromRemote(ctx.remoteData as MissingVowelsResponse | undefined)
  const answers: string[] = []
  const seen = new Set<string>()
  for (const word of fromRemote ?? []) {
    if (seen.has(word)) continue
    seen.add(word)
    answers.push(word)
    if (answers.length >= itemCount) break
  }
  if (answers.length < itemCount) {
    for (const word of resolveContent(config, itemCount, rng)) {
      if (seen.has(word)) continue
      seen.add(word)
      answers.push(word)
      if (answers.length >= itemCount) break
    }
  }

  if (answers.length === 0) {
    throw new Error('missing-vowels: no valid words')
  }

  const items: MvItem[] = answers.map((raw) => {
    const answer = raw.trim()
    return {
      answer,
      prompt: promptWithBlanks(answer, includeY),
    }
  })

  const pageConfig = withDefaultTitle(config)
  const tag: StudioTag = {
    templateKey: 'missing-vowels',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const layout = { config: pageConfig, ctx, tag, items, font }
  const objects = layoutPage({
    ...layout,
    instruction: instructionFor(includeY, themeDisplayLabel(config)),
  })
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
  items: MvItem[]
  font: string
  instruction: string
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, items, font, instruction, forAnswerKey = false } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  const objects = [...header.objects]
  drawMvItems(objects, header.body, items, font, tag, { forAnswerKey })
  return objects
}

export const missingVowelsTemplate: StudioTemplateDefinition = {
  key: 'missing-vowels',
  label: 'Missing Vowels',
  category: 'word',
  description:
    'Every vowel has been taken out. Put them back to reveal each word. Pick a theme and AI chooses fresh words. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  validateConfig: validateMissingVowelsConfig,
  prefetch: async (config, signal) => missingVowelsPrefetch(config, signal),
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="7" fill="currentColor" font-family="monospace">
      <text x="2" y="12">T __ G __ R</text>
      <text x="2" y="24">__ L __ P H __ N T</text>
      <text x="2" y="36">G __ R __ F F __</text>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'customTheme',
      label: 'Custom theme',
      type: 'toggle',
      default: false,
      help: 'Turn on to type a theme; AI invents fresh words for it.',
    },
    {
      key: 'theme',
      label: 'Theme',
      type: 'select',
      default: 'animals',
      options: themeSelectOptions(),
      visibleWhen: (c) => c.customTheme !== true,
      help: 'AI generates words for this theme so each sheet stays fresh.',
    },
    {
      key: 'customThemeText',
      label: 'Your theme',
      type: 'text',
      default: 'things at the beach',
      max: CUSTOM_THEME_MAX_LENGTH,
      visibleWhen: (c) => c.customTheme === true,
      help: 'Short phrase for AI words (e.g. camping trip, bakery). Max 120 characters.',
    },
    {
      key: 'itemCount',
      label: 'Number of words',
      type: 'number',
      default: 12,
      min: 5,
      max: 24,
      step: 1,
    },
    {
      key: 'difficulty',
      label: 'Word length',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Easy (short words)', value: 'easy' },
        { label: 'Medium', value: 'medium' },
        { label: 'Hard (longer words / remove Y too)', value: 'hard' },
      ],
    },
  ],
  generate,
}
