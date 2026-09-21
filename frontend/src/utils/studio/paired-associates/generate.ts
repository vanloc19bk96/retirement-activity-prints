import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import type {
  PairAnswerFormat,
  PairResponse,
  PairTestDirection,
  PairSet,
} from '@/types/studio-pairs.types'
import { STUDIO_INK_MUTED } from '@/constants/studio.constants'
import { createRng, deriveSeed } from '../studio-rng'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { resolveDirections } from './direction'
import {
  resolvePairField,
  computePairGeometry,
  studyInstruction,
  recallInstruction,
  type PairGeometry,
} from './geometry'
import { buildStudyPage } from './draw-study'
import { buildRecallPage } from './draw-recall'
import { pairedAssociatesPrefetch } from './prefetch'

function asAnswerFormat(value: unknown): PairAnswerFormat {
  if (value === 'matching' || value === 'multiple-choice') return value
  return 'write-in'
}

function asDirection(value: unknown): PairTestDirection {
  // UI no longer exposes direction — default to a mix (tests may override).
  if (value === 'forward' || value === 'backward') return value
  return 'mixed'
}

function errorPage(ctx: StudioGenerateContext, config: StudioConfig): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: 'paired-associates',
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
          text: 'Pairs could not be generated. Please try again.',
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
  const data = ctx.remoteData as PairResponse | undefined
  if (!data?.sets?.length) return [errorPage(ctx, config)]

  // UI no longer exposes exercise count — one pair per generate (tests may override).
  const exercises = Math.min(40, Math.max(1, Number(config.exerciseCount ?? 1)))
  const wantedPairs = Math.min(10, Math.max(4, Number(config.pairCount ?? 6)))
  const format = asAnswerFormat(config.answerFormat)
  const directionMode = asDirection(config.testDirection)
  const out: StudioPageOutput[] = []

  for (let i = 0; i < exercises && i < data.sets.length; i++) {
    const raw = data.sets[i]
    const pairs = raw.pairs.slice(0, wantedPairs)
    if (pairs.length < 2) continue
    const set: PairSet = { pairs }

    const rng = createRng(deriveSeed(ctx.seed, `pairs:${i}`))
    const hasImages = pairs.some((p) => Boolean(p.rightImageUrl))
    // Pictures live on the right half — keep cues as words for recall layouts.
    const effectiveDirection: PairTestDirection =
      hasImages && directionMode !== 'forward' ? 'forward' : directionMode

    // Study cards and recall MC blocks need different row heights — pack separately,
    // then share the smaller pair count so both pages stay inside the safe area.
    const studyField = resolvePairField(
      ctx,
      config,
      'Remember these pairs',
      studyInstruction(),
    )
    const recallField = resolvePairField(
      ctx,
      config,
      'Find the partners',
      recallInstruction(format),
    )
    const studyGeom0 = computePairGeometry(
      studyField,
      pairs.length,
      format,
      hasImages,
      'study',
    )
    const recallGeom0 = computePairGeometry(
      recallField,
      pairs.length,
      format,
      hasImages,
      'recall',
    )
    const count = Math.min(studyGeom0.count, recallGeom0.count)
    const studyGeom: PairGeometry = computePairGeometry(
      studyField,
      count,
      format,
      hasImages,
      'study',
    )
    const recallGeom: PairGeometry = computePairGeometry(
      recallField,
      count,
      format,
      hasImages,
      'recall',
    )
    const trimmed: PairSet = { pairs: set.pairs.slice(0, count) }
    const directions = resolveDirections(trimmed.pairs.length, effectiveDirection, rng)

    out.push(buildStudyPage(trimmed, studyGeom, config, ctx))
    out.push(
      buildRecallPage(trimmed, recallGeom, config, ctx, format, directions, rng),
    )
  }

  return out.length > 0 ? out : [errorPage(ctx, config)]
}

export const pairedAssociatesTemplate: StudioTemplateDefinition = {
  key: 'paired-associates',
  label: 'Perfect Pairs',
  category: 'memory',
  description:
    'Study a set of word pairs, then recall which words went together. Trains the memory behind names, meanings and where you left things. Turn back to the study page to check.',
  pageCount: 2,
  producesAnswerKey: false,
  prefetch: pairedAssociatesPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="1" opacity="0.75">
      <path d="M6 10h14M28 10h14M6 20h14M28 20h14M6 30h14M28 30h14"/></g>
    <g stroke="currentColor" stroke-width="1" fill="none">
      <path d="M22 10h3M22 20h3M22 30h3"/></g>
    <g stroke="currentColor" stroke-width="0.8" fill="none" opacity="0.5">
      <path d="M48 10h10M48 20h10M48 30h10"/></g>
  </svg>`,
  configSchema: [
    {
      key: 'pairType',
      label: 'What to pair',
      type: 'select',
      default: 'arbitrary',
      options: [
        { label: 'Unrelated words (true memory test)', value: 'arbitrary' },
        { label: 'Related words (gentler)', value: 'related' },
      ],
      help: 'Unrelated pairs must be memorised. Related pairs can often be worked out, which is easier but less of a memory test.',
    },
    {
      key: 'pairCount',
      label: 'Pairs to remember',
      type: 'number',
      default: 6,
      min: 4,
      max: 10,
      step: 1,
      help: 'Six is comfortable. Ten is a real challenge.',
    },
    {
      key: 'answerFormat',
      label: 'How to answer',
      type: 'select',
      default: 'write-in',
      options: [
        { label: 'Write the partner (harder)', value: 'write-in' },
        { label: 'Draw a line to match (gentler)', value: 'matching' },
        { label: 'Choose from options', value: 'multiple-choice' },
      ],
    },
  ],
  generate,
}
