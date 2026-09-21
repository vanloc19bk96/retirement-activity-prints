import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import type { MemoryJournalRemoteData } from '@/types/studio-reflective-writing.types'
import { contentBox, insetHorizontal } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_INK_MUTED,
} from '@/constants/studio.constants'
import {
  buildReflectivePages,
  chunkPrompts,
} from '../reflective-writing/generate-core'
import { reflectivePrefetch } from '../reflective-writing/prefetch'
import { isCustomJournalTheme } from '../reflective-writing/theme'
import { CUSTOM_THEME_TEXT_MAX } from '../reflective-writing/copy'
import { MEMORY_JOURNAL_CONFIG_SCHEMA } from './config'

function errorPage(ctx: StudioGenerateContext, config: StudioConfig): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: 'memory-journal-prompt',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  return {
    pageRole: 'single',
    objects: [
      buildText(
        {
          left: content.left,
          top: content.top,
          text: 'Journal prompts could not be generated. Please try again.',
          fontFamily: String(config.fontFamily),
          fill: STUDIO_INK_MUTED,
          width: content.width,
        },
        tag,
        'decoration',
      ),
    ],
  }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const remote = ctx.remoteData as MemoryJournalRemoteData | undefined
  const prompts = remote?.prompts
  if (!prompts?.length) return [errorPage(ctx, config)]

  const promptsPerPage = Number(config.promptsPerPage ?? 1) === 2 ? 2 : 1

  return buildReflectivePages({
    mode: 'journal',
    templateKey: 'memory-journal-prompt',
    ctx,
    config,
    pages: chunkPrompts(prompts, promptsPerPage).slice(0, 1),
    showDateLine: config.showDateLine !== false,
    promptBlockLines: 2,
  })
}

export const memoryJournalPromptTemplate: StudioTemplateDefinition = {
  key: 'memory-journal-prompt',
  label: 'Memory Journal Prompt',
  category: 'reminiscence',
  description:
    'One open-ended prompt with a full page to answer it. Prompts are generated fresh, so a long journal never repeats itself. Large print for comfortable handwriting.',
  pageCount: 1,
  producesAnswerKey: false,
  prefetch: reflectivePrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="5" fill="currentColor" font-family="serif"><text x="6" y="10">What made you</text>
      <text x="6" y="17">smile today?</text></g>
    <g stroke="currentColor" stroke-width="0.6" fill="none" opacity="0.6">
      <path d="M6 24h52M6 30h52M6 36h52"/></g>
  </svg>`,
  configSchema: MEMORY_JOURNAL_CONFIG_SCHEMA,
  validateConfig: (config) => {
    if (!isCustomJournalTheme(config)) return null
    const text = String(config.customThemeText ?? '').trim()
    if (!text) {
      return {
        field: 'customThemeText',
        message: 'Enter a custom theme, or turn off Custom theme.',
      }
    }
    if (text.length > CUSTOM_THEME_TEXT_MAX) {
      return {
        field: 'customThemeText',
        message: `Keep the custom theme under ${CUSTOM_THEME_TEXT_MAX} characters.`,
      }
    }
    return null
  },
  generate,
}
