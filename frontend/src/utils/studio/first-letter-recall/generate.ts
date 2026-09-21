import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { FirstLetterRecallResponse } from '@/types/studio-first-letter-recall.types'
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
import { firstLetterRecallPrefetch } from './prefetch'
import { assembleFirstLetterExamples } from './fallback'
import {
  clampLineCount,
  clampTimeLimit,
  letterOptions,
  resolveLetters,
  instructionFor,
  drawWriteInLines,
  drawExampleIntro,
  drawExampleAnswers,
} from './draw'

const BANNER_H = 48
/** Air between the letter banner and the write-in grid. */
const BANNER_TO_GRID_GAP = 48
const SCORE_H = 56

function examplesForLetter(
  remote: FirstLetterRecallResponse | undefined,
  letter: string,
  seed: number,
  lineCount: number,
): string[] {
  const fromRemote = remote?.byLetter?.[letter]
  return assembleFirstLetterExamples(fromRemote, letter, seed, lineCount)
}

function errorPage(ctx: StudioGenerateContext, config: StudioConfig): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: 'first-letter-recall',
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
          text: 'Sample answers could not be generated. Please try again.',
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

function buildLetterPage(
  letter: string,
  config: StudioConfig,
  ctx: StudioGenerateContext,
  lineCount: number,
  timeLimit: number,
  font: string,
  examples: string[],
): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: 'first-letter-recall',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instructionFor(letter, timeLimit))
  objects.push(...header.objects)

  const scoreH = Math.min(SCORE_H, Math.max(40, header.body.height * 0.12))
  const [mainArea, scoreArea] = splitTop(header.body, header.body.height - scoreH)
  const bannerStripH = Math.min(
    BANNER_H + BANNER_TO_GRID_GAP,
    Math.max(BANNER_H, mainArea.height * 0.18),
  )
  const [bannerStrip, linesArea] = splitTop(mainArea, bannerStripH)
  const banner = { ...bannerStrip, height: Math.min(BANNER_H, bannerStrip.height) }

  const bannerText = `Letter:  ${letter}`
  const bannerSize = STUDIO_BODY_SIZE * 1.5
  objects.push(
    buildText(
      {
        left: boxCenterX(banner),
        top: boxCenterY(banner),
        text: bannerText,
        width: estimateTextBoxWidth(bannerText, bannerSize, banner.width),
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

  // Hidden on the puzzle page; solution reveals intro in the banner slot
  // and sample words in the same grid as the write-in lines.
  drawExampleIntro(objects, banner, font, tag)
  drawExampleAnswers(objects, linesArea, examples, font, tag)

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

  return { pageRole: 'single', objects }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const lineCount = clampLineCount(config.lineCount)
  const timeLimit = clampTimeLimit(config.timeLimit)
  const font = String(config.fontFamily)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  const letters = resolveLetters(config, ctx.seed)
  const remote = ctx.remoteData as FirstLetterRecallResponse | undefined

  return letters.map((letter) => {
    const examples = examplesForLetter(remote, letter, ctx.seed, lineCount)
    if (!examples.length) return errorPage(ctx, config)
    return buildLetterPage(letter, config, ctx, lineCount, timeLimit, font, examples)
  })
}

export const firstLetterRecallTemplate: StudioTemplateDefinition = {
  key: 'first-letter-recall',
  label: 'First Letter Recall',
  category: 'word',
  description:
    'Write as many words as you can that start with a given letter before time runs out. The answer key lists sample words for self-checking.',
  pageCount: 1,
  producesAnswerKey: true,
  prefetch: firstLetterRecallPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="14" fill="currentColor" font-family="serif" font-weight="700"><text x="6" y="26">F</text></g>
    <g stroke="currentColor" stroke-width="1" fill="none"><path d="M22 16h36M22 24h36M22 32h36"/></g>
    <g font-size="5" fill="currentColor" font-family="sans-serif"><text x="18" y="18">1</text></g>
  </svg>`,
  configSchema: [
    {
      key: 'letterMode',
      label: 'Letter',
      type: 'select',
      default: 'random',
      options: [
        { label: 'Pick for me', value: 'random' },
        { label: 'Choose a letter', value: 'fixed' },
      ],
    },
    {
      key: 'fixedLetter',
      label: 'Which letter',
      type: 'select',
      default: 'F',
      options: letterOptions(),
      visibleWhen: (c) => c.letterMode === 'fixed',
    },
    {
      key: 'lineCount',
      label: 'Answer lines',
      type: 'number',
      default: 15,
      min: 8,
      max: 30,
      step: 1,
      help: 'Write-in lines on the puzzle; the solution lists this many sample answers.',
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
