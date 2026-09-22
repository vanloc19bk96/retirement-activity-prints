import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { MissingVowelsResponse } from '@/types/studio-missing-vowels.types'
import { createRng } from '../studio-rng'
import { boxCenterX, contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import { parsePrintStyle } from '../_shared/retirement-theme-config'
import {
  MISSING_VOWELS_CONFIG_SCHEMA,
  validateMissingVowelsConfig,
} from './config'
import {
  MISSING_VOWELS_AI_EMPTY_MESSAGE,
  MISSING_VOWELS_DEFAULT_TITLE,
  clampItemCount,
  defaultTitleFor,
  instructionFor,
  parseDifficulty,
  selectAiItems,
  shuffleItems,
} from './content'
import { drawMvItems } from './draw'
import { missingVowelsPrefetch } from './prefetch'

export { validateMissingVowelsConfig }

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
  const header = drawHeader(content, config, tag, instructionFor(config))
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

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  items: ReturnType<typeof selectAiItems>
  font: string
  instruction: string
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, items, font, instruction, forAnswerKey = false } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  const objects = [...header.objects]
  drawMvItems(objects, header.body, items, font, tag, {
    forAnswerKey,
    printStyle: parsePrintStyle(config.printStyle),
  })
  return objects
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const itemCount = clampItemCount(config.itemCount)
  const difficulty = parseDifficulty(config.difficulty)
  const font = String(config.fontFamily)
  const pageConfig = withDefaultTitle(config)
  const tag: StudioTag = {
    templateKey: 'missing-vowels',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const remote = ctx.remoteData as MissingVowelsResponse | undefined
  const selected = selectAiItems(remote?.items, { count: itemCount, difficulty })
  if (selected.length < itemCount) {
    return [errorPage(ctx, pageConfig, tag, MISSING_VOWELS_AI_EMPTY_MESSAGE)]
  }

  const items = shuffleItems(selected, createRng(ctx.seed))
  const layout = { config: pageConfig, ctx, tag, items, font }
  const objects = layoutPage({
    ...layout,
    instruction: instructionFor(pageConfig),
  })
  const answerSourceObjects = layoutPage({
    ...layout,
    instruction: '',
    forAnswerKey: true,
  })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const missingVowelsTemplate: StudioTemplateDefinition = {
  key: 'missing-vowels',
  label: 'Missing Vowels',
  category: 'word',
  description:
    'Add the missing vowels to complete each retirement-themed word or phrase. AI writes a fresh list for any theme. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: MISSING_VOWELS_DEFAULT_TITLE,
  validateConfig: validateMissingVowelsConfig,
  prefetch: missingVowelsPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="7" fill="currentColor" font-family="monospace">
      <text x="2" y="12">G_RD_N_NG</text>
      <text x="2" y="24">R__D TR_P</text>
      <text x="2" y="36">FR__ T_M_</text>
    </g>
  </svg>`,
  configSchema: MISSING_VOWELS_CONFIG_SCHEMA,
  generate,
}
