import { generateLifePrompts } from '@/api/studio-life-timeline.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type {
  LifeTimelineRemoteData,
  LifeTimelineTone,
} from '@/types/studio-life-timeline.types'
import { selectedStages } from './stages'

function asTone(value: unknown): LifeTimelineTone {
  return value === 'playful' || value === 'reflective' ? value : 'gentle'
}

export async function lifeTimelinePrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<LifeTimelineRemoteData> {
  const stages = selectedStages(config)
  const promptCount = Math.min(6, Math.max(2, Number(config.promptsPerStage ?? 4)))
  const tone = asTone(config.tone)
  const seed = Number(config.seed ?? 1)

  const entries = await Promise.all(
    stages.map(async (stage, index) => {
      // One bucket per stage: two sheets about "childhood" are the repeat.
      const varietyKey = studioVarietyKey('life-timeline', stage, tone)
      const res = await generateLifePrompts(
        {
          mode: 'life-story',
          stage,
          promptCount,
          tone,
          seed: seed + index,
          avoid: studioAvoidList(varietyKey),
        },
        signal,
      )
      rememberStudioContent(varietyKey, res.prompts)
      if (res.prompts.length < promptCount) {
        throw new Error(
          `Life timeline returned ${res.prompts.length} prompts; needed ${promptCount}`,
        )
      }
      return [stage, res.prompts.slice(0, promptCount)] as const
    }),
  )
  return Object.fromEntries(entries)
}
