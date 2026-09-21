import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { CategoryFluencyResponse } from '@/types/studio-category-fluency.types'
import {
  contentBox,
  splitTop,
  insetHorizontal,
  drawHeader,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
} from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_INK_MUTED,
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { categoryFluencyPrefetch } from './prefetch'
import { assembleCategoryExamples } from './fallback'
import {
  clampLineCount,
  clampTimeLimit,
  drawExampleAnswers,
  drawWriteInLines,
  estimateCategoryBannerWidth,
  fitCategoryBannerSize,
  instructionFor,
} from './draw'

const BANNER_H = 40
/** Air between the category banner and the write-in grid. */
const BANNER_TO_GRID_GAP = 48
const SCORE_H = 56

function errorPage(ctx: StudioGenerateContext, config: StudioConfig): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: 'category-fluency',
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
          text: 'Category could not be generated. Please try again.',
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

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const lineCount = clampLineCount(config.lineCount)
  const timeLimit = clampTimeLimit(config.timeLimit)
  const font = String(config.fontFamily)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const data = ctx.remoteData as CategoryFluencyResponse | undefined
  if (!data?.category?.trim() || !data.examples?.length) {
    return [errorPage(ctx, config)]
  }

  const category = data.category.trim()
  const examples = assembleCategoryExamples(
    data.examples,
    lineCount,
    ctx.seed,
    category,
  )
  if (!examples.length) return [errorPage(ctx, config)]

  const tag: StudioTag = {
    templateKey: 'category-fluency',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instructionFor(category, timeLimit))
  objects.push(...header.objects)

  const scoreH = Math.min(SCORE_H, Math.max(40, header.body.height * 0.12))
  const [mainArea, scoreArea] = splitTop(header.body, header.body.height - scoreH)
  const bannerStripH = Math.min(
    BANNER_H + BANNER_TO_GRID_GAP,
    Math.max(BANNER_H, mainArea.height * 0.18),
  )
  const [bannerStrip, linesArea] = splitTop(mainArea, bannerStripH)
  const banner = { ...bannerStrip, height: Math.min(BANNER_H, bannerStrip.height) }

  const bannerText = category.toUpperCase()
  const bannerSize = fitCategoryBannerSize(bannerText, banner.width)
  objects.push(
    buildText(
      {
        left: boxCenterX(banner),
        top: boxCenterY(banner),
        text: bannerText,
        width: estimateCategoryBannerWidth(bannerText, bannerSize, banner.width),
        fontFamily: font,
        fontSize: bannerSize,
        fontWeight: 700,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'prompt',
    ),
  )

  drawWriteInLines(objects, linesArea, lineCount, font, tag)

  const scoreText = `Time: ${timeLimit}s        I wrote: ______`
  const scoreSize = STUDIO_BODY_SIZE * 0.95
  objects.push(
    buildText(
      {
        left: boxCenterX(scoreArea),
        top: boxCenterY(scoreArea),
        text: scoreText,
        width: estimateTextBoxWidth(scoreText, scoreSize, scoreArea.width),
        fontFamily: font,
        fontSize: scoreSize,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'decoration',
    ),
  )

  // Hidden on the puzzle page; solution page reveals this reference list alone.
  drawExampleAnswers(objects, header.body, examples, font, tag)

  return [{ pageRole: 'single', objects }]
}

export const categoryFluencyTemplate: StudioTemplateDefinition = {
  key: 'category-fluency',
  label: 'Category Fluency',
  category: 'word',
  description:
    'Write as many things from a category as you can before time runs out. Categories are fresh every time, and the answer key lists sample answers for self-checking.',
  pageCount: 1,
  producesAnswerKey: true,
  prefetch: categoryFluencyPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="6" fill="currentColor" font-family="sans-serif"><text x="6" y="10">ANIMALS</text></g>
    <g stroke="currentColor" stroke-width="1" fill="none"><path d="M6 18h20M6 26h20M6 34h20M34 18h20M34 26h20"/></g>
    <g font-size="5" fill="currentColor" font-family="sans-serif"><text x="30" y="20">1</text></g>
  </svg>`,
  configSchema: [
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'standard',
      options: [
        { label: 'Easy (very common category)', value: 'easy' },
        { label: 'Standard', value: 'standard' },
        { label: 'Hard (more specific category)', value: 'hard' },
      ],
      help: 'Harder = a more specific or unusual category.',
    },
    {
      key: 'categoryHint',
      label: 'Category idea (optional)',
      type: 'text',
      default: '',
      max: 120,
      help: 'Leave blank to let it choose, or suggest a topic (e.g. “things in a garden”).',
    },
    {
      key: 'lineCount',
      label: 'Answer lines',
      type: 'number',
      default: 15,
      min: 8,
      max: 30,
      step: 1,
      help: 'How many write-in lines to print (a target, not a limit).',
    },
    {
      key: 'timeLimit',
      label: 'Time limit',
      type: 'select',
      default: 60,
      options: [
        { label: '60 seconds (standard)', value: 60 },
        { label: '90 seconds', value: 90 },
        { label: '2 minutes', value: 120 },
      ],
    },
  ],
  generate,
}
