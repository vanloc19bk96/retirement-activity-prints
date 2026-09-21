import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import type {
  SequenceAnswerFormat,
  SequenceResponse,
  SequenceSet,
} from '@/types/studio-sequence.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK_MUTED } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import { createRng, deriveSeed } from '../studio-rng'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { scrambleSequence } from './scramble'
import {
  buildStudyPage,
  buildRecallPage,
  resolveItemField,
  computeItemRhythm,
} from './draw'
import {
  isCustomSequenceTheme,
  sequenceOrderPrefetch,
  validateSequenceOrderConfig,
} from './prefetch'

function asAnswerFormat(value: unknown): SequenceAnswerFormat {
  return value === 'write-list' ? 'write-list' : 'number-boxes'
}

/** Category labels (e.g. "Unrelated Objects") are not shown on arbitrary lists. */
function shouldShowSequenceTitle(config: StudioConfig): boolean {
  if (isCustomSequenceTheme(config)) return false
  const type = config.sequenceType
  return type === 'steps' || type === 'story' || type === 'everyday'
}

function errorPage(ctx: StudioGenerateContext, config: StudioConfig): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: 'sequence-order',
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
          text: 'Sequence could not be generated. Please try again.',
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

function studyInstruction(): string {
  return 'Study this list and try to remember the order. Then turn the page'
}

function recallInstruction(count: number, format: SequenceAnswerFormat): string {
  return format === 'write-list'
    ? `Write these ${count} items in the order you saw them. Do not look back`
    : `Number these 1 to ${count} in the order you saw them. Do not look back`
}

function sharedField(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  _seq: SequenceSet,
  itemCount: number,
  format: SequenceAnswerFormat,
) {
  const study = resolveItemField(
    ctx,
    config,
    'Remember the order',
    studyInstruction(),
  )
  const recall = resolveItemField(
    ctx,
    config,
    'Put them back in order',
    recallInstruction(itemCount, format),
  )
  const top = Math.max(study.top, recall.top)
  const bottom = Math.min(study.top + study.height, recall.top + recall.height)
  return {
    left: study.left,
    top,
    width: study.width,
    height: Math.max(1, bottom - top),
  }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const data = ctx.remoteData as SequenceResponse | undefined
  if (!data?.sequences?.length) return [errorPage(ctx, config)]

  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  // UI no longer exposes exercise count — one pair per generate (tests may override).
  const pairs = Math.min(40, Math.max(1, Number(config.pagePairCount ?? 1)))
  const wantedItems = Math.min(8, Math.max(4, Number(config.itemCount ?? 5)))
  const format = asAnswerFormat(config.answerFormat)
  const out: StudioPageOutput[] = []

  for (let i = 0; i < pairs && i < data.sequences.length; i++) {
    const raw = data.sequences[i]
    const items = raw.items.slice(0, wantedItems)
    if (items.length < 2) continue
    const seq: SequenceSet =
      shouldShowSequenceTitle(config) && raw.title
        ? { title: raw.title, items }
        : { items }

    const rng = createRng(deriveSeed(ctx.seed, `seq:${i}`))
    const field = sharedField(ctx, config, seq, items.length, format)
    const rhythm = computeItemRhythm(
      field,
      items.map((item) => item.text),
      format,
    )
    const trimmed: SequenceSet = {
      ...seq,
      items: seq.items.slice(0, rhythm.count),
    }
    const perm = scrambleSequence(trimmed.items, rng)

    out.push(buildStudyPage(trimmed, rhythm, config, ctx))
    out.push(buildRecallPage(trimmed, perm, rhythm, config, ctx, format))
  }

  return out.length > 0 ? out : [errorPage(ctx, config)]
}

export const sequenceOrderTemplate: StudioTemplateDefinition = {
  key: 'sequence-order',
  label: 'Put It In Order',
  category: 'memory',
  description:
    'Study a short list, then put the same items back in the order they appeared. Trains memory for order rather than for the items themselves. Turn back to the study page to check.',
  pageCount: 2,
  producesAnswerKey: false,
  prefetch: sequenceOrderPrefetch,
  validateConfig: validateSequenceOrderConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.9">
      <rect x="14" y="6" width="7" height="7"/><rect x="14" y="17" width="7" height="7"/>
      <rect x="14" y="28" width="7" height="7"/></g>
    <g stroke="currentColor" stroke-width="1" opacity="0.7">
      <path d="M26 9h20M26 20h24M26 31h16"/></g>
    <g font-size="5" fill="currentColor" font-family="sans-serif" text-anchor="middle">
      <text x="17.5" y="12">2</text><text x="17.5" y="23">1</text><text x="17.5" y="34">3</text></g>
  </svg>`,
  configSchema: [
    {
      key: 'customTheme',
      label: 'Custom theme',
      type: 'toggle',
      default: false,
      help: 'Turn on to type your own sequence theme instead of picking a preset.',
    },
    {
      key: 'sequenceType',
      label: 'What to put in order',
      type: 'select',
      default: 'arbitrary',
      visibleWhen: (c) => c.customTheme !== true,
      options: [
        { label: 'Unrelated things (true memory test)', value: 'arbitrary' },
        { label: 'Steps of a task', value: 'steps' },
        { label: 'Everyday routines', value: 'everyday' },
        { label: 'A short story', value: 'story' },
      ],
      help: 'Unrelated things rely on memory alone. Steps and routines can also be worked out by thinking, which is gentler but less of a memory test.',
    },
    {
      key: 'customThemeText',
      label: 'Your theme',
      type: 'text',
      default: 'things you might pack for a day trip',
      max: 120,
      visibleWhen: (c) => c.customTheme === true,
      help: 'Short phrase for the sequence theme (e.g. morning coffee ritual, garden tools). Max 120 characters.',
    },
    {
      key: 'itemCount',
      label: 'Items in the sequence',
      type: 'number',
      default: 5,
      min: 4,
      max: 8,
      step: 1,
      help: 'Five is comfortable. Eight is a real challenge.',
    },
    {
      key: 'answerFormat',
      label: 'How to answer',
      type: 'select',
      default: 'number-boxes',
      options: [
        { label: 'Number the items (easier to write)', value: 'number-boxes' },
        { label: 'Write them out in order', value: 'write-list' },
      ],
    },
  ],
  generate,
}
