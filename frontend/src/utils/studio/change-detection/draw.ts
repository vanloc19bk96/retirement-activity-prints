import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import {
  contentBox,
  splitTop,
  rows,
  insetBox,
  insetHorizontal,
  drawHeader,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  toNonBreakingSpaces,
  type Box,
} from '../studio-layout'
import {
  buildCircle,
  buildGroup,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import { drawGridLines, snapGridInField } from '../studio-grid-rules'
import {
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_INK,
  STUDIO_SECTION_GAP,
  STUDIO_STROKE_BOLD,
} from '@/constants/studio.constants'
import { drawGlyph } from './glyphs'
import type { CellState } from './trials'

const LABEL_H = STUDIO_BODY_SIZE
const LABEL_GAP = 12
const MEMORY_STACK_GUTTER = STUDIO_SECTION_GAP
/** Leave breathing room around the stacked pair (both grids stay equal). */
const MEMORY_FIELD_SCALE = 0.88

function scaleCenteredBox(box: Box, scale: number): Box {
  const width = Math.floor(box.width * scale)
  const height = Math.floor(box.height * scale)
  return {
    left: Math.round(box.left + (box.width - width) / 2),
    top: Math.round(box.top + (box.height - height) / 2),
    width,
    height,
  }
}

const MEMORY_INSTRUCTION =
  'Study the top grid until you can picture it. Cover it, then circle every cell ' +
  'in the bottom grid that is different'

/**
 * Titled N×N glyph grid. When `changed` is set, each changed cell gets a
 * hidden answer ring (revealed on the answer-key page).
 */
function drawLabeledGrid(options: {
  objects: StudioFabricObject[]
  area: Box
  title: string
  cells: CellState[][]
  changed: boolean[][] | null
  size: number
  font: string
  tag: StudioTag
}): void {
  const { objects, area, title, cells, changed, size, font, tag } = options
  const [titleBox, gridArea] = splitTop(area, LABEL_H + LABEL_GAP)
  // NBSP — bold label metrics under-estimate and soft-wrap at spaces ("What changed?").
  const titleOneLine = toNonBreakingSpaces(title)
  objects.push(
    buildText(
      {
        left: boxCenterX(titleBox),
        top: boxCenterY(titleBox),
        text: titleOneLine,
        width: estimateTextBoxWidth(titleOneLine, LABEL_H, titleBox.width),
        fontFamily: font,
        fontSize: LABEL_H,
        fontWeight: 700,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
      },
      tag,
      'decoration',
    ),
  )

  // Inset leaves room for answer-ring stroke past the outer bars.
  const g = snapGridInField(insetBox(gridArea, 4), size, size)
  const gridObjects: StudioFabricObject[] = [
    ...drawGridLines(g.bounds, g.cell, size, size, tag),
  ]

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = g.cellBox(r, c)
      gridObjects.push(...drawGlyph(cells[r][c], cell, g.cell, tag, 'prompt'))

      if (changed?.[r][c]) {
        gridObjects.push(
          buildCircle(
            {
              left: boxCenterX(cell),
              top: boxCenterY(cell),
              radius: g.cell * 0.46,
              stroke: STUDIO_INK,
              strokeWidth: STUDIO_STROKE_BOLD,
            },
            tag,
            'answer',
          ),
        )
      }
    }
  }

  objects.push(buildGroup(gridObjects, g.bounds, tag))
}

export function layoutMemory(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  study: CellState[][]
  test: CellState[][]
  changed: boolean[][]
  size: number
  font: string
}): StudioPageOutput {
  const { config, ctx, tag, study, test, changed, size, font } = options
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, MEMORY_INSTRUCTION)
  objects.push(...header.objects)

  // Equal slots so both N×N grids share the same cell size; scaled down for breathing room.
  const field = scaleCenteredBox(header.body, MEMORY_FIELD_SCALE)
  const [studyArea, testArea] = rows(field, 2, MEMORY_STACK_GUTTER)

  drawLabeledGrid({
    objects,
    area: studyArea,
    title: 'Study this',
    cells: study,
    changed: null,
    size,
    font,
    tag,
  })

  drawLabeledGrid({
    objects,
    area: testArea,
    title: 'What changed?',
    cells: test,
    changed,
    size,
    font,
    tag,
  })

  return { pageRole: 'single', objects }
}

/**
 * Solution page: only the test grid with answer rings — no study section.
 * Centered large in the body so the key reads as one composition.
 */
export function layoutSolution(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  test: CellState[][]
  changed: boolean[][]
  size: number
  font: string
}): StudioPageOutput {
  const { config, ctx, tag, test, changed, size, font } = options
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  // Empty instruction — solution page drops how-to copy via buildAnswerPage.
  const header = drawHeader(content, config, tag, '')
  objects.push(...header.objects)

  const field = scaleCenteredBox(header.body, MEMORY_FIELD_SCALE)
  drawLabeledGrid({
    objects,
    area: field,
    title: 'What changed?',
    cells: test,
    changed,
    size,
    font,
    tag,
  })

  return { pageRole: 'single', objects }
}
