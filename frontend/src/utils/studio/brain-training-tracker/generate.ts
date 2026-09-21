import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import { type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  BRAIN_TRAINING_TRACKER_CONFIG_SCHEMA,
  PUZZLE_LOG_DEFAULT_TITLE,
  resolvePuzzleLogTitle,
} from './config'
import { drawPuzzleLog } from './draw-log'

function makeTag(ctx: StudioGenerateContext): StudioTag {
  return {
    templateKey: 'brain-training-tracker',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
}

function buildLogPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
): StudioPageOutput {
  const tag = makeTag(ctx)
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const logConfig = {
    ...config,
    title: resolvePuzzleLogTitle(config),
    showInstructions: false,
  }
  const header = drawHeader(content, logConfig, tag, '')
  objects.push(...header.objects)
  drawPuzzleLog(objects, header.body, config, String(config.fontFamily), tag)
  return { pageRole: 'single', objects }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  return [buildLogPage(config, ctx)]
}

export const brainTrainingTrackerTemplate: StudioTemplateDefinition = {
  key: 'brain-training-tracker',
  label: 'Puzzle Log',
  category: 'tracker',
  description:
    'A log for the puzzles you finish: the date, the page, whether you completed it, and room for a note. Large print with plenty of writing space.',
  pageCount: 1,
  producesAnswerKey: false,
  seedInvariant: true,
  defaultPageTitle: PUZZLE_LOG_DEFAULT_TITLE,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="0.6" fill="none" opacity="0.7">
      <path d="M4 12h56M4 20h56M4 28h56"/></g>
    <g stroke="currentColor" stroke-width="0.9" fill="none">
      <rect x="26" y="14" width="5" height="5"/><rect x="26" y="22" width="5" height="5"/>
      <circle cx="38" cy="16.5" r="2"/><circle cx="44" cy="16.5" r="2"/><circle cx="50" cy="16.5" r="2"/>
    </g>
  </svg>`,
  configSchema: BRAIN_TRAINING_TRACKER_CONFIG_SCHEMA,
  generate,
}
