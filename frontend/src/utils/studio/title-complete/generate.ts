import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { TitleCompleteResponse, TitleItem } from '@/types/studio-title-complete.types'
import {
  contentBox,
  insetHorizontal,
  drawHeader,
  splitTop,
  boxCenterX,
  estimateTextBoxWidth,
  type Box,
} from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_INK_MUTED,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_BODY_SIZE,
  STUDIO_INSTRUCTION_GAP,
} from '@/constants/studio.constants'
import { titleCompletePrefetch } from './prefetch'
import { TITLE_COMPLETE_CONFIG_SCHEMA } from './config'
import {
  CUSTOM_CATEGORY_MAX,
  categoryDisplayLabel,
  isCustomCategory,
} from './category'
import { CUSTOM_ERA_MAX, isCustomEra, normalizeEraLabel } from './era'
import { drawTitleCompleteItems, LARGE_PRINT } from './draw'

const INSTRUCTION =
  'Fill in the missing word to complete each title'
const CATEGORY_SIZE = Math.round(STUDIO_BODY_SIZE * 0.95)
const CATEGORY_STRIP_H = CATEGORY_SIZE + STUDIO_INSTRUCTION_GAP

function errorPage(ctx: StudioGenerateContext, config: StudioConfig): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: 'title-complete',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  return {
    pageRole: 'single',
    objects: [
      buildText(
        {
          left: ctx.margin.left,
          top: ctx.margin.top,
          text: 'Titles could not be generated. Please try again.',
          fontFamily: String(config.fontFamily),
          fill: STUDIO_INK_MUTED,
          width: ctx.pageWidth - ctx.margin.left - ctx.margin.right,
        },
        tag,
        'decoration',
      ),
    ],
  }
}

function pushCategoryLabel(
  objects: StudioFabricObject[],
  field: Box,
  config: StudioConfig,
  font: string,
  tag: StudioTag,
): Box {
  const label = categoryDisplayLabel(config)
  if (!label) return field

  const [strip, rest] = splitTop(field, Math.min(CATEGORY_STRIP_H, field.height * 0.2))
  objects.push(
    buildText(
      {
        left: boxCenterX(strip),
        top: strip.top,
        text: label,
        width: estimateTextBoxWidth(label, CATEGORY_SIZE, strip.width),
        fontFamily: font,
        fontSize: CATEGORY_SIZE,
        fontWeight: 700,
        textAlign: 'center',
        originX: 'center',
      },
      tag,
      'decoration',
    ),
  )
  return rest
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  items: TitleItem[]
  font: string
  instruction: string
  forAnswerKey?: boolean
}): StudioFabricObject[] {
  const { config, ctx, tag, items, font, instruction, forAnswerKey = false } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  const objects = [...header.objects]
  // Category under the how-to so solvers know the genre before the grid.
  const body = pushCategoryLabel(objects, header.body, config, font, tag)
  drawTitleCompleteItems(objects, body, items, font, tag, config, { forAnswerKey })
  return objects
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const data = ctx.remoteData as TitleCompleteResponse | undefined
  if (!data?.items?.length) return [errorPage(ctx, config)]

  const itemCount = Math.min(20, Math.max(6, Number(config.itemCount ?? 12)))
  const items = data.items.slice(0, itemCount)
  const font = String(config.fontFamily)

  const tag: StudioTag = {
    templateKey: 'title-complete',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const layout = { config, ctx, tag, items, font }
  const objects = layoutPage({ ...layout, instruction: INSTRUCTION })
  // No how-to on the key — taller body; index + answer centered in each cell.
  const answerSourceObjects = layoutPage({
    ...layout,
    instruction: '',
    forAnswerKey: true,
  })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const titleCompleteTemplate: StudioTemplateDefinition = {
  key: 'title-complete',
  label: 'Title Complete',
  category: 'reminiscence',
  description:
    'Fill in the missing words of famous song, film and TV titles from memory. Pick a category and era, or type your own. Titles are printed for identification only, never lyrics, so the book stays independent of any artist or studio. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  prefetch: titleCompletePrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="6" fill="currentColor" font-family="serif">
      <text x="2" y="12">1. ___</text>
      <text x="2" y="24">2. ___</text>
      <text x="34" y="12">3. ___</text>
      <text x="34" y="24">4. ___</text>
    </g>
  </svg>`,
  configSchema: TITLE_COMPLETE_CONFIG_SCHEMA,
  validateConfig: (config) => {
    if (isCustomCategory(config)) {
      const raw = String(config.customCategoryText ?? '').trim()
      if (!raw) {
        return {
          field: 'customCategoryText',
          message: 'Enter a category, or turn off Custom category.',
        }
      }
      if (raw.length > CUSTOM_CATEGORY_MAX) {
        return {
          field: 'customCategoryText',
          message: `Keep the category under ${CUSTOM_CATEGORY_MAX} characters.`,
        }
      }
    }
    if (!isCustomEra(config)) return null
    const raw = String(config.customEraText ?? '').trim()
    if (!raw) {
      return {
        field: 'customEraText',
        message: 'Enter an era, or turn off Custom era.',
      }
    }
    if (raw.length > CUSTOM_ERA_MAX) {
      return {
        field: 'customEraText',
        message: `Keep the era under ${CUSTOM_ERA_MAX} characters.`,
      }
    }
    if (!normalizeEraLabel(raw)) {
      return {
        field: 'customEraText',
        message: 'Use a decade like 1940s or 2010s.',
      }
    }
    return null
  },
  generate,
}

export { LARGE_PRINT }
