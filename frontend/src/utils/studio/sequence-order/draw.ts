import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import type {
  SequenceAnswerFormat,
  SequenceSet,
} from '@/types/studio-sequence.types'
import {
  STUDIO_INK_MUTED,
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import {
  contentBox,
  drawHeader,
  insetHorizontal,
  estimateTextBoxWidth,
  measureHeaderHeight,
  type Box,
} from '../studio-layout'
import { buildText, buildGroup, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import { computeItemRhythm, type ItemRhythm } from './rhythm'
import {
  drawNumberBoxesRecall,
  drawNumberedStudyItems,
  drawWriteListBlanks,
  drawWriteListPrompts,
} from './draw-recall'

const SEQUENCE_TITLE_SIZE = STUDIO_BODY_SIZE * 0.95
const SEQUENCE_TITLE_GAP = 16
/** Always reserve title band so first-item baselines match across pairs (§7.4). */
const SEQUENCE_TITLE_BAND = SEQUENCE_TITLE_SIZE + SEQUENCE_TITLE_GAP

function headerConfig(config: StudioConfig, pageTitle: string): StudioConfig {
  const existing = String(config.title ?? '').trim()
  return existing ? config : { ...config, title: pageTitle }
}

/** Body field after header + sequence-title band — shared by both pages. */
export function resolveItemField(
  ctx: StudioGenerateContext,
  config: StudioConfig,
  pageTitle: string,
  instruction: string,
): Box {
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const cfg = headerConfig(config, pageTitle)
  const headerH = measureHeaderHeight(cfg, instruction, content.width)
  return {
    left: content.left,
    top: content.top + headerH + SEQUENCE_TITLE_BAND,
    width: content.width,
    height: Math.max(1, content.height - headerH - SEQUENCE_TITLE_BAND),
  }
}

function drawSequenceTitle(
  objects: StudioFabricObject[],
  text: string | undefined,
  left: number,
  top: number,
  maxWidth: number,
  font: string,
  tag: StudioTag,
): void {
  const title = text?.trim()
  if (!title) return
  objects.push(
    buildText(
      {
        left,
        top,
        text: title,
        width: estimateTextBoxWidth(title, SEQUENCE_TITLE_SIZE, maxWidth),
        fontFamily: font,
        fontSize: SEQUENCE_TITLE_SIZE,
        fill: STUDIO_INK_MUTED,
      },
      tag,
      'decoration',
    ),
  )
}

function pushItemGrid(
  objects: StudioFabricObject[],
  rhythm: ItemRhythm,
  tag: StudioTag,
  cellObjects: StudioFabricObject[],
): void {
  const { table } = rhythm
  const gridObjects = [
    ...cellObjects,
    ...drawGridLines(table.bounds, table.cellW, table.cols, table.rows, tag, {
      rowPitch: table.cellH,
    }),
  ]
  objects.push(buildGroup(gridObjects, table.bounds, tag))
}

/** Study page: ordered items in a grid with visible 1..n boxes (same style as solution). */
export function buildStudyPage(
  seq: SequenceSet,
  rhythm: ItemRhythm,
  config: StudioConfig,
  ctx: StudioGenerateContext,
): StudioPageOutput {
  const font = String(config.fontFamily)
  const tag: StudioTag = {
    templateKey: 'sequence-order',
    instanceId: ctx.instanceId,
    pageRole: 'study',
  }
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(
    content,
    headerConfig(config, 'Remember the order'),
    tag,
    'Study this list and try to remember the order. Then turn the page',
  )
  objects.push(...header.objects)

  drawSequenceTitle(
    objects,
    seq.title,
    header.body.left,
    header.body.top,
    header.body.width,
    font,
    tag,
  )

  const cellObjects: StudioFabricObject[] = []
  drawNumberedStudyItems(cellObjects, seq, rhythm, font, tag)
  pushItemGrid(objects, rhythm, tag, cellObjects)
  return { pageRole: 'study', objects }
}

/** Recall page: scrambled items + answer UI; correct answers hidden. */
export function buildRecallPage(
  seq: SequenceSet,
  perm: number[],
  rhythm: ItemRhythm,
  config: StudioConfig,
  ctx: StudioGenerateContext,
  answerFormat: SequenceAnswerFormat,
): StudioPageOutput {
  const font = String(config.fontFamily)
  const tag: StudioTag = {
    templateKey: 'sequence-order',
    instanceId: ctx.instanceId,
    pageRole: 'recall',
  }
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const n = rhythm.count
  const instruction =
    answerFormat === 'write-list'
      ? `Write these ${n} items in the order you saw them. Do not look back`
      : `Number these 1 to ${n} in the order you saw them. Do not look back`
  const header = drawHeader(
    content,
    headerConfig(config, 'Put them back in order'),
    tag,
    instruction,
  )
  objects.push(...header.objects)

  drawSequenceTitle(
    objects,
    seq.title,
    header.body.left,
    header.body.top,
    header.body.width,
    font,
    tag,
  )

  const clippedPerm = perm.slice(0, rhythm.count)
  const cellObjects: StudioFabricObject[] = []
  if (answerFormat === 'write-list') {
    drawWriteListPrompts(cellObjects, seq, clippedPerm, rhythm, font, tag)
    pushItemGrid(objects, rhythm, tag, cellObjects)
    drawWriteListBlanks(objects, rhythm, tag)
  } else {
    drawNumberBoxesRecall(cellObjects, seq, clippedPerm, rhythm, font, tag)
    pushItemGrid(objects, rhythm, tag, cellObjects)
  }

  return { pageRole: 'recall', objects }
}

export { computeItemRhythm }
