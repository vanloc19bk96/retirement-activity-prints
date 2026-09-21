import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioConfigLayoutContext,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, deriveSeed } from '../studio-rng'
import {
  contentBox,
  insetHorizontal,
  drawHeader,
  measureHeaderHeight,
} from '../studio-layout'
import { type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { drawItemStack, fitItemCount } from './draw'
import { buildItemForDifficulty, minBlockSpan } from './item'
import type { Difficulty, Format, Item } from './types'

const MIN_ITEM = 4
/** Above 12 rows the blocks print too small to judge a rotation reliably. */
const MAX_ITEM = 12
const DEFAULT_ITEM = 8

function parseFormat(raw: unknown): Format {
  if (raw === 'pick-matches') return raw
  return 'same-different'
}

function parseDifficulty(raw: unknown): Difficulty {
  if (raw === 'easy' || raw === 'hard') return raw
  return 'medium'
}

function clampItemCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_ITEM
  return Math.min(MAX_ITEM, Math.max(MIN_ITEM, Math.round(n)))
}

/** How many rows this page + format + difficulty can hold at print-legible size. */
export function resolveItemCountMax(
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): number {
  if (!layout) return MAX_ITEM
  const format = parseFormat(config.format)
  const difficulty = parseDifficulty(config.difficulty)
  const packSpan = minBlockSpan(difficulty)
  const ctx: StudioGenerateContext = {
    pageWidth: layout.pageWidth,
    pageHeight: layout.pageHeight,
    margin: layout.margin,
    seed: 0,
    instanceId: 'item-count-max',
  }
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const instruction = instructionFor(format)
  const bodyHeight = content.height - measureHeaderHeight(config, instruction, content.width)
  return fitItemCount({
    bodyHeight,
    format,
    blockSpan: packSpan,
    requested: MAX_ITEM,
    floor: MIN_ITEM,
  })
}

function instructionFor(format: Format): string {
  if (format === 'pick-matches') {
    return 'Tick the two shapes that match the one on the left (rotated, not mirrored)'
  }
  return (
    'Look at the shape on the left, then the shape beside it. If it is the SAME shape simply ' +
    'turned around, circle SAME. If it is a mirror image (flipped over), circle MIRROR'
  )
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  items: Item[]
  format: Format
  font: string
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, items, format, font, instruction } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  const objects: StudioFabricObject[] = [...header.objects]
  drawItemStack(objects, header.body, items, format, font, tag)
  return objects
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const format = parseFormat(config.format)
  const difficulty = parseDifficulty(config.difficulty)
  const font = String(config.fontFamily)

  const tag: StudioTag = {
    templateKey: 'shape-rotation-match',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const instruction = instructionFor(format)

  // Pack for the compact bounding box this tier can actually fill. Reserving for
  // the tallest 5-wide hard shape is why pick-the-matches silently dropped 8 → 6.
  const packSpan = minBlockSpan(difficulty)
  const itemCount = fitItemCount({
    bodyHeight: content.height - measureHeaderHeight(config, instruction, content.width),
    format,
    blockSpan: packSpan,
    requested: clampItemCount(Number(config.itemCount ?? DEFAULT_ITEM)),
    floor: MIN_ITEM,
  })

  // Shared identity set → distinct reference silhouettes across the page.
  const usedIdentities = new Set<string>()
  const items: Item[] = []
  for (let i = 0; i < itemCount; i++) {
    const rng = createRng(deriveSeed(ctx.seed, `rot:${i}`))
    items.push(buildItemForDifficulty(format, difficulty, rng, usedIdentities, packSpan))
  }

  const layout = { config, ctx, tag, items, format, font }
  const objects = layoutPage({ ...layout, instruction })
  // No how-to on the key — taller body so the grouped stack re-centers optically.
  const answerSourceObjects = layoutPage({ ...layout, instruction: '' })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const shapeRotationMatchTemplate: StudioTemplateDefinition = {
  key: 'shape-rotation-match',
  label: 'Shape Rotation Match',
  category: 'spatial',
  description:
    'Decide whether each pair of blocks is the same shape turned around or a mirror image. Solid black and white silhouettes drawn for print. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  // Same L-tetromino twice: left upright, right turned 90° (accent tracks the foot).
  // Both shapes share top y=6 so they sit on one horizontal band.
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor">
      <path d="M8 6h7v14h7v7H8z" stroke-width="2"/>
      <path d="M8 13h7M8 20h7M15 20v7" stroke-width="0.8"/>
      <path d="M38 6h14v7h-7v14H38z" stroke-width="2"/>
      <path d="M45 6v7M38 13h7M38 20h7" stroke-width="0.8"/>
    </g>
    <g fill="currentColor">
      <rect x="15" y="20" width="7" height="7"/>
      <rect x="45" y="6" width="7" height="7"/>
    </g>
    <g font-size="7" fill="currentColor" font-family="sans-serif" text-anchor="middle">
      <text x="32" y="37">?</text></g>
  </svg>`,
  configSchema: [
    {
      key: 'format',
      label: 'Question style',
      type: 'select',
      default: 'same-different',
      options: [
        { label: 'Same or mirrored? (one candidate)', value: 'same-different' },
        { label: 'Pick the matches (four candidates)', value: 'pick-matches' },
      ],
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Easy (5–7 blocks, 90°/180°)', value: 'easy' },
        { label: 'Medium (7–9 blocks)', value: 'medium' },
        { label: 'Hard (8–10 blocks, all angles)', value: 'hard' },
      ],
    },
    {
      key: 'itemCount',
      label: 'Number of items',
      type: 'number',
      default: DEFAULT_ITEM,
      min: MIN_ITEM,
      max: MAX_ITEM,
      step: 1,
      maxWhen: resolveItemCountMax,
      helpWhen: (config, layout) => {
        const max = resolveItemCountMax(config, layout)
        return `How many puzzles on the page. Max ${max} for this page size, question style, and difficulty so every block stays readable.`
      },
    },
  ],
  generate,
}
