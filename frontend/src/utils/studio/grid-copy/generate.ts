import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng } from '../studio-rng'
import {
  contentBox,
  splitTop,
  rows,
  drawHeader,
  insetHorizontal,
  insetBox,
  boxCenterX,
  estimateTextBoxWidth,
  type Box,
} from '../studio-layout'
import { buildGroup, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines, snapGridInField } from '../studio-grid-rules'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_INK,
  STUDIO_BODY_SIZE,
} from '@/constants/studio.constants'

const INSTRUCTION = 'Copy the pattern from the top grid into the empty grid below'
const LABEL_HEIGHT = STUDIO_BODY_SIZE
const LABEL_GAP = 14
const STACK_GUTTER = 40
/** Breathing room from safe edges (esp. bottom) + hairline stroke clearance. */
const FIELD_INSET = 16

function labeledSlotHeight(gridSide: number): number {
  return LABEL_HEIGHT + LABEL_GAP + gridSide
}

/** Largest cell that fits two labeled grids + gutter inside the field. */
function maxCellForStack(field: Box, size: number): number {
  const labelReserve = 2 * (LABEL_HEIGHT + LABEL_GAP)
  const availableH = field.height - STACK_GUTTER - labelReserve
  const byHeight = Math.floor(availableH / (2 * size))
  const byWidth = Math.floor(field.width / size)
  return Math.max(1, Math.min(byHeight, byWidth))
}

function buildLabeledGrid(options: {
  slotBox: Box
  label: string
  size: number
  filled?: boolean[][]
  font: string
  tag: StudioTag
}): StudioFabricObject[] {
  const { slotBox, label, size, filled, font, tag } = options
  const [, gridArea] = splitTop(slotBox, LABEL_HEIGHT + LABEL_GAP)
  const grid = snapGridInField(gridArea, size, size)

  const out: StudioFabricObject[] = [
    buildText(
      {
        left: boxCenterX(grid.bounds),
        top: grid.bounds.top - LABEL_GAP - LABEL_HEIGHT,
        text: label,
        width: estimateTextBoxWidth(label, LABEL_HEIGHT, slotBox.width),
        fontFamily: font,
        fontSize: LABEL_HEIGHT,
        textAlign: 'center',
        originX: 'center',
      },
      tag,
      'decoration',
    ),
  ]

  const gridObjects: StudioFabricObject[] = []
  // Fills under bars so every rule stays full weight on top.
  if (filled) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!filled[r][c]) continue
        gridObjects.push(
          buildRect(
            {
              ...grid.cellBox(r, c),
              fill: STUDIO_INK,
              stroke: 'transparent',
              strokeWidth: 0,
            },
            tag,
            'prompt',
          ),
        )
      }
    }
  }
  gridObjects.push(...drawGridLines(grid.bounds, grid.cell, size, size, tag))
  out.push(buildGroup(gridObjects, grid.bounds, tag))
  return out
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const size = Number(config.gridSize ?? 5)
  const density = Number(config.fillDensity ?? 0.4)
  const font = String(config.fontFamily)
  const rng = createRng(ctx.seed)

  const tag: StudioTag = {
    templateKey: 'grid-copy',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const { objects: headerObjects, body } = drawHeader(content, config, tag, INSTRUCTION)
  objects.push(...headerObjects)

  // Shrink-wrap the stack to a cell size that fits, then center in the body so
  // the lower grid never sits flush on (or past) the safe-area edge.
  const field = insetBox(body, FIELD_INSET)
  const cell = maxCellForStack(field, size)
  const gridSide = cell * size
  const slotH = labeledSlotHeight(gridSide)
  const stackH = slotH * 2 + STACK_GUTTER
  const stackBox: Box = {
    left: field.left,
    top: Math.round(field.top + (field.height - stackH) / 2),
    width: field.width,
    height: stackH,
  }
  const [modelBox, copyBox] = rows(stackBox, 2, STACK_GUTTER)

  const filled: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => rng.chance(density)),
  )

  objects.push(
    ...buildLabeledGrid({
      slotBox: modelBox,
      label: 'Model',
      size,
      filled,
      font,
      tag,
    }),
    ...buildLabeledGrid({
      slotBox: copyBox,
      label: 'Your copy',
      size,
      font,
      tag,
    }),
  )

  return [{ pageRole: 'single', objects }]
}

export const gridCopyTemplate: StudioTemplateDefinition = {
  key: 'grid-copy',
  label: 'Grid Copy',
  category: 'spatial',
  description:
    'Copy a shaded pattern from the model grid into the empty grid beside it. Grid size and how many cells are shaded set the difficulty. The model stays on the page, so it is its own answer key.',
  pageCount: 1,
  producesAnswerKey: false,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1">
      <rect x="20" y="2" width="24" height="16"/><rect x="20" y="22" width="24" height="16"/>
      <path d="M28 2v16M36 2v16M20 7h24M20 13h24"/>
      <path d="M28 22v16M36 22v16M20 27h24M20 33h24"/>
    </g>
    <g fill="currentColor"><rect x="20" y="2" width="8" height="5"/><rect x="36" y="7" width="8" height="6"/></g>
  </svg>`,
  configSchema: [
    {
      key: 'gridSize',
      label: 'Grid size',
      type: 'number',
      default: 5,
      min: 3,
      max: 10,
      step: 1,
    },
    {
      key: 'fillDensity',
      label: 'Fill density',
      type: 'number',
      default: 0.4,
      min: 0.1,
      max: 0.8,
      step: 0.05,
      help: 'Higher = more shaded cells = harder.',
    },
  ],
  generate,
}
