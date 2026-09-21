import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { StoryRecallResponse } from '@/types/studio-story.types'
import {
  boxBottom,
  contentBox,
  drawHeader,
  estimateTextBoxWidth,
  insetHorizontal,
  rows,
  type Box,
} from '../studio-layout'
import { buildText, buildLine, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE_LIGHT,
} from '@/constants/studio.constants'
import { storyRecallPrefetch } from './prefetch'

const STUDY_INSTRUCTION = 'Read the story twice. Then turn the page. Do not look back'
const RECALL_INSTRUCTION = 'Answer from memory. Do not look back at the story'
/** ~1.5× body leading reads like Amazon KDP paperback interiors (not Fabric’s default 1). */
const STUDY_LEADING = 1.5
/** Same preferred size for short/medium/long — length only changes word count, not type. */
const PREFERRED_BODY_SIZE = STUDIO_BODY_SIZE * 0.85
const MIN_BODY_SIZE = STUDIO_BODY_SIZE * 0.65

function estimatePassageHeight(passage: string, box: Box, fontSize: number): number {
  const charsPerLine = Math.max(1, Math.floor(box.width / (fontSize * 0.55)))
  const lineCount = Math.max(1, Math.ceil(passage.length / charsPerLine))
  return lineCount * fontSize * STUDY_LEADING
}

/** Shrink only when the passage does not fit — never pre-scale by length preset. */
function fitStudyFontSize(passage: string, box: Box): number {
  let fontSize = PREFERRED_BODY_SIZE
  while (fontSize > MIN_BODY_SIZE) {
    if (estimatePassageHeight(passage, box, fontSize) <= box.height) return fontSize
    fontSize -= 1
  }
  return MIN_BODY_SIZE
}

/** Optical vertical center in the study body (never above body.top). */
function studyPassageTop(box: Box, passageHeight: number): number {
  return box.top + Math.max(0, (box.height - passageHeight) / 2)
}

/** Cap at the study passage size; shrink further only when the question row is too short. */
function recallFontSize(rowHeight: number, preferredSize: number): number {
  const fitted = rowHeight / 5
  return Math.max(MIN_BODY_SIZE, Math.min(preferredSize, fitted))
}

function errorPage(ctx: StudioGenerateContext, config: StudioConfig): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: 'story-recall',
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
          text: 'Story could not be generated. Please try again.',
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

function buildStudyPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  data: StoryRecallResponse,
  font: string,
): { page: StudioPageOutput; fontSize: number } {
  const objects: StudioFabricObject[] = []
  const cfg = { ...config, title: String(config.title || data.title) }
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, cfg, tag, STUDY_INSTRUCTION)
  objects.push(...header.objects)

  const fontSize = fitStudyFontSize(data.passage, header.body)
  const passageHeight = estimatePassageHeight(data.passage, header.body, fontSize)
  objects.push(
    buildText(
      {
        left: header.body.left,
        top: studyPassageTop(header.body, passageHeight),
        text: data.passage,
        width: header.body.width,
        fontFamily: font,
        fontSize,
        lineHeight: STUDY_LEADING,
        textAlign: 'left',
      },
      tag,
      'prompt',
    ),
  )
  return { page: { pageRole: 'study', objects }, fontSize }
}

function buildRecallPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  data: StoryRecallResponse,
  font: string,
  preferredFontSize: number,
): StudioPageOutput {
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, RECALL_INSTRUCTION)
  objects.push(...header.objects)

  // Partition the body like sequence-recall / n-back — never stack past the safe bottom.
  const count = Math.max(1, data.questions.length)
  const gutter = Math.min(16, header.body.height / (count * 8))
  const qRows = rows(header.body, count, gutter)

  data.questions.forEach((q, i) => {
    const row = qRows[i]
    if (!row) return

    const fontSize = recallFontSize(row.height, preferredFontSize)
    const padY = Math.min(8, row.height * 0.06)
    const questionTop = row.top + padY

    objects.push(
      buildText(
        {
          left: row.left,
          top: questionTop,
          text: `${i + 1}. ${q.question}`,
          width: row.width,
          fontFamily: font,
          fontSize,
        },
        tag,
        'prompt',
      ),
    )

    const linesTop = questionTop + fontSize * 1.5
    const linesBottom = boxBottom(row) - padY
    const span = Math.max(fontSize, linesBottom - linesTop)
    const lineYs = [linesTop + span * 0.35, linesTop + span * 0.85]

    // Model answer sits on the first ruled line (hidden until answer-key reveal).
    const answerText = q.answer.trim()
    objects.push(
      buildText(
        {
          left: row.left,
          top: lineYs[0]! - fontSize * 0.15,
          text: answerText,
          width: estimateTextBoxWidth(answerText, fontSize, row.width),
          fontFamily: font,
          fontSize,
          fontStyle: 'italic',
          fill: STUDIO_INK,
        },
        tag,
        'answer',
      ),
    )

    for (const y of lineYs) {
      objects.push(
        buildLine(
          {
            x1: row.left,
            y1: y,
            x2: row.left + row.width,
            y2: y,
            stroke: STUDIO_RULE_LIGHT,
          },
          tag,
          'structure',
        ),
      )
    }
  })

  return { pageRole: 'recall', objects }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const data = ctx.remoteData as StoryRecallResponse | undefined
  if (!data?.passage || !data.questions?.length) {
    return [errorPage(ctx, config)]
  }

  const font = String(config.fontFamily)
  const studyTag: StudioTag = {
    templateKey: 'story-recall',
    instanceId: ctx.instanceId,
    pageRole: 'study',
  }
  const recallTag: StudioTag = { ...studyTag, pageRole: 'recall' }
  const study = buildStudyPage(config, ctx, studyTag, data, font)

  return [
    study.page,
    buildRecallPage(config, ctx, recallTag, data, font, study.fontSize),
  ]
}

export const storyRecallTemplate: StudioTemplateDefinition = {
  key: 'story-recall',
  label: 'Story Recall',
  category: 'memory',
  description:
    'Read a short story, then answer questions about it from memory on the next page. Stories are written fresh by AI, so no two pages repeat. Includes an answer key.',
  pageCount: 2,
  producesAnswerKey: true,
  prefetch: storyRecallPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="4" y="4" width="26" height="32"/><rect x="34" y="4" width="26" height="32"/>
      <path d="M8 12h18M8 18h18M8 24h14"/>
      <path d="M38 12h18M38 20h18M38 28h18" stroke-dasharray="2 2"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'customTheme',
      label: 'Custom theme',
      type: 'toggle',
      default: false,
      help: 'Turn on to type your own story theme instead of picking a preset.',
    },
    {
      key: 'theme',
      label: 'Theme',
      type: 'select',
      default: 'everyday life',
      visibleWhen: (c) => c.customTheme !== true,
      options: [
        { label: 'Everyday life', value: 'everyday life' },
        { label: 'Nature & animals', value: 'nature and animals' },
        { label: 'Travel & places', value: 'travel and places' },
        { label: 'History (gentle)', value: 'a gentle historical anecdote' },
        { label: 'A small mystery', value: 'a light mystery' },
        { label: 'Family & memories', value: 'family and warm memories' },
      ],
    },
    {
      key: 'customThemeText',
      label: 'Your theme',
      type: 'text',
      default: 'baking bread at a seaside café',
      max: 120,
      visibleWhen: (c) => c.customTheme === true,
      help: 'Short phrase describing the story setting. Max 120 characters.',
    },
    {
      key: 'length',
      label: 'Story length',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Short (~100 words)', value: 'short' },
        { label: 'Medium (~250 words)', value: 'medium' },
        { label: 'Long (~300 words)', value: 'long' },
      ],
    },
    {
      key: 'difficulty',
      label: 'Reading level',
      type: 'select',
      default: 'standard',
      options: [
        { label: 'Easy (simple words)', value: 'easy' },
        { label: 'Standard', value: 'standard' },
        { label: 'Challenging', value: 'challenging' },
      ],
    },
    {
      key: 'questionCount',
      label: 'Number of questions',
      type: 'number',
      default: 5,
      min: 3,
      max: 8,
      step: 1,
    },
  ],
  generate,
}
