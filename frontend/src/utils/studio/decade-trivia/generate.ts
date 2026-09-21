import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type {
  DecadeTriviaResponse,
  TriviaItem,
} from '@/types/studio-decade-trivia.types'
import {
  contentBox,
  insetHorizontal,
  drawHeader,
  type Box,
} from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_INK_MUTED,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DEFAULT_FONT,
} from '@/constants/studio.constants'
import { decadeTriviaPrefetch } from './prefetch'
import {
  clampQuestionCount,
  DECADE_TRIVIA_CONFIG_SCHEMA,
  validateDecadeTriviaConfig,
} from './config'
import { resolveDecade } from './decade'
import { cleanAnswer, cleanSentence, isMultipleChoice } from './content'
import { BODY_BOTTOM_PAD, planTriviaPage } from './layout'
import { drawTriviaPage } from './draw'

const TEMPLATE_KEY = 'decade-trivia'

function instructionFor(decade: string): string {
  // Keep this short — a long wrap steals vertical space from large-print questions.
  return `How much do you remember about the ${decade}? Take your time. No rush, no score`
}

/**
 * Last line of defence before print. The backend validates facts; this drops
 * anything that would render as a broken question regardless of whether the
 * fact is right (empty text, an MC item whose answer is not among its options).
 */
function usableItems(items: TriviaItem[], limit: number): TriviaItem[] {
  const out: TriviaItem[] = []
  const seen = new Set<string>()

  for (const raw of items) {
    if (out.length >= limit) break
    const question = cleanSentence(raw.question)
    const answer = cleanAnswer(raw.answer)
    if (!question || !answer) continue

    const key = question.toLowerCase()
    if (seen.has(key)) continue

    const options = raw.options?.map((o) => cleanSentence(o)).filter(Boolean)
    const item: TriviaItem = { ...raw, question, answer, options }
    if (item.format === 'multiple-choice') {
      if (!isMultipleChoice(item)) continue
      const lowered = options!.map((o) => o.toLowerCase())
      if (new Set(lowered).size !== lowered.length) continue
      if (!lowered.includes(answer.toLowerCase())) continue
    } else {
      item.options = undefined
    }

    seen.add(key)
    out.push(item)
  }

  return out
}

function messagePage(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  message: string,
): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: TEMPLATE_KEY,
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
          text: message,
          fontFamily: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
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
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const data = ctx.remoteData as DecadeTriviaResponse | undefined

  const items = usableItems(
    data?.items ?? [],
    clampQuestionCount(config.questionCount),
  )
  if (items.length === 0) {
    return [
      messagePage(ctx, config, 'Trivia could not be generated. Please try again.'),
    ]
  }

  const decade = String(data?.decade || resolveDecade(config) || '1960s')
  const tag: StudioTag = {
    templateKey: TEMPLATE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instructionFor(decade))
  objects.push(...header.objects)

  // Leave air above the bottom margin guide so the last block is not flush to it.
  const body: Box = {
    ...header.body,
    height: Math.max(1, header.body.height - BODY_BOTTOM_PAD),
  }

  const layout = planTriviaPage({
    items,
    area: body,
    font: { fontFamily: font },
  })
  objects.push(...drawTriviaPage(layout, font, tag))

  return [{ pageRole: 'single', objects }]
}

export const decadeTriviaTemplate: StudioTemplateDefinition = {
  key: TEMPLATE_KEY,
  label: 'Decade Trivia',
  category: 'reminiscence',
  description:
    'Large-print nostalgia trivia on music, TV, films, products and everyday life. Pick a decade or type your own. Questions are AI-written and fact-checked, so spot-check before publishing. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  prefetch: decadeTriviaPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="11" fill="currentColor" font-family="serif" font-weight="700">
      <text x="6" y="16">60s</text></g>
    <g stroke="currentColor" stroke-width="1" fill="none"><path d="M6 24h52M6 32h40"/></g>
    <g font-size="6" fill="currentColor" font-family="sans-serif"><text x="34" y="14">?</text></g>
  </svg>`,
  configSchema: DECADE_TRIVIA_CONFIG_SCHEMA,
  validateConfig: validateDecadeTriviaConfig,
  generate,
}
