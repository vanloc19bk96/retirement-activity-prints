import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { LifeTimelineRemoteData } from '@/types/studio-life-timeline.types'
import { contentBox, insetHorizontal, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_INK_MUTED,
} from '@/constants/studio.constants'
import { lifeTimelinePrefetch } from './prefetch'
import { LIFE_TIMELINE_CONFIG_SCHEMA } from './config'
import { selectedStages } from './stages'
import { STAGE_INSTRUCTION, drawStageContent } from './draw'

function promptsPerPage(config: StudioConfig): number {
  return Math.min(6, Math.max(2, Number(config.promptsPerStage ?? 4)))
}

function errorPage(ctx: StudioGenerateContext, config: StudioConfig): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: 'life-timeline',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  return {
    pageRole: 'single',
    objects: [
      buildText(
        {
          left: content.left,
          top: content.top,
          text: 'Life timeline prompts could not be generated. Please try again.',
          fontFamily: String(config.fontFamily),
          fill: STUDIO_INK_MUTED,
          width: content.width,
        },
        tag,
        'decoration',
      ),
    ],
  }
}

function buildStagePage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  prompts: string[],
): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: 'life-timeline',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, STAGE_INSTRUCTION)
  objects.push(...header.objects)
  drawStageContent(objects, header.body, prompts, config, tag)
  return { pageRole: 'single', objects }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const promptsByStage = ctx.remoteData as LifeTimelineRemoteData | undefined
  if (!promptsByStage) return [errorPage(ctx, config)]
  const count = promptsPerPage(config)
  const stages = selectedStages(config)
  return stages.map((stageKey) =>
    buildStagePage(config, ctx, (promptsByStage[stageKey] ?? []).slice(0, count)),
  )
}

export const lifeTimelineTemplate: StudioTemplateDefinition = {
  key: 'life-timeline',
  label: 'Life Timeline',
  category: 'reminiscence',
  description:
    'A guided keepsake for writing down a life story, stage by stage. Warm, open-ended prompts with plenty of room to write. Prompts are generated fresh, so no two books are alike.',
  pageCount: 1,
  producesAnswerKey: false,
  prefetch: lifeTimelinePrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="currentColor" stroke-width="1.2" fill="none"><path d="M6 20h52"/></g>
    <g fill="currentColor"><circle cx="14" cy="20" r="3"/><circle cx="30" cy="20" r="3"/>
      <circle cx="46" cy="20" r="3"/></g>
    <g stroke="currentColor" stroke-width="0.8" fill="none">
      <rect x="8" y="26" width="12" height="8"/><rect x="24" y="26" width="12" height="8"/>
      <rect x="40" y="26" width="12" height="8"/></g>
  </svg>`,
  configSchema: LIFE_TIMELINE_CONFIG_SCHEMA,
  generate,
}
