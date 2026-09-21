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
  fitSquareGrid,
  drawHeader,
  drawInstructionBand,
  studyStyleInstructionWidth,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  unionObjectBounds,
} from '../studio-layout'
import { buildText, buildCircle, buildGroup, type StudioTag } from '../studio-fabric-builders'
import {
  buildPhosphorIconPath,
  hasPhosphorIcon,
} from '../studio-phosphor-icon'
import {
  STUDIO_INK,
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DIGIT_FONT,
  STUDIO_INSTRUCTION_SIZE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  DENSITY_CELLS,
  buildField,
  buildInstruction,
  clampCellsToFit,
  effectiveTargetCount,
  parseDensity,
  parseDiscrimination,
  parseSymbolType,
  parseTask,
  usesIconSymbols,
} from './field'
import { drawAnswerStrip, drawTargetsBanner } from './draw'

export {
  buildField,
  buildInstruction,
  pickDistractors,
  pickTargets,
  splitEvenlyWithJitter,
  clampCellsToFit,
  clampTargetCount,
  effectiveTargetCount,
  usesIconSymbols,
} from './field'
export type {
  CountingField,
  SymbolType,
  Discrimination,
  Density,
  HuntTask,
} from './field'

const BANNER_H = 32
/** Extra air between the Targets legend and the symbol grid. */
const BANNER_TO_GRID_GAP = 16
const ANSWER_STRIP_H = 48
const ANSWER_GAP = 20
/** Room for answer rings so stroke stays inside the safe area. */
const FIELD_INSET = 8
/**
 * Glyph share of the cell. Squares fill the em-box to the corners — keep this
 * well under the ring cap (`cell * 0.48`) so answer rings have visible air.
 */
const GLYPH_CELL_RATIO = 0.5
/** Clearance between glyph corner (half-diagonal) and answer-ring path. */
const RING_GAP = 5

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const symbolType = parseSymbolType(config.symbolType)
  const targetCount = effectiveTargetCount(symbolType, Number(config.targetCount ?? 1))
  const discrimination = parseDiscrimination(config.discrimination)
  const density = parseDensity(config.density)
  const task = parseTask(config.task)
  const font = String(config.fontFamily)
  // Digits/letter cells + count boxes use Inter; icons are Phosphor paths.
  const cellFont = symbolType === 'letters' ? font : STUDIO_DIGIT_FONT
  const rng = createRng(ctx.seed)
  const showAnswerBoxes = task === 'count' || task === 'both'
  if (!usesIconSymbols(symbolType) || showAnswerBoxes) {
    void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  }

  const tag: StudioTag = {
    templateKey: 'symbol-hunt',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const instruction = buildInstruction(targetCount, task)
  // Title only; band width hugs copy so longer count text does not soft-wrap.
  const header = drawHeader(content, { ...config, showInstructions: false }, tag, '')
  objects.push(...header.objects)

  let body = header.body
  if (config.showInstructions !== false && instruction) {
    const band = drawInstructionBand(body, instruction, font, tag, {
      width: Math.max(
        studyStyleInstructionWidth(body.width),
        estimateTextBoxWidth(instruction, STUDIO_INSTRUCTION_SIZE, body.width),
      ),
    })
    objects.push(...band.objects)
    body = band.body
  }

  const [banner, afterBanner] = splitTop(body, BANNER_H + BANNER_TO_GRID_GAP)
  const [fieldArea, answerArea] = showAnswerBoxes
    ? splitTop(afterBanner, Math.max(80, afterBanner.height - ANSWER_STRIP_H - ANSWER_GAP))
    : [afterBanner, null]

  const gridBox = insetBox(fieldArea, FIELD_INSET)
  const requested = DENSITY_CELLS[density]
  const { totalCells, cols, rows } = clampCellsToFit(
    requested,
    gridBox.width,
    gridBox.height,
  )

  const field = buildField({
    symbolType,
    targetCount,
    totalCells,
    cols,
    rows,
    discrimination,
    rng,
  })

  const targetSet = new Set(field.targets)
  const grid = fitSquareGrid(gridBox, cols, rows)

  // Legend rides with the grid; keep text in the top BANNER_H of the slot so the
  // reserved BANNER_TO_GRID_GAP stays as clear space above the field.
  const bannerY = Math.max(
    banner.top + BANNER_H / 2,
    grid.bounds.top - BANNER_H / 2 - BANNER_TO_GRID_GAP,
  )
  drawTargetsBanner({
    objects,
    banner,
    bannerY,
    targets: field.targets,
    font,
    symbolFont: cellFont,
    tag,
  })

  // Cap symbol so corners + RING_GAP still fit under the neighbor-safe ring.
  const maxRingRadius = grid.cell * 0.48
  const maxSizeForRing = (maxRingRadius - RING_GAP) / (0.5 * Math.SQRT2)
  const symbolSize = Math.max(
    10,
    Math.min(grid.cell * GLYPH_CELL_RATIO, STUDIO_BODY_SIZE, maxSizeForRing),
  )
  // Size for square corners (half-diagonal), not the soft mid-side of rounder icons.
  const ringRadius = Math.min(
    Math.max(6, symbolSize * 0.5 * Math.SQRT2 + RING_GAP),
    maxRingRadius,
  )
  const gridObjects: StudioFabricObject[] = []

  field.cells.forEach((sym, i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    if (r >= rows) return
    const cell = grid.cellBox(r, c)
    const cx = boxCenterX(cell)
    const cy = boxCenterY(cell)
    if (hasPhosphorIcon(sym)) {
      gridObjects.push(
        buildPhosphorIconPath(
          sym,
          { left: cx, top: cy, size: symbolSize },
          tag,
          'prompt',
        ),
      )
    } else {
      gridObjects.push(
        buildText(
          {
            left: cx,
            top: cy,
            text: sym,
            width: estimateTextBoxWidth(sym, symbolSize, cell.width),
            fontFamily: cellFont,
            fontSize: symbolSize,
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
          },
          tag,
          'prompt',
        ),
      )
    }
    // Mark / mark-and-count: one hidden ring per target occurrence.
    if ((task === 'cancel' || task === 'both') && targetSet.has(sym)) {
      gridObjects.push(
        buildCircle(
          {
            left: cx,
            top: cy,
            radius: ringRadius,
            fill: 'transparent',
            stroke: STUDIO_INK,
            strokeWidth: STUDIO_STROKE_NORMAL,
          },
          tag,
          'answer',
        ),
      )
    }
  })

  const gridBounds = unionObjectBounds(gridObjects) ?? grid.bounds
  objects.push(buildGroup(gridObjects, gridBounds, tag))

  if (showAnswerBoxes && answerArea) {
    drawAnswerStrip(objects, answerArea, field.targets, field.counts, cellFont, tag)
  }

  return [{ pageRole: 'single', objects }]
}

