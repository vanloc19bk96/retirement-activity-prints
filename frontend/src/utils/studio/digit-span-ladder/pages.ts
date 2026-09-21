import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import {
  contentBox,
  insetHorizontal,
  drawHeader,
  measureHeaderHeight,
} from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  type Rung,
  type DigitSpanDirection,
  STUDY_INSTRUCTION,
  instructionFor,
  limitRungsToRows,
} from './ladder'
import {
  pushBanner,
  pushLadderGrid,
  measureLadderChromeHeight,
  maxLadderDataRows,
} from './draw'
import { pushStudyTable, pushRecallTable } from './study-table'

/**
 * Rungs that fit one ruled page at a legible row height.
 * Study & recall pages must agree, so the trim is computed once here.
 */
export function fitLadderRungs(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  rungs: Rung[],
  direction: DigitSpanDirection,
): Rung[] {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const headerH = measureHeaderHeight(config, instructionFor(direction), content.width)
  const bodyH = content.height - headerH - measureLadderChromeHeight()
  return limitRungsToRows(rungs, maxLadderDataRows(bodyH))
}

/** Cover mode: Sequence | Your answer in a 2-col grid-copy style table. */
export function buildLadderPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  rungs: Rung[],
  direction: DigitSpanDirection,
  font: string,
): StudioPageOutput {
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instructionFor(direction))
  objects.push(...header.objects)

  const body = pushBanner(objects, header.body, direction, font, tag)
  const visible = limitRungsToRows(rungs, maxLadderDataRows(body.height))
  pushLadderGrid(objects, body, visible, font, tag, { showSequence: true })

  return {
    pageRole: tag.pageRole === 'recall' ? 'recall' : 'single',
    objects,
  }
}

export function buildStudyPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  rungs: Rung[],
  direction: DigitSpanDirection,
  font: string,
): StudioPageOutput {
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, STUDY_INSTRUCTION)
  objects.push(...header.objects)

  const body = pushBanner(objects, header.body, direction, font, tag)
  pushStudyTable(objects, body, rungs, font, tag)

  return { pageRole: 'study', objects }
}

export function buildRecallPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  rungs: Rung[],
  direction: DigitSpanDirection,
  font: string,
): StudioPageOutput {
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instructionFor(direction))
  objects.push(...header.objects)

  const body = pushBanner(objects, header.body, direction, font, tag)
  // Same 2-col × n-row geometry as the study page (column-major).
  pushRecallTable(objects, body, rungs, font, tag)

  return { pageRole: 'recall', objects }
}
