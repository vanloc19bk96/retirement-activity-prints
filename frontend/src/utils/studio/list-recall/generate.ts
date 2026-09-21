import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import type { ListRecallResponse } from '@/types/studio-list.types'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_INK_MUTED } from '@/constants/studio.constants'
import { listRecallPrefetch } from './prefetch'
import { buildRecallPage, buildStudyPage } from './draw'
import {
  DISTRACTOR_COUNT_MAX,
  DISTRACTOR_COUNT_MIN,
  padOptionsToFullRows,
  validDistractorCounts,
} from './fallback'

function errorPage(ctx: StudioGenerateContext, config: StudioConfig): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: 'list-recall',
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
          text: 'Shopping list could not be generated. Please try again.',
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
  const data = ctx.remoteData as ListRecallResponse | undefined
  if (!data?.targets?.length || !data?.options?.length) {
    return [errorPage(ctx, config)]
  }

  const font = String(config.fontFamily)
  const studyTag: StudioTag = {
    templateKey: 'list-recall',
    instanceId: ctx.instanceId,
    pageRole: 'study',
  }
  const recallTag: StudioTag = { ...studyTag, pageRole: 'recall' }
  const options = padOptionsToFullRows(data.options, ctx.seed)

  return [
    buildStudyPage(config, ctx, studyTag, data.targets, font),
    buildRecallPage(config, ctx, recallTag, options, data.targets.length, font),
  ]
}

export const listRecallTemplate: StudioTemplateDefinition = {
  key: 'list-recall',
  label: 'Shopping List Recall',
  category: 'memory',
  description:
    'Memorize a shopping list, then pick those items out of a longer list padded with decoys. Lists are written fresh by AI, so no two pages repeat. Includes an answer key.',
  pageCount: 2,
  producesAnswerKey: true,
  prefetch: listRecallPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="6" y="6" width="22" height="28"/><path d="M10 12h14M10 18h14M10 24h10"/>
      <rect x="36" y="8" width="5" height="5"/><rect x="36" y="18" width="5" height="5"/>
      <rect x="36" y="28" width="5" height="5"/>
      <path d="M37 20l1.5 1.5 2.5-2.5M45 10h14M45 20h14M45 30h14"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'listLength',
      label: 'Items on the list',
      type: 'number',
      default: 8,
      min: 5,
      max: 20,
      step: 1,
      help: 'How many items to memorize. More = harder.',
    },
    {
      key: 'distractorCount',
      label: 'Extra (wrong) options',
      type: 'number',
      default: 10,
      min: DISTRACTOR_COUNT_MIN,
      max: DISTRACTOR_COUNT_MAX,
      step: 1,
      valuesWhen: (c) =>
        validDistractorCounts(Number(c.listLength ?? 8), DISTRACTOR_COUNT_MIN, DISTRACTOR_COUNT_MAX),
      help: 'Wrong options mixed in on the recall page. Counts step up so the grid always fills evenly.',
    },
    {
      key: 'distractorDifficulty',
      label: 'Decoy difficulty',
      type: 'select',
      default: 'standard',
      options: [
        { label: 'Easy (unrelated decoys)', value: 'easy' },
        { label: 'Standard (some related)', value: 'standard' },
        { label: 'Challenging (tricky variants)', value: 'challenging' },
      ],
    },
    {
      key: 'customTheme',
      label: 'Custom theme',
      type: 'toggle',
      default: false,
      help: 'Turn on to type your own list theme instead of picking a preset.',
    },
    {
      key: 'category',
      label: 'Theme',
      type: 'select',
      default: 'mixed',
      visibleWhen: (c) => c.customTheme !== true,
      options: [
        { label: 'Mixed groceries', value: 'mixed' },
        { label: 'Fruit & vegetables', value: 'produce' },
        { label: 'Pantry & bakery', value: 'pantry' },
        { label: 'Household & drinks', value: 'household' },
      ],
      help: 'Restrict items to a theme, or mix everything.',
    },
    {
      key: 'customThemeText',
      label: 'Your theme',
      type: 'text',
      default: 'picnic at the park',
      max: 120,
      visibleWhen: (c) => c.customTheme === true,
      help: 'Short phrase for the list theme (e.g. camping trip, bakery run). Max 120 characters.',
    },
  ],
  generate,
}
