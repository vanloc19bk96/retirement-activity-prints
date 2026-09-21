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
  drawHeader,
  insetHorizontal,
  insetBox,
  columns,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  type Box,
} from '../studio-layout'
import { buildGroup, buildText, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_INK,
  STUDIO_BODY_SIZE,
  STUDIO_SECTION_GAP,
  STUDIO_DIGIT_FONT,
} from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  buildCodingSymbol,
  selectCodingSymbols,
  type CodingSymbolId,
} from './symbols'

const INSTRUCTION = 'Use the key at the top. Write the matching digit in each cell'
/** First N grid cells show the answer as worked examples. */
const EXAMPLE_ANSWER_COUNT = 2
const GRID_COLS = 8
const KEY_HEIGHT = 58
const KEY_SYMBOL_SIZE = 22
/** Tiny space between key digit and the cell bottom edge. */
const KEY_DIGIT_BOTTOM_GAP = 4
/** Keep key + grid clear of the body / safe-area edges. */
const FIELD_INSET = 12
const KEY_GRID_GAP = STUDIO_SECTION_GAP / 2

function layoutCodingBlock(field: Box, symbolCount: number, cellCount: number) {
  const rowCount = Math.max(1, Math.ceil(cellCount / GRID_COLS))
  const gridBudgetH = Math.max(1, field.height - KEY_HEIGHT - KEY_GRID_GAP)
  const cell = Math.max(
    1,
    Math.floor(Math.min(field.width / GRID_COLS, gridBudgetH / rowCount)),
  )
  const gridW = cell * GRID_COLS
  const gridH = cell * rowCount
  const blockH = KEY_HEIGHT + KEY_GRID_GAP + gridH
  const left = Math.round(field.left + (field.width - gridW) / 2)
  const top = Math.round(field.top + (field.height - blockH) / 2)
  const keyStrip: Box = { left, top, width: gridW, height: KEY_HEIGHT }
  const gridBounds: Box = {
    left,
    top: top + KEY_HEIGHT + KEY_GRID_GAP,
    width: gridW,
    height: gridH,
  }
  return {
    cell,
    keyStrip,
    keyCells: columns(keyStrip, symbolCount, 0),
    gridBounds,
    cellBox: (r: number, c: number): Box => ({
      left: left + c * cell,
      top: gridBounds.top + r * cell,
      width: cell,
      height: cell,
    }),
  }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const symbolCount = Number(config.symbolCount ?? 6)
  const cellCount = Number(config.cellCount ?? 48)
  const rng = createRng(ctx.seed)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)

  const tag: StudioTag = {
    templateKey: 'symbol-digit-coding',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  // Seeded sample from a large pool so multi-page books rarely reuse the same key.
  const symbols = selectCodingSymbols(rng, symbolCount)
  const count = symbols.length
  const keyMap = symbols.map((sym, i) => ({ sym, digit: i + 1 }))

  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const { objects: headerObjects, body } = drawHeader(content, config, tag, INSTRUCTION)
  objects.push(...headerObjects)

  const field = insetBox(body, FIELD_INSET)
  const layout = layoutCodingBlock(field, count, cellCount)

  const keyCellW = layout.keyStrip.width / count
  const keyObjects: StudioFabricObject[] = [
    ...drawGridLines(layout.keyStrip, keyCellW, count, 1, tag, {
      rowPitch: KEY_HEIGHT,
    }),
  ]
  keyMap.forEach((entry, i) => {
    const cell = layout.keyCells[i]!
    keyObjects.push(
      ...buildCodingSymbol(
        entry.sym,
        {
          left: boxCenterX(cell),
          top: cell.top + 6 + KEY_SYMBOL_SIZE / 2,
        },
        KEY_SYMBOL_SIZE,
        tag,
        'key',
      ),
    )
    const digit = String(entry.digit)
    keyObjects.push(
      buildText(
        {
          left: boxCenterX(cell),
          top: cell.top + KEY_HEIGHT - KEY_DIGIT_BOTTOM_GAP - STUDIO_BODY_SIZE,
          text: digit,
          width: estimateTextBoxWidth(digit, STUDIO_BODY_SIZE, cell.width),
          fontSize: STUDIO_BODY_SIZE,
          fontFamily: STUDIO_DIGIT_FONT,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'key',
      ),
    )
  })
  objects.push(buildGroup(keyObjects, layout.keyStrip, tag))

  const digitBySym = new Map<CodingSymbolId, number>(keyMap.map((k) => [k.sym, k.digit]))
  // Slightly larger than before, still leave room for the answer digit below.
  const cellSymbolSize = Math.min(21, layout.cell * 0.45)
  const rowCount = Math.max(1, Math.ceil(cellCount / GRID_COLS))
  const gridObjects: StudioFabricObject[] = [
    ...drawGridLines(layout.gridBounds, layout.cell, GRID_COLS, rowCount, tag),
  ]
  for (let i = 0; i < cellCount; i++) {
    const r = Math.floor(i / GRID_COLS)
    const c = i % GRID_COLS
    const cell = layout.cellBox(r, c)
    const sym = rng.pick(symbols)
    gridObjects.push(
      ...buildCodingSymbol(
        sym,
        {
          left: boxCenterX(cell),
          top: cell.top + 4 + cellSymbolSize / 2,
        },
        cellSymbolSize,
        tag,
        'prompt',
      ),
    )
    const isExample = i < EXAMPLE_ANSWER_COUNT
    const digitText = String(digitBySym.get(sym) ?? '')
    const digitSize = Math.min(STUDIO_BODY_SIZE, layout.cell * 0.35)
    gridObjects.push(
      buildText(
        {
          left: boxCenterX(cell),
          top: boxCenterY(cell) + layout.cell * 0.1,
          text: digitText,
          width: estimateTextBoxWidth(digitText, digitSize, cell.width),
          fontSize: digitSize,
          fontFamily: STUDIO_DIGIT_FONT,
          textAlign: 'center',
          originX: 'center',
          fill: STUDIO_INK,
        },
        tag,
        // Worked examples stay visible; remaining digits are answer-key only.
        isExample ? 'prompt' : 'answer',
      ),
    )
  }
  objects.push(buildGroup(gridObjects, layout.gridBounds, tag))

  return [{ pageRole: 'single', objects }]
}

export const symbolDigitCodingTemplate: StudioTemplateDefinition = {
  key: 'symbol-digit-coding',
  label: 'Symbol–Digit Coding',
  category: 'focus',
  description:
    'Learn the symbol-to-digit key at the top of the page, then write the matching digit under every symbol in the grid. Trains processing speed. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  showsCanvasEditHint: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1">
      <rect x="4" y="4" width="56" height="12"/>
      <rect x="8" y="20" width="12" height="12"/><rect x="26" y="20" width="12" height="12"/>
      <rect x="44" y="20" width="12" height="12"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'symbolCount',
      label: 'Symbols in key',
      type: 'number',
      default: 6,
      min: 3,
      max: 9,
      step: 1,
    },
    {
      key: 'cellCount',
      label: 'Grid cells',
      type: 'number',
      default: 48,
      min: 8,
      max: 80,
      step: 8,
    },
  ],
  generate,
}
