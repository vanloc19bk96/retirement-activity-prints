import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import type { PictureRef, PictureSetResponse } from '@/types/studio-pictures.types'
import {
  contentBox,
  insetBox,
  insetHorizontal,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { pictureRecognitionPrefetch } from './prefetch'
import { STROKE_INSET, maxFittingCount } from './layout'
import {
  RECALL_INSTRUCTION,
  LEGEND_GAP,
  LEGEND_H,
  buildStudyPage,
  buildRecallPage,
  errorPage,
} from './draw'

const MIN_BODY = 120

/** Prefer dropping distractors before targets when the page cannot fit all cells. */
export function clampPictureSet(
  data: PictureSetResponse,
  maxOptions: number,
): PictureSetResponse {
  if (data.options.length <= maxOptions) return data

  const targetIds = new Set(data.targets.map((t) => t.id))
  if (data.targets.length >= maxOptions) {
    const targets = data.targets.slice(0, maxOptions)
    const keep = new Set(targets.map((t) => t.id))
    return {
      targets,
      options: data.options.filter((o) => keep.has(o.id)),
    }
  }

  let distractorsLeft = maxOptions - data.targets.length
  const options: PictureRef[] = []
  for (const option of data.options) {
    if (targetIds.has(option.id)) {
      options.push(option)
      continue
    }
    if (distractorsLeft > 0) {
      options.push(option)
      distractorsLeft -= 1
    }
  }
  const keep = new Set(options.map((o) => o.id))
  return {
    targets: data.targets.filter((t) => keep.has(t.id)),
    options,
  }
}

function recallField(ctx: StudioGenerateContext, config: StudioConfig): Box {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const headerH = measureHeaderHeight(config, RECALL_INSTRUCTION, content.width)
  const body: Box = {
    left: content.left,
    top: content.top + headerH,
    width: content.width,
    height: Math.max(MIN_BODY, content.height - headerH),
  }
  const reservedAbove = LEGEND_H + LEGEND_GAP
  return insetBox(
    {
      ...body,
      top: body.top + reservedAbove,
      height: Math.max(MIN_BODY, body.height - reservedAbove),
    },
    STROKE_INSET,
  )
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const data = ctx.remoteData as PictureSetResponse | undefined
  if (!data?.options?.length || !data?.targets?.length) {
    return [errorPage(ctx, config)]
  }

  const showNumbers = config.showCellNumbers !== false
  const font = String(config.fontFamily)
  if (showNumbers) void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  const field = recallField(ctx, config)
  const fitCount = maxFittingCount(field, data.options.length)
  const clamped = clampPictureSet(data, fitCount)

  const studyTag: StudioTag = {
    templateKey: 'picture-recognition',
    instanceId: ctx.instanceId,
    pageRole: 'study',
  }
  const recallTag: StudioTag = { ...studyTag, pageRole: 'recall' }

  return [
    buildStudyPage(config, ctx, studyTag, clamped.targets),
    buildRecallPage(
      config,
      ctx,
      recallTag,
      clamped.options,
      clamped.targets.length,
      showNumbers,
      font,
    ),
  ]
}

export const pictureRecognitionTemplate: StudioTemplateDefinition = {
  key: 'picture-recognition',
  label: 'Which Did You See?',
  category: 'memory',
  description:
    'Study a set of pictures, then find them again among new ones on the next page. Black and white outline artwork throughout. Turn back to the study page to check.',
  pageCount: 2,
  producesAnswerKey: false,
  showsCanvasEditHint: true,
  canvasEditHint:
    'Want a different picture? Click the grid on the page, hit Ungroup, then drop in your own image from Components — or make one with AI and drag it onto the spot.',
  prefetch: pictureRecognitionPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.9">
      <rect x="10" y="6" width="12" height="12"/><rect x="26" y="6" width="12" height="12"/>
      <rect x="42" y="6" width="12" height="12"/>
      <rect x="10" y="22" width="12" height="12"/><rect x="26" y="22" width="12" height="12"/>
      <rect x="42" y="22" width="12" height="12"/>
      <ellipse cx="32" cy="12" rx="8" ry="8"/><ellipse cx="16" cy="28" rx="8" ry="8"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'targetCount',
      label: 'Pictures to remember',
      type: 'select',
      default: 9,
      options: [
        { label: '4 (2×2 grid)', value: 4 },
        { label: '9 (3×3 grid)', value: 9 },
        { label: '16 (4×4 grid)', value: 16 },
      ],
      help: 'How many pictures appear on the study page. Fills a square grid completely.',
    },
    {
      key: 'showCellNumbers',
      label: 'Number the pictures',
      type: 'toggle',
      default: true,
    },
  ],
  generate,
}