export const symbolHuntTemplate: StudioTemplateDefinition = {
  key: 'symbol-hunt',
  label: 'Symbol Hunt',
  category: 'focus',
  description:
    'Find and mark every target symbol in a dense field of symbols, or count them instead of marking. Trains visual scanning and sustained attention. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-family="monospace" font-size="8" fill="currentColor" text-anchor="middle" dominant-baseline="central">
      <text x="10" y="10">●</text><text x="20" y="10">■</text><text x="30" y="10">▲</text>
      <text x="40" y="10">◆</text><text x="50" y="10">★</text><text x="60" y="10">✚</text>
      <text x="10" y="20">▲</text><text x="20" y="20">●</text><text x="30" y="20">✚</text>
      <text x="40" y="20">■</text><text x="50" y="20">◆</text><text x="60" y="20">★</text>
      <text x="10" y="30">◆</text><text x="20" y="30">★</text><text x="30" y="30">●</text>
      <text x="40" y="30">▲</text><text x="50" y="30">✚</text><text x="60" y="30">■</text>
    </g>
    <circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" stroke-width="1.25"/>
  </svg>`,
  configSchema: [
    {
      key: 'symbolType',
      label: 'Symbols',
      type: 'select',
      default: 'icons',
      options: [
        { label: 'Icons (recommended)', value: 'icons' },
        { label: 'Digits (0–9)', value: 'digits' },
        { label: 'Letters (looks like a word search)', value: 'letters' },
      ],
      help: 'A dense grid of letters looks like a word search, so it is limited to one target.',
    },
    {
      key: 'targetCount',
      label: 'How many targets',
      type: 'number',
      default: 1,
      min: 1,
      max: 3,
      step: 1,
      help: 'Two or three targets at once is much harder. Letter grids are always limited to one.',
      visibleWhen: (c) => c.symbolType !== 'letters',
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
        { label: 'Dense (~300)', value: 'dense' },
      ],
      help: 'More symbols = longer, harder scan.',
    },
    {
      key: 'task',
      label: 'What to do',
      type: 'select',
      default: 'cancel',
      options: [
        { label: 'Mark every target (cancellation)', value: 'cancel' },
        { label: 'Count the targets', value: 'count' },
        { label: 'Mark and count', value: 'both' },
      ],
      help: 'Marking is gentler, with no running total to lose track of.',
    },
  ],
  generate,
}
