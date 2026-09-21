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
  insetHorizontal,
  insetBox,
  drawHeader,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  fitFontSizeToWidth,
  toNonBreakingSpaces,
  type Box,
} from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_INK_MUTED,
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import {
  type StroopVariant,
  clampItemCount,
  copyFor,
  buildItems,
} from './items'
import { drawStroopGrid } from './draw'
import {
  buildDirectionArrow,
  directionArrowSlot,
  type StroopDirection,
} from './direction-arrow'
import {
  columnCountFor,
  preferredCellHeight,
  fitStroopTable,
} from './table'

export { buildOne, buildItems, clampItemCount, copyFor } from './items'
export type { StroopItem, StroopVariant, StroopCondition } from './items'

const EXAMPLE_H = 34
/**
 * Breathing room from safe edges + hairline clearance.
 * Matches grid-copy so outer bars never sit flush on the margin.
 */
const STROKE_INSET = 16

function parseVariant(raw: unknown): StroopVariant {
  if (raw === 'direction' || raw === 'count-word') return raw
  return 'number'
}

const EXAMPLE_PART_GAP = 8

/** “Example: UP ↓ answer is down” — path arrow so editor/PDF/SVG match. */
function drawDirectionExample(
  objects: StudioFabricObject[],
  box: Box,
  font: string,
  tag: StudioTag,
): void {
  const size = Math.round(STUDIO_BODY_SIZE * 0.75)
  const parts: Array<{ kind: 'text'; text: string } | { kind: 'arrow'; dir: StroopDirection }> = [
    { kind: 'text', text: 'Example: UP' },
    { kind: 'arrow', dir: 'down' },
    { kind: 'text', text: 'answer is' },
    { kind: 'text', text: 'down' },
  ]
  const widths = parts.map((part) =>
    part.kind === 'text'
      ? estimateTextBoxWidth(part.text, size, box.width)
      : directionArrowSlot(size),
  )
  const totalW =
    widths.reduce((sum, w) => sum + w, 0) + EXAMPLE_PART_GAP * (parts.length - 1)
  let cursor = boxCenterX(box) - totalW / 2
  const midY = boxCenterY(box)

  parts.forEach((part, i) => {
    const w = widths[i]!
    if (part.kind === 'text') {
      objects.push(
        buildText(
          {
            left: cursor,
            top: midY,
            text: part.text,
            width: w,
            fontFamily: font,
            fontSize: size,
            fill: STUDIO_INK_MUTED,
            originY: 'center',
          },
          tag,
          'decoration',
        ),
      )
    } else {
      objects.push(
        buildDirectionArrow(cursor + w / 2, midY, size, part.dir, tag, 'decoration'),
      )
    }
    cursor += w + EXAMPLE_PART_GAP
  })
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const variant = parseVariant(config.variant)
  const itemCount = clampItemCount(Number(config.itemCount ?? 30))
  const font = String(config.fontFamily)
  const rng = createRng(ctx.seed)

  const tag: StudioTag = {
    templateKey: 'stroop-sheet',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const { instruction, example } = copyFor(variant)
  const header = drawHeader(content, config, tag, instruction)
  objects.push(...header.objects)

  const [exampleBox, afterExample] = splitTop(header.body, EXAMPLE_H)
  if (variant === 'direction') {
    drawDirectionExample(objects, exampleBox, font, tag)
  } else {
    // NBSP — spaced example runs must stay one line (Fabric wraps at spaces).
    const exampleText = toNonBreakingSpaces(`Example: ${example}`)
    const exampleSize = fitFontSizeToWidth(
      exampleText,
      exampleBox.width,
      Math.round(STUDIO_BODY_SIZE * 0.75),
      10,
    )
    objects.push(
      buildText(
        {
          left: boxCenterX(exampleBox),
          top: boxCenterY(exampleBox),
          text: exampleText,
          width: estimateTextBoxWidth(exampleText, exampleSize, exampleBox.width),
          fontFamily: font,
          fontSize: exampleSize,
          fill: STUDIO_INK_MUTED,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
        },
        tag,
        'decoration',
      ),
    )
  }

  const field = insetBox(afterExample, STROKE_INSET)
  const items = buildItems(variant, itemCount, rng)
  const cols = columnCountFor(variant)
  const table = fitStroopTable(field, itemCount, cols, preferredCellHeight(variant))
  drawStroopGrid(objects, table, items, variant, font, tag)

  return [{ pageRole: 'single', objects }]
}

export const stroopSheetTemplate: StudioTemplateDefinition = {
  key: 'stroop-sheet',
  label: 'Stroop Sheet',
  category: 'focus',
  description:
    'A black and white Stroop test. Answer what each item shows instead of the word you cannot help reading: count the digits, follow the arrow, or count the repeats. Time yourself and compare runs.',
  pageCount: 1,
  producesAnswerKey: false,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="monospace" font-size="8" fill="currentColor">
      <text x="6" y="12">3 3 3 3</text><text x="6" y="24">5 5</text><text x="6" y="36">2 2 2</text>
    </g>
    <g stroke="currentColor" stroke-width="1" fill="none">
      <path d="M44 8h14M44 20h14M44 32h14"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'variant',
      label: 'Stroop type',
      type: 'select',
      default: 'number',
      options: [
        { label: 'Number (count the digits)', value: 'number' },
        { label: 'Direction (name the arrow)', value: 'direction' },
        { label: 'Count-word (count repeats)', value: 'count-word' },
      ],
      help: 'All are black & white versions of the Stroop task, so no color is needed.',
    },
    {
      key: 'itemCount',
      label: 'Number of items',
      type: 'number',
      default: 30,
      min: 12,
      max: 60,
      step: 6,
      help: 'How many items on the sheet.',
    },
  ],
  generate,
}
