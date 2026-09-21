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
  insetBox,
  insetHorizontal,
  drawHeader,
  unionObjectBounds,
} from '../studio-layout'
import { buildGroup, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  DENSITY_CELLS,
  buildField,
  buildInstruction,
  clampCellsToFit,
  clampTargetCount,
  parseDensity,
  parseDiscrimination,
  parseSymbolType,
} from './field'
import { drawStreams, drawTargetsBanner } from './draw'
import { drawAnswerStrip } from './answer-strip'

export {
  buildField,
  buildInstruction,
  pickDistractors,
  splitEvenlyWithJitter,
  clampCellsToFit,
  clampTargetCount,
  usesIconSymbols,
  isCountingIconSymbol,
} from './field'
export type { CountingField, SymbolType, Discrimination, Density } from './field'

const BANNER_H = 32
const ANSWER_STRIP_H = 48
const ANSWER_GAP = 20

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const symbolType = parseSymbolType(config.symbolType)
  const targetCount = clampTargetCount(Number(config.targetCount ?? 1))
  const discrimination = parseDiscrimination(config.discrimination)
  const density = parseDensity(config.density)
  const font = String(config.fontFamily)
  const isDigits = symbolType === 'digits'
  const cellFont = isDigits ? STUDIO_DIGIT_FONT : font
  const rng = createRng(ctx.seed)
  // Cells (when digits) + answer counts use Inter lining figures.
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const tag: StudioTag = {
    templateKey: 'counting-streams',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const instruction = buildInstruction(targetCount)
  const header = drawHeader(content, config, tag, instruction)
  objects.push(...header.objects)

  const [banner, afterBanner] = splitTop(header.body, BANNER_H)
  const [fieldArea, answerArea] = splitTop(
    afterBanner,
    Math.max(80, afterBanner.height - ANSWER_STRIP_H - ANSWER_GAP),
  )

  const streamBox = insetBox(fieldArea, 4)
  const requested = DENSITY_CELLS[density]
  const { totalCells, cols, rows: rowCount } = clampCellsToFit(
    requested,
    streamBox.width,
    streamBox.height,
  )

  const field = buildField({
    symbolType,
    targetCount,
    totalCells,
    cols,
    rows: rowCount,
    discrimination,
    rng,
  })

  drawTargetsBanner({
    objects,
    banner,
    targets: field.targets,
    font,
    symbolFont: cellFont,
    tag,
  })

  const streamObjects = drawStreams({
    box: streamBox,
    cells: field.cells,
    cols,
    rowCount,
    cellFont,
    tag,
  })
  const streamBounds = unionObjectBounds(streamObjects) ?? streamBox
  objects.push(buildGroup(streamObjects, streamBounds, tag))

  drawAnswerStrip(
    objects,
    answerArea,
    field.targets,
    field.counts,
    font,
    STUDIO_DIGIT_FONT,
    tag,
  )

  return [{ pageRole: 'single', objects }]
}

export const countingStreamsTemplate: StudioTemplateDefinition = {
  key: 'counting-streams',
  label: 'Counting Streams',
  category: 'focus',
  description:
    'Scan long rows of symbols and write down how many times each target appears. Counting only, with nothing to mark. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="monospace" font-size="6" fill="currentColor">
      <text x="2" y="10">4 7 1 3 9 7 2 8</text>
      <line x1="2" y1="13" x2="62" y2="13" stroke="currentColor" stroke-width="0.8"/>
      <text x="2" y="22">1 3 8 5 7 3 0 6</text>
      <line x1="2" y1="25" x2="62" y2="25" stroke="currentColor" stroke-width="0.8"/>
      <text x="2" y="34">7 2 3 7 5 3 1 4</text>
      <line x1="2" y1="37" x2="62" y2="37" stroke="currentColor" stroke-width="0.8"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'symbolType',
      label: 'Symbols',
      type: 'select',
      default: 'digits',
      options: [
        { label: 'Digits (0–9)', value: 'digits' },
        { label: 'Letters', value: 'letters' },
        { label: 'Shapes', value: 'shapes' },
        { label: 'Arrows', value: 'arrows' },
      ],
      help: 'Digits and letters suit most readers; shapes and arrows need no reading at all.',
    },
    {
      key: 'targetCount',
      label: 'How many targets to count',
      type: 'number',
      default: 1,
      min: 1,
      max: 3,
      step: 1,
      help: 'Counting two or three different symbols at once is much harder.',
    },
    {
      key: 'discrimination',
      label: 'Difficulty',
      type: 'select',
      default: 'standard',
      options: [
        { label: 'Easy (target stands out)', value: 'easy' },
        { label: 'Standard', value: 'standard' },
        { label: 'Hard (targets look like distractors)', value: 'hard' },
      ],
    },
    {
      key: 'density',
      label: 'Amount of symbols',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Light (~120)', value: 'light' },
        { label: 'Medium (~240)', value: 'medium' },
        { label: 'Dense (~400)', value: 'dense' },
      ],
      help: 'More symbols = longer streams to scan.',
    },
  ],
  generate,
}
