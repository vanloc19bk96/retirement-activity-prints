import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, type StudioRng } from '../studio-rng'
import {
  contentBox,
  splitTop,
  insetBox,
  insetHorizontal,
  drawHeader,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { buildGroup, buildText, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines, snapGridInField } from '../studio-grid-rules'
import { buildPhosphorIconPath } from '../studio-phosphor-icon'
import { WHERE_WAS_IT_ICONS } from './icons'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'

export interface Placement {
  iconName: string
  row: number
  col: number
}

const STUDY_INSTRUCTION =
  'Remember where each item is. Study the grid for a minute. On the next page you ' +
  'will mark each item by its number. Then turn the page'

const RECALL_INSTRUCTION =
  'Write each item\'s number in the cell where you remember it. Use the numbered ' +
  'bank below. Do not look back'

const BANK_LABEL_H = STUDIO_BODY_SIZE
const BANK_GAP = 16
const BANK_NUMBER_SIZE = 22
const BANK_NUMBER_GAP = 8
/** Space between the grid bottom band and the Item bank label. */
const GRID_TO_BANK_GAP = 28

function splitGridAndBank(body: Box): { gridArea: Box; bankArea: Box } {
  const [gridArea, rest] = splitTop(body, body.height * 0.78)
  return {
    gridArea,
    bankArea: {
      ...rest,
      top: rest.top + GRID_TO_BANK_GAP,
      height: Math.max(0, rest.height - GRID_TO_BANK_GAP),
    },
  }
}

export function buildPlacements(
  catalog: readonly string[],
  gridSize: number,
  itemCount: number,
  rng: StudioRng,
): Placement[] {
  const count = Math.min(itemCount, gridSize * gridSize, catalog.length)
  const icons = rng.sample(catalog, count)
  const cells = rng
    .shuffle(Array.from({ length: gridSize * gridSize }, (_, i) => i))
    .slice(0, count)

  return icons.map((iconName, i) => ({
    iconName,
    row: Math.floor(cells[i] / gridSize),
    col: cells[i] % gridSize,
  }))
}

function buildGridObjects(
  area: Box,
  gridSize: number,
  showCellNumbers: boolean,
  _font: string,
  tag: StudioTag,
): { grid: ReturnType<typeof snapGridInField>; objects: StudioFabricObject[] } {
  const grid = snapGridInField(insetBox(area, 4), gridSize, gridSize)
  const objects: StudioFabricObject[] = [
    ...drawGridLines(grid.bounds, grid.cell, gridSize, gridSize, tag),
  ]
  if (showCellNumbers) {
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cell = grid.cellBox(r, c)
        const cellNum = String(r * gridSize + c + 1)
        objects.push(
          buildText(
            {
              left: cell.left + 6,
              top: cell.top + 6,
              text: cellNum,
              width: estimateTextBoxWidth(cellNum, 14, cell.width * 0.4),
              fontFamily: STUDIO_DIGIT_FONT,
              fontSize: 14,
              fill: STUDIO_INK_MUTED,
            },
            tag,
            'decoration',
          ),
        )
      }
    }
  }
  return { grid, objects }
}

function buildItemBankObjects(
  area: Box,
  placements: Placement[],
  cellSize: number,
  font: string,
  tag: StudioTag,
): StudioFabricObject[] {
  if (placements.length === 0) return []

  const label = 'Item bank:'
  const numberBand = BANK_NUMBER_GAP + BANK_NUMBER_SIZE

  const objects: StudioFabricObject[] = [
    buildText(
      {
        left: boxCenterX(area),
        top: area.top,
        text: label,
        width: estimateTextBoxWidth(label, BANK_LABEL_H, area.width),
        fontFamily: font,
        fontSize: BANK_LABEL_H,
        textAlign: 'center',
        originX: 'center',
        fill: STUDIO_INK_MUTED,
      },
      tag,
      'decoration',
    ),
  ]

  const count = placements.length
  let iconSize = Math.min(
    cellSize * 0.55,
    area.height - BANK_LABEL_H - BANK_GAP - numberBand - 8,
  )
  let gap = Math.max(12, iconSize * 0.35)
  // Shrink proportionally when many items would spill past the safe content width.
  // Leave a few px for stroke bleed outside the scaled phosphor bounds.
  const maxRowWidth = Math.max(1, area.width - 8)
  const rawRowWidth = count * iconSize + Math.max(0, count - 1) * gap
  if (rawRowWidth > maxRowWidth && rawRowWidth > 0) {
    const scale = maxRowWidth / rawRowWidth
    iconSize *= scale
    gap *= scale
  }

  const rowWidth = count * iconSize + Math.max(0, count - 1) * gap
  const startX = boxCenterX(area) - rowWidth / 2 + iconSize / 2
  const iconTop = area.top + BANK_LABEL_H + BANK_GAP + iconSize / 2
  const numberTop = iconTop + iconSize / 2 + BANK_NUMBER_GAP

  placements.forEach((placement, index) => {
    const left = startX + index * (iconSize + gap)
    objects.push(
      buildPhosphorIconPath(
        placement.iconName,
        {
          left,
          top: iconTop,
          size: iconSize,
        },
        tag,
        'decoration',
      ),
    )
    const itemNumber = String(index + 1)
    objects.push(
      buildText(
        {
          left,
          top: numberTop,
          text: itemNumber,
          width: estimateTextBoxWidth(itemNumber, BANK_NUMBER_SIZE, iconSize),
          fontFamily: STUDIO_DIGIT_FONT,
          fontSize: BANK_NUMBER_SIZE,
          textAlign: 'center',
          originX: 'center',
          fill: STUDIO_INK,
        },
        tag,
        'decoration',
      ),
    )
  })
  return objects
}

function buildStudyPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  placements: Placement[],
  gridSize: number,
  showCellNumbers: boolean,
  font: string,
): StudioPageOutput {
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, STUDY_INSTRUCTION)
  objects.push(...header.objects)

  const { grid, objects: gridObjects } = buildGridObjects(
    header.body,
    gridSize,
    showCellNumbers,
    font,
    tag,
  )

  for (const placement of placements) {
    const cell = grid.cellBox(placement.row, placement.col)
    gridObjects.push(
      buildPhosphorIconPath(
        placement.iconName,
        {
          left: boxCenterX(cell),
          top: boxCenterY(cell),
          size: grid.cell * 0.6,
        },
        tag,
        'prompt',
      ),
    )
  }
  objects.push(buildGroup(gridObjects, grid.bounds, tag))

  return { pageRole: 'study', objects }
}

function buildRecallPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  placements: Placement[],
  gridSize: number,
  showCellNumbers: boolean,
  font: string,
  rng: StudioRng,
): StudioPageOutput {
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, RECALL_INSTRUCTION)
  objects.push(...header.objects)

  const { gridArea, bankArea } = splitGridAndBank(header.body)
  const { grid, objects: gridObjects } = buildGridObjects(
    gridArea,
    gridSize,
    showCellNumbers,
    font,
    tag,
  )

  objects.push(buildGroup(gridObjects, grid.bounds, tag))

  const shuffled = rng.shuffle(placements)
  const bankObjects = buildItemBankObjects(bankArea, shuffled, grid.cell, font, tag)
  const bankBounds = unionObjectBounds(bankObjects)
  if (bankBounds) objects.push(buildGroup(bankObjects, bankBounds, tag))

  return { pageRole: 'recall', objects }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const gridSize = Math.min(6, Math.max(4, Number(config.gridSize ?? 5)))
  const itemCount = Math.min(10, Math.max(3, Number(config.itemCount ?? 6)))
  const showCellNumbers = config.showCellNumbers === true
  const font = String(config.fontFamily)
  // Digits appear under the recall item bank (and optionally in cells).
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  const rng = createRng(ctx.seed)

  const placements = buildPlacements(WHERE_WAS_IT_ICONS, gridSize, itemCount, rng)

  const studyTag: StudioTag = {
    templateKey: 'where-was-it',
    instanceId: ctx.instanceId,
    pageRole: 'study',
  }
  const recallTag: StudioTag = { ...studyTag, pageRole: 'recall' }

  return [
    buildStudyPage(config, ctx, studyTag, placements, gridSize, showCellNumbers, font),
    buildRecallPage(
      config,
      ctx,
      recallTag,
      placements,
      gridSize,
      showCellNumbers,
      font,
      rng,
    ),
  ]
}

export const whereWasItTemplate: StudioTemplateDefinition = {
  key: 'where-was-it',
  label: 'Where Was It?',
  category: 'memory',
  description:
    'Study where a few items sit on a grid, then write each item number back into its own cell from memory. Icons are generated fresh, so pages rarely repeat. Turn back to the study page to check.',
  pageCount: 2,
  producesAnswerKey: false,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.1">
      <rect x="6" y="6" width="24" height="24"/><path d="M14 6v24M22 6v24M6 14h24M6 22h24"/>
      <rect x="34" y="6" width="24" height="24"/><path d="M42 6v24M50 6v24M34 14h24M34 22h24"/>
    </g>
    <g stroke="currentColor" stroke-width="1.3" fill="none">
      <circle cx="10" cy="10" r="2"/><path d="M25 17l2 2 2-2"/><rect x="17" y="25" width="4" height="4"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'gridSize',
      label: 'Grid size',
      type: 'number',
      default: 5,
      min: 4,
      max: 6,
      step: 1,
      help: 'A 5×5 grid has 25 cells. Bigger = harder.',
    },
    {
      key: 'itemCount',
      label: 'Number of items',
      type: 'number',
      default: 6,
      min: 3,
      max: 10,
      step: 1,
      help: 'How many items to place and remember. More = harder.',
    },
    {
      key: 'showCellNumbers',
      label: 'Show cell numbers (easier)',
      type: 'toggle',
      default: false,
      help: 'Faint numbers in each cell make it easier to map positions.',
    },
  ],
  generate,
}
