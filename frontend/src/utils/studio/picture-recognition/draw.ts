import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { PictureRef } from '@/types/studio-pictures.types'
import {
  contentBox,
  insetBox,
  insetHorizontal,
  drawHeader,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  toNonBreakingSpaces,
  type Box,
} from '../studio-layout'
import {
  buildImage,
  buildText,
  buildGroup,
  type StudioTag,
} from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import {
  STUDIO_INK_MUTED,
  STUDIO_BODY_SIZE,
  STUDIO_INSTRUCTION_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import {
  DEFAULT_NATURAL_SIZE,
  IMAGE_FIT_RATIO,
  STROKE_INSET,
  layoutImageGrid,
} from './layout'

export const STUDY_INSTRUCTION =
  'Look carefully at these pictures and try to remember them. Then turn the page'

export const RECALL_INSTRUCTION =
  'Circle the pictures you saw on the last page. Do not look back'

/** Smaller than body — secondary hint under the instruction. */
export const LEGEND_SIZE = Math.round(STUDIO_INSTRUCTION_SIZE * 0.85)
export const LEGEND_H = LEGEND_SIZE + 8
export const LEGEND_GAP = 16
const MIN_BODY = 120

function drawPicture(
  objects: StudioFabricObject[],
  cell: Box,
  pic: PictureRef,
  tag: StudioTag,
): void {
  const naturalWidth = Math.max(1, Number(pic.naturalWidth) || DEFAULT_NATURAL_SIZE)
  const naturalHeight = Math.max(1, Number(pic.naturalHeight) || DEFAULT_NATURAL_SIZE)
  const fitW = cell.width * IMAGE_FIT_RATIO
  const fitH = cell.height * IMAGE_FIT_RATIO
  // Fit-inside, aspect preserved — never stretch (§7.1).
  const scale = Math.min(fitW / naturalWidth, fitH / naturalHeight)

  objects.push(
    buildImage(
      {
        src: pic.url,
        left: boxCenterX(cell),
        top: boxCenterY(cell),
        originX: 'center',
        originY: 'center',
        width: naturalWidth,
        height: naturalHeight,
        scaleX: scale,
        scaleY: scale,
        crossOrigin: 'anonymous',
      },
      tag,
      'prompt',
    ),
  )
}

/** Same even-weight bars as grid-copy (not per-cell stroked rects). */
function pictureGridLines(
  grid: ReturnType<typeof layoutImageGrid>,
  tag: StudioTag,
): StudioFabricObject[] {
  return drawGridLines(grid.bounds, grid.cell, grid.cols, grid.rows, tag)
}

export function buildStudyPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  targets: PictureRef[],
): StudioPageOutput {
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, STUDY_INSTRUCTION)
  objects.push(...header.objects)

  const field = insetBox(header.body, STROKE_INSET)
  const grid = layoutImageGrid(field, targets.length)
  const gridObjects: StudioFabricObject[] = []
  targets.forEach((pic, i) => {
    drawPicture(gridObjects, grid.cellBox(i), pic, tag)
  })
  gridObjects.push(...pictureGridLines(grid, tag))
  objects.push(buildGroup(gridObjects, grid.bounds, tag))

  return { pageRole: 'study', objects }
}

export function buildRecallPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  options: PictureRef[],
  targetCount: number,
  showNumbers: boolean,
  font: string,
): StudioPageOutput {
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, RECALL_INSTRUCTION)
  objects.push(...header.objects)

  const field = insetBox(header.body, STROKE_INSET)
  const stackExtra = LEGEND_H + LEGEND_GAP
  // Size the grid under the legend, then center legend+grid as one block.
  const probe = layoutImageGrid(
    { ...field, height: Math.max(MIN_BODY, field.height - stackExtra) },
    options.length,
  )
  const blockH = stackExtra + probe.bounds.height
  const tableBody: Box = {
    left: field.left,
    top: field.top + (field.height - blockH) / 2 + stackExtra,
    width: field.width,
    height: probe.bounds.height,
  }
  const grid = layoutImageGrid(tableBody, options.length)

  // Full content band + NBSP — never shrink to the grid width (1-col packs wrap per word).
  const legendText = toNonBreakingSpaces(
    `${targetCount} of these were on the previous page`,
  )
  const legendSize = fitFontSizeToWidth(legendText, field.width, LEGEND_SIZE)
  objects.push(
    buildText(
      {
        left: boxCenterX(field),
        top: grid.bounds.top - LEGEND_GAP - LEGEND_H / 2,
        text: legendText,
        width: estimateTextBoxWidth(legendText, legendSize, field.width),
        fontFamily: font,
        fontSize: legendSize,
        fill: STUDIO_INK_MUTED,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'decoration',
    ),
  )

  const gridObjects: StudioFabricObject[] = []
  options.forEach((pic, i) => {
    const cell = grid.cellBox(i)
    drawPicture(gridObjects, cell, pic, tag)

    if (showNumbers) {
      const label = String(i + 1)
      gridObjects.push(
        buildText(
          {
            left: cell.left + 4,
            top: cell.top + 2,
            text: label,
            width: estimateTextBoxWidth(label, STUDIO_BODY_SIZE * 0.55, cell.width * 0.4),
            fontFamily: STUDIO_DIGIT_FONT,
            fontSize: STUDIO_BODY_SIZE * 0.55,
            fill: STUDIO_INK_MUTED,
          },
          tag,
          'decoration',
        ),
      )
    }
  })
  gridObjects.push(...pictureGridLines(grid, tag))
  objects.push(buildGroup(gridObjects, grid.bounds, tag))

  return { pageRole: 'recall', objects }
}

export function errorPage(ctx: StudioGenerateContext, config: StudioConfig): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: 'picture-recognition',
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
          text: 'Pictures could not be loaded. Please try again.',
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
