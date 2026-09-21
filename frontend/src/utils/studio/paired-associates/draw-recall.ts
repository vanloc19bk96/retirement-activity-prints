import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import type { PairAnswerFormat, PairSet } from '@/types/studio-pairs.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import type { StudioRng } from '../studio-rng'
import type { ResolvedDirection } from './direction'
import { drawMultipleChoice, mcQuestionText } from './draw-mc'
import { drawMatching } from './draw-matching'
import { drawWriteIn } from './draw-write-in'
import {
  headerConfig,
  recallInstruction,
  type PairGeometry,
} from './geometry'

export { mcQuestionText }

export function buildRecallPage(
  set: PairSet,
  geom: PairGeometry,
  config: StudioConfig,
  ctx: StudioGenerateContext,
  format: PairAnswerFormat,
  directions: ResolvedDirection[],
  rng: StudioRng,
): StudioPageOutput {
  const font = String(config.fontFamily)
  const tag: StudioTag = {
    templateKey: 'paired-associates',
    instanceId: ctx.instanceId,
    pageRole: 'recall',
  }
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(
    content,
    headerConfig(config, 'Find the partners'),
    tag,
    recallInstruction(format),
  )
  objects.push(...header.objects)

  if (format === 'matching') {
    drawMatching(objects, set, directions, geom, font, tag, rng)
  } else if (format === 'multiple-choice') {
    drawMultipleChoice(objects, set, directions, geom, font, tag, rng)
  } else {
    drawWriteIn(objects, set, directions, geom, font, tag)
  }

  return { pageRole: 'recall', objects }
}
