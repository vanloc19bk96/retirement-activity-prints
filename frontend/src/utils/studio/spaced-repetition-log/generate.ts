import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import { type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  SPACED_REPETITION_LOG_CONFIG_SCHEMA,
  SPACED_REPETITION_LOG_DEFAULT_TITLE,
  resolveSpacedRepetitionLogTitle,
} from './config'
import {
  resolveIntervals,
  parseCustomIntervals,
  MAX_CUSTOM_INTERVALS,
  MAX_INTERVAL_DAYS,
} from './schedule'
import { drawLogTable } from './draw-log'

function makeTag(ctx: StudioGenerateContext): StudioTag {
  return {
    templateKey: 'spaced-repetition-log',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const tag = makeTag(ctx)
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const logConfig = {
    ...config,
    title: resolveSpacedRepetitionLogTitle(config),
    showInstructions: false,
  }
  const header = drawHeader(content, logConfig, tag, '')
  objects.push(...header.objects)
  drawLogTable(
    objects,
    header.body,
    config,
    resolveIntervals(config),
    String(config.fontFamily),
    tag,
  )
  return [{ pageRole: 'single', objects }]
}

function validateConfig(config: StudioConfig): StudioConfigValidationError | null {
  if (String(config.schedule) !== 'custom') return null

  const { intervals, invalidTokens } = parseCustomIntervals(config.customIntervals)

  if (invalidTokens.length > 0) {
    const shown = invalidTokens
      .slice(0, 3)
      .map((t) => `"${t}"`)
      .join(', ')
    const more =
      invalidTokens.length > 3 ? ` (+${invalidTokens.length - 3} more)` : ''
    return {
      field: 'customIntervals',
      message: `${shown}${more} ${invalidTokens.length === 1 ? 'is' : 'are'} not valid. Use whole numbers from 1 to ${MAX_INTERVAL_DAYS}, one per line.`,
    }
  }

  if (intervals.length < 1) {
    return {
      field: 'customIntervals',
      message: 'Add at least one day interval (a positive whole number).',
    }
  }

  if (intervals.length > MAX_CUSTOM_INTERVALS) {
    return {
      field: 'customIntervals',
      message: `Use at most ${MAX_CUSTOM_INTERVALS} intervals so columns stay printable.`,
    }
  }

  if (new Set(intervals).size !== intervals.length) {
    return {
      field: 'customIntervals',
      message: 'Each interval should be unique.',
    }
  }

  return null
}

export const spacedRepetitionLogTemplate: StudioTemplateDefinition = {
  key: 'spaced-repetition-log',
  label: 'Spaced Repetition Log',
  category: 'tracker',
  description:
    'A review tracker built on spaced repetition. Write down what you want to remember, then tick off each review on a schedule that moves it into long-term memory.',
  pageCount: 1,
  producesAnswerKey: false,
  seedInvariant: true,
  defaultPageTitle: SPACED_REPETITION_LOG_DEFAULT_TITLE,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="0.6" fill="none" opacity="0.7">
      <path d="M4 12h56M4 20h56M4 28h56"/></g>
    <g stroke="currentColor" stroke-width="0.9" fill="none">
      <rect x="34" y="14" width="5" height="5"/><rect x="42" y="14" width="5" height="5"/>
      <rect x="50" y="14" width="5" height="5"/>
      <rect x="34" y="22" width="5" height="5"/><rect x="42" y="22" width="5" height="5"/>
      <rect x="50" y="22" width="5" height="5"/></g>
    <g stroke="currentColor" stroke-width="1" fill="none"><path d="M35 16.5l1.5 1.5 2.5-2.5"/></g>
  </svg>`,
  configSchema: SPACED_REPETITION_LOG_CONFIG_SCHEMA,
  validateConfig,
  generate,
}
